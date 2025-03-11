// src/components/invoices/InvoiceForm.tsx

"use client";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";

// Definimos el tipo para los datos del formulario de factura
export type InvoiceFormData = {
  tipoFactura: string;
  clientIds: string[];
  services: string[];
  exchangeRate?: string;
};

interface InvoiceFormProps {
  formData: InvoiceFormData;
  handleChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => void;
  handleSubmit: (e: React.FormEvent) => void;
  isFormVisible: boolean;
  setIsFormVisible: React.Dispatch<React.SetStateAction<boolean>>;
  updateFormData: (
    key: keyof InvoiceFormData,
    value: InvoiceFormData[keyof InvoiceFormData],
  ) => void;
}

export default function InvoiceForm({
  formData,
  handleChange,
  handleSubmit,
  isFormVisible,
  setIsFormVisible,
  updateFormData,
}: InvoiceFormProps) {
  const [clientCount, setClientCount] = useState<number>(1);
  const [serviceCount, setServiceCount] = useState<number>(1);
  // Guarda el valor obtenido de AFIP, sin forzar su copia al input
  const [fetchedExchangeRate, setFetchedExchangeRate] = useState<string>("");

  // Función que consulta la cotización y actualiza el estado local
  const fetchExchangeRate = async () => {
    try {
      const res = await fetch("/api/exchangeRate");
      const data = await res.json();
      if (data.success) {
        setFetchedExchangeRate(data.rate.toString());
      } else {
        console.error("No se pudo obtener la cotización del dólar.");
      }
    } catch (error) {
      console.error("Error fetching exchange rate:", error);
    }
  };

  // Ejecuta el fetch solo una vez al montar el componente
  useEffect(() => {
    fetchExchangeRate();
  }, []);

  return (
    <motion.div
      layout
      initial={{ maxHeight: 80, opacity: 1 }}
      animate={{
        maxHeight: isFormVisible ? 800 : 80,
        opacity: 1,
        transition: { duration: 0.4, ease: "easeInOut" },
      }}
      className="mb-6 space-y-4 overflow-hidden rounded-3xl bg-white p-6 text-black shadow-md dark:border dark:border-white dark:bg-black"
    >
      <div
        className="flex cursor-pointer items-center justify-between"
        onClick={() => setIsFormVisible(!isFormVisible)}
      >
        <p className="text-lg font-medium dark:text-white">
          {isFormVisible ? "Cerrar Formulario" : "Crear Factura"}
        </p>
        <button className="rounded-full bg-black p-2 text-white transition-transform hover:scale-105 active:scale-100 dark:bg-white dark:text-black">
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
            if (
              !formData.tipoFactura ||
              formData.clientIds.length === 0 ||
              formData.services.length === 0
            ) {
              alert("Por favor, completa todos los campos requeridos.");
              return;
            }
            handleSubmit(e);
          }}
          className="space-y-4"
        >
          <div>
            <label className="ml-2 block dark:text-white">
              Tipo de Factura
            </label>
            <select
              name="tipoFactura"
              value={formData.tipoFactura}
              onChange={handleChange}
              className="w-full appearance-none rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
              required
            >
              <option value="">Seleccionar</option>
              <option value="1">Factura A</option>
              <option value="6">Factura B</option>
            </select>
          </div>
          <div>
            <label className="ml-2 block dark:text-white">
              Cantidad de Clientes
            </label>
            <input
              type="number"
              value={clientCount}
              min={1}
              onChange={(e) => setClientCount(Number(e.target.value))}
              placeholder="Cantidad de clientes..."
              className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
            />
          </div>
          {Array.from({ length: clientCount }).map((_, index) => (
            <div key={index}>
              <label className="ml-2 block dark:text-white">
                ID del Cliente {index + 1}
              </label>
              <input
                type="text"
                value={formData.clientIds[index] || ""}
                onChange={(e) => {
                  const updatedClientIds = [...formData.clientIds];
                  updatedClientIds[index] = e.target.value;
                  updateFormData("clientIds", updatedClientIds);
                }}
                placeholder={`ID del cliente ${index + 1}`}
                className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
                required
              />
            </div>
          ))}
          <div>
            <label className="ml-2 block dark:text-white">
              Cantidad de Servicios
            </label>
            <input
              type="number"
              value={serviceCount}
              min={1}
              onChange={(e) => setServiceCount(Number(e.target.value))}
              placeholder="Cantidad de servicios..."
              className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
            />
          </div>
          {Array.from({ length: serviceCount }).map((_, index) => (
            <div key={index}>
              <label className="ml-2 block dark:text-white">
                ID del Servicio {index + 1}
              </label>
              <input
                type="text"
                value={formData.services[index] || ""}
                onChange={(e) => {
                  const updatedServices = [...formData.services];
                  updatedServices[index] = e.target.value;
                  updateFormData("services", updatedServices);
                }}
                placeholder={`ID del servicio ${index + 1}`}
                className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
                required
              />
            </div>
          ))}
          <div>
            <label className="ml-2 block dark:text-white">
              Cotización del dólar (opcional)
            </label>
            <div className="flex items-center space-x-2">
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
                className="w-full appearance-none rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
              />
            </div>
            <p className="ml-2 text-sm dark:text-white">
              Valor obtenido de AFIP: {fetchedExchangeRate || "Cargando..."}
            </p>
          </div>
          <button
            type="submit"
            className="block rounded-full bg-black px-6 py-2 text-center text-white transition-transform hover:scale-105 active:scale-100 dark:bg-white dark:text-black"
          >
            Crear Factura
          </button>
        </motion.form>
      )}
    </motion.div>
  );
}
