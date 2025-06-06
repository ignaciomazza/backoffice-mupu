// src/components/BillingBreakdown.tsx
"use client";

import { useEffect } from "react";

interface BillingData {
  nonComputable: number;
  taxableBase21: number;
  taxableBase10_5: number;
  commissionExempt: number;
  commission21: number;
  commission10_5: number;
  vatOnCommission21: number;
  vatOnCommission10_5: number;
  totalCommissionWithoutVAT: number;
  impIVA: number;
  taxableCardInterest: number;
  vatOnCardInterest: number;
}

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
}

// Helper de redondeo
const round = (value: number, decimals = 8) =>
  parseFloat(value.toFixed(decimals));

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
}: BillingBreakdownProps) {
  // 1. Cálculos de base
  const baseNetoDesglose = round(
    costo - (montoIva21 + montoIva10_5) - otrosImpuestos,
  );
  const transferFee = round(importeVenta * 0.024);
  const baseIva21 = montoIva21 > 0 ? round(montoIva21 / 0.21) : 0;
  const baseIva10_5 = montoIva10_5 > 0 ? round(montoIva10_5 / 0.105) : 0;
  const sumaBasesImponibles = round(baseIva21 + baseIva10_5);
  const hasError =
    importeVenta <= costo ||
    baseNetoDesglose < montoExento + sumaBasesImponibles;

  // 2. No computable y margen
  const nonComputable = hasError
    ? 0
    : round(
        Math.max(0, baseNetoDesglose - (montoExento + sumaBasesImponibles)),
      );
  const margen = round(importeVenta - costo);

  // 3. Comisiones
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
      // Sin IVA declarado
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
      // Con IVA declarado
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

  // 4. Intereses tarjeta
  const taxableCardInterest =
    cardInterestIva > 0 ? round(cardInterestIva / 0.21) : 0;
  const vatOnCardInterest = round(cardInterestIva);

  // 5. Impuesto a usar en factura (incluye IVA de comisiones e intereses)
  const impIVA = round(
    montoIva21 +
      montoIva10_5 +
      vatOnCommission21 +
      vatOnCommission10_5 +
      vatOnCardInterest,
    2,
  );

  // Notificar siempre, hook incondicional
  useEffect(() => {
    if (onBillingUpdate && !hasError) {
      onBillingUpdate({
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
      });
    }
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
    onBillingUpdate,
  ]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: moneda,
    }).format(v);

  if (hasError) {
    return (
      <div className="mt-6 rounded-xl p-4 dark:text-white">
        <p className="font-semibold text-red-600">
          Error en los importes de costo, IVA o exento.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-xl p-4 dark:text-white">
      <h3 className="mb-2 text-xl font-semibold">Información</h3>
      <div className="mb-4">
        <p>
          <strong>Venta:</strong> {formatCurrency(importeVenta)}
        </p>
        <p>
          <strong>Costo:</strong> {formatCurrency(costo)}
        </p>
        <p>
          <strong>IVA 21%:</strong> {formatCurrency(montoIva21)}
        </p>
        <p>
          <strong>IVA 10.5%:</strong> {formatCurrency(montoIva10_5)}
        </p>
        <p>
          <strong>Exento:</strong> {formatCurrency(montoExento)}
        </p>
        <p>
          <strong>Otros Impuestos:</strong> {formatCurrency(otrosImpuestos)}
        </p>
        <p>
          <strong>Intereses Tarjeta:</strong> {formatCurrency(cardInterest)}
        </p>
        <p>
          <strong>IVA Intereses:</strong> {formatCurrency(cardInterestIva)}
        </p>
      </div>

      <h3 className="mb-2 text-xl font-semibold">Desglose de Facturación</h3>
      <div className="mb-4">
        <p>
          <strong>No Computable:</strong> {formatCurrency(nonComputable)}
        </p>
        <p>
          <strong>Gravado 21%:</strong> {formatCurrency(baseIva21)}
        </p>
        <p>
          <strong>Gravado 10.5%:</strong> {formatCurrency(baseIva10_5)}
        </p>
        <p>
          <strong>Gravado Intereses 21%:</strong>{" "}
          {formatCurrency(taxableCardInterest)}
        </p>
      </div>

      <h4 className="mb-2 text-lg font-semibold">Comisiones</h4>
      <div className="mb-4">
        <p>
          <strong>Exenta:</strong> {formatCurrency(commissionExempt)}
        </p>
        <p>
          <strong>21%:</strong> {formatCurrency(commission21)}
        </p>
        <p>
          <strong>10.5%:</strong> {formatCurrency(commission10_5)}
        </p>
      </div>

      <h4 className="mb-2 text-lg font-semibold">IVA sobre Comisiones</h4>
      <div className="mb-4">
        <p>
          <strong>21%:</strong> {formatCurrency(vatOnCommission21)}
        </p>
        <p>
          <strong>10.5%:</strong> {formatCurrency(vatOnCommission10_5)}
        </p>
      </div>

      <h4 className="mb-2 text-lg font-semibold">IVA sobre Intereses</h4>
      <p className="mb-4">
        <strong>21%:</strong> {formatCurrency(vatOnCardInterest)}
      </p>

      <h4 className="mb-2 text-lg font-semibold">Costos por transaccion</h4>
      <p className="mb-4">
        <strong>2.4%:</strong> {formatCurrency(transferFee)}
      </p>

      <p className="font-semibold">
        Total Comisión (sin IVA):{" "}
        {formatCurrency(totalCommissionWithoutVAT - transferFee)}
      </p>
    </div>
  );
}
