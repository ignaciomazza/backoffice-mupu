import type { BillingMandateStatus, Prisma } from "@prisma/client";
import { logBillingEvent } from "@/services/billing/events";

type TxClient = Prisma.TransactionClient;

type MandateWithAgency = {
  id_mandate: number;
  status: BillingMandateStatus;
  activated_at: Date | null;
  revoked_at: Date | null;
  bank_reference: string | null;
  paymentMethod: {
    subscription: {
      id_subscription: number;
      id_agency: number;
    };
  };
};

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function transitionMandateStatus(
  tx: TxClient,
  input: {
    mandateId: number;
    newStatus: BillingMandateStatus;
    actorUserId?: number | null;
    reasonCode?: string | null;
    reasonText?: string | null;
    bankReference?: string | null;
    lastStatusCheckAt?: Date | null;
  },
): Promise<MandateWithAgency> {
  const now = new Date();

  const mandate = await tx.agencyBillingMandate.findUnique({
    where: { id_mandate: input.mandateId },
    select: {
      id_mandate: true,
      status: true,
      activated_at: true,
      revoked_at: true,
      bank_reference: true,
      paymentMethod: {
        select: {
          subscription: {
            select: {
              id_subscription: true,
              id_agency: true,
            },
          },
        },
      },
    },
  });

  if (!mandate) {
    throw new Error("Mandato no encontrado");
  }

  const previousStatus = mandate.status;
  const newStatus = input.newStatus;
  const reasonCode = input.reasonCode?.trim() || null;
  const reasonText = input.reasonText?.trim() || null;

  const data: Prisma.AgencyBillingMandateUpdateInput = {
    status: newStatus,
    last_status_check_at: input.lastStatusCheckAt ?? now,
    bank_reference: input.bankReference?.trim() || mandate.bank_reference,
    bank_mandate_ref: input.bankReference?.trim() || mandate.bank_reference,
  };

  if (newStatus === "ACTIVE") {
    data.activated_at = mandate.activated_at || now;
    data.rejected_reason_code = null;
    data.rejected_reason_text = null;
    data.rejection_code = null;
    data.rejection_reason = null;
  }

  if (newStatus === "REJECTED") {
    data.rejected_reason_code = reasonCode;
    data.rejected_reason_text = reasonText;
    data.rejection_code = reasonCode;
    data.rejection_reason = reasonText;
  }

  if (newStatus === "REVOKED") {
    data.revoked_at = mandate.revoked_at || now;
  }

  if (!["REJECTED"].includes(newStatus)) {
    data.rejected_reason_code = null;
    data.rejected_reason_text = null;
    data.rejection_code = null;
    data.rejection_reason = null;
  }

  const updated = await tx.agencyBillingMandate.update({
    where: { id_mandate: mandate.id_mandate },
    data,
    select: {
      id_mandate: true,
      status: true,
      activated_at: true,
      revoked_at: true,
      bank_reference: true,
      rejected_reason_code: true,
      rejected_reason_text: true,
      rejection_code: true,
      rejection_reason: true,
      paymentMethod: {
        select: {
          subscription: {
            select: {
              id_subscription: true,
              id_agency: true,
            },
          },
        },
      },
    },
  });

  if (previousStatus !== updated.status) {
    await logBillingEvent(
      {
        id_agency: updated.paymentMethod.subscription.id_agency,
        subscription_id: updated.paymentMethod.subscription.id_subscription,
        event_type: "MANDATE_STATUS_CHANGED",
        payload: toJsonValue({
          mandate_id: updated.id_mandate,
          agency_id: updated.paymentMethod.subscription.id_agency,
          previous_status: previousStatus,
          new_status: updated.status,
          reason_code: updated.rejected_reason_code ?? updated.rejection_code ?? null,
          reason_text: updated.rejected_reason_text ?? updated.rejection_reason ?? null,
          actor: input.actorUserId ?? "system",
        }),
        created_by: input.actorUserId ?? null,
      },
      tx,
    );
  }

  if (updated.status === "REJECTED") {
    await logBillingEvent(
      {
        id_agency: updated.paymentMethod.subscription.id_agency,
        subscription_id: updated.paymentMethod.subscription.id_subscription,
        event_type: "MANDATE_REJECTED",
        payload: toJsonValue({
          mandate_id: updated.id_mandate,
          agency_id: updated.paymentMethod.subscription.id_agency,
          previous_status: previousStatus,
          new_status: updated.status,
          reason_code: updated.rejected_reason_code ?? updated.rejection_code ?? null,
          reason_text: updated.rejected_reason_text ?? updated.rejection_reason ?? null,
          actor: input.actorUserId ?? "system",
        }),
        created_by: input.actorUserId ?? null,
      },
      tx,
    );
  }

  if (updated.status === "REVOKED") {
    await logBillingEvent(
      {
        id_agency: updated.paymentMethod.subscription.id_agency,
        subscription_id: updated.paymentMethod.subscription.id_subscription,
        event_type: "MANDATE_REVOKED",
        payload: toJsonValue({
          mandate_id: updated.id_mandate,
          agency_id: updated.paymentMethod.subscription.id_agency,
          previous_status: previousStatus,
          new_status: updated.status,
          actor: input.actorUserId ?? "system",
        }),
        created_by: input.actorUserId ?? null,
      },
      tx,
    );
  }

  return updated;
}
