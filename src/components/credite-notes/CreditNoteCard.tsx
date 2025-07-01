// src/components/credit-notes/CreditNoteCard.tsx
"use client";
import type { CreditNoteWithItems } from "@/services/creditNotes";
import { toast } from "react-toastify";
import Spinner from "../Spinner";
import { useCallback, useState } from "react";
import type { Prisma } from "@prisma/client";

interface CreditNoteCardProps {
  creditNote: CreditNoteWithItems;
}

type VoucherData = {
  CbteFch: number;
  Iva: Array<{ Id: number; BaseImp: number; Importe: number }>;
  ImpNeto: number;
  ImpIVA: number;
  recipient: string;
};

export default function CreditNoteCard({ creditNote }: CreditNoteCardProps) {
  const [loading, setLoading] = useState(false);

  const fmt = useCallback((v?: number, curr?: string) => {
    const code = curr === "DOL" ? "USD" : "ARS";
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: code,
    }).format(v ?? 0);
  }, []);

  const slugify = (text: string) =>
    text
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

  const downloadPDF = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/credit-notes/${creditNote.id_credit_note}/pdf`,
        { headers: { Accept: "application/pdf" } },
      );
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;

      const name = creditNote.recipient
        ? slugify(creditNote.recipient)
        : `cn_${creditNote.id_credit_note}`;

      link.download = `NotaCred_${name}_${creditNote.id_credit_note}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
      toast.success("Nota de crédito descargada exitosamente.");
    } catch {
      toast.error("No se pudo descargar la nota de crédito.");
    } finally {
      setLoading(false);
    }
  };

  // Extraemos el payload AFIP como JsonObject
  const raw = creditNote.payloadAfip as Prisma.JsonObject | null;
  // payloadAfip ya contiene directamente los campos del voucher
  const voucherData = raw as VoucherData | undefined;

  if (!voucherData) {
    return (
      <div className="h-fit space-y-3 rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white">
        <p className="font-semibold">
          Número: <span className="font-light">{creditNote.credit_number}</span>
        </p>
        <p className="font-semibold">
          Fecha:{" "}
          <span className="font-light">
            {new Date(creditNote.issue_date).toLocaleDateString("es-AR")}
          </span>
        </p>
        <p className="font-light text-red-500">Sin datos AFIP</p>
      </div>
    );
  }

  const { CbteFch, Iva, ImpNeto, ImpIVA } = voucherData;

  let base21 = 0,
    base105 = 0,
    exento = 0;

  Iva.forEach(({ Id, BaseImp, Importe }) => {
    if (Id === 5) base21 += BaseImp + Importe;
    else if (Id === 4) base105 += BaseImp + Importe;
    else exento += BaseImp;
  });

  const formatDate = (raw: number) => {
    const s = raw.toString(),
      y = s.slice(0, 4),
      m = s.slice(4, 6),
      d = s.slice(6, 8);
    return new Date(`${y}-${m}-${d}T00:00:00`).toLocaleDateString("es-AR");
  };

  return (
    <div className="h-fit space-y-3 rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white">
      <div className="flex justify-between">
        <p className="text-xl font-semibold">{creditNote.credit_number}</p>
        <p className="font-light">{formatDate(CbteFch)}</p>
      </div>
      <p>
        {creditNote.recipient} – Factura {creditNote.invoiceId}
      </p>
      <p className="flex justify-between">
        Base 21%{" "}
        <span className="font-light">{fmt(base21, creditNote.currency)}</span>
      </p>
      <p className="flex justify-between">
        Base 10.5%{" "}
        <span className="font-light">{fmt(base105, creditNote.currency)}</span>
      </p>
      <p className="flex justify-between">
        Exento{" "}
        <span className="font-light">{fmt(exento, creditNote.currency)}</span>
      </p>
      <p className="flex justify-between">
        Neto{" "}
        <span className="font-light">{fmt(ImpNeto, creditNote.currency)}</span>
      </p>
      <p className="flex justify-between">
        IVA{" "}
        <span className="font-light">{fmt(ImpIVA, creditNote.currency)}</span>
      </p>
      <p className="flex justify-between">
        Total{" "}
        <span className="font-light">
          {fmt(creditNote.total_amount, creditNote.currency)}
        </span>
      </p>
      <div className="flex justify-end pt-3">
        <button
          onClick={downloadPDF}
          disabled={loading}
          className={`rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur ${
            loading ? "cursor-not-allowed opacity-50" : ""
          }`}
        >
          {loading ? (
            <Spinner />
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
                d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
