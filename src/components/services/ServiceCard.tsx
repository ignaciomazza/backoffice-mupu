// src/components/services/ServiceCard.tsx

"use client";
import React, { useCallback } from "react";
import { motion } from "framer-motion";
import { Service } from "@/types";

interface ServiceCardProps {
  service: Service & {
    operator?: { name: string };
    nonComputable?: number;
    taxableBase21?: number;
    taxableBase10_5?: number;
    commissionExempt?: number;
    commission21?: number;
    commission10_5?: number;
    vatOnCommission21?: number;
    vatOnCommission10_5?: number;
    totalCommissionWithoutVAT?: number;
    taxableCardInterest?: number;
    vatOnCardInterest?: number;
  };
  expandedServiceId: number | null;
  setExpandedServiceId: React.Dispatch<React.SetStateAction<number | null>>;
  formatDate: (dateString?: string) => string;
  startEditingService: (service: Service) => void;
  deleteService: (id: number) => void;
}

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <p>
    <strong>{label}</strong> <span className="font-light">{children}</span>
  </p>
);

const ListSection: React.FC<{
  title?: string;
  entries: Array<{ label: string; value?: number }>;
  fmt: (v?: number) => string;
}> = ({ title, entries, fmt }) => (
  <div>
    {title && <p className="font-semibold">{title}</p>}
    <ul className="ml-4 list-disc">
      {entries.map(({ label, value }) => (
        <li key={label}>
          <strong>{label}</strong>{" "}
          <span className="font-light">{fmt(value)}</span>
        </li>
      ))}
    </ul>
  </div>
);

export default function ServiceCard({
  service,
  expandedServiceId,
  setExpandedServiceId,
  formatDate,
  startEditingService,
  deleteService,
}: ServiceCardProps) {
  const isExpanded = expandedServiceId === service.id_service;

  // Formatea cualquier valor (incluido undefined/null) a "$ 0,00"
  const fmt = useCallback(
    (v?: number) =>
      new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: service.currency,
      }).format(v ?? 0),
    [service.currency],
  );

  const toggleExpand = useCallback(() => {
    setExpandedServiceId((prev) =>
      prev === service.id_service ? null : service.id_service,
    );
  }, [service.id_service, setExpandedServiceId]);

  const generalInfo = [
    { label: "Tipo", content: service.type },
    { label: "Descripción", content: service.description || "–" },
    { label: "Notas", content: service.note || "–" },
    { label: "Destino", content: service.destination || "–" },
    { label: "Operador", content: service.operator?.name || "–" },
    { label: "Referencia", content: service.reference || "–" },
  ];

  return (
    <motion.div
      layout
      layoutId={`service-${service.id_service}`}
      className="h-fit space-y-3 rounded-3xl bg-white p-6 text-black shadow-md dark:border dark:border-white/50 dark:bg-black dark:text-white"
    >
      {/* ID */}
      <div className="flex w-full items-center justify-end">
        <p className="text-xl font-light">{service.id_service}</p>
      </div>

      {/* Datos generales */}
      <div className="space-y-2">
        {generalInfo.map(({ label, content }) => (
          <Field key={label} label={label}>
            {content}
          </Field>
        ))}
      </div>

      {/* Detalle expandido */}
      {isExpanded && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Field label={`Desde`}>{formatDate(service.departure_date)}</Field>
            <Field label={`Hasta`}>{formatDate(service.return_date)}</Field>
          </div>
          <ListSection
            fmt={fmt}
            entries={[
              { label: "Venta", value: service.sale_price },
              { label: "Costo", value: service.cost_price },
            ]}
          />

          <ListSection
            title="Impuestos"
            fmt={fmt}
            entries={[
              { label: "21%", value: service.tax_21 },
              { label: "10,5%", value: service.tax_105 },
              { label: "Exento", value: service.exempt },
              { label: "Otros", value: service.other_taxes },
            ]}
          />

          {(service.card_interest ||
            service.vatOnCardInterest ||
            service.taxableCardInterest) && (
            <ListSection
              title="Tarjeta"
              fmt={fmt}
              entries={[
                { label: "Intereses", value: service.card_interest },
                { label: "Intereses sin IVA", value: service.taxableCardInterest },
                { label: "IVA Intereses", value: service.vatOnCardInterest },
              ]}
            />
          )}

          <ListSection
            title="Desglose"
            fmt={fmt}
            entries={[
              { label: "No computable", value: service.nonComputable },
              { label: "Grav. 21%", value: service.taxableBase21 },
              { label: "Grav. 10,5%", value: service.taxableBase10_5 },
            ]}
          />

          <ListSection
            title="Comisiones"
            fmt={fmt}
            entries={[
              { label: "Exenta", value: service.commissionExempt },
              { label: "21%", value: service.commission21 },
              { label: "10,5%", value: service.commission10_5 },
            ]}
          />

          <ListSection
            title="IVA Comisiones"
            fmt={fmt}
            entries={[
              { label: "21%", value: service.vatOnCommission21 },
              { label: "10,5%", value: service.vatOnCommission10_5 },
            ]}
          />

          <ListSection
            title="Costos por transaccion"
            fmt={fmt}
            entries={[{ label: "2.4%", value: service.sale_price * 0.024 }]}
          />

          <p className="font-semibold">
            Total (sin IVA){" "}
            <span className="font-light">
              {fmt(
                service.totalCommissionWithoutVAT
                  ? service.totalCommissionWithoutVAT -
                      service.sale_price * 0.024
                  : 0,
              )}
            </span>
          </p>
        </div>
      )}

      {/* Botones */}
      <div>
        {isExpanded ? (
          <div className="mt-4 flex justify-between">
            <button
              onClick={toggleExpand}
              className="rounded-full bg-black p-2 text-white hover:scale-95 active:scale-90 dark:bg-white dark:text-black"
            >
              {/* ícono “-” */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                className="size-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 12h14"
                />
              </svg>
            </button>
            <div className="flex gap-2">
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
                className="rounded-full bg-black px-6 py-2 text-white hover:scale-95 active:scale-90 dark:bg-white dark:text-black"
              >
                Editar
              </button>
              <button
                onClick={() => deleteService(service.id_service)}
                className="rounded-full bg-red-600 px-6 py-2 text-white hover:scale-95 active:scale-90 dark:bg-red-800"
              >
                Eliminar
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={toggleExpand}
            className="mt-4 flex items-center justify-center rounded-full bg-black p-2 text-white hover:scale-95 active:scale-90 dark:bg-white dark:text-black"
          >
            {/* ícono “+” */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              className="size-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4v16m8-8H4"
              />
            </svg>
          </button>
        )}
      </div>
    </motion.div>
  );
}
