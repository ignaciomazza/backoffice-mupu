// src/components/receipts/ReceiptForm.tsx
"use client";
import { useState } from "react";
import { toast } from "react-toastify";
import { Booking, Receipt, Service } from "@/types";
import Spinner from "../Spinner";
import { motion } from "framer-motion";

interface Props {
  booking: Booking;
  onCreated?: (receipt: Receipt) => void;
}

export default function ReceiptForm({ booking, onCreated }: Props) {
  const [concept, setConcept] = useState("");
  const [currency, setCurrency] = useState("");
  const [amountString, setAmountString] = useState("");
  // Nuevo: importe numérico ingresado manualmente
  const [manualAmount, setManualAmount] = useState("");
  // Cantidad de servicios + array de IDs
  const [servicesCount, setServicesCount] = useState(1);
  const [idServices, setIdServices] = useState<string[]>([""]);

  const [loading, setLoading] = useState(false);
  const [isFormVisible, setIsFormVisible] = useState(false);

  const handleIncrement = () => {
    setServicesCount((c) => c + 1);
    setIdServices((arr) => {
      const copy = [...arr];
      copy.push("");
      return copy;
    });
  };

  const handleDecrement = () => {
    if (servicesCount <= 1) return;
    setServicesCount((c) => c - 1);
    setIdServices((arr) => arr.slice(0, -1));
  };

  const handleServiceIdChange = (index: number, value: string) => {
    const copy = [...idServices];
    copy[index] = value;
    setIdServices(copy);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!concept.trim()) return toast.error("Ingresá el concepto");

    // Parsear IDs a números
    const serviceIds = idServices
      .map((v) => parseInt(v.trim(), 10))
      .filter((n) => !isNaN(n));

    if (serviceIds.length !== servicesCount) {
      return toast.error("Todos los servicios deben tener un ID válido");
    }

    // Validar que existan en booking.services
    const selected = booking.services?.filter((s: Service) =>
      serviceIds.includes(s.id_service),
    );
    if (!selected || selected.length !== serviceIds.length) {
      return toast.error("Alguno de los servicios no existe en esta reserva");
    }

    // Parsear importe manual
    let finalAmount: number;
    if (manualAmount.trim() !== "") {
      const parsed = parseFloat(manualAmount);
      if (isNaN(parsed)) {
        return toast.error("El importe debe ser un número válido");
      }
      finalAmount = parsed;
    } else {
      // Si no se ingresó manualmente, sumo precios de servicios
      finalAmount = selected.reduce(
        (sum, svc) => sum + svc.sale_price + (svc.card_interest ?? 0),
        0,
      );
    }

    setLoading(true);
    try {
      const res = await fetch("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking,
          concept,
          currency,
          amountString,
          serviceIds,
          amount: finalAmount, // envío el importe final
        }),
      });
      if (!res.ok) throw new Error("Error guardando recibo");
      const { receipt } = await res.json();

      toast.success("Recibo creado exitosamente.");
      onCreated?.(receipt);
      // Opcional: resetear formulario
      setConcept("");
      setCurrency("");
      setAmountString("");
      setManualAmount("");
      setServicesCount(1);
      setIdServices([""]);
    } catch (err: unknown) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ maxHeight: 80, opacity: 1 }}
      animate={{
        maxHeight: isFormVisible ? 1000 : 80,
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
          {isFormVisible ? "Cerrar Formulario" : "Crear Recibo"}
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
          className="space-y-4"
        >
          <div>
            <label className="ml-2 block dark:text-white">
              Recibimos el equivalente a:
            </label>
            <input
              type="text"
              value={amountString}
              onChange={(e) => setAmountString(e.target.value)}
              className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
              placeholder="Ej: UN MILLON CIEN MIL"
              required
            />
          </div>

          <div>
            <label className="ml-2 block dark:text-white">
              Importe numérico:
            </label>
            <input
              type="number"
              step="0.01"
              value={manualAmount}
              onChange={(e) => setManualAmount(e.target.value)}
              className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
              placeholder="Ej: 1000.50"
            />
            <p className="ml-2 text-sm text-gray-500 dark:text-gray-400">
              Dejá vacío para calcularlo automáticamente
            </p>
          </div>

          <div>
            <label className="ml-2 block dark:text-white">Concepto:</label>
            <input
              type="text"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
              placeholder="Ej: Pago total del paquete"
              required
            />
          </div>

          <div>
            <label className="ml-2 block dark:text-white">
              Moneda recibida:
            </label>
            <input
              type="text"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
              placeholder="Ej: Tarjeta de crédito"
              required
            />
          </div>

          <div>
            <label className="ml-2 block dark:text-white">
              Cantidad de Servicios
            </label>
            <div className="ml-2 flex items-center space-x-2 py-2">
              <button
                type="button"
                onClick={handleDecrement}
                className="rounded-full border border-black p-1 dark:border-white dark:text-white"
                disabled={servicesCount <= 1}
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
              <span className="rounded-full border border-black px-3 py-1 dark:border-white dark:text-white">
                {servicesCount}
              </span>
              <button
                type="button"
                onClick={handleIncrement}
                className="rounded-full border border-black p-1 dark:border-white dark:text-white"
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

          <div>
            <label className="ml-2 block dark:text-white">
              IDs de Servicio
            </label>
            <div className="space-y-2">
              {Array.from({ length: servicesCount }).map((_, idx) => (
                <input
                  key={idx}
                  type="number"
                  value={idServices[idx] || ""}
                  onChange={(e) => handleServiceIdChange(idx, e.target.value)}
                  className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
                  placeholder={`ID del servicio ${idx + 1}`}
                  onKeyDown={(e) => {
                    if (["ArrowUp", "ArrowDown"].includes(e.key))
                      e.preventDefault();
                  }}
                  required
                />
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="h-10 w-40 rounded-full bg-black text-center text-white transition-transform hover:scale-95 active:scale-90 dark:bg-white dark:text-black"
          >
            {loading ? <Spinner /> : "Crear Recibo"}
          </button>
        </motion.form>
      )}
    </motion.div>
  );
}
