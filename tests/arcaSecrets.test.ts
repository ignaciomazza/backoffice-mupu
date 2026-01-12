import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/arcaSecrets";

describe("arcaSecrets", () => {
  it("encrypt/decrypt roundtrip", () => {
    const prev = process.env.ARCA_SECRETS_KEY;
    process.env.ARCA_SECRETS_KEY = Buffer.from(
      "01234567890123456789012345678901",
    ).toString("base64");

    const plaintext = "-----BEGIN TEST-----\nclave\n-----END TEST-----";
    const encrypted = encryptSecret(plaintext);

    expect(encrypted).not.toContain("clave");
    expect(decryptSecret(encrypted)).toBe(plaintext);

    process.env.ARCA_SECRETS_KEY = prev;
  });

  it("rejects invalid key", () => {
    const prev = process.env.ARCA_SECRETS_KEY;
    process.env.ARCA_SECRETS_KEY = "invalid";

    expect(() => encryptSecret("hola")).toThrow();

    process.env.ARCA_SECRETS_KEY = prev;
  });
});
