import { describe, expect, it } from "vitest";
import {
  DebugCsvAdapter,
  buildDebugResponseCsv,
} from "@/services/collections/galicia/direct-debit/adapters/debugCsvAdapter";

describe("DebugCsvAdapter", () => {
  it("roundtrip básico: build presentment y parse response", () => {
    const adapter = new DebugCsvAdapter();

    const built = adapter.buildPresentment({
      businessDate: new Date("2026-02-19T12:00:00.000Z"),
      rows: [
        {
          attemptId: 11,
          chargeId: 21,
          agencyId: 3,
          externalReference: "AT-11",
          amountArs: 117677.34,
          scheduledFor: new Date("2026-02-08T03:00:00.000Z"),
          holderName: "Agencia Demo",
          holderTaxId: "20123456789",
          cbuLast4: "1233",
        },
      ],
      meta: {},
    });

    expect(built.fileName).toBe("debug_pd_presentment_2026-02-19.csv");

    const lines = built.bytes.toString("utf8").trim().split(/\r?\n/);
    expect(lines[0]).toContain("external_reference");
    const externalReference = lines[1]?.split(",")[0] || "AT-11";

    const responseBytes = buildDebugResponseCsv({
      records: [
        {
          externalReference,
          result: "PAID",
          amountArs: 117677.34,
          paidReference: "PD-OK-0001",
        },
      ],
    });

    const parsed = adapter.parseResponse(responseBytes);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.externalReference).toBe(externalReference);
    expect(parsed[0]?.result).toBe("PAID");
    expect(parsed[0]?.amountArs).toBe(117677.34);
    expect(parsed[0]?.paidReference).toBe("PD-OK-0001");
  });
});
