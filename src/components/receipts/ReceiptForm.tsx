// src/components/receipts/ReceiptForm.tsx
"use client";
import { useState } from "react";
import { toast } from "react-toastify";
import { Booking, Receipt } from "@/types";
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
  const [service, setService] = useState("");
  const [loading, setLoading] = useState(false);
  const [isFormVisible, setIsFormVisible] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!concept.trim()) return toast.error("Ingresá el concepto");

    setLoading(true);
    try {
      const post = await fetch("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking,
          concept,
          currency,
          amountString,
          service,
        }),
      });
      if (!post.ok) throw new Error("Error guardando recibo");
      const { receipt } = await post.json();

      toast.success("Recibo creado exitosamente.");
      // opcional: avisar al padre para recargar lista de recibos
      onCreated?.(receipt);

      // ¡no descargamos nada aquí!
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
              placeholder="Ej: Tarjeta de credito"
              required
            />
          </div>
          <div>
            <label className="ml-2 block dark:text-white">
              Id de servicio:
            </label>
            <input
              type="text"
              value={service}
              onChange={(e) => setService(e.target.value)}
              className="w-full rounded-2xl border border-black p-2 px-3 outline-none placeholder:font-light placeholder:tracking-wide dark:border-white/50 dark:bg-[#252525] dark:text-white"
              placeholder="Ej: 23"
              required
            />
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
