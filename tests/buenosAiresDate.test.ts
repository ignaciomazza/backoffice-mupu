import { describe, expect, it } from "vitest";
import {
  addDaysToDateKey,
  startOfDayUtcFromDateKeyInBuenosAires,
  toDateKeyInBuenosAires,
  toDateKeyInBuenosAiresLegacySafe,
} from "@/lib/buenosAiresDate";

describe("buenosAiresDate", () => {
  it("maps BA start-of-day to 03:00:00.000Z", () => {
    expect(
      startOfDayUtcFromDateKeyInBuenosAires("2026-01-31")?.toISOString(),
    ).toBe("2026-01-31T03:00:00.000Z");
    expect(
      startOfDayUtcFromDateKeyInBuenosAires("2026-02-01")?.toISOString(),
    ).toBe("2026-02-01T03:00:00.000Z");
    expect(
      startOfDayUtcFromDateKeyInBuenosAires("2026-02-19")?.toISOString(),
    ).toBe("2026-02-19T03:00:00.000Z");
  });

  it("keeps 31/01 out of a [01/02, 19/02] BA range", () => {
    const from = startOfDayUtcFromDateKeyInBuenosAires("2026-02-01");
    const toExclusive = startOfDayUtcFromDateKeyInBuenosAires(
      addDaysToDateKey("2026-02-19", 1)!,
    );
    expect(from).not.toBeNull();
    expect(toExclusive).not.toBeNull();

    const jan31NoonUtc = new Date("2026-01-31T12:00:00.000Z");
    const feb01NoonUtc = new Date("2026-02-01T12:00:00.000Z");

    expect(jan31NoonUtc >= from! && jan31NoonUtc < toExclusive!).toBe(false);
    expect(feb01NoonUtc >= from! && feb01NoonUtc < toExclusive!).toBe(true);
  });

  it("builds BA date keys consistently from UTC instants", () => {
    expect(toDateKeyInBuenosAires("2026-02-01T02:59:59.000Z")).toBe(
      "2026-01-31",
    );
    expect(toDateKeyInBuenosAires("2026-02-01T03:00:00.000Z")).toBe(
      "2026-02-01",
    );
  });

  it("keeps legacy UTC-midnight date-only values without day shift", () => {
    expect(toDateKeyInBuenosAiresLegacySafe("2026-02-19T00:00:00.000Z")).toBe(
      "2026-02-19",
    );
    expect(toDateKeyInBuenosAiresLegacySafe("2026-07-05T00:00:00.000Z")).toBe(
      "2026-07-05",
    );
    expect(toDateKeyInBuenosAiresLegacySafe("2026-02-19T03:00:00.000Z")).toBe(
      "2026-02-19",
    );
  });
});
