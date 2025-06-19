// src/components/invoices/InvoiceForm.tsx

"use client";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import Spinner from "../Spinner";
import { Service } from "@/types";

export type InvoiceFormData = {
  tipoFactura: string;
  clientIds: string[];
  services: string[];
  exchangeRate?: string;
  description21: string[];
  description10_5: string[];
  descriptionNonComputable: string[];
  invoiceDate?: string;
};

interface InvoiceFormProps {
  formData: InvoiceFormData;
  availableServices: Service[];
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
  isSubmitting: boolean;
}

export default function InvoiceForm({
  formData,
  availableServices,
  handleChange,
  handleSubmit,
  isFormVisible,
  setIsFormVisible,
  updateFormData,
  isSubmitting,
}: InvoiceFormProps) {
  const [clientCount, setClientCount] = useState<number>(1);
  const [serviceCount, setServiceCount] = useState<number>(1);
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

  useEffect(() => {
    const desc21 = [...formData.description21];
    const desc10 = [...formData.description10_5];
    const descNon = [...formData.descriptionNonComputable];

    while (desc21.length < serviceCount) desc21.push("");
    desc21.length = serviceCount;
    while (desc10.length < serviceCount) desc10.push("");
    desc10.length = serviceCount;
    while (descNon.length < serviceCount) descNon.push("");
    descNon.length = serviceCount;

    if (desc21.length !== formData.description21.length) {
      updateFormData("description21", desc21);
    }
    if (desc10.length !== formData.description10_5.length) {
      updateFormData("description10_5", desc10);
    }
    if (descNon.length !== formData.descriptionNonComputable.length) {
      updateFormData("descriptionNonComputable", descNon);
    }
  }, [
    serviceCount,
    formData.description21,
    formData.description10_5,
    formData.descriptionNonComputable,
    updateFormData,
  ]);

  const desc21 = formData.description21;
  const desc10 = formData.description10_5;
  const descNon = formData.descriptionNonComputable;

  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");

  // resta 5 días
  const dMin = new Date(today);
  dMin.setDate(dMin.getDate() - 5);
  const minDate = `${dMin.getFullYear()}-${pad(dMin.getMonth() + 1)}-${pad(dMin.getDate())}`;

  // suma 5 días
  const dMax = new Date(today);
  dMax.setDate(dMax.getDate() + 5);
  const maxDate = `${dMax.getFullYear()}-${pad(dMax.getMonth() + 1)}-${pad(dMax.getDate())}`;

  return (
    <motion.div
      layout
      initial={{ maxHeight: 100, opacity: 1 }}
      animate={{
        maxHeight: isFormVisible ? 1000 : 100,
        opacity: 1,
        transition: { duration: 0.4, ease: "easeInOut" },
      }}
      className="mb-6 space-y-3 overflow-hidden rounded-3xl border border-white/10 bg-white/10 p-6 text-black shadow-md backdrop-blur dark:text-white"
    >
      <div
        className="flex cursor-pointer items-center justify-between"
        onClick={() => setIsFormVisible(!isFormVisible)}
      >
        <p className="text-lg font-medium dark:text-white">
          {isFormVisible ? "Cerrar Formulario" : "Crear Factura"}
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
          className="max-h-[800px] space-y-3 overflow-y-auto"
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
              Fecha de Factura
            </label>
            <input
              type="date"
              name="invoiceDate"
              value={formData.invoiceDate || ""}
              onChange={handleChange}
              min={minDate}
              max={maxDate}
              className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
              required
            />
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
          {Array.from({ length: clientCount }).map((_, idx) => (
            <div key={idx}>
              <label className="ml-2 block dark:text-white">
                ID del Cliente {idx + 1}
              </label>
              <input
                type="text"
                value={formData.clientIds[idx] || ""}
                onChange={(e) => {
                  const arr = [...formData.clientIds];
                  arr[idx] = e.target.value;
                  updateFormData("clientIds", arr);
                }}
                placeholder={`ID del cliente ${idx + 1}`}
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
          {Array.from({ length: serviceCount }).map((_, idx) => {
            const svcId = parseInt(formData.services[idx] || "", 10);
            const svc = availableServices.find((s) => s.id_service === svcId);
            return (
              <div key={idx} className="space-y-2">
                <label className="ml-2 block dark:text-white">
                  ID del Servicio {idx + 1}
                </label>
                <input
                  type="text"
                  value={formData.services[idx] || ""}
                  onChange={(e) => {
                    const arr = [...formData.services];
                    arr[idx] = e.target.value;
                    updateFormData("services", arr);
                  }}
                  placeholder={`ID del servicio ${idx + 1}`}
                  className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
                  required
                />

                <div className="flex w-full gap-2">
                  {(svc?.vatOnCommission21 ?? 0) > 0 && (
                    <div className="basis-1/2">
                      <label className="ml-2 block dark:text-white">
                        Descripción IVA 21% (servicio {idx + 1})
                      </label>
                      <input
                        type="text"
                        value={desc21[idx]}
                        onChange={(e) => {
                          const arr = [...desc21];
                          arr[idx] = e.target.value;
                          updateFormData("description21", arr);
                        }}
                        placeholder="Ej: Excursión guiada 21%"
                        className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
                      />
                    </div>
                  )}

                  {(svc?.vatOnCommission10_5 ?? 0) > 0 && (
                    <div className="basis-1/2">
                      <label className="ml-2 block dark:text-white">
                        Descripción IVA 10.5% (servicio {idx + 1})
                      </label>
                      <input
                        type="text"
                        value={desc10[idx]}
                        onChange={(e) => {
                          const arr = [...desc10];
                          arr[idx] = e.target.value;
                          updateFormData("description10_5", arr);
                        }}
                        placeholder="Ej: Servicio terrestre 10.5%"
                        className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
                      />
                    </div>
                  )}

                  {(svc?.nonComputable ?? 0) > 0 && (
                    <div className="basis-1/2">
                      <label className="ml-2 block dark:text-white">
                        Descripción No Computable
                      </label>
                      <input
                        type="text"
                        value={descNon[idx]}
                        onChange={(e) => {
                          const arr = [...descNon];
                          arr[idx] = e.target.value;
                          updateFormData("descriptionNonComputable", arr);
                        }}
                        placeholder="Ej: Cargo no computable"
                        className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}

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
              className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-black;text-center h-10 w-40 rounded-full text-white transition-transform hover:scale-95 active:scale-90 dark:bg-white dark:text-black"
          >
            {isSubmitting ? <Spinner /> : "Crear Factura"}
          </button>
        </motion.form>
      )}
    </motion.div>
  );
}
