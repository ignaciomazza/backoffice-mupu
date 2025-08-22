// src/components/operator-dues/OperatorDueForm.tsx
"use client";
import { motion } from "framer-motion";
import { useMemo, useState, useEffect } from "react";
import { Booking, Service } from "@/types";
import Spinner from "@/components/Spinner";
import { toast } from "react-toastify";
import { authFetch } from "@/utils/authFetch";

type Props = {
  token: string | null;
  booking: Booking;
  availableServices: Service[];
  onCreated?: () => void;
};

const STATUS_OPTS = ["Pendiente", "Pago"] as const;

export default function OperatorDueForm({
  token,
  booking,
  availableServices,
  onCreated,
}: Props) {
  const [isFormVisible, setIsFormVisible] = useState(false);

  // === Servicios de esta reserva (embebidos o provistos) ===
  const servicesFromBooking = useMemo<Service[]>(
    () =>
      (booking.services && booking.services.length > 0
        ? booking.services
        : (availableServices || []).filter(
            (s) =>
              (s as unknown as { booking_id?: number })?.booking_id ===
              booking.id_booking,
          )) ?? [],
    [booking.services, availableServices, booking.id_booking],
  );

  // === Selección de servicio (única) estilo Receipt ===
  const [serviceId, setServiceId] = useState<number | null>(null);
  const selectedService = useMemo(
    () => servicesFromBooking.find((s) => s.id_service === serviceId) || null,
    [servicesFromBooking, serviceId],
  );

  const toggleService = (svc: Service) =>
    setServiceId((curr) => (curr === svc.id_service ? null : svc.id_service));

  // === Campos ===
  const [dueDate, setDueDate] = useState<string>("");
  const [concept, setConcept] = useState<string>("");
  const [status, setStatus] =
    useState<(typeof STATUS_OPTS)[number]>("Pendiente");

  const [amount, setAmount] = useState<string>("");
  const [currency, setCurrency] = useState<string>("ARS");

  const [loading, setLoading] = useState(false);

  // Autocomplete desde servicio + concepto sugerido
  useEffect(() => {
    if (!selectedService) {
      setAmount("");
      setCurrency("ARS");
      return;
    }
    const sugAmount = Number(selectedService.cost_price ?? 0);
    setAmount(sugAmount > 0 ? String(sugAmount) : "");
    setCurrency(selectedService.currency || "ARS");

    if (!concept.trim()) {
      const parts = [
        "Vencimiento pago a operador",
        selectedService.type ? `· ${selectedService.type}` : "",
        selectedService.destination ? `· ${selectedService.destination}` : "",
        `· Servicio N° ${selectedService.id_service}`,
        `· Reserva N° ${booking.id_booking}`,
      ].filter(Boolean);
      setConcept(parts.join(" "));
    }
  }, [selectedService, booking.id_booking]); // eslint-disable-line react-hooks/exhaustive-deps

  // === Helpers UI ===
  const inputBase =
    "w-full rounded-2xl bg-white/50 border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white";

  const formatMoney = (n: number, cur = "ARS") => {
    try {
      return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: cur,
        minimumFractionDigits: 2,
      }).format(n);
    } catch {
      return `${n.toFixed(2)} ${cur}`;
    }
  };

  const previewAmount = useMemo(() => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0 || !currency) return "";
    return formatMoney(n, currency);
  }, [amount, currency]);

  // === Validación ===
  const validate = () => {
    if (!serviceId) return "Seleccioná un servicio.";
    if (!dueDate) return "Indicá la fecha de caducidad.";
    if (!concept.trim()) return "Completá el concepto/descripcion.";
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return "El monto debe ser > 0.";
    if (!currency) return "Seleccioná la moneda.";
    return null;
  };

  // === Submit ===
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const err = validate();
    if (err) return toast.error(err);

    setLoading(true);
    try {
      const payload = {
        bookingId: booking.id_booking,
        serviceId: Number(serviceId),
        dueDate, // YYYY-MM-DD
        concept: concept.trim(),
        status,
        amount: Number(amount),
        currency: currency.toUpperCase(),
      };

      const res = await authFetch(
        "/api/operator-dues",
        { method: "POST", body: JSON.stringify(payload) },
        token,
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg =
          (data as { error?: string; message?: string }).error ||
          (data as { error?: string; message?: string }).message ||
          "No se pudo crear el vencimiento del operador.";
        throw new Error(msg);
      }

      toast.success("Vencimiento creado correctamente.");
      onCreated?.();

      // Reset
      setServiceId(null);
      setDueDate("");
      setConcept("");
      setStatus("Pendiente");
      setAmount("");
      setCurrency("ARS");
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Error al crear vencimiento.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ maxHeight: 100, opacity: 1 }}
      animate={{
        maxHeight: isFormVisible ? 1100 : 100,
        opacity: 1,
        transition: { duration: 0.4, ease: "easeInOut" },
      }}
      className="mb-6 space-y-4 overflow-hidden rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white"
    >
      {/* Header */}
      <div
        className="flex cursor-pointer items-center justify-between"
        onClick={() => setIsFormVisible((v) => !v)}
      >
        <p className="text-lg font-medium dark:text-white">
          {isFormVisible ? "Cerrar Formulario" : "Cargar Vencimiento"}
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
          onSubmit={handleSubmit}
          className="space-y-6"
        >
          {/* Reserva */}
          <div className="text-sm opacity-80">
            <b>Reserva:</b> N° {booking.id_booking}
          </div>

          {/* 1) Servicio (formato Receipt, selección única) */}
          <section className="space-y-2">
            <p className="ml-2 text-xs font-semibold uppercase tracking-wide opacity-70">
              Servicios de la reserva
            </p>
            {servicesFromBooking.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/10 p-3 text-sm opacity-80">
                Esta reserva no tiene servicios cargados.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {servicesFromBooking.map((svc) => {
                  const isActive = serviceId === svc.id_service;
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
                        <b>Costo:</b>{" "}
                        {formatMoney(
                          Number(svc.cost_price ?? 0),
                          svc.currency || "ARS",
                        )}{" "}
                        <span className="opacity-70">
                          ({svc.currency || "ARS"})
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {selectedService && (
              <div className="ml-2 text-xs opacity-70">
                Seleccionado: N° {selectedService.id_service}
              </div>
            )}
          </section>

          {/* 2) Fecha de caducidad */}
          <section>
            <label className="ml-2 block dark:text-white">
              Fecha de caducidad
            </label>
            <input
              type="date"
              className={`${inputBase} cursor-pointer`}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
          </section>

          {/* 3) Concepto/Descripción */}
          <section>
            <label className="ml-2 block dark:text-white">
              Concepto / Descripción
            </label>
            <input
              className={inputBase}
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="Ej: Vencimiento por saldo a operador..."
              required
            />
          </section>

          {/* 4) Estado (pills) */}
          <section>
            <label className="ml-2 block dark:text-white">Estado</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {STATUS_OPTS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setStatus(opt)}
                  className={`rounded-full py-2 text-center text-sm transition-all ${
                    status === opt
                      ? "bg-sky-100 text-sky-950 shadow-sm dark:bg-white/20 dark:text-white"
                      : "bg-white/10 text-sky-950/80 hover:bg-white/20 dark:text-white/80"
                  }`}
                  title={opt}
                >
                  {opt}
                </button>
              ))}
            </div>
          </section>

          {/* 5) Monto + Moneda (OBLIGATORIOS) */}
          <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="ml-2 block dark:text-white">Monto</label>
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                className={inputBase}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
              />
              {previewAmount && (
                <div className="ml-2 mt-1 text-sm opacity-80">
                  {previewAmount}
                </div>
              )}
              {selectedService && (
                <div className="ml-2 mt-1 text-xs opacity-70">
                  Sugerido (costo del servicio):{" "}
                  {formatMoney(
                    Number(selectedService.cost_price ?? 0),
                    selectedService.currency || "ARS",
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="ml-2 block dark:text-white">Moneda</label>
              <select
                className={`${inputBase} cursor-pointer appearance-none`}
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                required
              >
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
              {selectedService && (
                <div className="ml-2 mt-1 text-xs opacity-70">
                  Sugerido por servicio: {selectedService.currency || "ARS"}
                </div>
              )}
            </div>
          </section>

          {/* Acción */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className={`rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white ${
                loading ? "opacity-60" : ""
              }`}
            >
              {loading ? <Spinner /> : "Crear vencimiento"}
            </button>
          </div>
        </motion.form>
      )}
    </motion.div>
  );
}
