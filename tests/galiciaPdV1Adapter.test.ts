import { describe, expect, it } from "vitest";
import { GaliciaPdV1Adapter } from "@/services/collections/galicia/direct-debit/adapters/galiciaPdV1Adapter";

describe("GaliciaPdV1Adapter", () => {
  it("buildOutboundFile genera header/detail/trailer con control totals", () => {
    const adapter = new GaliciaPdV1Adapter();

    const built = adapter.buildOutboundFile({
      batch: {
        id_batch: 12,
        business_date: new Date("2026-02-19T00:00:00.000Z"),
      },
      attempts: [
        {
          attemptId: 101,
          chargeId: 201,
          agencyId: 3,
          externalReference: "AT-101",
          amountArs: 1200.5,
          scheduledFor: new Date("2026-02-19T00:00:00.000Z"),
          holderName: "Agencia Demo",
          holderTaxId: "20123456789",
          cbuLast4: "1234",
        },
        {
          attemptId: 102,
          chargeId: 202,
          agencyId: 3,
          externalReference: "AT-102",
          amountArs: 800,
          scheduledFor: new Date("2026-02-19T00:00:00.000Z"),
          holderName: "Agencia Demo",
          holderTaxId: "20123456789",
          cbuLast4: "9876",
        },
      ],
    });

    expect(built.fileName).toContain("galicia_pd_v1");
    expect(built.controlTotals.record_count).toBe(2);
    expect(built.controlTotals.amount_total).toBe(2000.5);

    const lines = built.fileText.trim().split(/\r?\n/);
    expect(lines[0]).toMatch(/^H\|GALICIA_PD\|/);
    expect(lines[1]).toMatch(/^D\|1\|AT-101\|/);
    expect(lines[2]).toMatch(/^D\|2\|AT-102\|/);
    expect(lines[3]).toMatch(/^T\|2\|2000\.50\|/);

    const validation = adapter.validateOutboundControlTotals({
      controlTotals: built.controlTotals,
      attempts: [
        {
          attemptId: 101,
          chargeId: 201,
          agencyId: 3,
          externalReference: "AT-101",
          amountArs: 1200.5,
          scheduledFor: null,
          holderName: null,
          holderTaxId: null,
          cbuLast4: null,
        },
        {
          attemptId: 102,
          chargeId: 202,
          agencyId: 3,
          externalReference: "AT-102",
          amountArs: 800,
          scheduledFor: null,
          holderName: null,
          holderTaxId: null,
          cbuLast4: null,
        },
      ],
    });

    expect(validation.ok).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it("parseInboundFile parsea filas y valida control totals", () => {
    const adapter = new GaliciaPdV1Adapter();

    const inbound = [
      "H|GALICIA_PD_RESP|v1.0|0001|PD|20260219|2|2000.50|",
      "D|1|AT-101|00|PAGO_OK|1200.50|20260219120000|TRC-1|OP-1",
      "D|2|AT-102|51|FONDOS_INSUFICIENTES|800.00|20260219123000|TRC-2|OP-2",
      "T|2|2000.50|",
      "",
    ].join("\n");

    const parsed = adapter.parseInboundFile({ fileText: inbound });

    expect(parsed.rows).toHaveLength(2);
    expect(parsed.controlTotals.record_count).toBe(2);
    expect(parsed.controlTotals.amount_total).toBe(2000.5);
    expect(parsed.rows[0]?.mapped_status).toBe("PAID");
    expect(parsed.rows[1]?.mapped_status).toBe("REJECTED");
    expect(parsed.rows[1]?.mapped_detailed_reason).toBe("REJECTED_INSUFFICIENT_FUNDS");

    const valid = adapter.validateInboundControlTotals({ parsed });
    expect(valid.ok).toBe(true);
    expect(valid.errors).toHaveLength(0);
  });

  it("validateInboundControlTotals detecta mismatch", () => {
    const adapter = new GaliciaPdV1Adapter();

    const inbound = [
      "H|GALICIA_PD_RESP|v1.0|0001|PD|20260219|1|1200.50|",
      "D|1|AT-101|00|PAGO_OK|1200.50|20260219120000|TRC-1|OP-1",
      "T|1|1500.50|",
      "",
    ].join("\n");

    const parsed = adapter.parseInboundFile({ fileText: inbound });
    const validation = adapter.validateInboundControlTotals({ parsed });

    expect(parsed.parseWarnings.length).toBeGreaterThan(0);
    expect(validation.ok).toBe(false);
    expect(validation.errors.some((err) => err.includes("amount_total"))).toBe(true);
  });

  it("mapBankResultCodeToInternalStatus cubre códigos conocidos y unknown", () => {
    const adapter = new GaliciaPdV1Adapter();

    expect(adapter.mapBankResultCodeToInternalStatus("00").status).toBe("PAID");
    expect(adapter.mapBankResultCodeToInternalStatus("51").detailed_reason).toBe(
      "REJECTED_INSUFFICIENT_FUNDS",
    );
    expect(adapter.mapBankResultCodeToInternalStatus("14").detailed_reason).toBe(
      "REJECTED_INVALID_ACCOUNT",
    );
    expect(adapter.mapBankResultCodeToInternalStatus("MD01").detailed_reason).toBe(
      "REJECTED_MANDATE_INVALID",
    );
    expect(adapter.mapBankResultCodeToInternalStatus("15").detailed_reason).toBe(
      "REJECTED_ACCOUNT_CLOSED",
    );
    expect(adapter.mapBankResultCodeToInternalStatus("96").detailed_reason).toBe("ERROR_FORMAT");
    expect(adapter.mapBankResultCodeToInternalStatus("94").detailed_reason).toBe(
      "ERROR_DUPLICATE",
    );
    expect(adapter.mapBankResultCodeToInternalStatus("ZZZ").status).toBe("UNKNOWN");
  });
});
