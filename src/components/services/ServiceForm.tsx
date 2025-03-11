// src/components/services/ServiceForm.tsx

"use client";
import { ChangeEvent, FormEvent } from "react";
import { motion } from "framer-motion";
import { Operator } from "@/types";

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
  not_computable?: number;
  taxable_21?: number;
  taxable_105?: number;
  currency: string;
  payment_due_date: string;
  id_operator: number;
  departure_date: string;
  return_date: string;
};

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
};

export default function ServiceForm({
  formData,
  handleChange,
  handleSubmit,
  editingServiceId,
  isFormVisible,
  setIsFormVisible,
  operators,
}: ServiceFormProps) {
  const formatCurrency = (value: number) => {
    if (isNaN(value)) return "";
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: formData.currency || "ARS",
    }).format(value);
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
            <label className="ml-2 block dark:text-white">
              Tipo de Servicio
            </label>
            <select
              name="type"
              value={formData.type}
              onChange={handleChange}
              className="w-full appearance-none rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
              required
            >
              <option value="">Seleccionar tipo</option>
              <option value="Traslado">Traslado</option>
              <option value="Hotelería">Hotelería</option>
              <option value="Aéreo">Aéreo</option>
              <option value="Asistencia Médica">Asistencia Médica</option>
            </select>
          </div>
          <div>
            <label className="ml-2 block dark:text-white">Descripción</label>
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
              <label className="ml-2 block dark:text-white">Destino</label>
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
              <label className="ml-2 block dark:text-white">Referencia</label>
              <input
                type="text"
                name="reference"
                value={formData.reference || ""}
                onChange={handleChange}
                placeholder="Referencia..."
                className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
              />
            </div>
          </div>
          <div>
            <label className="ml-2 block dark:text-white">Desde</label>
            <input
              type="date"
              name="departure_date"
              value={formData.departure_date || ""}
              onChange={handleChange}
              className="w-full appearance-none rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
            />
          </div>
          <div>
            <label className="ml-2 block dark:text-white">Hasta</label>
            <input
              type="date"
              name="return_date"
              value={formData.return_date || ""}
              onChange={handleChange}
              className="w-full appearance-none rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
            />
          </div>
          <div>
            <label className="ml-2 block dark:text-white">Operador</label>
            <select
              name="id_operator"
              value={formData.id_operator || 0}
              onChange={handleChange}
              className="w-full appearance-none rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
            >
              <option value="0">Seleccionar operador</option>
              {operators.map((operator) => (
                <option key={operator.id_operator} value={operator.id_operator}>
                  {operator.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="ml-2 block dark:text-white">Costo</label>
              <input
                type="number"
                name="cost_price"
                value={formData.cost_price || ""}
                onChange={handleChange}
                placeholder="Costo..."
                className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
                step="0.01"
                min="0"
                required
              />
              <p className="ml-2 text-sm dark:text-white">
                {formatCurrency(formData.cost_price)}
              </p>
            </div>
            <div>
              <label className="ml-2 block dark:text-white">Venta</label>
              <input
                type="number"
                name="sale_price"
                value={formData.sale_price || ""}
                onChange={handleChange}
                placeholder="Venta..."
                className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
                step="0.01"
                min="0"
                required
              />
              <p className="ml-2 text-sm dark:text-white">
                {formatCurrency(formData.sale_price)}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="ml-2 block dark:text-white">Tax 21%</label>
              <input
                type="number"
                name="tax_21"
                value={formData.tax_21 || ""}
                onChange={handleChange}
                placeholder="21%..."
                className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
                step="0.01"
                min="0"
              />
              <p className="ml-2 text-sm dark:text-white">
                {formatCurrency(formData.tax_21 || 0)}
              </p>
            </div>
            <div>
              <label className="ml-2 block dark:text-white">Tax 10.5%</label>
              <input
                type="number"
                name="tax_105"
                value={formData.tax_105 || ""}
                onChange={handleChange}
                placeholder="10.5%..."
                className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
                step="0.01"
                min="0"
              />
              <p className="ml-2 text-sm dark:text-white">
                {formatCurrency(formData.tax_105 || 0)}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="ml-2 block dark:text-white">Exento</label>
              <input
                type="number"
                name="exempt"
                value={formData.exempt || ""}
                onChange={handleChange}
                placeholder="Exento..."
                className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
                step="0.01"
                min="0"
              />
              <p className="ml-2 text-sm dark:text-white">
                {formatCurrency(formData.exempt || 0)}
              </p>
            </div>
            <div>
              <label className="ml-2 block dark:text-white">
                No computable
              </label>
              <input
                type="number"
                name="not_computable"
                value={formData.not_computable || ""}
                onChange={handleChange}
                placeholder="No computable..."
                className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
                step="0.01"
                min="0"
              />
              <p className="ml-2 text-sm dark:text-white">
                {formatCurrency(formData.not_computable || 0)}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="ml-2 block dark:text-white">
                Otros Impuestos
              </label>
              <input
                type="number"
                name="other_taxes"
                value={formData.other_taxes || ""}
                onChange={handleChange}
                placeholder="Otros impuestos..."
                className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
                step="0.01"
                min="0"
              />
              <p className="ml-2 text-sm dark:text-white">
                {formatCurrency(formData.other_taxes || 0)}
              </p>
            </div>
            <div>
              <label className="ml-2 block dark:text-white">Moneda</label>
              <select
                name="currency"
                value={formData.currency}
                onChange={handleChange}
                className="w-full appearance-none rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
                required
              >
                <option value="USD">USD</option>
                <option value="ARS">ARS</option>
              </select>
            </div>
          </div>
          <div>
            <label className="ml-2 block dark:text-white">Fecha de Pago</label>
            <input
              type="date"
              name="payment_due_date"
              value={formData.payment_due_date || ""}
              onChange={handleChange}
              className="w-full appearance-none rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
              required
            />
          </div>
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
