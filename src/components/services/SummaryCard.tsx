// src/components/services/SummaryCard.tsx
"use client";
import React, { useEffect, useMemo, useState } from "react";
import type { Service, Receipt } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";

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
  fmtCurrency: (value: number, currency: string) => string;

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

/* ------------------------------------------------------- */

export default function SummaryCard({
  totalsByCurrency,
  fmtCurrency,
  services,
  receipts,
}: SummaryCardProps) {
  const labels: Record<string, string> = { ARS: "Pesos", USD: "Dólares" };
  const { token } = useAuth();

  /* ====== Config de cálculo y costo de transferencia ====== */
  const [agencyMode, setAgencyMode] = useState<"auto" | "manual">("auto");
  const [transferPct, setTransferPct] = useState<number>(0.024); // fallback 2.4%

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!token) {
        if (!cancelled) {
          setAgencyMode("auto");
          setTransferPct(0.024);
        }
        return;
      }
      try {
        const r = await authFetch(
          "/api/service-calc-config",
          { cache: "no-store" },
          token,
        );
        if (!r.ok) throw new Error("fetch failed");
        const data: CalcConfigResponse = await r.json();
        if (!cancelled) {
          setAgencyMode(
            data.billing_breakdown_mode === "manual" ? "manual" : "auto",
          );
          const pct = Number(data.transfer_fee_pct);
          setTransferPct(Number.isFinite(pct) ? pct : 0.024);
        }
      } catch {
        if (!cancelled) {
          setAgencyMode("auto");
          setTransferPct(0.024);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const manualMode = agencyMode === "manual";

  /** Venta con interés por moneda (sale_price + interés). */
  const salesWithInterestByCurrency = useMemo(() => {
    return services.reduce<Record<string, number>>((acc, raw) => {
      const s = raw as ServiceWithCalcs;
      const cur = (s.currency || "ARS").toUpperCase();
      const sale = toNum(s.sale_price);
      const splitNoVAT = toNum(s.taxableCardInterest);
      const splitVAT = toNum(s.vatOnCardInterest);
      const split = splitNoVAT + splitVAT;
      const interest = split > 0 ? split : toNum(s.card_interest);
      acc[cur] = (acc[cur] || 0) + sale + interest;
      return acc;
    }, {});
  }, [services]);

  /** Pagos por moneda (prioriza contravalor cuando existe). */
  const paidByCurrency = useMemo(() => {
    return receipts.reduce<Record<string, number>>((acc, raw) => {
      const r = raw as ReceiptWithConversion;

      const hasCounter =
        !!r.counter_currency &&
        r.counter_amount !== null &&
        r.counter_amount !== undefined;

      if (hasCounter) {
        const cur = String(r.counter_currency).toUpperCase();
        const val = toNum(r.counter_amount ?? 0);
        acc[cur] = (acc[cur] || 0) + val;
      } else if (r.amount_currency) {
        const cur = String(r.amount_currency).toUpperCase();
        const val = toNum(r.amount ?? 0);
        acc[cur] = (acc[cur] || 0) + val;
      }
      return acc;
    }, {});
  }, [receipts]);

  /** Unión de monedas presentes. */
  const currencies = useMemo(() => {
    const a = new Set(Object.keys(totalsByCurrency));
    Object.keys(salesWithInterestByCurrency).forEach((c) => a.add(c));
    Object.keys(paidByCurrency).forEach((c) => a.add(c));
    return Array.from(a);
  }, [totalsByCurrency, salesWithInterestByCurrency, paidByCurrency]);

  /** ====== cálculo local de comisión base por moneda (fallback) ======
   * commissionBase = max(totalCommissionWithoutVAT - sale_price*transferPct, 0)
   * (alineado con /api/earnings y usando el transferPct de la config)
   */
  const localCommissionBaseByCurrency = useMemo(() => {
    return services.reduce<Record<string, number>>((acc, raw) => {
      const s = raw as ServiceWithCalcs;
      const cur = (s.currency || "ARS").toUpperCase();
      const sale = toNum(s.sale_price);
      const dbCommission = toNum(s.totalCommissionWithoutVAT);
      const fee = sale * (Number.isFinite(transferPct) ? transferPct : 0.024);
      const base = Math.max(dbCommission - fee, 0);
      acc[cur] = (acc[cur] || 0) + base;
      return acc;
    }, {});
  }, [services, transferPct]);

  /** ====== Traer % y earnings desde /api/earnings/by-booking ====== */
  const bookingId = useMemo(
    () => pickBookingId(services as ServiceWithCalcs[]),
    [services],
  );

  const [ownerPct, setOwnerPct] = useState<number>(100);
  const [apiCommissionBaseByCurrency, setApiCommissionBaseByCurrency] =
    useState<Record<string, number>>({});
  const [apiSellerEarningsByCurrency, setApiSellerEarningsByCurrency] =
    useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token || !bookingId) {
        if (!cancelled) {
          setOwnerPct(100);
          setApiCommissionBaseByCurrency({});
          setApiSellerEarningsByCurrency({});
        }
        return;
      }
      try {
        const r = await authFetch(
          `/api/earnings/by-booking?bookingId=${bookingId}`,
          { cache: "no-store" },
          token,
        );
        if (!r.ok) throw new Error("fetch failed");
        const json: EarningsByBookingResponse = await r.json();

        if (!cancelled) {
          setOwnerPct(Number.isFinite(json.ownerPct) ? json.ownerPct : 100);
          setApiCommissionBaseByCurrency(
            upperKeys(json.commissionBaseByCurrency || {}),
          );
          setApiSellerEarningsByCurrency(
            upperKeys(json.sellerEarningsByCurrency || {}),
          );
        }
      } catch {
        if (!cancelled) {
          setOwnerPct(100);
          setApiCommissionBaseByCurrency({});
          setApiSellerEarningsByCurrency({});
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token, bookingId]);

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

  return (
    <div
      className={`mb-6 space-y-3 rounded-3xl ${
        currencies.length > 1 ? "border border-white/10 bg-white/10 p-6" : ""
      } text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white`}
    >
      <div className={`grid ${colsClass} gap-6`}>
        {currencies.map((currency) => {
          const t = totalsByCurrency[currency] || {
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
          };

          // Intereses de tarjeta (presentación)
          const cardSplit =
            (t.taxableCardInterest ?? 0) + (t.vatOnCardInterest ?? 0);
          const cardTotal =
            cardSplit > 0 ? cardSplit : (t.cardInterestRaw ?? 0);

          const venta = fmtCurrency(t.sale_price, currency);
          const costo = fmtCurrency(t.cost_price, currency);
          const margen = fmtCurrency(t.sale_price - t.cost_price, currency);
          const feeTransfer = fmtCurrency(t.transferFeesAmount, currency);

          // Chip de "Impuestos": en AUTO = IVA calculado; en MANUAL = other_taxes
          const chipImpuestos = manualMode
            ? fmtCurrency(t.other_taxes || 0, currency)
            : fmtCurrency(
                t.sale_price - t.cost_price - t.totalCommissionWithoutVAT,
                currency,
              );

          // Deuda por moneda
          const salesWI = salesWithInterestByCurrency[currency] || 0;
          const paid = paidByCurrency[currency] || 0;
          const ventaParaDeuda = manualMode ? t.sale_price : salesWI;
          const debt = ventaParaDeuda - paid;

          // Comisión base + ganancia del vendedor (preferimos API, sino fallback)
          const myEarning = sellerEarningFor(currency);

          return (
            <section
              key={currency}
              className="rounded-3xl border border-white/10 bg-white/10 p-4 shadow-sm shadow-sky-950/10"
            >
              {/* Header */}
              <header className="mb-4 flex flex-col gap-2 px-2">
                <h3 className="text-xl font-semibold">
                  {labels[currency] || currency}
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
                      value={fmtCurrency(t.other_taxes || 0, currency)}
                    />
                  ) : (
                    <>
                      <Row
                        label="IVA 21%"
                        value={fmtCurrency(t.tax_21, currency)}
                      />
                      <Row
                        label="IVA 10,5%"
                        value={fmtCurrency(t.tax_105, currency)}
                      />
                      <Row
                        label="Exento"
                        value={fmtCurrency(t.exempt, currency)}
                      />
                      <Row
                        label="Otros"
                        value={fmtCurrency(t.other_taxes, currency)}
                      />
                    </>
                  )}
                </Section>

                {/* Base imponible (solo AUTO) */}
                {!manualMode && (
                  <Section title="Base imponible">
                    <Row
                      label="No computable"
                      value={fmtCurrency(t.nonComputable, currency)}
                    />
                    <Row
                      label="Gravado 21%"
                      value={fmtCurrency(t.taxableBase21, currency)}
                    />
                    <Row
                      label="Gravado 10,5%"
                      value={fmtCurrency(t.taxableBase10_5, currency)}
                    />
                  </Section>
                )}

                {/* Tarjeta (solo AUTO y si hay valores) */}
                {!manualMode && cardTotal > 0 && (
                  <Section title="Tarjeta">
                    <Row
                      label="Intereses (total)"
                      value={fmtCurrency(cardTotal, currency)}
                    />
                    <Row
                      label="Intereses sin IVA"
                      value={fmtCurrency(t.taxableCardInterest || 0, currency)}
                    />
                    <Row
                      label="IVA intereses"
                      value={fmtCurrency(t.vatOnCardInterest || 0, currency)}
                    />
                  </Section>
                )}

                {/* IVA comisiones (solo AUTO) */}
                {!manualMode && (
                  <Section title="IVA sobre comisiones">
                    <Row
                      label="IVA 21%"
                      value={fmtCurrency(t.vatOnCommission21, currency)}
                    />
                    <Row
                      label="IVA 10,5%"
                      value={fmtCurrency(t.vatOnCommission10_5, currency)}
                    />
                  </Section>
                )}

                {/* Deuda */}
                <Section title="Deuda del cliente">
                  <Row
                    label={manualMode ? "Venta" : "Venta c/ interés"}
                    value={fmtCurrency(ventaParaDeuda, currency)}
                  />
                  <Row
                    label="Pagos aplicados"
                    value={fmtCurrency(paid, currency)}
                  />
                  <Row label="Deuda" value={fmtCurrency(debt, currency)} />
                </Section>
              </div>

              {/* Footer */}
              <footer className="mt-4 flex justify-between rounded-2xl border border-white/5 bg-white/10 p-3">
                <div>
                  <p className="text-sm opacity-70">
                    Total Comisión (Sin Impuestos / Costos Transferencia)
                  </p>
                  <p className="text-lg font-semibold tabular-nums">
                    {fmtCurrency(
                      t.totalCommissionWithoutVAT - t.transferFeesAmount,
                      currency,
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-sm opacity-70">
                    Ganancia del vendedor {`(${(ownerPct ?? 100).toFixed(0)}%)`}
                  </p>
                  <p className="text-end text-lg font-semibold tabular-nums">
                    {fmtCurrency(myEarning, currency)}
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
