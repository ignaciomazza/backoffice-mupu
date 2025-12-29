// src/components/agency/AgencyReadOnlyCard.tsx
"use client";

import * as React from "react";
import type { AgencyDTO } from "./AgencyForm";

interface Props {
  agency: AgencyDTO;
  onEdit?: () => void;
}

function formatDDMMYYYY(dateLike?: string | null): string {
  if (!dateLike) return "No disponible";
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "No disponible";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export default function AgencyReadOnlyCard({ agency, onEdit }: Props) {
  const social = agency.social ?? {};
  const socialItems = [
    { label: "Instagram", value: social.instagram },
    { label: "Facebook", value: social.facebook },
    { label: "Twitter", value: social.twitter },
    { label: "TikTok", value: social.tiktok },
  ].filter((item) => item.value && item.value.trim().length > 0);

  return (
    <div className="space-y-4 rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="size-16 overflow-hidden rounded-2xl border border-white/10 bg-white/20 dark:bg-white/10">
            {agency.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={agency.logo_url}
                alt="Logo de la agencia"
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center text-xs text-sky-950/60 dark:text-white/60">
                Sin logo
              </div>
            )}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold dark:font-medium">
              {agency.name}
            </h2>
            <p className="truncate text-sm font-light">{agency.legal_name}</p>
          </div>
        </div>

        {onEdit && (
          <button
            onClick={onEdit}
            className="rounded-full bg-sky-100 px-4 py-2 text-sm text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white"
            title="Editar agencia"
          >
            Editar
          </button>
        )}
      </div>

      {/* Body */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <p className="text-xs font-light uppercase tracking-wide text-sky-950/60 dark:text-white/60">
            CUIT
          </p>
          <p className="font-medium">{agency.tax_id}</p>
        </div>

        <div>
          <p className="text-xs font-light uppercase tracking-wide text-sky-950/60 dark:text-white/60">
            Teléfono
          </p>
          <p className="font-medium">{agency.phone || "—"}</p>
        </div>

        <div>
          <p className="text-xs font-light uppercase tracking-wide text-sky-950/60 dark:text-white/60">
            Email
          </p>
          <p className="break-all font-medium">{agency.email || "—"}</p>
        </div>

        <div>
          <p className="text-xs font-light uppercase tracking-wide text-sky-950/60 dark:text-white/60">
            Sitio web
          </p>
          {agency.website ? (
            <a
              href={agency.website}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline"
            >
              {agency.website}
            </a>
          ) : (
            <p className="font-medium">—</p>
          )}
        </div>

        <div className="md:col-span-2">
          <p className="text-xs font-light uppercase tracking-wide text-sky-950/60 dark:text-white/60">
            Dirección
          </p>
          <p className="font-medium">{agency.address || "—"}</p>
        </div>

        <div className="md:col-span-2">
          <p className="text-xs font-light uppercase tracking-wide text-sky-950/60 dark:text-white/60">
            Redes sociales
          </p>
          {socialItems.length > 0 ? (
            <div className="mt-1 grid grid-cols-1 gap-1 text-sm md:grid-cols-2">
              {socialItems.map((item) => (
                <div key={item.label} className="flex gap-2">
                  <span className="font-medium">{item.label}:</span>
                  <span className="break-all">{item.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="font-medium">—</p>
          )}
        </div>

        <div>
          <p className="text-xs font-light uppercase tracking-wide text-sky-950/60 dark:text-white/60">
            Fundación
          </p>
          <p className="font-medium">
            {formatDDMMYYYY(agency.foundation_date)}
          </p>
        </div>
      </div>
    </div>
  );
}
