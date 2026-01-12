// src/services/arca/logger.ts
type LogLevel = "info" | "warn" | "error";

const MAX_STRING_LENGTH = 320;
const MAX_META_LENGTH = 2000;
const REDACT_KEYS = new Set([
  "password",
  "clave",
  "secret",
  "token",
  "access_token",
  "authorization",
  "cert",
  "key",
  "certencrypted",
  "keyencrypted",
  "private_key",
  "privatekey",
  "cert_pem",
  "key_pem",
]);

function redactValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (
    value.includes("BEGIN CERTIFICATE") ||
    value.includes("BEGIN RSA PRIVATE KEY")
  ) {
    return "[redacted]";
  }
  if (value.length > MAX_STRING_LENGTH) {
    return `${value.slice(0, MAX_STRING_LENGTH)}…`;
  }
  return value;
}

function redactMeta(meta?: Record<string, unknown>): string {
  if (!meta || Object.keys(meta).length === 0) return "";
  try {
    const raw = JSON.stringify(meta, (key, value) => {
      if (!key) return redactValue(value);
      if (REDACT_KEYS.has(key.toLowerCase())) return "[redacted]";
      return redactValue(value);
    });
    if (raw.length > MAX_META_LENGTH) {
      return `${raw.slice(0, MAX_META_LENGTH)}…`;
    }
    return raw;
  } catch {
    return "";
  }
}

export function logArca(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>,
) {
  const tail = redactMeta(meta);
  const line = tail ? `${message} ${tail}` : message;
  const out = `[ARCA] ${line}`;
  if (level === "error") console.error(out);
  else if (level === "warn") console.warn(out);
  else console.info(out);
}
