// src/app/clients/config/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import type { ClientConfig, ClientCustomField } from "@/types";
import {
  BUILTIN_CUSTOM_FIELDS,
  CUSTOM_FIELD_TYPES,
  DEFAULT_REQUIRED_FIELDS,
  REQUIRED_FIELD_OPTIONS,
  buildCustomFieldKey,
  normalizeCustomFields,
  normalizeRequiredFields,
} from "@/utils/clientConfig";

/* ================= Estilos compartidos ================= */
const GLASS =
  "rounded-3xl border border-white/30 bg-white/10 backdrop-blur shadow-lg shadow-sky-900/10 dark:bg-white/10 dark:border-white/5";
const PRIMARY_BTN =
  "rounded-2xl bg-sky-600/30 px-4 py-2 text-sm font-medium text-sky-950 shadow-sm shadow-sky-900/10 transition hover:bg-sky-600/40 active:scale-[.99] disabled:opacity-50 dark:text-white";

type VisibilityMode = "all" | "team" | "own";

type ApiError = { error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function normalizeClientConfig(v: unknown): ClientConfig | null {
  if (!isRecord(v)) return null;
  const id_agency = typeof v.id_agency === "number" ? v.id_agency : 0;
  const visibility_mode =
    v.visibility_mode === "all" ||
    v.visibility_mode === "team" ||
    v.visibility_mode === "own"
      ? v.visibility_mode
      : "all";
  const required_fields = normalizeRequiredFields(v.required_fields);
  const custom_fields = normalizeCustomFields(v.custom_fields);
  return { id_agency, visibility_mode, required_fields, custom_fields };
}

function apiErrorMessage(v: unknown): string | null {
  return isRecord(v) && typeof (v as ApiError).error === "string"
    ? (v as ApiError).error
    : null;
}

function sortStringList(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function normalizeCustomList(values: ClientCustomField[]): ClientCustomField[] {
  return [...values].sort((a, b) => a.key.localeCompare(b.key));
}

function customFieldsEqual(a: ClientCustomField[], b: ClientCustomField[]) {
  return (
    JSON.stringify(normalizeCustomList(a)) ===
    JSON.stringify(normalizeCustomList(b))
  );
}

function applyBuiltinMeta(fields: ClientCustomField[]) {
  const builtinMap = new Map(BUILTIN_CUSTOM_FIELDS.map((f) => [f.key, f]));
  return fields.map((field) => {
    const builtin = builtinMap.get(field.key);
    if (!builtin) return field;
    return {
      ...builtin,
      required:
        typeof field.required === "boolean"
          ? field.required
          : builtin.required,
    };
  });
}

const OPTIONS: { key: VisibilityMode; label: string; desc: string }[] = [
  {
    key: "all",
    label: "Todos",
    desc: "Todos pueden ver pasajeros y estadísticas de toda la agencia.",
  },
  {
    key: "team",
    label: "Por equipo",
    desc: "Cada usuario ve los pasajeros de su equipo. Si no pertenece a un equipo, solo ve los suyos.",
  },
  {
    key: "own",
    label: "Solo propios",
    desc: "Cada usuario ve solo sus pasajeros.",
  },
];

export default function ClientsConfigPage() {
  const { token } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  const [mode, setMode] = useState<VisibilityMode>("all");
  const [initialMode, setInitialMode] = useState<VisibilityMode>("all");
  const [requiredFields, setRequiredFields] = useState<string[]>(
    DEFAULT_REQUIRED_FIELDS,
  );
  const [initialRequiredFields, setInitialRequiredFields] = useState<string[]>(
    DEFAULT_REQUIRED_FIELDS,
  );
  const [customFields, setCustomFields] = useState<ClientCustomField[]>([]);
  const [initialCustomFields, setInitialCustomFields] = useState<
    ClientCustomField[]
  >([]);
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] =
    useState<ClientCustomField["type"]>("text");
  const [newFieldRequired, setNewFieldRequired] = useState(false);

  const canEdit = useMemo(
    () =>
      ["gerente", "administrativo", "desarrollador"].includes(
        (role || "").toLowerCase(),
      ),
    [role],
  );

  const requiredDirty =
    JSON.stringify(sortStringList(requiredFields)) !==
    JSON.stringify(sortStringList(initialRequiredFields));
  const customDirty = !customFieldsEqual(customFields, initialCustomFields);
  const dirty = mode !== initialMode || requiredDirty || customDirty;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    setLoading(true);

    (async () => {
      try {
        const [roleRes, cfgRes] = await Promise.all([
          authFetch("/api/user/profile", { cache: "no-store" }, token),
          authFetch("/api/clients/config", { cache: "no-store" }, token),
        ]);

        if (roleRes.ok) {
          const roleJson = (await roleRes.json().catch(() => ({}))) as {
            role?: string;
          };
          if (alive)
            setRole(roleJson.role ? String(roleJson.role).toLowerCase() : null);
        }

        if (cfgRes.ok) {
          const cfgJson = (await cfgRes.json().catch(() => null)) as unknown;
          const cfg = normalizeClientConfig(cfgJson);
          const nextMode = cfg?.visibility_mode || "all";
          if (alive) {
            setMode(nextMode);
            setInitialMode(nextMode);
            const nextRequired =
              cfg?.required_fields && cfg.required_fields.length > 0
                ? cfg.required_fields
                : DEFAULT_REQUIRED_FIELDS;
            const nextCustom = applyBuiltinMeta(cfg?.custom_fields || []);
            setRequiredFields(nextRequired);
            setInitialRequiredFields(nextRequired);
            setCustomFields(nextCustom);
            setInitialCustomFields(nextCustom);
          }
        } else if (alive) {
          setMode("all");
          setInitialMode("all");
          setRequiredFields(DEFAULT_REQUIRED_FIELDS);
          setInitialRequiredFields(DEFAULT_REQUIRED_FIELDS);
          setCustomFields([]);
          setInitialCustomFields([]);
        }
      } catch (e) {
        console.error("[clients/config] load error", e);
        toast.error("No se pudo cargar la configuración de pasajeros.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [token]);

  const saveConfig = async () => {
    if (!token || !dirty) return;
    setSaving(true);
    try {
      const normalizedRequired = normalizeRequiredFields(requiredFields);
      const normalizedCustom = normalizeCustomFields(
        applyBuiltinMeta(customFields),
      );
      const res = await authFetch(
        "/api/clients/config",
        {
          method: "PUT",
          body: JSON.stringify({
            visibility_mode: mode,
            required_fields: normalizedRequired,
            custom_fields: normalizedCustom,
          }),
        },
        token,
      );
      const body = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        throw new Error(apiErrorMessage(body) || "No se pudo guardar.");
      }
      setInitialMode(mode);
      setRequiredFields(normalizedRequired);
      setInitialRequiredFields(normalizedRequired);
      setCustomFields(normalizedCustom);
      setInitialCustomFields(normalizedCustom);
      toast.success("Configuración guardada.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo guardar.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const toggleRequiredField = (key: string, locked?: boolean) => {
    if (!canEdit || saving || locked) return;
    setRequiredFields((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const isBuiltinActive = (key: string) =>
    customFields.some((field) => field.key === key);

  const toggleBuiltinField = (field: ClientCustomField) => {
    if (!canEdit || saving) return;
    setCustomFields((prev) => {
      const exists = prev.some((f) => f.key === field.key);
      if (exists) return prev.filter((f) => f.key !== field.key);
      return [...prev, field];
    });
  };

  const updateCustomField = (
    key: string,
    patch: Partial<ClientCustomField>,
  ) => {
    if (!canEdit || saving) return;
    setCustomFields((prev) =>
      prev.map((field) =>
        field.key === key ? { ...field, ...patch } : field,
      ),
    );
  };

  const removeCustomField = (key: string) => {
    if (!canEdit || saving) return;
    setCustomFields((prev) => prev.filter((field) => field.key !== key));
  };

  const addCustomField = () => {
    if (!canEdit || saving) return;
    const label = newFieldLabel.trim();
    if (!label) {
      toast.error("Ingresá un nombre para el campo.");
      return;
    }
    const existingKeys = new Set(customFields.map((f) => f.key));
    const key = buildCustomFieldKey(label, existingKeys);
    const next: ClientCustomField = {
      key,
      label,
      type: newFieldType,
      required: newFieldRequired,
    };
    if (newFieldType === "date") next.placeholder = "dd/mm/aaaa";
    setCustomFields((prev) => [...prev, next]);
    setNewFieldLabel("");
    setNewFieldType("text");
    setNewFieldRequired(false);
  };

  if (!mounted) return null;

  return (
    <ProtectedRoute>
      <section className="mx-auto px-4 py-6 text-sky-950 dark:text-white">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">
              Configuración de Pasajeros
            </h1>
            <p className="mt-1 text-sm text-sky-950/70 dark:text-white/70">
              Definí el alcance de visibilidad para vendedores.
            </p>
          </div>
          {!canEdit && (
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs">
              Solo lectura
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <div className="space-y-6">
            <div className={`${GLASS} p-6`}>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-medium">Visibilidad</h2>
                  <p className="text-sm text-sky-950/70 dark:text-white/70">
                    Aplica a vendedores. Líderes ven su equipo. Y gerentes ven
                    todo.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={saveConfig}
                  disabled={!dirty || !canEdit || saving}
                  className={PRIMARY_BTN}
                >
                  Guardar
                </button>
              </div>

              <div className="grid gap-3">
                {OPTIONS.map((opt) => {
                  const active = mode === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setMode(opt.key)}
                      disabled={!canEdit || saving}
                      className={`flex w-full items-start gap-3 rounded-3xl border border-white/20 bg-white/10 p-4 text-left backdrop-blur transition ${
                        active ? "ring-1 ring-sky-400/60" : "hover:bg-white/20"
                      } ${!canEdit ? "cursor-not-allowed opacity-60" : ""}`}
                    >
                      <span
                        className={`mt-1 inline-block size-4 rounded-full border ${
                          active
                            ? "border-sky-500 bg-sky-400/70"
                            : "border-white/40 bg-transparent"
                        }`}
                        aria-hidden="true"
                      />
                      <span>
                        <span className="block text-sm font-semibold">
                          {opt.label}
                        </span>
                        <span className="block text-sm opacity-70">
                          {opt.desc}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4">
                <p className="text-xs text-sky-950/70 dark:text-white/70">
                  Cambios en visibilidad impactan el listado, búsquedas y
                  estadísticas.
                </p>
              </div>
            </div>

            <div className={`${GLASS} p-6`}>
              <div className="mb-4">
                <h2 className="text-lg font-medium">Campos obligatorios</h2>
                <p className="text-sm text-sky-950/70 dark:text-white/70">
                  Definí qué datos deben completarse al crear o editar un pax.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {REQUIRED_FIELD_OPTIONS.map((opt) => {
                  const checked = requiredFields.includes(opt.key);
                  const locked = opt.locked;
                  return (
                    <label
                      key={opt.key}
                      className={`flex items-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-sm backdrop-blur ${
                        !canEdit ? "cursor-not-allowed opacity-60" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!canEdit || saving || locked}
                        onChange={() => toggleRequiredField(opt.key, locked)}
                        className="size-4 accent-sky-600"
                      />
                      <span className="flex-1">{opt.label}</span>
                      {locked ? (
                        <span className="text-xs text-sky-950/60 dark:text-white/60">
                          Siempre requerido
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className={`${GLASS} p-6`}>
              <div className="mb-4">
                <h2 className="text-lg font-medium">Campos personalizados</h2>
                <p className="text-sm text-sky-950/70 dark:text-white/70">
                  Activá campos prearmados o sumá nuevos para tu agencia.
                </p>
              </div>

              <div className="mb-5 grid gap-3 sm:grid-cols-2">
                {BUILTIN_CUSTOM_FIELDS.map((field) => {
                  const active = isBuiltinActive(field.key);
                  return (
                    <label
                      key={field.key}
                      className={`flex items-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-sm backdrop-blur ${
                        !canEdit ? "cursor-not-allowed opacity-60" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        disabled={!canEdit || saving}
                        onChange={() => toggleBuiltinField(field)}
                        className="size-4 accent-sky-600"
                      />
                      <span className="flex-1">{field.label}</span>
                      {active ? (
                        <span className="text-xs text-sky-950/60 dark:text-white/60">
                          Activo
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-white/20 bg-white/10 p-4">
                <div className="mb-3 text-sm font-medium">
                  Agregar nuevo campo
                </div>
                <div className="grid gap-3 md:grid-cols-[1.6fr_1fr_0.7fr_auto]">
                  <input
                    type="text"
                    value={newFieldLabel}
                    onChange={(e) => setNewFieldLabel(e.target.value)}
                    placeholder="Ej: Vencimiento Visa"
                    className="w-full rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-sm outline-none"
                    disabled={!canEdit || saving}
                  />
                  <select
                    value={newFieldType}
                    onChange={(e) =>
                      setNewFieldType(e.target.value as ClientCustomField["type"])
                    }
                    className="w-full rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-sm outline-none"
                    disabled={!canEdit || saving}
                  >
                    {CUSTOM_FIELD_TYPES.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={newFieldRequired}
                      onChange={(e) => setNewFieldRequired(e.target.checked)}
                      disabled={!canEdit || saving}
                      className="size-4 accent-sky-600"
                    />
                    Requerido
                  </label>
                  <button
                    type="button"
                    onClick={addCustomField}
                    disabled={!canEdit || saving}
                    className={PRIMARY_BTN}
                  >
                    Agregar
                  </button>
                </div>
              </div>

              {customFields.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {customFields.map((field) => {
                    const isBuiltin = Boolean(field.builtin);
                    return (
                      <div
                        key={field.key}
                        className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-sm"
                      >
                        <input
                          type="text"
                          value={field.label}
                          onChange={(e) =>
                            updateCustomField(field.key, {
                              label: e.target.value,
                            })
                          }
                          disabled={!canEdit || saving || isBuiltin}
                          className="min-w-[160px] flex-1 rounded-xl border border-white/20 bg-white/10 px-2 py-1 text-sm outline-none"
                        />
                        <select
                          value={field.type}
                          onChange={(e) =>
                            updateCustomField(field.key, {
                              type: e.target.value as ClientCustomField["type"],
                              placeholder:
                                e.target.value === "date"
                                  ? "dd/mm/aaaa"
                                  : undefined,
                            })
                          }
                          disabled={!canEdit || saving || isBuiltin}
                          className="rounded-xl border border-white/20 bg-white/10 px-2 py-1 text-sm outline-none"
                        >
                          {CUSTOM_FIELD_TYPES.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={Boolean(field.required)}
                            onChange={(e) =>
                              updateCustomField(field.key, {
                                required: e.target.checked,
                              })
                            }
                            disabled={!canEdit || saving}
                            className="size-4 accent-sky-600"
                          />
                          Requerido
                        </label>
                        <span className="text-xs text-sky-950/60 dark:text-white/60">
                          {field.key}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeCustomField(field.key)}
                          disabled={!canEdit || saving}
                          className="rounded-full border border-white/20 px-3 py-1 text-xs hover:bg-white/10 disabled:opacity-50"
                        >
                          Quitar
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-4 text-sm text-sky-950/60 dark:text-white/60">
                  No hay campos personalizados activos.
                </p>
              )}
            </div>
          </div>
        )}
      </section>
      <ToastContainer position="bottom-right" autoClose={2200} />
    </ProtectedRoute>
  );
}
