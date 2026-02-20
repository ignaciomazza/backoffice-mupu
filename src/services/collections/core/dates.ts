import {
  BUENOS_AIRES_TIME_ZONE,
  startOfDayUtcFromDateKeyInBuenosAires,
  toDateKeyInBuenosAires,
} from "@/lib/buenosAiresDate";

export type LocalDateParts = {
  year: number;
  month: number;
  day: number;
};

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getDatePartsInTimeZone(date: Date, timeZone: string): LocalDateParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    throw new Error("No se pudo resolver la fecha local");
  }

  return { year, month, day };
}

export function dateKeyInTimeZone(date: Date, timezone: string): string {
  if (timezone === BUENOS_AIRES_TIME_ZONE) {
    return toDateKeyInBuenosAires(date) || "";
  }

  const parts = getDatePartsInTimeZone(date, timezone);
  return formatDateKey(parts.year, parts.month, parts.day);
}

export function startOfLocalDay(dateKey: string, timezone: string): Date {
  if (timezone === BUENOS_AIRES_TIME_ZONE) {
    const start = startOfDayUtcFromDateKeyInBuenosAires(dateKey);
    if (!start) throw new Error("No se pudo normalizar el inicio del día");
    return start;
  }

  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(dateKey);
  if (!m) throw new Error("dateKey inválido");
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

export function normalizeLocalDay(date: Date, timezone: string): Date {
  const key = dateKeyInTimeZone(date, timezone);
  if (!key) throw new Error("No se pudo normalizar fecha");
  return startOfLocalDay(key, timezone);
}

export function getAnchorDateForMonth(
  date: Date,
  anchorDay: number,
  timezone: string,
): Date {
  const parts = getDatePartsInTimeZone(date, timezone);
  const safeAnchor = Math.min(31, Math.max(1, Math.trunc(anchorDay)));
  const day = Math.min(safeAnchor, daysInMonth(parts.year, parts.month));
  const key = formatDateKey(parts.year, parts.month, day);
  return startOfLocalDay(key, timezone);
}

export function nextAnchorDate(
  anchorDate: Date,
  anchorDay: number,
  timezone: string,
): Date {
  const parts = getDatePartsInTimeZone(anchorDate, timezone);

  let year = parts.year;
  let month = parts.month + 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }

  const safeAnchor = Math.min(31, Math.max(1, Math.trunc(anchorDay)));
  const day = Math.min(safeAnchor, daysInMonth(year, month));
  const key = formatDateKey(year, month, day);
  return startOfLocalDay(key, timezone);
}

export function addDaysLocal(date: Date, days: number, timezone: string): Date {
  const normalized = normalizeLocalDay(date, timezone);
  const shifted = new Date(normalized);
  shifted.setUTCDate(shifted.getUTCDate() + Math.trunc(days));
  return normalizeLocalDay(shifted, timezone);
}

export function fullDaysBetweenLocal(from: Date, to: Date, timezone: string): number {
  const a = normalizeLocalDay(from, timezone).getTime();
  const b = normalizeLocalDay(to, timezone).getTime();
  const diff = b - a;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
