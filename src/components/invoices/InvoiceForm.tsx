// src/components/invoices/InvoiceForm.tsx
"use client";
import { motion } from "framer-motion";
import { useState, useEffect, useMemo } from "react";
import Spinner from "@/components/Spinner";
import { Client, Service } from "@/types";
import ClientPicker from "@/components/clients/ClientPicker";

export type InvoiceFormData = {
  tipoFactura: string;
  clientIds: string[]; // ids de clientes como string
  services: string[]; // ids de servicios como string
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
  token?: string | null;
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
  token,
}: InvoiceFormProps) {
  // ====== Cotización ======
  const [fetchedExchangeRate, setFetchedExchangeRate] = useState<string>("");
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/exchangeRate");
        const data = await res.json();
        if (data.success) setFetchedExchangeRate(String(data.rate));
      } catch {
        console.error("Error fetching exchange rate");
      }
    })();
  }, []);

  // ====== Helpers ======
  const arraysEqual = (a: string[], b: string[]) =>
    a.length === b.length && a.every((v, i) => v === b[i]);

  // ====== Servicios (picker múltiple) ======
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>(
    () =>
      formData.services
        ?.map((s) => parseInt(s, 10))
        .filter((n) => Number.isFinite(n)) || [],
  );

  // Reflejar cambios externos de formData.services en el estado local
  useEffect(() => {
    const nums =
      formData.services
        ?.map((s) => parseInt(s, 10))
        .filter((n) => Number.isFinite(n)) || [];
    setSelectedServiceIds((prev) =>
      prev.length === nums.length && prev.every((v, i) => v === nums[i])
        ? prev
        : nums,
    );
  }, [formData.services]);

  // Sincronizar estado local -> formData (post-render, con guardas)
  useEffect(() => {
    const next = selectedServiceIds.map(String);
    const curr = formData.services || [];
    if (!arraysEqual(next, curr)) {
      updateFormData("services", next);
    }
  }, [selectedServiceIds, formData.services, updateFormData]);

  const selectedServices = useMemo(
    () =>
      availableServices.filter((s) =>
        selectedServiceIds.includes(s.id_service),
      ),
    [availableServices, selectedServiceIds],
  );

  const toggleService = (svc: Service) => {
    setSelectedServiceIds((prev) =>
      prev.includes(svc.id_service)
        ? prev.filter((id) => id !== svc.id_service)
        : [...prev, svc.id_service],
    );
  };

  // Ajustar longitudes de descripciones según cantidad de servicios seleccionados
  useEffect(() => {
    const count = selectedServiceIds.length;

    const resize = (arr: string[]) => {
      const copy = [...(arr || [])];
      while (copy.length < count) copy.push("");
      copy.length = count;
      return copy;
    };

    const next21 = resize(formData.description21 || []);
    const next10 = resize(formData.description10_5 || []);
    const nextNon = resize(formData.descriptionNonComputable || []);

    if ((formData.description21 || []).length !== next21.length) {
      updateFormData("description21", next21);
    }
    if ((formData.description10_5 || []).length !== next10.length) {
      updateFormData("description10_5", next10);
    }
    if ((formData.descriptionNonComputable || []).length !== nextNon.length) {
      updateFormData("descriptionNonComputable", nextNon);
    }
  }, [
    selectedServiceIds.length,
    formData.description21,
    formData.description10_5,
    formData.descriptionNonComputable,
    updateFormData,
  ]);

  // accesos cortos (siempre seguros)
  const desc21 = formData.description21 || [];
  const desc10 = formData.description10_5 || [];
  const descNon = formData.descriptionNonComputable || [];

  // ====== Clientes (picker múltiple) ======
  const [clientCount, setClientCount] = useState<number>(
    Math.max(1, formData.clientIds?.length || 1),
  );

  // Mantener formData.clientIds con el tamaño elegido
  useEffect(() => {
    const arr = [...(formData.clientIds || [])];
    while (arr.length < clientCount) arr.push("");
    arr.length = clientCount;
    if (!arraysEqual(arr, formData.clientIds || [])) {
      updateFormData("clientIds", arr);
    }
  }, [clientCount, formData.clientIds, updateFormData]);

  const setClientAt = (idx: number, c: Client | null) => {
    const arr = [...(formData.clientIds || [])];
    arr[idx] = c ? String(c.id_client) : "";
    updateFormData("clientIds", arr);
  };

  const excludeForIndex = (idx: number) =>
    (formData.clientIds || [])
      .filter((_, i) => i !== idx)
      .filter(Boolean)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n)) as number[];

  // ====== Fecha mínima/máxima ======
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dMin = new Date(today);
  dMin.setDate(dMin.getDate() - 5);
  const minDate = `${dMin.getFullYear()}-${pad(dMin.getMonth() + 1)}-${pad(dMin.getDate())}`;
  const dMax = new Date(today);
  dMax.setDate(dMax.getDate() + 5);
  const maxDate = `${dMax.getFullYear()}-${pad(dMax.getMonth() + 1)}-${pad(dMax.getDate())}`;

  const input =
    "w-full appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white";

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
          {isFormVisible ? "Cerrar Formulario" : "Crear Factura"}
        </p>
        <button className="rounded-full bg-sky-100 p-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white">
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
            const hasClients = (formData.clientIds || []).some(
              (v) => v && v.trim(),
            );
            const hasServices = selectedServiceIds.length > 0;
            if (!formData.tipoFactura || !hasClients || !hasServices) {
              alert(
                "Completá tipo de factura, al menos un cliente y al menos un servicio.",
              );
              return;
            }
            handleSubmit(e);
          }}
          className="max-h-[800px] space-y-3 overflow-y-auto py-2"
        >
          {/* Tipo de factura */}
          <div>
            <label className="ml-2 block dark:text-white">
              Tipo de Factura
            </label>
            <select
              name="tipoFactura"
              value={formData.tipoFactura}
              onChange={handleChange}
              className={`${input} appearance-none`}
              required
            >
              <option value="">Seleccionar</option>
              <option value="1">Factura A</option>
              <option value="6">Factura B</option>
            </select>
          </div>

          {/* Fecha */}
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
              className={input}
              required
            />
          </div>

          {/* Clientes */}
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
              className={input}
            />
          </div>

          {Array.from({ length: clientCount }).map((_, idx) => (
            <div key={idx}>
              <ClientPicker
                token={token}
                label={`Cliente ${idx + 1}`}
                placeholder="Buscar por ID, DNI, Pasaporte, CUIT o nombre..."
                valueId={
                  formData.clientIds?.[idx]
                    ? parseInt(formData.clientIds[idx]!, 10)
                    : null
                }
                excludeIds={excludeForIndex(idx)}
                onSelect={(c) => setClientAt(idx, c)}
                onClear={() => setClientAt(idx, null)}
                required
              />
            </div>
          ))}

          {/* Servicios */}
          <div>
            <label className="ml-2 block dark:text-white">
              Servicios de la reserva
            </label>
            {availableServices.length === 0 ? (
              <div className="mt-2 rounded-2xl border border-white/10 bg-white/10 p-3 text-sm opacity-80">
                Esta reserva no tiene servicios cargados.
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                {availableServices.map((svc) => {
                  const isActive = selectedServiceIds.includes(svc.id_service);
                  return (
                    <button
                      type="button"
                      key={svc.id_service}
                      onClick={() => toggleService(svc)}
                      className={`rounded-2xl border p-3 text-left transition-all ${
                        isActive
                          ? "border-sky-300/40 bg-sky-100 text-sky-950 shadow-sm dark:bg-white/10 dark:text-white"
                          : "border-white/10 bg-white/10 hover:bg-white/20 dark:border-white/10 dark:bg-white/10"
                      }`}
                      title={`Servicio N° ${svc.id_service}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium">
                          #{svc.id_service} · {svc.type}
                          {svc.destination ? ` · ${svc.destination}` : ""}
                        </div>
                        {isActive && (
                          <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs text-sky-900 dark:bg-white/20 dark:text-white">
                            seleccionado
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-sm opacity-80">
                        <b>Venta:</b>{" "}
                        {new Intl.NumberFormat("es-AR", {
                          style: "currency",
                          currency: svc.currency || "ARS",
                          minimumFractionDigits: 2,
                        }).format(
                          (svc.sale_price ?? 0) + (svc.card_interest ?? 0),
                        )}
                        <span className="opacity-70">
                          {" "}
                          ({svc.currency || "ARS"})
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {selectedServices.length > 0 && (
              <div className="ml-2 mt-2 text-xs opacity-70">
                Seleccionados:{" "}
                {selectedServices.map((s) => `N° ${s.id_service}`).join(", ")}
              </div>
            )}
          </div>

          {/* Descripciones por servicio */}
          {selectedServices.map((svc, idx) => (
            <div key={svc.id_service} className="space-y-2">
              <div className="ml-2 text-sm font-medium opacity-80">
                Detalles del servicio #{svc.id_service}
              </div>

              <div className="flex w-full flex-col gap-2 md:flex-row">
                {(svc?.vatOnCommission21 ?? 0) > 0 && (
                  <div className="md:basis-1/2">
                    <label className="ml-2 block dark:text-white">
                      Descripción IVA 21% (servicio {idx + 1})
                    </label>
                    <input
                      type="text"
                      value={desc21[idx] || ""}
                      onChange={(e) => {
                        const arr = [...desc21];
                        arr[idx] = e.target.value;
                        updateFormData("description21", arr);
                      }}
                      placeholder="Ej: Excursión guiada 21%"
                      className={input}
                    />
                  </div>
                )}

                {(svc?.vatOnCommission10_5 ?? 0) > 0 && (
                  <div className="md:basis-1/2">
                    <label className="ml-2 block dark:text-white">
                      Descripción IVA 10.5% (servicio {idx + 1})
                    </label>
                    <input
                      type="text"
                      value={desc10[idx] || ""}
                      onChange={(e) => {
                        const arr = [...desc10];
                        arr[idx] = e.target.value;
                        updateFormData("description10_5", arr);
                      }}
                      placeholder="Ej: Servicio terrestre 10.5%"
                      className={input}
                    />
                  </div>
                )}

                {(svc?.nonComputable ?? 0) > 0 && (
                  <div className="md:basis-1/2">
                    <label className="ml-2 block dark:text-white">
                      Descripción No Computable
                    </label>
                    <input
                      type="text"
                      value={descNon[idx] || ""}
                      onChange={(e) => {
                        const arr = [...descNon];
                        arr[idx] = e.target.value;
                        updateFormData("descriptionNonComputable", arr);
                      }}
                      placeholder="Ej: Cargo no computable"
                      className={input}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Cotización (opcional) */}
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
              className={input}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-4 rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white"
          >
            {isSubmitting ? <Spinner /> : "Crear Factura"}
          </button>
        </motion.form>
      )}
    </motion.div>
  );
}
