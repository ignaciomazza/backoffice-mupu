import type { AgencyBillingMandate, AgencyBillingPaymentMethod } from "@prisma/client";
import { computeNextAnchorDate } from "@/lib/billingConfig";

export type BillingMethodWithMandate = AgencyBillingPaymentMethod & {
  mandate: AgencyBillingMandate | null;
};

export function pickDefaultBillingMethod(
  methods: BillingMethodWithMandate[],
): BillingMethodWithMandate | null {
  if (!methods.length) return null;
  return methods.find((item) => item.is_default) ?? methods[0] ?? null;
}

export function mandateMaskedCbu(mandate: AgencyBillingMandate | null): string | null {
  if (!mandate?.cbu_last4) return null;
  return `****${mandate.cbu_last4}`;
}

export function resolveNextAnchorDate(
  value: Date | null | undefined,
  anchorDay: number,
  timezone: string,
): Date {
  if (value) return value;
  return computeNextAnchorDate({ anchorDay, timezone });
}
