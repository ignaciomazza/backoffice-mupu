import type { NextApiRequest, NextApiResponse } from "next";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  cbuLast4,
  encryptBillingSecret,
  hashCbu,
  isValidCbu,
  normalizeCbu,
} from "@/lib/billingSecrets";
import { computeNextAnchorDate, getBillingConfig } from "@/lib/billingConfig";
import { resolveBillingAuth, isAgencyBillingRole, requestIp } from "@/lib/billingAuth";
import { logBillingEvent } from "@/services/billing/events";

const CONSENT_VERSION = "v1";

const directDebitSchema = z.object({
  holderName: z.string().trim().min(2, "Titular requerido"),
  taxId: z.string().trim().min(7, "CUIT/CUIL inválido"),
  cbu: z.string().trim().min(10, "CBU inválido"),
  consentAccepted: z.boolean().refine((v) => v === true, {
    message: "Debes aceptar el mandato",
  }),
});

function sanitizeTaxId(raw: string): string {
  return String(raw || "").replace(/\D/g, "");
}

function safeMandateOut(mandate: {
  id_mandate: number;
  status: string;
  cbu_last4: string;
  consent_version: string | null;
  consent_accepted_at: Date | null;
  updated_at: Date;
}) {
  return {
    id_mandate: mandate.id_mandate,
    status: mandate.status,
    cbu_masked: `****${mandate.cbu_last4}`,
    consent_version: mandate.consent_version,
    consent_accepted_at: mandate.consent_accepted_at,
    updated_at: mandate.updated_at,
  };
}

type TxClient = Prisma.TransactionClient;

export async function upsertDirectDebitMandate(
  tx: TxClient,
  input: {
    agencyId: number;
    userId?: number | null;
    holderName: string;
    taxId: string;
    cbu: string;
    consentIp?: string | null;
  },
) {
  const config = getBillingConfig();
  const normalizedCbu = normalizeCbu(input.cbu);
  const now = new Date();
  const nextAnchorDate = computeNextAnchorDate({
    now,
    anchorDay: config.anchorDay,
    timezone: config.timezone,
  });

  const subscription = await tx.agencyBillingSubscription.upsert({
    where: { id_agency: input.agencyId },
    create: {
      id_agency: input.agencyId,
      status: "ACTIVE",
      anchor_day: config.anchorDay,
      timezone: config.timezone,
      direct_debit_discount_pct: config.directDebitDiscountPct,
      next_anchor_date: nextAnchorDate,
    },
    update: {
      anchor_day: config.anchorDay,
      timezone: config.timezone,
      direct_debit_discount_pct: config.directDebitDiscountPct,
    },
  });

  await tx.agencyBillingPaymentMethod.updateMany({
    where: { subscription_id: subscription.id_subscription },
    data: { is_default: false },
  });

  const paymentMethod = await tx.agencyBillingPaymentMethod.upsert({
    where: {
      agency_billing_method_unique: {
        subscription_id: subscription.id_subscription,
        method_type: "DIRECT_DEBIT_CBU_GALICIA",
      },
    },
    create: {
      subscription_id: subscription.id_subscription,
      method_type: "DIRECT_DEBIT_CBU_GALICIA",
      status: "PENDING",
      is_default: true,
      holder_name: input.holderName,
      holder_tax_id: input.taxId,
    },
    update: {
      status: "PENDING",
      is_default: true,
      holder_name: input.holderName,
      holder_tax_id: input.taxId,
    },
  });

  const existingMandate = await tx.agencyBillingMandate.findUnique({
    where: { payment_method_id: paymentMethod.id_payment_method },
    select: { id_mandate: true },
  });

  const mandate = await tx.agencyBillingMandate.upsert({
    where: { payment_method_id: paymentMethod.id_payment_method },
    create: {
      payment_method_id: paymentMethod.id_payment_method,
      status: "PENDING",
      cbu_encrypted: encryptBillingSecret(normalizedCbu),
      cbu_last4: cbuLast4(normalizedCbu),
      cbu_hash: hashCbu(normalizedCbu),
      consent_version: CONSENT_VERSION,
      consent_accepted_at: now,
      consent_ip: input.consentIp ?? null,
    },
    update: {
      status: "PENDING",
      cbu_encrypted: encryptBillingSecret(normalizedCbu),
      cbu_last4: cbuLast4(normalizedCbu),
      cbu_hash: hashCbu(normalizedCbu),
      consent_version: CONSENT_VERSION,
      consent_accepted_at: now,
      consent_ip: input.consentIp ?? null,
    },
  });

  await logBillingEvent(
    {
      id_agency: input.agencyId,
      subscription_id: subscription.id_subscription,
      event_type: existingMandate ? "MANDATE_UPDATED" : "MANDATE_CREATED",
      payload: {
        method_type: paymentMethod.method_type,
        mandate_status: mandate.status,
        cbu_last4: mandate.cbu_last4,
      },
      created_by: input.userId ?? null,
    },
    tx,
  );

  await logBillingEvent(
    {
      id_agency: input.agencyId,
      subscription_id: subscription.id_subscription,
      event_type: "SUBSCRIPTION_UPDATED",
      payload: {
        anchor_day: subscription.anchor_day,
        timezone: subscription.timezone,
        direct_debit_discount_pct: Number(subscription.direct_debit_discount_pct),
      },
      created_by: input.userId ?? null,
    },
    tx,
  );

  return {
    subscription,
    paymentMethod,
    mandate,
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const auth = await resolveBillingAuth(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  if (!isAgencyBillingRole(auth.role)) {
    return res.status(403).json({ error: "Sin permisos" });
  }

  const body =
    typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
  const parsed = directDebitSchema.safeParse(body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: parsed.error.issues?.[0]?.message || "Datos inválidos" });
  }

  const taxId = sanitizeTaxId(parsed.data.taxId);
  if (taxId.length < 7) {
    return res.status(400).json({ error: "CUIT/CUIL inválido" });
  }

  const cbu = normalizeCbu(parsed.data.cbu);
  if (!isValidCbu(cbu)) {
    return res.status(400).json({ error: "CBU inválido" });
  }

  try {
    const result = await prisma.$transaction((tx) =>
      upsertDirectDebitMandate(tx, {
        agencyId: auth.id_agency,
        userId: auth.id_user,
        holderName: parsed.data.holderName,
        taxId,
        cbu,
        consentIp: requestIp(req),
      }),
    );

    return res.status(200).json({
      subscription: {
        id_subscription: result.subscription.id_subscription,
        status: result.subscription.status,
        anchor_day: result.subscription.anchor_day,
        timezone: result.subscription.timezone,
      },
      payment_method: {
        id_payment_method: result.paymentMethod.id_payment_method,
        method_type: result.paymentMethod.method_type,
        status: result.paymentMethod.status,
        is_default: result.paymentMethod.is_default,
        holder_name: result.paymentMethod.holder_name,
        holder_tax_id: result.paymentMethod.holder_tax_id,
      },
      mandate: safeMandateOut(result.mandate),
    });
  } catch (error) {
    console.error("[agency/subscription/payment-methods/direct-debit][POST]", error);
    return res.status(500).json({ error: "No se pudo guardar el mandato" });
  }

  // TODO(PR #2): ejecutar alta/validación bancaria del mandato en workflow asíncrono.
  // TODO(PR #3): integrar generación/envío de archivos Pago Directo y respuestas de Galicia.
}
