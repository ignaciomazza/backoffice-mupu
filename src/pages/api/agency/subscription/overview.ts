import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { resolveBillingAuth, isAgencyBillingRole } from "@/lib/billingAuth";
import { getBillingConfig } from "@/lib/billingConfig";
import { pickDefaultBillingMethod, resolveNextAnchorDate } from "@/lib/billingSubscription";
import { normalizeLocalDay } from "@/services/collections/core/dates";
import {
  computeOverviewStatus,
  type OverviewAttempt,
} from "@/services/collections/core/overview";

function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function serializeAttempt(attempt: {
  id_attempt: number;
  attempt_no: number;
  status: string;
  channel: string;
  scheduled_for: Date | null;
  processed_at: Date | null;
}) {
  return {
    id_attempt: attempt.id_attempt,
    attempt_no: attempt.attempt_no,
    status: attempt.status,
    channel: attempt.channel,
    scheduled_for: attempt.scheduled_for,
    processed_at: attempt.processed_at,
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const auth = await resolveBillingAuth(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  if (!isAgencyBillingRole(auth.role)) {
    return res.status(403).json({ error: "Sin permisos" });
  }

  const config = getBillingConfig();

  const subscription = await prisma.agencyBillingSubscription.findUnique({
    where: { id_agency: auth.id_agency },
    include: {
      paymentMethods: {
        include: { mandate: true },
        orderBy: [{ is_default: "desc" }, { id_payment_method: "asc" }],
      },
    },
  });

  const defaultMethod = subscription
    ? pickDefaultBillingMethod(subscription.paymentMethods)
    : null;

  const nextAnchorDate = resolveNextAnchorDate(
    subscription?.next_anchor_date ?? null,
    subscription?.anchor_day ?? config.anchorDay,
    subscription?.timezone ?? config.timezone,
  );

  if (!subscription) {
    return res.status(200).json({
      status: "ACTIVE",
      next_anchor_date: nextAnchorDate,
      retry_days: config.dunningRetryDays,
      method_type: null,
      mandate_status: null,
      current_cycle: null,
      current_charge: null,
      attempts: [],
      next_attempt_at: null,
      flags: {
        in_collection: false,
        is_past_due: false,
        is_suspended: false,
        retries_exhausted: false,
      },
      in_collection: false,
      is_past_due: false,
      is_suspended: false,
    });
  }

  const timezone = subscription.timezone || config.timezone;
  const now = new Date();
  const todayLocal = normalizeLocalDay(now, timezone);

  const currentCycle = await prisma.agencyBillingCycle.findFirst({
    where: {
      subscription_id: subscription.id_subscription,
      anchor_date: { lte: todayLocal },
    },
    orderBy: [{ anchor_date: "desc" }, { id_cycle: "desc" }],
    include: {
      charges: {
        orderBy: [{ id_charge: "desc" }],
        take: 1,
        include: {
          attempts: {
            orderBy: [{ attempt_no: "desc" }],
            take: 3,
          },
        },
      },
    },
  });

  const currentCharge = currentCycle?.charges?.[0] ?? null;
  const attempts = (currentCharge?.attempts || []).slice().reverse();

  const computed = computeOverviewStatus({
    now,
    timezone,
    anchorDate: currentCycle?.anchor_date ?? null,
    hasCharge: Boolean(currentCharge),
    chargeStatus: currentCharge?.status ?? null,
    chargePaidAt: currentCharge?.paid_at ?? null,
    attempts: attempts.map((item) => ({
      id_attempt: item.id_attempt,
      attempt_no: item.attempt_no,
      status: item.status,
      scheduled_for: item.scheduled_for,
    })) as OverviewAttempt[],
    suspendAfterDays: config.suspendAfterDays,
  });

  const status =
    subscription.status === "CANCELED" ? "CANCELED" : computed.status;

  return res.status(200).json({
    status,
    next_anchor_date: nextAnchorDate,
    retry_days: config.dunningRetryDays,
    method_type: defaultMethod?.method_type ?? null,
    mandate_status: defaultMethod?.mandate?.status ?? null,

    current_cycle: currentCycle
      ? {
          id_cycle: currentCycle.id_cycle,
          anchor_date: currentCycle.anchor_date,
          period_start: currentCycle.period_start,
          period_end: currentCycle.period_end,
          status: currentCycle.status,
          fx_rate_date: currentCycle.fx_rate_date,
          fx_rate_ars_per_usd: decimalToNumber(currentCycle.fx_rate_ars_per_usd),
          total_usd: decimalToNumber(currentCycle.total_usd),
          total_ars: decimalToNumber(currentCycle.total_ars),
          frozen_at: currentCycle.frozen_at,
        }
      : null,

    current_charge: currentCharge
      ? {
          id_charge: currentCharge.id_charge,
          status: currentCharge.status,
          due_date: currentCharge.due_date,
          amount_ars_due: decimalToNumber(currentCharge.amount_ars_due),
          amount_ars_paid: decimalToNumber(currentCharge.amount_ars_paid),
          reconciliation_status: currentCharge.reconciliation_status,
        }
      : null,

    attempts: attempts.map(serializeAttempt),
    next_attempt_at: computed.next_attempt_at,

    flags: computed.flags,
    in_collection: computed.flags.in_collection,
    is_past_due: computed.flags.is_past_due,
    is_suspended: computed.flags.is_suspended,
  });
}
