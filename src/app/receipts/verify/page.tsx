// src/app/receipts/verify/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import { loadFinancePicks } from "@/utils/loadFinancePicks";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Link from "next/link";

type ReceiptPaymentLine = {
  amount: number;
  payment_method_id: number | null;
  account_id: number | null;
  payment_method_text?: string;
  account_text?: string;
};

type ReceiptIncome = {
  id_receipt: number;
  receipt_number: string;
  issue_date: string | null;
  amount: number;
  amount_currency: string;
  payment_fee_amount?: number | string | null;
  concept: string;
  currency?: string | null;
  payment_method?: string | null;
  account?: string | null;
  base_amount?: number | string | null;
  base_currency?: string | null;
  counter_amount?: number | string | null;
  counter_currency?: string | null;
  verification_status?: string | null;
  verified_at?: string | null;
  verified_by?: number | null;
  verifiedBy?: {
    id_user: number;
    first_name: string;
    last_name: string;
  } | null;
  payments?: ReceiptPaymentLine[];
  booking?: {
    id_booking: number;
    titular?: {
      id_client: number;
      first_name: string | null;
      last_name: string | null;
    } | null;
  } | null;
};

type ReceiptsResponse = { items: ReceiptIncome[]; nextCursor: number | null };

type FinancePickBundle = {
  accounts: { id_account: number; name: string; enabled: boolean }[];
  paymentMethods: { id_method: number; name: string; enabled: boolean }[];
};

const GLASS =
  "rounded-2xl border border-white/20 bg-white/10 backdrop-blur shadow-sm shadow-sky-900/10 dark:bg-white/10 dark:border-white/5";

const STATUS_STYLES: Record<string, string> = {
  PENDING:
    "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-900/30 dark:text-amber-100 dark:border-amber-800/40",
  VERIFIED:
    "bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-100 dark:border-emerald-800/40",
};

const toNumber = (v?: number | string | null) => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const normCurrency = (c?: string | null) =>
  String(c || "")
    .trim()
    .toUpperCase();

const fmtMoney = (v?: number | string | null, curr?: string | null) => {
  const n = toNumber(v);
  const currency = normCurrency(curr) || "ARS";
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
};

const fmtDate = (iso?: string | null) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("es-AR");
};

export default function ReceiptVerifyPage() {
  const { token } = useAuth() as { token?: string | null };

  const [data, setData] = useState<ReceiptIncome[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "PENDING" | "VERIFIED" | "ALL"
  >("PENDING");
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const [finance, setFinance] = useState<FinancePickBundle | null>(null);
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const picks = await loadFinancePicks(token);
        setFinance({
          accounts: picks.accounts.map((a) => ({
            id_account: a.id_account,
            name: a.name,
            enabled: a.enabled,
          })),
          paymentMethods: picks.paymentMethods.map((m) => ({
            id_method: m.id_method,
            name: m.name,
            enabled: m.enabled,
          })),
        });
      } catch {
        setFinance(null);
      }
    })();
  }, [token]);

  const accountMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const acc of finance?.accounts || []) {
      if (!acc.enabled) continue;
      map.set(acc.id_account, acc.name);
    }
    return map;
  }, [finance?.accounts]);

  const methodMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const method of finance?.paymentMethods || []) {
      if (!method.enabled) continue;
      map.set(method.id_method, method.name);
    }
    return map;
  }, [finance?.paymentMethods]);

  const fetchReceipts = useCallback(
    async ({
      reset = false,
      cursorOverride = null,
    }: {
      reset?: boolean;
      cursorOverride?: number | null;
    } = {}) => {
      if (!token) return;
      if (reset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      try {
        const qs = new URLSearchParams();
        qs.set("take", "30");
        if (!reset && cursorOverride) qs.set("cursor", String(cursorOverride));
        if (q) qs.set("q", q);
        if (statusFilter) qs.set("verification_status", statusFilter);

        const res = await authFetch(
          `/api/receipts?${qs.toString()}`,
          {},
          token,
        );
        if (!res.ok) throw new Error();
        const payload = (await res.json()) as ReceiptsResponse;
        const items = Array.isArray(payload?.items) ? payload.items : [];
        const nextCursor =
          typeof payload?.nextCursor === "number" ? payload.nextCursor : null;

        setData((prev) => (reset ? items : [...prev, ...items]));
        setCursor(nextCursor);
      } catch {
        toast.error("No se pudo cargar los ingresos.");
      } finally {
        if (reset) {
          setLoading(false);
        } else {
          setLoadingMore(false);
        }
      }
    },
    [token, q, statusFilter],
  );

  useEffect(() => {
    if (!token) return;
    fetchReceipts({ reset: true });
  }, [token, q, statusFilter, fetchReceipts]);

  const applySearch = () => setQ(qInput.trim());
  const clearFilters = () => {
    setQInput("");
    setQ("");
    setStatusFilter("PENDING");
  };

  const statusLabel =
    statusFilter === "ALL"
      ? "Todos"
      : statusFilter === "VERIFIED"
        ? "Verificados"
        : "Pendientes";

  const updateStatus = async (
    id: number,
    nextStatus: "PENDING" | "VERIFIED",
  ) => {
    if (!token) return;
    setUpdatingId(id);
    try {
      const res = await authFetch(
        `/api/receipts/${id}/verify`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: nextStatus }),
        },
        token,
      );
      if (!res.ok) throw new Error();
      const payload = (await res.json()) as {
        receipt?: {
          verification_status?: string | null;
          verified_at?: string | null;
          verified_by?: number | null;
        };
      };
      const updated = payload?.receipt;
      setData((prev) =>
        prev.map((item) =>
          item.id_receipt === id
            ? {
                ...item,
                verification_status: updated?.verification_status ?? nextStatus,
                verified_at: updated?.verified_at ?? null,
                verified_by: updated?.verified_by ?? null,
              }
            : item,
        ),
      );
      toast.success(
        nextStatus === "VERIFIED"
          ? "Ingreso verificado."
          : "Ingreso marcado como pendiente.",
      );
    } catch {
      toast.error("No se pudo actualizar el estado.");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <ProtectedRoute>
      <div className="mx-auto flex w-full flex-col gap-4 px-4 py-8 text-sky-950 dark:text-white">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Verificacion de ingresos</h1>
            <p className="text-xs text-sky-950/70 dark:text-white/70">
              Lista de cobros para validar. Los ingresos no verificados quedan
              pendientes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-sky-950/70 dark:text-white/70">
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">
              Filtro: {statusLabel}
            </span>
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">
              Mostrando: {data.length}
            </span>
            <Link
              href="/receipts"
              className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold shadow-sm transition-transform hover:scale-[0.99]"
            >
              Ir a recibos
            </Link>
          </div>
        </header>

        <section className={`${GLASS} flex flex-col gap-3 p-4`}>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-3 py-2 shadow-sm">
              <input
                className="w-full bg-transparent text-xs outline-none placeholder:text-sky-950/50 dark:placeholder:text-white/40"
                placeholder="Buscar por recibo, cliente, concepto o reserva"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
              />
            </div>
            <select
              className="h-9 rounded-full border border-white/20 bg-white/10 px-3 text-xs shadow-sm outline-none"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  e.target.value as "PENDING" | "VERIFIED" | "ALL",
                )
              }
            >
              <option value="PENDING">Pendientes</option>
              <option value="VERIFIED">Verificados</option>
              <option value="ALL">Todos</option>
            </select>
            <button
              onClick={applySearch}
              className="h-9 rounded-full bg-sky-100 px-3 text-xs font-semibold text-sky-950 shadow-sm transition-transform hover:scale-[0.99]"
            >
              Buscar
            </button>
            <button
              onClick={clearFilters}
              className="h-9 rounded-full border border-white/20 bg-white/10 px-3 text-xs shadow-sm transition-transform hover:scale-[0.99]"
            >
              Limpiar
            </button>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          {loading ? (
            <div className={`${GLASS} flex items-center justify-center p-8`}>
              <Spinner />
            </div>
          ) : data.length === 0 ? (
            <div className={`${GLASS} p-6 text-center text-sm`}>
              No hay ingresos para mostrar con los filtros actuales.
            </div>
          ) : (
            data.map((receipt) => {
              const status = String(receipt.verification_status || "PENDING")
                .toUpperCase()
                .trim();

              const hasBase =
                receipt.base_amount !== null &&
                receipt.base_amount !== undefined &&
                !!receipt.base_currency;
              const hasCounter =
                receipt.counter_amount !== null &&
                receipt.counter_amount !== undefined &&
                !!receipt.counter_currency;

              const baseLabel = hasBase
                ? fmtMoney(receipt.base_amount, receipt.base_currency)
                : null;
              const counterLabel = hasCounter
                ? fmtMoney(receipt.counter_amount, receipt.counter_currency)
                : hasBase &&
                    normCurrency(receipt.base_currency) !==
                      normCurrency(receipt.amount_currency)
                  ? fmtMoney(receipt.amount, receipt.amount_currency)
                  : null;

              const feeAmount = toNumber(receipt.payment_fee_amount);
              const clientTotal = toNumber(receipt.amount) + feeAmount;

              const paymentsLabel = (receipt.payments || []).map((p) => {
                const method =
                  (p.payment_method_id
                    ? methodMap.get(p.payment_method_id)
                    : undefined) ||
                  p.payment_method_text ||
                  "Metodo";
                const account =
                  (p.account_id ? accountMap.get(p.account_id) : undefined) ||
                  p.account_text ||
                  "";
                const label = account ? `${method} / ${account}` : method;
                return `${label}: ${fmtMoney(p.amount, receipt.amount_currency)}`;
              });

              const verifiedBy =
                receipt.verifiedBy?.first_name || receipt.verifiedBy?.last_name
                  ? `${receipt.verifiedBy?.first_name || ""} ${receipt.verifiedBy?.last_name || ""}`.trim()
                  : receipt.verified_by
                    ? `Usuario #${receipt.verified_by}`
                    : "-";

              return (
                <article
                  key={receipt.id_receipt}
                  className={`${GLASS} flex flex-col gap-3 p-4`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-sky-950/70 dark:text-white/70">
                      <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-sky-950 dark:text-white">
                        #{receipt.receipt_number}
                      </span>
                      <span>Fecha: {fmtDate(receipt.issue_date)}</span>
                      <span>
                        {receipt.booking?.id_booking
                          ? `Reserva #${receipt.booking.id_booking}`
                          : "Reserva -"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLES[status] || STATUS_STYLES.PENDING}`}
                      >
                        {status === "VERIFIED" ? "Verificado" : "Pendiente"}
                      </span>
                      {status === "VERIFIED" ? (
                        <button
                          disabled={updatingId === receipt.id_receipt}
                          onClick={() =>
                            updateStatus(receipt.id_receipt, "PENDING")
                          }
                          className="h-8 rounded-full border border-white/20 bg-white/10 px-3 text-[11px] font-semibold shadow-sm transition-transform hover:scale-[0.99] disabled:opacity-50"
                        >
                          {updatingId === receipt.id_receipt
                            ? "Actualizando..."
                            : "Marcar pendiente"}
                        </button>
                      ) : (
                        <button
                          disabled={updatingId === receipt.id_receipt}
                          onClick={() =>
                            updateStatus(receipt.id_receipt, "VERIFIED")
                          }
                          className="h-8 rounded-full bg-emerald-100 px-3 text-[11px] font-semibold text-emerald-950 shadow-sm transition-transform hover:scale-[0.99] disabled:opacity-50"
                        >
                          {updatingId === receipt.id_receipt
                            ? "Verificando..."
                            : "Verificar ingreso"}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr]">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">
                        {receipt.concept || "Sin concepto"}
                      </p>
                      <p className="text-xs text-sky-950/70 dark:text-white/70">
                        {receipt.booking?.titular
                          ? `${receipt.booking.titular.first_name || ""} ${receipt.booking.titular.last_name || ""}`.trim()
                          : "-"}
                      </p>
                      <p className="text-xs text-sky-950/70 dark:text-white/70">
                        Metodos:{" "}
                        {paymentsLabel.length > 0
                          ? paymentsLabel.join(" | ")
                          : receipt.payment_method || "-"}
                      </p>
                      <p className="text-xs text-sky-950/70 dark:text-white/70">
                        Cuenta: {receipt.account || "-"}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <p className="text-[11px] uppercase tracking-wide text-sky-950/60 dark:text-white/60">
                        Ingreso neto
                      </p>
                      <p className="text-base font-semibold">
                        {fmtMoney(receipt.amount, receipt.amount_currency)}
                      </p>
                      {feeAmount > 0 ? (
                        <p className="text-xs text-sky-950/70 dark:text-white/70">
                          Costo medio:{" "}
                          {fmtMoney(
                            receipt.payment_fee_amount,
                            receipt.amount_currency,
                          )}{" "}
                          (Total cliente:{" "}
                          {fmtMoney(clientTotal, receipt.amount_currency)})
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-1">
                      <p className="text-[11px] uppercase tracking-wide text-sky-950/60 dark:text-white/60">
                        Referencia
                      </p>
                      <p className="text-xs">
                        {baseLabel ? `Valor base: ${baseLabel}` : "-"}
                      </p>
                      <p className="text-xs">
                        {counterLabel ? `Contravalor: ${counterLabel}` : "-"}
                      </p>
                    </div>
                  </div>

                  <div className="text-[11px] text-sky-950/70 dark:text-white/70">
                    Verificado por: {verifiedBy} /{" "}
                    {fmtDate(receipt.verified_at)}
                  </div>
                </article>
              );
            })
          )}

          {cursor && !loading && (
            <div className="flex justify-center">
              <button
                onClick={() =>
                  fetchReceipts({ reset: false, cursorOverride: cursor })
                }
                className="rounded-full border border-white/20 bg-white/10 px-5 py-2 text-xs shadow-sm transition-transform hover:scale-[0.99]"
                disabled={loadingMore}
              >
                {loadingMore ? "Cargando..." : "Cargar mas"}
              </button>
            </div>
          )}
        </section>
      </div>
      <ToastContainer position="bottom-right" />
    </ProtectedRoute>
  );
}
