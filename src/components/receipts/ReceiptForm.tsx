// src/components/receipts/ReceiptForm.tsx
"use client";
import { useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Booking, Client, Receipt, Service } from "@/types";
import Spinner from "../Spinner";
import { motion } from "framer-motion";
import { authFetch } from "@/utils/authFetch";
import ClientPicker from "@/components/clients/ClientPicker";

interface Props {
  booking: Booking;
  onCreated?: (receipt: Receipt) => void;
  token: string | null;
}

export default function ReceiptForm({ booking, onCreated, token }: Props) {
  const [concept, setConcept] = useState("");
  const [currency, setCurrency] = useState(""); // método de pago
  const [amountString, setAmountString] = useState("");
  const [amountCurrency, setAmountCurrency] = useState("");
  const [manualAmount, setManualAmount] = useState("");

  const [loading, setLoading] = useState(false);
  const [isFormVisible, setIsFormVisible] = useState(false);

  // === Servicios de esta reserva ===
  const servicesFromBooking = useMemo<Service[]>(
    () => booking.services ?? [],
    [booking.services],
  );
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
  const selectedServices = useMemo(
    () =>
      servicesFromBooking.filter((s) =>
        selectedServiceIds.includes(s.id_service),
      ),
    [servicesFromBooking, selectedServiceIds],
  );

  const toggleService = (svc: Service) => {
    setSelectedServiceIds((prev) =>
      prev.includes(svc.id_service)
        ? prev.filter((id) => id !== svc.id_service)
        : [...prev, svc.id_service],
    );
  };

  const allSelectedSameCurrency = useMemo(() => {
    if (selectedServices.length === 0) return true;
    const set = new Set(selectedServices.map((s) => s.currency || "ARS"));
    return set.size === 1;
  }, [selectedServices]);

  const suggestedCurrency = useMemo(() => {
    if (!allSelectedSameCurrency || selectedServices.length === 0) return null;
    return selectedServices[0].currency || "ARS";
  }, [allSelectedSameCurrency, selectedServices]);

  const suggestedAmount = useMemo(
    () =>
      selectedServices.reduce(
        (sum, svc) => sum + (svc.sale_price ?? 0) + (svc.card_interest ?? 0),
        0,
      ),
    [selectedServices],
  );

  const formatMoney = (n: number, cur = "ARS") =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: cur,
      minimumFractionDigits: 2,
    }).format(n);

  // === Clientes (picker múltiple) ===
  const [clientsCount, setClientsCount] = useState(1);
  const [clientIds, setClientIds] = useState<(number | null)[]>([null]);

  const handleIncrementClient = () => {
    setClientsCount((c) => c + 1);
    setClientIds((arr) => [...arr, null]);
  };
  const handleDecrementClient = () => {
    if (clientsCount <= 1) return;
    setClientsCount((c) => c - 1);
    setClientIds((arr) => arr.slice(0, -1));
  };

  const setClientAt = (index: number, client: Client | null) => {
    setClientIds((prev) => {
      const next = [...prev];
      next[index] = client ? client.id_client : null;
      return next;
    });
  };

  // Excluir duplicados entre los pickers
  const excludeForIndex = (idx: number) =>
    clientIds.filter((_, i) => i !== idx).filter(Boolean) as number[];

  const inputBase =
    "w-full rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!concept.trim()) return toast.error("Ingresá el concepto");

    if (selectedServiceIds.length === 0) {
      return toast.error("Seleccioná al menos un servicio de la reserva");
    }

    // clientes seleccionados (pueden quedar vacíos para auto-asignar)
    const pickedClientIds = clientIds.filter(
      (v): v is number => typeof v === "number" && Number.isFinite(v),
    );

    // Importe final
    let finalAmount: number;
    if (manualAmount.trim() !== "") {
      const parsed = parseFloat(manualAmount);
      if (!Number.isFinite(parsed)) {
        return toast.error("El importe debe ser un número válido");
      }
      finalAmount = parsed;
    } else {
      const setCur = new Set(selectedServices.map((s) => s.currency || "ARS"));
      if (setCur.size > 1) {
        return toast.error(
          "Seleccionaste servicios con monedas distintas. Ingresá el Importe numérico.",
        );
      }
      finalAmount = suggestedAmount;
    }

    setLoading(true);
    try {
      const res = await authFetch(
        "/api/receipts",
        {
          method: "POST",
          body: JSON.stringify({
            booking,
            concept,
            currency, // método de pago
            amountString,
            amountCurrency,
            serviceIds: selectedServiceIds,
            amount: finalAmount,
            clientIds: pickedClientIds, // opcional: puede ir vacío
          }),
        },
        token,
      );

      if (!res.ok) {
        let msg = "Error guardando recibo";
        try {
          const err = await res.json();
          msg = err?.error || err?.message || msg;
        } catch {}
        throw new Error(msg);
      }

      const { receipt } = await res.json();
      toast.success("Recibo creado exitosamente.");
      onCreated?.(receipt);

      // reset
      setConcept("");
      setCurrency("");
      setAmountString("");
      setAmountCurrency("");
      setManualAmount("");
      setSelectedServiceIds([]);
      setClientsCount(1);
      setClientIds([null]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error guardando recibo";
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
        maxHeight: isFormVisible ? 1000 : 100,
        opacity: 1,
        transition: { duration: 0.4, ease: "easeInOut" },
      }}
      className="mb-6 space-y-3 overflow-hidden overflow-y-scroll rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white"
    >
      <div
        className="flex cursor-pointer items-center justify-between"
        onClick={() => setIsFormVisible(!isFormVisible)}
      >
        <p className="text-lg font-medium dark:text-white">
          {isFormVisible ? "Cerrar Formulario" : "Crear Recibo"}
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
          {/* Importe en palabras */}
          <div>
            <label className="ml-2 block dark:text-white">
              Recibimos el equivalente a:
            </label>
            <input
              type="text"
              value={amountString}
              onChange={(e) => setAmountString(e.target.value)}
              className={inputBase}
              placeholder="Ej: UN MILLON CIEN MIL"
              required
            />
          </div>

          {/* Moneda del importe en palabras */}
          <div>
            <label className="ml-2 dark:text-white">Moneda</label>
            <select
              name="currency"
              value={amountCurrency}
              onChange={(e) => setAmountCurrency(e.target.value)}
              className={`${inputBase} appearance-none`}
            >
              <option value="" disabled>
                Seleccionar moneda
              </option>
              <option value="USD">USD</option>
              <option value="ARS">ARS</option>
            </select>
            {selectedServices.length > 0 && allSelectedSameCurrency && (
              <p className="ml-2 mt-1 text-xs opacity-70">
                Sugerido por servicios: {suggestedCurrency}
              </p>
            )}
          </div>

          {/* Importe numérico */}
          <div>
            <label className="ml-2 block dark:text-white">
              Importe numérico:
            </label>
            <input
              type="number"
              step="0.01"
              value={manualAmount}
              onChange={(e) => setManualAmount(e.target.value)}
              className={inputBase}
              placeholder="Ej: 1000.50"
            />
            <p className="ml-2 text-sm text-gray-500 dark:text-gray-400">
              Dejá vacío para calcularlo automáticamente
              {selectedServices.length > 0 && allSelectedSameCurrency && (
                <>
                  {" "}
                  (Sugerido:{" "}
                  {formatMoney(suggestedAmount, suggestedCurrency || "ARS")})
                </>
              )}
            </p>
            {selectedServices.length > 0 && !allSelectedSameCurrency && (
              <p className="ml-2 mt-1 text-xs text-yellow-700 dark:text-yellow-300">
                Los servicios seleccionados tienen monedas distintas. Ingresá el
                Importe numérico.
              </p>
            )}
          </div>

          {/* Concepto */}
          <div>
            <label className="ml-2 block dark:text-white">Concepto:</label>
            <input
              type="text"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              className={inputBase}
              placeholder="Ej: Pago total del paquete"
              required
            />
          </div>

          {/* Método de pago */}
          <div>
            <label className="ml-2 block dark:text-white">
              Metodo de pago:
            </label>
            <input
              type="text"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={inputBase}
              placeholder="Ej: Tarjeta de crédito -- No adeuda saldo"
              required
            />
          </div>

          {/* Picker de servicios (multi) */}
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
                      title={`Servicio #${svc.id_service}`}
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
                        {formatMoney(
                          (svc.sale_price ?? 0) + (svc.card_interest ?? 0),
                          svc.currency || "ARS",
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
                {selectedServices.map((s) => `#${s.id_service}`).join(", ")}
              </div>
            )}
          </div>

          {/* Pickers de clientes (multi) */}
          <div>
            <label className="ml-2 block dark:text-white">
              Cantidad de Clientes
            </label>
            <div className="ml-2 flex items-center space-x-2 py-2">
              <button
                type="button"
                onClick={handleDecrementClient}
                className="rounded-full border border-sky-950 p-1 dark:border-white dark:text-white"
                disabled={clientsCount <= 1}
              >
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
                    d="M5 12h14"
                  />
                </svg>
              </button>
              <span className="rounded-full border border-sky-950 px-3 py-1 dark:border-white dark:text-white">
                {clientsCount}
              </span>
              <button
                type="button"
                onClick={handleIncrementClient}
                className="rounded-full border border-sky-950 p-1 dark:border-white dark:text-white"
              >
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
              </button>
            </div>
          </div>

          {Array.from({ length: clientsCount }).map((_, idx) => (
            <div key={idx}>
              <ClientPicker
                token={token}
                label={`Cliente ${idx + 1}`}
                placeholder="Buscar por ID, DNI, Pasaporte, CUIT o nombre..."
                valueId={clientIds[idx] ?? null}
                excludeIds={excludeForIndex(idx)}
                onSelect={(c) => setClientAt(idx, c)}
                onClear={() => setClientAt(idx, null)}
              />
              <p className="ml-2 mt-1 text-sm text-gray-500 dark:text-gray-400">
                Podés dejarlo vacío para calcularlo automáticamente.
              </p>
            </div>
          ))}

          <button
            type="submit"
            disabled={loading}
            className="mt-4 rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
          >
            {loading ? <Spinner /> : "Crear Recibo"}
          </button>
        </motion.form>
      )}
    </motion.div>
  );
}
