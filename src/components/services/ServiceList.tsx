// src/components/services/ServiceList.tsx
"use client";
import React, { useMemo } from "react";
import ServiceCard from "./ServiceCard";
import SummaryCard from "./SummaryCard";
import { Service } from "@/types";

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
}

interface ServiceListProps {
  services: Service[];
  expandedServiceId: number | null;
  setExpandedServiceId: React.Dispatch<React.SetStateAction<number | null>>;
  startEditingService: (service: Service) => void;
  deleteService: (id: number) => void;
  role: string;
  status: string;
}

export default function ServiceList({
  services,
  expandedServiceId,
  setExpandedServiceId,
  startEditingService,
  deleteService,
  role,
  status,
}: ServiceListProps) {
  const formatDate = (dateString?: string) =>
    dateString
      ? new Date(dateString).toLocaleDateString("es-AR", { timeZone: "UTC" })
      : "N/A";

  const fmtCurrency = (value: number, currency: string) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
    }).format(value);

  // Agrupar y sumar totales por moneda
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
    };
    return services.reduce<Record<string, Totals>>((acc, svc) => {
      const c = svc.currency;
      if (!acc[c]) acc[c] = { ...zero };
      Object.entries(svc).forEach(([key, val]) => {
        if (typeof val === "number" && key in acc[c]) {
          acc[c][key as keyof Totals]! += val;
        }
      });
      return acc;
    }, {});
  }, [services]);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {services.map((service) => (
          <ServiceCard
            key={service.id_service}
            service={service}
            expandedServiceId={expandedServiceId}
            setExpandedServiceId={setExpandedServiceId}
            startEditingService={startEditingService}
            deleteService={deleteService}
            formatDate={formatDate}
            role={role}
            status={status}
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
        />
      </div>
    </div>
  );
}
