import type {
  BillingFallbackProviderContract,
  CancelFallbackPaymentIntentResult,
  CreateFallbackPaymentIntentInput,
  CreateFallbackPaymentIntentResult,
  FallbackProviderIntentSnapshot,
  GetFallbackPaymentStatusResult,
} from "@/services/collections/fallback/providers/types";

function normalizeStatus(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toUpperCase();
}

export class MercadoPagoFallbackProviderStub
  implements BillingFallbackProviderContract
{
  readonly key = "MP" as const;
  readonly version = "mp_stub_v1";

  async createPaymentIntentForCharge(
    input: CreateFallbackPaymentIntentInput,
  ): Promise<CreateFallbackPaymentIntentResult> {
    return {
      provider_payment_id: `mp_${input.external_reference}`,
      status: "PENDING",
      payment_url: `https://stub.mp.local/checkout/${encodeURIComponent(input.external_reference)}`,
      qr_payload: null,
      qr_image_url: null,
      provider_status: "PENDING",
      provider_status_detail: "STUB",
      provider_raw_payload: {
        provider: "mp_stub",
        external_reference: input.external_reference,
      },
    };
  }

  async getPaymentStatus(
    input: FallbackProviderIntentSnapshot,
  ): Promise<GetFallbackPaymentStatusResult> {
    const status = normalizeStatus(input.provider_status || input.status);
    if (status === "PAID") {
      return {
        provider_status: "PAID",
        mapped_status: "PAID",
        paid_at: input.paid_at || new Date(),
        raw_payload: { provider: "mp_stub", status: "PAID" },
      };
    }
    if (status === "FAILED") {
      return {
        provider_status: "FAILED",
        mapped_status: "FAILED",
        paid_at: null,
        raw_payload: { provider: "mp_stub", status: "FAILED" },
      };
    }
    if (status === "EXPIRED") {
      return {
        provider_status: "EXPIRED",
        mapped_status: "EXPIRED",
        paid_at: null,
        raw_payload: { provider: "mp_stub", status: "EXPIRED" },
      };
    }

    if (input.expires_at && input.expires_at.getTime() <= Date.now()) {
      return {
        provider_status: "EXPIRED",
        mapped_status: "EXPIRED",
        paid_at: null,
        raw_payload: { provider: "mp_stub", status: "EXPIRED_BY_TTL" },
      };
    }

    return {
      provider_status: "PENDING",
      mapped_status: "PENDING",
      paid_at: null,
      raw_payload: { provider: "mp_stub", status: "PENDING" },
    };
  }

  async cancelPaymentIntent(
    input: FallbackProviderIntentSnapshot,
  ): Promise<CancelFallbackPaymentIntentResult> {
    const paid = normalizeStatus(input.provider_status || input.status) === "PAID";
    return {
      success: true,
      final_status: paid ? "PAID" : "CANCELED",
      raw_payload: { provider: "mp_stub", canceled: !paid },
    };
  }
}
