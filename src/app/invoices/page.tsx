"use client";

import React, { useState, useEffect, useCallback } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import Spinner from "@/components/Spinner";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Link from "next/link";

// Definimos el tipo de datos de Invoice según lo que devuelve la API
interface Invoice {
  id_invoice: number;
  invoice_number: string;
  total_amount: number;
  currency: string; // "PES" o "DOL"
  type: string; // Tipo de factura (Factura A, B)
  booking: {
    id_booking: number;
    titular: {
      first_name: string;
      last_name: string;
      company_name?: string;
      address?: string;
      locality?: string;
      postal_code?: string;
      commercial_address?: string;
    };
  };
  payloadAfip: {
    voucherData: {
      CbteFch: number; // YYYYMMDD
    };
  };
}

export default function InvoicesPage() {
  const { token } = useAuth();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);

  // Formatter de montos: PES→ARS, DOL→USD
  const fmt = useCallback((v?: number, curr?: string) => {
    const currency = curr === "DOL" ? "USD" : "ARS";
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
    }).format(v ?? 0);
  }, []);

  // Nombre del cliente: si hay razón social la usamos
  const getClientName = (inv: Invoice) => {
    const { titular } = inv.booking;
    return titular.company_name?.trim()
      ? titular.company_name.trim()
      : `${titular.first_name} ${titular.last_name}`;
  };

  // Formatear dirección
  const formatAddress = (inv: Invoice) => {
    const { titular } = inv.booking;
    const parts: string[] = [];
    if (inv.type === "Factura A") {
      const dirComm = titular.commercial_address?.trim();
      if (dirComm) parts.push(dirComm);
    } else {
      const dir = titular.address?.trim();
      if (dir) parts.push(dir);
    }
    const loc = titular.locality?.trim() || "";
    const cp = titular.postal_code?.trim() || "";
    const locPart = [loc, cp].filter(Boolean).join(" ");
    if (locPart) parts.push(locPart);
    return parts.join(", ");
  };

  // Extraer y formatear fecha de comprobante
  const getCbteDate = (inv: Invoice) => {
    const raw = inv.payloadAfip.voucherData.CbteFch.toString();
    const y = raw.slice(0, 4);
    const m = raw.slice(4, 6);
    const d = raw.slice(6, 8);
    return new Date(`${y}-${m}-${d}T00:00:00`).toLocaleDateString("es-AR");
  };

  const fetchInvoices = useCallback(async () => {
    if (!from || !to) {
      toast.error("Por favor completá ambas fechas");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/invoices?from=${from}&to=${to}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: token ? "include" : undefined,
      });
      const json = await res.json();
      if (!json.success)
        throw new Error(json.message || "Error al cargar facturas");
      setData(json.invoices);
    } catch (err: unknown) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [from, to, token]);

  // Descarga CSV usando fecha de comprobante
  const downloadCSV = () => {
    const header = ["Factura", "Fecha", "Cliente", "Dirección", "Total"];
    const rows = data.map((inv) => [
      inv.invoice_number,
      getCbteDate(inv),
      getClientName(inv),
      formatAddress(inv),
      fmt(inv.total_amount, inv.currency),
    ]);
    const csvContent = [header, ...rows].map((r) => r.join(";")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `facturas_${from}_${to}.csv`;
    a.click();
  };

  useEffect(() => {
    // Precarga opcional
  }, []);

  return (
    <ProtectedRoute>
      <div className="p-6">
        <h1 className="mb-6 text-2xl font-semibold dark:text-white">
          Facturas por Fecha
        </h1>
        <div className="mb-6 flex flex-wrap gap-4">
          <div>
            <label className="mb-1 block dark:text-white">Desde</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-2xl border border-black p-2 dark:border-white/50 dark:bg-[#252525] dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block dark:text-white">Hasta</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-2xl border border-black p-2 dark:border-white/50 dark:bg-[#252525] dark:text-white"
            />
          </div>
          <button
            onClick={fetchInvoices}
            className="min-w-32 self-end rounded-full bg-black px-6 py-2 text-white transition-transform hover:scale-95 active:scale-90 dark:bg-white dark:text-black"
            disabled={loading}
          >
            {loading ? <Spinner /> : "Buscar"}
          </button>
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner />
          </div>
        ) : (
          data.length > 0 && (
            <div className="overflow-x-auto rounded-3xl bg-black dark:bg-[#252525]">
              <table className="w-full">
                <thead>
                  <tr className="text-white">
                    <th className="px-4 py-3 font-normal">Factura</th>
                    <th className="px-4 py-3 font-normal">Reserva</th>
                    <th className="px-4 py-3 font-normal">Fecha</th>
                    <th className="px-4 py-3 font-normal">Cliente</th>
                    <th className="px-4 py-3 font-normal">Dirección</th>
                    <th className="px-4 py-3 font-normal">Total</th>
                    <th className="px-4 py-3 font-normal">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((inv) => (
                    <tr
                      key={inv.id_invoice}
                      className="border border-black text-center dark:border-[#252525]"
                    >
                      <td className="bg-white px-2 py-4 text-sm font-light dark:bg-black">
                        {inv.invoice_number}
                      </td>
                      <td className="bg-white px-2 py-4 text-sm font-light dark:bg-black">
                        {inv.booking.id_booking}
                      </td>
                      <td className="bg-white px-2 py-4 text-sm font-light dark:bg-black">
                        {getCbteDate(inv)}
                      </td>
                      <td className="bg-white px-2 py-4 text-sm font-light dark:bg-black">
                        {getClientName(inv)}
                      </td>
                      <td className="bg-white px-2 py-4 text-sm font-light dark:bg-black">
                        {formatAddress(inv)}
                      </td>
                      <td className="bg-white px-2 py-4 text-sm font-light dark:bg-black">
                        {fmt(inv.total_amount, inv.currency)}
                      </td>
                      <td className="bg-white text-sm dark:bg-black">
                        <div className="flex items-center justify-center">
                          <Link
                            href={`/api/invoices/${inv.id_invoice}/pdf`}
                            target="_blank"
                            className="w-fit rounded-full bg-black px-4 py-2 text-white transition-transform hover:scale-95 active:scale-90 dark:bg-white dark:text-black"
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
                                d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                              />
                            </svg>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex w-full justify-end px-4 py-2">
                <button
                  onClick={downloadCSV}
                  className="w-fit rounded-full bg-white px-4 py-2 text-black transition-transform hover:scale-95 active:scale-90"
                >
                  Descargar Listado
                </button>
              </div>
            </div>
          )
        )}

        <ToastContainer position="bottom-right" />
      </div>
    </ProtectedRoute>
  );
}
