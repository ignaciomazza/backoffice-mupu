export type PlanKey = "basico" | "medio" | "pro";

export const PLAN_DATA: Record<
  PlanKey,
  { label: string; base: number; short: string }
> = {
  basico: {
    label: "Basico",
    base: 20,
    short: "Clientes, reservas, facturacion y recibos",
  },
  medio: {
    label: "Medio",
    base: 40,
    short: "Calendario, templates, gastos e insights",
  },
  pro: {
    label: "Pro",
    base: 50,
    short: "Asesoramiento, capacitaciones, nuevas funcionalidades",
  },
};

export function isPlanKey(value: unknown): value is PlanKey {
  return value === "basico" || value === "medio" || value === "pro";
}

export function normalizeUsersCount(value: number) {
  const safe = Number.isFinite(value) ? Math.floor(value) : 1;
  return Math.max(1, safe);
}

export function calcExtraUsersCost(users: number): number {
  const n = normalizeUsersCount(users);
  if (n <= 3) return 0;
  if (n <= 10) return (n - 3) * 5;
  return 35 + (n - 10) * 10;
}

export function calcInfraCost(users: number): number {
  const n = normalizeUsersCount(users);
  if (n <= 3) return 0;
  if (n <= 7) return 20;
  if (n <= 12) return 30;
  return 30 + (n - 12) * 10;
}

export function calcMonthlyBase(planKey: PlanKey, users: number): number {
  return PLAN_DATA[planKey].base + calcExtraUsersCost(users) + calcInfraCost(users);
}
