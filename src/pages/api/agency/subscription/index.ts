import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { resolveBillingAuth, isAgencyBillingRole } from "@/lib/billingAuth";
import { getBillingConfig } from "@/lib/billingConfig";
import {
  mandateMaskedCbu,
  pickDefaultBillingMethod,
  resolveNextAnchorDate,
} from "@/lib/billingSubscription";
import { logBillingEvent } from "@/services/billing/events";

const putSchema = z.object({}).passthrough();

type SubscriptionRecord = Awaited<
  ReturnType<typeof prisma.agencyBillingSubscription.findUnique>
>;

function serializeSubscription(
  subscription: NonNullable<SubscriptionRecord>,
  method: ReturnType<typeof pickDefaultBillingMethod>,
) {
  const nextAnchorDate = resolveNextAnchorDate(
    subscription.next_anchor_date,
    subscription.anchor_day,
    subscription.timezone,
  );

  return {
    subscription: {
      id_subscription: subscription.id_subscription,
      id_agency: subscription.id_agency,
      status: subscription.status,
      anchor_day: subscription.anchor_day,
      timezone: subscription.timezone,
      direct_debit_discount_pct: Number(subscription.direct_debit_discount_pct),
      next_anchor_date: nextAnchorDate,
      created_at: subscription.created_at,
      updated_at: subscription.updated_at,
    },
    default_method: method
      ? {
          id_payment_method: method.id_payment_method,
          method_type: method.method_type,
          status: method.status,
          is_default: method.is_default,
          holder_name: method.holder_name,
          holder_tax_id: method.holder_tax_id,
          mandate: method.mandate
            ? {
                id_mandate: method.mandate.id_mandate,
                status: method.mandate.status,
                cbu_masked: mandateMaskedCbu(method.mandate),
                consent_version: method.mandate.consent_version,
                consent_accepted_at: method.mandate.consent_accepted_at,
                updated_at: method.mandate.updated_at,
              }
            : null,
        }
      : null,
    state: {
      status: subscription.status,
      method_type: method?.method_type ?? null,
      mandate_status: method?.mandate?.status ?? null,
    },
  };
}

async function loadSubscription(agencyId: number) {
  return prisma.agencyBillingSubscription.findUnique({
    where: { id_agency: agencyId },
    include: {
      paymentMethods: {
        include: { mandate: true },
        orderBy: [{ is_default: "desc" }, { id_payment_method: "asc" }],
      },
    },
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");

  const auth = await resolveBillingAuth(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  if (!isAgencyBillingRole(auth.role)) {
    return res.status(403).json({ error: "Sin permisos" });
  }

  if (req.method === "GET") {
    const subscription = await loadSubscription(auth.id_agency);
    if (!subscription) {
      return res.status(200).json({
        subscription: null,
        default_method: null,
        state: {
          status: "ACTIVE",
          method_type: null,
          mandate_status: null,
        },
      });
    }

    const defaultMethod = pickDefaultBillingMethod(subscription.paymentMethods);
    return res.status(200).json(serializeSubscription(subscription, defaultMethod));
  }

  if (req.method === "PUT") {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: parsed.error.issues?.[0]?.message || "Datos inválidos" });
    }

    const config = getBillingConfig();
    const nextAnchorDate = resolveNextAnchorDate(
      null,
      config.anchorDay,
      config.timezone,
    );

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.agencyBillingSubscription.upsert({
        where: { id_agency: auth.id_agency },
        create: {
          id_agency: auth.id_agency,
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
          next_anchor_date: nextAnchorDate,
        },
      });

      await logBillingEvent(
        {
          id_agency: auth.id_agency,
          subscription_id: row.id_subscription,
          event_type: "SUBSCRIPTION_UPDATED",
          payload: {
            anchor_day: row.anchor_day,
            timezone: row.timezone,
            direct_debit_discount_pct: Number(row.direct_debit_discount_pct),
          },
          created_by: auth.id_user,
        },
        tx,
      );

      return row;
    });

    const subscription = await loadSubscription(updated.id_agency);
    if (!subscription) {
      return res.status(500).json({ error: "No se pudo cargar la suscripción" });
    }

    const defaultMethod = pickDefaultBillingMethod(subscription.paymentMethods);
    return res.status(200).json(serializeSubscription(subscription, defaultMethod));
  }

  res.setHeader("Allow", ["GET", "PUT"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
