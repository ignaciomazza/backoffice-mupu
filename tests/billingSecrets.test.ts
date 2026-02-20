import { describe, expect, it } from "vitest";
import {
  decryptBillingSecret,
  encryptBillingSecret,
  hashCbu,
  isValidCbu,
} from "@/lib/billingSecrets";

function calcCheckDigit(digits: string, weights: readonly number[]): number {
  const sum = digits
    .split("")
    .reduce((acc, digit, idx) => acc + Number(digit) * weights[idx], 0);
  return (10 - (sum % 10)) % 10;
}

function buildValidCbu(): string {
  const b1 = "2850590";
  const c1 = calcCheckDigit(b1, [7, 1, 3, 9, 7, 1, 3]);

  const b2 = "1234567890123";
  const c2 = calcCheckDigit(b2, [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3]);

  return `${b1}${c1}${b2}${c2}`;
}

describe("billingSecrets", () => {
  it("encrypt/decrypt CBU roundtrip", () => {
    const prev = process.env.BILLING_SECRETS_KEY_B64;
    process.env.BILLING_SECRETS_KEY_B64 = Buffer.from(
      "01234567890123456789012345678901",
    ).toString("base64");

    const cbu = buildValidCbu();
    const encrypted = encryptBillingSecret(cbu);

    expect(encrypted).not.toContain(cbu);
    expect(decryptBillingSecret(encrypted)).toBe(cbu);
    expect(isValidCbu(cbu)).toBe(true);

    process.env.BILLING_SECRETS_KEY_B64 = prev;
  });

  it("hashCbu is deterministic and 64-char hex", () => {
    const cbu = buildValidCbu();
    const h1 = hashCbu(cbu);
    const h2 = hashCbu(cbu);

    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });
});
