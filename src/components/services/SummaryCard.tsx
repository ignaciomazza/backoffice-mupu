// src/components/services/SummaryCard.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Service, Receipt } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import Spinner from "@/components/Spinner";

/* ===== Tipos ===== */
interface Totals {
  sale_price: number;
  cost_price: number;
  tax_21: number;
  tax_105: number;
  exempt: number;
  other_taxes: number;
  taxableCardInterest: number;
  vatOnCardInterest: number;
  nonComputable: number;
  taxableBase21: number;
  taxableBase10_5: number;
  vatOnCommission21: number;
  vatOnCommission10_5: number;
  totalCommissionWithoutVAT: number;
  /** Fallback cuando no viene el desglose de intereses (sin IVA / IVA) */
  cardInterestRaw?: number;
  transferFeesAmount: number;
}

interface SummaryCardProps {
  totalsByCurrency: Record<string, Totals>;
  fmtCurrency?: (value: number, currency: string) => string; // ahora opcional

  /** Datos crudos para calcular deuda y comisión */
  services: Service[];
  receipts: Receipt[];
}

/** Campos adicionales que pueden venir en Service */
type ServiceWithCalcs = Service &
  Partial<{
    taxableCardInterest: number;
    vatOnCardInterest: number;
    card_interest: number;
    totalCommissionWithoutVAT: number;
    currency: "ARS" | "USD" | string;
    sale_price: number;
    booking: {
      id_booking: number;
      creation_date: string | Date;
      user?: { id_user: number; first_name: string; last_name: string };
    };
  }>;

/** Extensión segura de Receipt con campos de conversión opcionales */
type ReceiptWithConversion = Receipt &
  Partial<{
    base_amount: number | string | null;
    base_currency: string | null;
    counter_amount: number | string | null;
    counter_currency: string | null;
    amount: number | string | null;
    amount_currency: string | null;
    payment_fee_amount: number | string | null;
    payment_fee_currency: string | null;
  }>;

/** Config API */
type CalcConfigResponse = {
  billing_breakdown_mode: "auto" | "manual";
  /** Proporción: 0.024 = 2.4% */
  transfer_fee_pct: number;
};

type EarningsByBookingResponse = {
  ownerPct: number;
  commissionBaseByCurrency: Record<string, number>;
  sellerEarningsByCurrency: Record<string, number>;
};

/* ---------- UI helpers ---------- */
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <section className="rounded-2xl border border-white/5 bg-white/5 p-3 shadow-sm shadow-sky-950/10">
    <h4 className="mb-2 text-sm font-semibold tracking-tight">{title}</h4>
    <dl className="divide-y divide-white/10">{children}</dl>
  </section>
);

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="grid grid-cols-2 items-center gap-2 py-2">
    <dt className="text-sm opacity-80">{label}</dt>
    <dd className="text-right font-medium tabular-nums">{value}</dd>
  </div>
);

const Chip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-100 px-2.5 py-1 text-sm font-medium text-sky-900 dark:border-sky-800/40 dark:bg-sky-900/30 dark:text-sky-100">
    {children}
  </span>
);

/* ---------- helpers de datos ---------- */
const toNum = (v: number | string | null | undefined) => {
  const n =
    typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
};

// Busca un bookingId válido recorriendo los services.
function pickBookingId(svcs: ServiceWithCalcs[]): number | undefined {
  for (const s of svcs) {
    const bid = s.booking?.id_booking;
    if (Number.isFinite(bid as number) && (bid as number) > 0)
      return bid as number;
  }
  return undefined;
}

const upperKeys = (obj: Record<string, number>) =>
  Object.fromEntries(
    Object.entries(obj || {}).map(([k, v]) => [String(k).toUpperCase(), v]),
  );

/* ---------- helpers de moneda ---------- */
function isValidCurrencyCode(code: string): boolean {
  const c = (code || "").trim().toUpperCase();
  if (!c) return false;
  try {
    new Intl.NumberFormat("es-AR", { style: "currency", currency: c }).format(
      1,
    );
    return true;
  } catch {
    return false;
  }
}

/** Normaliza cosas como U$D, US$, AR$, etc. y devuelve ISO 4217 si es posible. */
function normalizeCurrencyCode(raw: string): string {
  const s = (raw || "").trim().toUpperCase();
  if (!s) return "ARS";
  const maps: Record<string, string> = {
    U$D: "USD",
    U$S: "USD",
    US$: "USD",
    USD$: "USD",
    AR$: "ARS",
    $: "ARS",
  };
  if (maps[s]) return maps[s];
  const m = s.match(/[A-Z]{3}/);
  const code = m ? m[0] : s;
  return isValidCurrencyCode(code) ? code : "ARS";
}

function formatCurrencySafe(value: number, currency: string): string {
  const cur = normalizeCurrencyCode(currency);
  const v = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: cur,
    }).format(v);
  } catch {
    return `${v.toFixed(2)} ${cur}`;
  }
}

/* ------------------------------------------------------- */

export default function SummaryCard({
  totalsByCurrency,
  fmtCurrency,
  services,
  receipts,
}: SummaryCardProps) {
  const labels: Record<string, string> = {
    ARS: "Pesos",
    USD: "Dólares",
    UYU: "Pesos uruguayos",
  };
  const { token } = useAuth();

  /* ====== Config de cálculo y costos bancarios + earnings ====== */
  const [agencyMode, setAgencyMode] = useState<"auto" | "manual">("auto");
  const [transferPct, setTransferPct] = useState<number>(0.024); // fallback 2.4%
  const [ownerPct, setOwnerPct] = useState<number>(100);
  const [apiCommissionBaseByCurrency, setApiCommissionBaseByCurrency] =
    useState<Record<string, number>>({});
  const [apiSellerEarningsByCurrency, setApiSellerEarningsByCurrency] =
    useState<Record<string, number>>({});
  const [loadingCalc, setLoadingCalc] = useState(false);

  const bookingId = useMemo(
    () => pickBookingId(services as ServiceWithCalcs[]),
    [services],
  );

  // Pipeline SECUENCIAL: (1) service-calc-config -> (2) earnings/by-booking
  const pipelineRef = useRef<{ ac: AbortController; id: number } | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pipelineRef.current) pipelineRef.current.ac.abort();
    };
  }, []);

  useEffect(() => {
    // Si no hay token, reseteamos y no mostramos cálculos (se verá loading)
    if (!token) {
      setAgencyMode("auto");
      setTransferPct(0.024);
      setOwnerPct(100);
      setApiCommissionBaseByCurrency({});
      setApiSellerEarningsByCurrency({});
      setLoadingCalc(true);
      return;
    }

    // Cancelar pipeline previo
    if (pipelineRef.current) pipelineRef.current.ac.abort();

    const ac = new AbortController();
    const id = Date.now();
    pipelineRef.current = { ac, id };

    const isActive = () =>
      mountedRef.current &&
      pipelineRef.current?.id === id &&
      !pipelineRef.current.ac.signal.aborted;

    setLoadingCalc(true);

    (async () => {
      // (1) Leer config de cálculo
      try {
        const r = await authFetch(
          "/api/service-calc-config",
          { cache: "no-store", signal: ac.signal },
          token,
        );
        if (!r.ok) throw new Error("fetch failed");
        const data: CalcConfigResponse = await r.json();
        if (isActive()) {
          setAgencyMode(
            data.billing_breakdown_mode === "manual" ? "manual" : "auto",
          );
          const pct = Number(data.transfer_fee_pct);
          setTransferPct(Number.isFinite(pct) ? pct : 0.024);
        }
      } catch {
        if (isActive()) {
          setAgencyMode("auto");
          setTransferPct(0.024);
        }
      }

      // (2) Earnings por booking (si hay bookingId)
      if (!isActive()) return;
      if (!bookingId) {
        if (isActive()) {
          setOwnerPct(100);
          setApiCommissionBaseByCurrency({});
          setApiSellerEarningsByCurrency({});
          setLoadingCalc(false);
        }
        return;
      }

      try {
        const r = await authFetch(
          `/api/earnings/by-booking?bookingId=${bookingId}`,
          { cache: "no-store", signal: ac.signal },
          token,
        );
        if (!r.ok) throw new Error("fetch failed");
        const json: EarningsByBookingResponse = await r.json();
        if (isActive()) {
          setOwnerPct(Number.isFinite(json.ownerPct) ? json.ownerPct : 100);
          setApiCommissionBaseByCurrency(
            upperKeys(json.commissionBaseByCurrency || {}),
          );
          setApiSellerEarningsByCurrency(
            upperKeys(json.sellerEarningsByCurrency || {}),
          );
        }
      } catch {
        if (isActive()) {
          setOwnerPct(100);
          setApiCommissionBaseByCurrency({});
          setApiSellerEarningsByCurrency({});
        }
      } finally {
        if (isActive()) setLoadingCalc(false);
      }
    })();

    return () => ac.abort();
  }, [token, bookingId]);

  const manualMode = agencyMode === "manual";

  /** Normaliza totales por moneda (clave) para evitar códigos no-ISO. */
  const totalsNorm = useMemo(() => {
    const acc: Record<string, Totals> = {};
    for (const [k, v] of Object.entries(totalsByCurrency || {})) {
      const code = normalizeCurrencyCode(k);
      acc[code] = v;
    }
    return acc;
  }, [totalsByCurrency]);

  /** Venta con interés por moneda (sale_price + interés). */
  const salesWithInterestByCurrency = useMemo(() => {
    return services.reduce<Record<string, number>>((acc, raw) => {
      const s = raw as ServiceWithCalcs;
      const cur = normalizeCurrencyCode(s.currency || "ARS");
      const sale = toNum(s.sale_price);
      const splitNoVAT = toNum(s.taxableCardInterest);
      const splitVAT = toNum(s.vatOnCardInterest);
      const split = splitNoVAT + splitVAT;
      const interest = split > 0 ? split : toNum(s.card_interest);
      acc[cur] = (acc[cur] || 0) + sale + interest;
      return acc;
    }, {});
  }, [services]);

  /** Pagos por moneda (considerando también payment_fee_amount). */
  const paidByCurrency = useMemo(() => {
    return receipts.reduce<Record<string, number>>((acc, raw) => {
      const r = raw as ReceiptWithConversion;

      const baseCur = r.base_currency
        ? normalizeCurrencyCode(String(r.base_currency))
        : null;
      const baseVal = toNum(r.base_amount ?? 0);

      const amountCur = r.amount_currency
        ? normalizeCurrencyCode(String(r.amount_currency))
        : null;

      // Si no viene moneda del fee, asumimos que es la misma que la del pago
      const feeCurRaw = r.payment_fee_currency;
      const feeCur =
        feeCurRaw && String(feeCurRaw).trim() !== ""
          ? normalizeCurrencyCode(String(feeCurRaw))
          : (amountCur ?? baseCur);

      const amountVal = toNum(r.amount ?? 0);
      const feeVal = toNum(r.payment_fee_amount ?? 0);

      if (baseCur) {
        const cur = baseCur;
        const val = baseVal + (feeCur === cur ? feeVal : 0);
        if (val) acc[cur] = (acc[cur] || 0) + val;
      } else if (amountCur) {
        const cur = amountCur;
        const val = amountVal + (feeCur === cur ? feeVal : 0);
        if (val) acc[cur] = (acc[cur] || 0) + val;
      } else if (feeCur) {
        // Caso borde: solo fee con moneda conocida
        const cur = feeCur;
        const val = feeVal;
        if (val) acc[cur] = (acc[cur] || 0) + val;
      }

      return acc;
    }, {});
  }, [receipts]);

  /** Unión de monedas presentes. */
  const currencies = useMemo(() => {
    const a = new Set<string>(Object.keys(totalsNorm));
    Object.keys(salesWithInterestByCurrency).forEach((c) => a.add(c));
    Object.keys(paidByCurrency).forEach((c) => a.add(c));
    return Array.from(a);
  }, [totalsNorm, salesWithInterestByCurrency, paidByCurrency]);

  /** ====== cálculo local de comisión base por moneda (fallback) ======
   * commissionBase = max(totalCommissionWithoutVAT - sale_price*transferPct, 0)
   */
  const localCommissionBaseByCurrency = useMemo(() => {
    return services.reduce<Record<string, number>>((acc, raw) => {
      const s = raw as ServiceWithCalcs;
      const cur = normalizeCurrencyCode(s.currency || "ARS");
      const sale = toNum(s.sale_price);
      const dbCommission = toNum(s.totalCommissionWithoutVAT);
      const fee = sale * (Number.isFinite(transferPct) ? transferPct : 0.024);
      const base = Math.max(dbCommission - fee, 0);
      acc[cur] = (acc[cur] || 0) + base;
      return acc;
    }, {});
  }, [services, transferPct]);

  /** ====== Derivados para UI ====== */
  const commissionBaseFor = (cur: string) =>
    apiCommissionBaseByCurrency[cur] ?? localCommissionBaseByCurrency[cur] ?? 0;

  const sellerEarningFor = (cur: string) => {
    if (apiSellerEarningsByCurrency[cur] != null)
      return apiSellerEarningsByCurrency[cur];
    const base = commissionBaseFor(cur);
    return base * ((ownerPct || 0) / 100);
  };

  const colsClass =
    currencies.length === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2";

  // Formateador efectivo (usa prop si existe; si no, el interno seguro)
  const fmt = (value: number, currency: string) =>
    fmtCurrency
      ? fmtCurrency(value, normalizeCurrencyCode(currency))
      : formatCurrencySafe(value, currency);

  // ⛔ Mientras esté cargando la config / earnings, no mostramos el resumen
  if (loadingCalc || !token) {
    return (
      <div className="mb-6 flex justify-center">
        <div className="flex w-full items-center justify-center gap-3 rounded-3xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white">
          <div>
            <Spinner />
          </div>
          <span>
            Calculando impuestos, costos bancarios y ganancias…
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`mb-6 space-y-3 rounded-3xl ${
        currencies.length > 1 ? "border border-white/10 bg-white/10 p-6" : ""
      } text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white`}
    >
      <div className={`grid ${colsClass} gap-6`}>
        {currencies.map((currency) => {
          const code = normalizeCurrencyCode(currency);
          const t: Totals & { cardInterestRaw?: number } = totalsNorm[code] || {
            sale_price: 0,
            cost_price: 0,
            tax_21: 0,
            tax_105: 0,
            exempt: 0,
            other_taxes: 0,
            taxableCardInterest: 0,
            vatOnCardInterest: 0,
            nonComputable: 0,
            taxableBase21: 0,
            taxableBase10_5: 0,
            vatOnCommission21: 0,
            vatOnCommission10_5: 0,
            totalCommissionWithoutVAT: 0,
            transferFeesAmount: 0,
            cardInterestRaw: 0,
          };

          // Intereses de tarjeta (presentación)
          const cardSplit =
            (t.taxableCardInterest ?? 0) + (t.vatOnCardInterest ?? 0);
          const cardTotal =
            cardSplit > 0 ? cardSplit : (t.cardInterestRaw ?? 0);

          const venta = fmt(t.sale_price, code);
          const costo = fmt(t.cost_price, code);
          const margen = fmt(t.sale_price - t.cost_price, code);
          const feeTransfer = fmt(t.transferFeesAmount, code);

          // Chip de "Impuestos": en AUTO = IVA calculado; en MANUAL = other_taxes
          const chipImpuestos = manualMode
            ? fmt(t.other_taxes || 0, code)
            : fmt(
                t.sale_price - t.cost_price - t.totalCommissionWithoutVAT,
                code,
              );

          // Deuda por moneda
          const salesWI = salesWithInterestByCurrency[code] || 0;
          const paid = paidByCurrency[code] || 0;
          const ventaParaDeuda = manualMode ? t.sale_price : salesWI;
          const debt = ventaParaDeuda - paid;

          // Comisión base + ganancia del vendedor (preferimos API, sino fallback)
          const myEarning = sellerEarningFor(code);

          return (
            <section
              key={code}
              className="rounded-3xl border border-white/10 bg-white/10 p-4 shadow-sm shadow-sky-950/10"
            >
              {/* Header */}
              <header className="mb-4 flex flex-col gap-2 px-2">
                <h3 className="text-xl font-semibold">
                  {labels[code] || code}
                </h3>
                <div className="flex w-full flex-wrap items-center justify-end gap-2 pl-20">
                  <Chip>Venta: {venta}</Chip>
                  <Chip>Costo: {costo}</Chip>
                  <Chip>Ganancia: {margen}</Chip>
                  <Chip>
                    {manualMode ? "Impuestos" : "Impuestos (IVA)"}:{" "}
                    {chipImpuestos}
                  </Chip>
                  <Chip>Costo transf.: {feeTransfer}</Chip>
                </div>
              </header>

              {/* Body */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Impuestos */}
                <Section title="Impuestos">
                  {manualMode ? (
                    <Row
                      label="Impuestos"
                      value={fmt(t.other_taxes || 0, code)}
                    />
                  ) : (
                    <>
                      <Row label="IVA 21%" value={fmt(t.tax_21, code)} />
                      <Row label="IVA 10,5%" value={fmt(t.tax_105, code)} />
                      <Row label="Exento" value={fmt(t.exempt, code)} />
                      <Row label="Otros" value={fmt(t.other_taxes, code)} />
                    </>
                  )}
                </Section>

                {/* Base imponible (solo AUTO) */}
                {!manualMode && (
                  <Section title="Base imponible">
                    <Row
                      label="No computable"
                      value={fmt(t.nonComputable, code)}
                    />
                    <Row
                      label="Gravado 21%"
                      value={fmt(t.taxableBase21, code)}
                    />
                    <Row
                      label="Gravado 10,5%"
                      value={fmt(t.taxableBase10_5, code)}
                    />
                  </Section>
                )}

                {/* Tarjeta (solo AUTO y si hay valores) */}
                {!manualMode && cardTotal > 0 && (
                  <Section title="Tarjeta">
                    <Row
                      label="Intereses (total)"
                      value={fmt(cardTotal, code)}
                    />
                    <Row
                      label="Intereses sin IVA"
                      value={fmt(t.taxableCardInterest || 0, code)}
                    />
                    <Row
                      label="IVA intereses"
                      value={fmt(t.vatOnCardInterest || 0, code)}
                    />
                  </Section>
                )}

                {/* IVA comisiones (solo AUTO) */}
                {!manualMode && (
                  <Section title="IVA sobre comisiones">
                    <Row
                      label="IVA 21%"
                      value={fmt(t.vatOnCommission21, code)}
                    />
                    <Row
                      label="IVA 10,5%"
                      value={fmt(t.vatOnCommission10_5, code)}
                    />
                  </Section>
                )}

                {/* Deuda */}
                <Section title="Deuda del cliente">
                  <Row
                    label={manualMode ? "Venta" : "Venta c/ interés"}
                    value={fmt(ventaParaDeuda, code)}
                  />
                  <Row label="Pagos aplicados" value={fmt(paid, code)} />
                  <Row label="Deuda" value={fmt(debt, code)} />
                </Section>
              </div>

              {/* Footer */}
              <footer className="mt-4 flex justify-between rounded-2xl border border-white/5 bg-white/10 p-3">
                <div>
                  <p className="text-sm opacity-70">
                    Total Comisión (Sin Impuestos / Costos bancarios)
                  </p>
                  <p className="text-lg font-semibold tabular-nums">
                    {fmt(
                      t.totalCommissionWithoutVAT - t.transferFeesAmount,
                      code,
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-sm opacity-70">
                    Ganancia del vendedor {`(${(ownerPct ?? 100).toFixed(0)}%)`}
                  </p>
                  <p className="text-end text-lg font-semibold tabular-nums">
                    {fmt(myEarning, code)}
                  </p>
                </div>
              </footer>
            </section>
          );
        })}
      </div>
    </div>
  );
}
