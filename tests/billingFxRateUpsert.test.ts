import { beforeEach, describe, expect, it, vi } from "vitest";

let rateStore: Array<{
  id_fx_rate: number;
  fx_type: "DOLAR_BSP";
  rate_date: Date;
  ars_per_usd: number;
  loaded_by: number | null;
  note: string | null;
  created_at: Date;
  updated_at: Date;
}> = [];

let eventStore: Array<Record<string, unknown>> = [];

const tx = {
  billingFxRate: {
    upsert: vi.fn(
      ({ where, create, update }: { where: { fx_type_rate_date: { fx_type: "DOLAR_BSP"; rate_date: Date } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const keyTs = where.fx_type_rate_date.rate_date.getTime();
        const existing = rateStore.find(
          (row) =>
            row.fx_type === where.fx_type_rate_date.fx_type &&
            row.rate_date.getTime() === keyTs,
        );

        if (existing) {
          existing.ars_per_usd = Number(update.ars_per_usd ?? existing.ars_per_usd);
          existing.note = (update.note as string | null | undefined) ?? null;
          existing.loaded_by = (update.loaded_by as number | null | undefined) ?? null;
          existing.updated_at = new Date();
          return { ...existing };
        }

        const inserted = {
          id_fx_rate: rateStore.length + 1,
          fx_type: "DOLAR_BSP" as const,
          rate_date: where.fx_type_rate_date.rate_date,
          ars_per_usd: Number(create.ars_per_usd ?? 0),
          note: (create.note as string | null | undefined) ?? null,
          loaded_by: (create.loaded_by as number | null | undefined) ?? null,
          created_at: new Date(),
          updated_at: new Date(),
        };
        rateStore.push(inserted);
        return { ...inserted };
      },
    ),
  },
  agencyBillingEvent: {
    create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
      eventStore.push({ ...data });
      return data;
    }),
  },
};

const prismaMock = {
  $transaction: vi.fn(async (cb: (trx: typeof tx) => unknown) => cb(tx)),
};

vi.mock("@/lib/prisma", () => ({ default: prismaMock }));

describe("upsertBspRate", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
    rateStore = [];
    eventStore = [];
    prismaMock.$transaction.mockClear();
    tx.billingFxRate.upsert.mockClear();
    tx.agencyBillingEvent.create.mockClear();
  });

  it("upserts by unique (fx_type + rate_date)", async () => {
    const { upsertBspRate } = await import("@/pages/api/admin/fx-rates/bsp/index");

    const first = await upsertBspRate({
      rateDateKey: "2026-02-19",
      arsPerUsd: 1300.5,
      actorAgencyId: 1,
      actorUserId: 10,
    });

    const second = await upsertBspRate({
      rateDateKey: "2026-02-19",
      arsPerUsd: 1310.25,
      actorAgencyId: 1,
      actorUserId: 10,
    });

    expect(first.id_fx_rate).toBe(second.id_fx_rate);
    expect(rateStore).toHaveLength(1);
    expect(rateStore[0]?.ars_per_usd).toBe(1310.25);
    expect(eventStore).toHaveLength(2);
  });
});
