const LOCKED_BOOKING_STATUSES = new Set([
  "cancelada",
  "canceled",
  "cancelled",
  "bloqueada",
  "blocked",
  "cerrada",
  "cerrado",
  "closed",
]);

export function normalizeBookingStatus(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

export function isBookingClosedStatus(value: unknown): boolean {
  const normalized = normalizeBookingStatus(value);
  if (!normalized) return false;
  return LOCKED_BOOKING_STATUSES.has(normalized);
}
