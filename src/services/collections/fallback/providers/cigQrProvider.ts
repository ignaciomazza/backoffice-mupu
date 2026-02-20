import type {
  BillingFallbackProviderContract,
  CancelFallbackPaymentIntentResult,
  CreateFallbackPaymentIntentInput,
  CreateFallbackPaymentIntentResult,
  FallbackProviderIntentSnapshot,
  GetFallbackPaymentStatusResult,
} from "@/services/collections/fallback/providers/types";

function nowIso(input?: Date | null): string {
  const base = input instanceof Date ? input : new Date();
  return base.toISOString();
}

function resolveMappedStatus(
  input: FallbackProviderIntentSnapshot,
): GetFallbackPaymentStatusResult["mapped_status"] {
  const status = String(input.provider_status || input.status || "")
    .trim()
    .toUpperCase();

  if (status === "PAID") return "PAID";
  if (status === "FAILED") return "FAILED";
  if (status === "EXPIRED") return "EXPIRED";

  if (input.expires_at && input.expires_at.getTime() <= Date.now()) {
    return "EXPIRED";
  }

  return "PENDING";
}

export class CigQrFallbackProvider implements BillingFallbackProviderContract {
  readonly key = "CIG_QR" as const;
  readonly version = "cig_qr_v1_stub";

  async createPaymentIntentForCharge(
    input: CreateFallbackPaymentIntentInput,
  ): Promise<CreateFallbackPaymentIntentResult> {
    const paymentUrl = `https://stub.cig.local/pay/${encodeURIComponent(input.external_reference)}`;
    const qrPayload = JSON.stringify({
      provider: "cig_qr",
      external_reference: input.external_reference,
      amount: input.amount,
      currency: input.currency,
      expires_at: input.expires_at ? input.expires_at.toISOString() : null,
    });

    return {
      provider_payment_id: `cig_${input.external_reference}`,
      status: "PENDING",
      payment_url: paymentUrl,
      qr_payload: qrPayload,
      qr_image_url: null,
      provider_status: "PENDING",
      provider_status_detail: "CREATED_STUB",
      provider_raw_payload: {
        created_at: nowIso(),
        payment_url: paymentUrl,
      },
    };
  }

  async getPaymentStatus(
    input: FallbackProviderIntentSnapshot,
  ): Promise<GetFallbackPaymentStatusResult> {
    const mapped = resolveMappedStatus(input);
    const paidAt = mapped === "PAID" ? input.paid_at || new Date() : null;

    return {
      provider_status:
        mapped === "PAID"
          ? "PAID"
          : mapped === "FAILED"
            ? "FAILED"
            : mapped === "EXPIRED"
              ? "EXPIRED"
              : "PENDING",
      mapped_status: mapped,
      paid_at: paidAt,
      raw_payload: {
        provider: "cig_qr",
        observed_at: nowIso(),
        source_status: input.provider_status || input.status || null,
      },
    };
  }

  async cancelPaymentIntent(
    input: FallbackProviderIntentSnapshot,
  ): Promise<CancelFallbackPaymentIntentResult> {
    const alreadyPaid =
      String(input.status || "").toUpperCase() === "PAID" ||
      String(input.provider_status || "").toUpperCase() === "PAID";

    return {
      success: true,
      final_status: alreadyPaid ? "PAID" : "CANCELED",
      raw_payload: {
        provider: "cig_qr",
        canceled_at: nowIso(),
      },
    };
  }
}
