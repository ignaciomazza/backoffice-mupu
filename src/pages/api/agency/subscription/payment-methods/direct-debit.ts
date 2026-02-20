import type { NextApiRequest, NextApiResponse } from "next";
import type { BillingMandateStatus, Prisma } from "@prisma/client";
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
import {
  isAgencyBillingRole,
  isBillingAdminRole,
  requestIp,
  resolveBillingAuth,
} from "@/lib/billingAuth";
import { logBillingEvent } from "@/services/billing/events";
import { transitionMandateStatus } from "@/services/collections/mandates/lifecycle";

const CONSENT_VERSION = "v1";

const mandateStatusSchema = z.enum([
  "PENDING",
  "PENDING_BANK",
  "ACTIVE",
  "REJECTED",
  "REVOKED",
]);

const directDebitSchema = z.object({
  holderName: z.string().trim().min(2, "Titular requerido"),
  taxId: z.string().trim().min(7, "CUIT/CUIL inválido"),
  cbu: z.string().trim().min(10, "CBU inválido"),
  consentAccepted: z.boolean().refine((v) => v === true, {
    message: "Debes aceptar el mandato",
  }),
  consentVersion: z.string().trim().min(1).max(64).optional(),
});

const patchMandateSchema = z.object({
  id_mandate: z.number().int().positive().optional(),
  status: mandateStatusSchema,
  bank_reference: z.string().trim().max(120).optional().nullable(),
  reason_code: z.string().trim().max(120).optional().nullable(),
  reason_text: z.string().trim().max(500).optional().nullable(),
  last_status_check_at: z.union([z.string(), z.date()]).optional().nullable(),
});

function sanitizeTaxId(raw: string): string {
  return String(raw || "").replace(/\D/g, "");
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function safeMandateOut(mandate: {
  id_mandate: number;
  status: string;
  cbu_last4: string;
  consent_version: string | null;
  consent_accepted_at: Date | null;
  updated_at: Date;
  bank_reference?: string | null;
  activated_at?: Date | null;
  rejected_reason_code?: string | null;
  rejected_reason_text?: string | null;
  revoked_at?: Date | null;
  last_status_check_at?: Date | null;
}) {
  return {
    id_mandate: mandate.id_mandate,
    status: mandate.status,
    cbu_masked: `****${mandate.cbu_last4}`,
    consent_version: mandate.consent_version,
    consent_accepted_at: mandate.consent_accepted_at,
    bank_reference: mandate.bank_reference ?? null,
    activated_at: mandate.activated_at ?? null,
    rejected_reason_code: mandate.rejected_reason_code ?? null,
    rejected_reason_text: mandate.rejected_reason_text ?? null,
    revoked_at: mandate.revoked_at ?? null,
    last_status_check_at: mandate.last_status_check_at ?? null,
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
    consentVersion?: string | null;
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
    select: {
      id_mandate: true,
      status: true,
    },
  });

  const mandate = await tx.agencyBillingMandate.upsert({
    where: { payment_method_id: paymentMethod.id_payment_method },
    create: {
      payment_method_id: paymentMethod.id_payment_method,
      status: "PENDING",
      cbu_encrypted: encryptBillingSecret(normalizedCbu),
      cbu_last4: cbuLast4(normalizedCbu),
      cbu_hash: hashCbu(normalizedCbu),
      consent_version: input.consentVersion || CONSENT_VERSION,
      consent_accepted_at: now,
      consent_ip: input.consentIp ?? null,
      holder_name: input.holderName,
      holder_doc: input.taxId,
      bank_reference: null,
      bank_mandate_ref: null,
      rejected_reason_code: null,
      rejected_reason_text: null,
      rejection_code: null,
      rejection_reason: null,
      revoked_at: null,
      last_status_check_at: now,
    },
    update: {
      status: "PENDING",
      cbu_encrypted: encryptBillingSecret(normalizedCbu),
      cbu_last4: cbuLast4(normalizedCbu),
      cbu_hash: hashCbu(normalizedCbu),
      consent_version: input.consentVersion || CONSENT_VERSION,
      consent_accepted_at: now,
      consent_ip: input.consentIp ?? null,
      holder_name: input.holderName,
      holder_doc: input.taxId,
      bank_reference: null,
      bank_mandate_ref: null,
      rejected_reason_code: null,
      rejected_reason_text: null,
      rejection_code: null,
      rejection_reason: null,
      last_status_check_at: now,
    },
  });

  if (!existingMandate) {
    await logBillingEvent(
      {
        id_agency: input.agencyId,
        subscription_id: subscription.id_subscription,
        event_type: "MANDATE_CREATED",
        payload: toJsonValue({
          mandate_id: mandate.id_mandate,
          agency_id: input.agencyId,
          previous_status: null,
          new_status: mandate.status,
          actor: input.userId ?? "system",
        }),
        created_by: input.userId ?? null,
      },
      tx,
    );
  } else if (existingMandate.status !== mandate.status) {
    await logBillingEvent(
      {
        id_agency: input.agencyId,
        subscription_id: subscription.id_subscription,
        event_type: "MANDATE_STATUS_CHANGED",
        payload: toJsonValue({
          mandate_id: mandate.id_mandate,
          agency_id: input.agencyId,
          previous_status: existingMandate.status,
          new_status: mandate.status,
          reason_code: null,
          reason_text: null,
          actor: input.userId ?? "system",
        }),
        created_by: input.userId ?? null,
      },
      tx,
    );
  }

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

function parseRequestBody(req: NextApiRequest): unknown {
  return typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
}

function parseDateOptional(raw: unknown): Date | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date) return Number.isFinite(raw.getTime()) ? raw : null;
  const asDate = new Date(String(raw));
  return Number.isFinite(asDate.getTime()) ? asDate : null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");

  const auth = await resolveBillingAuth(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "POST") {
    if (!isAgencyBillingRole(auth.role)) {
      return res.status(403).json({ error: "Sin permisos" });
    }

    const parsed = directDebitSchema.safeParse(parseRequestBody(req));
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
          consentVersion: parsed.data.consentVersion ?? CONSENT_VERSION,
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
  }

  if (req.method === "PATCH") {
    if (!isBillingAdminRole(auth.role)) {
      return res.status(403).json({ error: "Sin permisos" });
    }

    const parsed = patchMandateSchema.safeParse(parseRequestBody(req));
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: parsed.error.issues?.[0]?.message || "Datos inválidos" });
    }

    try {
      const targetMandateId = await (async () => {
        if (parsed.data.id_mandate) {
          const mandate = await prisma.agencyBillingMandate.findUnique({
            where: { id_mandate: parsed.data.id_mandate },
            select: {
              id_mandate: true,
              paymentMethod: {
                select: {
                  subscription: {
                    select: {
                      id_agency: true,
                    },
                  },
                },
              },
            },
          });

          if (!mandate) throw new Error("Mandato no encontrado");
          if (mandate.paymentMethod.subscription.id_agency !== auth.id_agency) {
            throw new Error("Mandato fuera de la agencia autenticada");
          }

          return mandate.id_mandate;
        }

        const method = await prisma.agencyBillingPaymentMethod.findFirst({
          where: {
            subscription: { id_agency: auth.id_agency },
            method_type: "DIRECT_DEBIT_CBU_GALICIA",
          },
          select: {
            mandate: {
              select: { id_mandate: true },
            },
          },
          orderBy: [{ is_default: "desc" }, { id_payment_method: "asc" }],
        });

        if (!method?.mandate?.id_mandate) {
          throw new Error("No hay mandato cargado para la agencia");
        }

        return method.mandate.id_mandate;
      })();

      const lastStatusCheckAt = parseDateOptional(parsed.data.last_status_check_at);
      if (parsed.data.last_status_check_at != null && !lastStatusCheckAt) {
        return res.status(400).json({ error: "last_status_check_at inválido" });
      }

      const updated = await prisma.$transaction((tx) =>
        transitionMandateStatus(tx, {
          mandateId: targetMandateId,
          newStatus: parsed.data.status as BillingMandateStatus,
          actorUserId: auth.id_user,
          reasonCode: parsed.data.reason_code ?? null,
          reasonText: parsed.data.reason_text ?? null,
          bankReference: parsed.data.bank_reference ?? null,
          lastStatusCheckAt,
        }),
      );

      const mandate = await prisma.agencyBillingMandate.findUnique({
        where: { id_mandate: updated.id_mandate },
        select: {
          id_mandate: true,
          status: true,
          cbu_last4: true,
          consent_version: true,
          consent_accepted_at: true,
          bank_reference: true,
          activated_at: true,
          rejected_reason_code: true,
          rejected_reason_text: true,
          revoked_at: true,
          last_status_check_at: true,
          updated_at: true,
        },
      });

      if (!mandate) {
        return res.status(404).json({ error: "Mandato no encontrado" });
      }

      return res.status(200).json({
        mandate: safeMandateOut(mandate),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo actualizar el mandato";
      return res.status(400).json({ error: message });
    }
  }

  res.setHeader("Allow", ["POST", "PATCH"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
