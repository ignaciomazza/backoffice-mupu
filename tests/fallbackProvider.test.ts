import { describe, expect, it } from "vitest";
import { CigQrFallbackProvider } from "@/services/collections/fallback/providers/cigQrProvider";

describe("fallback provider cig_qr stub", () => {
  it("createPaymentIntentForCharge returns payment_url/qr and pending status", async () => {
    const provider = new CigQrFallbackProvider();
    const result = await provider.createPaymentIntentForCharge({
      charge: {
        id_charge: 44,
        id_agency: 7,
      },
      amount: 12345.67,
      currency: "ARS",
      external_reference: "FBK-44-CIG_QR-001",
      idempotency_key: "FBK-44-CIG_QR-001",
      expires_at: new Date("2026-03-12T13:00:00.000Z"),
    });

    expect(result.status).toBe("PENDING");
    expect(result.payment_url).toContain("FBK-44-CIG_QR-001");
    expect(result.qr_payload).toContain("FBK-44-CIG_QR-001");
    expect(result.provider_status).toBe("PENDING");
  });

  it("getPaymentStatus maps paid/pending/expired statuses", async () => {
    const provider = new CigQrFallbackProvider();

    const pending = await provider.getPaymentStatus({
      id_fallback_intent: 1,
      provider: "CIG_QR",
      status: "PENDING",
      external_reference: "FBK-1",
      provider_payment_id: "p1",
      provider_status: "PENDING",
      provider_status_detail: null,
      expires_at: new Date(Date.now() + 60_000),
      paid_at: null,
    });
    expect(pending.mapped_status).toBe("PENDING");

    const paid = await provider.getPaymentStatus({
      id_fallback_intent: 2,
      provider: "CIG_QR",
      status: "PENDING",
      external_reference: "FBK-2",
      provider_payment_id: "p2",
      provider_status: "PAID",
      provider_status_detail: null,
      expires_at: new Date(Date.now() + 60_000),
      paid_at: null,
    });
    expect(paid.mapped_status).toBe("PAID");
    expect(paid.paid_at).toBeTruthy();

    const expired = await provider.getPaymentStatus({
      id_fallback_intent: 3,
      provider: "CIG_QR",
      status: "PENDING",
      external_reference: "FBK-3",
      provider_payment_id: "p3",
      provider_status: "PENDING",
      provider_status_detail: null,
      expires_at: new Date(Date.now() - 60_000),
      paid_at: null,
    });
    expect(expired.mapped_status).toBe("EXPIRED");
  });

  it("cancelPaymentIntent is idempotent", async () => {
    const provider = new CigQrFallbackProvider();

    const canceled = await provider.cancelPaymentIntent({
      id_fallback_intent: 1,
      provider: "CIG_QR",
      status: "PENDING",
      external_reference: "FBK-1",
      provider_payment_id: "p1",
      provider_status: "PENDING",
      provider_status_detail: null,
      expires_at: null,
      paid_at: null,
    });
    expect(canceled.success).toBe(true);
    expect(canceled.final_status).toBe("CANCELED");

    const alreadyPaid = await provider.cancelPaymentIntent({
      id_fallback_intent: 2,
      provider: "CIG_QR",
      status: "PAID",
      external_reference: "FBK-2",
      provider_payment_id: "p2",
      provider_status: "PAID",
      provider_status_detail: null,
      expires_at: null,
      paid_at: new Date(),
    });
    expect(alreadyPaid.success).toBe(true);
    expect(alreadyPaid.final_status).toBe("PAID");
  });
});
