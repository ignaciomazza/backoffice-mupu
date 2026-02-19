import prisma from "@/lib/prisma";
import { toDateKeyInBuenosAires } from "@/lib/buenosAiresDate";

export type YearMonth = {
  year: number;
  month: number; // 1..12
};

export function normalizeYearMonth(year: number, month: number): YearMonth {
  const y = Number.isFinite(year) ? Math.trunc(year) : 0;
  const m = Number.isFinite(month) ? Math.trunc(month) : 0;
  if (y < 2000 || y > 3000) {
    throw new Error("Año inválido.");
  }
  if (m < 1 || m > 12) {
    throw new Error("Mes inválido.");
  }
  return { year: y, month: m };
}

export function yearMonthFromDate(date: Date): YearMonth {
  const dateKey = toDateKeyInBuenosAires(date);
  if (dateKey) {
    const [yearRaw, monthRaw] = dateKey.split("-");
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    if (Number.isFinite(year) && Number.isFinite(month)) {
      return { year, month };
    }
  }
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export async function isFinanceMonthLocked(
  agencyId: number,
  year: number,
  month: number,
): Promise<boolean> {
  const ym = normalizeYearMonth(year, month);
  const lock = await prisma.financeMonthLock.findUnique({
    where: {
      id_agency_year_month: {
        id_agency: agencyId,
        year: ym.year,
        month: ym.month,
      },
    },
    select: { is_locked: true },
  });
  return !!lock?.is_locked;
}

export async function isFinanceDateLocked(
  agencyId: number,
  date: Date,
): Promise<boolean> {
  const ym = yearMonthFromDate(date);
  return isFinanceMonthLocked(agencyId, ym.year, ym.month);
}
