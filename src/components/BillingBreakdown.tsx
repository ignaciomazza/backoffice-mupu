// src/components/BillingBreakdown.tsx
"use client";

import { useEffect, useMemo, useRef } from "react";
import type { BillingData } from "@/types/index";

interface BillingBreakdownProps {
  importeVenta: number;
  costo: number;
  montoIva21: number;
  montoIva10_5: number;
  montoExento: number;
  otrosImpuestos: number;
  cardInterest: number;
  cardInterestIva: number;
  moneda?: string;
  onBillingUpdate?: (data: BillingData) => void;
  transferFeePct?: number;
}

// Helper de redondeo
const round = (value: number, decimals = 8) =>
  parseFloat(value.toFixed(decimals));

const sameBillingData = (a: BillingData | null, b: BillingData) => {
  if (!a) return false;
  return (
    a.nonComputable === b.nonComputable &&
    a.taxableBase21 === b.taxableBase21 &&
    a.taxableBase10_5 === b.taxableBase10_5 &&
    a.commissionExempt === b.commissionExempt &&
    a.commission21 === b.commission21 &&
    a.commission10_5 === b.commission10_5 &&
    a.vatOnCommission21 === b.vatOnCommission21 &&
    a.vatOnCommission10_5 === b.vatOnCommission10_5 &&
    a.totalCommissionWithoutVAT === b.totalCommissionWithoutVAT &&
    a.impIVA === b.impIVA &&
    a.taxableCardInterest === b.taxableCardInterest &&
    a.vatOnCardInterest === b.vatOnCardInterest &&
    a.transferFeeAmount === b.transferFeeAmount &&
    a.transferFeePct === b.transferFeePct
  );
};

export default function BillingBreakdown({
  importeVenta,
  costo,
  montoIva21,
  montoIva10_5,
  montoExento,
  otrosImpuestos,
  cardInterest,
  cardInterestIva,
  moneda = "ARS",
  onBillingUpdate,
  transferFeePct = 0.024,
}: BillingBreakdownProps) {
  const lastPayloadRef = useRef<BillingData | null>(null);
  const onBillingUpdateRef = useRef(onBillingUpdate);

  useEffect(() => {
    onBillingUpdateRef.current = onBillingUpdate;
  }, [onBillingUpdate]);

  /* ----------------- Cálculos (idénticos a tu versión) ----------------- */
  const baseNetoDesglose = round(
    costo - (montoIva21 + montoIva10_5) - otrosImpuestos,
  );
  const transferFee = round(importeVenta * transferFeePct, 2);
  const baseIva21 = montoIva21 > 0 ? round(montoIva21 / 0.21) : 0;
  const baseIva10_5 = montoIva10_5 > 0 ? round(montoIva10_5 / 0.105) : 0;
  const sumaBasesImponibles = round(baseIva21 + baseIva10_5);
  const hasError =
    importeVenta <= costo ||
    baseNetoDesglose < montoExento + sumaBasesImponibles;

  const nonComputable = hasError
    ? 0
    : round(
        Math.max(0, baseNetoDesglose - (montoExento + sumaBasesImponibles)),
      );
  const margen = round(importeVenta - costo);

  const porcentajeExento =
    baseNetoDesglose > 0 ? round(montoExento / baseNetoDesglose) : 0;
  let commissionExempt = 0,
    commission21 = 0,
    commission10_5 = 0,
    vatOnCommission21 = 0,
    vatOnCommission10_5 = 0,
    totalCommissionWithoutVAT = 0;

  const defaultIVA = 0.21;

  if (!hasError) {
    if (montoIva21 === 0 && montoIva10_5 === 0) {
      const F = round(
        porcentajeExento + (1 - porcentajeExento) * (1 + defaultIVA),
      );
      const netComm = round(margen / F);
      commissionExempt = round(netComm * porcentajeExento);
      const gravada = round(netComm - commissionExempt);
      commission21 = round(gravada);
      vatOnCommission21 = round(commission21 * defaultIVA);
      totalCommissionWithoutVAT = round(commissionExempt + commission21);
    } else {
      const costoGravable = round(baseNetoDesglose - montoExento);
      const remanente = round(
        Math.max(0, costoGravable - (baseIva21 + baseIva10_5)),
      );
      const eff21 = round(baseIva21 + remanente);
      const eff10_5 = round(baseIva10_5);
      const totalEff = round(eff21 + eff10_5);
      const w21 = totalEff > 0 ? round(eff21 / totalEff) : 0;
      const w10_5 = totalEff > 0 ? round(eff10_5 / totalEff) : 0;
      const F = round(
        porcentajeExento +
          (1 - porcentajeExento) * (w21 * (1 + 0.21) + w10_5 * (1 + 0.105)),
      );
      const netComm = round(margen / F);
      commissionExempt = round(netComm * porcentajeExento);
      const gravada = round(netComm - commissionExempt);
      commission21 = totalEff > 0 ? round((gravada * eff21) / totalEff) : 0;
      commission10_5 = totalEff > 0 ? round((gravada * eff10_5) / totalEff) : 0;
      vatOnCommission21 = round(commission21 * 0.21);
      vatOnCommission10_5 = round(commission10_5 * 0.105);
      totalCommissionWithoutVAT = round(
        commissionExempt + commission21 + commission10_5,
      );
    }
  }

  const taxableCardInterest =
    cardInterestIva > 0 ? round(cardInterestIva / 0.21) : 0;
  const vatOnCardInterest = round(cardInterestIva);

  const impIVA = round(
    montoIva21 +
      montoIva10_5 +
      vatOnCommission21 +
      vatOnCommission10_5 +
      vatOnCardInterest,
    2,
  );

  useEffect(() => {
    if (!onBillingUpdateRef.current || hasError) return;
    const payload: BillingData = {
      nonComputable,
      taxableBase21: baseIva21,
      taxableBase10_5: baseIva10_5,
      commissionExempt,
      commission21,
      commission10_5,
      vatOnCommission21,
      vatOnCommission10_5,
      totalCommissionWithoutVAT,
      impIVA,
      taxableCardInterest,
      vatOnCardInterest,
      transferFeeAmount: transferFee,
      transferFeePct: transferFeePct,
    };
    if (sameBillingData(lastPayloadRef.current, payload)) return;
    lastPayloadRef.current = payload;
    onBillingUpdateRef.current(payload);
  }, [
    nonComputable,
    baseIva21,
    baseIva10_5,
    commissionExempt,
    commission21,
    commission10_5,
    vatOnCommission21,
    vatOnCommission10_5,
    totalCommissionWithoutVAT,
    impIVA,
    taxableCardInterest,
    vatOnCardInterest,
    hasError,
    transferFee,
    transferFeePct,
  ]);

  /* ----------------- Presentación ----------------- */
  const fmt = useMemo(
    () =>
      new Intl.NumberFormat("es-AR", { style: "currency", currency: moneda }),
    [moneda],
  );
  const f = (v: number) => fmt.format(v);

  if (hasError) {
    return (
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/10 p-4 text-sky-950 shadow-sm shadow-sky-950/10 dark:text-white">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-rose-500/15 p-1.5 text-rose-600">
            {/* icono error */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
              />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-rose-600">
              Error en los importes de costo, IVA o exento.
            </p>
            <p className="mt-1 text-sm text-sky-950/70 dark:text-white/70">
              Verificá que <strong>Venta &gt; Costo</strong> y que las bases
              imponibles no superen el costo neto.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const kpiChip = (label: string, value: string) => (
    <div className="rounded-full border border-white/10 bg-white/30 px-3 py-1 text-xs font-medium dark:bg-white/10">
      <span className="opacity-70">{label}: </span>
      <span>{value}</span>
    </div>
  );

  const Row: React.FC<{ label: string; value: number }> = ({
    label,
    value,
  }) => (
    <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-3 py-2">
      <span className="text-sm">{label}</span>
      <span className="font-medium tabular-nums">{f(value)}</span>
    </div>
  );

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/10 p-4 text-sky-950 shadow-sm shadow-sky-950/10 dark:text-white">
      {/* Resumen superior */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {kpiChip("Venta", f(importeVenta))}
        {kpiChip("Costo", f(costo))}
        {kpiChip("Margen", f(margen))}
        {kpiChip(
          `${(transferFeePct * 100).toFixed(2)}% Costos Bancarios`,
          f(transferFee),
        )}
      </div>

      {/* Información base */}
      <h3 className="mb-2 text-base font-semibold">Información</h3>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <Row label="IVA 21%" value={montoIva21} />
        <Row label="IVA 10,5%" value={montoIva10_5} />
        <Row label="Exento" value={montoExento} />
        <Row label="Otros Impuestos" value={otrosImpuestos} />
        <Row label="Intereses Tarjeta" value={cardInterest} />
        <Row label="IVA Intereses" value={cardInterestIva} />
      </div>

      {/* Desglose */}
      <h3 className="mb-2 mt-6 text-base font-semibold">
        Desglose de Facturación
      </h3>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <Row label="No Computable" value={nonComputable} />
        <Row label="Gravado 21%" value={baseIva21} />
        <Row label="Gravado 10,5%" value={baseIva10_5} />
        <Row label="Gravado Intereses 21%" value={taxableCardInterest} />
      </div>

      {/* Comisiones */}
      <h4 className="mb-2 mt-6 text-sm font-semibold">Comisiones</h4>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <Row label="Exenta" value={commissionExempt} />
        <Row label="21%" value={commission21} />
        <Row label="10,5%" value={commission10_5} />
      </div>

      {/* IVA sobre comisiones e intereses */}
      <h4 className="mb-2 mt-6 text-sm font-semibold">IVA sobre Comisiones</h4>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <Row label="21%" value={vatOnCommission21} />
        <Row label="10,5%" value={vatOnCommission10_5} />
      </div>

      <h4 className="mb-2 mt-6 text-sm font-semibold">IVA sobre Intereses</h4>
      <Row label="21%" value={vatOnCardInterest} />

      {/* Totales */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/20 p-3">
        <div className="text-sm opacity-70">
          Total Comisión (sin IVA) – neta de Costos Bancarios
        </div>
        <div className="text-lg font-semibold tabular-nums">
          {f(totalCommissionWithoutVAT - transferFee)}
        </div>
      </div>
    </div>
  );
}
