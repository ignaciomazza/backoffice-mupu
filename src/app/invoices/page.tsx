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
      MonCotiz?: number;
      qrBase64?: string;
    };
  };
}

interface InvoiceRow extends Invoice {
  isCredit?: boolean;
  client_id: number;
  recipient?: string;
  address?: string;
}

interface RawCreditNote {
  id_credit_note: number;
  credit_number: string;
  total_amount: number;
  currency: string;
  type: string;
  recipient?: string;
  payloadAfip: Invoice["payloadAfip"]["voucherData"];
  invoice: {
    client_id: number;
    booking: Invoice["booking"];
  };
}

export default function InvoicesPage() {
  const { token } = useAuth();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fmt = useCallback((v?: number, curr?: string) => {
    const currency = curr === "DOL" ? "USD" : "ARS";
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
    }).format(v ?? 0);
  }, []);

  const getClientName = (inv: InvoiceRow) =>
    inv.recipient ??
    `${inv.booking.titular.first_name} ${inv.booking.titular.last_name}`;

  const getAddress = (inv: InvoiceRow) =>
    inv.address ??
    (() => {
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
    })();

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
      const fetchOpts: RequestInit = {
        cache: "no-store",
        credentials: "include", // siempre incluí cookie de sesión
        ...(token && { headers: { Authorization: `Bearer ${token}` } }),
      };
      const [r1, r2] = await Promise.all([
        fetch(`/api/invoices?from=${from}&to=${to}`, fetchOpts),
        fetch(`/api/credit-notes?from=${from}&to=${to}`, fetchOpts),
      ]);

      const j1 = await r1.json();
      const j2 = await r2.json();

      if (!j1.success)
        throw new Error(j1.message || "Error al cargar facturas");
      if (!j2.success)
        throw new Error(j2.message || "Error al cargar notas de crédito");

      // 2) Mapear facturas
      const invs: InvoiceRow[] = j1.invoices.map((inv: InvoiceRow) => ({
        ...inv,
        isCredit: false,
        client_id: inv.client_id,
        recipient: inv.recipient,
      }));

      // 3) Mapear notas de crédito
      const crs: InvoiceRow[] = j2.creditNotes.map((cr: RawCreditNote) => ({
        id_invoice: cr.id_credit_note,
        invoice_number: cr.credit_number,
        total_amount: cr.total_amount,
        currency: cr.currency === "PES" ? "ARS" : cr.currency,
        type: cr.type,
        booking: cr.invoice.booking,
        // *** aquí envolvemos el payload en voucherData ***
        payloadAfip: { voucherData: cr.payloadAfip },
        isCredit: true,
        client_id: cr.invoice.client_id,
        recipient: cr.recipient,
      }));

      // 4) Unir y ordenar
      const all = [...invs, ...crs].sort((a, b) => {
        const fa = a.payloadAfip.voucherData.CbteFch;
        const fb = b.payloadAfip.voucherData.CbteFch;
        return fa - fb || a.id_invoice - b.id_invoice;
      });

      // 5) Direcciones
      await Promise.all(
        all.map(async (row) => {
          try {
            const res = await fetch(`/api/clients/${row.client_id}`, fetchOpts);
            const json = await res.json();
            const c = (json.client ?? json) as {
              address?: string;
              postal_code?: string;
              locality?: string;
            };
            row.address = [c.address, c.postal_code, c.locality]
              .filter(Boolean)
              .join(", ");
          } catch (e) {
            console.error(`Error fetching client ${row.client_id}`, e);
          }
        }),
      );

      setData(all);
    } catch (err: unknown) {
      console.error("fetchInvoices caught error:", err);
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [from, to, token]);

  const downloadCSV = () => {
    // 1) Cabecera con las nuevas columnas
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

    // Helper para escapar cada celda
    const escapeCell = (text: string) => `"${text.replace(/"/g, '""')}"`;

    // 2) Filas
    const rows = data.map((inv) => {
      const { base21, base105, baseEx, neto, iva } = getTaxBreakdown(inv);

      // 2.a) Split inverso de la dirección:
      const rawAddr = inv.address ?? "";
      const parts = rawAddr.split(",").map((s) => s.trim());
      let localidad = "";
      let codigoPostal = "";
      let direccion = "";
      if (parts.length >= 3) {
        localidad = parts.pop()!;
        codigoPostal = parts.pop()!;
        direccion = parts.join(", ");
      } else {
        // fallback si no hay tantos
        [direccion = "", codigoPostal = "", localidad = ""] = parts;
      }

      // 2.b) Tipo de factura / nota:
      const tipo = inv.isCredit
        ? `Nota de crédito ${inv.type.slice(-1)}` // Nota A / B
        : inv.type; // Factura A / B

      // 2.c) Cotización si aplica
      const cotiz =
        inv.currency === "DOL"
          ? (inv.payloadAfip.voucherData.MonCotiz?.toString() ?? "")
          : "";

      // 2.d) Total formateado
      const total = fmt(inv.total_amount, inv.currency);

      // 2.e) Construyo el array y lo escapo
      return [
        inv.invoice_number,
        tipo,
        getCbteDate(inv),
        getClientName(inv),
        direccion,
        localidad,
        codigoPostal,
        base21.toString(),
        base105.toString(),
        baseEx.toString(),
        neto.toString(),
        iva.toString(),
        cotiz,
        total,
      ].map(escapeCell);
    });

    // 3) Generar contenido y disparar descarga usando ; como separador
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
              <table className="">
                <thead>
                  <tr className="text-sky-950 dark:text-white">
                    <th className="px-4 py-3 font-normal">Factura</th>
                    <th className="px-4 py-3 font-normal">Reserva</th>
                    <th className="px-4 py-3 font-normal">Fecha</th>
                    <th className="px-4 py-3 font-normal">Cliente</th>
                    <th className="px-4 py-3 font-normal">Dirección</th>
                    {/* <th className="px-4 py-3 font-normal">Base 21%</th>
                    <th className="px-4 py-3 font-normal">Base 10.5%</th>
                    <th className="px-4 py-3 font-normal">Exento</th>
                    <th className="px-4 py-3 font-normal">Neto</th> */}
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

                        {/* <td className="border-t border-white/10 px-2 py-4 text-sm font-light text-sky-950 dark:text-white">
                          {fmt(base21, inv.currency)}
                        </td>
                        <td className="border-t border-white/10 px-2 py-4 text-sm font-light text-sky-950 dark:text-white">
                          {fmt(base105, inv.currency)}
                        </td>
                        <td className="border-t border-white/10 px-2 py-4 text-sm font-light text-sky-950 dark:text-white">
                          {fmt(baseEx, inv.currency)}
                        </td>
                        <td className="border-t border-white/10 px-2 py-4 text-sm font-light text-sky-950 dark:text-white">
                          {fmt(neto, inv.currency)}
                        </td> */}
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
