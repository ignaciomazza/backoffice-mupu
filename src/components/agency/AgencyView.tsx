// src/components/agency/AgencyView.tsx
"use client";

type Maybe<T> = T | null | undefined;

export type AgencyDTO = {
  id_agency: number;
  name: string;
  legal_name: string;
  address?: Maybe<string>;
  phone?: Maybe<string>;
  email?: Maybe<string>;
  tax_id: string;
  website?: Maybe<string>;
  foundation_date?: Maybe<string | Date>;
  logo_url?: Maybe<string>;
  use_agency_numbers?: boolean | null;
};

interface AgencyViewProps {
  agency: AgencyDTO;
}

function formatDate(value?: string | Date | null): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "—";
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <p className="font-light">
      <span className="mr-2 font-semibold dark:font-medium">{label}</span>
      {children}
    </p>
  );
}

export default function AgencyView({ agency }: AgencyViewProps) {
  const safe = (v?: string | null) => (v && v.trim() ? v : "—");

  return (
    <div className="mb-6 space-y-3 rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white">
      <Field label="Nombre">{safe(agency.name)}</Field>
      <Field label="Razón Social">{safe(agency.legal_name)}</Field>
      <Field label="Dirección">{safe(agency.address)}</Field>
      <Field label="Teléfono">{safe(agency.phone)}</Field>

      <Field label="Email">
        {agency.email ? (
          <a
            href={`mailto:${agency.email}`}
            className="underline decoration-sky-300/60 underline-offset-4"
          >
            {agency.email}
          </a>
        ) : (
          "—"
        )}
      </Field>

      <Field label="CUIT">{safe(agency.tax_id)}</Field>

      <Field label="Sitio Web">
        {agency.website ? (
          <a
            href={agency.website}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-sky-300/60 underline-offset-4"
          >
            {agency.website}
          </a>
        ) : (
          "—"
        )}
      </Field>

      <Field label="Fecha de Fundación">
        {formatDate(agency.foundation_date)}
      </Field>
    </div>
  );
}
