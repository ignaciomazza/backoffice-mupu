// src/components/groups/collections/GroupClientPaymentList.tsx
"use client";

import { useMemo } from "react";
import { ClientPayment } from "@/types";
import type { GroupFinanceContext } from "@/components/groups/finance/contextTypes";
import Spinner from "@/components/Spinner";
import GroupClientPaymentCard from "@/components/groups/collections/GroupClientPaymentCard";

interface Props {
  payments: ClientPayment[] | undefined;
  context: GroupFinanceContext;
  groupId?: string;
  role: string;
  onPaymentDeleted?: (id: number) => void;
  loading?: boolean;
}

export default function GroupClientPaymentList({
  payments,
  context,
  groupId,
  role,
  onPaymentDeleted,
  loading = false,
}: Props) {
  const validPayments = useMemo(
    () =>
      (payments ?? []).filter(
        (p) => p && typeof p.id_payment === "number",
      ),
    [payments],
  );

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (validPayments.length === 0) {
    return (
      <div className="rounded-2xl border border-sky-300/80 bg-white p-5 text-center text-[13px] text-slate-700 shadow-sm shadow-slate-900/10 dark:border-sky-600/30 dark:bg-sky-950/10 dark:text-slate-300 md:text-sm">
        No hay pagos registrados
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {validPayments.map((payment) => (
        <GroupClientPaymentCard
          key={payment.id_payment}
          payment={payment}
          context={context}
          groupId={groupId}
          role={role}
          onPaymentDeleted={onPaymentDeleted}
        />
      ))}
    </div>
  );
}
