// src/app/template-config/[doc_type]/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import type {
  DocType,
  TemplateConfig as TemplateConfigRecord,
  ConfirmationTemplateConfig,
  QuoteTemplateConfig,
} from "@/types";

// ===== JSON tipos seguros (evitamos any/ciclos) =====
type JsonObject = Record<string, unknown>;

// ===== Tipos locales =====
type UpsertMode = "replace" | "merge";
type UpsertPayload = { config: JsonObject; mode?: UpsertMode };

type ApiGetResponse<T extends DocType = DocType> = {
  exists: boolean;
  id_template: number | null;
  id_agency: number;
  doc_type: T;
  config:
    | JsonObject
    | (ConfirmationTemplateConfig & JsonObject)
    | (QuoteTemplateConfig & JsonObject);
  created_at: string | null;
  updated_at: string | null;
};

// ===== Helpers JSON =====
function isJsonObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toJsonObject(v: unknown): JsonObject {
  return isJsonObject(v) ? (v as JsonObject) : {};
}

function getAt<T>(obj: JsonObject, path: string[], fallback: T): T {
  let cur: unknown = obj;
  for (const k of path) {
    if (!isJsonObject(cur)) return fallback;
    cur = (cur as JsonObject)[k];
  }
  return (cur as T) ?? fallback;
}

function setAt(obj: JsonObject, path: string[], value: unknown): JsonObject {
  const next: JsonObject = { ...obj };
  let cur: JsonObject = next;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    const v = cur[k];
    if (!isJsonObject(v)) {
      cur[k] = {};
    }
    cur = cur[k] as JsonObject;
  }
  cur[path[path.length - 1]] = value;
  return next;
}

function ensureMapStringString(v: unknown): Record<string, string> {
  if (!isJsonObject(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === "string") out[k] = val;
  }
  return out;
}

function ensureStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === "string") as string[];
}

// ===== Valores sugeridos por doc_type (para botón "Sugeridos") =====
const DEFAULTS: Partial<Record<DocType, JsonObject>> = {
  confirmation: {
    styles: {
      colors: {
        background: "#ffffff",
        text: "#0F172A",
        accent: "#22c55e",
        overlayOpacity: 0.6,
      },
      fonts: { heading: "Inter", body: "Inter" },
    },
    coverImage: { mode: "none" },
    contactItems: ["phones", "email", "website", "instagram"],
    labels: {
      header: "Confirmación de Servicios",
      confirmedData: "Datos del titular",
      pax: "Pasajeros",
      services: "Servicios",
      terms: "Términos y condiciones",
      planPago: "Formas de pago",
    },
    termsAndConditions: "",
    metodosDePago: {
      ARS: "Transferencia a alias: agencia.ars — Enviar comprobante.",
      USD: "Transferencia en USD (caja ahorro) — Consultar CBU.",
    },
  } as ConfirmationTemplateConfig as JsonObject,
  quote: {
    styles: {
      colors: {
        background: "#ffffff",
        text: "#0F172A",
        accent: "#22c55e",
        overlayOpacity: 0.6,
      },
      fonts: { heading: "Inter", body: "Inter" },
    },
    coverImage: { mode: "none" },
    contactItems: ["phones", "email", "website", "instagram"],
    labels: {
      title: "Propuesta de Viaje",
      prices: "Precios",
      planPago: "Formas de pago",
    },
    metodosDePago: {
      ARS: "Transferencia en ARS — Alias: agencia.ars",
      USD: "Transferencia en USD — Solicitar CBU",
    },
  } as QuoteTemplateConfig as JsonObject,
};

// ===== UI auxiliares =====
const inputBase =
  "w-full appearance-none rounded-2xl bg-white/50 border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white";

const contactOptions = [
  "phones",
  "email",
  "website",
  "address",
  "instagram",
  "facebook",
  "twitter",
  "tiktok",
] as const;

const confirmationLabelKeys = [
  "header",
  "confirmedData",
  "pax",
  "services",
  "terms",
  "planPago",
] as const;

const quoteLabelKeys = ["title", "prices", "planPago"] as const;

// ===== Componente =====
export default function Page() {
  const params = useParams<{ doc_type?: string }>();
  const docType = String(params?.doc_type || "") as DocType;

  const { token } = useAuth();

  const [mode, setMode] = useState<UpsertMode>("merge");
  const [cfg, setCfg] = useState<JsonObject>({});

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);

  const [exists, setExists] = useState<boolean>(false);
  const [resolvedView, setResolvedView] = useState<boolean>(false);

  const [meta, setMeta] = useState<{
    id_template: number | null;
    created_at: string | null;
    updated_at: string | null;
  }>({ id_template: null, created_at: null, updated_at: null });

  // abort para GET
  const abortRef = useRef<AbortController | null>(null);

  const fallback = useMemo<JsonObject>(
    () => toJsonObject(DEFAULTS[docType]),
    [docType],
  );

  const load = useCallback(async () => {
    if (!token || !docType) return;
    setLoading(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const url = `/api/template-config/${encodeURIComponent(
        docType,
      )}${resolvedView ? "?resolved=1" : ""}`;

      const res = await authFetch(
        url,
        { cache: "no-store", signal: controller.signal },
        token,
      );
      const data = (await res.json()) as ApiGetResponse;
      if (!res.ok)
        throw new Error(
          (data as { error?: string })?.error || "No se pudo cargar",
        );

      setExists(Boolean(data.exists));
      setMeta({
        id_template: data.id_template ?? null,
        created_at: data.created_at ?? null,
        updated_at: data.updated_at ?? null,
      });
      setCfg(toJsonObject(data.config ?? {}));
    } catch (e: unknown) {
      if ((e as { name?: string }).name === "AbortError") return;
      console.error(e);
      // Si no existe o error, mostrar defaults como base editable
      setExists(false);
      setCfg(fallback);
      toast.error(
        e instanceof Error ? e.message : "Error cargando configuración",
      );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [docType, token, fallback, resolvedView]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docType, token, resolvedView]);

  const onSave = async () => {
    if (!token) return;
    try {
      setSaving(true);
      const payload: UpsertPayload = { config: cfg, mode };

      const res = await authFetch(
        `/api/template-config/${encodeURIComponent(docType)}`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
        },
        token,
      );
      const body = (await res.json()) as
        | TemplateConfigRecord
        | {
            error?: string;
          };
      if (!res.ok)
        throw new Error(
          (body as { error?: string })?.error || "No se pudo guardar",
        );

      const record = body as TemplateConfigRecord;
      setExists(true);
      setMeta({
        id_template: record.id_template,
        created_at: record.created_at,
        updated_at: record.updated_at,
      });
      setCfg(toJsonObject(record.config));
      toast.success("Configuración guardada ✅");
    } catch (e: unknown) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!token) return;
    if (!confirm("¿Eliminar configuración para este doc_type?")) return;

    try {
      setDeleting(true);
      const res = await authFetch(
        `/api/template-config/${encodeURIComponent(docType)}`,
        { method: "DELETE" },
        token,
      );
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !body?.ok)
        throw new Error(body?.error || "No se pudo eliminar");

      setExists(false);
      setMeta({ id_template: null, created_at: null, updated_at: null });
      setCfg(fallback);
      toast.success("Configuración eliminada ✅");
    } catch (e: unknown) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    } finally {
      setDeleting(false);
    }
  };

  const resetToDefaults = () => setCfg(fallback);

  // ===== Getters de estado actuales =====
  const bg = getAt(cfg, ["styles", "colors", "background"], "#000000");
  const textColor = getAt(cfg, ["styles", "colors", "text"], "#ffffff");
  const accent = getAt(cfg, ["styles", "colors", "accent"], "#ffffff");
  const overlayOpacity = getAt(cfg, ["styles", "colors", "overlayOpacity"], 0);

  const headingFont = getAt(cfg, ["styles", "fonts", "heading"], "Poppins");
  const bodyFont = getAt(cfg, ["styles", "fonts", "body"], "Poppins");

  const coverMode = getAt<"url" | "none">(cfg, ["coverImage", "mode"], "none");
  const coverUrl = getAt(cfg, ["coverImage", "url"], "");

  const contactItems = ensureStringArray(cfg["contactItems"]);

  const labelsObj = ensureMapStringString(cfg["labels"]);
  const metodoMap = ensureMapStringString(cfg["metodosDePago"]);

  const terms = getAt(cfg, ["termsAndConditions"], "") as string;

  // ===== Writers (setters) =====
  const setColor = (key: "background" | "text" | "accent", value: string) =>
    setCfg((prev: JsonObject) =>
      setAt(
        setAt(prev, ["styles"], (prev["styles"] as JsonObject) ?? {}),
        ["styles", "colors", key],
        value,
      ),
    );

  const setOverlay = (v: number) =>
    setCfg((prev: JsonObject) =>
      setAt(prev, ["styles", "colors", "overlayOpacity"], v),
    );

  const setFont = (key: "heading" | "body", value: string) =>
    setCfg((prev: JsonObject) => setAt(prev, ["styles", "fonts", key], value));

  const setCoverMode = (mode: "url" | "none") =>
    setCfg((prev: JsonObject) => setAt(prev, ["coverImage", "mode"], mode));

  const setCoverUrl = (url: string) =>
    setCfg((prev: JsonObject) => setAt(prev, ["coverImage", "url"], url));

  const toggleContact = (key: (typeof contactOptions)[number]) => {
    const set = new Set(contactItems);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    setCfg((prev: JsonObject) =>
      setAt(prev, ["contactItems"], Array.from(set)),
    );
  };

  // Labels helpers
  const ensureLabelsExist = () =>
    setCfg((prev: JsonObject) => setAt(prev, ["labels"], { ...labelsObj }));

  const setLabelValue = (key: string, value: string) => {
    const next = { ...labelsObj, [key]: value };
    setCfg((prev: JsonObject) => setAt(prev, ["labels"], next));
  };

  const renameLabelKey = (oldKey: string, newKey: string) => {
    if (!newKey || newKey === oldKey) return;
    const next = { ...labelsObj };
    const val = next[oldKey];
    delete next[oldKey];
    next[newKey] = val ?? "";
    setCfg((prev: JsonObject) => setAt(prev, ["labels"], next));
  };

  const removeLabelKey = (key: string) => {
    const next = { ...labelsObj };
    delete next[key];
    setCfg((prev: JsonObject) => setAt(prev, ["labels"], next));
  };

  const addLabelRow = () => {
    let i = 1;
    let candidate = `label_${i}`;
    const keys = new Set(Object.keys(labelsObj));
    while (keys.has(candidate)) {
      i += 1;
      candidate = `label_${i}`;
    }
    const next = { ...labelsObj, [candidate]: "" };
    setCfg((prev: JsonObject) => setAt(prev, ["labels"], next));
  };

  // Métodos de pago helpers
  const setMetodoValue = (key: string, value: string) => {
    const next = { ...metodoMap, [key]: value };
    setCfg((prev: JsonObject) => setAt(prev, ["metodosDePago"], next));
  };

  const renameMetodoKey = (oldKey: string, newKey: string) => {
    if (!newKey || newKey === oldKey) return;
    const next = { ...metodoMap };
    const val = next[oldKey];
    delete next[oldKey];
    next[newKey] = val ?? "";
    setCfg((prev: JsonObject) => setAt(prev, ["metodosDePago"], next));
  };

  const removeMetodoKey = (key: string) => {
    const next = { ...metodoMap };
    delete next[key];
    setCfg((prev: JsonObject) => setAt(prev, ["metodosDePago"], next));
  };

  const addMetodoRow = () => {
    let i = 1;
    let candidate = `MON_${i}`;
    const keys = new Set(Object.keys(metodoMap));
    while (keys.has(candidate)) {
      i += 1;
      candidate = `MON_${i}`;
    }
    const next = { ...metodoMap, [candidate]: "" };
    setCfg((prev: JsonObject) => setAt(prev, ["metodosDePago"], next));
  };

  const setTerms = (v: string) =>
    setCfg((prev: JsonObject) => setAt(prev, ["termsAndConditions"], v));

  const disabled = loading || saving || deleting || !docType;

  // ===== UI =====
  return (
    <ProtectedRoute>
      <section className="mx-auto max-w-5xl text-sky-950 dark:text-white">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">
            Template config —{" "}
            <code className="text-base opacity-80">
              {docType || "(sin doc_type)"}
            </code>
          </h1>
          {loading ? null : exists ? (
            <span className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-700 dark:text-emerald-300">
              Existe
            </span>
          ) : (
            <span className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-3 py-1 text-sm text-yellow-700 dark:text-yellow-300">
              Sin configurar
            </span>
          )}
        </div>

        {/* META */}
        {!loading && (
          <div className="mb-3 flex flex-wrap items-center gap-3 text-xs opacity-80">
            <span>ID: {meta.id_template ?? "-"}</span>
            <span>
              Creado:{" "}
              {meta.created_at
                ? new Date(meta.created_at).toLocaleString()
                : "-"}
            </span>
            <span>
              Actualizado:{" "}
              {meta.updated_at
                ? new Date(meta.updated_at).toLocaleString()
                : "-"}
            </span>

            <label className="ml-auto flex items-center gap-2">
              <input
                type="checkbox"
                checked={resolvedView}
                onChange={(e) => setResolvedView(e.target.checked)}
                disabled={loading}
              />
              <span className="text-[11px]">Ver con defaults (resolved=1)</span>
            </label>
          </div>
        )}

        {/* CONTROLES */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <label className="ml-1 text-sm">
            Modo:&nbsp;
            <select
              className={`${inputBase} !w-auto cursor-pointer py-1`}
              value={mode}
              onChange={(e) => setMode(e.target.value as UpsertMode)}
              disabled={disabled}
            >
              <option value="replace">replace (reemplaza todo)</option>
              <option value="merge">merge (mezcla superficial)</option>
            </select>
          </label>

          <button
            onClick={onSave}
            disabled={disabled}
            className="rounded-full bg-sky-100 px-5 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 disabled:opacity-60 dark:bg-white/10 dark:text-white"
          >
            {saving ? <Spinner /> : "Guardar"}
          </button>

          <button
            onClick={onDelete}
            disabled={disabled || !exists}
            className="rounded-full bg-red-600 px-5 py-2 text-red-100 shadow-sm shadow-red-950/20 transition-transform hover:scale-95 active:scale-90 disabled:opacity-60 dark:bg-red-800"
            title="Eliminar configuración"
          >
            {deleting ? <Spinner /> : "Eliminar"}
          </button>

          <div className="mx-2 h-6 w-px bg-sky-950/10 dark:bg-white/10" />

          <button
            onClick={resetToDefaults}
            disabled={disabled}
            className="rounded-full bg-white/50 px-4 py-2 text-sm shadow-sm transition-transform hover:scale-95 active:scale-90 dark:bg-white/10"
            title="Usar valores sugeridos"
          >
            Sugeridos
          </button>

          {loading && (
            <div className="ml-auto">
              <Spinner />
            </div>
          )}
        </div>

        {/* SECCIÓN: Estilos */}
        <section className="mb-6 rounded-2xl border border-sky-950/10 bg-white/50 p-4 dark:border-white/10 dark:bg-white/10">
          <h2 className="mb-3 text-lg font-semibold">Estilos</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block text-sm">
              Color de fondo
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={typeof bg === "string" ? bg : "#000000"}
                  onChange={(e) => setColor("background", e.target.value)}
                  disabled={disabled}
                  className="h-10 w-16 cursor-pointer rounded-md border border-sky-950/10 dark:border-white/10"
                />
                <input
                  className={inputBase}
                  value={typeof bg === "string" ? bg : ""}
                  onChange={(e) => setColor("background", e.target.value)}
                  disabled={disabled}
                  placeholder="#000000"
                />
              </div>
            </label>

            <label className="block text-sm">
              Color de texto
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={typeof textColor === "string" ? textColor : "#ffffff"}
                  onChange={(e) => setColor("text", e.target.value)}
                  disabled={disabled}
                  className="h-10 w-16 cursor-pointer rounded-md border border-sky-950/10 dark:border-white/10"
                />
                <input
                  className={inputBase}
                  value={typeof textColor === "string" ? textColor : ""}
                  onChange={(e) => setColor("text", e.target.value)}
                  disabled={disabled}
                  placeholder="#ffffff"
                />
              </div>
            </label>

            <label className="block text-sm">
              Color acento
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={typeof accent === "string" ? accent : "#ffffff"}
                  onChange={(e) => setColor("accent", e.target.value)}
                  disabled={disabled}
                  className="h-10 w-16 cursor-pointer rounded-md border border-sky-950/10 dark:border-white/10"
                />
                <input
                  className={inputBase}
                  value={typeof accent === "string" ? accent : ""}
                  onChange={(e) => setColor("accent", e.target.value)}
                  disabled={disabled}
                  placeholder="#22c55e"
                />
              </div>
            </label>

            <label className="block text-sm">
              Opacidad de overlay (0 a 1)
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={
                    typeof overlayOpacity === "number" ? overlayOpacity : 0
                  }
                  onChange={(e) => setOverlay(parseFloat(e.target.value))}
                  disabled={disabled}
                  className="w-full"
                />
                <span className="min-w-[40px] text-right">
                  {typeof overlayOpacity === "number"
                    ? overlayOpacity.toFixed(2)
                    : "0.00"}
                </span>
              </div>
            </label>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block text-sm">
              Tipografía de títulos
              <input
                className={`${inputBase} mt-1`}
                value={typeof headingFont === "string" ? headingFont : ""}
                onChange={(e) => setFont("heading", e.target.value)}
                disabled={disabled}
                placeholder="Poppins"
              />
            </label>

            <label className="block text-sm">
              Tipografía de cuerpo
              <input
                className={`${inputBase} mt-1`}
                value={typeof bodyFont === "string" ? bodyFont : ""}
                onChange={(e) => setFont("body", e.target.value)}
                disabled={disabled}
                placeholder="Poppins"
              />
            </label>
          </div>
        </section>

        {/* SECCIÓN: Portada */}
        <section className="mb-6 rounded-2xl border border-sky-950/10 bg-white/50 p-4 dark:border-white/10 dark:bg-white/10">
          <h2 className="mb-3 text-lg font-semibold">Imagen de portada</h2>

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={coverMode === "none"}
                onChange={() => setCoverMode("none")}
                disabled={disabled}
              />
              Sin portada
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={coverMode === "url"}
                onChange={() => setCoverMode("url")}
                disabled={disabled}
              />
              Usar URL
            </label>
          </div>

          {coverMode === "url" && (
            <div className="mt-3">
              <input
                className={inputBase}
                placeholder="https://… /images/portada.jpg"
                value={typeof coverUrl === "string" ? coverUrl : ""}
                onChange={(e) => setCoverUrl(e.target.value)}
                disabled={disabled}
              />
              {typeof coverUrl === "string" && coverUrl ? (
                <div className="mt-3 overflow-hidden rounded-xl border border-sky-950/10 dark:border-white/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={coverUrl}
                    alt="Vista previa portada"
                    className="max-h-48 w-full object-cover"
                  />
                </div>
              ) : null}
            </div>
          )}
        </section>

        {/* SECCIÓN: Contacto */}
        <section className="mb-6 rounded-2xl border border-sky-950/10 bg-white/50 p-4 dark:border-white/10 dark:bg-white/10">
          <h2 className="mb-3 text-lg font-semibold">Contacto a mostrar</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {contactOptions.map((opt) => (
              <label key={opt} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={contactItems.includes(opt)}
                  onChange={() => toggleContact(opt)}
                  disabled={disabled}
                />
                {opt}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs opacity-70">
            * Si marcás <b>phones</b>, el usuario podrá elegir cuál teléfono en
            el formulario.
          </p>
        </section>

        {/* SECCIÓN: Labels */}
        <section className="mb-6 rounded-2xl border border-sky-950/10 bg-white/50 p-4 dark:border-white/10 dark:bg-white/10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Etiquetas / títulos</h2>
            <button
              onClick={ensureLabelsExist}
              disabled={disabled}
              className="rounded-full bg-white/50 px-4 py-1 text-sm shadow-sm dark:bg-white/10"
              title="Crear sección labels si no existe"
            >
              Asegurar sección
            </button>
          </div>

          {/* Sugeridas por doc_type */}
          <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {(docType === "confirmation"
              ? confirmationLabelKeys
              : docType === "quote"
                ? quoteLabelKeys
                : []
            ).map((k) => (
              <label key={k} className="block text-sm">
                {k}
                <input
                  className={`${inputBase} mt-1`}
                  value={labelsObj[k] ?? ""}
                  onChange={(e) => setLabelValue(k, e.target.value)}
                  disabled={disabled}
                  placeholder={k}
                />
              </label>
            ))}
          </div>

          {/* Dinámicas / extras */}
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-medium">Otras etiquetas</h3>
              <button
                onClick={addLabelRow}
                disabled={disabled}
                className="rounded-full bg-sky-100 px-4 py-1 text-sm text-sky-950 shadow-sm dark:bg-white/10 dark:text-white"
              >
                + Agregar etiqueta
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {Object.entries(labelsObj)
                .filter(
                  ([k]) =>
                    !(
                      (docType === "confirmation" &&
                        confirmationLabelKeys.includes(
                          k as (typeof confirmationLabelKeys)[number],
                        )) ||
                      (docType === "quote" &&
                        quoteLabelKeys.includes(
                          k as (typeof quoteLabelKeys)[number],
                        ))
                    ),
                )
                .map(([k, v]) => (
                  <div
                    key={k}
                    className="grid grid-cols-[1fr_1fr_auto] items-center gap-2"
                  >
                    <input
                      className={inputBase}
                      value={k}
                      onChange={(e) => renameLabelKey(k, e.target.value)}
                      disabled={disabled}
                      placeholder="clave"
                    />
                    <input
                      className={inputBase}
                      value={v}
                      onChange={(e) => setLabelValue(k, e.target.value)}
                      disabled={disabled}
                      placeholder="valor"
                    />
                    <button
                      onClick={() => removeLabelKey(k)}
                      disabled={disabled}
                      className="rounded-full bg-red-600 px-3 py-1 text-sm text-red-100 shadow-sm dark:bg-red-800"
                      title="Quitar"
                    >
                      Quitar
                    </button>
                  </div>
                ))}
            </div>
          </div>
        </section>

        {/* SECCIÓN: Términos */}
        <section className="mb-6 rounded-2xl border border-sky-950/10 bg-white/50 p-4 dark:border-white/10 dark:bg-white/10">
          <h2 className="mb-3 text-lg font-semibold">Términos y condiciones</h2>
          <textarea
            className={`${inputBase} h-40 font-sans`}
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            placeholder="Texto de condiciones por defecto…"
            disabled={disabled}
          />
        </section>

        {/* SECCIÓN: Métodos de pago */}
        <section className="mb-10 rounded-2xl border border-sky-950/10 bg-white/50 p-4 dark:border-white/10 dark:bg-white/10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Métodos de pago</h2>
            <button
              onClick={addMetodoRow}
              disabled={disabled}
              className="rounded-full bg-sky-100 px-4 py-1 text-sm text-sky-950 shadow-sm dark:bg-white/10 dark:text-white"
            >
              + Agregar moneda
            </button>
          </div>

          {/* Sugeridos ARS / USD al tope si existen */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {["ARS", "USD"].map((code) => (
              <label key={code} className="block text-sm">
                {code}
                <input
                  className={`${inputBase} mt-1`}
                  value={metodoMap[code] ?? ""}
                  onChange={(e) => setMetodoValue(code, e.target.value)}
                  disabled={disabled}
                  placeholder={`Instrucciones ${code}`}
                />
              </label>
            ))}
          </div>

          {/* Otras monedas dinámicas */}
          <div className="mt-4 grid grid-cols-1 gap-3">
            {Object.entries(metodoMap)
              .filter(([k]) => k !== "ARS" && k !== "USD")
              .map(([k, v]) => (
                <div
                  key={k}
                  className="grid grid-cols-[120px_1fr_auto] items-center gap-2"
                >
                  <input
                    className={inputBase}
                    value={k}
                    onChange={(e) => renameMetodoKey(k, e.target.value)}
                    disabled={disabled}
                    placeholder="Código"
                  />
                  <input
                    className={inputBase}
                    value={v}
                    onChange={(e) => setMetodoValue(k, e.target.value)}
                    disabled={disabled}
                    placeholder="Instrucciones"
                  />
                  <button
                    onClick={() => removeMetodoKey(k)}
                    disabled={disabled}
                    className="rounded-full bg-red-600 px-3 py-1 text-sm text-red-100 shadow-sm dark:bg-red-800"
                    title="Quitar"
                  >
                    Quitar
                  </button>
                </div>
              ))}
          </div>
        </section>

        {/* Vista JSON opcional para debugging */}
        <details className="mb-8 rounded-2xl border border-sky-950/10 bg-white/30 p-4 text-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
          <summary className="cursor-pointer select-none font-medium">
            Ver JSON actual (opcional)
          </summary>
          <pre className="mt-3 overflow-auto rounded-xl bg-black/80 p-3 text-white">
            {JSON.stringify(cfg, null, 2)}
          </pre>
        </details>

        <ToastContainer />
      </section>
    </ProtectedRoute>
  );
}
