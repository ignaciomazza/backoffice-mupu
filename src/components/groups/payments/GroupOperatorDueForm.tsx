// src/components/groups/payments/GroupOperatorDueForm.tsx
"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState, useEffect, useRef, type ReactNode } from "react";
import { Booking, Service } from "@/types";
import Spinner from "@/components/Spinner";
import { toast } from "react-toastify";
import { authFetch } from "@/utils/authFetch";

type Props = {
  token: string | null;
  booking: Booking;
  groupId?: string;
  groupPassengerId?: number | null;
  groupDepartureId?: number | null;
  availableServices: Service[];
  onCreated?: () => void;
};

const STATUS_OPTS = [
  { value: "PENDIENTE", label: "Pendiente" },
  { value: "PAGADA", label: "Pagada" },
] as const;
type StatusValue = (typeof STATUS_OPTS)[number]["value"];

const Section = ({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: ReactNode;
}) => (
  <section className="rounded-2xl border border-sky-200/70 bg-white/75 p-5 shadow-sm shadow-sky-100/40 backdrop-blur-sm dark:border-sky-900/40 dark:bg-slate-900/55">
    <div className="mb-4">
      <h3 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-slate-100 md:text-base">
        {title}
      </h3>
      {desc && (
        <p className="mt-1 text-[11px] font-light leading-relaxed text-slate-600 dark:text-slate-400 md:text-xs">
          {desc}
        </p>
      )}
    </div>
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-7">{children}</div>
  </section>
);

const Field = ({
  id,
  label,
  hint,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) => (
  <div className="space-y-2">
    <label
      htmlFor={id}
      className="ml-1 block text-[13px] font-medium text-slate-900 dark:text-slate-100 md:text-sm"
    >
      {label} {required && <span className="text-rose-600">*</span>}
    </label>
    {children}
    {hint && (
      <p className="ml-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400 md:text-xs">
        {hint}
      </p>
    )}
  </div>
);

export default function GroupOperatorDueForm({
  token,
  booking,
  groupId,
  groupPassengerId = null,
  groupDepartureId = null,
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
  const [status, setStatus] = useState<StatusValue>("PENDIENTE");

  const [amount, setAmount] = useState<string>("");
  const [currency, setCurrency] = useState<string>("ARS");

  const [loading, setLoading] = useState(false);
  const lastSuggestedServiceIdRef = useRef<number | null>(null);

  // Autocomplete desde servicio + concepto sugerido
  useEffect(() => {
    if (!selectedService) {
      setAmount("");
      setCurrency("ARS");
      lastSuggestedServiceIdRef.current = null;
      return;
    }
    const serviceChanged = lastSuggestedServiceIdRef.current !== selectedService.id_service;
    if (!serviceChanged) return;
    lastSuggestedServiceIdRef.current = selectedService.id_service;

    const sugAmount = Number(selectedService.cost_price ?? 0);
    setAmount(sugAmount > 0 ? String(sugAmount) : "");
    setCurrency(selectedService.currency || "ARS");

    if (!concept.trim()) {
      const parts = [
        "Vencimiento pago a operador",
        selectedService.type ? `· ${selectedService.type}` : "",
        selectedService.destination ? `· ${selectedService.destination}` : "",
        `· Servicio N° ${
          selectedService.agency_service_id ?? selectedService.id_service
        }`,
        `· Reserva N° ${booking.agency_booking_id ?? booking.id_booking}`,
      ].filter(Boolean);
      setConcept(parts.join(" "));
    }
  }, [selectedService, booking.id_booking, booking.agency_booking_id, concept]);

  // === Helpers UI ===
  const inputBase =
    "w-full rounded-xl border border-slate-300/90 bg-white/95 p-2 px-3 text-slate-900 outline-none shadow-sm shadow-sky-100/40 transition placeholder:font-light focus:border-sky-400 focus:ring-2 focus:ring-sky-200/50 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-100 dark:focus:border-sky-500 dark:focus:ring-sky-900/40";

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

  const dueDateLabel = useMemo(() => {
    if (!dueDate) return "";
    const dt = new Date(`${dueDate}T00:00:00.000Z`);
    return Number.isNaN(dt.getTime())
      ? dueDate
      : dt.toLocaleDateString("es-AR", { timeZone: "UTC" });
  }, [dueDate]);

  const headerPills = useMemo(() => {
    const pills: JSX.Element[] = [];
    if (selectedService) {
      pills.push(
        <span
          key="service"
          className="rounded-full border border-sky-200/70 bg-sky-50/45 px-3 py-1 text-[11px] font-medium text-slate-700 dark:border-sky-900/40 dark:bg-slate-900/55 dark:text-slate-200 md:text-xs"
        >
          Servicio N°{" "}
          {selectedService.agency_service_id ?? selectedService.id_service}
        </span>,
      );
    }
    if (previewAmount) {
      pills.push(
        <span
          key="amount"
          className="rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 md:text-xs"
        >
          {previewAmount}
        </span>,
      );
    }
    if (dueDateLabel) {
      pills.push(
        <span
          key="due"
          className="rounded-full border border-sky-200/70 bg-sky-50/45 px-3 py-1 text-[11px] font-medium text-slate-700 dark:border-sky-900/40 dark:bg-slate-900/55 dark:text-slate-200 md:text-xs"
        >
          Vence {dueDateLabel}
        </span>,
      );
    }
    const statusLabel =
      STATUS_OPTS.find((opt) => opt.value === status)?.label ?? status;
    pills.push(
      <span
        key="status"
        className="rounded-full border border-sky-200/70 bg-sky-50/45 px-3 py-1 text-[11px] font-medium text-slate-700 dark:border-sky-900/40 dark:bg-slate-900/55 dark:text-slate-200 md:text-xs"
      >
        {statusLabel}
      </span>,
    );
    return pills;
  }, [selectedService, previewAmount, dueDateLabel, status]);

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
        serviceId: Number(serviceId),
        dueDate, // YYYY-MM-DD
        concept: concept.trim(),
        status,
        amount: Number(amount),
        currency: currency.toUpperCase(),
        passengerId: groupPassengerId ?? undefined,
        departureId: groupDepartureId ?? undefined,
      };
      const endpoint = groupId
        ? `/api/groups/${encodeURIComponent(groupId)}/finance/operator-dues`
        : "/api/operator-dues";
      if (!groupId) {
        (payload as { bookingId?: number }).bookingId = booking.id_booking;
      }

      const res = await authFetch(
        endpoint,
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
      setStatus("PENDIENTE");
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
      initial={{ maxHeight: 96, opacity: 1 }}
      animate={{
        maxHeight: isFormVisible ? 1400 : 96,
        opacity: 1,
        transition: { duration: 0.35, ease: "easeInOut" },
      }}
      className="mb-8 overflow-auto rounded-3xl border border-sky-200/80 bg-white/75 text-slate-900 shadow-sm shadow-sky-100/40 backdrop-blur-sm dark:border-sky-900/40 dark:bg-slate-900/55 dark:text-slate-100"
    >
      <div
        className={`sticky top-0 z-10 ${isFormVisible ? "rounded-t-3xl border-b" : ""} border-sky-200/70 bg-white/65 px-5 py-4 backdrop-blur-sm dark:border-sky-900/40 dark:bg-slate-900/50 md:px-6`}
      >
        <button
          type="button"
          onClick={() => setIsFormVisible((v) => !v)}
          className="flex w-full items-center justify-between text-left"
          aria-expanded={isFormVisible}
          aria-controls="operator-due-form-body"
        >
          <div className="flex items-center gap-3.5">
            <div className="grid size-9 place-items-center rounded-full border border-sky-300/70 bg-sky-100/80 text-sky-900 shadow-sm shadow-sky-100/70 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-100">
              {isFormVisible ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="size-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="size-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4.5v15m7.5-7.5h-15"
                  />
                </svg>
              )}
            </div>
            <div>
              <p className="text-base font-semibold leading-tight md:text-lg">
                {isFormVisible ? "Vencimientos de operador" : "Cargar vencimiento"}
              </p>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 md:text-xs">
                Reserva N° {booking.agency_booking_id ?? booking.id_booking}
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-2 md:flex">{headerPills}</div>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {isFormVisible && (
          <motion.form
            id="operator-due-form-body"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onSubmit={handleSubmit}
            className="space-y-8 px-5 pb-8 pt-6 md:space-y-9 md:px-6"
          >
            <Section
              title="Servicios"
              desc="Seleccioná el servicio asociado al vencimiento."
            >
              <div className="md:col-span-2">
                {servicesFromBooking.length === 0 ? (
                  <div className="rounded-xl border border-sky-200/70 bg-sky-50/45 p-4 text-[13px] text-slate-700 dark:border-sky-900/40 dark:bg-slate-900/55 dark:text-slate-300 md:text-sm">
                    Esta reserva no tiene servicios cargados.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {servicesFromBooking.map((svc) => {
                      const isActive = serviceId === svc.id_service;
                      return (
                        <button
                          type="button"
                          key={svc.id_service}
                          onClick={() => toggleService(svc)}
                          aria-pressed={isActive}
                          className={`rounded-2xl border px-4 py-3 text-left text-[13px] shadow-sm transition md:text-sm ${
                            isActive
                              ? "border-sky-300/80 bg-sky-100/70 text-slate-900 shadow-sky-100/60 dark:border-sky-700 dark:bg-sky-900/25 dark:text-slate-100"
                              : "border-slate-300/70 bg-white/80 text-slate-800 shadow-slate-900/10 hover:border-sky-200/70 hover:bg-sky-50/45 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-sky-900/40 dark:hover:bg-slate-800/70"
                          }`}
                          title={`Servicio N° ${
                            svc.agency_service_id ?? svc.id_service
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-[13px] font-medium leading-snug md:text-sm">
                              N° {svc.agency_service_id ?? svc.id_service} ·{" "}
                              {svc.type}
                              {svc.destination ? ` · ${svc.destination}` : ""}
                            </div>
                            {isActive && (
                              <span className="rounded-full border border-sky-300/80 bg-sky-100/80 px-2 py-0.5 text-[11px] text-sky-900 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-100 md:text-xs">
                                seleccionado
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-[13px] leading-relaxed text-slate-700 dark:text-slate-300 md:text-sm">
                            <b>Costo:</b>{" "}
                            {formatMoney(
                              Number(svc.cost_price ?? 0),
                              svc.currency || "ARS",
                            )}{" "}
                            <span className="text-slate-500 dark:text-slate-400">
                              ({svc.currency || "ARS"})
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                {selectedService && (
                  <div className="ml-1 mt-2 text-[11px] text-slate-600 dark:text-slate-400 md:text-xs">
                    Seleccionado: N°{" "}
                    {selectedService.agency_service_id ??
                      selectedService.id_service}
                  </div>
                )}
              </div>
            </Section>

            <Section
              title="Fecha y estado"
              desc="Definí cuándo vence y el estado inicial."
            >
              <Field id="due_date" label="Fecha de vencimiento" required>
                <input
                  id="due_date"
                  type="date"
                  className={`${inputBase} cursor-pointer`}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  required
                />
              </Field>

              <Field id="status" label="Estado" required>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {STATUS_OPTS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setStatus(opt.value)}
                      className={`rounded-full py-2 text-center text-[13px] transition md:text-sm ${
                        status === opt.value
                          ? "border border-sky-300/80 bg-sky-100/80 text-sky-900 shadow-sm shadow-sky-100/50 dark:border-sky-700 dark:bg-sky-900/25 dark:text-sky-100"
                          : "border border-slate-300/70 bg-white/80 text-slate-600 hover:bg-sky-50/45 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800/70"
                      }`}
                      title={opt.label}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </Field>
            </Section>

            <Section
              title="Detalle"
              desc="Concepto visible para identificar el vencimiento."
            >
              <div className="md:col-span-2">
                <Field
                  id="concept"
                  label="Concepto / Descripción"
                  required
                >
                  <input
                    id="concept"
                    className={inputBase}
                    value={concept}
                    onChange={(e) => setConcept(e.target.value)}
                    placeholder="Ej: Vencimiento por saldo a operador..."
                    required
                  />
                </Field>
              </div>
            </Section>

            <Section
              title="Importe"
              desc="Monto y moneda del vencimiento."
            >
              <Field id="amount" label="Monto" required>
                <input
                  id="amount"
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
                  <p className="ml-1 mt-1 text-xs text-slate-600 dark:text-slate-400">
                    {previewAmount}
                  </p>
                )}
                {selectedService && (
                  <p className="ml-1 mt-1 text-xs text-slate-600 dark:text-slate-400">
                    Sugerido (costo del servicio):{" "}
                    {formatMoney(
                      Number(selectedService.cost_price ?? 0),
                      selectedService.currency || "ARS",
                    )}
                  </p>
                )}
              </Field>

              <Field id="currency" label="Moneda" required>
                <select
                  id="currency"
                  className={`${inputBase} cursor-pointer appearance-none`}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  required
                >
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                </select>
                {selectedService && (
                  <p className="ml-1 mt-1 text-xs text-slate-600 dark:text-slate-400">
                    Sugerido por servicio: {selectedService.currency || "ARS"}
                  </p>
                )}
              </Field>
            </Section>

            <div className="sticky bottom-0 z-10 -mx-5 flex justify-end border-t border-sky-200/70 bg-white/70 px-5 py-4 backdrop-blur-sm dark:border-sky-900/40 dark:bg-slate-900/55 md:-mx-6 md:px-6">
              <button
                type="submit"
                disabled={loading}
                className={`rounded-full border px-6 py-2 text-[13px] font-semibold transition active:scale-[0.98] md:text-sm ${
                  loading
                    ? "cursor-not-allowed border-slate-300/60 bg-slate-200 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                    : "border-sky-300/80 bg-sky-100/80 text-sky-900 shadow-sm shadow-sky-100/60 hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-900/25 dark:text-sky-100 dark:hover:bg-sky-900/35"
                }`}
              >
                {loading ? <Spinner /> : "Crear vencimiento"}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
