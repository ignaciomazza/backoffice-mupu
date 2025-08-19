// src/app/invoices/page.tsx
"use client";

import React, { useState, useCallback } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import Spinner from "@/components/Spinner";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Link from "next/link";
import { authFetch } from "@/utils/authFetch";

interface Invoice {
  id_invoice: number;
  invoice_number: string;
  total_amount: number;
  currency: string; // "ARS" | "USD" | "PES" (normalizamos abajo)
  type: string; // "Factura A" | "Factura B" | ...
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
      MonCotiz?: number;
      qrBase64?: string;
    };
  };
  client?: {
    address?: string;
    locality?: string;
    postal_code?: string;
  };
}

/** Forma real que devuelve la API de /api/invoices */
interface ApiInvoice extends Invoice {
  client_id?: number;
  recipient?: string;
}

interface InvoiceRow extends Invoice {
  isCredit?: boolean;
  client_id: number;
  recipient?: string;
  address?: string;
  locality?: string;
  postal_code?: string;
}

interface RawCreditNote {
  id_credit_note: number;
  credit_number: string;
  total_amount: number;
  currency: string; // "ARS" | "USD" | "PES"
  type: string; // "Nota de crédito A" | ...
  recipient?: string;
  payloadAfip: Invoice["payloadAfip"]["voucherData"];
  invoice: {
    client_id: number;
    booking: Invoice["booking"];
    client?: {
      address?: string;
      locality?: string;
      postal_code?: string;
    };
  };
}

type InvoicesAPI = {
  success?: boolean;
  message?: string;
  invoices: ApiInvoice[];
};

type CreditsAPI = {
  success?: boolean;
  message?: string;
  creditNotes: RawCreditNote[];
};

export default function InvoicesPage() {
  const { token } = useAuth();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fmt = useCallback((v?: number, curr?: string) => {
    const currency =
      curr === "DOL" ? "USD" : curr === "PES" ? "ARS" : curr || "ARS";
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
    }).format(v ?? 0);
  }, []);

  const getClientName = (inv: InvoiceRow) =>
    inv.recipient ??
    `${inv.booking.titular.first_name} ${inv.booking.titular.last_name}`;

  const getAddress = (inv: InvoiceRow) => {
    const clientPart = [inv.address, inv.locality, inv.postal_code]
      .filter(Boolean)
      .join(", ");
    if (clientPart) return clientPart;

    if (inv.isCredit) return "";

    const t = inv.booking.titular;
    const parts: string[] = [];
    if (inv.type === "Factura A" && t.commercial_address) {
      parts.push(t.commercial_address);
    } else if (t.address) {
      parts.push(t.address);
    }
    const loc = [t.locality, t.postal_code].filter(Boolean).join(" ");
    if (loc) parts.push(loc);
    return parts.join(", ");
  };

  const getCbteDate = (inv: Invoice) => {
    const raw = inv.payloadAfip.voucherData.CbteFch.toString();
    return new Date(
      `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T00:00:00`,
    ).toLocaleDateString("es-AR");
  };

  const getTaxBreakdown = (inv: Invoice) => {
    const ivaArr = inv.payloadAfip.voucherData.Iva || [];
    let base21 = 0,
      base105 = 0,
      baseEx = 0;
    ivaArr.forEach(({ Id, BaseImp, Importe }) => {
      if (Id === 5)
        base21 += BaseImp + Importe; // 21%
      else if (Id === 4)
        base105 += BaseImp + Importe; // 10.5%
      else baseEx += BaseImp; // exento/otros
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
      const [r1, r2] = await Promise.all([
        authFetch(
          `/api/invoices?from=${from}&to=${to}`,
          { cache: "no-store" },
          token || undefined,
        ),
        authFetch(
          `/api/credit-notes?from=${from}&to=${to}`,
          { cache: "no-store" },
          token || undefined,
        ),
      ]);

      const j1: InvoicesAPI = await r1.json();
      const j2: CreditsAPI = await r2.json();

      if (j1.success === false)
        throw new Error(j1.message || "Error al cargar facturas");
      if (j2.success === false)
        throw new Error(j2.message || "Error al cargar notas de crédito");

      const invoicesArr: ApiInvoice[] = Array.isArray(j1.invoices)
        ? j1.invoices
        : [];
      const creditArr: RawCreditNote[] = Array.isArray(j2.creditNotes)
        ? j2.creditNotes
        : [];

      // 1) Facturas
      const invs: InvoiceRow[] = invoicesArr.map((inv) => ({
        ...inv,
        currency: inv.currency === "PES" ? "ARS" : inv.currency,
        isCredit: false,
        client_id: inv.client_id ?? 0,
        recipient: inv.recipient,
        address: inv.client?.address,
        locality: inv.client?.locality,
        postal_code: inv.client?.postal_code,
      }));

      // 2) Notas de crédito
      const crs: InvoiceRow[] = creditArr.map((cr) => ({
        id_invoice: cr.id_credit_note,
        invoice_number: cr.credit_number,
        total_amount: cr.total_amount,
        currency: cr.currency === "PES" ? "ARS" : cr.currency,
        type: cr.type,
        booking: cr.invoice.booking,
        payloadAfip: { voucherData: cr.payloadAfip },
        isCredit: true,
        client_id: cr.invoice.client_id,
        recipient: cr.recipient,
        address: cr.invoice.client?.address,
        locality: cr.invoice.client?.locality,
        postal_code: cr.invoice.client?.postal_code,
      }));

      // 3) Ordenar por fecha + id
      const all = [...invs, ...crs].sort((a, b) => {
        const fa = a.payloadAfip.voucherData.CbteFch;
        const fb = b.payloadAfip.voucherData.CbteFch;
        return fa - fb || a.id_invoice - b.id_invoice;
      });

      setData(all);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al cargar datos";
      console.error("fetchInvoices error:", err);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [from, to, token]);

  const downloadCSV = () => {
    const header = [
      "Factura",
      "Tipo de factura",
      "Fecha",
      "Cliente",
      "Dirección",
      "Localidad",
      "Código Postal",
      "Base21",
      "Base10.5",
      "Exento",
      "Neto",
      "IVA",
      "Cotización",
      "Total",
    ];
    const escapeCell = (text: string) => `"${text.replace(/"/g, '""')}"`;

    const rows = data.map((inv) => {
      const { base21, base105, baseEx, neto, iva } = getTaxBreakdown(inv);
      const direccion = inv.address ?? "";
      const localidad = inv.locality ?? "";
      const codigoPostal = inv.postal_code ?? "";
      const tipo = inv.isCredit
        ? `Nota de crédito ${inv.type.slice(-1)}`
        : inv.type;

      // Si la factura está en USD/DOL, mostramos la cotización formateada en ARS.
      const isUsd = inv.currency === "DOL" || inv.currency === "USD";
      const cotizacion = isUsd
        ? fmt(inv.payloadAfip.voucherData.MonCotiz ?? undefined, "ARS")
        : "";

      const base21Fmt = fmt(base21, inv.currency);
      const base105Fmt = fmt(base105, inv.currency);
      const baseExFmt = fmt(baseEx, inv.currency);
      const netoFmt = fmt(neto, inv.currency);
      const ivaFmt = fmt(iva, inv.currency);
      const totalFmt = fmt(inv.total_amount, inv.currency);

      return [
        inv.invoice_number,
        tipo,
        getCbteDate(inv),
        getClientName(inv),
        direccion,
        localidad,
        codigoPostal,
        base21Fmt,
        base105Fmt,
        baseExFmt,
        netoFmt,
        ivaFmt,
        cotizacion,
        totalFmt,
      ].map(escapeCell);
    });

    const csvContent = [
      header.map(escapeCell).join(";"),
      ...rows.map((r) => r.join(";")),
    ].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `facturas_${from}_${to}.csv`;
    a.click();
  };

  return (
    <ProtectedRoute>
      <div className="text-sky-950 dark:text-white">
        <h1 className="mb-6 text-2xl font-semibold">Facturas por Fecha</h1>
        <div className="mb-6 flex w-full flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block dark:text-white">Desde</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-fit cursor-pointer appearance-none rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sky-950 shadow-md shadow-sky-950/10 outline-none backdrop-blur dark:border dark:border-white/10 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block dark:text-white">Hasta</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-fit cursor-pointer appearance-none rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sky-950 shadow-md shadow-sky-950/10 outline-none backdrop-blur dark:border dark:border-white/10 dark:text-white"
            />
          </div>
          <button
            onClick={fetchInvoices}
            disabled={loading}
            className="ml-auto h-fit w-32 rounded-full bg-sky-100 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 disabled:opacity-50 dark:bg-white/10 dark:text-white dark:backdrop-blur"
          >
            {loading ? (
              <Spinner />
            ) : (
              <div className="flex w-full items-center justify-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="size-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                  />
                </svg>
                <p>Buscar</p>
              </div>
            )}
          </button>
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner />
          </div>
        ) : (
          data.length > 0 && (
            <div className="w-full rounded-3xl border border-white/10 bg-white/10 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white">
              <table>
                <thead>
                  <tr className="text-sky-950 dark:text-white">
                    <th className="px-4 py-3 font-normal">Factura</th>
                    <th className="px-4 py-3 font-normal">Reserva</th>
                    <th className="px-4 py-3 font-normal">Fecha</th>
                    <th className="px-4 py-3 font-normal">Cliente</th>
                    <th className="px-4 py-3 font-normal">Dirección</th>
                    <th className="px-4 py-3 font-normal">IVA</th>
                    <th className="px-4 py-3 font-normal">Total</th>
                    <th className="px-4 py-3 font-normal">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((inv) => {
                    const { iva } = getTaxBreakdown(inv);
                    return (
                      <tr key={inv.id_invoice} className="text-center">
                        <td className="border-t border-white/10 px-2 py-4 text-sm font-light text-sky-950 dark:text-white">
                          {inv.isCredit ? (
                            <span className="text-red-600">
                              NC {inv.invoice_number}
                            </span>
                          ) : (
                            inv.invoice_number
                          )}
                        </td>
                        <td className="border-t border-white/10 px-2 py-4 text-sm font-light text-sky-950 dark:text-white">
                          <Link
                            href={`/bookings/services/${inv.booking.id_booking}`}
                            target={"blank"}
                            className="m-auto flex w-fit items-center gap-1 text-sky-950/70 transition-colors hover:text-sky-950 dark:text-white/70 dark:hover:text-white"
                          >
                            {inv.booking.id_booking}
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth={2}
                              stroke="currentColor"
                              className="size-4"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                              />
                            </svg>
                          </Link>
                        </td>
                        <td className="border-t border-white/10 px-2 py-4 text-sm font-light text-sky-950 dark:text-white">
                          {getCbteDate(inv)}
                        </td>
                        <td className="border-t border-white/10 px-2 py-4 text-sm font-light text-sky-950 dark:text-white">
                          {getClientName(inv)}
                        </td>
                        <td className="border-t border-white/10 px-2 py-4 text-sm font-light text-sky-950 dark:text-white">
                          {getAddress(inv)}
                        </td>
                        <td className="border-t border-white/10 px-2 py-4 text-sm font-light text-sky-950 dark:text-white">
                          {fmt(iva, inv.currency)}
                        </td>
                        <td className="border-t border-white/10 px-2 py-4 text-sm font-light text-sky-950 dark:text-white">
                          {fmt(inv.total_amount, inv.currency)}
                        </td>
                        <td className="border-t border-white/10 px-2 py-4 text-sm font-light text-sky-950 dark:text-white">
                          <div className="flex items-center justify-center">
                            <Link
                              href={
                                inv.isCredit
                                  ? `/api/credit-notes/${inv.id_invoice}/pdf`
                                  : `/api/invoices/${inv.id_invoice}/pdf`
                              }
                              target="_blank"
                              className="w-fit rounded-full bg-sky-100 px-4 py-2 text-sky-950 shadow-md shadow-sky-950/10 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
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
                    );
                  })}
                </tbody>
              </table>
              <div className="flex w-full justify-end border-t border-white/10 px-4 py-2">
                <button
                  onClick={downloadCSV}
                  className="w-fit rounded-full bg-sky-100 px-4 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
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
