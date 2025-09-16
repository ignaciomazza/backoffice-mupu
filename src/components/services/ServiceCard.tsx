// src/components/services/ServiceCard.tsx
"use client";

import React, { useCallback } from "react";
import { motion } from "framer-motion";
import { Service } from "@/types";

/** Campos calculados que pueden venir del backend */
type ServiceCalcs = Partial<{
  operator: { name: string };
  nonComputable: number;
  taxableBase21: number;
  taxableBase10_5: number;
  commissionExempt: number;
  commission21: number;
  commission10_5: number;
  vatOnCommission21: number;
  vatOnCommission10_5: number;
  totalCommissionWithoutVAT: number;
  taxableCardInterest: number;
  vatOnCardInterest: number;
  card_interest: number;
  transfer_fee_amount: number | null;
  transfer_fee_pct: number | null;
}>;

interface ServiceCardProps {
  service: Service & ServiceCalcs;
  expandedServiceId: number | null;
  setExpandedServiceId: React.Dispatch<React.SetStateAction<number | null>>;
  formatDate: (dateString?: string) => string;
  startEditingService: (service: Service) => void;
  deleteService: (id: number) => void;
  role: string;
  status: string;
  agencyTransferFeePct: number;
}

/* ---------- UI helpers ---------- */
const Chip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="rounded-full border border-white/10 bg-white/20 px-2.5 py-1 text-xs font-medium text-sky-950 dark:bg-white/10 dark:text-white">
    {children}
  </span>
);

const Section: React.FC<{ title?: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <section className="rounded-2xl border border-white/10 bg-white/10 p-3">
    {title && (
      <h4 className="mb-2 text-sm font-semibold tracking-tight">{title}</h4>
    )}
    <dl className="divide-y divide-white/10">{children}</dl>
  </section>
);

const Row: React.FC<{ label: string; value?: number | string }> = ({
  label,
  value,
}) => (
  <div className="grid grid-cols-2 items-center gap-2 py-2">
    <dt className="text-sm opacity-80">{label}</dt>
    <dd className="text-right font-medium tabular-nums">{value ?? "–"}</dd>
  </div>
);

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2">
    <p className="text-xs opacity-70">{label}</p>
    <p className="text-base font-medium tabular-nums">{value}</p>
  </div>
);

export default function ServiceCard({
  service,
  expandedServiceId,
  setExpandedServiceId,
  formatDate,
  startEditingService,
  deleteService,
  role,
  status,
  agencyTransferFeePct,
}: ServiceCardProps) {
  const isExpanded = expandedServiceId === service.id_service;

  const fmtMoney = useCallback(
    (v?: number) =>
      new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: service.currency,
      }).format(v ?? 0),
    [service.currency],
  );

  const feePct =
    service.transfer_fee_pct != null
      ? Number(service.transfer_fee_pct)
      : Number(agencyTransferFeePct);

  const feeAmount =
    service.transfer_fee_amount != null
      ? Number(service.transfer_fee_amount)
      : Number(service.sale_price || 0) * feePct;

  const canEditOrDelete =
    status === "Abierta" ||
    role === "administrativo" ||
    role === "desarrollador" ||
    role === "gerente";

  const toggleExpand = () =>
    setExpandedServiceId((prev) =>
      prev === service.id_service ? null : service.id_service,
    );

  return (
    <motion.div
      layout
      layoutId={`service-${service.id_service}`}
      className="h-fit space-y-4 overflow-hidden rounded-3xl border border-white/10 bg-white/10 p-4 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur-sm dark:text-white"
    >
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-4">
            <button
              onClick={toggleExpand}
              aria-expanded={isExpanded}
              className="grid size-8 place-items-center rounded-full bg-sky-100 text-sky-950 shadow-sm transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white"
              title={isExpanded ? "Contraer" : "Expandir"}
            >
              {isExpanded ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="size-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 12h14"
                  />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="size-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4.5v15m7.5-7.5h-15"
                  />
                </svg>
              )}
            </button>
            <p className="text-xs opacity-70">
              N° {service.id_service} •{" "}
              {service.created_at
                ? new Date(service.created_at).toLocaleDateString("es-AR")
                : "–"}
            </p>
          </div>
          <div className="flex flex-col font-semibold">
            <p>{service.type}</p>
            <p className="text-sm font-normal opacity-70">
              {service.description ? `${service.description}` : ""}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Chip>{service.operator?.name ?? "Operador –"}</Chip>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 flex h-full items-center">
          <Chip>
            {formatDate(service.departure_date)} →{" "}
            {formatDate(service.return_date)}
          </Chip>
        </div>

        <Stat label="Venta" value={fmtMoney(service.sale_price)} />
        <Stat label="Costo" value={fmtMoney(service.cost_price)} />
        {!isExpanded && (
          <div className="col-span-2 flex h-full items-center">
            <Stat
              label="Total Comisión (sin IVA)"
              value={fmtMoney(
                (service.totalCommissionWithoutVAT ?? 0) - (feeAmount ?? 0),
              )}
            />
          </div>
        )}
      </div>

      {/* Detalle */}
      {isExpanded && (
        <>
          <Section title="Detalle">
            <Row label="Destino" value={service.destination || "–"} />
            <Row label="Referencia" value={service.reference || "–"} />
          </Section>

          <Section title="Impuestos">
            <Row label="IVA 21%" value={fmtMoney(service.tax_21)} />
            <Row label="IVA 10,5%" value={fmtMoney(service.tax_105)} />
            <Row label="Exento" value={fmtMoney(service.exempt)} />
            <Row label="Otros" value={fmtMoney(service.other_taxes)} />
          </Section>

          {(service.card_interest ||
            service.vatOnCardInterest ||
            service.taxableCardInterest) && (
            <Section title="Tarjeta">
              <Row label="Intereses" value={fmtMoney(service.card_interest)} />
              <Row
                label="Intereses sin IVA"
                value={fmtMoney(service.taxableCardInterest)}
              />
              <Row
                label="IVA Intereses"
                value={fmtMoney(service.vatOnCardInterest)}
              />
            </Section>
          )}

          <Section title="Desglose de facturación">
            <Row
              label="No computable"
              value={fmtMoney(service.nonComputable)}
            />
            <Row label="Gravado 21%" value={fmtMoney(service.taxableBase21)} />
            <Row
              label="Gravado 10,5%"
              value={fmtMoney(service.taxableBase10_5)}
            />
          </Section>

          <Section title="Comisiones">
            <Row label="Exenta" value={fmtMoney(service.commissionExempt)} />
            <Row label="21%" value={fmtMoney(service.commission21)} />
            <Row label="10,5%" value={fmtMoney(service.commission10_5)} />
            <Row label="IVA 21%" value={fmtMoney(service.vatOnCommission21)} />
            <Row
              label="IVA 10,5%"
              value={fmtMoney(service.vatOnCommission10_5)}
            />
          </Section>

          <Section title="Totales">
            <Row
              label={`Costo por transferencia · ${(feePct * 100).toFixed(2)}%`}
              value={fmtMoney(feeAmount)}
            />
            <Row
              label="Total Comisión (sin IVA)"
              value={fmtMoney(
                (service.totalCommissionWithoutVAT ?? 0) - (feeAmount ?? 0),
              )}
            />
          </Section>

          {/* Acciones */}
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={toggleExpand}
              className="rounded-full bg-sky-100 p-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white"
              aria-label="Contraer card"
              title="Contraer"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 12h14"
                />
              </svg>
            </button>

            {canEditOrDelete && (
              <button
                onClick={() => {
                  startEditingService(service);
                  const form = document.getElementById("service-form");
                  if (form) {
                    const y =
                      form.getBoundingClientRect().top +
                      window.pageYOffset -
                      window.innerHeight * 0.1;
                    window.scrollTo({ top: y, behavior: "smooth" });
                  }
                }}
                className="rounded-full bg-sky-100 px-5 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white"
                aria-label="Editar servicio"
                title="Editar servicio"
              >
                <div className="flex items-center gap-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="size-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.4}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                    />
                  </svg>
                  Editar
                </div>
              </button>
            )}

            {canEditOrDelete && (
              <button
                onClick={() => deleteService(service.id_service)}
                className="rounded-full bg-red-600 px-5 py-2 text-red-100 shadow-sm shadow-red-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-red-800"
                aria-label="Eliminar servicio"
                title="Eliminar servicio"
              >
                <div className="flex items-center gap-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="size-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.4}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                    />
                  </svg>
                  Eliminar
                </div>
              </button>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
}
