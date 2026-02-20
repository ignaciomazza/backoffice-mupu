import { describe, expect, it } from "vitest";
import { transitionMandateStatus } from "@/services/collections/mandates/lifecycle";

describe("mandate lifecycle transitions", () => {
  it("transiciona PENDING -> PENDING_BANK -> ACTIVE -> REJECTED -> REVOKED y registra eventos", async () => {
    const state = {
      mandate: {
        id_mandate: 11,
        status: "PENDING" as
          | "PENDING"
          | "PENDING_BANK"
          | "ACTIVE"
          | "REJECTED"
          | "REVOKED",
        activated_at: null as Date | null,
        revoked_at: null as Date | null,
        bank_reference: null as string | null,
        rejected_reason_code: null as string | null,
        rejected_reason_text: null as string | null,
      },
      events: [] as Array<{ event_type: string; payload?: Record<string, unknown> }>,
    };

    const tx = {
      agencyBillingMandate: {
        findUnique: async () => ({
          id_mandate: state.mandate.id_mandate,
          status: state.mandate.status,
          activated_at: state.mandate.activated_at,
          revoked_at: state.mandate.revoked_at,
          bank_reference: state.mandate.bank_reference,
          paymentMethod: {
            subscription: {
              id_subscription: 7,
              id_agency: 3,
            },
          },
        }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          state.mandate = {
            ...state.mandate,
            status: String(data.status || state.mandate.status) as
              | "PENDING"
              | "PENDING_BANK"
              | "ACTIVE"
              | "REJECTED"
              | "REVOKED",
            activated_at: (data.activated_at as Date | null) ?? state.mandate.activated_at,
            revoked_at: (data.revoked_at as Date | null) ?? state.mandate.revoked_at,
            bank_reference:
              (data.bank_reference as string | null) ?? state.mandate.bank_reference,
            rejected_reason_code:
              (data.rejected_reason_code as string | null) ??
              state.mandate.rejected_reason_code,
            rejected_reason_text:
              (data.rejected_reason_text as string | null) ??
              state.mandate.rejected_reason_text,
          };

          return {
            id_mandate: state.mandate.id_mandate,
            status: state.mandate.status,
            activated_at: state.mandate.activated_at,
            revoked_at: state.mandate.revoked_at,
            bank_reference: state.mandate.bank_reference,
            rejected_reason_code: state.mandate.rejected_reason_code,
            rejected_reason_text: state.mandate.rejected_reason_text,
            rejection_code: state.mandate.rejected_reason_code,
            rejection_reason: state.mandate.rejected_reason_text,
            paymentMethod: {
              subscription: {
                id_subscription: 7,
                id_agency: 3,
              },
            },
          };
        },
      },
      agencyBillingEvent: {
        create: async ({ data }: { data: { event_type: string; payload?: Record<string, unknown> } }) => {
          state.events.push({ event_type: data.event_type, payload: data.payload });
          return data;
        },
      },
    };

    await transitionMandateStatus(tx as never, {
      mandateId: 11,
      newStatus: "PENDING_BANK",
      actorUserId: 9,
      bankReference: "GAL-REF-001",
    });

    expect(state.mandate.status).toBe("PENDING_BANK");
    expect(state.mandate.bank_reference).toBe("GAL-REF-001");
    expect(state.events.some((item) => item.event_type === "MANDATE_STATUS_CHANGED")).toBe(true);

    await transitionMandateStatus(tx as never, {
      mandateId: 11,
      newStatus: "ACTIVE",
      actorUserId: 9,
    });

    expect(state.mandate.status).toBe("ACTIVE");
    expect(state.mandate.activated_at).toBeInstanceOf(Date);

    await transitionMandateStatus(tx as never, {
      mandateId: 11,
      newStatus: "REJECTED",
      actorUserId: 9,
      reasonCode: "51",
      reasonText: "FONDOS_INSUFICIENTES",
    });

    expect(state.mandate.status).toBe("REJECTED");
    expect(state.mandate.rejected_reason_code).toBe("51");
    expect(state.mandate.rejected_reason_text).toBe("FONDOS_INSUFICIENTES");
    expect(state.events.some((item) => item.event_type === "MANDATE_REJECTED")).toBe(true);

    await transitionMandateStatus(tx as never, {
      mandateId: 11,
      newStatus: "REVOKED",
      actorUserId: 9,
    });

    expect(state.mandate.status).toBe("REVOKED");
    expect(state.mandate.revoked_at).toBeInstanceOf(Date);
    expect(state.events.some((item) => item.event_type === "MANDATE_REVOKED")).toBe(true);
  });
});
