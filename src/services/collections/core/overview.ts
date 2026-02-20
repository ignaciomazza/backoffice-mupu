import { addDaysLocal, fullDaysBetweenLocal } from "@/services/collections/core/dates";

export type OverviewAttempt = {
  id_attempt: number;
  attempt_no: number;
  status: string;
  scheduled_for: Date | null;
};

export type OverviewFlags = {
  in_collection: boolean;
  is_past_due: boolean;
  is_suspended: boolean;
  retries_exhausted: boolean;
};

export type OverviewComputed = {
  status: "ACTIVE" | "PAST_DUE" | "SUSPENDED";
  flags: OverviewFlags;
  next_attempt_at: Date | null;
};

type ComputeOverviewInput = {
  now: Date;
  timezone: string;
  anchorDate: Date | null;
  hasCharge: boolean;
  chargeStatus: string | null;
  chargePaidAt: Date | null;
  attempts: OverviewAttempt[];
  suspendAfterDays: number;
};

function normalizeStatus(status: string | null | undefined): string {
  return String(status || "").trim().toUpperCase();
}

function isChargePaid(chargeStatus: string | null, chargePaidAt: Date | null): boolean {
  if (chargePaidAt) return true;
  const normalized = normalizeStatus(chargeStatus);
  return normalized === "PAID";
}

export function computeOverviewStatus(input: ComputeOverviewInput): OverviewComputed {
  const attempts = [...input.attempts].sort((a, b) => a.attempt_no - b.attempt_no);

  const pendingAttempts = attempts.filter(
    (attempt) => normalizeStatus(attempt.status) === "PENDING" && attempt.scheduled_for,
  );

  let retriesExhausted = false;
  let nextAttemptAt: Date | null = null;

  if (pendingAttempts.length > 0) {
    const nowMs = input.now.getTime();
    const future = pendingAttempts
      .filter((attempt) => (attempt.scheduled_for as Date).getTime() >= nowMs)
      .sort(
        (a, b) =>
          (a.scheduled_for as Date).getTime() - (b.scheduled_for as Date).getTime(),
      );

    if (future.length > 0) {
      nextAttemptAt = future[0].scheduled_for;
    } else {
      retriesExhausted = true;
      nextAttemptAt = pendingAttempts[pendingAttempts.length - 1].scheduled_for;
    }
  }

  if (
    !input.anchorDate ||
    !input.hasCharge ||
    isChargePaid(input.chargeStatus, input.chargePaidAt)
  ) {
    return {
      status: "ACTIVE",
      flags: {
        in_collection: false,
        is_past_due: false,
        is_suspended: false,
        retries_exhausted: retriesExhausted,
      },
      next_attempt_at: nextAttemptAt,
    };
  }

  const pastDueDate = addDaysLocal(input.anchorDate, 1, input.timezone);
  const isPastDue = input.now.getTime() >= pastDueDate.getTime();

  const daysSinceAnchor = fullDaysBetweenLocal(
    input.anchorDate,
    input.now,
    input.timezone,
  );
  const isSuspended = daysSinceAnchor >= Math.max(1, input.suspendAfterDays);

  return {
    status: isSuspended ? "SUSPENDED" : isPastDue ? "PAST_DUE" : "ACTIVE",
    flags: {
      in_collection: true,
      is_past_due: isPastDue,
      is_suspended: isSuspended,
      retries_exhausted: retriesExhausted,
    },
    next_attempt_at: nextAttemptAt,
  };
}
