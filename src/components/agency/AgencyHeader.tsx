// src/components/agency/AgencyHeader.tsx
"use client";

import * as React from "react";
import type { AgencyDTO } from "./AgencyView";

interface AgencyHeaderProps {
  agency: AgencyDTO | null;
}

export default function AgencyHeader({
  agency,
}: AgencyHeaderProps) {
  const logo = agency?.logo_url || "";

  return (
    <header className="mb-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="size-16 overflow-hidden rounded-2xl border border-white/10 bg-white/10 p-1 shadow-sm backdrop-blur">
          {logo ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={logo}
              alt="Logo de la agencia"
              className="size-full object-contain"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-sky-950/40 dark:text-white/40">
              {/* placeholder icon */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="size-6"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                fill="none"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 8.25A2.25 2.25 0 015.25 6h13.5A2.25 2.25 0 0121 8.25v7.5A2.25 2.25 0 0118.75 18H5.25A2.25 2.25 0 013 15.75v-7.5z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 9l6.75 4.5c.69.46 1.56.46 2.25 0L21 9"
                />
              </svg>
            </div>
          )}
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-sky-950 dark:text-white">
            {agency?.name ?? "Agencia"}
          </h1>
          {agency?.tax_id && (
            <p className="text-xs font-light text-sky-950/70 dark:text-white/60">
              CUIT: {agency.tax_id}
            </p>
          )}
        </div>
      </div>
    </header>
  );
}
