import { describe, expect, it, vi } from "vitest";
import { runArcaDiagnostics } from "@/services/arca/diagnostics";

describe("runArcaDiagnostics", () => {
  it("detects missing sales points", async () => {
    const afip = {
      ElectronicBilling: {
        getServerStatus: vi.fn().mockResolvedValue({
          AppServer: "OK",
          DbServer: "OK",
          AuthServer: "OK",
        }),
        getSalesPoints: vi.fn().mockResolvedValue([]),
      },
    };

    const result = await runArcaDiagnostics(
      afip as unknown as Parameters<typeof runArcaDiagnostics>[0],
    );

    expect(result.missingSalesPoint).toBe(true);
    expect(result.salesPoints).toHaveLength(0);
  });

  it("returns sales points when available", async () => {
    const afip = {
      ElectronicBilling: {
        getServerStatus: vi.fn().mockResolvedValue({
          AppServer: "OK",
          DbServer: "OK",
          AuthServer: "OK",
        }),
        getSalesPoints: vi.fn().mockResolvedValue([{ Nro: 1 }]),
      },
    };

    const result = await runArcaDiagnostics(
      afip as unknown as Parameters<typeof runArcaDiagnostics>[0],
    );

    expect(result.missingSalesPoint).toBe(false);
    expect(result.salesPoints).toHaveLength(1);
  });
});
