import type {
  BillingAdjustmentConfig,
  BillingAdjustmentComputed,
} from "@/types";

type AdjustmentTotals = {
  items: BillingAdjustmentComputed[];
  totalCosts: number;
  totalTaxes: number;
  total: number;
};

const round = (value: number, decimals = 2) =>
  parseFloat(value.toFixed(decimals));

function toNumber(value: number | undefined | null): number {
  return Number.isFinite(value ?? NaN) ? Number(value) : 0;
}

function getBase(basis: BillingAdjustmentConfig["basis"], sale: number, cost: number) {
  if (basis === "cost") return cost;
  if (basis === "margin") return sale - cost;
  return sale;
}

export function computeBillingAdjustments(
  adjustments: BillingAdjustmentConfig[] | null | undefined,
  salePrice: number,
  costPrice: number,
): AdjustmentTotals {
  const sale = toNumber(salePrice);
  const cost = toNumber(costPrice);
  const items: BillingAdjustmentComputed[] = [];
  let totalCosts = 0;
  let totalTaxes = 0;

  for (const adj of adjustments || []) {
    if (!adj || !adj.active) continue;
    const base = Math.max(0, getBase(adj.basis, sale, cost));
    const rawAmount =
      adj.valueType === "percent" ? base * toNumber(adj.value) : toNumber(adj.value);
    const amount = round(rawAmount, 2);
    if (!Number.isFinite(amount)) continue;

    items.push({ ...adj, amount });
    if (adj.kind === "tax") {
      totalTaxes += amount;
    } else {
      totalCosts += amount;
    }
  }

  totalCosts = round(totalCosts, 2);
  totalTaxes = round(totalTaxes, 2);
  return {
    items,
    totalCosts,
    totalTaxes,
    total: round(totalCosts + totalTaxes, 2),
  };
}
