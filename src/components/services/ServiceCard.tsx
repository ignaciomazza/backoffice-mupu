// src/components/services/ServiceCard.tsx

"use client";
import React from "react";
import { motion } from "framer-motion";
import { Service } from "@/types";

interface ServiceCardProps {
  service: Service;
  expandedServiceId: number | null;
  setExpandedServiceId: React.Dispatch<React.SetStateAction<number | null>>;
  formatDate: (dateString: string | undefined) => string;
  startEditingService: (service: Service) => void;
  deleteService: (id: number) => void;
}

export default function ServiceCard({
  service,
  expandedServiceId,
  setExpandedServiceId,
  formatDate,
  startEditingService,
  deleteService,
}: ServiceCardProps) {
  const isExpanded = expandedServiceId === service.id_service;

  const formatCurrency = (value: number | undefined): string => {
    if (value === undefined || value === null) return "N/A";
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: service.currency,
    }).format(value);
  };

  // Extraer valores con defaults
  const sale = service.sale_price;
  const cost = service.cost_price;
  const tax21 = service.tax_21 || 0;
  const tax105 = service.tax_105 || 0;
  const exempt = service.exempt || 0;
  const other_taxes = service.other_taxes || 0;

  // Cálculo de bases de impuestos (si existen)
  const base21 = tax21 > 0 ? tax21 / 0.21 : 0;
  const base10_5 = tax105 > 0 ? tax105 / 0.105 : 0;
  const computedTaxable =
    tax21 > 0 || tax105 > 0 ? base21 * 1.21 + base10_5 * 1.105 : 0;
  // "No Computable" se define como: costo - (exento + monto computable)
  const noComputable = cost - (exempt + computedTaxable);

  // Margen de operación
  const margin = sale - cost;

  // Variables para las comisiones
  let netComm21 = 0;
  let netComm10_5 = 0;
  let grossComm21 = 0;
  let grossComm10_5 = 0;
  let netCommExempt = 0;
  let ivaComm21 = 0;
  let ivaComm10_5 = 0;

  if (tax21 + tax105 > 0) {
    // Cuando se ingresan impuestos:
    const taxableCost = cost - exempt;
    const taxableMargin = cost > 0 ? margin * (taxableCost / cost) : 0;
    const exemptMargin = margin - taxableMargin;

    grossComm21 = taxableMargin * (tax21 / (tax21 + tax105));
    grossComm10_5 = taxableMargin * (tax105 / (tax21 + tax105));

    netComm21 = grossComm21 ? grossComm21 / 1.21 : 0;
    ivaComm21 = grossComm21 - netComm21;

    netComm10_5 = grossComm10_5 ? grossComm10_5 / 1.105 : 0;
    ivaComm10_5 = grossComm10_5 - netComm10_5;

    netCommExempt = exemptMargin;
  } else {
    // Cuando no se ingresan impuestos:
    // Se resuelve el sistema:
    //   X / Y = (cost - exempt) / (exempt)
    //   1.21 * X + Y = margin
    // donde X es la comisión neta gravada y Y la comisión neta exenta.
    const taxableCost = cost - exempt;
    if (taxableCost > 0) {
      const netTaxableCommission = margin / (1.21 + exempt / taxableCost);
      const grossTaxableCommission = netTaxableCommission * 1.21;
      netComm21 = netTaxableCommission;
      grossComm21 = grossTaxableCommission;
      netCommExempt = margin - grossTaxableCommission;
      ivaComm21 = grossTaxableCommission - netTaxableCommission;
    } else {
      // Si todo el costo es exento, la comisión es 100% exenta.
      netCommExempt = margin;
    }
  }

  const totalNetCommission = netComm21 + netComm10_5 + netCommExempt;

  return (
    <motion.div
      layout
      layoutId={`service-${service.id_service}`}
      className="h-fit space-y-3 rounded-3xl bg-white p-6 text-black shadow-md dark:border dark:border-white/50 dark:bg-black dark:text-white"
    >
      <p className="text-end text-xl font-light">{service.id_service}</p>
      <div>
        <p>
          <span className="font-semibold">Tipo </span>
          <span className="ml-1 font-light">{service.type}</span>
        </p>
        <p>
          <span className="font-semibold">Descripción </span>
          <span className="ml-1 font-light">
            {service.description || "Sin descripción"}
          </span>
        </p>
      </div>
      <div>
        <p>
          <span className="font-semibold">Destino </span>
          <span className="ml-1 font-light">
            {service.destination || "N/A"}
          </span>
        </p>
        <p>
          <span className="font-semibold">Desde </span>
          <span className="ml-1 font-light">
            {formatDate(service.departure_date)}
          </span>
        </p>
        <p>
          <span className="font-semibold">Hasta </span>
          <span className="ml-1 font-light">
            {formatDate(service.return_date)}
          </span>
        </p>
      </div>
      <div>
        <p>
          <span className="font-semibold">Operador </span>
          <span className="ml-1 font-light">
            {service.operator?.name || "N/A"}
          </span>
        </p>
        <p>
          <span className="font-semibold">Referencia </span>
          <span className="ml-1 font-light">{service.reference || "N/A"}</span>
        </p>
      </div>
      {isExpanded && (
        <div className="space-y-2">
          <div>
            <p>
              <span className="font-semibold">Venta </span>
              <span className="ml-1 font-light">{formatCurrency(sale)}</span>
            </p>
            <p>
              <span className="font-semibold">Costo </span>
              <span className="ml-1 font-light">{formatCurrency(cost)}</span>
            </p>
          </div>
          <p className="mt-4 font-semibold">Impuestos</p>
          <ul className="ml-4 list-disc">
            <li>
              <span className="font-semibold">21% </span>
              <span className="ml-1 font-light">{formatCurrency(tax21)}</span>
            </li>
            <li>
              <span className="font-semibold">10.5% </span>
              <span className="ml-1 font-light">{formatCurrency(tax105)}</span>
            </li>
            <li>
              <span className="font-semibold">Exento </span>
              <span className="ml-1 font-light">{formatCurrency(exempt)}</span>
            </li>
            <li>
              <span className="font-semibold">Otros </span>
              <span className="ml-1 font-light">
                {formatCurrency(other_taxes)}
              </span>
            </li>
          </ul>

          <p className="mt-4 font-semibold">Desglose de Facturación</p>
          <ul className="ml-4 list-disc">
            <li>
              <span className="font-semibold">No Computable </span>
              <span className="ml-1 font-light">
                {formatCurrency(noComputable)}
              </span>
            </li>
            <li>
              <span className="font-semibold">Grav. 21% </span>
              <span className="ml-1 font-light">{formatCurrency(base21)}</span>
            </li>
            <li>
              <span className="font-semibold">Grav. 10,5% </span>
              <span className="ml-1 font-light">
                {formatCurrency(base10_5)}
              </span>
            </li>
          </ul>

          <p className="mt-4 font-semibold">Comisiones</p>
          <ul className="ml-4 list-disc">
            <li>
              <span className="font-semibold">Exenta </span>
              <span className="ml-1 font-light">
                {formatCurrency(netCommExempt)}
              </span>
            </li>
            <li>
              <span className="font-semibold">21% </span>
              <span className="ml-1 font-light">
                {formatCurrency(netComm21)}
              </span>
            </li>
            <li>
              <span className="font-semibold">10,5% </span>
              <span className="ml-1 font-light">
                {formatCurrency(netComm10_5)}
              </span>
            </li>
          </ul>

          <p className="mt-4 font-semibold">IVA sobre Comisiones</p>
          <ul className="ml-4 list-disc">
            <li>
              <span className="font-semibold">21% </span>
              <span className="ml-1 font-light">
                {formatCurrency(ivaComm21)}
              </span>
            </li>
            <li>
              <span className="font-semibold">10,5% </span>
              <span className="ml-1 font-light">
                {formatCurrency(ivaComm10_5)}
              </span>
            </li>
          </ul>

          <p className="mt-4 font-semibold">
            <span>Total Comisión (sin IVA) </span>
            <span className="ml-1 font-light">
              {formatCurrency(totalNetCommission)}
            </span>
          </p>
        </div>
      )}
      <div>
        {isExpanded ? (
          <div className="flex w-full justify-between">
            <button
              onClick={() =>
                setExpandedServiceId((prevId) =>
                  prevId === service.id_service ? null : service.id_service,
                )
              }
              className="mt-4 rounded-full bg-black p-2 text-white transition-transform hover:scale-95 active:scale-90 dark:bg-white dark:text-black"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="size-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 12h14"
                />
              </svg>
            </button>
            <div className="mt-4 flex gap-2">
              <button
                className="rounded-full bg-black px-6 py-2 text-white transition-transform hover:scale-95 active:scale-90 dark:bg-white dark:text-black"
                onClick={() => startEditingService(service)}
              >
                <span className="font-semibold">Editar</span>
              </button>
              <button
                className="rounded-full bg-red-600 px-6 py-2 text-white transition-transform hover:scale-95 active:scale-90 dark:bg-red-800"
                onClick={() => deleteService(service.id_service)}
              >
                <span className="font-semibold">Eliminar</span>
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() =>
              setExpandedServiceId((prevId) =>
                prevId === service.id_service ? null : service.id_service,
              )
            }
            className="mt-4 flex items-center justify-center rounded-full bg-black p-2 text-white transition-transform hover:scale-95 active:scale-90 dark:bg-white dark:text-black"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="size-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
          </button>
        )}
      </div>
    </motion.div>
  );
}
