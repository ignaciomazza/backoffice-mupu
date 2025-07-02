// src/components/credit-notes/CreditNoteForm.tsx

"use client";
import { motion } from "framer-motion";
import Spinner from "../Spinner";
import { Service } from "@/types";
import { useEffect, useState } from "react";

export type CreditNoteFormData = {
  invoiceId: string;
  tipoNota: string;
  exchangeRate?: string;
  invoiceDate?: string;
};

interface CreditNoteFormProps {
  formData: CreditNoteFormData;
  availableServices: Service[];
  handleChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => void;
  handleSubmit: (e: React.FormEvent) => void;
  isFormVisible: boolean;
  setIsFormVisible: React.Dispatch<React.SetStateAction<boolean>>;
  updateFormData: (
    key: keyof CreditNoteFormData,
    value: CreditNoteFormData[keyof CreditNoteFormData],
  ) => void;
  isSubmitting: boolean;
}

export default function CreditNoteForm({
  formData,
  handleChange,
  handleSubmit,
  isFormVisible,
  setIsFormVisible,
  isSubmitting,
}: CreditNoteFormProps) {
  // date bounds ±5 days
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dMin = new Date(today);
  dMin.setDate(dMin.getDate() - 5);
  const dMax = new Date(today);
  dMax.setDate(dMax.getDate() + 5);
  const minDate = `${dMin.getFullYear()}-${pad(dMin.getMonth() + 1)}-${pad(
    dMin.getDate(),
  )}`;
  const maxDate = `${dMax.getFullYear()}-${pad(dMax.getMonth() + 1)}-${pad(
    dMax.getDate(),
  )}`;

  const [fetchedExchangeRate, setFetchedExchangeRate] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/exchangeRate");
        const data = await res.json();
        if (data.success) {
          setFetchedExchangeRate(data.rate.toString());
        }
      } catch {
        console.error("Error fetching exchange rate");
      }
    })();
  }, []);

  return (
    <motion.div
      layout
      initial={{ maxHeight: 100, opacity: 1 }}
      animate={{
        maxHeight: isFormVisible ? 1000 : 100,
        opacity: 1,
        transition: { duration: 0.4, ease: "easeInOut" },
      }}
      className="mb-6 space-y-3 overflow-hidden rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white"
    >
      <div
        className="flex cursor-pointer items-center justify-between"
        onClick={() => setIsFormVisible(!isFormVisible)}
      >
        <p className="text-lg font-medium dark:text-white">
          {isFormVisible ? "Cerrar Formulario" : "Crear Nota de Crédito"}
        </p>
        <button className="rounded-full bg-sky-100 p-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur">
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
          onSubmit={(e) => {
            e.preventDefault();
            if (!formData.invoiceId || !formData.tipoNota) {
              alert("Por favor, completa todos los campos requeridos.");
              return;
            }
            handleSubmit(e);
          }}
          className="max-h-[800px] space-y-3 overflow-y-auto py-2"
        >
          {/* Invoice ID */}
          <div>
            <label className="ml-2 block dark:text-white">ID de Factura</label>
            <input
              type="text"
              name="invoiceId"
              value={formData.invoiceId}
              onChange={handleChange}
              placeholder="ID de la factura original"
              className="w-full rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
              required
            />
          </div>

          {/* Tipo de Nota */}
          <div>
            <label className="ml-2 block dark:text-white">Tipo de Nota</label>
            <select
              name="tipoNota"
              value={formData.tipoNota}
              onChange={handleChange}
              className="w-full appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
              required
            >
              <option value="">Seleccionar</option>
              <option value="3">Nota de Crédito A</option>
              <option value="8">Nota de Crédito B</option>
            </select>
          </div>

          {/* Fecha de Nota */}
          <div>
            <label className="ml-2 block dark:text-white">Fecha de Nota</label>
            <input
              type="date"
              name="invoiceDate"
              value={formData.invoiceDate || ""}
              onChange={handleChange}
              min={minDate}
              max={maxDate}
              className="w-full rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
              required
            />
          </div>

          {/* Cotización */}
          <div>
            <label className="ml-2 block dark:text-white">
              Cotización del dólar (opcional)
            </label>
            <input
              type="text"
              name="exchangeRate"
              value={formData.exchangeRate || ""}
              onChange={handleChange}
              placeholder={
                fetchedExchangeRate
                  ? `Cotización: ${fetchedExchangeRate}`
                  : "Cotización actual"
              }
              className="w-full rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-4 rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
          >
            {isSubmitting ? <Spinner /> : "Crear Nota"}
          </button>
        </motion.form>
      )}
    </motion.div>
  );
}
