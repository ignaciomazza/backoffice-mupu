import crypto from "crypto";

const TOKEN_VERSION = "v1";

export type PublicIdType =
  | "booking"
  | "quote"
  | "receipt"
  | "invoice"
  | "credit_note"
  | "resource"
  | "file";

export type PublicIdPayload = {
  t: PublicIdType;
  a: number; // id_agency
  i: number; // agency-scoped id
};

const getPublicIdKey = (): Buffer => {
  const raw = process.env.PUBLIC_ID_SECRET || process.env.JWT_SECRET || "";
  if (!raw) {
    throw new Error("PUBLIC_ID_SECRET o JWT_SECRET no configurado");
  }
  return crypto.createHash("sha256").update(raw).digest();
};

const toBase64Url = (buf: Buffer): string =>
  buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const fromBase64Url = (value: string): Buffer => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad =
    normalized.length % 4 === 0
      ? ""
      : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${pad}`, "base64");
};

export function encodePublicId(payload: PublicIdPayload): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getPublicIdKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    TOKEN_VERSION,
    toBase64Url(iv),
    toBase64Url(ciphertext),
    toBase64Url(tag),
  ].join(".");
}

export function decodePublicId(token: string): PublicIdPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) return null;

  try {
    const iv = fromBase64Url(parts[1]);
    const ciphertext = fromBase64Url(parts[2]);
    const tag = fromBase64Url(parts[3]);
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getPublicIdKey(),
      iv,
    );
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(plaintext) as Partial<PublicIdPayload>;
    if (
      !parsed ||
      typeof parsed.t !== "string" ||
      typeof parsed.a !== "number" ||
      typeof parsed.i !== "number"
    ) {
      return null;
    }
    return {
      t: parsed.t as PublicIdType,
      a: parsed.a,
      i: parsed.i,
    };
  } catch {
    return null;
  }
}
