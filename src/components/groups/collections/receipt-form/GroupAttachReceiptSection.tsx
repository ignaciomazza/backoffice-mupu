// src/components/receipts/receipt-form/AttachReceiptSection.tsx
"use client";

import React from "react";
import Spinner from "@/components/Spinner";
import type { AttachableReceiptOption } from "@/types/receipts";
import { Field, Section, inputBase } from "./primitives";

export default function GroupAttachReceiptSection(props: {
  show: boolean;

  receiptQuery: string;
  setReceiptQuery: (v: string) => void;
  receiptOptions: AttachableReceiptOption[];
  loadingReceipts: boolean;

  selectedReceiptId: number | null;
  setSelectedReceiptId: (v: number | null) => void;

  errors: Record<string, string>;
}) {
  const {
    show,
    receiptQuery,
    setReceiptQuery,
    receiptOptions,
    loadingReceipts,
    selectedReceiptId,
    setSelectedReceiptId,
    errors,
  } = props;

  if (!show) return null;

  return (
    <Section
      title="Recibo existente"
      desc="Buscá el recibo que ya fue creado para asociarlo a esta reserva/servicios."
    >
      <Field id="receipt_search" label="Buscar recibo" hint="Por número o importe…">
        <input
          id="receipt_search"
          value={receiptQuery}
          onChange={(e) => setReceiptQuery(e.target.value)}
          placeholder='Ej.: "N° 123", "USD 500", "ARS 1200000"...'
          className={inputBase}
        />
      </Field>

      <div className="md:col-span-2">
        {loadingReceipts ? (
          <div className="py-2">
            <Spinner />
          </div>
        ) : receiptOptions.length > 0 ? (
          <div className="max-h-56 overflow-auto rounded-2xl border border-sky-200/70 bg-white/70 dark:border-sky-900/40 dark:bg-slate-900/50">
            {receiptOptions.map((opt) => {
              const active = selectedReceiptId === opt.id_receipt;
              return (
                <button
                  key={opt.id_receipt}
                  type="button"
                  className={`w-full px-3 py-2 text-left transition ${
                    active
                      ? "bg-sky-100/70 text-slate-900 dark:bg-sky-900/25 dark:text-slate-100"
                      : "text-slate-700 hover:bg-sky-50/45 dark:text-slate-200 dark:hover:bg-slate-800/70"
                  }`}
                  onClick={() => setSelectedReceiptId(opt.id_receipt)}
                >
                  <div className="text-[13px] font-medium md:text-sm">{opt.label}</div>
                  {opt.subtitle && (
                    <div className="text-[11px] text-slate-600 dark:text-slate-400 md:text-xs">
                      {opt.subtitle}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ) : receiptQuery ? (
          <p className="text-[13px] text-slate-600 dark:text-slate-400 md:text-sm">
            Sin resultados.
          </p>
        ) : (
          <p className="text-[13px] text-slate-600 dark:text-slate-400 md:text-sm">
            Escribí para buscar…
          </p>
        )}

        {errors.receipt && <p className="mt-1 text-xs text-red-600">{errors.receipt}</p>}
      </div>
    </Section>
  );
}
