// src/components/services/SummaryCard.tsx
"use client";
import React, { useMemo } from "react";

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
}

/* ---------- UI helpers (mismos tonos/estética) ---------- */
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <section className="rounded-2xl border border-white/10 bg-white/10 p-3 shadow-sm shadow-sky-950/10">
    <h4 className="mb-2 text-sm font-semibold tracking-tight">{title}</h4>
    <dl className="divide-y divide-white/10">{children}</dl>
  </section>
);

const Row: React.FC<{
  label: string;
  value: string;
}> = ({ label, value }) => (
  <div className="grid grid-cols-2 items-center gap-2 py-2">
    <dt className="text-sm opacity-80">{label}</dt>
    <dd className="text-right font-medium tabular-nums">{value}</dd>
  </div>
);

const Chip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="rounded-full border border-white/10 bg-white/20 px-2.5 py-1 text-xs font-medium text-sky-950 dark:bg-white/10 dark:text-white">
    {children}
  </span>
);

/* ------------------------------------------------------- */

export default function SummaryCard({
  totalsByCurrency,
  fmtCurrency,
}: SummaryCardProps) {
  const labels: Record<string, string> = { ARS: "Pesos", USD: "Dólares" };

  const currencies = useMemo(
    () => Object.keys(totalsByCurrency),
    [totalsByCurrency],
  );
  const colsClass =
    currencies.length === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2";

  return (
    <div
      className={`mb-6 space-y-3 rounded-3xl ${currencies.length > 1 ? "border border-white/10 bg-white/10 p-6" : ""} text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white`}
    >
      <div className={`grid ${colsClass} gap-6`}>
        {currencies.map((currency) => {
          const t = totalsByCurrency[currency];

          // Intereses de tarjeta: prioriza desglose (sin IVA + IVA); si no existe, usa bruto
          const cardSplit =
            (t.taxableCardInterest ?? 0) + (t.vatOnCardInterest ?? 0);
          const cardTotal =
            cardSplit > 0 ? cardSplit : (t.cardInterestRaw ?? 0);

          const venta = fmtCurrency(t.sale_price, currency);
          const costo = fmtCurrency(t.cost_price, currency);
          const margen = fmtCurrency(t.sale_price - t.cost_price, currency);
          const feeTransfer = fmtCurrency(t.transferFeesAmount, currency);
          const totalComisionNeta = fmtCurrency(
            t.totalCommissionWithoutVAT - t.transferFeesAmount,
            currency,
          );

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
                <div className="flex w-full justify-end gap-2">
                  <div className="flex w-3/4 flex-wrap items-center justify-end gap-2">
                    <Chip>Venta: {venta}</Chip>
                    <Chip>Costo: {costo}</Chip>
                    <Chip>Margen: {margen}</Chip>
                    <Chip>Fees transf.: {feeTransfer}</Chip>
                  </div>
                </div>
              </header>

              {/* Body */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Impuestos */}
                <Section title="Impuestos">
                  <Row
                    label="IVA 21%"
                    value={fmtCurrency(t.tax_21, currency)}
                  />
                  <Row
                    label="IVA 10,5%"
                    value={fmtCurrency(t.tax_105, currency)}
                  />
                  <Row label="Exento" value={fmtCurrency(t.exempt, currency)} />
                  <Row
                    label="Otros"
                    value={fmtCurrency(t.other_taxes, currency)}
                  />
                </Section>

                {/* Base imponible */}
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

                {/* Tarjeta (solo si hay algo) */}
                {cardTotal > 0 && (
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

                {/* IVA comisiones */}
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
              </div>

              {/* Footer */}
              <footer className="mt-4 rounded-2xl border border-white/10 bg-white/20 p-3">
                <p className="text-sm opacity-70">
                  Total Comisión (sin IVA) – neta de costos por transferencia
                </p>
                <p className="text-lg font-semibold tabular-nums">
                  {totalComisionNeta}
                </p>
              </footer>
            </section>
          );
        })}
      </div>
    </div>
  );
}
