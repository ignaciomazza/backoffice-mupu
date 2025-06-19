// src/components/services/SummaryCard.tsx
"use client";
import React from "react";

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
}

interface SummaryCardProps {
  totalsByCurrency: Record<string, Totals>;
  fmtCurrency: (value: number, currency: string) => string;
}

export default function SummaryCard({
  totalsByCurrency,
  fmtCurrency,
}: SummaryCardProps) {
  const labels: Record<string, string> = {
    ARS: "Pesos",
    USD: "Dólares",
  };

  const currencies = Object.keys(totalsByCurrency);
  const colsClass =
    currencies.length === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2";

  return (
    <div className="mb-6 space-y-3 rounded-3xl border border-white/10 bg-white/10 p-6 text-black shadow-md backdrop-blur dark:text-white">
      <h2 className="mb-6 text-center text-2xl font-semibold sm:text-3xl">
        Resumen
      </h2>

      <div className={`grid ${colsClass} gap-6`}>
        {currencies.map((currency) => {
          const t = totalsByCurrency[currency];
          return (
            <section
              key={currency}
              className="flex h-full flex-col bg-transparent"
            >
              <h3 className="mb-4 text-center text-xl font-medium sm:text-2xl">
                {labels[currency] || currency}
              </h3>

              <div className="grid grow grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2">
                {/* Venta / Costo */}
                <div className="mx-auto w-full max-w-md">
                  <p className="font-semibold">Venta</p>
                  <p className="font-light">
                    {fmtCurrency(t.sale_price, currency)}
                  </p>
                  <p className="mt-2 font-semibold">Costo</p>
                  <p className="font-light">
                    {fmtCurrency(t.cost_price, currency)}
                  </p>
                </div>

                {/* Impuestos */}
                <div className="mx-auto w-full max-w-md">
                  <p className="font-semibold">Impuestos</p>
                  <ul className="ml-4 list-disc font-light">
                    <li>21%: {fmtCurrency(t.tax_21, currency)}</li>
                    <li>10,5%: {fmtCurrency(t.tax_105, currency)}</li>
                    <li>Exento: {fmtCurrency(t.exempt, currency)}</li>
                    <li>Otros: {fmtCurrency(t.other_taxes, currency)}</li>
                  </ul>
                </div>

                {/* Intereses Tarjeta (si aplica) */}
                {(t.taxableCardInterest || t.vatOnCardInterest) > 0 && (
                  <div className="mx-auto w-full max-w-md">
                    <p className="font-semibold">Tarjeta</p>
                    <ul className="ml-4 list-disc font-light">
                      <li>
                        Intereses:{" "}
                        {fmtCurrency(
                          t.taxableCardInterest + t.vatOnCardInterest,
                          currency,
                        )}
                      </li>
                      <li>
                        Intereses sin IVA:{" "}
                        {fmtCurrency(t.taxableCardInterest, currency)}
                      </li>
                      <li>IVA: {fmtCurrency(t.vatOnCardInterest, currency)}</li>
                    </ul>
                  </div>
                )}

                {/* Base Imponible */}
                <div className="mx-auto w-full max-w-md">
                  <p className="font-semibold">Base Imponible</p>
                  <ul className="ml-4 list-disc font-light">
                    <li>
                      No computable: {fmtCurrency(t.nonComputable, currency)}
                    </li>
                    <li>Grav.21%: {fmtCurrency(t.taxableBase21, currency)}</li>
                    <li>
                      Grav.10,5%: {fmtCurrency(t.taxableBase10_5, currency)}
                    </li>
                  </ul>
                </div>

                {/* IVA Comisiones */}
                <div className="mx-auto w-full max-w-md">
                  <p className="font-semibold">IVA Comisiones</p>
                  <ul className="ml-4 list-disc font-light">
                    <li>21%: {fmtCurrency(t.vatOnCommission21, currency)}</li>
                    <li>
                      10,5%: {fmtCurrency(t.vatOnCommission10_5, currency)}
                    </li>
                  </ul>
                </div>

                <div className="mx-auto w-full max-w-md">
                  <p className="font-semibold">Costos por transaccion</p>
                  <ul className="ml-4 list-disc font-light">
                    <li>2.4%: {fmtCurrency(t.sale_price * 0.024, currency)}</li>
                  </ul>
                </div>
              </div>

              {/* Total Comisiones al final */}
              <div className="mt-6 border-t border-black/20 pt-4 dark:border-white/20">
                <p className="text-center font-semibold">
                  Total Comisiones (sin IVA)
                </p>
                <p className="mt-2 text-center font-light">
                  {fmtCurrency(
                    t.totalCommissionWithoutVAT - t.sale_price * 0.024,
                    currency,
                  )}
                </p>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
