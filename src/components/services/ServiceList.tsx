// src/components/services/ServiceList.tsx
"use client";
import React, { useMemo, useCallback } from "react";
import ServiceCard from "./ServiceCard";
import SummaryCard from "./SummaryCard";
import { Service, Receipt } from "@/types";
import RichNote from "@/components/notes/RichNote";
import { extractLinks, extractListItems } from "@/utils/notes";

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
  extra_costs_amount: number;
  extra_taxes_amount: number;
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
    extra_costs_amount: number | null;
    extra_taxes_amount: number | null;
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
  "extra_costs_amount",
  "extra_taxes_amount",
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
  useBookingSaleTotal?: boolean;
  bookingSaleTotals?: Record<string, number>;
  bookingSaleTotalsForm?: React.ReactNode;
}

export default function ServiceList({
  services,
  receipts,
  expandedServiceId,
  setExpandedServiceId,
  startEditingService,
  deleteService,
  role,
  status,
  agencyTransferFeePct,
  useBookingSaleTotal,
  bookingSaleTotals,
  bookingSaleTotalsForm,
}: ServiceListProps) {
  const formatDate = useCallback(
    (dateString?: string) =>
      dateString
        ? new Date(dateString).toLocaleDateString("es-AR", { timeZone: "UTC" })
        : "N/A",
    [],
  );

  const fmtCurrency = useCallback(
    (value: number, currency: string) =>
      new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: currency?.toUpperCase() || "ARS",
      }).format(Number.isFinite(value) ? value : 0),
    [],
  );

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
      extra_costs_amount: 0,
      extra_taxes_amount: 0,
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
          : Number(svc.sale_price || 0) * (Number.isFinite(pct) ? pct : 0);

      if (Number.isFinite(feeAmount)) t.transferFeesAmount += feeAmount;

      return acc;
    }, {});
  }, [services, agencyTransferFeePct]);

  const servicesWithNotes = useMemo(
    () =>
      services.filter((s) => String(s.note ?? "").trim().length > 0),
    [services],
  );

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

      {bookingSaleTotalsForm}

      <div className="rounded-3xl border border-sky-200/40 bg-white/40 p-4 text-sky-950 shadow-md shadow-sky-950/5 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-white">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">Notas por servicio</p>
          <span className="rounded-full border border-sky-200/50 bg-sky-100/60 px-3 py-1 text-[11px] font-semibold text-sky-900 dark:border-white/10 dark:bg-white/10 dark:text-white">
            {servicesWithNotes.length > 0
              ? `${servicesWithNotes.length} con notas`
              : "Sin notas"}
          </span>
        </div>

        {servicesWithNotes.length === 0 ? (
          <p className="mt-3 text-xs text-sky-900/60 dark:text-white/60">
            No hay notas internas cargadas en los servicios.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {servicesWithNotes.map((service) => {
              const links = extractLinks(service.note);
              const items = extractListItems(service.note);
              return (
                <div
                  key={`note-${service.id_service}`}
                  className="rounded-2xl border border-sky-200/40 bg-white/70 p-3 shadow-sm shadow-sky-950/5 dark:border-white/10 dark:bg-white/5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-sky-950/80 dark:text-white/80">
                      Servicio N° {service.agency_service_id ?? service.id_service}
                      {service.type ? ` · ${service.type}` : ""}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold">
                      {links.length > 0 && (
                        <span className="rounded-full border border-emerald-200/60 bg-emerald-500/10 px-2 py-1 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100">
                          {links.length} links
                        </span>
                      )}
                      {items.length > 0 && (
                        <span className="rounded-full border border-sky-200/60 bg-white/70 px-2 py-1 text-sky-900 dark:border-white/10 dark:bg-white/5 dark:text-white">
                          {items.length} ítems
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 rounded-xl bg-white/50 p-2 dark:bg-white/5">
                    <RichNote
                      text={service.note}
                      className="space-y-2 text-sm text-sky-900/80 dark:text-white/80"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <div className="mb-4 mt-8 flex justify-center">
          <p className="text-2xl font-medium">Resumen</p>
        </div>
        <SummaryCard
          totalsByCurrency={totalsByCurrency}
          fmtCurrency={fmtCurrency}
          services={services}
          receipts={receipts}
          useBookingSaleTotal={useBookingSaleTotal}
          bookingSaleTotals={bookingSaleTotals}
        />
      </div>
    </div>
  );
}
