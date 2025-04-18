// src/components/services/ServiceForm.tsx
"use client";

import { ChangeEvent, FormEvent } from "react";
import { motion } from "framer-motion";
import { Operator } from "@/types";
import BillingBreakdown from "../BillingBreakdown";

export type ServiceFormData = {
  type: string;
  description?: string;
  sale_price: number;
  cost_price: number;
  destination?: string;
  reference?: string;
  tax_21?: number;
  tax_105?: number;
  exempt?: number;
  other_taxes?: number;
  currency: string;
  id_operator: number;
  departure_date: string;
  return_date: string;
};

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
}

type ServiceFormProps = {
  formData: ServiceFormData;
  handleChange: (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => void;
  handleSubmit: (e: FormEvent) => void;
  editingServiceId: number | null;
  operators: Operator[];
  isFormVisible: boolean;
  setIsFormVisible: React.Dispatch<React.SetStateAction<boolean>>;
  onBillingUpdate?: (data: BillingData) => void;
};

export default function ServiceForm({
  formData,
  handleChange,
  handleSubmit,
  editingServiceId,
  operators,
  isFormVisible,
  setIsFormVisible,
  onBillingUpdate,
}: ServiceFormProps) {
  const formatCurrency = (value: number) => {
    if (isNaN(value)) return "";
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: formData.currency || "ARS",
    }).format(value);
  };

  const formatIsoToDisplay = (value: string): string => {
    if (!value) return "";
    if (value.includes("/")) return value;
    const parts = value.split("-");
    if (parts.length !== 3) return value;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  const formatDisplayToIso = (display: string): string => {
    const parts = display.split("/");
    if (parts.length !== 3) return display;
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  };

  const handleDateChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value: raw } = e.target;
    const digits = raw.replace(/\D/g, "");
    let formatted = "";
    if (digits.length >= 1) formatted += digits.substring(0, 2);
    if (digits.length >= 3) formatted += "/" + digits.substring(2, 4);
    if (digits.length >= 5) formatted += "/" + digits.substring(4, 8);
    handleChange({
      target: { name, value: formatted },
    } as ChangeEvent<HTMLInputElement>);
  };

  const handleDatePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasteData = e.clipboardData.getData("text").replace(/\D/g, "");
    if (pasteData.length === 8) {
      const day = pasteData.slice(0, 2);
      const month = pasteData.slice(2, 4);
      const year = pasteData.slice(4, 8);
      const formatted = `${day}/${month}/${year}`;
      e.preventDefault();
      handleChange({
        target: { name: e.currentTarget.name, value: formatted },
      } as ChangeEvent<HTMLInputElement>);
    }
  };

  const handleDateBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const iso = formatDisplayToIso(value);
    handleChange({
      target: { name, value: iso },
    } as ChangeEvent<HTMLInputElement>);
  };

  return (
    <motion.div
      layout
      initial={{ maxHeight: 80, opacity: 1 }}
      animate={{
        maxHeight: isFormVisible ? 700 : 80,
        opacity: 1,
        transition: { duration: 0.4, ease: "easeInOut" },
      }}
      className="mb-6 space-y-3 overflow-hidden rounded-3xl p-4 text-black shadow-md dark:border dark:border-white md:p-6"
    >
      <div
        className="flex cursor-pointer items-center justify-between"
        onClick={() => setIsFormVisible(!isFormVisible)}
      >
        <p className="text-lg font-medium dark:text-white">
          {editingServiceId ? "Editar Servicio" : "Agregar Servicio"}
        </p>
        <button className="rounded-full bg-black p-2 text-white transition-transform hover:scale-95 active:scale-90 dark:bg-white dark:text-black">
          {isFormVisible ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="size-6"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
            </svg>
          ) : (
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
          )}
        </button>
      </div>
      {isFormVisible && (
        <motion.form
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onSubmit={handleSubmit}
          className="max-h-[600px] space-y-3 overflow-y-auto md:pr-12"
        >
          <div>
            <label className="ml-2 dark:text-white">Tipo de Servicio</label>
            <select
              name="type"
              value={formData.type}
              onChange={handleChange}
              className="w-full rounded-2xl border border-black p-2 px-3 outline-none hover:cursor-pointer dark:border-white/50 dark:bg-[#252525] dark:text-white"
              required
            >
              <option value="" disabled>
                Seleccionar tipo
              </option>
              <option value="Paquete Argentina">Paquete Argentina</option>
              <option value="Cupo Exterior">Cupo Exterior</option>
              <option value="Aéreo - Internacional">
                Aéreo - Internacional
              </option>
              <option value="Aéreo - Cabotaje">Aéreo - Nacional</option>
              <option value="Hotelería (Nacional)">Hotelería (Nacional)</option>
              <option value="Hotelería (Internacional)">
                Hotelería (Internacional)
              </option>
              <option value="Hotelería y Traslados (Nacional)">
                Hotelería y Traslados (Nacional)
              </option>
              <option value="Hotelería y Traslados (Internacional)">
                Hotelería y Traslados (Internacional)
              </option>
              <option value="Traslados (Nacional)">Traslados (Nacional)</option>
              <option value="Traslados (Exterior)">Traslados (Exterior)</option>
              <option value="Asistencias (Nacional)">
                Asistencias (Nacional)
              </option>
              <option value="Asistencias (Internacional)">
                Asistencias (Internacional)
              </option>
              <option value="Excursiones (Nacional)">
                Excursiones (Nacional)
              </option>
              <option value="Excursiones (Exterior)">
                Excursiones (Exterior)
              </option>
              <option value="Alquiler de Auto (Nacional)">
                Alquiler de Auto (Nacional)
              </option>
              <option value="Alquiler de Auto (Exterior)">
                Alquiler de Auto (Exterior)
              </option>
              <option value="Tour (Nacional)">Tour (Nacional)</option>
              <option value="Tour (Exterior)">Tour (Exterior)</option>
              <option value="Crucero (Internacional)">
                Crucero (Internacional)
              </option>
            </select>
          </div>
          <div>
            <label className="ml-2 dark:text-white">Descripción</label>
            <textarea
              name="description"
              value={formData.description || ""}
              onChange={handleChange}
              className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
              rows={3}
              placeholder="Detalles adicionales del servicio"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="ml-2 dark:text-white">Destino</label>
              <input
                type="text"
                name="destination"
                value={formData.destination || ""}
                onChange={handleChange}
                placeholder="Destino..."
                className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
              />
            </div>
            <div>
              <label className="ml-2 dark:text-white">Referencia</label>
              <input
                type="text"
                name="reference"
                value={formData.reference || ""}
                onChange={handleChange}
                placeholder="Referencia..."
                className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
              />
            </div>
            <div>
              <label className="ml-2 dark:text-white">Desde</label>
              <input
                type="text"
                name="departure_date"
                value={
                  formData.departure_date
                    ? formatIsoToDisplay(formData.departure_date)
                    : ""
                }
                onChange={handleDateChange}
                onPaste={handleDatePaste}
                onBlur={handleDateBlur}
                placeholder="dd/mm/yyyy"
                className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
              />
            </div>
            <div>
              <label className="ml-2 dark:text-white">Hasta</label>
              <input
                type="text"
                name="return_date"
                value={
                  formData.return_date
                    ? formatIsoToDisplay(formData.return_date)
                    : ""
                }
                onChange={handleDateChange}
                onPaste={handleDatePaste}
                onBlur={handleDateBlur}
                placeholder="dd/mm/yyyy"
                className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
              />
            </div>
            <div>
              <label className="ml-2 dark:text-white">Operador</label>
              <select
                name="id_operator"
                value={formData.id_operator || 0}
                onChange={handleChange}
                className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide hover:cursor-pointer dark:border-white/50 dark:bg-[#252525] dark:text-white"
              >
                <option value={0} disabled>
                  Seleccionar operador
                </option>
                {operators.map((op) => (
                  <option key={op.id_operator} value={op.id_operator}>
                    {op.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="ml-2 dark:text-white">Moneda</label>
              <select
                name="currency"
                value={formData.currency}
                onChange={handleChange}
                className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide hover:cursor-pointer dark:border-white/50 dark:bg-[#252525] dark:text-white"
                required
              >
                <option value="" disabled>
                  Seleccionar moneda
                </option>
                <option value="USD">USD</option>
                <option value="ARS">ARS</option>
              </select>
            </div>
            <div>
              <label className="ml-2 dark:text-white">Costo</label>
              <input
                type="number"
                name="cost_price"
                value={formData.cost_price || ""}
                onChange={handleChange}
                placeholder="Costo..."
                step="0.01"
                min="0"
                required
                className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
              />
              <p className="ml-2 text-sm dark:text-white">
                {formatCurrency(formData.cost_price)}
              </p>
            </div>
            <div>
              <label className="ml-2 dark:text-white">Venta</label>
              <input
                type="number"
                name="sale_price"
                value={formData.sale_price || ""}
                onChange={handleChange}
                placeholder="Venta..."
                step="0.01"
                min="0"
                required
                className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
              />
              <p className="ml-2 text-sm dark:text-white">
                {formatCurrency(formData.sale_price)}
              </p>
            </div>
            <div>
              <label className="ml-2 dark:text-white">Tax 21%</label>
              <input
                type="number"
                name="tax_21"
                value={formData.tax_21 || ""}
                onChange={handleChange}
                step="0.01"
                min="0"
                placeholder="21%..."
                className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
              />
              <p className="ml-2 text-sm dark:text-white">
                {formatCurrency(formData.tax_21 || 0)}
              </p>
            </div>
            <div>
              <label className="ml-2 dark:text-white">Tax 10.5%</label>
              <input
                type="number"
                name="tax_105"
                value={formData.tax_105 || ""}
                onChange={handleChange}
                step="0.01"
                min="0"
                placeholder="10.5%..."
                className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
              />
              <p className="ml-2 text-sm dark:text-white">
                {formatCurrency(formData.tax_105 || 0)}
              </p>
            </div>
            <div>
              <label className="ml-2 dark:text-white">Exento</label>
              <input
                type="number"
                name="exempt"
                value={formData.exempt || ""}
                onChange={handleChange}
                step="0.01"
                min="0"
                placeholder="Exento..."
                className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
              />
              <p className="ml-2 text-sm dark:text-white">
                {formatCurrency(formData.exempt || 0)}
              </p>
            </div>
            <div>
              <label className="ml-2 dark:text-white">Otros Impuestos</label>
              <input
                type="number"
                name="other_taxes"
                value={formData.other_taxes || ""}
                onChange={handleChange}
                step="0.01"
                min="0"
                placeholder="Otros impuestos..."
                className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
              />
              <p className="ml-2 text-sm dark:text-white">
                {formatCurrency(formData.other_taxes || 0)}
              </p>
            </div>
          </div>

          {formData.sale_price > 0 && formData.cost_price > 0 && (
            <BillingBreakdown
              importeVenta={formData.sale_price}
              costo={formData.cost_price}
              montoIva21={formData.tax_21 || 0}
              montoIva10_5={formData.tax_105 || 0}
              montoExento={formData.exempt || 0}
              otrosImpuestos={formData.other_taxes || 0}
              moneda={formData.currency || "ARS"}
              onBillingUpdate={onBillingUpdate}
            />
          )}

          <button
            type="submit"
            className="block rounded-full bg-black px-6 py-2 text-center text-white transition-transform hover:scale-95 active:scale-90 dark:bg-white dark:text-black"
          >
            {editingServiceId ? "Guardar Cambios" : "Agregar Servicio"}
          </button>
        </motion.form>
      )}
    </motion.div>
  );
}
