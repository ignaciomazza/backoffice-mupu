import { beforeEach, describe, expect, it, vi } from "vitest";

type Cycle = {
  id_cycle: number;
  subscription_id: number;
  id_agency: number;
  anchor_date: Date;
  period_start: Date;
  period_end: Date;
};

type Charge = {
  id_charge: number;
  id_agency: number;
  idempotency_key: string | null;
  cycle_id: number | null;
};

type Attempt = {
  id_attempt: number;
  charge_id: number;
  attempt_no: number;
};

let cycles: Cycle[] = [];
let charges: Charge[] = [];
let attempts: Attempt[] = [];

const subscriptions = [
  {
    id_subscription: 1,
    id_agency: 3,
    status: "ACTIVE" as const,
    anchor_day: 8,
    timezone: "America/Argentina/Buenos_Aires",
    direct_debit_discount_pct: 10,
    next_anchor_date: null as Date | null,
  },
];

const paymentMethod = {
  id_payment_method: 10,
  subscription_id: 1,
  method_type: "DIRECT_DEBIT_CBU_GALICIA" as const,
  status: "ACTIVE" as const,
  is_default: true,
};

const prismaMock = {
  agencyBillingSubscription: {
    findMany: vi.fn(async () => subscriptions),
  },
  billingFxRate: {
    findUnique: vi.fn(async ({ where }: { where: { fx_type_rate_date: { rate_date: Date } } }) => ({
      id_fx_rate: 1,
      fx_type: "DOLAR_BSP",
      rate_date: where.fx_type_rate_date.rate_date,
      ars_per_usd: 1300,
    })),
    findFirst: vi.fn(async () => null),
  },
  $transaction: vi.fn(async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
};

const txMock = {
  agencyBillingPaymentMethod: {
    findFirst: vi.fn(async () => paymentMethod),
  },
  agencyBillingConfig: {
    findUnique: vi.fn(async () => ({
      plan_key: "basico",
      billing_users: 3,
      user_limit: null,
    })),
  },
  agencyBillingAdjustment: {
    findMany: vi.fn(async () => []),
  },
  agencyBillingCycle: {
    findUnique: vi.fn(async ({ where }: { where: { agency_billing_cycle_unique: { subscription_id: number; anchor_date: Date } } }) =>
      cycles.find(
        (item) =>
          item.subscription_id === where.agency_billing_cycle_unique.subscription_id &&
          item.anchor_date.getTime() === where.agency_billing_cycle_unique.anchor_date.getTime(),
      ) || null,
    ),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row: Cycle = {
        id_cycle: cycles.length + 1,
        subscription_id: Number(data.subscription_id),
        id_agency: Number(data.id_agency),
        anchor_date: data.anchor_date as Date,
        period_start: data.period_start as Date,
        period_end: data.period_end as Date,
      };
      cycles.push(row);
      return row;
    }),
  },
  agencyBillingCharge: {
    findUnique: vi.fn(async ({ where }: { where: { agency_billing_charge_idempotency_unique: { id_agency: number; idempotency_key: string } } }) =>
      charges.find(
        (item) =>
          item.id_agency === where.agency_billing_charge_idempotency_unique.id_agency &&
          item.idempotency_key === where.agency_billing_charge_idempotency_unique.idempotency_key,
      ) || null,
    ),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row: Charge = {
        id_charge: charges.length + 1,
        id_agency: Number(data.id_agency),
        idempotency_key: (data.idempotency_key as string | null) ?? null,
        cycle_id: (data.cycle_id as number | null) ?? null,
      };
      charges.push(row);
      return row;
    }),
  },
  agencyBillingAttempt: {
    findUnique: vi.fn(async ({ where }: { where: { agency_billing_attempt_unique: { charge_id: number; attempt_no: number } } }) =>
      attempts.find(
        (item) =>
          item.charge_id === where.agency_billing_attempt_unique.charge_id &&
          item.attempt_no === where.agency_billing_attempt_unique.attempt_no,
      ) || null,
    ),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row: Attempt = {
        id_attempt: attempts.length + 1,
        charge_id: Number(data.charge_id),
        attempt_no: Number(data.attempt_no),
      };
      attempts.push(row);
      return row;
    }),
  },
  agencyBillingSubscription: {
    update: vi.fn(async ({ where, data }: { where: { id_subscription: number }; data: { next_anchor_date: Date } }) => {
      const sub = subscriptions.find((item) => item.id_subscription === where.id_subscription);
      if (sub) sub.next_anchor_date = data.next_anchor_date;
      return sub;
    }),
  },
  agencyBillingEvent: {
    create: vi.fn(async () => ({ ok: true })),
  },
};

vi.mock("@/lib/prisma", () => ({ default: prismaMock }));
vi.mock("@/lib/agencyCounters", () => ({
  getNextAgencyCounter: vi.fn(async () => 1),
}));
vi.mock("@/services/billing/events", () => ({
  logBillingEvent: vi.fn(async () => undefined),
}));
vi.mock("@/services/collections/core/pricing", () => ({
  buildCyclePricingSnapshot: vi.fn(async () => ({
    planSnapshot: {
      plan_key: "basico",
      plan_label: "Basico",
      billing_users: 3,
      user_limit: null,
      base_plan_usd: 20,
    },
    addonsSnapshot: [],
    baseAmountUsd: 20,
    addonsTotalUsd: 0,
    preDiscountNetUsd: 20,
    discountPct: 10,
    discountAmountUsd: 2,
    netAmountUsd: 18,
    vatRate: 0.21,
    vatAmountUsd: 3.78,
    totalUsd: 21.78,
    totalArs: 28314,
    fxRateDate: new Date("2026-02-08T03:00:00.000Z"),
    fxRateArsPerUsd: 1300,
  })),
}));

describe("runAnchor idempotency", () => {
  beforeEach(() => {
    cycles = [];
    charges = [];
    attempts = [];
    subscriptions[0].next_anchor_date = null;
  });

  it("running twice does not duplicate cycle/charge/attempts", async () => {
    const { runAnchor } = await import("@/services/collections/core/runAnchor");

    await runAnchor({
      anchorDate: new Date("2026-02-19T12:00:00.000Z"),
      overrideFx: false,
      actorUserId: 1,
    });

    await runAnchor({
      anchorDate: new Date("2026-02-19T12:00:00.000Z"),
      overrideFx: false,
      actorUserId: 1,
    });

    expect(cycles).toHaveLength(1);
    expect(charges).toHaveLength(1);
    expect(attempts).toHaveLength(3);
  });
});
