import { describe, expect, it } from "vitest";
import { BUENOS_AIRES_TIME_ZONE, toDateKeyInBuenosAires } from "@/lib/buenosAiresDate";
import {
  getAnchorDateForMonth,
  nextAnchorDate,
  normalizeLocalDay,
} from "@/services/collections/core/dates";

describe("collections dates (anchor day)", () => {
  it("resuelve el día 8 del mismo mes en timezone BA", () => {
    const base = new Date("2026-01-05T15:00:00.000Z");
    const anchor = getAnchorDateForMonth(base, 8, BUENOS_AIRES_TIME_ZONE);
    expect(toDateKeyInBuenosAires(anchor)).toBe("2026-01-08");
  });

  it("nextAnchorDate avanza al mes siguiente preservando día ancla", () => {
    const anchor = new Date("2026-01-08T03:00:00.000Z");
    const next = nextAnchorDate(anchor, 8, BUENOS_AIRES_TIME_ZONE);
    expect(toDateKeyInBuenosAires(next)).toBe("2026-02-08");
  });

  it("ajusta fin de mes cuando el ancla supera días del mes", () => {
    const base = new Date("2026-02-15T12:00:00.000Z");
    const anchor = getAnchorDateForMonth(base, 31, BUENOS_AIRES_TIME_ZONE);
    expect(toDateKeyInBuenosAires(anchor)).toBe("2026-02-28");
  });

  it("normalizeLocalDay conserva día local BA", () => {
    const raw = new Date("2026-03-08T22:45:00.000Z");
    const normalized = normalizeLocalDay(raw, BUENOS_AIRES_TIME_ZONE);
    expect(toDateKeyInBuenosAires(normalized)).toBe("2026-03-08");
  });
});
