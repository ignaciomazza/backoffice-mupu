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
  role: string;
  status: string;
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
  role,
  status,
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
    { label: "Destino", content: service.destination || "–" },
    { label: "Operador", content: service.operator?.name || "–" },
    { label: "Referencia", content: service.reference || "–" },
  ];

  return (
    <motion.div
      layout
      layoutId={`service-${service.id_service}`}
      className="h-fit space-y-3 rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md backdrop-blur dark:text-white"
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
                {
                  label: "Intereses sin IVA",
                  value: service.taxableCardInterest,
                },
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
              className="rounded-full bg-sky-100 p-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
            >
              {/* ícono “-” */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
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
              {(status === "Abierta" ||
                role === "administrativo" ||
                role === "desarrollador" ||
                role === "gerente") && (
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
                  className="rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.4}
                    stroke="currentColor"
                    className="size-6"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                    />
                  </svg>
                </button>
              )}
              {(status === "Abierta" ||
                role === "administrativo" ||
                role === "desarrollador" ||
                role === "gerente") && (
                <button
                  onClick={() => deleteService(service.id_service)}
                  className="rounded-full bg-red-600 px-6 py-2 text-center text-red-100 shadow-sm shadow-red-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-red-800"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.4}
                    stroke="currentColor"
                    className="size-6"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ) : (
          <button
            onClick={toggleExpand}
            className="mt-4 rounded-full bg-sky-100 p-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
          >
            {/* ícono “+” */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
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
