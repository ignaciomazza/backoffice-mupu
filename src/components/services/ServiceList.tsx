"use client";
import React, { useMemo } from "react";
import ServiceCard from "./ServiceCard";
import SummaryCard from "./SummaryCard";
import { Service, Receipt } from "@/types";

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
  commissionExempt: number;
  commission21: number;
  commission10_5: number;
  vatOnCommission21: number;
  vatOnCommission10_5: number;
  totalCommissionWithoutVAT: number;
  /** Fallback cuando no hay desglose de intereses de tarjeta */
  cardInterestRaw?: number;
  transferFeesAmount: number;
}

type ServiceWithCalcs = Service &
  Partial<{
    taxableCardInterest: number;
    vatOnCardInterest: number;
    nonComputable: number;
    taxableBase21: number;
    taxableBase10_5: number;
    commissionExempt: number;
    commission21: number;
    commission10_5: number;
    vatOnCommission21: number;
    vatOnCommission10_5: number;
    totalCommissionWithoutVAT: number;
    card_interest: number;
    transfer_fee_pct: number | null;
    transfer_fee_amount: number | null;
  }>;

type NumericKeys = Extract<keyof Totals, keyof ServiceWithCalcs>;

const KEYS_TO_SUM: readonly NumericKeys[] = [
  "sale_price",
  "cost_price",
  "tax_21",
  "tax_105",
  "exempt",
  "other_taxes",
  "taxableCardInterest",
  "vatOnCardInterest",
  "nonComputable",
  "taxableBase21",
  "taxableBase10_5",
  "commissionExempt",
  "commission21",
  "commission10_5",
  "vatOnCommission21",
  "vatOnCommission10_5",
  "totalCommissionWithoutVAT",
];

interface ServiceListProps {
  services: Service[];
  /** NUEVO: recibos para pasar a SummaryCard y calcular deuda */
  receipts: Receipt[];

  expandedServiceId: number | null;
  setExpandedServiceId: React.Dispatch<React.SetStateAction<number | null>>;
  startEditingService: (service: Service) => void;
  deleteService: (id: number) => void;
  role: string;
  status: string;
  agencyTransferFeePct: number;
}

export default function ServiceList({
  services,
  receipts, // <-- nuevo
  expandedServiceId,
  setExpandedServiceId,
  startEditingService,
  deleteService,
  role,
  status,
  agencyTransferFeePct,
}: ServiceListProps) {
  const formatDate = (dateString?: string) =>
    dateString
      ? new Date(dateString).toLocaleDateString("es-AR", { timeZone: "UTC" })
      : "N/A";

  const fmtCurrency = (value: number, currency: string) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
    }).format(value || 0);

  // Agrupar y sumar totales por moneda (incluye fallback card_interest -> cardInterestRaw)
  const totalsByCurrency = useMemo(() => {
    const zero: Totals = {
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
      commissionExempt: 0,
      commission21: 0,
      commission10_5: 0,
      vatOnCommission21: 0,
      vatOnCommission10_5: 0,
      totalCommissionWithoutVAT: 0,
      cardInterestRaw: 0,
      transferFeesAmount: 0,
    };

    return services.reduce<Record<string, Totals>>((acc, s) => {
      const svc = s as ServiceWithCalcs;
      const c = (svc.currency || "ARS").toUpperCase();
      if (!acc[c]) acc[c] = { ...zero };
      const t = acc[c];

      for (const k of KEYS_TO_SUM) {
        const v = svc[k];
        if (typeof v === "number" && Number.isFinite(v)) {
          t[k] += v;
        }
      }

      // Fallback tarjeta: si no hay desglose, usamos el bruto card_interest
      const splitNoVAT = svc.taxableCardInterest ?? 0;
      const splitVAT = svc.vatOnCardInterest ?? 0;
      const raw = svc.card_interest ?? 0;

      if (splitNoVAT + splitVAT <= 0 && raw > 0) {
        t.cardInterestRaw = (t.cardInterestRaw || 0) + raw;
      }

      const pct =
        svc.transfer_fee_pct != null
          ? Number(svc.transfer_fee_pct)
          : Number(agencyTransferFeePct);

      const feeAmount =
        svc.transfer_fee_amount != null
          ? Number(svc.transfer_fee_amount)
          : Number(svc.sale_price || 0) * pct;

      if (Number.isFinite(feeAmount)) t.transferFeesAmount += feeAmount;

      return acc;
    }, {});
  }, [services, agencyTransferFeePct]);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {services.map((service) => (
          <ServiceCard
            key={service.id_service}
            service={service as ServiceWithCalcs}
            expandedServiceId={expandedServiceId}
            setExpandedServiceId={setExpandedServiceId}
            startEditingService={startEditingService}
            deleteService={deleteService}
            formatDate={formatDate}
            role={role}
            status={status}
            agencyTransferFeePct={agencyTransferFeePct}
          />
        ))}
      </div>

      <div>
        <div className="mb-4 mt-8 flex justify-center">
          <p className="text-2xl font-medium">Resumen</p>
        </div>
        <SummaryCard
          totalsByCurrency={totalsByCurrency}
          fmtCurrency={fmtCurrency}
          services={services}
          receipts={receipts} // <-- NUEVO
        />
      </div>
    </div>
  );
}
