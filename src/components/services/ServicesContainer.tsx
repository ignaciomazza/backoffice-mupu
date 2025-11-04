// src/components/services/ServicesContainer.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast, ToastContainer } from "react-toastify";

import Spinner from "@/components/Spinner";
import ServiceForm from "@/components/services/ServiceForm";
import ServiceList from "@/components/services/ServiceList";
import InvoiceForm, {
  type InvoiceFormData,
} from "@/components/invoices/InvoiceForm";
import InvoiceList from "@/components/invoices/InvoiceList";
import ReceiptForm from "@/components/receipts/ReceiptForm";
import ReceiptList from "@/components/receipts/ReceiptList";
import CreditNoteForm, {
  type CreditNoteFormData,
} from "@/components/credite-notes/CreditNoteForm";
import CreditNoteList from "@/components/credite-notes/CreditNoteList";
import OperatorPaymentForm from "@/components/investments/OperatorPaymentForm";
import OperatorPaymentList from "@/components/investments/OperatorPaymentList";
import ClientPaymentForm from "@/components/client-payments/ClientPaymentForm";
import ClientPaymentList from "@/components/client-payments/ClientPaymentList";
import OperatorDueForm from "@/components/operator-dues/OperatorDueForm";
import OperatorDueList from "@/components/operator-dues/OperatorDueList";

import { authFetch } from "@/utils/authFetch";
import type { CreditNoteWithItems } from "@/services/creditNotes";
import type { ServiceLite } from "@/components/receipts/ReceiptForm";
import type {
  BillingData,
  Booking,
  ClientPayment,
  Invoice,
  Operator,
  OperatorDue,
  Receipt,
  Service,
} from "@/types";

/* =========================================================
 * Tipos auxiliares y helpers
 * ========================================================= */
export type ServiceFormData = {
  type: string;
  description?: string;
  sale_price: number;
  cost_price: number;
  destination?: string;
  reference?: string;
  tax_21?: number;
  tax_105?: number;
  exempt?: number;
  other_taxes?: number;
  card_interest?: number;
  card_interest_21?: number;
  currency: string;
  id_operator: number;
  departure_date: string;
  return_date: string;
};

type BookingServiceItem = {
  id_service?: number | string | null;
  id?: number | string | null;
  description?: string | null;
  type?: string | null;
  destination?: string | null;
  destino?: string | null;
  currency?: string | null;
  sale_currency?: string | null;
  sale_price?: number | string | null;
  card_interest?: number | string | null;
};

interface ServicesContainerProps {
  token: string | null;
  booking: Booking | null;
  services: Service[];
  availableServices: Service[];
  operators: Operator[];
  invoices: Invoice[];
  receipts: Receipt[];
  creditNotes: CreditNoteWithItems[];
  onReceiptDeleted?: (id: number) => void;
  onReceiptCreated?: (r: Receipt) => void;
  onCreditNoteCreated?: () => void;
  invoiceFormData: InvoiceFormData;
  formData: ServiceFormData;
  editingServiceId: number | null;
  expandedServiceId: number | null;
  loading: boolean;
  isFormVisible: boolean;
  isInvoiceFormVisible: boolean;
  handleChange: (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => void;
  handleInvoiceChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => void;
  updateFormData: (
    key: keyof InvoiceFormData,
    value: InvoiceFormData[keyof InvoiceFormData],
  ) => void;
  handleInvoiceSubmit: (e: React.FormEvent) => Promise<void>;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  deleteService: (serviceId: number) => Promise<void>;
  formatDate: (dateString: string | undefined) => string;
  setEditingServiceId: React.Dispatch<React.SetStateAction<number | null>>;
  setIsFormVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setFormData: React.Dispatch<React.SetStateAction<ServiceFormData>>;
  setExpandedServiceId: React.Dispatch<React.SetStateAction<number | null>>;
  setIsInvoiceFormVisible: React.Dispatch<React.SetStateAction<boolean>>;
  isSubmitting: boolean;
  onBillingUpdate?: (data: BillingData) => void;
  role: string;
  onBookingUpdated?: (updated: Booking) => void;
  creditNoteFormData: CreditNoteFormData;
  isCreditNoteFormVisible: boolean;
  setIsCreditNoteFormVisible: React.Dispatch<React.SetStateAction<boolean>>;
  handleCreditNoteChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => void;
  updateCreditNoteFormData: (
    key: keyof CreditNoteFormData,
    value: CreditNoteFormData[keyof CreditNoteFormData],
  ) => void;
  handleCreditNoteSubmit: (e: React.FormEvent) => Promise<void>;
  isCreditNoteSubmitting: boolean;
  onPaymentCreated?: () => void;
}

function cap(s: string | null | undefined): string {
  if (!s) return "";
  const str = String(s);
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function toFiniteNumber(n: unknown, fallback = 0): number {
  const num = typeof n === "number" ? n : Number(n);
  return Number.isFinite(num) ? num : fallback;
}

/* =========================================================
 * Componente
 * ========================================================= */
export default function ServicesContainer(props: ServicesContainerProps) {
  const {
    token,
    booking,
    services,
    availableServices,
    operators,
    invoices,
    receipts,
    creditNotes,
    onReceiptDeleted,
    onReceiptCreated,
    onCreditNoteCreated,
    invoiceFormData,
    formData,
    editingServiceId,
    expandedServiceId,
    loading,
    isFormVisible,
    isInvoiceFormVisible,
    handleChange,
    handleInvoiceChange,
    updateFormData,
    handleInvoiceSubmit,
    handleSubmit,
    deleteService,
    formatDate,
    setEditingServiceId,
    setIsFormVisible,
    setFormData,
    setExpandedServiceId,
    setIsInvoiceFormVisible,
    isSubmitting,
    onBillingUpdate,
    role,
    onBookingUpdated,
    creditNoteFormData,
    isCreditNoteFormVisible,
    setIsCreditNoteFormVisible,
    handleCreditNoteChange,
    updateCreditNoteFormData,
    handleCreditNoteSubmit,
    isCreditNoteSubmitting,
    onPaymentCreated,
  } = props;

  const router = useRouter();
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /* ================= Vecinos (prev/next) ================= */
  const [neighbors, setNeighbors] = useState<{
    prevId: number | null;
    nextId: number | null;
  }>({
    prevId: null,
    nextId: null,
  });

  useEffect(() => {
    if (!token || !booking?.id_booking) {
      setNeighbors({ prevId: null, nextId: null });
      return;
    }
    const ac = new AbortController();
    (async () => {
      try {
        const res = await authFetch(
          `/api/bookings/neighbor?bookingId=${booking.id_booking}`,
          { cache: "no-store", signal: ac.signal },
          token,
        );
        if (!res.ok) {
          // Evitamos ruido en la UI, solo reset silencioso
          setNeighbors({ prevId: null, nextId: null });
          return;
        }
        const data: unknown = await res.json();
        const prevId = toFiniteNumber(
          (data as { prevId?: unknown })?.prevId,
          NaN,
        );
        const nextId = toFiniteNumber(
          (data as { nextId?: unknown })?.nextId,
          NaN,
        );
        if (!mountedRef.current) return;
        setNeighbors({
          prevId: Number.isFinite(prevId) ? prevId : null,
          nextId: Number.isFinite(nextId) ? nextId : null,
        });
      } catch {
        if (!ac.signal.aborted) {
          setNeighbors({ prevId: null, nextId: null });
        }
      }
    })();
    return () => ac.abort();
  }, [token, booking?.id_booking]);

  /* ================= Transfer fee (agencia) ================= */
  const [agencyTransferFeePct, setAgencyTransferFeePct] =
    useState<number>(0.024);

  useEffect(() => {
    if (!token) return;
    const ac = new AbortController();
    (async () => {
      try {
        const res = await authFetch(
          "/api/agency/transfer-fee",
          { cache: "no-store", signal: ac.signal },
          token,
        );
        if (res.ok) {
          const data: unknown = await res.json();
          const raw = toFiniteNumber(
            (data as { transfer_fee_pct?: unknown })?.transfer_fee_pct,
            0.024,
          );
          // Clamp 0..1 para evitar 100% por error de proporción
          const safe = Math.min(Math.max(raw, 0), 1);
          if (!mountedRef.current) return;
          setAgencyTransferFeePct(safe);
        }
      } catch {
        // Silencioso: mantenemos el default
      }
    })();
    return () => ac.abort();
  }, [token]);

  /* ================= Estados de la reserva ================= */
  const [selectedClientStatus, setSelectedClientStatus] = useState("Pendiente");
  const [selectedOperatorStatus, setSelectedOperatorStatus] =
    useState("Pendiente");
  const [selectedBookingStatus, setSelectedBookingStatus] = useState("Abierta");

  useEffect(() => {
    if (booking) {
      setSelectedClientStatus(booking.clientStatus ?? "Pendiente");
      setSelectedOperatorStatus(booking.operatorStatus ?? "Pendiente");
      setSelectedBookingStatus(booking.status ?? "Abierta");
    }
  }, [booking]);

  const hasChanges = useMemo(() => {
    if (!booking) return false;
    return (
      selectedClientStatus !== (booking.clientStatus ?? "") ||
      selectedOperatorStatus !== (booking.operatorStatus ?? "") ||
      selectedBookingStatus !== (booking.status ?? "")
    );
  }, [
    booking,
    selectedClientStatus,
    selectedOperatorStatus,
    selectedBookingStatus,
  ]);

  /* ================= Observaciones administración ================= */
  const [isEditingInvObs, setIsEditingInvObs] = useState(false);
  const [invObsDraft, setInvObsDraft] = useState(booking?.observation || "");
  const [isSavingInvObs, setIsSavingInvObs] = useState(false);

  useEffect(() => {
    // Mantener el draft sincronizado si cambia la reserva
    setInvObsDraft(booking?.observation || "");
  }, [booking?.observation]);

  /* ================= Pagos de cliente ================= */
  const [clientPayments, setClientPayments] = useState<ClientPayment[]>([]);
  const [clientPaymentsLoading, setClientPaymentsLoading] = useState(false);

  const fetchClientPayments = useCallback(async () => {
    if (!booking?.id_booking || !token) return;
    const ac = new AbortController();
    try {
      setClientPaymentsLoading(true);
      const res = await authFetch(
        `/api/client-payments?bookingId=${booking.id_booking}`,
        { cache: "no-store", signal: ac.signal },
        token,
      );
      if (!res.ok) {
        if (res.status === 404 || res.status === 405) {
          setClientPayments([]);
          return;
        }
        throw new Error("Error al obtener pagos de cliente");
      }
      const data: unknown = await res.json();
      const items: ClientPayment[] = Array.isArray(
        (data as { payments?: unknown })?.payments,
      )
        ? ((data as { payments: ClientPayment[] }).payments as ClientPayment[])
        : [];

      items.sort((a, b) => {
        const da = new Date(a.due_date).getTime();
        const db = new Date(b.due_date).getTime();
        if (Number.isFinite(da) && Number.isFinite(db) && da !== db)
          return da - db;
        return (a.id_payment ?? 0) - (b.id_payment ?? 0);
      });

      if (!mountedRef.current) return;
      setClientPayments(items);
      // dentro de fetchClientPayments
    } catch {
      if (!mountedRef.current) return;
      // No toast para no saturar; se ve la lista vacía
      setClientPayments([]);
    } finally {
      if (mountedRef.current) setClientPaymentsLoading(false);
    }

    return () => ac.abort();
  }, [booking?.id_booking, token]);

  useEffect(() => {
    fetchClientPayments();
  }, [fetchClientPayments]);

  const handleClientPaymentCreated = () => {
    fetchClientPayments();
  };

  const handleClientPaymentDeleted = (id_payment: number) => {
    setClientPayments((prev) =>
      prev.filter((p) => p.id_payment !== id_payment),
    );
  };

  /* ================= Cuotas/Débitos al Operador ================= */
  const [operatorDues, setOperatorDues] = useState<OperatorDue[]>([]);
  const [operatorDuesLoading, setOperatorDuesLoading] = useState(false);

  const fetchOperatorDues = useCallback(async () => {
    if (!booking?.id_booking || !token) return;
    const ac = new AbortController();
    try {
      setOperatorDuesLoading(true);
      const res = await authFetch(
        `/api/operator-dues?bookingId=${booking.id_booking}`,
        { cache: "no-store", signal: ac.signal },
        token,
      );
      if (!res.ok) {
        if (res.status === 404 || res.status === 405) {
          setOperatorDues([]);
          return;
        }
        throw new Error("Error al obtener cuotas al operador");
      }
      const data: unknown = await res.json();
      const arr: OperatorDue[] = Array.isArray(
        (data as { dues?: unknown })?.dues,
      )
        ? ((data as { dues: OperatorDue[] }).dues as OperatorDue[])
        : [];
      if (!mountedRef.current) return;
      setOperatorDues(arr);
    } catch {
      if (!mountedRef.current) return;
      setOperatorDues([]);
    } finally {
      if (mountedRef.current) setOperatorDuesLoading(false);
    }
    return () => ac.abort();
  }, [booking?.id_booking, token]);

  useEffect(() => {
    fetchOperatorDues();
  }, [fetchOperatorDues]);

  const handleOperatorDueDeleted = (id_due: number) => {
    setOperatorDues((prev) => prev.filter((d) => d.id_due !== id_due));
  };

  const handleOperatorDueStatusChanged = (
    id_due: number,
    status: OperatorDue["status"],
  ) => {
    setOperatorDues((prev) =>
      prev.map((d) => (d.id_due === id_due ? { ...d, status } : d)),
    );
  };

  /* ================= Attach recibo existente ================= */
  const handleAttachExistingReceipt = useCallback(
    async ({
      id_receipt,
      bookingId,
      serviceIds,
    }: {
      id_receipt: number;
      bookingId: number;
      serviceIds: number[];
    }) => {
      if (!token) throw new Error("Sesión inválida. Volvé a iniciar sesión.");
      try {
        const res = await authFetch(
          `/api/receipts/${id_receipt}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              booking: { id_booking: bookingId },
              serviceIds,
            }),
          },
          token,
        );
        if (!res.ok) {
          let msg = "No se pudo asociar el recibo.";
          try {
            const err = await res.json();
            if (typeof (err as { error?: unknown })?.error === "string")
              msg = (err as { error: string }).error;
          } catch {}
          throw new Error(msg);
        }
        router.refresh();
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "No se pudo asociar el recibo.";
        toast.error(msg);
        throw e;
      }
    },
    [token, router],
  );

  /* ================= Guardar estados ================= */
  const handleSaveStatuses = async () => {
    if (!booking) return;
    try {
      const res = await authFetch(
        `/api/bookings/${booking.id_booking}`,
        {
          method: "PUT",
          body: JSON.stringify({
            clientStatus: selectedClientStatus,
            operatorStatus: selectedOperatorStatus,
            status: selectedBookingStatus,
            details: booking.details,
            invoice_type: booking.invoice_type,
            invoice_observation: booking.invoice_observation,
            observation: booking.observation,
            titular_id: booking.titular.id_client,
            id_agency: booking.agency.id_agency,
            departure_date: booking.departure_date,
            return_date: booking.return_date,
            pax_count: booking.pax_count,
            clients_ids: booking.clients.map((c) => c.id_client),
            id_user: booking.user.id_user,
          }),
        },
        token ?? undefined,
      );

      if (!res.ok) {
        let msg = "No se pudieron actualizar los estados.";
        try {
          const err = await res.json();
          if (typeof (err as { error?: unknown })?.error === "string")
            msg = (err as { error: string }).error;
        } catch {}
        throw new Error(msg);
      }

      const updated = (await res.json()) as Booking;
      toast.success("¡Estados actualizados!");
      onBookingUpdated?.(updated);
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "No se pudieron actualizar los estados.";
      toast.error(msg);
    }
  };

  /* ================= Guardar observación ================= */
  const handleInvObsSave = async () => {
    if (!booking) return;
    setIsSavingInvObs(true);
    try {
      const res = await authFetch(
        `/api/bookings/${booking.id_booking}`,
        {
          method: "PUT",
          body: JSON.stringify({
            clientStatus: booking.clientStatus,
            operatorStatus: booking.operatorStatus,
            status: booking.status,
            details: booking.details,
            invoice_type: booking.invoice_type,
            invoice_observation: booking.invoice_observation,
            observation: invObsDraft,
            titular_id: booking.titular.id_client,
            id_agency: booking.agency.id_agency,
            departure_date: booking.departure_date,
            return_date: booking.return_date,
            pax_count: booking.pax_count,
            clients_ids: booking.clients.map((c) => c.id_client),
            id_user: booking.user.id_user,
          }),
        },
        token ?? undefined,
      );
      if (!res.ok) {
        let msg = "Error al guardar observación";
        try {
          const err = await res.json();
          if (typeof (err as { error?: unknown })?.error === "string")
            msg = (err as { error: string }).error;
        } catch {}
        throw new Error(msg);
      }
      const updated = (await res.json()) as Booking;
      onBookingUpdated?.(updated);
      setIsEditingInvObs(false);
      toast.success("Observación guardada");
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Error al guardar observación";
      toast.error(msg);
    } finally {
      setIsSavingInvObs(false);
    }
  };

  /* ================= Créditos ================= */
  const handleLocalCreditNoteSubmit = async (e: React.FormEvent) => {
    await handleCreditNoteSubmit(e);
    onCreditNoteCreated?.();
  };

  /* ================= Pagos a operador ================= */
  const [paymentsReloadKey, setPaymentsReloadKey] = useState(0);

  /* ================= UI variants ================= */
  const obsVariants = {
    hidden: { opacity: 0, scale: 0.9 },
    visible: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.9 },
  } as const;

  /* ================= Render ================= */
  if (!loading && !booking) {
    return (
      <div className="flex h-[80vh] w-full flex-col items-center justify-center">
        <Spinner />
        <p className="absolute top-[54vh] w-1/3 text-center font-light dark:text-white">
          Si la carga de datos tarda mucho, revisá tu internet, recargá la
          página o volvé a la anterior.
        </p>
      </div>
    );
  }

  const canAdminLike =
    role === "administrativo" || role === "gerente" || role === "desarrollador";

  return (
    <motion.div>
      {loading ? (
        <div className="flex min-h-[90vh] w-full items-center">
          <Spinner />
        </div>
      ) : (
        <>
          {/* TOP BAR */}
          <div className="sticky top-2 z-10 mb-4 md:mb-6">
            <div className="flex items-center justify-between gap-2 rounded-3xl border border-white/10 bg-white/20 p-2 shadow-md shadow-sky-950/10 backdrop-blur dark:bg-white/[0.08]">
              {/* Volver */}
              <Link
                href="/bookings"
                className="group relative inline-flex h-10 items-center justify-center rounded-2xl px-3 text-sm font-medium text-sky-950 transition-colors hover:bg-white/60 dark:text-white dark:hover:bg-white/10"
                title="Volver a reservas"
                aria-label="Volver"
              >
                <span className="absolute inset-0 rounded-2xl ring-0 ring-sky-900/5 transition group-hover:ring-2 dark:ring-white/5" />
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="mr-1 size-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.6}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
                  />
                </svg>
                <span className="hidden sm:inline">Volver</span>
              </Link>

              {/* Título */}
              <div className="flex flex-1 items-center justify-center">
                <h1 className="truncate text-center text-xl font-semibold text-sky-950 dark:text-white md:text-2xl">
                  {booking ? `Reserva N° ${booking.id_booking}` : "Reserva"}
                </h1>
              </div>

              {/* Navegación por vecinos */}
              {canAdminLike ? (
                <div className="hidden items-center gap-1 md:flex">
                  <button
                    onClick={() =>
                      neighbors.prevId &&
                      router.push(`/bookings/services/${neighbors.prevId}`)
                    }
                    disabled={!neighbors.prevId}
                    title={
                      neighbors.prevId
                        ? `Ir a #${neighbors.prevId}`
                        : "No hay anterior"
                    }
                    aria-label="Anterior"
                    className={`inline-flex h-10 items-center rounded-2xl px-3 text-sm font-light transition ${
                      neighbors.prevId
                        ? "text-sky-950/70 hover:bg-white/60 hover:text-sky-950 dark:text-white/70 hover:dark:bg-white/10 hover:dark:text-white"
                        : "cursor-not-allowed text-sky-950/30 dark:text-white/30"
                    }`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="mr-1 size-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.4}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 19.5 8.25 12l7.5-7.5"
                      />
                    </svg>
                    anterior
                  </button>
                  <button
                    onClick={() =>
                      neighbors.nextId &&
                      router.push(`/bookings/services/${neighbors.nextId}`)
                    }
                    disabled={!neighbors.nextId}
                    title={
                      neighbors.nextId
                        ? `Ir a #${neighbors.nextId}`
                        : "No hay siguiente"
                    }
                    aria-label="Siguiente"
                    className={`inline-flex h-10 items-center rounded-2xl px-3 text-sm font-light transition ${
                      neighbors.nextId
                        ? "text-sky-950/70 hover:bg-white/60 hover:text-sky-950 dark:text-white/70 hover:dark:bg-white/10 hover:dark:text-white"
                        : "cursor-not-allowed text-sky-950/30 dark:text-white/30"
                    }`}
                  >
                    siguiente
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="ml-1 size-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.4}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m8.25 4.5 7.5 7.5-7.5 7.5"
                      />
                    </svg>
                  </button>
                </div>
              ) : (
                <div className="w-24" />
              )}
            </div>
          </div>

          {/* INFO RESERVA */}
          {booking && (
            <div className="mb-6 rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-white/40 px-3 py-1 text-sm font-medium tracking-wide dark:bg-white/10">
                    N° {booking.id_booking}
                  </span>
                  <span className="text-sm font-light opacity-80">
                    {formatDate(booking.creation_date)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/5 bg-white/30 px-3 py-1 text-xs font-medium shadow-sm shadow-sky-950/10 dark:bg-white/5">
                    Cliente:{" "}
                    <b className="ml-1 font-medium">
                      {booking.clientStatus || "-"}
                    </b>
                  </span>
                  <span className="rounded-full border border-white/5 bg-white/30 px-3 py-1 text-xs font-medium shadow-sm shadow-sky-950/10 dark:bg-white/5">
                    Operador:{" "}
                    <b className="ml-1 font-medium">
                      {cap(booking.operatorStatus) || "-"}
                    </b>
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="col-span-3 rounded-2xl border border-white/5 bg-white/20 p-4 shadow-sm shadow-sky-950/10 dark:bg-white/5">
                  <p className="text-sm font-semibold">Detalle</p>
                  <p className="mt-1 text-sm font-light">
                    {booking.details || "N/A"}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/5 bg-white/20 p-4 shadow-sm shadow-sky-950/10 dark:bg-white/5">
                  <p className="text-sm font-semibold">Vendedor</p>
                  <p className="mt-1 text-sm font-light">
                    {booking.user.first_name} {booking.user.last_name}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/5 bg-white/20 p-4 shadow-sm shadow-sky-950/10 dark:bg-white/5">
                  <p className="text-sm font-semibold">Titular</p>
                  <p className="mt-1 text-sm font-light">
                    {cap(booking.titular.first_name)}{" "}
                    {cap(booking.titular.last_name)} —{" "}
                    {booking.titular.id_client}
                  </p>
                </div>

                <div className="flex items-end gap-4 rounded-2xl border border-white/5 bg-white/20 p-4 shadow-sm shadow-sky-950/10 dark:bg-white/5">
                  <div>
                    <p className="text-sm font-semibold">Salida</p>
                    <p className="mt-1 text-sm font-light">
                      {formatDate(booking.departure_date)}
                    </p>
                  </div>
                  <p className="relative top-0.5 font-light">{`>`}</p>
                  <div>
                    <p className="text-sm font-semibold">Regreso</p>
                    <p className="mt-1 text-sm font-light">
                      {formatDate(booking.return_date)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Pasajeros lista */}
              <div className="mt-4 rounded-2xl border border-white/5 bg-white/20 p-4 shadow-sm shadow-sky-950/10 dark:bg-white/5">
                <p className="text-sm font-semibold">{`Lista de pasajeros (${booking.pax_count})`}</p>
                <ul className="ml-5 mt-2 list-disc text-sm">
                  <li>
                    {cap(booking.titular.first_name)}{" "}
                    {cap(booking.titular.last_name)}
                  </li>
                  {booking.clients.map((client) => (
                    <li key={client.id_client}>
                      {cap(client.first_name)} {cap(client.last_name)}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Facturación + Observaciones */}
              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-white/5 bg-white/20 p-4 shadow-sm shadow-sky-950/10 dark:bg-white/5">
                  <p className="text-sm font-semibold">Facturación</p>
                  <ul className="ml-4 mt-2 list-disc text-sm">
                    <li className="font-light">
                      {booking.invoice_type || "Sin observaciones"}
                    </li>
                    <li className="font-light">
                      {booking.invoice_observation || "Sin observaciones"}
                    </li>
                  </ul>
                </div>

                <div className="rounded-2xl border border-white/5 bg-white/20 p-4 shadow-sm shadow-sky-950/10 dark:bg-white/5">
                  <p className="mb-2 text-sm font-semibold">
                    Observaciones de administración
                  </p>
                  <li className="list-none">
                    <AnimatePresence initial={false}>
                      {isEditingInvObs ? (
                        <motion.div
                          key="edit"
                          layout
                          variants={obsVariants}
                          initial="hidden"
                          animate="visible"
                          exit="exit"
                          transition={{ duration: 0.2 }}
                          className="flex w-full flex-col gap-3"
                        >
                          <textarea
                            className="w-full flex-1 rounded-2xl border border-sky-950/10 bg-white/50 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
                            rows={3}
                            value={invObsDraft}
                            onChange={(e) => setInvObsDraft(e.target.value)}
                            aria-label="Editar observación de administración"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={handleInvObsSave}
                              disabled={isSavingInvObs}
                              className={`rounded-full px-6 py-2 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:backdrop-blur ${
                                isSavingInvObs
                                  ? "bg-sky-100/50 text-sky-950/50 dark:bg-white/5 dark:text-white/50"
                                  : "bg-sky-100 text-sky-950 dark:bg-white/10 dark:text-white"
                              }`}
                            >
                              {isSavingInvObs ? (
                                <Spinner />
                              ) : (
                                <span className="inline-flex items-center gap-2">
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    strokeWidth={1.7}
                                    stroke="currentColor"
                                    className="size-5"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z"
                                    />
                                  </svg>
                                  Guardar
                                </span>
                              )}
                            </button>
                            <button
                              onClick={() => {
                                setIsEditingInvObs(false);
                                setInvObsDraft(booking.observation || "");
                              }}
                              className="rounded-full bg-red-600 px-6 py-2 text-center text-red-100 shadow-sm shadow-red-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-red-800"
                              aria-label="Cancelar edición"
                              title="Cancelar"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth={1.7}
                                stroke="currentColor"
                                className="size-5"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M6 18 18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="view"
                          layout
                          variants={obsVariants}
                          initial="hidden"
                          animate="visible"
                          exit="exit"
                          transition={{ duration: 0.2 }}
                          className="flex items-start justify-between gap-2"
                        >
                          <p className="min-h-[28px] flex-1 rounded-xl bg-white/30 p-2 text-sm font-light dark:bg-white/5">
                            {booking.observation || "Sin observaciones"}
                          </p>
                          {canAdminLike && (
                            <button
                              onClick={() => {
                                setInvObsDraft(booking.observation || "");
                                setIsEditingInvObs(true);
                              }}
                              className="rounded-full p-2 text-sky-950 transition-transform hover:scale-95 active:scale-90 dark:text-white"
                              title="Editar observación"
                              aria-label="Editar observación"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth={1.5}
                                stroke="currentColor"
                                className="size-6"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                                />
                              </svg>
                            </button>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </li>
                </div>
              </div>
            </div>
          )}

          {/* SERVICIOS */}
          {booking ? (
            <>
              <div className="mb-4 mt-8 flex items-center justify-center gap-2">
                <p className="text-2xl font-medium">Servicios</p>
              </div>

              <ServiceForm
                token={token}
                formData={formData}
                operators={operators}
                handleChange={handleChange}
                handleSubmit={handleSubmit}
                editingServiceId={editingServiceId}
                isFormVisible={isFormVisible}
                setIsFormVisible={setIsFormVisible}
                onBillingUpdate={onBillingUpdate}
                agencyTransferFeePct={agencyTransferFeePct}
              />

              {services.length > 0 && (
                <div>
                  <ServiceList
                    services={services}
                    receipts={receipts}
                    expandedServiceId={expandedServiceId}
                    setExpandedServiceId={setExpandedServiceId}
                    startEditingService={(service) => {
                      setEditingServiceId(service.id_service);
                      setFormData({
                        ...service,
                        departure_date: service.departure_date
                          ? new Date(service.departure_date)
                              .toISOString()
                              .split("T")[0]
                          : "",
                        return_date: service.return_date
                          ? new Date(service.return_date)
                              .toISOString()
                              .split("T")[0]
                          : "",
                        id_operator: service.id_operator || 0,
                        card_interest: service.card_interest || 0,
                        card_interest_21: service.card_interest_21 || 0,
                      });
                      setIsFormVisible(true);
                    }}
                    deleteService={deleteService}
                    role={role}
                    status={booking.status}
                    agencyTransferFeePct={agencyTransferFeePct}
                  />
                </div>
              )}

              {/* PAGOS CLIENTE */}
              <div className="mb-16">
                <div className="mb-4 mt-8 flex items-center justify-center gap-2">
                  <p className="text-2xl font-medium">Pagos de Cliente</p>
                </div>

                {(role === "administrativo" ||
                  role === "desarrollador" ||
                  role === "gerente" ||
                  role === "vendedor") &&
                  (services.length > 0 || clientPayments.length > 0) && (
                    <ClientPaymentForm
                      token={token}
                      booking={booking}
                      onCreated={handleClientPaymentCreated}
                    />
                  )}

                <ClientPaymentList
                  payments={clientPayments}
                  booking={booking}
                  role={role}
                  loading={clientPaymentsLoading}
                  onPaymentDeleted={handleClientPaymentDeleted}
                />
              </div>

              {/* RECIBOS */}
              <div className="mb-16">
                <div className="mb-4 mt-8 flex items-center justify-center gap-2">
                  <p className="text-2xl font-medium">Recibos</p>
                </div>

                {canAdminLike &&
                  (services.length > 0 || receipts.length > 0) && (
                    <ReceiptForm
                      token={token || null}
                      bookingId={booking.id_booking}
                      allowAgency={false}
                      enableAttachAction={true}
                      loadServicesForBooking={async (
                        bId,
                      ): Promise<ServiceLite[]> => {
                        if (!token)
                          throw new Error(
                            "Sesión expirada. Volvé a iniciar sesión.",
                          );

                        // Mapper seguro
                        const mapToLite = (
                          arr: ReadonlyArray<BookingServiceItem>,
                        ): ServiceLite[] =>
                          (arr || []).map((s) => {
                            const rawId = s?.id_service ?? s?.id ?? 0;
                            const id =
                              typeof rawId === "number"
                                ? rawId
                                : Number(rawId ?? 0);
                            const currency = String(
                              s?.currency ?? s?.sale_currency ?? "ARS",
                            ).toUpperCase();
                            const sale =
                              typeof s?.sale_price === "number"
                                ? s.sale_price
                                : Number(s?.sale_price ?? 0);
                            const cardInt =
                              typeof s?.card_interest === "number"
                                ? s.card_interest
                                : Number(s?.card_interest ?? 0);

                            return {
                              id_service: Number.isFinite(id) ? id : 0,
                              description:
                                s?.description ??
                                s?.type ??
                                (Number.isFinite(id) && id > 0
                                  ? `Servicio ${id}`
                                  : "Servicio"),
                              currency,
                              sale_price: sale > 0 ? sale : undefined,
                              card_interest:
                                Number.isFinite(cardInt) && cardInt > 0
                                  ? cardInt
                                  : undefined,
                              type: s?.type ?? undefined,
                              destination:
                                s?.destination ?? s?.destino ?? undefined,
                            };
                          });

                        // Si ya tenemos los services en memoria para esta reserva
                        if (
                          booking?.id_booking === bId &&
                          Array.isArray(services) &&
                          services.length
                        ) {
                          return mapToLite(
                            services as unknown as ReadonlyArray<BookingServiceItem>,
                          );
                        }

                        // Helpers sin any
                        const parseJsonToArray = (
                          json: unknown,
                        ): BookingServiceItem[] | null => {
                          const root = json as Record<string, unknown> | null;
                          const candidates: unknown[] = [
                            json,
                            root?.items,
                            root?.results,
                            root?.data,
                            root?.services,
                            (
                              root?.booking as
                                | Record<string, unknown>
                                | undefined
                            )?.services,
                          ].filter(Boolean);
                          for (const c of candidates) {
                            if (Array.isArray(c))
                              return c as BookingServiceItem[];
                          }
                          return null;
                        };

                        const tryFetch = async (
                          url: string,
                        ): Promise<BookingServiceItem[] | null> => {
                          const res = await authFetch(
                            url,
                            { cache: "no-store" },
                            token,
                          );
                          if (!res.ok) return null;
                          const json: unknown = await res.json();
                          return parseJsonToArray(json);
                        };

                        const arr =
                          (await tryFetch(`/api/bookings/${bId}/services`)) ??
                          (await tryFetch(
                            `/api/bookings/${bId}?include=services`,
                          )) ??
                          (await tryFetch(`/api/bookings/${bId}`)) ??
                          (await tryFetch(`/api/services?bookingId=${bId}`)) ??
                          (await tryFetch(`/api/services/by-booking/${bId}`)) ??
                          [];

                        return mapToLite(arr);
                      }}
                      onAttachExisting={handleAttachExistingReceipt}
                      onSubmit={async (payload) => {
                        const res = await authFetch(
                          "/api/receipts",
                          { method: "POST", body: JSON.stringify(payload) },
                          token ?? undefined,
                        );
                        if (!res.ok) {
                          toast.error("No se pudo crear el recibo.");
                          return;
                        }
                        const { receipt } = (await res.json()) as {
                          receipt: Receipt;
                        };
                        toast.success("Recibo creado y asociado.");
                        onReceiptCreated?.(receipt);
                        router.refresh();
                      }}
                    />
                  )}

                {receipts.length > 0 && (
                  <ReceiptList
                    receipts={receipts}
                    booking={booking}
                    role={role}
                    onReceiptDeleted={onReceiptDeleted}
                  />
                )}
              </div>

              {/* FACTURAS */}
              {canAdminLike && (services.length > 0 || invoices.length > 0) && (
                <div className="mb-16">
                  <div className="mb-4 mt-8 flex items-center justify-center gap-2">
                    <p className="text-2xl font-medium">Facturas</p>
                  </div>

                  <InvoiceForm
                    formData={invoiceFormData}
                    availableServices={availableServices}
                    handleChange={handleInvoiceChange}
                    handleSubmit={handleInvoiceSubmit}
                    isFormVisible={isInvoiceFormVisible}
                    setIsFormVisible={setIsInvoiceFormVisible}
                    updateFormData={updateFormData}
                    isSubmitting={isSubmitting}
                    token={token}
                  />
                  {invoices.length > 0 && <InvoiceList invoices={invoices} />}
                </div>
              )}

              {/* NOTAS DE CRÉDITO */}
              {canAdminLike &&
                (services.length > 0 || creditNotes.length > 0) && (
                  <div className="mb-16">
                    <div className="mb-4 mt-8 flex items-center justify-center gap-2">
                      <p className="text-2xl font-medium">Notas de Crédito</p>
                    </div>

                    <CreditNoteForm
                      formData={creditNoteFormData}
                      availableServices={availableServices}
                      handleChange={handleCreditNoteChange}
                      handleSubmit={handleLocalCreditNoteSubmit}
                      isFormVisible={isCreditNoteFormVisible}
                      setIsFormVisible={setIsCreditNoteFormVisible}
                      updateFormData={updateCreditNoteFormData}
                      isSubmitting={isCreditNoteSubmitting}
                    />
                    {creditNotes.length > 0 && (
                      <CreditNoteList creditNotes={creditNotes} />
                    )}
                  </div>
                )}

              {/* ESTADOS RESERVA */}
              {canAdminLike &&
                (services.length > 0 ||
                  invoices.length > 0 ||
                  receipts.length > 0 ||
                  creditNotes.length > 0) && (
                  <div className="my-8">
                    <div className="mb-4 mt-8 flex items-center justify-center gap-2">
                      <p className="text-2xl font-medium">
                        Estado de la reserva
                      </p>
                    </div>

                    <div className="space-y-6">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        {/* Cliente */}
                        <div className="rounded-3xl border border-white/10 bg-white/10 p-4 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white">
                          <p className="mb-2 font-medium">Cliente</p>
                          <div className="flex gap-2">
                            {(["Pendiente", "Pago", "Facturado"] as const).map(
                              (st) => (
                                <button
                                  type="button"
                                  key={st}
                                  onClick={() => setSelectedClientStatus(st)}
                                  className={`flex-1 rounded-full py-2 text-center text-sm transition ${
                                    selectedClientStatus === st
                                      ? "rounded-3xl bg-sky-100 p-6 text-sky-950 shadow-sm shadow-sky-950/10 dark:bg-white/10 dark:text-white"
                                      : "text-sky-950/70 hover:bg-sky-950/5 dark:text-white/70 dark:hover:bg-white/5"
                                  }`}
                                  aria-pressed={selectedClientStatus === st}
                                >
                                  {st}
                                </button>
                              ),
                            )}
                          </div>
                        </div>

                        {/* Operador */}
                        <div className="rounded-3xl border border-white/10 bg-white/10 p-4 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white">
                          <p className="mb-2 font-medium">Operador</p>
                          <div className="flex gap-2">
                            {(["Pendiente", "Pago"] as const).map((st) => (
                              <button
                                type="button"
                                key={st}
                                onClick={() => setSelectedOperatorStatus(st)}
                                className={`flex-1 rounded-full py-2 text-center text-sm transition ${
                                  selectedOperatorStatus === st
                                    ? "rounded-3xl bg-sky-100 p-6 text-sky-950 shadow-sm shadow-sky-950/10 dark:bg-white/10 dark:text-white"
                                    : "text-sky-950/70 hover:bg-sky-950/5 dark:text-white/70 dark:hover:bg-white/5"
                                }`}
                                aria-pressed={selectedOperatorStatus === st}
                              >
                                {st}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Reserva */}
                        <div className="rounded-3xl border border-white/10 bg-white/10 p-4 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white">
                          <p className="mb-2 font-medium">Reserva</p>
                          <div className="flex gap-2">
                            {(
                              ["Abierta", "Bloqueada", "Cancelada"] as const
                            ).map((st) => (
                              <button
                                type="button"
                                key={st}
                                onClick={() => setSelectedBookingStatus(st)}
                                className={`flex-1 rounded-full py-2 text-center text-sm transition ${
                                  selectedBookingStatus === st
                                    ? "rounded-3xl bg-sky-100 p-6 text-sky-950 shadow-sm shadow-sky-950/10 dark:bg-white/10 dark:text-white"
                                    : "text-sky-950/70 hover:bg-sky-950/5 dark:text-white/70 dark:hover:bg-white/5"
                                }`}
                                aria-pressed={selectedBookingStatus === st}
                              >
                                {st}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={handleSaveStatuses}
                        disabled={!hasChanges}
                        aria-label="Guardar estados"
                        className={`ml-auto mr-4 flex items-center justify-center gap-2 rounded-full px-6 py-2 text-lg font-light transition-transform ${
                          hasChanges
                            ? "bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white"
                            : "cursor-not-allowed bg-sky-950/20 text-white/60 shadow-sm shadow-sky-950/10 dark:bg-white/5 dark:text-white/30 dark:backdrop-blur"
                        }`}
                      >
                        Guardar
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="size-6"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.4}
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}

              {/* OPERADOR */}
              {(role === "administrativo" ||
                role === "desarrollador" ||
                role === "gerente" ||
                role === "vendedor") &&
                booking &&
                (services.length > 0 || operatorDues.length > 0) && (
                  <div className="mb-16">
                    <div className="mb-4 mt-8 flex items-center justify-center gap-2">
                      <p className="text-2xl font-medium">Operador</p>
                    </div>

                    <OperatorDueForm
                      token={token}
                      booking={booking}
                      availableServices={services}
                      onCreated={fetchOperatorDues}
                    />

                    <OperatorDueList
                      dues={operatorDues}
                      booking={booking}
                      role={role}
                      operators={operators}
                      loading={operatorDuesLoading}
                      onDueDeleted={handleOperatorDueDeleted}
                      onStatusChanged={handleOperatorDueStatusChanged}
                    />
                  </div>
                )}

              {/* PAGOS A OPERADOR */}
              {canAdminLike && services.length > 0 && (
                <div>
                  <OperatorPaymentForm
                    token={token}
                    booking={booking!}
                    availableServices={services}
                    operators={operators}
                    onCreated={() => {
                      setPaymentsReloadKey((k) => k + 1);
                      onPaymentCreated?.();
                    }}
                  />
                  <OperatorPaymentList
                    token={token}
                    bookingId={booking.id_booking}
                    reloadKey={paymentsReloadKey}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="flex h-40 items-center justify-center">
              <Spinner />
            </div>
          )}
        </>
      )}
      <ToastContainer />
    </motion.div>
  );
}
