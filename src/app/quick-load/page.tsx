// src/app/quick-load/page.tsx
"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { toast, ToastContainer } from "react-toastify";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import ClientPicker from "@/components/clients/ClientPicker";
import DestinationPicker, {
  type DestinationOption,
} from "@/components/DestinationPicker";
import SummaryCard from "@/components/services/SummaryCard";
import BillingBreakdown from "@/components/BillingBreakdown";
import BillingBreakdownManual from "@/components/BillingBreakdownManual";
import { computeBillingAdjustments } from "@/utils/billingAdjustments";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import { loadFinancePicks, type FinanceCurrency } from "@/utils/loadFinancePicks";
import { normalizeRole } from "@/utils/permissions";
import type {
  BillingAdjustmentComputed,
  BillingAdjustmentConfig,
  BillingData,
  Client,
  Operator,
  Service,
} from "@/types";
import "react-toastify/dist/ReactToastify.css";

type Profile = {
  id_user: number;
  id_agency: number;
  role: string;
  first_name?: string;
  last_name?: string;
};

type NewClientDraft = {
  id: string;
  kind: "new";
  first_name: string;
  last_name: string;
  phone: string;
  birth_date: string;
  nationality: string;
  gender: string;
  dni_number: string;
  passport_number: string;
  email: string;
  address: string;
  postal_code: string;
  locality: string;
  company_name: string;
  commercial_address: string;
  tax_id: string;
};

type ExistingClientDraft = {
  id: string;
  kind: "existing";
  existingId: number;
  snapshot: {
    first_name: string;
    last_name: string;
    dni_number?: string;
    passport_number?: string;
    email?: string;
    address?: string;
    postal_code?: string;
    locality?: string;
    company_name?: string;
    commercial_address?: string;
    tax_id?: string;
  };
};

type ClientDraft = NewClientDraft | ExistingClientDraft;

type BookingDraft = {
  clientStatus: string;
  operatorStatus: string;
  status: string;
  details: string;
  invoice_type: string;
  invoice_observation: string;
  observation: string;
  departure_date: string;
  return_date: string;
};

type ServiceDraft = {
  id: string;
  type: string;
  description: string;
  sale_price: string;
  cost_price: string;
  tax_21: string;
  tax_105: string;
  exempt: string;
  other_taxes: string;
  card_interest: string;
  card_interest_21: string;
  destination: string;
  reference: string;
  currency: string;
  id_operator: number;
  departure_date: string;
  return_date: string;
  extra_costs_amount: string;
  extra_taxes_amount: string;
  taxableCardInterest: number;
  vatOnCardInterest: number;
  nonComputable: number;
  taxableBase21: number;
  taxableBase10_5: number;
  commissionExempt: number;
  commission21: number;
  commission10_5: number;
  vatOnCommission21: number;
  vatOnCommission10_5: number;
  totalCommissionWithoutVAT: number;
  impIVA: number;
  transfer_fee_pct: number;
  transfer_fee_amount: number;
};

type QuickLoadDraft = {
  step: number;
  clients: ClientDraft[];
  titularId: string | null;
  booking: BookingDraft;
  services: ServiceDraft[];
  updatedAt: string;
};

type AdjustmentTotals = ReturnType<typeof computeBillingAdjustments>;

const EMPTY_ADJUSTMENTS: AdjustmentTotals = {
  items: [],
  totalCosts: 0,
  totalTaxes: 0,
  total: 0,
};

const DRAFT_KEY = "quick-load-draft-v1";

const STEP_LABELS = [
  { id: 1, label: "Pasajeros", desc: "Alta rápida de pasajeros" },
  { id: 2, label: "Reserva", desc: "Fechas y facturación" },
  { id: 3, label: "Servicios", desc: "Carga y desglose" },
  { id: 4, label: "Resumen", desc: "Revisión final" },
] as const;

const INVOICE_TYPES = [
  { value: "Factura A", label: "Responsable Inscripto (Factura A)" },
  { value: "Factura B", label: "Consumidor final (Factura B)" },
  {
    value: "Coordinar con administracion",
    label: "No facturar hasta coordinar con administración",
  },
] as const;

type ServiceTypeOption = {
  value: string;
  label: string;
};

const pickArrayFromJson = (
  payload: unknown,
  keys: string[] = ["data", "items", "types", "results"],
): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    for (const key of keys) {
      const value = (payload as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value;
    }
  }
  return [];
};

const toBoolish = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["false", "0", "no", "off"].includes(normalized)) return false;
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
  }
  return undefined;
};

const normalizeServiceTypes = (payload: unknown): ServiceTypeOption[] => {
  const items = pickArrayFromJson(payload);
  const normalized = items
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const name =
        typeof record.name === "string"
          ? record.name
          : typeof record.label === "string"
            ? record.label
            : typeof record.type === "string"
              ? record.type
              : "";
      const code = typeof record.code === "string" ? record.code : "";
      const enabled =
        toBoolish(
          record.enabled ??
            record.is_active ??
            record.isActive ??
            record.active,
        ) ?? true;
      const value = name || code;
      if (!value || enabled === false) return null;
      return { value, label: name || code };
    })
    .filter(Boolean) as ServiceTypeOption[];
  return normalized.sort((a, b) => a.label.localeCompare(b.label, "es"));
};

// const GLASS =
//   "rounded-3xl border border-sky-200/60 bg-white/70 p-6 text-sky-950 shadow-sm shadow-sky-950/10 backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white";
const PANEL =
  "rounded-3xl border border-sky-200/60 bg-white/60 p-6 shadow-sm shadow-sky-950/10 backdrop-blur dark:border-white/10 dark:bg-white/5";
const INPUT =
  "w-full rounded-2xl border border-white/20 bg-white/70 px-3 py-2.5 text-sm text-sky-950 shadow-sm shadow-sky-950/10 outline-none transition placeholder:text-sky-950/40 focus:border-sky-300/70 focus:ring-2 focus:ring-sky-200/60 dark:border-white/10 dark:bg-white/10 dark:text-white dark:placeholder:text-white/40";
const INPUT_SOFT =
  "w-full rounded-2xl border border-white/10 bg-white/60 px-3 py-2.5 text-sm text-sky-950 shadow-sm shadow-sky-950/10 outline-none transition placeholder:text-sky-950/40 focus:border-sky-300/70 focus:ring-2 focus:ring-sky-200/60 dark:border-white/10 dark:bg-white/10 dark:text-white dark:placeholder:text-white/40";
const SUBCARD =
  "rounded-2xl border border-white/10 bg-white/70 p-5 shadow-sm shadow-sky-950/10 backdrop-blur dark:border-white/10 dark:bg-white/10";
const BTN_SKY =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-sky-200/60 bg-sky-100/80 px-4 py-2 text-sm font-semibold text-sky-950 shadow-sm shadow-sky-900/20 transition hover:-translate-y-0.5 hover:bg-sky-100/90 disabled:cursor-not-allowed disabled:opacity-50 dark:border-sky-400/40 dark:bg-sky-900/30 dark:text-sky-100";
const BTN_EMERALD =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-emerald-200/60 bg-emerald-100/70 px-4 py-2 text-sm font-semibold text-emerald-950 shadow-sm shadow-emerald-900/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-400/40 dark:bg-emerald-900/30 dark:text-emerald-100";
const BTN_ROSE =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-rose-200/60 bg-rose-100/70 px-3 py-2 text-sm font-semibold text-rose-950 shadow-sm shadow-rose-900/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-400/40 dark:bg-rose-900/30 dark:text-rose-100";

const PILL_BASE =
  "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold";
const PILL_OK =
  "border border-emerald-200/60 bg-emerald-100/70 text-emerald-900";
const PILL_WARN = "border border-amber-200/60 bg-amber-100/70 text-amber-900";
const PILL_SKY = "border border-sky-200/60 bg-sky-100/70 text-sky-900";

const STACK_EMERALD =
  "rounded-2xl border border-emerald-200/60 bg-emerald-100/30 p-5 shadow-sm shadow-emerald-900/10";
const STACK_ROSE =
  "rounded-2xl border border-rose-200/60 bg-rose-100/30 p-5 shadow-sm shadow-rose-900/10";
const STACK_AMBER =
  "rounded-2xl border border-amber-200/60 bg-amber-100/30 p-5 shadow-sm shadow-amber-900/10";
const STACK_SKY =
  "rounded-2xl border border-sky-200/60 bg-sky-100/20 p-5 shadow-sm shadow-sky-900/10";

const FieldLabel = ({
  htmlFor,
  children,
  required,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  required?: boolean;
}) => {
  if (htmlFor) {
    return (
      <label
        htmlFor={htmlFor}
        className="text-xs font-semibold text-sky-950 dark:text-white"
      >
        {children}
        {required ? <span className="ml-1 text-rose-600">*</span> : null}
      </label>
    );
  }
  return (
    <span className="text-xs font-semibold text-sky-950 dark:text-white">
      {children}
      {required ? <span className="ml-1 text-rose-600">*</span> : null}
    </span>
  );
};

const makeId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const formatDate = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "-";

const fmtMoney = (value: number, currency: string) => {
  const safe = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: currency || "ARS",
    }).format(safe);
  } catch {
    return `${currency || "ARS"} ${safe.toFixed(2)}`;
  }
};

const toNumber = (value: string | number | null | undefined) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const normalized = value.replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const normalizeSaleTotals = (input: Record<string, string>) => {
  const out: Record<string, number> = {};
  for (const [rawKey, rawVal] of Object.entries(input || {})) {
    const key = String(rawKey || "").toUpperCase().trim();
    if (!key) continue;
    const value = toNumber(rawVal);
    if (value > 0) out[key] = value;
  }
  return out;
};

const emptyBooking = (): BookingDraft => ({
  clientStatus: "Pendiente",
  operatorStatus: "Pendiente",
  status: "Abierta",
  details: "",
  invoice_type: "",
  invoice_observation: "",
  observation: "",
  departure_date: "",
  return_date: "",
});

const emptyService = (booking?: BookingDraft): ServiceDraft => ({
  id: makeId(),
  type: "",
  description: "",
  sale_price: "",
  cost_price: "",
  tax_21: "",
  tax_105: "",
  exempt: "",
  other_taxes: "",
  card_interest: "",
  card_interest_21: "",
  destination: "",
  reference: "",
  currency: "ARS",
  id_operator: 0,
  departure_date: booking?.departure_date || "",
  return_date: booking?.return_date || "",
  extra_costs_amount: "",
  extra_taxes_amount: "",
  taxableCardInterest: 0,
  vatOnCardInterest: 0,
  nonComputable: 0,
  taxableBase21: 0,
  taxableBase10_5: 0,
  commissionExempt: 0,
  commission21: 0,
  commission10_5: 0,
  vatOnCommission21: 0,
  vatOnCommission10_5: 0,
  totalCommissionWithoutVAT: 0,
  impIVA: 0,
  transfer_fee_pct: 0.024,
  transfer_fee_amount: 0,
});

const emptyClient = (): NewClientDraft => ({
  id: makeId(),
  kind: "new",
  first_name: "",
  last_name: "",
  phone: "",
  birth_date: "",
  nationality: "",
  gender: "",
  dni_number: "",
  passport_number: "",
  email: "",
  address: "",
  postal_code: "",
  locality: "",
  company_name: "",
  commercial_address: "",
  tax_id: "",
});

const missingClientFields = (client: NewClientDraft) => {
  const missing: string[] = [];
  if (!client.first_name.trim()) missing.push("Nombre");
  if (!client.last_name.trim()) missing.push("Apellido");
  if (!client.phone.trim()) missing.push("Teléfono");
  if (!client.birth_date.trim()) missing.push("Nacimiento");
  if (!client.nationality.trim()) missing.push("Nacionalidad");
  if (!client.gender.trim()) missing.push("Género");
  if (
    !client.dni_number.trim() &&
    !client.passport_number.trim() &&
    !client.tax_id.trim()
  )
    missing.push("DNI, Pasaporte o CUIT");
  return missing;
};

const isClientComplete = (client: ClientDraft) => {
  if (client.kind === "existing") return true;
  return missingClientFields(client).length === 0;
};

const isServiceComplete = (
  service: ServiceDraft,
  allowMissingSale = false,
) => {
  const sale = Number(service.sale_price);
  const cost = Number(service.cost_price);
  const saleOk = allowMissingSale ? true : Number.isFinite(sale);
  return (
    service.type.trim() &&
    service.id_operator > 0 &&
    service.currency.trim() &&
    service.departure_date.trim() &&
    service.return_date.trim() &&
    saleOk &&
    Number.isFinite(cost)
  );
};

const ButtonSpinner = () => (
  <span className="inline-flex size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
);

const AdjustmentsPanel = ({
  items,
  totalCosts,
  totalTaxes,
  netCommission,
  format,
}: {
  items: BillingAdjustmentComputed[];
  totalCosts: number;
  totalTaxes: number;
  netCommission: number | null;
  format: (value: number) => string;
}) => {
  if (!items.length) return null;
  const kindLabels: Record<BillingAdjustmentComputed["kind"], string> = {
    cost: "Costo",
    tax: "Impuesto",
  };
  const basisLabels: Record<BillingAdjustmentComputed["basis"], string> = {
    sale: "Venta",
    cost: "Costo",
    margin: "Ganancia",
  };

  return (
    <div className={SUBCARD}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.25em] text-sky-900/60 dark:text-white/60">
          Ajustes extra
        </p>
        <span className="rounded-full bg-white/40 px-2.5 py-1 text-[11px] font-semibold text-sky-900/70 dark:bg-white/10 dark:text-white/70">
          {items.length} activo{items.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {items.map((adj) => {
          const valueLabel =
            adj.valueType === "percent"
              ? `${(adj.value * 100).toFixed(2)}%`
              : "Monto fijo";
          return (
            <div
              key={adj.id}
              className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-3 py-2"
            >
              <div>
                <div className="text-sm font-medium">{adj.label}</div>
                <div className="text-[11px] opacity-70">
                  {kindLabels[adj.kind]} · Base {basisLabels[adj.basis]} ·{" "}
                  {valueLabel}
                </div>
              </div>
              <div className="font-medium tabular-nums">
                {format(adj.amount)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        <div className="rounded-xl border border-white/5 bg-white/5 px-3 py-2">
          <div className="text-xs opacity-70">Costos adicionales</div>
          <div className="text-sm font-semibold tabular-nums">
            {format(totalCosts)}
          </div>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/5 px-3 py-2">
          <div className="text-xs opacity-70">Impuestos adicionales</div>
          <div className="text-sm font-semibold tabular-nums">
            {format(totalTaxes)}
          </div>
        </div>
      </div>

      {netCommission != null && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/20 p-3">
          <div className="text-sm opacity-70">
            Comisión neta (Costos Bancarios + ajustes)
          </div>
          <div className="text-lg font-semibold tabular-nums">
            {format(netCommission)}
          </div>
        </div>
      )}
    </div>
  );
};

const IconTrash = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
    />
  </svg>
);

const IconPlus = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    className={className}
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
  </svg>
);

const IconArrowLeft = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    className={className}
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
);

const IconCheck = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    className={className}
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

export default function QuickLoadPage() {
  const { token } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loadingOperators, setLoadingOperators] = useState(false);
  const [serviceTypes, setServiceTypes] = useState<ServiceTypeOption[]>([]);
  const [loadingServiceTypes, setLoadingServiceTypes] = useState(false);
  const [serviceTypesError, setServiceTypesError] = useState<string | null>(
    null,
  );
  const [financeCurrencies, setFinanceCurrencies] = useState<
    FinanceCurrency[] | null
  >(null);
  const [loadingCurrencies, setLoadingCurrencies] = useState(false);
  const [billingMode, setBillingMode] = useState<"auto" | "manual">("auto");
  const [transferFeePct, setTransferFeePct] = useState(0.024);
  const [useBookingSaleTotal, setUseBookingSaleTotal] = useState(false);
  const [manualOverride, setManualOverride] = useState(false);
  const [billingAdjustments, setBillingAdjustments] = useState<
    BillingAdjustmentConfig[]
  >([]);
  const [bookingSaleTotals, setBookingSaleTotals] = useState<
    Record<string, string>
  >({});
  const [calcConfigLoading, setCalcConfigLoading] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [clients, setClients] = useState<ClientDraft[]>([]);
  const [titularId, setTitularId] = useState<string | null>(null);
  const [booking, setBooking] = useState<BookingDraft>(emptyBooking);
  const [services, setServices] = useState<ServiceDraft[]>([]);
  const [pickerKey, setPickerKey] = useState(0);
  const [saving, setSaving] = useState(false);

  const [draftStatus, setDraftStatus] = useState<
    "idle" | "available" | "active"
  >("idle");
  const [storedDraft, setStoredDraft] = useState<QuickLoadDraft | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const normalizedRole = useMemo(
    () => normalizeRole(profile?.role),
    [profile?.role],
  );
  const canOverrideBillingMode = useMemo(
    () =>
      ["administrativo", "gerente", "desarrollador"].includes(normalizedRole),
    [normalizedRole],
  );

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    setLoadingProfile(true);
    (async () => {
      try {
        const res = await authFetch(
          "/api/user/profile",
          { signal: controller.signal },
          token,
        );
        if (!res.ok) throw new Error("No se pudo cargar el perfil");
        const data = (await res.json()) as Profile;
        setProfile(data);
      } catch (err) {
        if ((err as DOMException)?.name !== "AbortError") {
          console.error("❌ Error perfil:", err);
          toast.error("No se pudo cargar tu perfil.");
        }
      } finally {
        if (!controller.signal.aborted) setLoadingProfile(false);
      }
    })();
    return () => controller.abort();
  }, [token]);

  useEffect(() => {
    if (!profile?.id_agency || !token) return;
    const controller = new AbortController();
    setLoadingOperators(true);
    (async () => {
      try {
        const res = await authFetch(
          `/api/operators?agencyId=${profile.id_agency}`,
          { signal: controller.signal, cache: "no-store" },
          token,
        );
        if (!res.ok) throw new Error("Error al cargar operadores");
        const data = (await res.json()) as Operator[];
        setOperators(data);
      } catch (err) {
        if ((err as DOMException)?.name !== "AbortError") {
          console.error("❌ Error operadores:", err);
          toast.error("No se pudieron cargar los operadores.");
        }
      } finally {
        if (!controller.signal.aborted) setLoadingOperators(false);
      }
    })();
    return () => controller.abort();
  }, [profile?.id_agency, token]);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    setLoadingServiceTypes(true);
    setServiceTypesError(null);
    (async () => {
      try {
        const res = await authFetch(
          "/api/service-types",
          { cache: "no-store", signal: controller.signal },
          token,
        );
        if (!res.ok) throw new Error("Error al cargar tipos de servicio");
        const data = await res.json();
        const normalized = normalizeServiceTypes(data);
        if (!controller.signal.aborted) setServiceTypes(normalized);
      } catch (err) {
        if ((err as DOMException)?.name !== "AbortError") {
          console.error("❌ Error tipos de servicio:", err);
          setServiceTypes([]);
          setServiceTypesError("No se pudieron cargar los tipos.");
          toast.error("No se pudieron cargar los tipos de servicio.");
        }
      } finally {
        if (!controller.signal.aborted) setLoadingServiceTypes(false);
      }
    })();
    return () => controller.abort();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    setLoadingCurrencies(true);
    (async () => {
      try {
        const picks = await loadFinancePicks(token);
        if (!controller.signal.aborted) {
          setFinanceCurrencies(picks?.currencies ?? null);
        }
      } catch (err) {
        if ((err as DOMException)?.name !== "AbortError") {
          console.error("❌ Error cargando monedas:", err);
          setFinanceCurrencies(null);
        }
      } finally {
        if (!controller.signal.aborted) setLoadingCurrencies(false);
      }
    })();
    return () => controller.abort();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    setCalcConfigLoading(true);
    (async () => {
      try {
        const res = await authFetch(
          "/api/service-calc-config",
          { cache: "no-store", signal: controller.signal },
          token,
        );
        if (res.ok) {
          const data = (await res.json()) as {
            billing_breakdown_mode?: string;
            transfer_fee_pct?: number;
            use_booking_sale_total?: boolean;
            billing_adjustments?: BillingAdjustmentConfig[];
          };
          const mode =
            data.billing_breakdown_mode === "manual" ? "manual" : "auto";
          setBillingMode(mode);
          const pct = Number(data.transfer_fee_pct);
          const safePct = Number.isFinite(pct)
            ? Math.min(Math.max(pct, 0), 1)
            : 0.024;
          setTransferFeePct(safePct);
          setUseBookingSaleTotal(Boolean(data.use_booking_sale_total));
          setBillingAdjustments(
            Array.isArray(data.billing_adjustments)
              ? data.billing_adjustments
              : [],
          );
        }
      } catch (err) {
        if ((err as DOMException)?.name !== "AbortError") {
          console.error("❌ Error cargando config de servicios:", err);
          setBillingAdjustments([]);
        }
      } finally {
        if (!controller.signal.aborted) setCalcConfigLoading(false);
      }
    })();
    return () => controller.abort();
  }, [token]);

  useEffect(() => {
    if (
      !canOverrideBillingMode ||
      billingMode === "manual" ||
      useBookingSaleTotal
    ) {
      setManualOverride(false);
    }
  }, [billingMode, canOverrideBillingMode, useBookingSaleTotal]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) {
      setDraftStatus("active");
      return;
    }
    try {
      const parsed = JSON.parse(raw) as QuickLoadDraft;
      if (parsed && parsed.clients && parsed.booking) {
        setStoredDraft(parsed);
        setDraftStatus("available");
        setLastSavedAt(parsed.updatedAt || null);
      } else {
        setDraftStatus("active");
      }
    } catch {
      setDraftStatus("active");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (draftStatus !== "active") return;
    const payload: QuickLoadDraft = {
      step,
      clients,
      titularId,
      booking,
      services,
      updatedAt: new Date().toISOString(),
    };
    const t = window.setTimeout(() => {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
      setLastSavedAt(payload.updatedAt);
    }, 400);
    return () => window.clearTimeout(t);
  }, [draftStatus, step, clients, titularId, booking, services]);

  const recoverDraft = () => {
    if (!storedDraft) return;
    setClients(storedDraft.clients || []);
    setTitularId(storedDraft.titularId ?? null);
    setBooking(storedDraft.booking || emptyBooking());
    setServices(storedDraft.services || []);
    setStep(
      storedDraft.step === 1 ||
        storedDraft.step === 2 ||
        storedDraft.step === 3 ||
        storedDraft.step === 4
        ? storedDraft.step
        : 1,
    );
    setDraftStatus("active");
    toast.success("Borrador recuperado.");
  };

  const discardDraft = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DRAFT_KEY);
    }
    setStoredDraft(null);
    setDraftStatus("active");
    toast.info("Borrador descartado.");
  };

  const addNewClient = () => {
    const draft = emptyClient();
    setClients((prev) => [...prev, draft]);
    if (!titularId) setTitularId(draft.id);
  };

  const addExistingClient = (client: Client) => {
    const exists = clients.some(
      (c) => c.kind === "existing" && c.existingId === client.id_client,
    );
    if (exists) {
      toast.info("Ese pax ya está en la lista.");
      return;
    }
    const draft: ExistingClientDraft = {
      id: `existing-${client.id_client}`,
      kind: "existing",
      existingId: client.id_client,
      snapshot: {
        first_name: client.first_name,
        last_name: client.last_name,
            dni_number: client.dni_number,
            passport_number: client.passport_number,
            email: client.email,
            address: client.address,
            postal_code: client.postal_code,
            locality: client.locality,
            company_name: client.company_name,
            commercial_address: client.commercial_address,
            tax_id: client.tax_id,
      },
    };
    setClients((prev) => [...prev, draft]);
    if (!titularId) setTitularId(draft.id);
    setPickerKey((prev) => prev + 1);
    toast.success("Pax agregado.");
  };

  const removeClient = (id: string) => {
    setClients((prev) => prev.filter((c) => c.id !== id));
    setTitularId((prev) => {
      if (prev !== id) return prev;
      const remaining = clients.filter((c) => c.id !== id);
      return remaining[0]?.id ?? null;
    });
  };

  const updateClientField = (
    id: string,
    field: keyof NewClientDraft,
    value: string,
  ) => {
    setClients((prev) =>
      prev.map((c) =>
        c.id === id && c.kind === "new" ? { ...c, [field]: value } : c,
      ),
    );
  };

  const handleNationalitySelect = (
    id: string,
    val: DestinationOption | DestinationOption[] | null,
  ) => {
    const label = Array.isArray(val)
      ? val.map((opt) => opt.displayLabel).join(", ")
      : val?.displayLabel || "";
    updateClientField(id, "nationality", label);
  };

  const updateBookingField = (field: keyof BookingDraft, value: string) => {
    setBooking((prev) => ({ ...prev, [field]: value }));
  };

  const updateBookingSaleTotal = (currency: string, value: string) => {
    setBookingSaleTotals((prev) => ({ ...prev, [currency]: value }));
  };

  const addService = () => {
    setServices((prev) => [
      ...prev,
      { ...emptyService(booking), transfer_fee_pct: transferFeePct },
    ]);
  };

  const removeService = (id: string) => {
    setServices((prev) => prev.filter((s) => s.id !== id));
  };

  const updateServiceField = (
    id: string,
    field: keyof ServiceDraft,
    value: string | number,
  ) => {
    const resetBilling: Partial<ServiceDraft> = {
      taxableCardInterest: 0,
      vatOnCardInterest: 0,
      nonComputable: 0,
      taxableBase21: 0,
      taxableBase10_5: 0,
      commissionExempt: 0,
      commission21: 0,
      commission10_5: 0,
      vatOnCommission21: 0,
      vatOnCommission10_5: 0,
      totalCommissionWithoutVAT: 0,
      impIVA: 0,
      transfer_fee_amount: 0,
    };
    const billingInputs = new Set<keyof ServiceDraft>([
      "sale_price",
      "cost_price",
      "tax_21",
      "tax_105",
      "exempt",
      "other_taxes",
      "card_interest",
      "card_interest_21",
    ]);
    setServices((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const next = { ...s, [field]: value };
        return billingInputs.has(field) ? { ...next, ...resetBilling } : next;
      }),
    );
  };

  const updateServiceBilling = (id: string, data: BillingData) => {
    setServices((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              nonComputable: data.nonComputable ?? 0,
              taxableBase21: data.taxableBase21 ?? 0,
              taxableBase10_5: data.taxableBase10_5 ?? 0,
              commissionExempt: data.commissionExempt ?? 0,
              commission21: data.commission21 ?? 0,
              commission10_5: data.commission10_5 ?? 0,
              vatOnCommission21: data.vatOnCommission21 ?? 0,
              vatOnCommission10_5: data.vatOnCommission10_5 ?? 0,
              totalCommissionWithoutVAT: data.totalCommissionWithoutVAT ?? 0,
              impIVA: data.impIVA ?? 0,
              taxableCardInterest: data.taxableCardInterest ?? 0,
              vatOnCardInterest: data.vatOnCardInterest ?? 0,
              transfer_fee_pct: data.transferFeePct ?? transferFeePct,
              transfer_fee_amount: data.transferFeeAmount ?? 0,
            }
          : s,
      ),
    );
  };

  const handleDestinationSelect = (
    id: string,
    val: DestinationOption | DestinationOption[] | null,
  ) => {
    const label = Array.isArray(val)
      ? val.map((opt) => opt.displayLabel).join(", ")
      : val?.displayLabel || "";
    updateServiceField(id, "destination", label);
  };

  const servicesReady = services.every((s) =>
    isServiceComplete(s, useBookingSaleTotal),
  );
  const manualMode =
    useBookingSaleTotal ||
    billingMode === "manual" ||
    (canOverrideBillingMode && manualOverride);
  const canManualOverride =
    canOverrideBillingMode && billingMode === "auto" && !useBookingSaleTotal;
  const canOverrideSaleTotal = canOverrideBillingMode;
  const currencyOptions = useMemo(() => {
    const configured = (financeCurrencies || [])
      .filter((currency) => currency.enabled)
      .map((currency) => currency.code.toUpperCase())
      .filter(Boolean);
    const unique = Array.from(new Set(configured)).sort((a, b) =>
      a.localeCompare(b, "es"),
    );
    return unique.length > 0 ? unique : ["ARS", "USD"];
  }, [financeCurrencies]);

  const adjustmentsByServiceId = useMemo(() => {
    const map = new Map<string, AdjustmentTotals>();
    services.forEach((service) => {
      if (useBookingSaleTotal) {
        map.set(service.id, EMPTY_ADJUSTMENTS);
        return;
      }
      const sale = toNumber(service.sale_price);
      const cost = toNumber(service.cost_price);
      map.set(
        service.id,
        computeBillingAdjustments(billingAdjustments, sale, cost),
      );
    });
    return map;
  }, [services, billingAdjustments, useBookingSaleTotal]);

  const goToStep = (target: 1 | 2 | 3 | 4) => {
    setStep(target);
  };

  const missingSummary = useMemo(() => {
    const missing: string[] = [];
    const currenciesForTotals =
      services.length > 0
        ? Array.from(
            new Set(services.map((s) => (s.currency || "ARS").toUpperCase())),
          )
        : ["ARS"];
    if (clients.length === 0) {
      missing.push("Agregar al menos un pax.");
    }
    if (!titularId) {
      missing.push("Definir un titular.");
    }
    const incompleteClients = clients.filter(
      (c) => c.kind === "new" && missingClientFields(c).length > 0,
    ).length;
    if (incompleteClients > 0) {
      const paxLabel = incompleteClients === 1 ? "pax" : "pasajeros";
      missing.push(
        `Completar ${incompleteClients} ${paxLabel} con datos obligatorios.`,
      );
    }
    if (!booking.details.trim()) {
      missing.push("Completar el detalle de la reserva.");
    }
    if (!booking.departure_date.trim()) {
      missing.push("Completar la fecha de salida.");
    }
    if (!booking.return_date.trim()) {
      missing.push("Completar la fecha de regreso.");
    }
    if (!booking.invoice_type.trim()) {
      missing.push("Seleccionar el tipo de factura.");
    }
    if (useBookingSaleTotal) {
      const missingTotals = currenciesForTotals.filter((cur) => {
        const raw = bookingSaleTotals[cur];
        return raw == null || toNumber(raw) <= 0;
      });
      if (missingTotals.length > 0) {
        missing.push(
          `Completar venta total (${missingTotals.join(", ")}).`,
        );
      }
    }
    if (services.length > 0 && !servicesReady) {
      missing.push("Revisar servicios incompletos.");
    }
    return missing;
  }, [
    bookingSaleTotals,
    clients,
    titularId,
    booking.details,
    booking.departure_date,
    booking.return_date,
    booking.invoice_type,
    services,
    servicesReady,
    useBookingSaleTotal,
  ]);

  const canConfirm = missingSummary.length === 0 && !saving;

  const summaryServices = useMemo(() => {
    return services.map((service, idx) => ({
      id_service: idx + 1,
      type: service.type,
      description: service.description,
      sale_price: toNumber(service.sale_price),
      cost_price: toNumber(service.cost_price),
      destination: service.destination,
      reference: service.reference,
      tax_21: toNumber(service.tax_21),
      tax_105: toNumber(service.tax_105),
      exempt: toNumber(service.exempt),
      other_taxes: toNumber(service.other_taxes),
      card_interest: toNumber(service.card_interest),
      card_interest_21: toNumber(service.card_interest_21),
      taxableCardInterest: service.taxableCardInterest,
      vatOnCardInterest: service.vatOnCardInterest,
      nonComputable: service.nonComputable,
      taxableBase21: service.taxableBase21,
      taxableBase10_5: service.taxableBase10_5,
      commissionExempt: service.commissionExempt,
      commission21: service.commission21,
      commission10_5: service.commission10_5,
      vatOnCommission21: service.vatOnCommission21,
      vatOnCommission10_5: service.vatOnCommission10_5,
      totalCommissionWithoutVAT: service.totalCommissionWithoutVAT,
      impIVA: service.impIVA,
      transfer_fee_pct: Number.isFinite(service.transfer_fee_pct)
        ? service.transfer_fee_pct
        : transferFeePct,
      transfer_fee_amount: service.transfer_fee_amount,
      extra_costs_amount:
        adjustmentsByServiceId.get(service.id)?.totalCosts ?? 0,
      extra_taxes_amount:
        adjustmentsByServiceId.get(service.id)?.totalTaxes ?? 0,
      extra_adjustments: adjustmentsByServiceId.get(service.id)?.items ?? [],
      currency: service.currency,
      departure_date: service.departure_date,
      return_date: service.return_date,
      booking_id: 0,
      id_operator: service.id_operator,
      created_at: new Date().toISOString(),
    }));
  }, [services, transferFeePct, adjustmentsByServiceId]);

  const totalsByCurrency = useMemo(() => {
    const zero = {
      sale_price: 0,
      cost_price: 0,
      tax_21: 0,
      tax_105: 0,
      exempt: 0,
      other_taxes: 0,
      taxableCardInterest: 0,
      vatOnCardInterest: 0,
      nonComputable: 0,
      taxableBase21: 0,
      taxableBase10_5: 0,
      commissionExempt: 0,
      commission21: 0,
      commission10_5: 0,
      vatOnCommission21: 0,
      vatOnCommission10_5: 0,
      totalCommissionWithoutVAT: 0,
      cardInterestRaw: 0,
      transferFeesAmount: 0,
      extra_costs_amount: 0,
      extra_taxes_amount: 0,
    };

    return summaryServices.reduce<Record<string, typeof zero>>((acc, s) => {
      const c = (s.currency || "ARS").toUpperCase();
      if (!acc[c]) acc[c] = { ...zero };
      const t = acc[c];

      t.sale_price += toNumber(s.sale_price);
      t.cost_price += toNumber(s.cost_price);
      t.tax_21 += toNumber(s.tax_21);
      t.tax_105 += toNumber(s.tax_105);
      t.exempt += toNumber(s.exempt);
      t.other_taxes += toNumber(s.other_taxes);
      t.taxableCardInterest += toNumber(s.taxableCardInterest);
      t.vatOnCardInterest += toNumber(s.vatOnCardInterest);
      t.nonComputable += toNumber(s.nonComputable);
      t.taxableBase21 += toNumber(s.taxableBase21);
      t.taxableBase10_5 += toNumber(s.taxableBase10_5);
      t.commissionExempt += toNumber(s.commissionExempt);
      t.commission21 += toNumber(s.commission21);
      t.commission10_5 += toNumber(s.commission10_5);
      t.vatOnCommission21 += toNumber(s.vatOnCommission21);
      t.vatOnCommission10_5 += toNumber(s.vatOnCommission10_5);
      t.totalCommissionWithoutVAT += toNumber(s.totalCommissionWithoutVAT);
      t.extra_costs_amount += toNumber(s.extra_costs_amount);
      t.extra_taxes_amount += toNumber(s.extra_taxes_amount);

      const split =
        toNumber(s.taxableCardInterest) + toNumber(s.vatOnCardInterest);
      if (split <= 0) {
        t.cardInterestRaw += toNumber(s.card_interest);
      }

      const pct =
        typeof s.transfer_fee_pct === "number" &&
        Number.isFinite(s.transfer_fee_pct)
          ? s.transfer_fee_pct
          : transferFeePct;
      const feeAmount =
        Number.isFinite(s.transfer_fee_amount) && s.transfer_fee_amount > 0
          ? s.transfer_fee_amount
          : toNumber(s.sale_price) * pct;
      t.transferFeesAmount += feeAmount;

      return acc;
    }, {});
  }, [summaryServices, transferFeePct]);

  const summaryCurrencies = useMemo(() => {
    const set = new Set<string>();
    summaryServices.forEach((s) =>
      set.add((s.currency || "ARS").toUpperCase()),
    );
    if (set.size === 0) set.add("ARS");
    return Array.from(set);
  }, [summaryServices]);

  const buildClientIds = async () => {
    if (!token) throw new Error("Sin sesión");
    const idMap = new Map<string, number>();
    for (const client of clients) {
      if (client.kind === "existing") {
        idMap.set(client.id, client.existingId);
        continue;
      }
      const missing = missingClientFields(client);
      if (missing.length) {
        throw new Error(`Pax incompleto: ${missing.join(", ")}`);
      }

      const res = await authFetch(
        "/api/clients",
        {
          method: "POST",
          body: JSON.stringify({
            first_name: client.first_name,
            last_name: client.last_name,
            phone: client.phone,
            birth_date: client.birth_date,
            nationality: client.nationality,
            gender: client.gender,
            dni_number: client.dni_number,
            passport_number: client.passport_number,
            email: client.email,
            address: client.address,
            postal_code: client.postal_code,
            locality: client.locality,
            company_name: client.company_name,
            commercial_address: client.commercial_address,
            tax_id: client.tax_id,
          }),
        },
        token,
      );

      if (!res.ok) {
        let msg = "Error al crear pax.";
        try {
          const err = await res.json();
          if (err?.error) msg = String(err.error);
        } catch {
          // ignore
        }
        throw new Error(msg);
      }
      const created = (await res.json()) as Client;
      idMap.set(client.id, created.id_client);
    }
    return idMap;
  };

  const validateFacturaA = async (titularLocalId: string) => {
    if (booking.invoice_type !== "Factura A") return true;
    const titular = clients.find((c) => c.id === titularLocalId);
    if (!titular) {
      toast.error("Seleccioná un titular válido.");
      return false;
    }
    if (titular.kind === "new") {
      const missing = [];
      if (!titular.company_name.trim()) missing.push("Razón social");
      if (!titular.commercial_address.trim())
        missing.push("Domicilio comercial");
      if (!titular.email.trim()) missing.push("Email");
      if (!titular.tax_id.trim()) missing.push("CUIT");
      if (missing.length) {
        toast.error(
          `Para Factura A faltan datos del titular: ${missing.join(", ")}.`,
        );
        return false;
      }
      return true;
    }
    if (!token) return false;
    const existingId = titular.existingId;
    const res = await authFetch(
      `/api/clients/${existingId}`,
      { cache: "no-store" },
      token,
    );
    if (!res.ok) {
      toast.error("No se pudo validar el titular.");
      return false;
    }
    const data = (await res.json()) as Client;
    if (
      !data.company_name?.trim() ||
      !data.commercial_address?.trim() ||
      !data.email?.trim() ||
      !data.tax_id?.trim()
    ) {
      toast.error(
        "Para Factura A, el titular debe tener Razón Social, Domicilio Comercial, Email y CUIT.",
      );
      return false;
    }
    return true;
  };

  const handleConfirm = async () => {
    if (missingSummary.length > 0) {
      toast.error("Hay datos pendientes antes de confirmar.");
      return;
    }
    if (!titularId || !profile?.id_user) {
      toast.error("Titular o perfil inválido.");
      return;
    }
    if (!token) {
      toast.error("Sesión vencida.");
      return;
    }
    setSaving(true);
    try {
      const facturaOk = await validateFacturaA(titularId);
      if (!facturaOk) {
        setSaving(false);
        return;
      }
      const idMap = await buildClientIds();
      const titularBackendId = idMap.get(titularId);
      if (!titularBackendId) throw new Error("Titular inválido.");
      const companions = clients
        .filter((c) => c.id !== titularId)
        .map((c) => idMap.get(c.id))
        .filter((id): id is number => typeof id === "number");

      const payload = {
        clientStatus: booking.clientStatus,
        operatorStatus: booking.operatorStatus,
        status: booking.status,
        details: booking.details,
        invoice_type: booking.invoice_type,
        invoice_observation:
          booking.invoice_observation.trim() || "Sin observaciones",
        observation: booking.observation,
        titular_id: titularBackendId,
        departure_date: booking.departure_date,
        return_date: booking.return_date,
        pax_count: 1 + companions.length,
        clients_ids: companions,
        id_user: profile.id_user,
      };

      const bookingRes = await authFetch(
        "/api/bookings",
        { method: "POST", body: JSON.stringify(payload) },
        token,
      );

      if (!bookingRes.ok) {
        let msg = "Error al crear la reserva.";
        try {
          const err = await bookingRes.json();
          if (err?.error) msg = String(err.error);
        } catch {
          // ignore
        }
        throw new Error(msg);
      }

      const createdBooking = (await bookingRes.json()) as {
        id_booking: number;
      };

      if (useBookingSaleTotal) {
        const saleTotals = normalizeSaleTotals(bookingSaleTotals);
        if (Object.keys(saleTotals).length > 0) {
          const updateRes = await authFetch(
            `/api/bookings/${createdBooking.id_booking}`,
            {
              method: "PUT",
              body: JSON.stringify({
                ...payload,
                sale_totals: saleTotals,
                clients_ids: companions,
              }),
            },
            token,
          );
          if (!updateRes.ok) {
            toast.error("No se pudo guardar la venta general.");
          }
        }
      }

      for (const service of services) {
        const transferPct = Number.isFinite(service.transfer_fee_pct)
          ? service.transfer_fee_pct
          : transferFeePct || 0.024;
        const transferAmount =
          service.transfer_fee_amount ||
          toNumber(service.sale_price) * transferPct;
        const adjustments =
          adjustmentsByServiceId.get(service.id) ?? EMPTY_ADJUSTMENTS;
        const servicePayload = {
          type: service.type,
          description: service.description,
          sale_price: toNumber(service.sale_price),
          cost_price: toNumber(service.cost_price),
          tax_21: toNumber(service.tax_21),
          tax_105: toNumber(service.tax_105),
          exempt: toNumber(service.exempt),
          other_taxes: toNumber(service.other_taxes),
          card_interest: toNumber(service.card_interest),
          card_interest_21: toNumber(service.card_interest_21),
          taxableCardInterest: service.taxableCardInterest,
          vatOnCardInterest: service.vatOnCardInterest,
          nonComputable: service.nonComputable,
          taxableBase21: service.taxableBase21,
          taxableBase10_5: service.taxableBase10_5,
          commissionExempt: service.commissionExempt,
          commission21: service.commission21,
          commission10_5: service.commission10_5,
          vatOnCommission21: service.vatOnCommission21,
          vatOnCommission10_5: service.vatOnCommission10_5,
          totalCommissionWithoutVAT: service.totalCommissionWithoutVAT,
          impIVA: service.impIVA,
          transfer_fee_pct: transferPct,
          transfer_fee_amount: transferAmount,
          extra_costs_amount: adjustments.totalCosts,
          extra_taxes_amount: adjustments.totalTaxes,
          extra_adjustments: adjustments.items,
          destination: service.destination,
          reference: service.reference,
          currency: service.currency,
          departure_date: service.departure_date,
          return_date: service.return_date,
          id_operator: service.id_operator,
          booking_id: createdBooking.id_booking,
        };

        const res = await authFetch(
          "/api/services",
          { method: "POST", body: JSON.stringify(servicePayload) },
          token,
        );
        if (!res.ok) {
          let msg = "Error al crear un servicio.";
          try {
            const err = await res.json();
            if (err?.error) msg = String(err.error);
          } catch {
            // ignore
          }
          throw new Error(msg);
        }
      }

      if (typeof window !== "undefined") {
        window.localStorage.removeItem(DRAFT_KEY);
      }

      toast.success("Carga rápida confirmada. Abriendo la reserva...");
      router.push(`/bookings/services/${createdBooking.id_booking}`);
    } catch (err) {
      console.error("❌ Error confirmando carga rápida:", err);
      toast.error(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  };

  const clientCountLabel = `${clients.length} ${clients.length === 1 ? "pax" : "pasajeros"}`;
  const serviceCountLabel = `${services.length} servicio${services.length === 1 ? "" : "s"}`;

  const titularLabel = useMemo(() => {
    const target = clients.find((c) => c.id === titularId);
    if (!target) return "Sin titular";
    if (target.kind === "existing") {
      return `${target.snapshot.first_name} ${target.snapshot.last_name}`;
    }
    return `${target.first_name || "Titular"} ${target.last_name || ""}`.trim();
  }, [clients, titularId]);

  const operatorMap = useMemo(() => {
    const map = new Map<number, Operator>();
    operators.forEach((op) => map.set(op.id_operator, op));
    return map;
  }, [operators]);

  return (
    <ProtectedRoute>
      <section className="space-y-8 text-sky-950 dark:text-white">
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="rounded-3xl text-sky-950 dark:text-white"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.3em] text-sky-700/70 dark:text-white/60">
                carga rápida
              </p>
              <h1 className="text-3xl font-semibold">
                Crea pasajeros, reserva y servicios en una sola pasada
              </h1>
              <p className="max-w-2xl text-sm text-sky-900/70 dark:text-white/70">
                Flujo corto para dar de alta pasajeros, armar la reserva y, si
                querés, cargar servicios. Todo queda guardado como borrador si
                cerrás la pestaña.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={`${PILL_BASE} ${PILL_SKY}`}>
                {clientCountLabel}
              </span>
              <span className={`${PILL_BASE} ${PILL_SKY}`}>
                {serviceCountLabel}
              </span>
              <span className={`${PILL_BASE} ${PILL_OK}`}>
                Titular: {titularLabel}
              </span>
            </div>
          </div>
        </motion.header>

        {draftStatus === "available" && storedDraft && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`${PANEL} flex flex-col gap-4 md:flex-row md:items-center md:justify-between`}
          >
            <div>
              <p className="text-sm font-semibold">
                Encontramos un borrador reciente.
              </p>
              <p className="text-xs text-sky-950/70 dark:text-white/60">
                Última actualización: {formatDate(lastSavedAt || undefined)}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className={BTN_EMERALD}
                onClick={recoverDraft}
              >
                <IconCheck className="size-4" />
                Recuperar
              </button>
              <button type="button" className={BTN_ROSE} onClick={discardDraft}>
                <IconTrash className="size-4" />
                Descartar
              </button>
            </div>
          </motion.div>
        )}

        <div className={PANEL}>
          <div className="flex flex-wrap items-center gap-3">
            {STEP_LABELS.map((item) => {
              const active = step === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => goToStep(item.id)}
                  className={`cursor-pointer rounded-full px-4 py-1 text-xs font-semibold transition ${
                    active
                      ? "border border-sky-300/60 bg-sky-200/70 text-sky-950 dark:border-sky-300/40 dark:bg-sky-500/30 dark:text-white"
                      : "border border-sky-200/40 bg-white/60 text-sky-900/70 hover:bg-white/80 dark:border-white/10 dark:bg-white/10 dark:text-white/60"
                  }`}
                >
                  Paso {item.id}: {item.label}
                </button>
              );
            })}
            <div className="ml-auto flex items-center gap-2 text-xs text-sky-900/70 dark:text-white/60">
              <span>Guardado:</span>
              <span>
                {lastSavedAt ? formatDate(lastSavedAt) : "sin borrador"}
              </span>
            </div>
          </div>
        </div>

        {loadingProfile ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step-1"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="space-y-8"
              >
                <div className={PANEL}>
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold">
                        Paso 1 · Pasajeros
                      </h2>
                      <p className="text-sm text-sky-900/70 dark:text-white/70">
                        Sumá pasajeros nuevos o existentes, elegí un titular y
                        dejá listo el grupo.
                      </p>
                    </div>
                  </div>

                  <div className="mt-8 space-y-4">
                    <div className={`${STACK_SKY} bg-sky-100/5`}>
                      <h3 className="text-sm font-semibold">
                        Agregar pax existente
                      </h3>
                      <p className="text-xs text-sky-900/60 dark:text-white/60">
                        Buscá por nombre, documento o número de pax.
                      </p>
                      <div className="mt-3">
                        <ClientPicker
                          key={pickerKey}
                          token={token}
                          label="Pax existente"
                          placeholder="Buscar por DNI, Pasaporte, CUIT o nombre..."
                          valueId={null}
                          excludeIds={clients
                            .filter((c) => c.kind === "existing")
                            .map((c) => c.existingId)}
                          onSelect={addExistingClient}
                          onClear={() => undefined}
                        />
                      </div>
                    </div>

                    <div className={`${STACK_EMERALD} bg-emerald-100/5`}>
                      <h3 className="text-sm font-semibold">
                        ¿Pax nuevo? Cargalo acá
                      </h3>
                      <p className="mt-2 text-xs text-emerald-900/70 dark:text-emerald-50/70">
                        Sumá un pasajero nuevo y completá sus datos en el
                        formulario de abajo.
                      </p>
                      <button
                        type="button"
                        className={`${BTN_EMERALD} mt-4 w-full justify-center py-3 text-base`}
                        onClick={addNewClient}
                      >
                        <IconPlus className="size-5" />
                        Nuevo pax
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-6">
                  {clients.length === 0 && (
                    <div className={STACK_ROSE}>
                      <p className="text-sm font-semibold">
                        Todavía no hay pasajeros cargados.
                      </p>
                      <p className="text-xs text-sky-900/70 dark:text-white/70">
                        Agregá al menos un pax para avanzar.
                      </p>
                    </div>
                  )}

                  {clients.map((client, index) => {
                    const isTitular = client.id === titularId;
                    const isComplete = isClientComplete(client);
                    const missing =
                      client.kind === "new" ? missingClientFields(client) : [];
                    return (
                      <motion.div
                        key={client.id}
                        layout
                        className="relative isolate z-0 overflow-visible rounded-3xl border border-white/10 bg-white/60 p-6 shadow-sm shadow-sky-950/10 backdrop-blur focus-within:z-40 dark:border-white/10 dark:bg-white/10"
                      >
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="text-sm font-semibold">
                              Pax {index + 1}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <span
                                className={`${PILL_BASE} ${
                                  isComplete ? PILL_OK : PILL_WARN
                                }`}
                              >
                                {isComplete ? "Completo" : "Incompleto"}
                              </span>
                              {isTitular && (
                                <span className={`${PILL_BASE} ${PILL_SKY}`}>
                                  Titular
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {!isTitular && (
                              <button
                                type="button"
                                className={BTN_EMERALD}
                                onClick={() => setTitularId(client.id)}
                              >
                                <IconCheck className="size-4" />
                                Marcar titular
                              </button>
                            )}
                            <button
                              type="button"
                              className={BTN_ROSE}
                              onClick={() => removeClient(client.id)}
                            >
                              <IconTrash className="size-4" />
                              Quitar
                            </button>
                          </div>
                        </div>

                        {client.kind === "existing" ? (
                          <div className="mt-4 grid gap-2 text-sm text-sky-900/70 dark:text-white/70">
                            <p>
                              {client.snapshot.first_name}{" "}
                              {client.snapshot.last_name}
                            </p>
                            <p>
                              DNI: {client.snapshot.dni_number || "-"} ·
                              Pasaporte:{" "}
                              {client.snapshot.passport_number || "-"}
                            </p>
                            <p>Email: {client.snapshot.email || "-"}</p>
                          </div>
                        ) : (
                          <div className="mt-6 grid gap-6">
                            <div className={SUBCARD}>
                              <p className="text-[11px] uppercase tracking-[0.25em] text-sky-900/60 dark:text-white/60">
                                Datos personales
                              </p>
                              <div className="mt-4 grid gap-4 md:grid-cols-3">
                                <div>
                                  <FieldLabel
                                    htmlFor={`first-${client.id}`}
                                    required
                                  >
                                    Nombre
                                  </FieldLabel>
                                  <input
                                    id={`first-${client.id}`}
                                    value={client.first_name}
                                    onChange={(e) =>
                                      updateClientField(
                                        client.id,
                                        "first_name",
                                        e.target.value,
                                      )
                                    }
                                    className={INPUT}
                                    placeholder="Ej: Juan"
                                  />
                                </div>
                                <div>
                                  <FieldLabel
                                    htmlFor={`last-${client.id}`}
                                    required
                                  >
                                    Apellido
                                  </FieldLabel>
                                  <input
                                    id={`last-${client.id}`}
                                    value={client.last_name}
                                    onChange={(e) =>
                                      updateClientField(
                                        client.id,
                                        "last_name",
                                        e.target.value,
                                      )
                                    }
                                    className={INPUT}
                                    placeholder="Ej: Pérez"
                                  />
                                </div>
                                <div>
                                  <FieldLabel
                                    htmlFor={`phone-${client.id}`}
                                    required
                                  >
                                    Teléfono
                                  </FieldLabel>
                                  <input
                                    id={`phone-${client.id}`}
                                    value={client.phone}
                                    onChange={(e) =>
                                      updateClientField(
                                        client.id,
                                        "phone",
                                        e.target.value,
                                      )
                                    }
                                    className={INPUT}
                                    placeholder="Ej: 11 2345-6789"
                                  />
                                </div>
                                <div>
                                  <FieldLabel
                                    htmlFor={`birth-${client.id}`}
                                    required
                                  >
                                    Nacimiento
                                  </FieldLabel>
                                  <input
                                    id={`birth-${client.id}`}
                                    type="date"
                                    value={client.birth_date}
                                    onChange={(e) =>
                                      updateClientField(
                                        client.id,
                                        "birth_date",
                                        e.target.value,
                                      )
                                    }
                                    className={`${INPUT} cursor-pointer`}
                                    placeholder="aaaa-mm-dd"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <FieldLabel required>Nacionalidad</FieldLabel>
                                  <DestinationPicker
                                    type="country"
                                    multiple={false}
                                    value={null}
                                    onChange={(val) =>
                                      handleNationalitySelect(client.id, val)
                                    }
                                    placeholder="Ej.: Argentina, Uruguay…"
                                    includeDisabled={true}
                                    className="relative z-30 [&>label]:hidden"
                                  />
                                  {client.nationality ? (
                                    <p className="text-xs text-sky-900/70 dark:text-white/70">
                                      Guardará: <b>{client.nationality}</b>
                                    </p>
                                  ) : (
                                    <p className="text-xs text-rose-600">
                                      Obligatorio
                                    </p>
                                  )}
                                </div>
                                <div>
                                  <FieldLabel
                                    htmlFor={`gender-${client.id}`}
                                    required
                                  >
                                    Género
                                  </FieldLabel>
                                  <select
                                    id={`gender-${client.id}`}
                                    value={client.gender}
                                    onChange={(e) =>
                                      updateClientField(
                                        client.id,
                                        "gender",
                                        e.target.value,
                                      )
                                    }
                                    className={`${INPUT} cursor-pointer`}
                                  >
                                    <option value="">Seleccionar género</option>
                                    <option value="Masculino">Masculino</option>
                                    <option value="Femenino">Femenino</option>
                                    <option value="Otro">Otro</option>
                                  </select>
                                </div>
                              </div>
                            </div>

                            <div className={SUBCARD}>
                              <div className="flex flex-col gap-1">
                                <p className="text-[11px] uppercase tracking-[0.25em] text-sky-900/60 dark:text-white/60">
                                  Documentación y contacto
                                </p>
                                <p className="text-xs text-sky-900/60 dark:text-white/60">
                                  <span className="text-rose-600">*</span> Cargá
                                  DNI, Pasaporte o CUIT.
                                </p>
                              </div>
                              <div className="mt-4 grid gap-4 md:grid-cols-3">
                                <div>
                                  <FieldLabel htmlFor={`dni-${client.id}`}>
                                    DNI
                                  </FieldLabel>
                                  <input
                                    id={`dni-${client.id}`}
                                    value={client.dni_number}
                                    onChange={(e) =>
                                      updateClientField(
                                        client.id,
                                        "dni_number",
                                        e.target.value,
                                      )
                                    }
                                    className={INPUT}
                                    placeholder="Ej: 12345678"
                                  />
                                </div>
                                <div>
                                  <FieldLabel htmlFor={`pass-${client.id}`}>
                                    Pasaporte
                                  </FieldLabel>
                                  <input
                                    id={`pass-${client.id}`}
                                    value={client.passport_number}
                                    onChange={(e) =>
                                      updateClientField(
                                        client.id,
                                        "passport_number",
                                        e.target.value,
                                      )
                                    }
                                    className={INPUT}
                                    placeholder="Ej: AA123456"
                                  />
                                </div>
                                <div>
                                  <FieldLabel htmlFor={`email-${client.id}`}>
                                    Email
                                  </FieldLabel>
                                  <input
                                    id={`email-${client.id}`}
                                    value={client.email}
                                    onChange={(e) =>
                                      updateClientField(
                                        client.id,
                                        "email",
                                        e.target.value,
                                      )
                                    }
                                    className={INPUT}
                                    placeholder="Ej: pax@mail.com"
                                  />
                                </div>
                              </div>
                            </div>

                            <div className={SUBCARD}>
                              <p className="text-[11px] uppercase tracking-[0.25em] text-sky-900/60 dark:text-white/60">
                                Datos fiscales (si aplica)
                              </p>
                              <div className="mt-4 grid gap-4 md:grid-cols-3">
                                <div>
                                  <FieldLabel htmlFor={`tax-${client.id}`}>
                                    CUIT / RUT
                                  </FieldLabel>
                                  <input
                                    id={`tax-${client.id}`}
                                    value={client.tax_id}
                                    onChange={(e) =>
                                      updateClientField(
                                        client.id,
                                        "tax_id",
                                        e.target.value,
                                      )
                                    }
                                    className={INPUT_SOFT}
                                    placeholder="Ej: 30-12345678-9"
                                  />
                                </div>
                                <div>
                                  <FieldLabel htmlFor={`company-${client.id}`}>
                                    Razón social
                                  </FieldLabel>
                                  <input
                                    id={`company-${client.id}`}
                                    value={client.company_name}
                                    onChange={(e) =>
                                      updateClientField(
                                        client.id,
                                        "company_name",
                                        e.target.value,
                                      )
                                    }
                                    className={INPUT_SOFT}
                                    placeholder="Ej: Ofistur SRL"
                                  />
                                </div>
                                <div>
                                  <FieldLabel htmlFor={`address-${client.id}`}>
                                    Domicilio comercial (Factura)
                                  </FieldLabel>
                                  <input
                                    id={`address-${client.id}`}
                                    value={client.commercial_address}
                                    onChange={(e) =>
                                      updateClientField(
                                        client.id,
                                        "commercial_address",
                                        e.target.value,
                                      )
                                    }
                                    className={INPUT_SOFT}
                                    placeholder="Ej: Calle 123, CABA"
                                  />
                                </div>
                                <div>
                                  <FieldLabel htmlFor={`home-${client.id}`}>
                                    Dirección particular
                                  </FieldLabel>
                                  <input
                                    id={`home-${client.id}`}
                                    value={client.address}
                                    onChange={(e) =>
                                      updateClientField(
                                        client.id,
                                        "address",
                                        e.target.value,
                                      )
                                    }
                                    className={INPUT_SOFT}
                                    placeholder="Ej: Calle 123, CABA"
                                  />
                                </div>
                                <div>
                                  <FieldLabel htmlFor={`locality-${client.id}`}>
                                    Localidad / Ciudad
                                  </FieldLabel>
                                  <input
                                    id={`locality-${client.id}`}
                                    value={client.locality}
                                    onChange={(e) =>
                                      updateClientField(
                                        client.id,
                                        "locality",
                                        e.target.value,
                                      )
                                    }
                                    className={INPUT_SOFT}
                                    placeholder="Ej: San Miguel"
                                  />
                                </div>
                                <div>
                                  <FieldLabel htmlFor={`postal-${client.id}`}>
                                    Código postal
                                  </FieldLabel>
                                  <input
                                    id={`postal-${client.id}`}
                                    value={client.postal_code}
                                    onChange={(e) =>
                                      updateClientField(
                                        client.id,
                                        "postal_code",
                                        e.target.value,
                                      )
                                    }
                                    className={INPUT_SOFT}
                                    placeholder="Ej: 1663"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {client.kind === "new" && missing.length > 0 && (
                          <p className="mt-3 text-xs text-amber-700">
                            Completar: {missing.join(", ")}.
                          </p>
                        )}
                      </motion.div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    className={BTN_EMERALD}
                    onClick={() => goToStep(2)}
                  >
                    Siguiente: Reserva
                  </button>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step-2"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="space-y-8"
              >
                <div className={PANEL}>
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold">
                        Paso 2 · Reserva
                      </h2>
                      <p className="text-sm text-sky-900/70 dark:text-white/70">
                        Datos básicos, fechas y facturación.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`${PILL_BASE} ${PILL_SKY}`}>
                        Pax: {clients.length}
                      </span>
                      <span className={`${PILL_BASE} ${PILL_SKY}`}>
                        Titular: {titularLabel}
                      </span>
                    </div>
                  </div>

                  <div className="mt-8 grid gap-6 lg:grid-cols-2">
                    <div className={SUBCARD}>
                      <p className="text-[11px] uppercase tracking-[0.25em] text-sky-900/60 dark:text-white/60">
                        Datos de reserva
                      </p>
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div className="md:col-span-2">
                          <FieldLabel htmlFor="booking-details" required>
                            Detalle de la reserva
                          </FieldLabel>
                          <input
                            id="booking-details"
                            value={booking.details}
                            onChange={(e) =>
                              updateBookingField("details", e.target.value)
                            }
                            className={INPUT}
                            placeholder="Ej: Paquete Caribe + hotel"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <FieldLabel htmlFor="booking-observation">
                            Observación interna
                          </FieldLabel>
                          <input
                            id="booking-observation"
                            value={booking.observation}
                            onChange={(e) =>
                              updateBookingField("observation", e.target.value)
                            }
                            className={INPUT}
                            placeholder="Notas internas, pedidos especiales..."
                          />
                        </div>
                        <div>
                          <FieldLabel htmlFor="booking-from" required>
                            Fecha salida
                          </FieldLabel>
                          <input
                            id="booking-from"
                            type="date"
                            value={booking.departure_date}
                            onChange={(e) =>
                              updateBookingField(
                                "departure_date",
                                e.target.value,
                              )
                            }
                            className={`${INPUT} cursor-pointer`}
                            placeholder="aaaa-mm-dd"
                          />
                        </div>
                        <div>
                          <FieldLabel htmlFor="booking-to" required>
                            Fecha regreso
                          </FieldLabel>
                          <input
                            id="booking-to"
                            type="date"
                            value={booking.return_date}
                            onChange={(e) =>
                              updateBookingField("return_date", e.target.value)
                            }
                            className={`${INPUT} cursor-pointer`}
                            placeholder="aaaa-mm-dd"
                          />
                        </div>
                      </div>
                    </div>

                    <div className={SUBCARD}>
                      <p className="text-[11px] uppercase tracking-[0.25em] text-sky-900/60 dark:text-white/60">
                        Facturación
                      </p>
                      <div className="mt-4 grid gap-4">
                        <div>
                          <FieldLabel htmlFor="booking-invoice" required>
                            Tipo de factura
                          </FieldLabel>
                          <select
                            id="booking-invoice"
                            value={booking.invoice_type}
                            onChange={(e) =>
                              updateBookingField("invoice_type", e.target.value)
                            }
                            className={`${INPUT} cursor-pointer`}
                          >
                            <option value="">Seleccionar tipo</option>
                            {INVOICE_TYPES.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <FieldLabel htmlFor="booking-invoice-note">
                            Observación factura
                          </FieldLabel>
                          <input
                            id="booking-invoice-note"
                            value={booking.invoice_observation}
                            onChange={(e) =>
                              updateBookingField(
                                "invoice_observation",
                                e.target.value,
                              )
                            }
                            className={INPUT}
                            placeholder="Ej: Facturar al pax N° 342"
                          />
                        </div>
                        <p className="text-xs text-sky-900/60 dark:text-white/60">
                          Los estados de reserva, pax y operador se ajustan
                          luego dentro de la reserva.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              <div className="flex flex-wrap justify-between gap-3">
                <button
                  type="button"
                  className={BTN_SKY}
                  onClick={() => goToStep(1)}
                >
                  <IconArrowLeft className="size-4" />
                  Volver
                </button>
                <button
                  type="button"
                  className={BTN_EMERALD}
                  onClick={() => goToStep(3)}
                >
                  Siguiente: Servicios
                </button>
              </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step-3"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="space-y-8"
              >
                <div className={PANEL}>
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold">
                        Paso 3 · Servicios
                      </h2>
                      <p className="text-sm text-sky-900/70 dark:text-white/70">
                        Opcional: agregá servicios y revisá el desglose.
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-sky-900/70 dark:text-white/60">
                        {canManualOverride && (
                          <>
                            <button
                              type="button"
                              className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold transition ${
                                !manualOverride
                                  ? "border-sky-300/60 bg-sky-200/70 text-sky-950 dark:border-sky-300/40 dark:bg-sky-500/30 dark:text-white"
                                  : "border-sky-200/40 bg-white/60 text-sky-900/70 hover:bg-white/80 dark:border-white/10 dark:bg-white/10 dark:text-white/60"
                              }`}
                              onClick={() => setManualOverride(false)}
                            >
                              Automático
                            </button>
                            <button
                              type="button"
                              className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold transition ${
                                manualOverride
                                  ? "border-amber-300/70 bg-amber-200/70 text-amber-950 dark:border-amber-300/40 dark:bg-amber-500/30 dark:text-amber-50"
                                  : "border-amber-200/40 bg-white/60 text-amber-900/70 hover:bg-white/80 dark:border-white/10 dark:bg-white/10 dark:text-white/60"
                              }`}
                              onClick={() => setManualOverride(true)}
                            >
                              Manual
                            </button>
                          </>
                        )}
                        <span className={canManualOverride ? "ml-2" : ""}>
                          Costos Bancarios: {(transferFeePct * 100).toFixed(2)}%
                        </span>
                        {calcConfigLoading && (
                          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                            <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            Cargando config
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={BTN_SKY}
                        onClick={addService}
                      >
                        <IconPlus className="size-4" />
                        Agregar servicio
                      </button>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4">
                    {(canOverrideSaleTotal || useBookingSaleTotal) && (
                      <div className={SUBCARD}>
                        <p className="text-[11px] uppercase tracking-[0.25em] text-sky-900/60 dark:text-white/60">
                          Venta general
                        </p>
                        {canOverrideSaleTotal && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold transition ${
                                useBookingSaleTotal
                                  ? "border-emerald-300/60 bg-emerald-200/70 text-emerald-950 dark:border-emerald-300/40 dark:bg-emerald-500/30 dark:text-emerald-50"
                                  : "border-emerald-200/40 bg-white/60 text-emerald-900/70 hover:bg-white/80 dark:border-white/10 dark:bg-white/10 dark:text-white/60"
                              }`}
                              onClick={() => setUseBookingSaleTotal(true)}
                            >
                              Activar
                            </button>
                            <button
                              type="button"
                              className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold transition ${
                                !useBookingSaleTotal
                                  ? "border-sky-300/60 bg-sky-200/70 text-sky-950 dark:border-sky-300/40 dark:bg-sky-500/30 dark:text-white"
                                  : "border-sky-200/40 bg-white/60 text-sky-900/70 hover:bg-white/80 dark:border-white/10 dark:bg-white/10 dark:text-white/60"
                              }`}
                              onClick={() => setUseBookingSaleTotal(false)}
                            >
                              Por servicio
                            </button>
                          </div>
                        )}

                        {useBookingSaleTotal && (
                          <div className="mt-5 grid gap-4">
                            {summaryCurrencies.map((cur) => (
                              <div key={cur}>
                                <FieldLabel
                                  htmlFor={`booking-sale-${cur}`}
                                  required
                                >
                                  Venta total {cur}
                                </FieldLabel>
                                <input
                                  id={`booking-sale-${cur}`}
                                  type="number"
                                  value={bookingSaleTotals[cur] || ""}
                                  onChange={(e) =>
                                    updateBookingSaleTotal(cur, e.target.value)
                                  }
                                  className={INPUT}
                                  placeholder={`0.00 ${cur}`}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {loadingOperators ? (
                      <div className="flex items-center gap-3 text-sm text-sky-900/70 dark:text-white/70">
                        <Spinner />
                        Cargando operadores...
                      </div>
                    ) : (
                      <div className="grid gap-6">
                        {services.length === 0 && (
                          <div className={STACK_SKY}>
                            <p className="text-sm font-semibold">
                              No hay servicios cargados.
                            </p>
                            <p className="text-xs text-sky-900/70 dark:text-white/70">
                              Podés confirmar la reserva sin servicios y
                              agregarlos después.
                            </p>
                          </div>
                        )}
                        {services.map((service, idx) => {
                          const ready = isServiceComplete(
                            service,
                            useBookingSaleTotal,
                          );
                          const saleValue = toNumber(service.sale_price);
                          const costValue = toNumber(service.cost_price);
                          const showBreakdown =
                            saleValue > 0 && Number.isFinite(costValue);
                          const adjustmentTotals =
                            adjustmentsByServiceId.get(service.id) ??
                            EMPTY_ADJUSTMENTS;
                          const transferPct = Number.isFinite(
                            service.transfer_fee_pct,
                          )
                            ? service.transfer_fee_pct
                            : transferFeePct;
                          const transferAmount =
                            Number.isFinite(service.transfer_fee_amount) &&
                            service.transfer_fee_amount > 0
                              ? service.transfer_fee_amount
                              : saleValue * transferPct;
                          const baseCommission = Number(
                            service.totalCommissionWithoutVAT ?? 0,
                          );
                          const netCommission =
                            baseCommission > 0
                              ? Math.max(
                                  baseCommission -
                                    transferAmount -
                                    adjustmentTotals.total,
                                  0,
                                )
                              : null;
                          return (
                            <motion.div
                              key={service.id}
                              layout
                              className="relative isolate z-0 overflow-visible rounded-3xl border border-white/10 bg-white/60 p-6 shadow-sm shadow-sky-950/10 backdrop-blur focus-within:z-40 dark:border-white/10 dark:bg-white/10"
                            >
                              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                <div>
                                  <p className="text-sm font-semibold">
                                    Servicio {idx + 1}
                                  </p>
                                  <span
                                    className={`${PILL_BASE} ${
                                      ready ? PILL_OK : PILL_WARN
                                    } mt-2`}
                                  >
                                    {ready ? "Completo" : "Pendiente"}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className={BTN_ROSE}
                                  onClick={() => removeService(service.id)}
                                >
                                  <IconTrash className="size-4" />
                                  Quitar
                                </button>
                              </div>

                              <div className="mt-6 grid gap-6">
                                <div className={SUBCARD}>
                                <p className="text-[11px] uppercase tracking-[0.25em] text-sky-900/60 dark:text-white/60">
                                  Datos principales
                                </p>
                                <div className="mt-4 grid gap-4 md:grid-cols-3">
                                  <div>
                                    <FieldLabel
                                      htmlFor={`service-type-${service.id}`}
                                      required
                                    >
                                      Tipo
                                    </FieldLabel>
                                    <select
                                      id={`service-type-${service.id}`}
                                      value={service.type}
                                      onChange={(e) =>
                                        updateServiceField(
                                          service.id,
                                          "type",
                                          e.target.value,
                                        )
                                      }
                                      className={`${INPUT} cursor-pointer`}
                                      disabled={loadingServiceTypes}
                                      required
                                    >
                                      {loadingServiceTypes && (
                                        <option value="" disabled>
                                          Cargando tipos...
                                        </option>
                                      )}
                                      {!loadingServiceTypes &&
                                        serviceTypes.length === 0 && (
                                          <option value="" disabled>
                                            {serviceTypesError
                                              ? "Error al cargar tipos"
                                              : "Sin tipos disponibles"}
                                          </option>
                                        )}
                                      {!loadingServiceTypes &&
                                        serviceTypes.length > 0 && (
                                          <>
                                            <option value="" disabled>
                                              Seleccionar tipo
                                            </option>
                                            {serviceTypes.map((opt) => (
                                              <option
                                                key={opt.value}
                                                value={opt.value}
                                              >
                                                {opt.label}
                                              </option>
                                            ))}
                                          </>
                                        )}
                                      {service.type &&
                                        !serviceTypes.some(
                                          (opt) => opt.value === service.type,
                                        ) && (
                                          <option value={service.type}>
                                            {service.type} (no listado)
                                          </option>
                                        )}
                                    </select>
                                  </div>
                                  <div>
                                    <FieldLabel
                                      htmlFor={`service-op-${service.id}`}
                                      required
                                    >
                                      Operador
                                    </FieldLabel>
                                    <select
                                      id={`service-op-${service.id}`}
                                      value={service.id_operator}
                                      onChange={(e) =>
                                        updateServiceField(
                                          service.id,
                                          "id_operator",
                                          Number(e.target.value),
                                        )
                                      }
                                      className={`${INPUT} cursor-pointer`}
                                    >
                                      <option value={0}>
                                        Seleccionar operador
                                      </option>
                                      {operators.map((op) => (
                                        <option
                                          key={op.id_operator}
                                          value={op.id_operator}
                                        >
                                          {op.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <FieldLabel
                                      htmlFor={`service-currency-${service.id}`}
                                      required
                                    >
                                      Moneda
                                    </FieldLabel>
                                    <select
                                      id={`service-currency-${service.id}`}
                                      value={service.currency}
                                      onChange={(e) =>
                                        updateServiceField(
                                          service.id,
                                          "currency",
                                          e.target.value,
                                        )
                                      }
                                      className={`${INPUT} cursor-pointer`}
                                      disabled={loadingCurrencies}
                                    >
                                      {loadingCurrencies && (
                                        <>
                                          {service.currency && (
                                            <option value={service.currency}>
                                              {service.currency}
                                            </option>
                                          )}
                                          <option value="" disabled>
                                            Cargando monedas...
                                          </option>
                                        </>
                                      )}
                                      {!loadingCurrencies &&
                                        currencyOptions.map((code) => (
                                          <option key={code} value={code}>
                                            {code}
                                          </option>
                                        ))}
                                      {!loadingCurrencies &&
                                        service.currency &&
                                        !currencyOptions.includes(
                                          service.currency.toUpperCase(),
                                        ) && (
                                          <option value={service.currency}>
                                            {service.currency} (no listado)
                                          </option>
                                        )}
                                    </select>
                                  </div>
                                  <div>
                                    <FieldLabel
                                      htmlFor={`service-sale-${service.id}`}
                                      required={!useBookingSaleTotal}
                                    >
                                      Venta
                                    </FieldLabel>
                                    <input
                                      id={`service-sale-${service.id}`}
                                      type="number"
                                      value={service.sale_price}
                                      onChange={(e) =>
                                        updateServiceField(
                                          service.id,
                                          "sale_price",
                                          e.target.value,
                                        )
                                      }
                                      className={`${INPUT} disabled:cursor-not-allowed disabled:opacity-60`}
                                      placeholder="0.00"
                                      disabled={useBookingSaleTotal}
                                    />
                                  </div>
                                  <div>
                                    <FieldLabel
                                      htmlFor={`service-cost-${service.id}`}
                                      required
                                    >
                                      Costo
                                    </FieldLabel>
                                    <input
                                      id={`service-cost-${service.id}`}
                                      type="number"
                                      value={service.cost_price}
                                      onChange={(e) =>
                                        updateServiceField(
                                          service.id,
                                          "cost_price",
                                          e.target.value,
                                        )
                                      }
                                      className={INPUT}
                                      placeholder="0.00"
                                    />
                                  </div>
                                  <div>
                                    <FieldLabel
                                      htmlFor={`service-desc-${service.id}`}
                                    >
                                      Descripción
                                    </FieldLabel>
                                    <input
                                      id={`service-desc-${service.id}`}
                                      value={service.description}
                                      onChange={(e) =>
                                        updateServiceField(
                                          service.id,
                                          "description",
                                          e.target.value,
                                        )
                                      }
                                      className={INPUT}
                                      placeholder="Ej: Hotel + desayuno"
                                    />
                                  </div>
                                </div>
                              </div>

                              <div className={SUBCARD}>
                                <p className="text-[11px] uppercase tracking-[0.25em] text-sky-900/60 dark:text-white/60">
                                  Destino y fechas
                                </p>
                                <div className="mt-4 grid gap-4 md:grid-cols-3">
                                  <div className="space-y-2 md:col-span-2">
                                    <FieldLabel>Destino</FieldLabel>
                                    <DestinationPicker
                                      type="destination"
                                      multiple={false}
                                      value={null}
                                      onChange={(val) =>
                                        handleDestinationSelect(service.id, val)
                                      }
                                      placeholder="Ej.: París, Salta, Roma..."
                                      className="relative z-30 [&>label]:hidden"
                                    />
                                    {service.destination ? (
                                      <p className="text-xs text-sky-900/70 dark:text-white/70">
                                        Guardará: <b>{service.destination}</b>
                                      </p>
                                    ) : null}
                                  </div>
                                  <div>
                                    <FieldLabel
                                      htmlFor={`service-ref-${service.id}`}
                                    >
                                      Referencia
                                    </FieldLabel>
                                    <input
                                      id={`service-ref-${service.id}`}
                                      value={service.reference}
                                      onChange={(e) =>
                                        updateServiceField(
                                          service.id,
                                          "reference",
                                          e.target.value,
                                        )
                                      }
                                      className={INPUT}
                                      placeholder="Ej: ABC12345"
                                    />
                                  </div>
                                  <div>
                                    <FieldLabel
                                      htmlFor={`service-from-${service.id}`}
                                      required
                                    >
                                      Desde
                                    </FieldLabel>
                                    <input
                                      id={`service-from-${service.id}`}
                                      type="date"
                                      value={service.departure_date}
                                      onChange={(e) =>
                                        updateServiceField(
                                          service.id,
                                          "departure_date",
                                          e.target.value,
                                        )
                                      }
                                      className={`${INPUT} cursor-pointer`}
                                      placeholder="aaaa-mm-dd"
                                    />
                                  </div>
                                  <div>
                                    <FieldLabel
                                      htmlFor={`service-to-${service.id}`}
                                      required
                                    >
                                      Hasta
                                    </FieldLabel>
                                    <input
                                      id={`service-to-${service.id}`}
                                      type="date"
                                      value={service.return_date}
                                      onChange={(e) =>
                                        updateServiceField(
                                          service.id,
                                          "return_date",
                                          e.target.value,
                                        )
                                      }
                                      className={`${INPUT} cursor-pointer`}
                                      placeholder="aaaa-mm-dd"
                                    />
                                  </div>
                                </div>
                              </div>

                              {manualMode ? (
                                <div className={SUBCARD}>
                                  <p className="text-[11px] uppercase tracking-[0.25em] text-sky-900/60 dark:text-white/60">
                                    Impuestos (manual)
                                  </p>
                                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                                    <div>
                                      <FieldLabel
                                        htmlFor={`service-tax-${service.id}`}
                                      >
                                        Impuestos
                                      </FieldLabel>
                                      <input
                                        id={`service-tax-${service.id}`}
                                        type="number"
                                        value={service.other_taxes}
                                        onChange={(e) =>
                                          updateServiceField(
                                            service.id,
                                            "other_taxes",
                                            e.target.value,
                                          )
                                        }
                                        className={INPUT}
                                        placeholder="0.00"
                                      />
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className={SUBCARD}>
                                    <p className="text-[11px] uppercase tracking-[0.25em] text-sky-900/60 dark:text-white/60">
                                      Impuestos e IVA
                                    </p>
                                    <div className="mt-4 grid gap-4 md:grid-cols-3">
                                      <div>
                                        <FieldLabel
                                          htmlFor={`service-iva21-${service.id}`}
                                        >
                                          IVA 21%
                                        </FieldLabel>
                                        <input
                                          id={`service-iva21-${service.id}`}
                                          type="number"
                                          value={service.tax_21}
                                          onChange={(e) =>
                                            updateServiceField(
                                              service.id,
                                              "tax_21",
                                              e.target.value,
                                            )
                                          }
                                          className={INPUT}
                                          placeholder="0.00"
                                        />
                                      </div>
                                      <div>
                                        <FieldLabel
                                          htmlFor={`service-iva105-${service.id}`}
                                        >
                                          IVA 10,5%
                                        </FieldLabel>
                                        <input
                                          id={`service-iva105-${service.id}`}
                                          type="number"
                                          value={service.tax_105}
                                          onChange={(e) =>
                                            updateServiceField(
                                              service.id,
                                              "tax_105",
                                              e.target.value,
                                            )
                                          }
                                          className={INPUT}
                                          placeholder="0.00"
                                        />
                                      </div>
                                      <div>
                                        <FieldLabel
                                          htmlFor={`service-exempt-${service.id}`}
                                        >
                                          Exento
                                        </FieldLabel>
                                        <input
                                          id={`service-exempt-${service.id}`}
                                          type="number"
                                          value={service.exempt}
                                          onChange={(e) =>
                                            updateServiceField(
                                              service.id,
                                              "exempt",
                                              e.target.value,
                                            )
                                          }
                                          className={INPUT}
                                          placeholder="0.00"
                                        />
                                      </div>
                                      <div className="md:col-span-2">
                                        <FieldLabel
                                          htmlFor={`service-other-${service.id}`}
                                        >
                                          Otros impuestos
                                        </FieldLabel>
                                        <input
                                          id={`service-other-${service.id}`}
                                          type="number"
                                          value={service.other_taxes}
                                          onChange={(e) =>
                                            updateServiceField(
                                              service.id,
                                              "other_taxes",
                                              e.target.value,
                                            )
                                          }
                                          className={INPUT}
                                          placeholder="0.00"
                                        />
                                      </div>
                                    </div>
                                  </div>

                                  <div className={SUBCARD}>
                                    <p className="text-[11px] uppercase tracking-[0.25em] text-sky-900/60 dark:text-white/60">
                                      Tarjeta
                                    </p>
                                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                                      <div>
                                        <FieldLabel
                                          htmlFor={`service-card-${service.id}`}
                                        >
                                          Interés tarjeta
                                        </FieldLabel>
                                        <input
                                          id={`service-card-${service.id}`}
                                          type="number"
                                          value={service.card_interest}
                                          onChange={(e) =>
                                            updateServiceField(
                                              service.id,
                                              "card_interest",
                                              e.target.value,
                                            )
                                          }
                                          className={INPUT}
                                          placeholder="0.00"
                                        />
                                      </div>
                                      <div>
                                        <FieldLabel
                                          htmlFor={`service-card-iva-${service.id}`}
                                        >
                                          IVA interés (21%)
                                        </FieldLabel>
                                        <input
                                          id={`service-card-iva-${service.id}`}
                                          type="number"
                                          value={service.card_interest_21}
                                          onChange={(e) =>
                                            updateServiceField(
                                              service.id,
                                              "card_interest_21",
                                              e.target.value,
                                            )
                                          }
                                          className={INPUT}
                                          placeholder="0.00"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </>
                              )}

                              {useBookingSaleTotal ? (
                                <div className={SUBCARD}>
                                  <p className="text-[11px] uppercase tracking-[0.25em] text-sky-900/60 dark:text-white/60">
                                    Ajustes extra
                                  </p>
                                  <p className="mt-2 text-xs text-sky-900/70 dark:text-white/70">
                                    Con venta general, los ajustes se calculan
                                    en el resumen por moneda.
                                  </p>
                                </div>
                              ) : adjustmentTotals.items.length > 0 ? (
                                <AdjustmentsPanel
                                  items={adjustmentTotals.items}
                                  totalCosts={adjustmentTotals.totalCosts}
                                  totalTaxes={adjustmentTotals.totalTaxes}
                                  netCommission={netCommission}
                                  format={(value) =>
                                    fmtMoney(value, service.currency || "ARS")
                                  }
                                />
                              ) : null}

                              {showBreakdown &&
                                (manualMode ? (
                                  <BillingBreakdownManual
                                    importeVenta={saleValue}
                                    costo={costValue}
                                    impuestos={toNumber(service.other_taxes)}
                                    moneda={service.currency || "ARS"}
                                    transferFeePct={transferFeePct}
                                    onBillingUpdate={(data) =>
                                      updateServiceBilling(service.id, data)
                                    }
                                  />
                                ) : (
                                  <BillingBreakdown
                                    importeVenta={saleValue}
                                    costo={costValue}
                                    montoIva21={toNumber(service.tax_21)}
                                    montoIva10_5={toNumber(service.tax_105)}
                                    montoExento={toNumber(service.exempt)}
                                    otrosImpuestos={toNumber(
                                      service.other_taxes,
                                    )}
                                    cardInterest={toNumber(
                                      service.card_interest,
                                    )}
                                    cardInterestIva={toNumber(
                                      service.card_interest_21,
                                    )}
                                    moneda={service.currency || "ARS"}
                                    transferFeePct={transferFeePct}
                                    onBillingUpdate={(data) =>
                                      updateServiceBilling(service.id, data)
                                    }
                                  />
                                ))}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap justify-between gap-3">
                  <button
                    type="button"
                    className={BTN_SKY}
                    onClick={() => goToStep(2)}
                  >
                    <IconArrowLeft className="size-4" />
                    Volver
                  </button>
                  <button
                    type="button"
                    className={BTN_EMERALD}
                    onClick={() => goToStep(4)}
                  >
                    Siguiente: Resumen
                  </button>
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div
                key="step-4"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="space-y-8"
              >
                <div className={PANEL}>
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold">
                        Paso 4 · Resumen financiero
                      </h2>
                      <p className="text-sm text-sky-900/70 dark:text-white/70">
                        Revisá márgenes, impuestos, costos bancarios y ganancia.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-sky-900/70 dark:text-white/60">
                      <span className={`${PILL_BASE} ${PILL_SKY}`}>
                        Costos Bancarios: {(transferFeePct * 100).toFixed(2)}%
                      </span>
                    </div>
                  </div>

                  <div className="mt-8">
                    <SummaryCard
                      totalsByCurrency={totalsByCurrency}
                      services={summaryServices as Service[]}
                      receipts={[]}
                      useBookingSaleTotal={useBookingSaleTotal}
                      bookingSaleTotals={bookingSaleTotals}
                    />
                  </div>
                </div>

                <div className={PANEL}>
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">Revisión final</h3>
                      <p className="text-sm text-sky-900/70 dark:text-white/70">
                        Revisá lo generado, editá o eliminá lo que necesites y
                        confirmá.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={BTN_SKY}
                        onClick={() => goToStep(1)}
                      >
                        Editar pasajeros
                      </button>
                      <button
                        type="button"
                        className={BTN_SKY}
                        onClick={() => goToStep(2)}
                      >
                        Editar reserva
                      </button>
                      <button
                        type="button"
                        className={BTN_SKY}
                        onClick={() => goToStep(3)}
                      >
                        Editar servicios
                      </button>
                    </div>
                  </div>

                  <div className="mt-8 grid gap-6 lg:grid-cols-3">
                    <div className={STACK_SKY}>
                      <p className="text-sm font-semibold">Pasajeros</p>
                      <div className="mt-3 space-y-2 text-sm">
                        {clients.map((client) => {
                          const label =
                            client.kind === "existing"
                              ? `${client.snapshot.first_name} ${client.snapshot.last_name}`
                              : `${client.first_name} ${client.last_name}`.trim();
                          return (
                            <div
                              key={`summary-${client.id}`}
                              className="flex items-center justify-between gap-2"
                            >
                              <span className="truncate">
                                {label || "Pax sin nombre"}
                                {client.id === titularId ? " · Titular" : ""}
                              </span>
                              <button
                                type="button"
                                className="cursor-pointer text-rose-600 hover:text-rose-700"
                                onClick={() => removeClient(client.id)}
                                aria-label="Eliminar pax"
                              >
                                <IconTrash className="size-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className={STACK_EMERALD}>
                      <p className="text-sm font-semibold">Reserva</p>
                      <div className="mt-3 space-y-1 text-sm text-sky-900/80 dark:text-white/80">
                        <p>Detalle: {booking.details || "-"}</p>
                        <p>
                          Fechas: {formatDate(booking.departure_date)} →{" "}
                          {formatDate(booking.return_date)}
                        </p>
                        <p>Factura: {booking.invoice_type || "-"}</p>
                      </div>
                    </div>

                    <div className={`${STACK_AMBER} bg-amber-100/5`}>
                      <p className="text-sm font-semibold">Servicios</p>
                      <div className="mt-3 space-y-2 text-sm">
                        {services.length === 0 && (
                          <p className="text-sky-900/60 dark:text-white/60">
                            Sin servicios cargados.
                          </p>
                        )}
                        {services.map((service) => (
                          <div
                            key={`summary-service-${service.id}`}
                            className="flex items-center justify-between gap-2"
                          >
                            <div className="flex-1">
                              <p className="font-medium">
                                {service.type || "Servicio"}
                              </p>
                              <p className="text-xs text-sky-900/60 dark:text-white/60">
                                {operatorMap.get(service.id_operator)?.name ||
                                  "Operador pendiente"}
                              </p>
                              <p className="text-xs text-sky-900/60 dark:text-white/60">
                                {fmtMoney(
                                  Number(service.sale_price),
                                  service.currency,
                                )}{" "}
                                · {formatDate(service.departure_date)} →{" "}
                                {formatDate(service.return_date)}
                              </p>
                            </div>
                            <button
                              type="button"
                              className="cursor-pointer text-rose-600 hover:text-rose-700"
                              onClick={() => removeService(service.id)}
                              aria-label="Eliminar servicio"
                            >
                              <IconTrash className="size-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {missingSummary.length > 0 && (
                    <div className={`${STACK_ROSE} mt-6 bg-rose-100/5`}>
                      <p className="text-sm font-semibold">
                        Faltan datos para confirmar
                      </p>
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-sky-900/80 dark:text-white/80">
                        {missingSummary.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="mt-6 flex flex-wrap justify-between gap-3">
                    <button
                      type="button"
                      className={BTN_SKY}
                      onClick={() => goToStep(3)}
                    >
                      <IconArrowLeft className="size-4" />
                      Volver
                    </button>
                    <button
                      type="button"
                      className={BTN_EMERALD}
                      onClick={handleConfirm}
                      disabled={!canConfirm}
                    >
                      {saving ? (
                        <ButtonSpinner />
                      ) : (
                        <IconCheck className="size-4" />
                      )}
                      Confirmar y abrir reserva
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </section>

      <ToastContainer position="bottom-right" />
    </ProtectedRoute>
  );
}
