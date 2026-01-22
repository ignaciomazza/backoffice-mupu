// src/app/insights/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { authFetch } from "@/utils/authFetch";
import { useAuth } from "@/context/AuthContext";
import type {
  CommercialInsightsResponse,
  DestinationItem,
  ChannelItem,
  TopClientItem,
  InsightsMoneyPerCurrency,
} from "@/types";

/* =========================
 * Helpers formato
 * ========================= */

function formatDateForInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDateHuman(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value ?? "";
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatInteger(value: number | undefined): string {
  const safe = Number.isFinite(value) ? (value as number) : 0;
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 0,
  }).format(safe);
}

function formatCurrencySimple(
  value: number | undefined,
  currency: string,
): string {
  const safe = Number.isFinite(value) ? (value as number) : 0;
  const formatted = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(safe);
  return `${currency} ${formatted}`;
}

/** Suma monedas por código, sin mutar las originales */
function addMoney(
  a: InsightsMoneyPerCurrency | undefined,
  b: InsightsMoneyPerCurrency | undefined,
): InsightsMoneyPerCurrency {
  const result: InsightsMoneyPerCurrency = {};
  if (a) {
    for (const [code, value] of Object.entries(a)) {
      if (!code) continue;
      result[code] = (result[code] ?? 0) + (value ?? 0);
    }
  }
  if (b) {
    for (const [code, value] of Object.entries(b)) {
      if (!code) continue;
      result[code] = (result[code] ?? 0) + (value ?? 0);
    }
  }
  return result;
}

/* =========================
 * Inferencia reservas (fallback pasajeros nuevos)
 * ========================= */

type ClientsSegment = {
  reservations?: number | null;
  avgTicket?: InsightsMoneyPerCurrency | null;
  totalAmount?: InsightsMoneyPerCurrency | null;
};

function inferReservationsFromSegment(segment?: ClientsSegment): number {
  if (!segment) return 0;

  const direct = segment.reservations ?? 0;
  if (direct && direct > 0) return direct;

  const avgTicket = segment.avgTicket || {};
  const totalAmount = segment.totalAmount || {};

  for (const code of Object.keys(totalAmount)) {
    const total = totalAmount[code] ?? 0;
    const avg = avgTicket[code] ?? 0;
    if (total > 0 && avg > 0) {
      const inferred = Math.round(total / avg);
      if (Number.isFinite(inferred) && inferred > 0) {
        return inferred;
      }
    }
  }

  return direct;
}

/* =========================
 * Componentes pequeños
 * ========================= */

type StatAccent = "default" | "emerald" | "amber";

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  loading?: boolean;
  accent?: StatAccent;
}

function StatCard({
  title,
  value,
  subtitle,
  loading,
  accent = "default",
}: StatCardProps) {
  const valueColor =
    accent === "emerald"
      ? "text-emerald-600 dark:text-emerald-300"
      : accent === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : "text-slate-900 dark:text-slate-50";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm shadow-slate-900/5 dark:border-slate-800/70 dark:bg-slate-900/60">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${valueColor}`}>
        {loading ? (
          <span className="inline-block h-6 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-700/60" />
        ) : (
          value
        )}
      </div>
      {subtitle && (
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {subtitle}
        </div>
      )}
    </div>
  );
}

/* =========================
 * Tipos de la UI
 * ========================= */

type DimensionKey = "destination" | "period" | "clients";

interface NormalizedRow {
  label1: string;
  label2?: string | null;
  reservations: number;
  passengers: number;
  totals: InsightsMoneyPerCurrency;
  lastBooking?: string | null;
}

/* =========================
 * Normalización de filas
 * ========================= */

function normalizeRow(
  row: DestinationItem | ChannelItem | TopClientItem,
  dimension: DimensionKey,
): NormalizedRow {
  if (dimension === "destination") {
    const r = row as DestinationItem;
    return {
      label1: r.destinationKey || "Sin destino",
      label2: r.countryCode || null,
      reservations: r.reservations,
      passengers: r.passengers,
      totals: r.totalAmount ?? {},
    };
  }

  if (dimension === "period") {
    const r = row as ChannelItem;
    const totals: InsightsMoneyPerCurrency = {};
    if (r.avgTicket && r.reservations > 0) {
      for (const [code, value] of Object.entries(r.avgTicket)) {
        totals[code] = (value ?? 0) * r.reservations;
      }
    }
    return {
      label1: r.channel || "Sin fecha",
      reservations: r.reservations,
      passengers: r.passengers,
      totals,
    };
  }

  // clients
  const r = row as TopClientItem;
  return {
    label1: r.name || "Sin pax",
    reservations: r.reservations,
    passengers: r.passengers,
    totals: r.totalAmount ?? {},
    lastBooking: r.lastBookingDate,
  };
}

function getDimensionChipLabel(dimension: DimensionKey, count: number): string {
  if (dimension === "destination") return `${count} destinos`;
  if (dimension === "period") return `${count} meses`;
  return `${count} pasajeros`;
}

/* =========================
 * Página principal
 * ========================= */

export default function InsightsPage() {
  const { token } = useAuth() as { token?: string | null };

  const today = useMemo(() => new Date(), []);
  const ninetyDaysAgo = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 90);
    return d;
  }, [today]);

  const [from, setFrom] = useState<string>(() =>
    formatDateForInput(ninetyDaysAgo),
  );
  const [to, setTo] = useState<string>(() => formatDateForInput(today));
  const [appliedFrom, setAppliedFrom] = useState<string>(() =>
    formatDateForInput(ninetyDaysAgo),
  );
  const [appliedTo, setAppliedTo] = useState<string>(() =>
    formatDateForInput(today),
  );

  const [loading, setLoading] = useState<boolean>(false);
  const [data, setData] = useState<CommercialInsightsResponse | null>(null);
  const [dimension, setDimension] = useState<DimensionKey>("destination");

  const isInitialLoading = loading && !data;

  // =========================
  // Fetch de datos
  // =========================

  useEffect(() => {
    // Si todavía no tenemos token (AuthContext cargando), no llamamos al endpoint
    if (!token) return;

    const controller = new AbortController();

    async function loadInsights() {
      try {
        setLoading(true);

        const params = new URLSearchParams();
        if (appliedFrom) params.set("from", appliedFrom);
        if (appliedTo) params.set("to", appliedTo);

        const url =
          params.size > 0
            ? `/api/insights?${params.toString()}`
            : "/api/insights";

        const res = await authFetch(
          url,
          { method: "GET", signal: controller.signal, cache: "no-store" },
          token || undefined,
        );

        if (!res.ok) {
          const msg =
            res.status === 401
              ? "No estás autorizado para ver estos insights."
              : "No se pudieron cargar los insights.";
          toast.error(msg);
          setData(null);
          return;
        }

        const json = (await res.json()) as CommercialInsightsResponse;

        // eslint-disable-next-line no-console
        console.log("[Insights] newVsReturning:", json.clients?.newVsReturning);

        setData(json);
      } catch (error: unknown) {
        if ((error as { name?: string }).name === "AbortError") {
          return;
        }
        // eslint-disable-next-line no-console
        console.error("[InsightsPage] Error cargando insights:", error);
        toast.error("Ocurrió un error al cargar los insights.");
        setData(null);
      } finally {
        setLoading(false);
      }
    }

    loadInsights();

    return () => controller.abort();
  }, [appliedFrom, appliedTo, token]);

  // =========================
  // Derivados para la UI
  // =========================

  // Totales por moneda (para chips “Volumen por moneda”)
  const totalsByCurrency: InsightsMoneyPerCurrency = useMemo(() => {
    let totals: InsightsMoneyPerCurrency = {};

    data?.destinations?.topDestinations?.forEach((item) => {
      totals = addMoney(totals, item.totalAmount);
    });

    data?.clients?.topClients?.forEach((item) => {
      totals = addMoney(totals, item.totalAmount);
    });

    return totals;
  }, [data]);

  const currencyCodes = useMemo(
    () => Object.keys(totalsByCurrency),
    [totalsByCurrency],
  );

  // Segmentos pasajeros nuevos / recurrentes
  const newClientsSegment = data?.clients?.newVsReturning?.newClients || {};
  const returningClientsSegment =
    data?.clients?.newVsReturning?.returningClients || {};

  const reservationsTotal = data?.summary?.reservations ?? 0;
  const passengersTotal = data?.summary?.passengers ?? 0;

  const newClientReservations = inferReservationsFromSegment(newClientsSegment);
  const returningClientReservations = inferReservationsFromSegment(
    returningClientsSegment,
  );

  // Filas sin normalizar según dimensión
  const rawRows: (DestinationItem | ChannelItem | TopClientItem)[] =
    useMemo(() => {
      if (!data) return [];
      if (dimension === "destination") {
        return (data.destinations?.topDestinations ?? []) as DestinationItem[];
      }
      if (dimension === "period") {
        // Reutilizamos channels.byOrigin pero ahora representa MESES
        return (data.channels?.byOrigin ?? []) as ChannelItem[];
      }
      return (data.clients?.topClients ?? []) as TopClientItem[];
    }, [data, dimension]);

  // Filas normalizadas
  const normalizedRows: NormalizedRow[] = useMemo(
    () => rawRows.map((r) => normalizeRow(r, dimension)),
    [rawRows, dimension],
  );

  const hasData = normalizedRows.length > 0;

  const dimensionSummary = useMemo(
    () => ({
      rowCount: normalizedRows.length,
      reservations: normalizedRows.reduce(
        (acc, r) => acc + (r.reservations || 0),
        0,
      ),
      passengers: normalizedRows.reduce(
        (acc, r) => acc + (r.passengers || 0),
        0,
      ),
    }),
    [normalizedRows],
  );

  // =========================
  // Handlers
  // =========================

  const handleApplyFilters = () => {
    setAppliedFrom(from);
    setAppliedTo(to);
  };

  const handleFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFrom(e.target.value);
  };

  const handleToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTo(e.target.value);
  };

  // =========================
  // Render
  // =========================

  return (
    <ProtectedRoute>
      <div className="space-y-6 p-4 md:p-6">
        {/* Header */}
        <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50 md:text-2xl">
              Insights comerciales
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
              Vista pensada para marketing y gerencia: destinos, evolución
              mensual de las ventas y comportamiento de pasajeros, con tickets
              promedio por moneda.
            </p>
          </div>
        </header>

        {/* Filtros + resumen */}
        <section className="rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-lg shadow-slate-900/10 backdrop-blur-sm dark:border-slate-800/70 dark:bg-slate-950/60 md:p-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col">
              <label
                htmlFor="from"
                className="text-xs font-medium text-slate-600 dark:text-slate-400"
              >
                Desde
              </label>
              <input
                id="from"
                type="date"
                value={from}
                onChange={handleFromChange}
                className="mt-1 rounded-lg border border-slate-300 bg-white/70 px-2 py-1 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-50"
              />
            </div>

            <div className="flex flex-col">
              <label
                htmlFor="to"
                className="text-xs font-medium text-slate-600 dark:text-slate-400"
              >
                Hasta
              </label>
              <input
                id="to"
                type="date"
                value={to}
                onChange={handleToChange}
                className="mt-1 rounded-lg border border-slate-300 bg-white/70 px-2 py-1 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-50"
              />
            </div>

            <button
              type="button"
              onClick={handleApplyFilters}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white/40 px-3 py-2 text-sm font-medium text-slate-800 shadow-sm shadow-slate-900/5 backdrop-blur hover:border-emerald-400 hover:bg-white/70 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:border-emerald-400 dark:hover:bg-slate-900/70"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="size-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                  Actualizando...
                </>
              ) : (
                "Aplicar filtros"
              )}
            </button>

            <div className="ml-auto text-xs text-slate-500 dark:text-slate-400">
              {appliedFrom || appliedTo ? (
                <>
                  Mostrando datos entre{" "}
                  {appliedFrom ? formatDateHuman(appliedFrom) : "inicio"} y{" "}
                  {appliedTo ? formatDateHuman(appliedTo) : "hoy"}.
                </>
              ) : (
                "Mostrando últimos 90 días."
              )}
            </div>
          </div>

          {/* Tarjetas de resumen */}
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Reservas"
              value={formatInteger(reservationsTotal)}
              subtitle="Cantidad de reservas en el período"
              loading={isInitialLoading}
            />
            <StatCard
              title="Pasajeros"
              value={formatInteger(passengersTotal)}
              subtitle="Total de pasajeros asociados a las reservas"
              loading={isInitialLoading}
            />
            <StatCard
              title="Pasajeros nuevos"
              value={formatInteger(newClientReservations)}
              subtitle="Reservas de pasajeros que compran por primera vez"
              loading={isInitialLoading}
              accent="emerald"
            />
            <StatCard
              title="Pasajeros recurrentes"
              value={formatInteger(returningClientReservations)}
              subtitle="Reservas de pasajeros que ya habían viajado"
              loading={isInitialLoading}
              accent="amber"
            />
          </div>

          {/* Chips de monedas */}
          {currencyCodes.length > 0 && (
            <div className="mt-4">
              <h2 className="text-xs font-medium uppercase tracking-wide text-slate-600 dark:text-slate-400">
                Volumen por moneda (referencia)
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Totales brutos de referencia por moneda. No es un módulo
                administrativo, sólo un paneo comercial.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {currencyCodes.map((code) => (
                  <div
                    key={code}
                    className="rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 text-xs text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-200"
                  >
                    <span className="font-semibold">{code}</span>{" "}
                    <span className="ml-1">
                      {formatCurrencySimple(totalsByCurrency[code], code)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Bloque de desglose detallado */}
        <section className="space-y-3 rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-lg shadow-slate-900/10 backdrop-blur-sm dark:border-slate-800/70 dark:bg-slate-950/60 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="max-w-xl">
              <h2 className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Desglose detallado
              </h2>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Cambiá de eje para ver los mismos números desde destinos, meses
                o pasajeros top. Las columnas de ticket muestran el promedio por
                reserva en cada moneda.
              </p>
            </div>

            <div className="flex flex-col items-end gap-2 text-right">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDimension("destination")}
                  className={`rounded-full border px-3 py-1 text-xs font-medium backdrop-blur-sm ${
                    dimension === "destination"
                      ? "border-emerald-400 bg-white/30 text-slate-900 shadow-sm dark:border-emerald-500 dark:bg-slate-900/50 dark:text-slate-50"
                      : "border-slate-300 bg-white/10 text-slate-700 hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-200 dark:hover:border-emerald-400 dark:hover:text-emerald-300"
                  }`}
                >
                  Destinos
                </button>
                <button
                  type="button"
                  onClick={() => setDimension("period")}
                  className={`rounded-full border px-3 py-1 text-xs font-medium backdrop-blur-sm ${
                    dimension === "period"
                      ? "border-emerald-400 bg-white/30 text-slate-900 shadow-sm dark:border-emerald-500 dark:bg-slate-900/50 dark:text-slate-50"
                      : "border-slate-300 bg-white/10 text-slate-700 hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-200 dark:hover:border-emerald-400 dark:hover:text-emerald-300"
                  }`}
                >
                  Meses
                </button>
                <button
                  type="button"
                  onClick={() => setDimension("clients")}
                  className={`rounded-full border px-3 py-1 text-xs font-medium backdrop-blur-sm ${
                    dimension === "clients"
                      ? "border-emerald-400 bg-white/30 text-slate-900 shadow-sm dark:border-emerald-500 dark:bg-slate-900/50 dark:text-slate-50"
                      : "border-slate-300 bg-white/10 text-slate-700 hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-200 dark:hover:border-emerald-400 dark:hover:text-emerald-300"
                  }`}
                >
                  Pasajeros top
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1 text-[11px]">
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                  {getDimensionChipLabel(dimension, dimensionSummary.rowCount)}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  {formatInteger(dimensionSummary.reservations)} reservas
                </span>
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                  {formatInteger(dimensionSummary.passengers)} pasajeros
                </span>
              </div>
            </div>
          </div>

          <div className="relative max-h-[520px] overflow-auto rounded-2xl border border-slate-200 bg-white/90 dark:border-slate-800 dark:bg-slate-950/80">
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-sm dark:bg-slate-950/70">
                <Spinner />
              </div>
            )}

            {!hasData && !loading && (
              <div className="flex h-40 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                Por ahora no hay datos para el rango seleccionado. Probá
                ampliando el período o volvé cuando haya más reservas cargadas.
              </div>
            )}

            {hasData && (
              <table className="min-w-full text-left text-xs text-slate-700 dark:text-slate-200">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-[11px] uppercase tracking-wide text-slate-500 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2 text-right">#</th>

                    {dimension === "destination" && (
                      <>
                        <th className="px-3 py-2">Destino</th>
                        <th className="px-3 py-2">País</th>
                      </>
                    )}
                    {dimension === "period" && (
                      <th className="px-3 py-2">Mes</th>
                    )}
                    {dimension === "clients" && (
                      <>
                        <th className="px-3 py-2">Pax</th>
                        <th className="px-3 py-2">Última reserva</th>
                      </>
                    )}

                    <th className="px-3 py-2 text-right">Reservas</th>
                    <th className="px-3 py-2 text-right">Pasajeros</th>

                    {currencyCodes.map((code) => (
                      <th
                        key={`total-${code}`}
                        className="px-3 py-2 text-right"
                        title={`Volumen total en ${code}`}
                      >
                        Total {code}
                      </th>
                    ))}
                    {currencyCodes.map((code) => (
                      <th
                        key={`avg-${code}`}
                        className="px-3 py-2 text-right"
                        title={`Ticket promedio por reserva en ${code}`}
                      >
                        Ticket prom. {code}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {normalizedRows.map((row, index) => {
                    const avgPerCurrency: InsightsMoneyPerCurrency = {};
                    for (const code of currencyCodes) {
                      const total = row.totals[code] ?? 0;
                      avgPerCurrency[code] =
                        row.reservations > 0 ? total / row.reservations : 0;
                    }

                    return (
                      <tr
                        key={`${dimension}-${index}`}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-900/60"
                      >
                        <td className="px-3 py-2 text-right text-slate-400 dark:text-slate-500">
                          {index + 1}
                        </td>

                        {dimension === "destination" && (
                          <>
                            <td className="px-3 py-2">{row.label1}</td>
                            <td className="px-3 py-2">{row.label2 || "-"}</td>
                          </>
                        )}
                        {dimension === "period" && (
                          <td className="px-3 py-2">{row.label1}</td>
                        )}
                        {dimension === "clients" && (
                          <>
                            <td className="px-3 py-2">{row.label1}</td>
                            <td className="px-3 py-2">
                              {row.lastBooking
                                ? formatDateHuman(row.lastBooking)
                                : "-"}
                            </td>
                          </>
                        )}

                        {/* Comunes */}
                        <td className="px-3 py-2 text-right">
                          {formatInteger(row.reservations)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {formatInteger(row.passengers)}
                        </td>

                        {/* Totales por moneda */}
                        {currencyCodes.map((code) => {
                          const total = row.totals[code] ?? 0;
                          return (
                            <td
                              key={`total-${code}-${index}`}
                              className="px-3 py-2 text-right"
                            >
                              {total > 0
                                ? formatCurrencySimple(total, code)
                                : "-"}
                            </td>
                          );
                        })}

                        {/* Ticket promedio por moneda */}
                        {currencyCodes.map((code) => {
                          const avg = avgPerCurrency[code] ?? 0;
                          return (
                            <td
                              key={`avg-${code}-${index}`}
                              className="px-3 py-2 text-right text-slate-600 dark:text-slate-300"
                            >
                              {avg > 0 ? formatCurrencySimple(avg, code) : "-"}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <ToastContainer position="bottom-right" theme="dark" />
      </div>
    </ProtectedRoute>
  );
}
