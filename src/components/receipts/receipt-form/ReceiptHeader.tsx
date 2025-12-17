// src/components/receipts/receipt-form/ReceiptHeader.tsx
"use client";

import React from "react";
import { pillBase, pillNeutral, pillOk } from "./primitives";

type Mode = "agency" | "booking";
type Action = "create" | "attach";

export default function ReceiptHeader(props: {
  visible: boolean;
  onToggle: () => void;

  editingReceiptId: number | null;
  action: Action;
  mode: Mode;

  selectedBookingId: number | null;
  selectedServiceCount: number;
  effectiveCurrency: string;
  lockedCurrency: string | null;
}) {
  const {
    visible,
    onToggle,
    editingReceiptId,
    action,
    mode,
    selectedBookingId,
    selectedServiceCount,
    effectiveCurrency,
    lockedCurrency,
  } = props;

  const title = editingReceiptId
    ? "Editar Recibo"
    : action === "attach"
      ? "Asociar Recibo Existente"
      : "Agregar Recibo";

  return (
    <div
      className={`sticky top-0 z-10 ${
        visible ? "rounded-t-3xl border-b" : ""
      } border-white/10 px-4 py-3 backdrop-blur-sm`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between text-left"
        aria-expanded={visible}
      >
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-full bg-sky-100 text-sky-950 shadow-sm shadow-sky-950/20 dark:bg-white/10 dark:text-white">
            {visible ? "−" : "+"}
          </div>
          <p className="text-lg font-semibold">{title}</p>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <span
            className={`${pillBase} ${action === "attach" ? pillOk : pillNeutral}`}
          >
            {action === "attach" ? "Asociar existente" : "Crear nuevo"}
          </span>

          <span className={`${pillBase} ${mode === "booking" ? pillOk : pillNeutral}`}>
            {mode === "booking" ? "Con reserva" : "Agencia"}
          </span>

          {mode === "booking" && selectedBookingId && (
            <span className={`${pillBase} ${pillNeutral}`}>
              Reserva #{selectedBookingId}
            </span>
          )}

          {selectedServiceCount > 0 && (
            <span className={`${pillBase} ${pillOk}`}>Svcs: {selectedServiceCount}</span>
          )}

          {!!effectiveCurrency && (
            <span className={`${pillBase} ${lockedCurrency ? pillOk : pillNeutral}`}>
              {effectiveCurrency} {lockedCurrency ? "(lock)" : ""}
            </span>
          )}
        </div>
      </button>
    </div>
  );
}
