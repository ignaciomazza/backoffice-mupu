// src/components/services/ServiceCard.tsx

"use client";
import React from "react";
import { motion } from "framer-motion";
import { Service } from "@/types";

// Función auxiliar para redondear
const round = (value: number, decimals: number = 8): number => {
  return parseFloat(value.toFixed(decimals));
};

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

  // Función para formatear moneda a dos decimales con idioma "es-AR"
  const formatCurrency = (value: number | undefined): string => {
    if (value === undefined || value === null) return "N/A";
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: service.currency,
    }).format(Number(value.toFixed(2)));
  };

  // Extracción de variables con defaults
  const sale = service.sale_price;
  const cost = service.cost_price;
  const tax21 = service.tax_21 || 0;
  const tax105 = service.tax_105 || 0;
  const exempt = service.exempt || 0;
  const otherTaxes = service.other_taxes || 0;

  // ---------------------------
  // 1. Cálculos para el Desglose de Facturación

  // Base neta para facturación (se descuenta el total de impuestos declarados y otros impuestos)
  const baseNetoDesglose = round(cost - (tax21 + tax105) - otherTaxes);

  // Cálculo de las bases imponibles derivadas de cada impuesto
  const baseIva21 = tax21 > 0 ? round(tax21 / 0.21) : 0;
  const baseIva10_5 = tax105 > 0 ? round(tax105 / 0.105) : 0;
  const sumaBasesImponibles = round(baseIva21 + baseIva10_5);

  // Validación: el precio de venta debe ser mayor que el costo y la baseNetoDesglose
  // debe ser suficiente para cubrir el monto exento y las bases imponibles
  if (sale <= cost || baseNetoDesglose < exempt + sumaBasesImponibles) {
    return (
      <motion.div className="mt-6 rounded-xl p-4 dark:text-white">
        <p className="font-semibold text-red-600">
          Error en los importes: costo, impuestos o exento incorrectos.
        </p>
      </motion.div>
    );
  }

  // Importe "No Computable" y margen de la operación
  const noComputable = round(
    Math.max(0, baseNetoDesglose - (exempt + sumaBasesImponibles)),
  );
  const margin = round(sale - cost);

  // ---------------------------
  // 2. Cálculo de las Comisiones

  // Se calcula el porcentaje exento a partir de la baseNetoDesglose
  const porcentajeExento =
    baseNetoDesglose > 0 ? round(exempt / baseNetoDesglose) : 0;

  let comisionExenta = 0;
  let comision21 = 0;
  let comision10_5 = 0;
  let comisionIva21 = 0;
  let comisionIva10_5 = 0;
  let comisionTotalNeta = 0;

  if (tax21 === 0 && tax105 === 0) {
    // Caso sin IVA declarado
    const defaultIVA = 0.21;
    const F = round(
      porcentajeExento + (1 - porcentajeExento) * (1 + defaultIVA),
    );
    const comisionNeta = round(margin / F);
    comisionExenta = round(comisionNeta * porcentajeExento);
    const comisionGravada = round(comisionNeta - comisionExenta);
    // Toda la comisión gravada se asigna al grupo 21
    comision21 = round(comisionGravada);
    comision10_5 = 0;
    comisionIva21 = round(comision21 * defaultIVA);
    comisionIva10_5 = 0;
    comisionTotalNeta = round(comisionExenta + comision21);
  } else {
    // Caso con IVA declarado
    // a) Se calcula el costo gravable
    const costoGravable = round(baseNetoDesglose - exempt);
    // b) Se determina el remanente, que es lo que falta para alcanzar el costo gravable
    const remanente = round(
      Math.max(0, costoGravable - (baseIva21 + baseIva10_5)),
    );
    // c) Bases efectivas para cada grupo se calculan asignando íntegramente el remanente al grupo 21
    const effectiveBase21 = round(baseIva21 + remanente);
    const effectiveBase10_5 = round(baseIva10_5);
    const totalEffectiveBase = round(effectiveBase21 + effectiveBase10_5);
    // d) Se ponderan las bases efectivas
    const peso21 =
      totalEffectiveBase > 0 ? round(effectiveBase21 / totalEffectiveBase) : 0;
    const peso10_5 =
      totalEffectiveBase > 0
        ? round(effectiveBase10_5 / totalEffectiveBase)
        : 0;
    // e) Factor F que mezcla la parte exenta y la parte gravada ajustada por IVA
    const F = round(
      porcentajeExento +
        (1 - porcentajeExento) * (peso21 * (1 + 0.21) + peso10_5 * (1 + 0.105)),
    );
    // f) Cálculo de la comisión neta total
    const comisionNeta = round(margin / F);
    comisionExenta = round(comisionNeta * porcentajeExento);
    const comisionGravada = round(comisionNeta - comisionExenta);
    // g) Reparto proporcional de la comisión gravada
    comision21 =
      totalEffectiveBase > 0
        ? round(comisionGravada * (effectiveBase21 / totalEffectiveBase))
        : 0;
    comision10_5 =
      totalEffectiveBase > 0
        ? round(comisionGravada * (effectiveBase10_5 / totalEffectiveBase))
        : 0;
    // h) IVA sobre cada grupo de comisión
    comisionIva21 = round(comision21 * 0.21);
    comisionIva10_5 = round(comision10_5 * 0.105);
    comisionTotalNeta = round(comisionExenta + comision21 + comision10_5);
  }

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
              <span className="font-semibold">10,5% </span>
              <span className="ml-1 font-light">{formatCurrency(tax105)}</span>
            </li>
            <li>
              <span className="font-semibold">Exento </span>
              <span className="ml-1 font-light">{formatCurrency(exempt)}</span>
            </li>
            <li>
              <span className="font-semibold">Otros Impuestos </span>
              <span className="ml-1 font-light">
                {formatCurrency(otherTaxes)}
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
              <span className="ml-1 font-light">
                {formatCurrency(baseIva21)}
              </span>
            </li>
            <li>
              <span className="font-semibold">Grav. 10,5% </span>
              <span className="ml-1 font-light">
                {formatCurrency(baseIva10_5)}
              </span>
            </li>
          </ul>
          <p className="mt-4 font-semibold">Comisiones</p>
          <ul className="ml-4 list-disc">
            <li>
              <span className="font-semibold">Exenta </span>
              <span className="ml-1 font-light">
                {formatCurrency(comisionExenta)}
              </span>
            </li>
            <li>
              <span className="font-semibold">21% </span>
              <span className="ml-1 font-light">
                {formatCurrency(comision21)}
              </span>
            </li>
            <li>
              <span className="font-semibold">10,5% </span>
              <span className="ml-1 font-light">
                {formatCurrency(comision10_5)}
              </span>
            </li>
          </ul>
          <p className="mt-4 font-semibold">IVA sobre Comisiones</p>
          <ul className="ml-4 list-disc">
            <li>
              <span className="font-semibold">21% </span>
              <span className="ml-1 font-light">
                {formatCurrency(comisionIva21)}
              </span>
            </li>
            <li>
              <span className="font-semibold">10,5% </span>
              <span className="ml-1 font-light">
                {formatCurrency(comisionIva10_5)}
              </span>
            </li>
          </ul>
          <p className="mt-4 font-semibold">
            Total Comisión (sin IVA){" "}
            <span className="ml-1 font-light">
              {formatCurrency(comisionTotalNeta)}
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
