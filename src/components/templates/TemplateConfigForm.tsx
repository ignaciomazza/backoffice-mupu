// src/components/templates/TemplateConfigForm.tsx
/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useAgencyAndUser } from "@/lib/agencyUser";
import { asStringArray, getAvailableCoverUrls } from "@/lib/templateConfig";
import type {
  TemplateConfig,
  TemplateFormValues,
  Agency,
} from "@/types/templates";

/* --------------------------- Helpers de módulo (tipados) --------------------------- */
type CoverSavedItem = { url: string; name?: string };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const isCoverSavedItem = (v: unknown): v is CoverSavedItem =>
  isRecord(v) &&
  typeof (v as { url?: unknown }).url === "string" &&
  (v as { url: string }).url.trim().length > 0;

/* --------------------------- UI helpers --------------------------- */
const cx = (...c: Array<string | false | null | undefined>) =>
  c.filter(Boolean).join(" ");

type Props = {
  cfg: TemplateConfig;
  value: TemplateFormValues;
  onChange: (next: TemplateFormValues) => void;
  token?: string | null;
  className?: string;
};

/* --------------------------- Tiny atoms --------------------------- */

function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "mb-6 h-fit rounded-2xl border border-slate-900/10 bg-white/50 p-4 dark:border-white/10 dark:bg-white/10",
        className,
      )}
    >
      {children}
    </section>
  );
}

function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 p-4 pb-2">
      <div>
        <h3 className="text-base font-semibold tracking-wide opacity-95">
          {title}
        </h3>
        {subtitle && (
          <p className="mt-0.5 text-xs leading-relaxed opacity-70">
            {subtitle}
          </p>
        )}
      </div>
      {right}
    </div>
  );
}

function RadioBadge({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        "pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
        active
          ? "bg-sky-500/90 text-white"
          : "bg-white/10 text-white/80 opacity-0",
      )}
    >
      <svg
        viewBox="0 0 20 20"
        className={cx("size-3.5", active ? "opacity-100" : "opacity-0")}
        fill="none"
      >
        <path
          d="M8.5 13.5l-3-3 1.4-1.4 1.6 1.6 4.6-4.6L14.5 7l-6 6.5z"
          fill="currentColor"
        />
      </svg>
      Seleccionado
    </span>
  );
}

function OptionTile({
  active,
  onClick,
  children,
  title,
  icon,
  role,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  title?: string;
  icon?: React.ReactNode;
  role?: "radio";
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      role={role}
      aria-pressed={!!active}
      className={cx(
        `relative rounded-xl border p-3 text-left transition hover:scale-[0.99] ${
          active
            ? "border-sky-400 ring-2 ring-sky-300"
            : "border-slate-900/10 dark:border-white/10"
        }`,
      )}
    >
      {icon && (
        <div className="mb-2 inline-flex size-8 items-center justify-center rounded-xl bg-white/10 text-white/90">
          {icon}
        </div>
      )}
      {children}
      <RadioBadge active={!!active} />
    </button>
  );
}

function SkeletonLine({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        "h-3 w-full animate-pulse rounded-full bg-white/10",
        className,
      )}
    />
  );
}

/* --------------------------- Main --------------------------- */

export default function TemplateConfigForm({
  cfg,
  value,
  onChange,
  token,
  className,
}: Props) {
  const { token: ctxToken } = useAuth();
  const authToken = token ?? ctxToken ?? null;

  const { agency, loading } = useAgencyAndUser(authToken);

  /* ------- Portada: combinamos saved[] + url actual + helper ------- */
  const savedCovers = useMemo<CoverSavedItem[]>(() => {
    const raw = (cfg.coverImage as { saved?: unknown } | undefined)?.saved;
    if (!Array.isArray(raw)) return [];
    return raw.filter(isCoverSavedItem).map((x) => ({
      url: x.url,
      name: typeof x.name === "string" && x.name.trim() ? x.name : "Sin título",
    }));
  }, [cfg]);

  const helperUrls = useMemo(() => getAvailableCoverUrls(cfg), [cfg]);

  const singleUrl = useMemo<string[]>(
    () => (cfg.coverImage?.url ? [cfg.coverImage.url] : []),
    [cfg.coverImage?.url],
  );

  const coverOptions = useMemo<Array<{ url: string; name: string }>>(() => {
    const map = new Map<string, { url: string; name: string }>();
    // Prioridad: saved[] (con nombre) → helper → url suelta
    savedCovers.forEach((s) =>
      map.set(s.url, { url: s.url, name: s.name ?? s.url }),
    );
    [...helperUrls, ...singleUrl].filter(Boolean).forEach((u) => {
      if (!map.has(u)) map.set(u, { url: u, name: u });
    });
    return Array.from(map.values());
  }, [savedCovers, helperUrls, singleUrl]);

  const selectedCoverUrl = value.cover?.url ?? cfg.coverImage?.url ?? "";
  const setCoverUrl = (url: string) =>
    onChange({ ...value, cover: { ...(value.cover ?? {}), url } });

  /* ------- Contacto: agencia vs vendedores ------- */
  const phoneOptions = useMemo(() => {
    const ag = agency as Partial<Agency> | undefined;

    // Teléfono institucional de la agencia
    const agencyPhone = ag?.phone
      ? [
          {
            value: String(ag.phone),
            kind: "agency" as const,
            label: String(ag.phone),
          },
        ]
      : [];

    // Teléfonos de vendedores
    const sellerPhones = Array.isArray(ag?.phones)
      ? asStringArray(ag?.phones).map((p) => ({
          value: p,
          kind: "seller" as const,
          label: p,
        }))
      : [];

    // Unificar y desduplicar por número, priorizando el orden: agencia primero
    const map = new Map<
      string,
      { value: string; kind: "agency" | "seller"; label: string }
    >();
    [...agencyPhone, ...sellerPhones].forEach((opt) => {
      if (opt.value) map.set(opt.value, opt);
    });

    return Array.from(map.values());
  }, [agency]);

  const selectedPhone = value.contact?.phone ?? "";
  const setContactPhone = (phone: string) =>
    onChange({ ...value, contact: { ...(value.contact ?? {}), phone } });

  /* ------- Pago ------- */
  const paymentOptions = asStringArray(cfg.paymentOptions);
  const paymentIdx = value.payment?.selectedIndex;
  const setPaymentIndex = (idx: number) =>
    onChange({
      ...value,
      payment: { ...(value.payment ?? {}), selectedIndex: idx },
    });

  /* --------------------------- Render --------------------------- */

  return (
    <div className={cx("space-y-6 dark:text-white", className)}>
      {/* --------------------------- Portada --------------------------- */}
      <Card>
        <SectionHeader
          title="Portada"
          subtitle="Elegí una imagen de portada definida por el gerente. La proporción se adapta automáticamente."
        />

        {coverOptions.length === 0 ? (
          <div className="px-4 pb-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm opacity-80">
              No hay imágenes configuradas para portada.
            </div>
          </div>
        ) : (
          <div
            className="grid grid-cols-2 gap-3 px-4 pb-4 md:grid-cols-3 lg:grid-cols-4"
            role="radiogroup"
            aria-label="Seleccionar portada"
          >
            {coverOptions.map(({ url, name }) => {
              const active = selectedCoverUrl === url;
              return (
                <OptionTile
                  key={url}
                  active={active}
                  onClick={() => setCoverUrl(url)}
                  title={name || url}
                  role="radio"
                >
                  <div className="relative overflow-hidden rounded-xl">
                    {/* Ratio 16/9 */}
                    <div className="pointer-events-none aspect-[16/9] w-full">
                      <img
                        src={url}
                        alt={name || "Portada"}
                        className="size-full rounded-xl object-cover"
                      />
                    </div>

                    {/* Gradiente + etiqueta con el nombre */}
                    <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-t from-black/50 via-black/0 to-black/0" />
                    {name ? (
                      <div className="absolute bottom-2 left-2 max-w-[85%] truncate rounded-md bg-black/60 px-2 py-0.5 text-[11px] text-white">
                        {name}
                      </div>
                    ) : null}
                  </div>
                </OptionTile>
              );
            })}
          </div>
        )}
      </Card>

      {/* --------------------------- Contacto --------------------------- */}
      <Card>
        <SectionHeader
          title="Contacto a mostrar"
          subtitle="Elegí si mostrar el teléfono institucional de la agencia o el de un vendedor."
        />

        {loading ? (
          <div className="grid grid-cols-1 gap-2 px-4 pb-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-white/10 p-3">
                <SkeletonLine className="mb-2 h-4 w-24" />
                <SkeletonLine />
              </div>
            ))}
          </div>
        ) : phoneOptions.length === 0 ? (
          <div className="px-4 pb-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm opacity-80">
              La agencia no tiene teléfonos cargados.
            </div>
          </div>
        ) : (
          <div
            className="grid grid-cols-1 gap-2 px-4 pb-4 md:grid-cols-2 lg:grid-cols-3"
            role="radiogroup"
            aria-label="Seleccionar teléfono"
          >
            {phoneOptions.map((opt, idx) => {
              const active = selectedPhone === opt.value;
              return (
                <OptionTile
                  key={`${opt.value}-${idx}`}
                  active={active}
                  onClick={() => setContactPhone(opt.value)}
                  title={opt.value}
                  role="radio"
                  icon={
                    <svg
                      viewBox="0 0 24 24"
                      className="size-4 opacity-80"
                      fill="currentColor"
                    >
                      <path d="M6.6 10.8a15.8 15.8 0 006.6 6.6l2.2-2.2a1 1 0 011.1-.24c1.2.48 2.5.74 3.8.74a1 1 0 011 1v3.5a1 1 0 01-1 1C10.4 22 2 13.6 2 3a1 1 0 011-1h3.5a1 1 0 011 1c0 1.3.26 2.6.74 3.8a1 1 0 01-.24 1.1L6.6 10.8z" />
                    </svg>
                  }
                >
                  <div className="flex flex-col">
                    <div className="text-sm font-medium opacity-95">
                      {opt.label}
                    </div>
                    <div className="text-xs opacity-70">
                      {opt.kind === "agency"
                        ? "Teléfono de la agencia"
                        : "Teléfono de vendedor"}
                    </div>
                  </div>
                </OptionTile>
              );
            })}
          </div>
        )}
      </Card>

      {/* --------------------------- Pago --------------------------- */}
      <Card>
        <SectionHeader
          title="Opciones de pago"
          subtitle="Seleccioná la leyenda de pago disponible para este documento."
        />

        {paymentOptions.length === 0 ? (
          <div className="px-4 pb-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm opacity-80">
              No hay opciones de pago cargadas.
            </div>
          </div>
        ) : (
          <div
            className="space-y-3 px-4 pb-4"
            role="radiogroup"
            aria-label="Seleccionar forma de pago"
          >
            <div className="grid grid-cols-1 gap-2">
              {paymentOptions.map((p, idx) => {
                const active = paymentIdx === idx;
                return (
                  <OptionTile
                    key={idx}
                    active={active}
                    onClick={() => setPaymentIndex(idx)}
                    title={p}
                    role="radio"
                    icon={
                      <svg
                        viewBox="0 0 24 24"
                        className="size-4 opacity-80"
                        fill="currentColor"
                      >
                        <path d="M2 7a3 3 0 013-3h14a3 3 0 013 3v1H2V7zm20 4H2v6a3 3 0 003 3h14a3 3 0 003-3v-6zm-6 3h4v2h-4v-2z" />
                      </svg>
                    }
                  >
                    <div className="text-sm leading-relaxed opacity-90">
                      {p.length > 180 ? p.slice(0, 177) + "…" : p}
                    </div>
                  </OptionTile>
                );
              })}
            </div>

            {typeof paymentIdx === "number" && paymentOptions[paymentIdx] && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm opacity-90">
                {paymentOptions[paymentIdx]}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
