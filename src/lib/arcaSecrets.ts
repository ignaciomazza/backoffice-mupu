// src/lib/arcaSecrets.ts
import crypto from "crypto";

const ENC_ALGO = "aes-256-gcm";

function getArcaKey(): Buffer {
  const raw =
    process.env.ARCA_SECRETS_KEY || process.env.AFIP_SECRET_KEY || "";
  if (!raw) {
    throw new Error("ARCA_SECRETS_KEY no configurado");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "ARCA_SECRETS_KEY inválido (debe ser base64 de 32 bytes)",
    );
  }
  return key;
}

export function validateArcaSecretsKey(): void {
  void getArcaKey();
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENC_ALGO, getArcaKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${ciphertext.toString("hex")}:${tag.toString("hex")}`;
}

export function decryptSecret(encrypted: string): string {
  const [ivHex, ctHex, tagHex] = encrypted.split(":");
  if (!ivHex || !ctHex || !tagHex) {
    throw new Error("ARCA: formato cifrado inválido");
  }
  const iv = Buffer.from(ivHex, "hex");
  const ct = Buffer.from(ctHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const decipher = crypto.createDecipheriv(ENC_ALGO, getArcaKey(), iv);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(ct), decipher.final()]);
  return out.toString("utf8");
}
