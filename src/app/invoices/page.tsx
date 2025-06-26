// src/app/invoices/page.tsx
"use client";

import React, { useState, useCallback } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import Spinner from "@/components/Spinner";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Link from "next/link";

interface Invoice {
  id_invoice: number;
  invoice_number: string;
  total_amount: number;
  currency: string;
  type: string;
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
      ImpNeto: number;
      ImpIVA: number;
      Iva: Array<{ Id: number; BaseImp: number; Importe: number }>;
    };
  };
}

export default function InvoicesPage() {
  const { token } = useAuth();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);

  const fmt = useCallback((v?: number, curr?: string) => {
    const currency = curr === "DOL" ? "USD" : "ARS";
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
    }).format(v ?? 0);
  }, []);

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

  const getCbteDate = (inv: Invoice) => {
    const raw = inv.payloadAfip.voucherData.CbteFch.toString();
    const y = raw.slice(0, 4);
    const m = raw.slice(4, 6);
    const d = raw.slice(6, 8);
    return new Date(`${y}-${m}-${d}T00:00:00`).toLocaleDateString("es-AR");
  };

  const getTaxBreakdown = (inv: Invoice) => {
    const ivaArr = inv.payloadAfip.voucherData.Iva || [];
    let base21 = 0,
      base105 = 0,
      baseEx = 0;
    ivaArr.forEach(({ Id, BaseImp, Importe }) => {
      if (Id === 5) base21 += BaseImp + Importe;
      else if (Id === 4) base105 += BaseImp + Importe;
      else baseEx += BaseImp;
    });
    return {
      base21,
      base105,
      baseEx,
      neto: inv.payloadAfip.voucherData.ImpNeto,
      iva: inv.payloadAfip.voucherData.ImpIVA,
    };
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

  const downloadCSV = () => {
    const header = [
      "Factura",
      "Fecha",
      "Cliente",
      "Dirección",
      "Base21",
      "Base10.5",
      "Exento",
      "Neto",
      "IVA",
      "Total",
    ];
    const rows = data.map((inv) => {
      const { base21, base105, baseEx, neto, iva } = getTaxBreakdown(inv);
      return [
        inv.invoice_number,
        getCbteDate(inv),
        getClientName(inv),
        formatAddress(inv),
        base21.toString(),
        base105.toString(),
        baseEx.toString(),
        neto.toString(),
        iva.toString(),
        fmt(inv.total_amount, inv.currency),
      ];
    });
    const csvContent = [header, ...rows].map((r) => r.join(";")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `facturas_${from}_${to}.csv`;
    a.click();
  };

  return (
    <ProtectedRoute>
      <div className="">
        <h1 className="mb-6 text-2xl font-semibold dark:text-white">
          Facturas por Fecha
        </h1>
        <div className="mb-6 flex w-full flex-wrap gap-4">
          <div>
            <label className="mb-1 block dark:text-white">Desde</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-fit cursor-pointer appearance-none rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-black shadow-md outline-none backdrop-blur dark:border dark:border-white/10 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block dark:text-white">Hasta</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-fit cursor-pointer appearance-none rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-black shadow-md outline-none backdrop-blur dark:border dark:border-white/10 dark:text-white"
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
            <div className="w-full rounded-3xl border border-white/10 bg-white/10 text-black shadow-md backdrop-blur dark:text-white">
              <table className="">
                <thead>
                  <tr className="text-black dark:text-white">
                    <th className="px-4 py-3 font-normal">Factura</th>
                    <th className="px-4 py-3 font-normal">Reserva</th>
                    <th className="px-4 py-3 font-normal">Fecha</th>
                    <th className="px-4 py-3 font-normal">Cliente</th>
                    <th className="px-4 py-3 font-normal">Dirección</th>
                    <th className="px-4 py-3 font-normal">Base 21%</th>
                    <th className="px-4 py-3 font-normal">Base 10.5%</th>
                    <th className="px-4 py-3 font-normal">Exento</th>
                    <th className="px-4 py-3 font-normal">Neto</th>
                    <th className="px-4 py-3 font-normal">IVA</th>
                    <th className="px-4 py-3 font-normal">Total</th>
                    <th className="px-4 py-3 font-normal">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((inv) => {
                    const { base21, base105, baseEx, neto, iva } =
                      getTaxBreakdown(inv);
                    return (
                      <tr key={inv.id_invoice} className="text-center">
                        <td className="border-t border-white/10 px-2 py-4 text-sm font-light text-black dark:text-white">
                          {inv.invoice_number}
                        </td>
                        <td className="border-t border-white/10 px-2 py-4 text-sm font-light text-black dark:text-white">
                          {inv.booking.id_booking}
                        </td>
                        <td className="border-t border-white/10 px-2 py-4 text-sm font-light text-black dark:text-white">
                          {getCbteDate(inv)}
                        </td>
                        <td className="border-t border-white/10 px-2 py-4 text-sm font-light text-black dark:text-white">
                          {getClientName(inv)}
                        </td>
                        <td className="border-t border-white/10 px-2 py-4 text-sm font-light text-black dark:text-white">
                          {formatAddress(inv)}
                        </td>
                        <td className="border-t border-white/10 px-2 py-4 text-sm font-light text-black dark:text-white">
                          {fmt(base21, inv.currency)}
                        </td>
                        <td className="border-t border-white/10 px-2 py-4 text-sm font-light text-black dark:text-white">
                          {fmt(base105, inv.currency)}
                        </td>
                        <td className="border-t border-white/10 px-2 py-4 text-sm font-light text-black dark:text-white">
                          {fmt(baseEx, inv.currency)}
                        </td>
                        <td className="border-t border-white/10 px-2 py-4 text-sm font-light text-black dark:text-white">
                          {fmt(neto, inv.currency)}
                        </td>
                        <td className="border-t border-white/10 px-2 py-4 text-sm font-light text-black dark:text-white">
                          {fmt(iva, inv.currency)}
                        </td>
                        <td className="border-t border-white/10 px-2 py-4 text-sm font-light text-black dark:text-white">
                          {fmt(inv.total_amount, inv.currency)}
                        </td>
                        <td className="border-t border-white/10 px-2 py-4 text-sm font-light text-black dark:text-white">
                          <div className="flex items-center justify-center">
                            <Link
                              href={`/api/invoices/${inv.id_invoice}/pdf`}
                              target="_blank"
                              className="w-fit rounded-full bg-black px-4 py-2 text-white transition-transform hover:scale-95 active:scale-90 dark:bg-white dark:text-black"
                            >
                              {/* Icono de descarga */}
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
                    );
                  })}
                </tbody>
              </table>
              <div className="flex w-full justify-end border-t border-white/10 px-4 py-2">
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
