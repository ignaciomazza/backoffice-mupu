import type { Prisma } from "@prisma/client";

export const COUNTER_KEYS = [
  "booking",
  "quote",
  "client",
  "service",
  "receipt",
  "other_income",
  "client_payment",
  "investment",
  "operator_due",
  "user",
  "operator",
  "sales_team",
  "resource",
  "file",
  "recurring_investment",
  "template_config",
  "text_preset",
  "commission_rule_set",
  "finance_config",
  "client_config",
  "quote_config",
  "agency_billing_config",
  "agency_billing_adjustment",
  "agency_billing_charge",
  "finance_currency",
  "finance_account",
  "finance_payment_method",
  "expense_category",
  "service_type",
  "passenger_category",
  "service_type_preset",
  "service_calc_config",
  "lead",
  "credit_account",
  "credit_entry",
  "invoice",
  "credit_note",
] as const;

export type AgencyCounterKey = (typeof COUNTER_KEYS)[number];

export async function getNextAgencyCounter(
  tx: Prisma.TransactionClient,
  id_agency: number,
  key: AgencyCounterKey,
): Promise<number> {
  const counter = await tx.agencyCounter.upsert({
    where: { id_agency_key: { id_agency, key } },
    update: { next_value: { increment: 1 } },
    create: { id_agency, key, next_value: 2 },
    select: { next_value: true },
  });

  return counter.next_value - 1;
}
