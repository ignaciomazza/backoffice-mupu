// src/components/invoices/InvoiceForm.tsx

"use client";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";

interface InvoiceFormProps {
  formData: {
    tipoFactura: string;
    clientIds: string[];
    services: string[];
    exchangeRate?: string;
  };
  handleChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => void;
  handleSubmit: (e: React.FormEvent) => void;
  isFormVisible: boolean;
  setIsFormVisible: React.Dispatch<React.SetStateAction<boolean>>;
  updateFormData: (key: string, value: any) => void;
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
  const [fetchedExchangeRate, setFetchedExchangeRate] = useState<string>("");

  useEffect(() => {
    const fetchExchangeRate = async () => {
      try {
        const res = await fetch("/api/exchangeRate");
        const data = await res.json();
        if (data.success) {
          setFetchedExchangeRate(data.rate.toString());
          if (!formData.exchangeRate) {
            updateFormData("exchangeRate", data.rate.toString());
          }
        } else {
          console.error("No se pudo obtener la cotización del dólar.");
        }
      } catch (error) {
        console.error("Error fetching exchange rate:", error);
      }
    };
    fetchExchangeRate();
  }, [updateFormData, formData.exchangeRate]);

  return (
    <motion.div
      layout
      initial={{ maxHeight: 80, opacity: 1 }}
      animate={{
        maxHeight: isFormVisible ? 800 : 80,
        opacity: 1,
        transition: { duration: 0.4, ease: "easeInOut" },
      }}
      className="overflow-hidden bg-white dark:bg-black text-black shadow-md rounded-3xl p-6 space-y-4 mb-6 dark:border dark:border-white"
    >
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsFormVisible(!isFormVisible)}
      >
        <p className="text-lg font-medium dark:text-white">
          {isFormVisible ? "Cerrar Formulario" : "Crear Factura"}
        </p>
        <button className="p-2 rounded-full bg-black text-white dark:bg-white dark:text-black transition-transform hover:scale-105 active:scale-100">
          {isFormVisible ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-6 h-6"
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
              className="w-6 h-6"
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
            <label className="block ml-2 dark:text-white">
              Tipo de Factura
            </label>
            <select
              name="tipoFactura"
              value={formData.tipoFactura}
              onChange={handleChange}
              className="w-full p-2 rounded-2xl border border-black outline-none"
              required
            >
              <option value="">Seleccionar</option>
              <option value="1">Factura A</option>
              <option value="6">Factura B</option>
            </select>
          </div>
          <div>
            <label className="block ml-2 dark:text-white">
              Cantidad de Clientes
            </label>
            <input
              type="number"
              value={clientCount}
              min={1}
              onChange={(e) => setClientCount(Number(e.target.value))}
              className="w-full p-2 rounded-2xl border border-black outline-none"
            />
          </div>
          {Array.from({ length: clientCount }).map((_, index) => (
            <div key={index}>
              <label className="block ml-2 dark:text-white">
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
                className="w-full p-2 rounded-2xl border border-black outline-none"
                required
              />
            </div>
          ))}
          <div>
            <label className="block ml-2 dark:text-white">
              Cantidad de Servicios
            </label>
            <input
              type="number"
              value={serviceCount}
              min={1}
              onChange={(e) => setServiceCount(Number(e.target.value))}
              className="w-full p-2 rounded-2xl border border-black outline-none"
            />
          </div>
          {Array.from({ length: serviceCount }).map((_, index) => (
            <div key={index}>
              <label className="block ml-2 dark:text-white">
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
                className="w-full p-2 rounded-2xl border border-black outline-none"
                required
              />
            </div>
          ))}
          <div>
            <label className="block ml-2 dark:text-white">
              Cotización del dólar (opcional)
            </label>
            <input
              type="text"
              name="exchangeRate"
              value={formData.exchangeRate || fetchedExchangeRate || ""}
              onChange={handleChange}
              className="w-full p-2 rounded-2xl border border-black outline-none"
              placeholder="Cotización actual"
            />
            <p className="text-sm ml-2 dark:text-white">
              Valor obtenido de AFIP: {fetchedExchangeRate || "Cargando..."}
            </p>
          </div>
          <button
            type="submit"
            className="block py-2 px-6 rounded-full transition-transform bg-black text-white dark:bg-white dark:text-black hover:scale-105 active:scale-100 text-center"
          >
            Crear Factura
          </button>
        </motion.form>
      )}
    </motion.div>
  );
}
