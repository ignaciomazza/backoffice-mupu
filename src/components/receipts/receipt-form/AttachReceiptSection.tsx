// src/components/receipts/receipt-form/AttachReceiptSection.tsx
"use client";

import React from "react";
import Spinner from "@/components/Spinner";
import type { AttachableReceiptOption } from "@/types/receipts";
import { Field, Section, inputBase } from "./primitives";

export default function AttachReceiptSection(props: {
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
          <div className="max-h-56 overflow-auto rounded-2xl border border-white/10">
            {receiptOptions.map((opt) => {
              const active = selectedReceiptId === opt.id_receipt;
              return (
                <button
                  key={opt.id_receipt}
                  type="button"
                  className={`w-full px-3 py-2 text-left transition hover:bg-white/5 ${
                    active ? "bg-white/10" : ""
                  }`}
                  onClick={() => setSelectedReceiptId(opt.id_receipt)}
                >
                  <div className="text-sm font-medium">{opt.label}</div>
                  {opt.subtitle && (
                    <div className="text-xs text-sky-950/70 dark:text-white/70">
                      {opt.subtitle}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ) : receiptQuery ? (
          <p className="text-sm text-sky-950/70 dark:text-white/70">Sin resultados.</p>
        ) : (
          <p className="text-sm text-sky-950/70 dark:text-white/70">Escribí para buscar…</p>
        )}

        {errors.receipt && <p className="mt-1 text-xs text-red-600">{errors.receipt}</p>}
      </div>
    </Section>
  );
}
