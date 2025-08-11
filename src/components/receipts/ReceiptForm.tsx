// src/components/receipts/ReceiptForm.tsx
"use client";
import { useState } from "react";
import { toast } from "react-toastify";
import { Booking, Receipt, Service } from "@/types";
import Spinner from "../Spinner";
import { motion } from "framer-motion";
import { authFetch } from "@/utils/authFetch";

interface Props {
  booking: Booking;
  onCreated?: (receipt: Receipt) => void;
  token: string | null;
}

export default function ReceiptForm({ booking, onCreated, token }: Props) {
  const [concept, setConcept] = useState("");
  const [currency, setCurrency] = useState("");
  const [amountString, setAmountString] = useState("");
  const [amountCurrency, setAmountCurrency] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [servicesCount, setServicesCount] = useState(1);
  const [idServices, setIdServices] = useState<string[]>([""]);
  const [clientsCount, setClientsCount] = useState(1);
  const [idClients, setIdClients] = useState<string[]>([""]);

  const [loading, setLoading] = useState(false);
  const [isFormVisible, setIsFormVisible] = useState(false);

  const handleIncrementService = () => {
    setServicesCount((c) => c + 1);
    setIdServices((arr) => {
      const copy = [...arr];
      copy.push("");
      return copy;
    });
  };

  const handleDecrementService = () => {
    if (servicesCount <= 1) return;
    setServicesCount((c) => c - 1);
    setIdServices((arr) => arr.slice(0, -1));
  };

  const handleIncrementClient = () => {
    setClientsCount((c) => c + 1);
    setIdClients((arr) => {
      const copy = [...arr];
      copy.push("");
      return copy;
    });
  };

  const handleDecrementClient = () => {
    if (clientsCount <= 1) return;
    setClientsCount((c) => c - 1);
    setIdClients((arr) => arr.slice(0, -1));
  };

  const handleServiceIdChange = (index: number, value: string) => {
    const copy = [...idServices];
    copy[index] = value;
    setIdServices(copy);
  };

  const handleCLientIdChange = (index: number, value: string) => {
    const copy = [...idClients];
    copy[index] = value;
    setIdClients(copy);
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

    // Parsear IDs de clientes
    const clientIds = idClients
      .map((v) => parseInt(v.trim(), 10))
      .filter((n) => !isNaN(n));

    if (clientIds.length !== idClients.length) {
      return toast.error("Todos los clientes deben tener un ID válido");
    }

    // Importe final
    let finalAmount: number;
    if (manualAmount.trim() !== "") {
      const parsed = parseFloat(manualAmount);
      if (isNaN(parsed)) {
        return toast.error("El importe debe ser un número válido");
      }
      finalAmount = parsed;
    } else {
      finalAmount = selected.reduce(
        (sum, svc) => sum + svc.sale_price + (svc.card_interest ?? 0),
        0,
      );
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
            currency,
            amountString,
            amountCurrency,
            serviceIds,
            amount: finalAmount,
            clientIds,
          }),
        },
        token,
      );

      if (!res.ok) {
        let msg = "Error guardando recibo";
        try {
          const err = await res.json();
          msg = err?.error || err?.message || msg;
        } catch {
          /* ignore */
        }
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
      setServicesCount(1);
      setIdServices([""]);
      setClientsCount(1);
      setIdClients([""]);
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
              className="w-full rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
              placeholder="Ej: UN MILLON CIEN MIL"
              required
            />
          </div>

          <div>
            <label className="ml-2 dark:text-white">Moneda</label>
            <select
              name="currency"
              value={amountCurrency}
              onChange={(e) => setAmountCurrency(e.target.value)}
              className="w-full appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
            >
              <option value="" disabled>
                Seleccionar moneda
              </option>
              <option value="USD">USD</option>
              <option value="ARS">ARS</option>
            </select>
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
              className="w-full rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
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
              className="w-full rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
              placeholder="Ej: Pago total del paquete"
              required
            />
          </div>

          <div>
            <label className="ml-2 block dark:text-white">
              Metodo de pago:
            </label>
            <input
              type="text"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
              placeholder="Ej: Tarjeta de crédito -- No adedua saldo"
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
                onClick={handleDecrementService}
                className="rounded-full border border-sky-950 p-1 dark:border-white dark:text-white"
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
              <span className="rounded-full border border-sky-950 px-3 py-1 dark:border-white dark:text-white">
                {servicesCount}
              </span>
              <button
                type="button"
                onClick={handleIncrementService}
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
                  className="w-full rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
                  placeholder={`N° del servicio ${idx + 1}`}
                  onKeyDown={(e) => {
                    if (["ArrowUp", "ArrowDown"].includes(e.key))
                      e.preventDefault();
                  }}
                  required
                />
              ))}
            </div>
          </div>

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

          <div>
            <label className="ml-2 block dark:text-white">N° del Cliente</label>
            <div className="space-y-2">
              {Array.from({ length: clientsCount }).map((_, idx) => (
                <div key={idx}>
                  <input
                    type="number"
                    value={idClients[idx] || ""}
                    onChange={(e) => handleCLientIdChange(idx, e.target.value)}
                    className="w-full rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
                    placeholder={`N° del cliente ${idx + 1}`}
                    onKeyDown={(e) => {
                      if (["ArrowUp", "ArrowDown"].includes(e.key))
                        e.preventDefault();
                    }}
                  />
                  <p className="ml-2 mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Dejá vacío para calcularlo automáticamente
                  </p>
                </div>
              ))}
            </div>
          </div>

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
