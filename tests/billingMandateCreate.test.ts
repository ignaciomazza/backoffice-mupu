import { describe, expect, it } from "vitest";
import { decryptBillingSecret, hashCbu } from "@/lib/billingSecrets";
import { upsertDirectDebitMandate } from "@/pages/api/agency/subscription/payment-methods/direct-debit";

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

describe("upsertDirectDebitMandate", () => {
  it("creates mandate with encrypted CBU + last4 + hash", async () => {
    const prevKey = process.env.BILLING_SECRETS_KEY_B64;
    process.env.BILLING_SECRETS_KEY_B64 = Buffer.from(
      "01234567890123456789012345678901",
    ).toString("base64");

    const state = {
      subscription: null as null | {
        id_subscription: number;
        id_agency: number;
        status: "ACTIVE";
        anchor_day: number;
        timezone: string;
        direct_debit_discount_pct: number;
      },
      paymentMethod: null as null | {
        id_payment_method: number;
        subscription_id: number;
        method_type: "DIRECT_DEBIT_CBU_GALICIA";
        status: "PENDING";
        is_default: boolean;
        holder_name: string;
        holder_tax_id: string;
      },
      mandate: null as null | {
        id_mandate: number;
        payment_method_id: number;
        status: "PENDING";
        cbu_encrypted: string;
        cbu_last4: string;
        cbu_hash: string;
        consent_version: string;
      },
      events: [] as Array<{ event_type: string }>,
    };

    const tx = {
      agencyBillingSubscription: {
        upsert: async ({ create }: { create: Record<string, unknown> }) => {
          if (!state.subscription) {
            state.subscription = {
              id_subscription: 1,
              id_agency: Number(create.id_agency),
              status: "ACTIVE",
              anchor_day: Number(create.anchor_day),
              timezone: String(create.timezone),
              direct_debit_discount_pct: Number(create.direct_debit_discount_pct),
            };
          }
          return state.subscription;
        },
      },
      agencyBillingPaymentMethod: {
        updateMany: async () => ({ count: state.paymentMethod ? 1 : 0 }),
        upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
          if (!state.paymentMethod) {
            state.paymentMethod = {
              id_payment_method: 1,
              subscription_id: Number(create.subscription_id),
              method_type: "DIRECT_DEBIT_CBU_GALICIA",
              status: "PENDING",
              is_default: Boolean(create.is_default),
              holder_name: String(create.holder_name),
              holder_tax_id: String(create.holder_tax_id),
            };
          } else {
            state.paymentMethod = {
              ...state.paymentMethod,
              status: "PENDING",
              is_default: Boolean(update.is_default),
              holder_name: String(update.holder_name),
              holder_tax_id: String(update.holder_tax_id),
            };
          }
          return state.paymentMethod;
        },
      },
      agencyBillingMandate: {
        findUnique: async () => (state.mandate ? { id_mandate: state.mandate.id_mandate } : null),
        upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
          if (!state.mandate) {
            state.mandate = {
              id_mandate: 1,
              payment_method_id: Number(create.payment_method_id),
              status: "PENDING",
              cbu_encrypted: String(create.cbu_encrypted),
              cbu_last4: String(create.cbu_last4),
              cbu_hash: String(create.cbu_hash),
              consent_version: String(create.consent_version),
            };
          } else {
            state.mandate = {
              ...state.mandate,
              cbu_encrypted: String(update.cbu_encrypted),
              cbu_last4: String(update.cbu_last4),
              cbu_hash: String(update.cbu_hash),
              consent_version: String(update.consent_version),
            };
          }
          return {
            ...state.mandate,
            consent_accepted_at: new Date(),
            updated_at: new Date(),
          };
        },
      },
      agencyBillingEvent: {
        create: async ({ data }: { data: { event_type: string } }) => {
          state.events.push({ event_type: data.event_type });
          return data;
        },
      },
    };

    const cbu = buildValidCbu();
    const result = await upsertDirectDebitMandate(tx as never, {
      agencyId: 99,
      userId: 33,
      holderName: "Agencia Test",
      taxId: "20123456789",
      cbu,
      consentIp: "127.0.0.1",
    });

    expect(result.mandate.cbu_last4).toBe(cbu.slice(-4));
    expect(result.mandate.cbu_hash).toBe(hashCbu(cbu));
    expect(result.mandate.cbu_encrypted).not.toContain(cbu);
    expect(decryptBillingSecret(result.mandate.cbu_encrypted)).toBe(cbu);
    expect(state.events.some((evt) => evt.event_type === "MANDATE_CREATED")).toBe(true);

    process.env.BILLING_SECRETS_KEY_B64 = prevKey;
  });
});
