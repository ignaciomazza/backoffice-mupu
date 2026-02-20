import crypto from "crypto";

const ENC_ALGO = "aes-256-gcm";
const CBU_BLOCK1_WEIGHTS = [7, 1, 3, 9, 7, 1, 3] as const;
const CBU_BLOCK2_WEIGHTS = [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3] as const;

function getBillingSecretsKey(): Buffer {
  const raw = process.env.BILLING_SECRETS_KEY_B64 || "";
  if (!raw) {
    throw new Error("BILLING_SECRETS_KEY_B64 no configurado");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("BILLING_SECRETS_KEY_B64 inválido (debe ser base64 de 32 bytes)");
  }
  return key;
}

export function validateBillingSecretsKey(): void {
  void getBillingSecretsKey();
}

export function normalizeCbu(input: string): string {
  return String(input || "").replace(/\D/g, "");
}

function computeCbuCheckDigit(
  digits: string,
  weights: readonly number[],
): number {
  const sum = digits
    .split("")
    .reduce((acc, digit, index) => acc + Number(digit) * weights[index], 0);
  return (10 - (sum % 10)) % 10;
}

export function isValidCbu(input: string): boolean {
  const cbu = normalizeCbu(input);
  if (cbu.length !== 22) return false;

  const block1 = cbu.slice(0, 8);
  const block2 = cbu.slice(8, 22);

  const block1Digits = block1.slice(0, 7);
  const block1Check = Number(block1[7]);
  if (!Number.isFinite(block1Check)) return false;
  if (computeCbuCheckDigit(block1Digits, CBU_BLOCK1_WEIGHTS) !== block1Check) {
    return false;
  }

  const block2Digits = block2.slice(0, 13);
  const block2Check = Number(block2[13]);
  if (!Number.isFinite(block2Check)) return false;
  if (computeCbuCheckDigit(block2Digits, CBU_BLOCK2_WEIGHTS) !== block2Check) {
    return false;
  }

  return true;
}

export function hashCbu(input: string): string {
  const cbu = normalizeCbu(input);
  return crypto.createHash("sha256").update(cbu).digest("hex");
}

export function cbuLast4(input: string): string {
  const cbu = normalizeCbu(input);
  return cbu.slice(-4);
}

export function maskCbu(input: string): string {
  const last4 = cbuLast4(input);
  return `****${last4}`;
}

export function encryptBillingSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENC_ALGO, getBillingSecretsKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${ciphertext.toString("hex")}:${tag.toString("hex")}`;
}

export function decryptBillingSecret(encrypted: string): string {
  const [ivHex, ctHex, tagHex] = String(encrypted || "").split(":");
  if (!ivHex || !ctHex || !tagHex) {
    throw new Error("Billing: formato cifrado inválido");
  }

  const iv = Buffer.from(ivHex, "hex");
  const ct = Buffer.from(ctHex, "hex");
  const tag = Buffer.from(tagHex, "hex");

  const decipher = crypto.createDecipheriv(ENC_ALGO, getBillingSecretsKey(), iv);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(ct), decipher.final()]);
  return out.toString("utf8");
}
