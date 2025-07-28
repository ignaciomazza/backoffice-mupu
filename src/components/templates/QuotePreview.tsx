// src/components/templates/QuotePreview.tsx

/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import { SimpleQuote } from "./QuoteForm";
import { User } from "@/types";

interface QuotePreviewProps {
  quote: SimpleQuote;
  user: User;
}

export default function QuotePreview({ quote, user }: QuotePreviewProps) {
  const { dateRange, region, price, currency, concept } = quote;

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
    }).format(v);

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/10 p-10 text-white shadow-md shadow-sky-950/10 backdrop-blur">
      <div className="m-auto w-2/3 overflow-hidden rounded-2xl bg-black">
        {/* Pagina 1 */}
        <img
          src={`/images/${region}.jpg`}
          alt={region}
          className="h-[600px] w-full object-cover"
        />

        <div className="pb-24">
          <div className="relative bottom-24 flex h-24 w-full items-center bg-black/20 px-10">
            <div className="flex w-fit flex-col items-center justify-center">
              <h1 className="text-3xl font-black">MUPU VIAJES</h1>
              <p className="text-xl font-light tracking-wide">
                Cotización de viaje
              </p>
            </div>
          </div>

          <div className="px-10">
            <div className="m-auto mb-24 grid w-fit list-none grid-cols-2 gap-4">
              <li className="flex items-center gap-1 font-light">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.2}
                  stroke="currentColor"
                  className="size-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"
                  />
                </svg>
                +54 9 11 5970 1234
              </li>
              <li className="flex items-center gap-1 font-light">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.2}
                  stroke="currentColor"
                  className="size-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
                  />
                </svg>
                info@mupuviajes.com.ar
              </li>
              <li className="flex items-center gap-1 font-light">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.2}
                  stroke="currentColor"
                  className="size-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418"
                  />
                </svg>
                mupuviajes.com
              </li>
              <li className="flex items-center gap-1 font-light">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.2}
                  stroke="currentColor"
                  className="size-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
                  />
                </svg>
                Domingo F. Sarmiento 1355
              </li>
            </div>

            {/* Pagina 2 */}
            <div>
              <p className="mb-10 flex w-full justify-center text-3xl font-semibold">
                DATOS DEL VIAJE
              </p>
              <p className="mb-10 whitespace-pre-wrap font-light">
                {dateRange}
              </p>
            </div>

            <div className="mb-10">
              <p className="text-xl font-bold">{fmtCurrency(price)}</p>
              <p className="w-1/2 text-xl">{concept}</p>
            </div>

            <div className="mb-10 space-y-1">
              <p className="text-lg font-medium">FORMAS DE PAGO</p>
              <p className="font-light">
                Se reserva con el 50% del valor total del paquete - esto puede
                ser abonado en efectivo, transferencia y/o depósito - en dólares
                o en pesos argentinos (para pesos argentinos se debe consultar
                previamente la cotización del dólar del día). El saldo restante
                puede ser abonado en plan de pagos. Es imprescindible que un mes
                antes de la fecha de salida del viaje el paquete esté abonado en
                su totalidad. Las cuotas pueden ser abonadas en efectivo,
                transferencia y/o depósito - en dólares o en pesos argentinos
                (para pesos argentinos se debe consultar previamente la
                cotización del dólar del día).
              </p>
            </div>

            <div className="mb-10 flex w-full flex-col items-end justify-center text-xs font-light">
              <p>
                {user.first_name} {user.last_name}
              </p>
              <p>Agente de viajes</p>
              <p className="mt-2">{user.email}</p>
            </div>

            <p className="mb-10 text-sm font-light tracking-wide">
              Gracias por elegir Mupu Viajes.
            </p>

            <div className="space-y-2">
              <img src="/logo.png" alt="Logo Agencia" className="m-auto h-6" />
              <p className="text-center text-xs font-light">
                MUPU S.R.L. - Legajo 15362
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
