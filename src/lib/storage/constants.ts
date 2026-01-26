export const GB_BYTES = 1024 * 1024 * 1024;
export const STORAGE_BASE_GB = 128;
export const TRANSFER_BASE_GB = 256;

export const MAX_FILE_MB = 15;

export const ALLOWED_FILE_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export function normalizePackCount(value: unknown, fallback = 1): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}

export function toBytesFromGb(gb: number): number {
  return Math.max(0, Math.floor(gb * GB_BYTES));
}

export function calcStorageLimitBytes(packs: number): number {
  return toBytesFromGb(STORAGE_BASE_GB * normalizePackCount(packs));
}

export function calcTransferLimitBytes(packs: number): number {
  return toBytesFromGb(TRANSFER_BASE_GB * normalizePackCount(packs));
}

export function formatBytes(value: number): string {
  if (!Number.isFinite(value)) return "0 B";
  const abs = Math.max(0, value);
  if (abs < 1024) return `${abs} B`;
  const kb = abs / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}
