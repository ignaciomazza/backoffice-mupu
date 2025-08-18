// src/components/investments/OperatorPaymentForm.tsx
"use client";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState, useCallback } from "react";
import { Booking, Operator, Service } from "@/types";
import { toast } from "react-toastify";
import Spinner from "@/components/Spinner";
import { authFetch } from "@/utils/authFetch";

type Props = {
  token: string | null;
  booking: Booking;
  availableServices: Service[];
  operators: Operator[];
  onCreated?: () => void;
};

export default function OperatorPaymentForm({
  token,
  booking,
  availableServices,
  operators,
  onCreated,
}: Props) {
  const [isFormVisible, setIsFormVisible] = useState(false);

  // === Servicios sólo de esta reserva ===
  const servicesFromBooking = useMemo<Service[]>(() => {
    // Preferir services embebidos en booking, si existen
    const embedded = (booking as unknown as { services?: Service[] })?.services;
    if (embedded && Array.isArray(embedded) && embedded.length > 0) {
      return embedded;
    }
    // Fallback: filtrar por booking_id en availableServices
    return (availableServices || []).filter(
      (s) =>
        (s as unknown as { booking_id?: number })?.booking_id ===
        booking.id_booking,
    );
  }, [booking, availableServices]);

  // === Selección múltiple de servicios ===
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const selectedServices = useMemo(
    () => servicesFromBooking.filter((s) => selectedIds.includes(s.id_service)),
    [servicesFromBooking, selectedIds],
  );

  // === Campos (monto como string, estilo investments) ===
  const [amount, setAmount] = useState<string>("");
  const [currency, setCurrency] = useState<string>("ARS");
  const [paidAt, setPaidAt] = useState<string>("");
  const [operatorId, setOperatorId] = useState<number | "">("");
  const [description, setDescription] = useState<string>("");

  const [loading, setLoading] = useState(false);

  // === Derivados/sugeridos a partir de la selección ===
  const operatorIdFromSelection = useMemo<number | null>(() => {
    if (selectedServices.length === 0) return null;
    const first = selectedServices[0].id_operator;
    const allSame = selectedServices.every((s) => s.id_operator === first);
    return allSame ? (first ?? null) : null;
  }, [selectedServices]);

  const allSameCurrency = useMemo<boolean>(() => {
    if (selectedServices.length === 0) return true;
    const set = new Set(selectedServices.map((s) => s.currency || "ARS"));
    return set.size === 1;
  }, [selectedServices]);

  const suggestedCurrency = useMemo<string | null>(() => {
    if (!allSameCurrency || selectedServices.length === 0) return null;
    return selectedServices[0].currency || "ARS";
  }, [selectedServices, allSameCurrency]);

  const suggestedAmount = useMemo<number>(() => {
    return selectedServices.reduce((sum, s) => sum + (s.cost_price ?? 0), 0);
  }, [selectedServices]);

  const formatMoney = useCallback(
    (n: number, cur = "ARS") =>
      new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: cur,
        minimumFractionDigits: 2,
      }).format(n),
    [],
  );

  const previewAmount = useMemo(() => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return "";
    try {
      return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: currency || "ARS",
        minimumFractionDigits: 2,
      }).format(n);
    } catch {
      return `${n.toFixed(2)} ${currency}`;
    }
  }, [amount, currency]);

  // Al cambiar la selección, proponemos sugeridos coherentes
  useEffect(() => {
    // operador
    if (operatorIdFromSelection != null) {
      setOperatorId(operatorIdFromSelection);
    } else if (selectedServices.length === 0) {
      setOperatorId("");
    } else {
      // selección con operadores distintos => limpiar para forzar elección
      setOperatorId("");
      toast.info(
        "Seleccionaste servicios de operadores distintos. Elegí el operador manualmente.",
      );
    }

    // moneda sugerida (si todas iguales)
    if (suggestedCurrency) {
      setCurrency(suggestedCurrency);
    }

    // monto sugerido = suma de costos
    if (selectedServices.length > 0) {
      setAmount(
        Number.isFinite(suggestedAmount) && suggestedAmount > 0
          ? String(suggestedAmount)
          : "",
      );
    } else {
      setAmount("");
    }

    // descripción sugerida con IDs
    if (selectedServices.length > 0) {
      const ids = selectedServices.map((s) => `#${s.id_service}`).join(", ");
      const opName =
        operators.find((o) => o.id_operator === operatorIdFromSelection)
          ?.name || "Operador";
      setDescription(
        `Pago a operador ${opName} | Reserva N° ${booking.id_booking} | Servicios ${ids}`,
      );
    } else {
      setDescription("");
    }
  }, [
    selectedServices,
    operatorIdFromSelection,
    suggestedAmount,
    suggestedCurrency,
    operators,
    booking.id_booking,
  ]);

  // Toggle de selección con validación de operador homogéneo
  const toggleService = (svc: Service) => {
    const isSelected = selectedIds.includes(svc.id_service);
    if (isSelected) {
      setSelectedIds((prev) => prev.filter((id) => id !== svc.id_service));
      return;
    }
    // Si ya hay selección, impedir mezclar operadores distintos
    if (selectedServices.length > 0) {
      const baseOp = selectedServices[0].id_operator;
      if (baseOp && svc.id_operator && baseOp !== svc.id_operator) {
        toast.error(
          "No podés mezclar servicios de operadores distintos en un mismo pago.",
        );
        return;
      }
    }
    setSelectedIds((prev) => [...prev, svc.id_service]);
  };

  const useSuggested = () => {
    if (selectedServices.length === 0) return;
    setAmount(String(suggestedAmount || 0));
    if (suggestedCurrency) setCurrency(suggestedCurrency);
  };

  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (selectedServices.length === 0) {
      toast.error("Seleccioná al menos un servicio de la reserva.");
      return;
    }
    if (!operatorId) {
      toast.error("Seleccioná un operador.");
      return;
    }

    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error("El monto debe ser un número positivo");
      return;
    }

    setLoading(true);
    try {
      const ids = selectedServices.map((s) => s.id_service).join(", ");
      const desc =
        description.trim() ||
        `Pago a operador | Reserva N° ${booking.id_booking} | Servicios ${ids}`;

      const payload = {
        category: "OPERADOR",
        description: desc,
        amount: amountNum,
        currency,
        operator_id: Number(operatorId),
        paid_at: paidAt || undefined,
        booking_id: booking.id_booking, // asociación opcional a la reserva
      };

      const res = await authFetch(
        "/api/investments",
        { method: "POST", body: JSON.stringify(payload) },
        token,
      );

      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({}) as Record<string, unknown>);
        const msg =
          (err as { error?: string; message?: string }).error ||
          (err as { error?: string; message?: string }).message ||
          "No se pudo crear el pago al operador.";
        throw new Error(msg);
      }

      toast.success("Pago al operador cargado en Investments.");
      onCreated?.();

      // Reset mínimo (dejamos el form abierto)
      setSelectedIds([]);
      setAmount("");
      setCurrency("ARS");
      setOperatorId("");
      setPaidAt("");
      setDescription("");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Error al cargar el pago.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // UI helpers
  const inputBase =
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
        onClick={() => setIsFormVisible((v) => !v)}
      >
        <p className="text-lg font-medium dark:text-white">
          {isFormVisible ? "Cerrar Formulario" : "Cargar Pago"}
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
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <div className="text-sm opacity-80">
            <div>
              <b>Reserva:</b> N° {booking.id_booking}
            </div>
          </div>

          {/* Picker de servicios (multi-select) */}
          <div>
            <label className="ml-2 block dark:text-white">
              Servicios de la reserva
            </label>
            {servicesFromBooking.length === 0 ? (
              <div className="mt-2 rounded-2xl border border-white/10 bg-white/10 p-3 text-sm opacity-80">
                Esta reserva no tiene servicios cargados.
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                {servicesFromBooking.map((svc) => {
                  const isActive = selectedIds.includes(svc.id_service);
                  const opName =
                    operators.find((o) => o.id_operator === svc.id_operator)
                      ?.name || "Operador";
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
                      title={`Servicio #${svc.id_service}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium">
                          #{svc.id_service} · {svc.type}
                          {svc.destination ? ` · ${svc.destination}` : ""}
                        </div>
                        {isActive ? (
                          <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs text-sky-900 dark:bg-white/20 dark:text-white">
                            seleccionado
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-sm opacity-80">
                        <b>Operador:</b> {opName}
                      </div>
                      <div className="text-sm opacity-80">
                        <b>Costo:</b>{" "}
                        {formatMoney(
                          svc.cost_price || 0,
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
            {selectedServices.length > 0 && (
              <div className="ml-2 mt-2 text-xs opacity-70">
                Seleccionados:{" "}
                {selectedServices.map((s) => `#${s.id_service}`).join(", ")}
              </div>
            )}
          </div>

          {/* Operador */}
          <div>
            <label className="ml-2 block dark:text-white">Operador</label>
            <select
              className={`${inputBase} cursor-pointer`}
              value={operatorId}
              onChange={(e) =>
                setOperatorId(e.target.value ? Number(e.target.value) : "")
              }
              required
            >
              <option value="" disabled>
                Seleccionar operador…
              </option>
              {operators.map((o) => (
                <option key={o.id_operator} value={o.id_operator}>
                  {o.name}
                </option>
              ))}
            </select>
            {selectedServices.length > 0 && operatorIdFromSelection == null && (
              <div className="ml-2 mt-1 text-xs opacity-70">
                Seleccionaste servicios de operadores distintos. Elegí uno
                manualmente.
              </div>
            )}
          </div>

          {/* Descripción */}
          <div>
            <label className="ml-2 block dark:text-white">Descripción</label>
            <input
              className={inputBase}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Concepto / detalle del pago…"
              required
            />
          </div>

          {/* Monto / Moneda */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
              {selectedServices.length > 0 && (
                <div className="ml-2 mt-1 text-xs opacity-70">
                  Sugerido (suma costos):{" "}
                  {formatMoney(
                    suggestedAmount,
                    suggestedCurrency || currency || "ARS",
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="ml-2 block dark:text-white">Moneda</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className={`${inputBase} cursor-pointer`}
                required
              >
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
              {selectedServices.length > 0 && (
                <div className="ml-2 mt-1 text-xs opacity-70">
                  {allSameCurrency
                    ? `Sugerido: ${suggestedCurrency}`
                    : "Los servicios seleccionados tienen monedas distintas."}
                </div>
              )}
            </div>
          </div>

          {/* Fecha */}
          <div>
            <label className="ml-2 block dark:text-white">
              Fecha de pago (opcional)
            </label>
            <input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className={`${inputBase} cursor-pointer`}
            />
          </div>

          {/* Acciones */}
          <div className="mt-2 flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className={`rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white ${
                loading ? "opacity-60" : ""
              }`}
            >
              {loading ? <Spinner /> : "Cargar pago"}
            </button>

            <button
              type="button"
              onClick={useSuggested}
              disabled={selectedServices.length === 0}
              className="rounded-full bg-white/10 px-4 py-2 text-sm shadow-sm hover:scale-95 disabled:opacity-50 dark:text-white"
              title="Usar sugeridos"
            >
              Usar sugeridos
            </button>
          </div>
        </motion.form>
      )}
    </motion.div>
  );
}
