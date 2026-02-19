export const BUENOS_AIRES_TIME_ZONE = "America/Argentina/Buenos_Aires";

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function parseDateKeyParts(value: string): {
  year: number;
  month: number;
  day: number;
} | null {
  const match = DATE_KEY_RE.exec(String(value || "").trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function getDateTimePartsInTimeZone(
  date: Date,
  timeZone: string,
): DateTimeParts | null {
  if (!Number.isFinite(date.getTime())) return null;

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  const second = Number(parts.second);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second)
  ) {
    return null;
  }

  return { year, month, day, hour, minute, second };
}

function toValidDate(input: Date | string | number): Date | null {
  if (input instanceof Date) {
    return Number.isFinite(input.getTime()) ? input : null;
  }
  const parsed = new Date(input);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function isDateKey(value: string): boolean {
  return parseDateKeyParts(value) !== null;
}

export function addDaysToDateKey(
  dateKey: string,
  days: number,
): string | null {
  const parsed = parseDateKeyParts(dateKey);
  if (!parsed || !Number.isFinite(days)) return null;

  const date = new Date(
    Date.UTC(parsed.year, parsed.month - 1, parsed.day, 0, 0, 0, 0),
  );
  date.setUTCDate(date.getUTCDate() + Math.trunc(days));

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateFromDateKeyInBuenosAires(dateKey: string): Date | null {
  const parsed = parseDateKeyParts(dateKey);
  if (!parsed) return null;

  // Mediodia UTC evita corrimientos de fecha al formatear en distintos husos.
  return new Date(
    Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0, 0),
  );
}

export function toDateKeyInBuenosAires(
  value: Date | string | number | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (isDateKey(trimmed)) return trimmed;
  }

  const date = toValidDate(value);
  if (!date) return null;

  const parts = getDateTimePartsInTimeZone(date, BUENOS_AIRES_TIME_ZONE);
  if (!parts) return null;

  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
}

export function todayDateKeyInBuenosAires(now = new Date()): string {
  return toDateKeyInBuenosAires(now) ?? "";
}

export function formatDateInBuenosAires(
  value: Date | string | number | null | undefined,
  options: Intl.DateTimeFormatOptions = {},
): string {
  const date =
    typeof value === "string" && isDateKey(value)
      ? dateFromDateKeyInBuenosAires(value)
      : toValidDate(value ?? "");
  if (!date) return "-";

  const hasDateStyle = "dateStyle" in options || "timeStyle" in options;
  const defaults: Intl.DateTimeFormatOptions = hasDateStyle
    ? {}
    : {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      };

  return new Intl.DateTimeFormat("es-AR", {
    timeZone: BUENOS_AIRES_TIME_ZONE,
    ...defaults,
    ...options,
  }).format(date);
}

export function startOfDayUtcFromDateKeyInBuenosAires(
  dateKey: string,
): Date | null {
  const parsed = parseDateKeyParts(dateKey);
  if (!parsed) return null;

  const targetLocalMs = Date.UTC(parsed.year, parsed.month - 1, parsed.day, 0, 0, 0, 0);
  let utcMs = targetLocalMs;

  for (let i = 0; i < 3; i += 1) {
    const localParts = getDateTimePartsInTimeZone(
      new Date(utcMs),
      BUENOS_AIRES_TIME_ZONE,
    );
    if (!localParts) return null;

    const localAsUtcMs = Date.UTC(
      localParts.year,
      localParts.month - 1,
      localParts.day,
      localParts.hour,
      localParts.minute,
      localParts.second,
      0,
    );

    const delta = targetLocalMs - localAsUtcMs;
    if (delta === 0) break;
    utcMs += delta;
  }

  return new Date(utcMs);
}

export function endOfDayUtcFromDateKeyInBuenosAires(
  dateKey: string,
): Date | null {
  const nextKey = addDaysToDateKey(dateKey, 1);
  if (!nextKey) return null;

  const nextStart = startOfDayUtcFromDateKeyInBuenosAires(nextKey);
  if (!nextStart) return null;

  return new Date(nextStart.getTime() - 1);
}

export function parseDateInputInBuenosAires(input: unknown): Date | null {
  if (typeof input === "string") {
    const raw = input.trim();
    if (!raw) return null;

    const startOfDay = startOfDayUtcFromDateKeyInBuenosAires(raw);
    if (startOfDay) return startOfDay;

    return toValidDate(raw);
  }

  if (input instanceof Date || typeof input === "number") {
    return toValidDate(input);
  }

  return null;
}
