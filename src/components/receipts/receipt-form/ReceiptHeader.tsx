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

  selectedBookingDisplayId: number | null;
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
    selectedBookingDisplayId,
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
            {visible ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 12h14"
                />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
            )}
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

          {mode === "booking" && selectedBookingDisplayId && (
            <span className={`${pillBase} ${pillNeutral}`}>
              Reserva N° {selectedBookingDisplayId}
            </span>
          )}

          {selectedServiceCount > 0 && (
            <span className={`${pillBase} ${pillOk}`}>Svcs: {selectedServiceCount}</span>
          )}

          {!!effectiveCurrency && lockedCurrency && lockedCurrency !== effectiveCurrency ? (
            <>
              <span className={`${pillBase} ${pillOk}`}>
                Servicio: {lockedCurrency} (lock)
              </span>
              <span className={`${pillBase} ${pillNeutral}`}>
                Cobro: {effectiveCurrency}
              </span>
            </>
          ) : (
            !!effectiveCurrency && (
              <span
                className={`${pillBase} ${lockedCurrency ? pillOk : pillNeutral}`}
              >
                {effectiveCurrency} {lockedCurrency ? "(lock)" : ""}
              </span>
            )
          )}
        </div>
      </button>
    </div>
  );
}
