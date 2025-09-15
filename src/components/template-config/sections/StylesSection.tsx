// src/components/template-config/sections/StylesSection.tsx
"use client";

import React, { useEffect, useState } from "react";
import { getAt, setAt, section } from "./_helpers";
import { Config, STYLE_PRESETS, StylePreset, PdfLayout } from "../types";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";

/** ===== Mini helpers de UI ===== */
const radio =
  "inline-flex items-center gap-2 rounded-xl border border-slate-900/10 bg-white/60 px-3 py-2 text-sm transition hover:scale-[0.99] dark:border-white/10 dark:bg-white/10";
const radioActive = "ring-2 ring-sky-400 border-sky-400/60";

/** Check visual para cards activas */
const SelectedMark: React.FC = () => (
  <div className="pointer-events-none absolute right-2 top-2 rounded-full bg-sky-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
    Activo
  </div>
);

type Props = {
  cfg: Config;
  disabled: boolean;
  onChange: (next: Config) => void;
};

type AgencyLite = { id?: number; id_agency?: number } & Record<string, unknown>;

const StylesSection: React.FC<Props> = ({ cfg, disabled, onChange }) => {
  // ===== valores actuales =====
  const presetId = getAt<string>(cfg, ["styles", "presetId"], "light");
  const layout = getAt<PdfLayout>(cfg, ["layout"], "layoutA");

  // Avanzados
  const radius = getAt<string>(cfg, ["styles", "ui", "radius"], "xl"); // sm|md|lg|xl|2xl
  const width = getAt<string>(cfg, ["styles", "ui", "contentWidth"], "normal"); // narrow|normal|wide
  const density = getAt<string>(
    cfg,
    ["styles", "ui", "density"],
    "comfortable",
  ); // compact|comfortable|relaxed
  const dividers = getAt<boolean>(cfg, ["styles", "ui", "dividers"], true);

  // Colores actuales
  const colors = getAt(cfg, ["styles", "colors"], {
    background: "#ffffff",
    text: "#111827",
    accent: "#22C55E",
  }) as { background: string; text: string; accent: string };

  /** Importante: acá SOLO seteamos colores + presetId. No tocamos fonts. */
  const applyPreset = (p: StylePreset) => {
    let next = setAt(cfg, ["styles", "presetId"], p.id);
    next = setAt(next, ["styles", "colors"], p.colors);
    onChange(next);
  };

  const isPreset = (id: string) => id === presetId;

  // ===== Detección de agencia Mupu (id=1) para habilitar edición de acento =====
  const { token } = useAuth();
  const [isMupuAgency, setIsMupuAgency] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!token) return;
    (async () => {
      try {
        const res = await authFetch(
          "/api/agency",
          { cache: "no-store" },
          token,
        );
        const data = (await res.json().catch(() => ({}))) as AgencyLite;
        const agencyId =
          (typeof data.id === "number" ? data.id : data.id_agency) ?? null;
        if (mounted) setIsMupuAgency(agencyId === 1);
      } catch {
        if (mounted) setIsMupuAgency(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token]);

  // ====== preview del layout (miniatura) ======
  const LayoutThumb: React.FC<{ kind: PdfLayout; active: boolean }> = ({
    kind,
    active,
  }) => {
    const border = active
      ? `border-sky-400/50 ring-2 ring-sky-400`
      : `border-slate-900/10 dark:border-white/10`;

    const coverBlock = (
      <div
        className="h-4 w-full rounded"
        style={{ background: "rgba(0,0,0,0.22)" }}
      />
    );
    const headerBlock = (
      <div
        className="h-4 w-2/3 rounded"
        style={{ background: colors.accent }}
      />
    );
    const contentBlock = (
      <div className="grid gap-1">
        <div
          className="h-2 w-11/12 rounded"
          style={{ background: "rgba(0,0,0,0.18)" }}
        />
        <div
          className="h-2 w-10/12 rounded"
          style={{ background: "rgba(0,0,0,0.14)" }}
        />
        <div
          className="h-2 w-9/12 rounded"
          style={{ background: "rgba(0,0,0,0.10)" }}
        />
      </div>
    );
    const footerBlock = (
      <div
        className="h-3 w-1/2 rounded"
        style={{ background: "rgba(0,0,0,0.18)" }}
      />
    );

    return (
      <div
        className={`relative rounded-xl border p-3 transition hover:scale-[0.99] ${border}`}
        style={{ background: colors.background, color: colors.text }}
      >
        {active && <SelectedMark />}
        {kind === "layoutA" && (
          <div className="grid gap-2">
            {coverBlock}
            {headerBlock}
            {contentBlock}
            {footerBlock}
          </div>
        )}
        {kind === "layoutB" && (
          <div className="grid gap-2">
            {headerBlock}
            {coverBlock}
            {contentBlock}
            {footerBlock}
          </div>
        )}
        {kind === "layoutC" && (
          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <div className="grid gap-2">
              <div
                className="h-3 w-3/5 rounded"
                style={{ background: colors.accent }}
              />
              <div
                className="h-2 w-4/5 rounded"
                style={{ background: "rgba(0,0,0,0.18)" }}
              />
              <div
                className="h-2 w-2/3 rounded"
                style={{ background: "rgba(0,0,0,0.14)" }}
              />
            </div>
            <div className="grid gap-2">
              {coverBlock}
              {contentBlock}
              {footerBlock}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ====== tarjeta de preset (texto simplificado, SIN tipografías) ======
  const PresetCard: React.FC<{ p: StylePreset }> = ({ p }) => {
    const active = isPreset(p.id);
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => applyPreset(p)}
        className={`relative rounded-xl border p-3 text-left transition hover:scale-[0.99] ${
          active
            ? "border-sky-400 ring-2 ring-sky-300"
            : "border-slate-900/10 dark:border-white/10"
        }`}
      >
        {active && <SelectedMark />}

        {/* Header / título */}
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold">{p.label}</div>
          <div
            className="size-4 rounded-full"
            style={{ background: p.colors.accent }}
            aria-hidden
          />
        </div>

        {/* Bloque muestra de colores */}
        <div
          className="mb-2 grid h-14 w-full grid-cols-[1fr_auto] items-center rounded-lg px-3"
          style={{ backgroundColor: p.colors.background }}
        >
          <div className="space-y-1">
            <div
              className="h-2 w-10/12 rounded"
              style={{ background: p.colors.text, opacity: 0.9 }}
            />
            <div
              className="h-2 w-8/12 rounded"
              style={{ background: p.colors.text, opacity: 0.6 }}
            />
          </div>
          <div
            className="size-6 rounded-full"
            style={{ background: p.colors.accent }}
          />
        </div>
      </button>
    );
  };

  // ===== Handlers de color de acento (solo Mupu) =====
  const setAccent = (value: string | undefined) => {
    const next = setAt(cfg, ["styles", "colors", "accent"], value || "#22C55E");
    onChange(next);
  };

  const resetAccentToPreset = () => {
    const preset = STYLE_PRESETS.find((p) => p.id === presetId);
    const fallback = preset?.colors.accent || "#22C55E";
    setAccent(fallback);
  };

  return (
    <section className={section}>
      <h2 className="mb-3 text-lg font-semibold">Estilos y formato</h2>

      {/* ======== Presets (sin tipografías) ======== */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {STYLE_PRESETS.map((p) => (
          <PresetCard key={p.id} p={p} />
        ))}
      </div>

      {/* ======== Formatos (A/B/C) ======== */}
      <div className="mt-6">
        <div className="mb-2 text-sm font-semibold">Formato del PDF</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(["layoutA", "layoutB", "layoutC"] as PdfLayout[]).map((k) => {
            const active = layout === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => onChange(setAt(cfg, ["layout"], k))}
                disabled={disabled}
                className="text-left"
                aria-pressed={active}
              >
                <LayoutThumb kind={k} active={active} />
                <div className="mt-2 text-sm font-medium">
                  {k === "layoutA"
                    ? "Formato A"
                    : k === "layoutB"
                      ? "Formato B"
                      : "Formato C"}
                </div>
                <div className="text-xs opacity-70">
                  {k === "layoutA" &&
                    "Portada → Encabezado → Contenido → Pie de página"}
                  {k === "layoutB" &&
                    "Encabezado → Portada → Contenido → Pie de página"}
                  {k === "layoutC" &&
                    "Encabezado lateral → Contenido → Pie de página"}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ======== Color de acento (solo Mupu) ======== */}
      {isMupuAgency && (
        <div className="mt-6">
          <div className="mb-2 text-sm font-semibold">
            Color de acento (solo Mupu)
          </div>
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[auto_1fr_auto]">
            {/* Picker */}
            <label className="text-sm">
              Elegir color
              <input
                type="color"
                className="mt-1 h-10 w-12 cursor-pointer rounded border border-slate-900/10 bg-white/70 dark:border-white/10 dark:bg-white/10"
                value={colors.accent}
                onChange={(e) => setAccent(e.target.value)}
                disabled={disabled}
                title="Elegí un color de acento"
              />
            </label>

            {/* Input libre */}
            <label className="text-sm">
              Valor (hex / rgb / etc.)
              <input
                className="mt-1 w-full rounded-lg border border-slate-900/10 bg-white/60 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/10"
                value={colors.accent}
                onChange={(e) => setAccent(e.target.value || undefined)}
                placeholder="#22C55E"
                disabled={disabled}
              />
            </label>

            {/* Reset */}
            <button
              type="button"
              onClick={resetAccentToPreset}
              disabled={disabled}
              className="rounded-xl border border-slate-900/10 bg-white/60 px-3 py-2 text-sm transition hover:scale-[0.99] dark:border-white/10 dark:bg-white/10"
              title="Volver al color de acento del preset seleccionado"
            >
              Restablecer al preset
            </button>
          </div>
          <div className="mt-2 text-xs opacity-70">
            Este color se usa para líneas, badges y títulos resaltados en el
            PDF.
          </div>
        </div>
      )}

      {/* ======== Avanzados de presentación ======== */}
      <div className="mt-6">
        <div className="mb-2 text-sm font-semibold">Ajustes avanzados</div>

        {/* Radio de bordes + Ancho de contenido */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-xs opacity-70">Radio de bordes</div>
            <div className="flex flex-wrap gap-2">
              {(["sm", "md", "lg", "xl", "2xl"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    onChange(setAt(cfg, ["styles", "ui", "radius"], opt))
                  }
                  className={`${radio} ${opt === radius ? radioActive : ""}`}
                  aria-pressed={opt === radius}
                >
                  <div
                    className={`h-4 w-8 ${
                      opt === "2xl"
                        ? "rounded-2xl"
                        : opt === "xl"
                          ? "rounded-xl"
                          : opt === "lg"
                            ? "rounded-lg"
                            : opt === "md"
                              ? "rounded-md"
                              : "rounded-sm"
                    } bg-black/20 dark:bg-white/20`}
                  />
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs opacity-70">Ancho del contenido</div>
            <div className="flex flex-wrap gap-2">
              {(["narrow", "normal", "wide"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    onChange(setAt(cfg, ["styles", "ui", "contentWidth"], opt))
                  }
                  className={`${radio} ${opt === width ? radioActive : ""}`}
                  aria-pressed={opt === width}
                >
                  <div className="flex items-end gap-[2px]">
                    <div
                      className={`h-3 ${
                        opt === "narrow"
                          ? "w-6"
                          : opt === "normal"
                            ? "w-8"
                            : "w-10"
                      } rounded bg-black/20 dark:bg-white/20`}
                    />
                  </div>
                  {opt === "narrow"
                    ? "Estrecho"
                    : opt === "normal"
                      ? "Normal"
                      : "Ancho"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Densidad + Divisores */}
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-xs opacity-70">Densidad</div>
            <div className="flex flex-wrap gap-2">
              {(["compact", "comfortable", "relaxed"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    onChange(setAt(cfg, ["styles", "ui", "density"], opt))
                  }
                  className={`${radio} ${opt === density ? radioActive : ""}`}
                  aria-pressed={opt === density}
                >
                  {opt === "compact"
                    ? "Compacta"
                    : opt === "comfortable"
                      ? "Cómoda"
                      : "Relajada"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs opacity-70">
              Divisor entre secciones
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  onChange(setAt(cfg, ["styles", "ui", "dividers"], !dividers))
                }
                className={`${radio} ${dividers ? radioActive : ""}`}
                aria-pressed={dividers}
              >
                {dividers ? "Activado" : "Desactivado"}
              </button>
              <div
                className={`h-px flex-1 ${dividers ? "bg-black/30 dark:bg-white/30" : "bg-transparent"}`}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default StylesSection;
