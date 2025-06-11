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
  issue_date: string;
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
}

export default function InvoicesPage() {
  const { token } = useAuth();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);

  // 1) Formatter de montos: PES→ARS, DOL→USD
  const fmt = useCallback((v?: number, curr?: string) => {
    const currency = curr === "DOL" ? "USD" : "ARS";
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
    }).format(v ?? 0);
  }, []);

  // 2) Nombre del cliente: si hay razón social la usamos
  const getClientName = (inv: Invoice) => {
    const { titular } = inv.booking;
    return titular.company_name?.trim()
      ? titular.company_name.trim()
      : `${titular.first_name} ${titular.last_name}`;
  };

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
      if (!json.success) {
        throw new Error(json.message || "Error al cargar facturas");
      }
      setData(json.invoices);
    } catch (err: unknown) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [from, to, token]);

  // 3) Descarga CSV sin la columna "Reserva" y con saltos de línea
  const downloadCSV = () => {
    const header = ["Factura", "Fecha", "Cliente", "Dirección", "Total"];
    const rows = data.map((inv) => [
      inv.invoice_number,
      new Date(inv.issue_date).toLocaleDateString("es-AR"),
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
    // Podrías precargar facturas de hoy si querés
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
            className="self-end rounded-full bg-black px-6 py-2 text-white transition-transform hover:scale-95 active:scale-90 dark:bg-white dark:text-black"
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
            <div className="overflow-x-auto rounded-3xl bg-black">
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
                      className="border border-black text-center"
                    >
                      <td className="bg-white px-2 py-4 text-sm font-light">
                        {inv.invoice_number}
                      </td>
                      <td className="bg-white px-2 py-4 text-sm font-light">
                        {inv.booking.id_booking}
                      </td>
                      <td className="bg-white px-2 py-4 text-sm font-light">
                        {new Date(inv.issue_date).toLocaleDateString("es-AR")}
                      </td>
                      <td className="bg-white px-2 py-4 text-sm font-light">
                        {getClientName(inv)}
                      </td>
                      <td className="bg-white px-2 py-4 text-sm font-light">
                        {formatAddress(inv)}
                      </td>
                      <td className="bg-white px-2 py-4 text-sm font-light">
                        {fmt(inv.total_amount, inv.currency)}
                      </td>
                      <td className="bg-white px-2 py-4 text-sm">
                        <Link
                          href={`/api/invoices/${inv.id_invoice}/pdf`}
                          target="_blank"
                          className="rounded-full bg-black px-4 py-2 text-white"
                        >
                          Descargar
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {data.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="p-3 text-center dark:text-white"
                      >
                        No hay facturas para ese rango.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {data.length > 0 && (
                <div className="flex w-full justify-end px-4 py-2">
                  <button
                    onClick={downloadCSV}
                    className="rounded-full bg-white px-4 py-2 text-black"
                  >
                    Descargar CSV
                  </button>
                </div>
              )}
            </div>
          )
        )}

        <ToastContainer position="bottom-right" />
      </div>
    </ProtectedRoute>
  );
}
