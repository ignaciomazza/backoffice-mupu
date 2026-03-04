import { useMemo } from "react";
import { Booking, Operator, OperatorDue } from "@/types";
import Spinner from "@/components/Spinner";
import GroupOperatorDueCard from "@/components/groups/payments/GroupOperatorDueCard";

interface Props {
  dues: OperatorDue[] | undefined;
  booking: Booking;
  groupId?: string;
  role: string;
  onDueDeleted?: (id: number) => void;
  onStatusChanged?: (id: number, status: OperatorDue["status"]) => void;
  loading?: boolean; // nuevo flag
  operators: Operator[];
}

export default function GroupOperatorDueList({
  dues,
  booking,
  groupId,
  role,
  onDueDeleted,
  onStatusChanged,
  loading = false,
  operators,
}: Props) {
  const validDues = useMemo(
    () =>
      (dues ?? []).filter((d) => d && typeof d.id_due === "number"),
    [dues],
  );

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (validDues.length === 0) {
    return (
      <div className="rounded-2xl border border-sky-300/80 bg-white p-5 text-center text-[13px] text-slate-700 shadow-sm shadow-slate-900/10 backdrop-blur-sm dark:border-sky-600/30 dark:bg-sky-950/10 dark:text-slate-300 md:text-sm">
        No hay vencimientos registrados
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {validDues.map((due) => (
        <GroupOperatorDueCard
          key={due.id_due}
          due={due}
          booking={booking}
          groupId={groupId}
          operators={operators}
          role={role}
          onDueDeleted={onDueDeleted}
          onStatusChanged={onStatusChanged}
        />
      ))}
    </div>
  );
}
