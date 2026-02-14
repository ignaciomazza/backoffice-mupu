"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { requestGroupApi } from "@/lib/groups/clientApi";

type GroupConfigResponse = {
  required_fields_agencia: string[];
  required_fields_estudiantil: string[];
  required_fields_precomprado: string[];
  capacity_options: string[];
  default_capacity_mode: "TOTAL" | "SERVICIO";
  default_allow_overbooking: boolean;
  default_waitlist_enabled: boolean;
  exists: boolean;
};

type TemplateInstallment = {
  label: string | null;
  due_in_days: number;
  amount: number;
  currency: string;
};

type TemplateItem = {
  id_travel_group_payment_template: number;
  agency_travel_group_payment_template_id: number | null;
  name: string;
  description: string | null;
  target_type: "AGENCIA" | "ESTUDIANTIL" | "PRECOMPRADO" | null;
  payment_mode: string | null;
  is_active: boolean;
  is_preloaded: boolean;
  assigned_user_ids: number[];
  installments: TemplateInstallment[];
  created_at: string;
  updated_at: string;
};

type InstallmentDraft = {
  label: string;
  due_in_days: string;
  amount: string;
  currency: string;
};

type FinanceCurrencyOption = {
  code: string;
  name?: string | null;
  enabled?: boolean;
};

const CAPACITY_KEYS = ["TOTAL", "SERVICIO", "OVERBOOKING", "WAITLIST"] as const;
const CAPACITY_LABELS: Record<(typeof CAPACITY_KEYS)[number], string> = {
  TOTAL: "Cupo total",
  SERVICIO: "Por servicio",
  OVERBOOKING: "Sobreventa",
  WAITLIST: "Lista de espera",
};
const TARGET_OPTIONS = [
  { value: "ALL", label: "Todos" },
  { value: "AGENCIA", label: "Agencia" },
  { value: "ESTUDIANTIL", label: "Estudiantil" },
  { value: "PRECOMPRADO", label: "Precomprado" },
] as const;

const TARGET_LABELS: Record<Exclude<(typeof TARGET_OPTIONS)[number]["value"], "ALL">, string> = {
  AGENCIA: "Agencia",
  ESTUDIANTIL: "Estudiantil",
  PRECOMPRADO: "Precomprado",
};

function linesToArray(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/\n/g)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function idsToArray(raw: string): number[] {
  return Array.from(
    new Set(
      raw
        .split(/[\n,;\s]+/g)
        .map((item) => Number(item.trim()))
        .filter((n) => Number.isFinite(n) && n > 0)
        .map((n) => Math.trunc(n)),
    ),
  );
}

function formatType(value: TemplateItem["target_type"]) {
  if (!value) return "Todos";
  return TARGET_LABELS[value] ?? value;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleDateString("es-AR");
}

function Spinner({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="size-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
      {label}
    </span>
  );
}

export default function GroupConfigPage() {
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [requiredAgenciaRaw, setRequiredAgenciaRaw] = useState("");
  const [requiredEstudiantilRaw, setRequiredEstudiantilRaw] = useState("");
  const [requiredPrecompradoRaw, setRequiredPrecompradoRaw] = useState("");
  const [capacityOptions, setCapacityOptions] = useState<Record<string, boolean>>({
    TOTAL: true,
    SERVICIO: true,
    OVERBOOKING: true,
    WAITLIST: true,
  });
  const [defaultCapacityMode, setDefaultCapacityMode] = useState<"TOTAL" | "SERVICIO">(
    "TOTAL",
  );
  const [defaultAllowOverbooking, setDefaultAllowOverbooking] = useState(false);
  const [defaultWaitlistEnabled, setDefaultWaitlistEnabled] = useState(false);

  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateTarget, setTemplateTarget] = useState<
    "ALL" | "AGENCIA" | "ESTUDIANTIL" | "PRECOMPRADO"
  >("ALL");
  const [templatePaymentMode, setTemplatePaymentMode] = useState("");
  const [templateAssignedUsersRaw, setTemplateAssignedUsersRaw] = useState("");
  const [templateInstallments, setTemplateInstallments] = useState<InstallmentDraft[]>([
    { label: "Anticipo", due_in_days: "0", amount: "", currency: "ARS" },
  ]);
  const [financeCurrencies, setFinanceCurrencies] = useState<FinanceCurrencyOption[]>([]);
  const [templateViewMode, setTemplateViewMode] = useState<"LIST" | "GRID">("LIST");
  const [showTemplateAdvanced, setShowTemplateAdvanced] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [configData, templatesData, currenciesData] = await Promise.all([
        requestGroupApi<GroupConfigResponse>(
          "/api/groups/config",
          {
            credentials: "include",
            cache: "no-store",
          },
          "No pudimos cargar la configuración de grupales.",
        ),
        requestGroupApi<{ items?: TemplateItem[] }>(
          "/api/groups/config/payment-templates?only_active=false",
          {
            credentials: "include",
            cache: "no-store",
          },
          "No pudimos cargar las plantillas de pago.",
        ),
        requestGroupApi<FinanceCurrencyOption[]>(
          "/api/finance/currencies",
          {
            credentials: "include",
            cache: "no-store",
          },
          "No pudimos cargar las monedas financieras.",
        ).catch(() => []),
      ]);

      setRequiredAgenciaRaw((configData.required_fields_agencia || []).join("\n"));
      setRequiredEstudiantilRaw(
        (configData.required_fields_estudiantil || []).join("\n"),
      );
      setRequiredPrecompradoRaw(
        (configData.required_fields_precomprado || []).join("\n"),
      );
      setCapacityOptions({
        TOTAL: (configData.capacity_options || []).includes("TOTAL"),
        SERVICIO: (configData.capacity_options || []).includes("SERVICIO"),
        OVERBOOKING: (configData.capacity_options || []).includes("OVERBOOKING"),
        WAITLIST: (configData.capacity_options || []).includes("WAITLIST"),
      });
      setDefaultCapacityMode(configData.default_capacity_mode || "TOTAL");
      setDefaultAllowOverbooking(Boolean(configData.default_allow_overbooking));
      setDefaultWaitlistEnabled(Boolean(configData.default_waitlist_enabled));

      setTemplates(Array.isArray(templatesData.items) ? templatesData.items : []);
      setFinanceCurrencies(
        Array.isArray(currenciesData)
          ? currenciesData.filter(
              (item) =>
                item &&
                typeof item.code === "string" &&
                item.code.trim().length > 0 &&
                item.enabled !== false,
            )
          : [],
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No pudimos cargar la configuración de grupales.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const sortedTemplates = useMemo(
    () =>
      [...templates].sort((a, b) => {
        if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    [templates],
  );

  const templateCurrencyOptions = useMemo(() => {
    const configCodes = financeCurrencies
      .map((item) => String(item.code || "").trim().toUpperCase())
      .filter(Boolean);
    const rowCodes = templateInstallments
      .map((item) => String(item.currency || "").trim().toUpperCase())
      .filter(Boolean);
    return Array.from(new Set([...configCodes, ...rowCodes, "ARS"]));
  }, [financeCurrencies, templateInstallments]);

  async function handleSaveConfig(e: FormEvent) {
    e.preventDefault();
    setSavingConfig(true);
    setError(null);
    setMessage(null);

    try {
      const enabledCapacityOptions = CAPACITY_KEYS.filter((key) => capacityOptions[key]);
      if (enabledCapacityOptions.length === 0) {
        const msg = "Debés habilitar al menos una opción de cupo.";
        setError(msg);
        toast.error(msg);
        return;
      }
      if (!enabledCapacityOptions.includes(defaultCapacityMode)) {
        const msg = "El modo de cupo por defecto debe estar habilitado.";
        setError(msg);
        toast.error(msg);
        return;
      }

      await requestGroupApi("/api/groups/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          required_fields_agencia: linesToArray(requiredAgenciaRaw),
          required_fields_estudiantil: linesToArray(requiredEstudiantilRaw),
          required_fields_precomprado: linesToArray(requiredPrecompradoRaw),
          capacity_options: enabledCapacityOptions,
          default_capacity_mode: defaultCapacityMode,
          default_allow_overbooking: defaultAllowOverbooking,
          default_waitlist_enabled: defaultWaitlistEnabled,
        }),
      }, "No pudimos guardar la configuración.");

      setMessage("Configuración de grupales guardada.");
      toast.success("Configuración de grupales guardada.");
      await loadData();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No pudimos guardar la configuración.";
      setError(message);
      toast.error(message);
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleCreateTemplate(e: FormEvent) {
    e.preventDefault();
    if (!templateName.trim()) {
      const msg = "El nombre de la plantilla es obligatorio.";
      setError(msg);
      toast.error(msg);
      return;
    }

    const normalizedInstallments = templateInstallments
      .map((item) => ({
        label: item.label.trim() || null,
        due_in_days: Number(item.due_in_days),
        amount: Number(item.amount.replace(",", ".")),
        currency: item.currency.trim().toUpperCase(),
      }))
      .filter(
        (item) =>
          Number.isFinite(item.due_in_days) &&
          item.due_in_days >= 0 &&
          Number.isFinite(item.amount) &&
          item.amount > 0 &&
          item.currency,
      );

    if (normalizedInstallments.length === 0) {
      const msg = "Completá al menos una cuota válida para la plantilla.";
      setError(msg);
      toast.error(msg);
      return;
    }

    setSavingTemplate(true);
    setError(null);
    setMessage(null);

    try {
      await requestGroupApi("/api/groups/config/payment-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: templateName.trim(),
          description: templateDescription.trim() || null,
          target_type: templateTarget === "ALL" ? null : templateTarget,
          payment_mode: templatePaymentMode.trim() || null,
          assigned_user_ids: idsToArray(templateAssignedUsersRaw),
          installments: normalizedInstallments,
          is_active: true,
        }),
      }, "No pudimos crear la plantilla.");

      setTemplateName("");
      setTemplateDescription("");
      setTemplateTarget("ALL");
      setTemplatePaymentMode("");
      setTemplateAssignedUsersRaw("");
      setTemplateInstallments([
        { label: "Anticipo", due_in_days: "0", amount: "", currency: "ARS" },
      ]);

      setMessage("Plantilla creada.");
      toast.success("Plantilla creada.");
      await loadData();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No pudimos crear la plantilla.";
      setError(message);
      toast.error(message);
    } finally {
      setSavingTemplate(false);
    }
  }

  async function handleToggleTemplate(item: TemplateItem) {
    setSavingTemplate(true);
    setError(null);
    setMessage(null);
    try {
      await requestGroupApi(
        `/api/groups/config/payment-templates/${item.id_travel_group_payment_template}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ is_active: !item.is_active }),
        },
        "No pudimos actualizar la plantilla.",
      );
      setMessage("Plantilla actualizada.");
      toast.success("Plantilla actualizada.");
      await loadData();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No pudimos actualizar la plantilla.";
      setError(message);
      toast.error(message);
    } finally {
      setSavingTemplate(false);
    }
  }

  async function handleDeleteTemplate(item: TemplateItem) {
    setSavingTemplate(true);
    setError(null);
    setMessage(null);
    try {
      await requestGroupApi(
        `/api/groups/config/payment-templates/${item.id_travel_group_payment_template}`,
        {
          method: "DELETE",
          credentials: "include",
        },
        "No pudimos eliminar la plantilla.",
      );
      setMessage("Plantilla eliminada.");
      toast.success("Plantilla eliminada.");
      await loadData();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No pudimos eliminar la plantilla.";
      setError(message);
      toast.error(message);
    } finally {
      setSavingTemplate(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-100 via-white to-slate-100 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-3xl border border-sky-300/60 bg-white/65 p-6 shadow-lg shadow-sky-900/5 backdrop-blur-md">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-sky-950">
                Configuración de Grupales
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Definí campos obligatorios por tipo de grupal y mantené múltiples
                formatos de pago asignables por usuario.
              </p>
            </div>
            <Link
              href="/groups"
              className="rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
            >
              Volver a grupales
            </Link>
          </div>
        </header>

        {error ? (
          <p className="rounded-2xl border border-amber-300/80 bg-amber-100/90 px-4 py-2 text-sm text-amber-800">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="rounded-2xl border border-emerald-300/80 bg-emerald-100/90 px-4 py-2 text-sm text-emerald-800">
            {message}
          </p>
        ) : null}

        <form
          onSubmit={handleSaveConfig}
          className="space-y-4 rounded-3xl border border-sky-300/60 bg-white/65 p-5 shadow-lg shadow-sky-900/5 backdrop-blur-md"
        >
          <div>
            <h2 className="text-lg font-semibold text-sky-950">
              Campos obligatorios por tipo
            </h2>
            <p className="text-xs text-slate-600">
              Formato de pilas: una lista por bloque, una línea por campo.
            </p>
          </div>

          <div className="space-y-3">
            <details open className="rounded-2xl border border-sky-200/80 bg-sky-50/50 p-3">
              <summary className="cursor-pointer list-none text-sm font-semibold text-sky-900">
                Grupales de agencia
              </summary>
              <textarea
                value={requiredAgenciaRaw}
                onChange={(e) => setRequiredAgenciaRaw(e.target.value)}
                rows={4}
                placeholder={"dni_number\nphone\nemail"}
                className="mt-2 w-full rounded-xl border border-sky-200 bg-white/85 px-3 py-2 outline-none transition focus:border-sky-400"
                disabled={loading || savingConfig}
              />
            </details>

            <details className="rounded-2xl border border-sky-200/80 bg-sky-50/50 p-3">
              <summary className="cursor-pointer list-none text-sm font-semibold text-sky-900">
                Estudiantiles
              </summary>
              <textarea
                value={requiredEstudiantilRaw}
                onChange={(e) => setRequiredEstudiantilRaw(e.target.value)}
                rows={4}
                placeholder={"dni_number\nbirth_date\nautorizacion_responsable"}
                className="mt-2 w-full rounded-xl border border-sky-200 bg-white/85 px-3 py-2 outline-none transition focus:border-sky-400"
                disabled={loading || savingConfig}
              />
            </details>

            <details className="rounded-2xl border border-sky-200/80 bg-sky-50/50 p-3">
              <summary className="cursor-pointer list-none text-sm font-semibold text-sky-900">
                Precomprados
              </summary>
              <textarea
                value={requiredPrecompradoRaw}
                onChange={(e) => setRequiredPrecompradoRaw(e.target.value)}
                rows={4}
                placeholder={"dni_number\npassport_number\nemail"}
                className="mt-2 w-full rounded-xl border border-sky-200 bg-white/85 px-3 py-2 outline-none transition focus:border-sky-400"
                disabled={loading || savingConfig}
              />
            </details>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
              <h3 className="text-sm font-semibold text-sky-900">Opciones de cupo</h3>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                {CAPACITY_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      setCapacityOptions((prev) => ({ ...prev, [key]: !prev[key] }))
                    }
                    className={`rounded-xl border px-3 py-2 text-left font-semibold ${
                      capacityOptions[key]
                        ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                        : "border-sky-200 bg-white text-slate-600"
                    }`}
                    disabled={loading}
                  >
                    {capacityOptions[key] ? "Activado" : "Desactivado"} ·{" "}
                    {CAPACITY_LABELS[key]}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
              <h3 className="text-sm font-semibold text-sky-900">Defaults operativos</h3>
              <div className="mt-3 space-y-2 text-sm">
                <label className="flex flex-col gap-1">
                  Modo de cupo por defecto
                  <select
                    value={defaultCapacityMode}
                    onChange={(e) =>
                      setDefaultCapacityMode(e.target.value as "TOTAL" | "SERVICIO")
                    }
                    className="rounded-xl border border-sky-200 bg-white px-3 py-2 outline-none transition focus:border-sky-400"
                    disabled={loading}
                  >
                    <option value="TOTAL">{CAPACITY_LABELS.TOTAL}</option>
                    <option value="SERVICIO">{CAPACITY_LABELS.SERVICIO}</option>
                  </select>
                </label>

                <button
                  type="button"
                  onClick={() => setDefaultAllowOverbooking((v) => !v)}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-xs font-semibold ${
                    defaultAllowOverbooking
                      ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                      : "border-sky-200 bg-white text-slate-600"
                  }`}
                  disabled={loading}
                >
                  Sobreventa por defecto: {defaultAllowOverbooking ? "Sí" : "No"}
                </button>

                <button
                  type="button"
                  onClick={() => setDefaultWaitlistEnabled((v) => !v)}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-xs font-semibold ${
                    defaultWaitlistEnabled
                      ? "border-amber-300 bg-amber-100 text-amber-800"
                      : "border-sky-200 bg-white text-slate-600"
                  }`}
                  disabled={loading}
                >
                  Lista de espera por defecto: {defaultWaitlistEnabled ? "Sí" : "No"}
                </button>
              </div>
            </section>
          </div>

          <button
            type="submit"
            disabled={loading || savingConfig}
            className="rounded-xl bg-sky-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingConfig ? <Spinner label="Guardando..." /> : "Guardar configuración"}
          </button>
        </form>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_1.6fr]">
          <section className="rounded-3xl border border-sky-300/60 bg-white/65 p-5 shadow-lg shadow-sky-900/5 backdrop-blur-md">
            <h2 className="text-lg font-semibold text-sky-950">Nueva plantilla de pago</h2>
            <form onSubmit={handleCreateTemplate} className="mt-3 space-y-3">
              <label className="flex flex-col gap-1 text-sm">
                Nombre
                <input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Reserva + anticipo + cuotas"
                  disabled={savingTemplate}
                  className="rounded-xl border border-sky-200 bg-white/85 px-3 py-2 outline-none transition focus:border-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
                />
              </label>
              <button
                type="button"
                onClick={() => setShowTemplateAdvanced((v) => !v)}
                disabled={savingTemplate}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                  showTemplateAdvanced
                    ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                    : "border-sky-300 bg-sky-50 text-sky-700"
                } disabled:cursor-not-allowed disabled:opacity-70`}
              >
                {showTemplateAdvanced ? "Ocultar opciones avanzadas" : "Mostrar opciones avanzadas"}
              </button>
              {showTemplateAdvanced ? (
                <>
                  <label className="flex flex-col gap-1 text-sm">
                    Descripción
                    <textarea
                      value={templateDescription}
                      onChange={(e) => setTemplateDescription(e.target.value)}
                      rows={2}
                      disabled={savingTemplate}
                      className="rounded-xl border border-sky-200 bg-white/85 px-3 py-2 outline-none transition focus:border-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
                    />
                  </label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-sm">
                      Tipo destino
                      <select
                        value={templateTarget}
                        onChange={(e) =>
                          setTemplateTarget(
                            e.target.value as
                              | "ALL"
                              | "AGENCIA"
                              | "ESTUDIANTIL"
                              | "PRECOMPRADO",
                          )
                        }
                        disabled={savingTemplate}
                        className="rounded-xl border border-sky-200 bg-white/85 px-3 py-2 outline-none transition focus:border-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {TARGET_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      Modo de pago
                      <input
                        value={templatePaymentMode}
                        onChange={(e) => setTemplatePaymentMode(e.target.value)}
                        placeholder="Anticipo + cuotas / Tarjeta / Efectivo"
                        disabled={savingTemplate}
                        className="rounded-xl border border-sky-200 bg-white/85 px-3 py-2 outline-none transition focus:border-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
                      />
                    </label>
                  </div>

                  <label className="flex flex-col gap-1 text-sm">
                    IDs de usuarios asignados (opcional)
                    <input
                      value={templateAssignedUsersRaw}
                      onChange={(e) => setTemplateAssignedUsersRaw(e.target.value)}
                      placeholder="12, 30, 45"
                      disabled={savingTemplate}
                      className="rounded-xl border border-sky-200 bg-white/85 px-3 py-2 outline-none transition focus:border-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
                    />
                  </label>
                </>
              ) : null}

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Cuotas de plantilla
                </p>
                {templateInstallments.map((item, idx) => (
                  <div key={`template-inst-${idx}`} className="grid grid-cols-2 gap-2">
                    <input
                      value={item.label}
                      onChange={(e) =>
                        setTemplateInstallments((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, label: e.target.value } : row,
                          ),
                        )
                      }
                      placeholder="Etiqueta"
                      disabled={savingTemplate}
                      className="rounded-xl border border-sky-200 bg-white/85 px-3 py-2 text-xs outline-none transition focus:border-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
                    />
                    <input
                      value={item.due_in_days}
                      onChange={(e) =>
                        setTemplateInstallments((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, due_in_days: e.target.value } : row,
                          ),
                        )
                      }
                      placeholder="Días desde base"
                      disabled={savingTemplate}
                      className="rounded-xl border border-sky-200 bg-white/85 px-3 py-2 text-xs outline-none transition focus:border-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
                    />
                    <input
                      value={item.amount}
                      onChange={(e) =>
                        setTemplateInstallments((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, amount: e.target.value } : row,
                          ),
                        )
                      }
                      placeholder="Monto"
                      disabled={savingTemplate}
                      className="rounded-xl border border-sky-200 bg-white/85 px-3 py-2 text-xs outline-none transition focus:border-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
                    />
                    <select
                      value={String(item.currency || "ARS").toUpperCase()}
                      onChange={(e) =>
                        setTemplateInstallments((prev) =>
                          prev.map((row, i) =>
                            i === idx
                              ? { ...row, currency: e.target.value.toUpperCase() }
                              : row,
                          ),
                        )
                      }
                      disabled={savingTemplate}
                      className="rounded-xl border border-sky-200 bg-white/85 px-3 py-2 text-xs outline-none transition focus:border-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {templateCurrencyOptions.map((code) => (
                        <option key={`tpl-row-currency-${idx}-${code}`} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setTemplateInstallments((prev) => [
                      ...prev,
                      {
                        label: "",
                        due_in_days: "",
                        amount: "",
                        currency: templateCurrencyOptions[0] || "ARS",
                      },
                    ])
                  }
                  disabled={savingTemplate}
                  className="rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Agregar cuota
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setTemplateInstallments((prev) =>
                      prev.length > 1 ? prev.slice(0, -1) : prev,
                    )
                  }
                  disabled={savingTemplate || templateInstallments.length <= 1}
                  className="rounded-xl border border-amber-300 bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Quitar última
                </button>
              </div>

              <button
                type="submit"
                disabled={savingTemplate}
                className="w-full rounded-xl bg-sky-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingTemplate ? <Spinner label="Creando..." /> : "Crear plantilla"}
              </button>
            </form>
          </section>

          <section className="rounded-3xl border border-sky-300/60 bg-white/65 p-5 shadow-lg shadow-sky-900/5 backdrop-blur-md">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-sky-950">
                Plantillas ({sortedTemplates.length})
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTemplateViewMode("LIST")}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                    templateViewMode === "LIST"
                      ? "border-sky-500 bg-sky-500 text-white"
                      : "border-sky-300 bg-sky-50 text-sky-700"
                  }`}
                >
                  Lista
                </button>
                <button
                  type="button"
                  onClick={() => setTemplateViewMode("GRID")}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                    templateViewMode === "GRID"
                      ? "border-sky-500 bg-sky-500 text-white"
                      : "border-sky-300 bg-sky-50 text-sky-700"
                  }`}
                >
                  Grilla
                </button>
                <button
                  type="button"
                  onClick={() => void loadData()}
                  className="rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700"
                >
                  Refrescar
                </button>
              </div>
            </div>

            <div className={templateViewMode === "GRID" ? "grid grid-cols-1 gap-3 md:grid-cols-2" : "space-y-3"}>
              {sortedTemplates.map((item) => (
                <article
                  key={item.id_travel_group_payment_template}
                  className="rounded-2xl border border-sky-200 bg-white/80 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sky-950">{item.name}</p>
                      <p className="text-xs text-slate-500">
                        Tipo: {formatType(item.target_type)} · Modo:{" "}
                        {item.payment_mode || "-"} · ID:{" "}
                        {item.agency_travel_group_payment_template_id ??
                          item.id_travel_group_payment_template}
                      </p>
                      {item.description ? (
                        <p className="mt-1 text-xs text-slate-600">{item.description}</p>
                      ) : null}
                    </div>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                        item.is_active
                          ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                          : "border-amber-300 bg-amber-100 text-amber-800"
                      }`}
                    >
                      {item.is_active ? "Activa" : "Inactiva"}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-600">
                    <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5">
                      Cuotas: {item.installments?.length || 0}
                    </span>
                    <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5">
                      Usuarios asignados: {item.assigned_user_ids?.length || 0}
                    </span>
                    <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5">
                      Actualizada: {formatDate(item.updated_at)}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleToggleTemplate(item)}
                      disabled={savingTemplate}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                        item.is_active
                          ? "border-amber-300 bg-amber-100 text-amber-800"
                          : "border-emerald-300 bg-emerald-100 text-emerald-700"
                      } disabled:cursor-not-allowed disabled:opacity-70`}
                    >
                      {item.is_active ? "Desactivar" : "Activar"}
                    </button>
                    {!item.is_preloaded ? (
                      <button
                        type="button"
                        onClick={() => void handleDeleteTemplate(item)}
                        disabled={savingTemplate}
                        className="rounded-xl border border-zinc-300 bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-700 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        Eliminar
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}

              {sortedTemplates.length === 0 && !loading ? (
                <p className="rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-2 text-xs text-slate-600">
                  No hay plantillas cargadas todavía.
                </p>
              ) : null}
            </div>
          </section>
        </div>
      </div>
      <ToastContainer position="top-right" autoClose={3200} />
    </main>
  );
}
