import type { BillingFallbackProvider } from "@prisma/client";

export type FallbackMappedStatus = "PENDING" | "PAID" | "FAILED" | "EXPIRED";

export type FallbackProviderIntentSnapshot = {
  id_fallback_intent: number;
  provider: BillingFallbackProvider;
  status: string;
  external_reference: string;
  provider_payment_id: string | null;
  provider_status: string | null;
  provider_status_detail: string | null;
  expires_at: Date | null;
  paid_at: Date | null;
};

export type CreateFallbackPaymentIntentInput = {
  charge: {
    id_charge: number;
    id_agency: number;
  };
  amount: number;
  currency: string;
  external_reference: string;
  idempotency_key: string;
  expires_at: Date | null;
};

export type CreateFallbackPaymentIntentResult = {
  provider_payment_id: string | null;
  status: "CREATED" | "PENDING" | "PRESENTED";
  payment_url: string | null;
  qr_payload: string | null;
  qr_image_url: string | null;
  provider_status: string | null;
  provider_status_detail: string | null;
  provider_raw_payload: Record<string, unknown>;
};

export type GetFallbackPaymentStatusResult = {
  provider_status: string | null;
  mapped_status: FallbackMappedStatus;
  paid_at: Date | null;
  raw_payload: Record<string, unknown>;
};

export type CancelFallbackPaymentIntentResult = {
  success: boolean;
  final_status: "CANCELED" | "PAID";
  raw_payload: Record<string, unknown>;
};

export interface BillingFallbackProviderContract {
  readonly key: BillingFallbackProvider;
  readonly version: string;
  createPaymentIntentForCharge(
    input: CreateFallbackPaymentIntentInput,
  ): Promise<CreateFallbackPaymentIntentResult>;
  getPaymentStatus(
    input: FallbackProviderIntentSnapshot,
  ): Promise<GetFallbackPaymentStatusResult>;
  cancelPaymentIntent(
    input: FallbackProviderIntentSnapshot,
  ): Promise<CancelFallbackPaymentIntentResult>;
}
