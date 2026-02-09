"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import DestinationPicker, {
  type DestinationOption,
} from "@/components/DestinationPicker";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import {
  loadFinancePicks,
  type FinanceCurrency,
} from "@/utils/loadFinancePicks";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  normalizeQuoteCustomFields,
  normalizeQuoteHiddenFields,
  normalizeQuoteRequiredFields,
  type QuoteCustomField,
} from "@/utils/quoteConfig";
import {
  normalizeQuoteBookingDraft,
  normalizeQuoteCustomValues,
  normalizeQuotePaxDrafts,
  normalizeQuoteServiceDrafts,
  type QuoteBookingDraft,
  type QuotePaxDraft,
  type QuoteServiceDraft,
} from "@/utils/quoteDrafts";

type QuoteUser = {
  id_user: number;
  first_name: string | null;
  last_name: string | null;
  role?: string | null;
};

type QuoteItem = {
  id_quote: number;
  agency_quote_id?: number | null;
  public_id?: string | null;
  id_user: number;
  lead_name?: string | null;
  lead_phone?: string | null;
  lead_email?: string | null;
  note?: string | null;
  booking_draft?: unknown;
  pax_drafts?: unknown;
  service_drafts?: unknown;
  custom_values?: unknown;
  creation_date: string;
  updated_at: string;
  user?: QuoteUser;
};

type QuoteConfigDTO = {
  required_fields?: unknown;
  hidden_fields?: unknown;
  custom_fields?: unknown;
};

type PassengerOption = {
  id_client: number;
  first_name: string;
  last_name: string;
  phone?: string;
  email?: string | null;
};

type OperatorOption = {
  id_operator: number;
  name: string;
};

type AppUserOption = {
  id_user: number;
  first_name: string | null;
  last_name: string | null;
  role?: string | null;
  email?: string | null;
};

type QuoteFormState = {
  id_quote: number | null;
  id_user: number | null;
  lead_name: string;
  lead_phone: string;
  lead_email: string;
  note: string;
  booking_draft: QuoteBookingDraft;
  pax_drafts: QuotePaxDraft[];
  service_drafts: QuoteServiceDraft[];
  custom_values: Record<string, unknown>;
};

type ConvertPassengerForm = {
  mode: "existing" | "new";
  client_id: number | null;
  first_name: string;
  last_name: string;
  phone: string;
  birth_date: string;
  nationality: string;
  gender: string;
  email: string;
  dni_number: string;
  passport_number: string;
  tax_id: string;
};

type ConvertServiceForm = {
  type: string;
  description: string;
  note: string;
  sale_price: string;
  cost_price: string;
  currency: string;
  destination: string;
  reference: string;
  operator_id: number | null;
  departure_date: string;
  return_date: string;
};

type ConvertFormState = {
  booking: {
    id_user: number | null;
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
  titular: ConvertPassengerForm;
  companions: ConvertPassengerForm[];
  services: ConvertServiceForm[];
};

type Profile = {
  id_user: number;
  role: string;
};

type FormMode = "create" | "edit";
type QuoteListView = "card" | "grid" | "table";
type PresenceFilter = "all" | "with" | "without";
type ServiceTypeOption = {
  id?: number | null;
  value: string;
  label: string;
};

const GLASS =
  "rounded-3xl border border-sky-300/35 bg-gradient-to-br from-white/70 via-sky-100/55 to-sky-100/45 shadow-lg shadow-sky-950/10 backdrop-blur-xl dark:border-sky-200/20 dark:from-sky-950/40 dark:via-sky-900/35 dark:to-sky-900/25";
const SECTION_GLASS =
  "rounded-2xl border border-sky-300/35 bg-white/45 shadow-sm shadow-sky-950/10 backdrop-blur-xl dark:border-sky-200/20 dark:bg-sky-950/25";
const BTN =
  "rounded-full border border-sky-500/45 bg-sky-400/20 px-4 py-2 text-sm font-medium text-sky-950 shadow-sm shadow-sky-950/20 transition duration-200 hover:-translate-y-0.5 hover:bg-sky-400/30 active:translate-y-0 disabled:opacity-50 dark:border-sky-300/45 dark:bg-sky-400/20 dark:text-sky-100";
const AMBER_BTN =
  "rounded-full border border-sky-500/45 bg-sky-400/20 px-4 py-2 text-sm font-medium text-sky-950 shadow-sm shadow-sky-950/20 transition duration-200 hover:-translate-y-0.5 hover:bg-sky-400/30 active:translate-y-0 disabled:opacity-50 dark:border-sky-300/45 dark:bg-sky-400/20 dark:text-sky-100";
const DETAIL_AMBER_BTN =
  "rounded-full border border-amber-500/45 bg-amber-300/20 px-4 py-2 text-sm font-medium text-amber-950 shadow-sm shadow-amber-950/20 transition duration-200 hover:-translate-y-0.5 hover:bg-amber-300/30 active:translate-y-0 disabled:opacity-50 dark:border-amber-300/50 dark:bg-amber-300/20 dark:text-amber-100";
const SUBTLE_BTN =
  "rounded-full border border-sky-500/35 bg-white/55 px-4 py-2 text-sm text-sky-900 shadow-sm shadow-sky-950/10 transition duration-200 hover:-translate-y-0.5 hover:bg-sky-100/65 active:translate-y-0 disabled:opacity-50 dark:border-sky-300/35 dark:bg-sky-950/30 dark:text-sky-100";
const DANGER_BTN =
  "rounded-full border border-rose-500/55 bg-rose-200/20 px-4 py-2 text-sm font-medium text-rose-700 shadow-sm shadow-rose-950/20 transition duration-200 hover:-translate-y-0.5 hover:bg-rose-200/30 active:translate-y-0 disabled:opacity-50 dark:border-rose-300/55 dark:bg-rose-300/20 dark:text-rose-200";
const INPUT =
  "w-full rounded-2xl border border-sky-300/45 bg-white/75 px-3 py-2 text-sm text-slate-900 outline-none shadow-sm shadow-sky-950/10 backdrop-blur placeholder:text-slate-500/80 focus:border-sky-500/65 focus:ring-2 focus:ring-sky-400/35 dark:border-sky-200/35 dark:bg-sky-950/25 dark:text-sky-50 dark:placeholder:text-sky-100/60";
const SELECT =
  "w-full appearance-none rounded-2xl border border-sky-300/45 bg-white/75 px-3 py-2 text-sm text-slate-900 outline-none shadow-sm shadow-sky-950/10 backdrop-blur focus:border-sky-500/65 focus:ring-2 focus:ring-sky-400/35 dark:border-sky-200/35 dark:bg-sky-950/25 dark:text-sky-50";
const STAT_CARD =
  "rounded-2xl border border-sky-300/35 bg-white/45 p-3 shadow-sm shadow-sky-950/10 backdrop-blur-xl dark:border-sky-200/20 dark:bg-sky-950/25";
const CHIP =
  "inline-flex items-center rounded-full border border-sky-400/40 bg-sky-300/20 px-2.5 py-1 text-[11px] font-semibold text-sky-900 dark:border-sky-300/40 dark:bg-sky-300/20 dark:text-sky-100";

const defaultPassenger = (): ConvertPassengerForm => ({
  mode: "new",
  client_id: null,
  first_name: "",
  last_name: "",
  phone: "",
  birth_date: "",
  nationality: "",
  gender: "",
  email: "",
  dni_number: "",
  passport_number: "",
  tax_id: "",
});

const defaultService = (): QuoteServiceDraft => ({
  type: "",
  description: "",
  note: "",
  sale_price: null,
  cost_price: null,
  currency: "ARS",
  destination: "",
  reference: "",
  operator_id: null,
  departure_date: "",
  return_date: "",
});

const defaultConvertService = (): ConvertServiceForm => ({
  type: "",
  description: "",
  note: "",
  sale_price: "",
  cost_price: "",
  currency: "ARS",
  destination: "",
  reference: "",
  operator_id: null,
  departure_date: "",
  return_date: "",
});

const defaultForm = (): QuoteFormState => ({
  id_quote: null,
  id_user: null,
  lead_name: "",
  lead_phone: "",
  lead_email: "",
  note: "",
  booking_draft: {
    details: "",
    departure_date: "",
    return_date: "",
    pax_count: null,
    currency: "ARS",
    clientStatus: "",
    operatorStatus: "",
    status: "",
    invoice_type: "",
    invoice_observation: "",
    observation: "",
  },
  pax_drafts: [],
  service_drafts: [],
  custom_values: {},
});

function cleanString(v: unknown): string {
  return String(v ?? "").trim();
}

function toNumber(v: unknown): number | null {
  const n = Number(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return n;
}

function pickArrayFromJson(
  payload: unknown,
  keys: string[] = ["data", "items", "types", "results"],
): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    for (const key of keys) {
      const value = (payload as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

function toBoolish(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["false", "0", "no", "off"].includes(normalized)) return false;
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
  }
  return undefined;
}

function normalizeServiceTypes(payload: unknown): ServiceTypeOption[] {
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
      const rawId =
        typeof record.id_service_type === "number"
          ? record.id_service_type
          : typeof record.id === "number"
            ? record.id
            : null;
      const code = typeof record.code === "string" ? record.code : "";
      const enabled =
        toBoolish(
          record.enabled ??
            record.is_active ??
            record.isActive ??
            record.active,
        ) ?? true;
      const value = cleanString(name || code);
      if (!value || enabled === false) return null;
      return { id: rawId, value, label: value } as ServiceTypeOption;
    })
    .filter((item): item is ServiceTypeOption => item !== null);

  return normalized.sort((a, b) => a.label.localeCompare(b.label, "es"));
}

function destinationValueToLabel(
  value: DestinationOption | DestinationOption[] | null,
): string {
  if (!value) return "";
  if (Array.isArray(value)) {
    const labels = value.map((opt) => opt.displayLabel).filter(Boolean);
    return labels.join(", ");
  }
  return value.displayLabel || "";
}

function normalizeQuoteItem(input: unknown): QuoteItem | null {
  if (!input || typeof input !== "object") return null;
  const rec = input as Record<string, unknown>;
  const id_quote = Number(rec.id_quote);
  const id_user = Number(rec.id_user);
  const creation_date = String(rec.creation_date ?? "");
  const updated_at = String(rec.updated_at ?? "");
  if (!Number.isFinite(id_quote) || !Number.isFinite(id_user)) return null;
  if (!creation_date || !updated_at) return null;
  return {
    id_quote,
    id_user,
    agency_quote_id:
      rec.agency_quote_id == null ? null : Number(rec.agency_quote_id),
    public_id: typeof rec.public_id === "string" ? rec.public_id : null,
    lead_name: typeof rec.lead_name === "string" ? rec.lead_name : null,
    lead_phone: typeof rec.lead_phone === "string" ? rec.lead_phone : null,
    lead_email: typeof rec.lead_email === "string" ? rec.lead_email : null,
    note: typeof rec.note === "string" ? rec.note : null,
    booking_draft: rec.booking_draft,
    pax_drafts: rec.pax_drafts,
    service_drafts: rec.service_drafts,
    custom_values: rec.custom_values,
    creation_date,
    updated_at,
    user:
      rec.user && typeof rec.user === "object"
        ? {
            id_user: Number((rec.user as Record<string, unknown>).id_user),
            first_name:
              typeof (rec.user as Record<string, unknown>).first_name === "string"
                ? ((rec.user as Record<string, unknown>).first_name as string)
                : null,
            last_name:
              typeof (rec.user as Record<string, unknown>).last_name === "string"
                ? ((rec.user as Record<string, unknown>).last_name as string)
                : null,
            role:
              typeof (rec.user as Record<string, unknown>).role === "string"
                ? ((rec.user as Record<string, unknown>).role as string)
                : null,
          }
        : undefined,
  };
}

function formatDate(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("es-AR");
}

function isManagerRole(role?: string | null): boolean {
  const normalized = cleanString(role).toLowerCase();
  return ["gerente", "administrativo", "desarrollador"].includes(normalized);
}

function isLeaderRole(role?: string | null): boolean {
  return cleanString(role).toLowerCase() === "lider";
}

function isCustomValueMissing(field: QuoteCustomField, value: unknown): boolean {
  if (!field.required) return false;
  if (field.type === "boolean") return typeof value !== "boolean";
  if (field.type === "number") {
    const n = toNumber(value);
    return n == null;
  }
  if (field.type === "select") return cleanString(value) === "";
  return cleanString(value) === "";
}

function toPassengerFromDraft(draft: QuotePaxDraft): ConvertPassengerForm {
  const mode = draft.mode === "existing" && draft.client_id ? "existing" : "new";
  return {
    mode,
    client_id: mode === "existing" ? Number(draft.client_id || 0) || null : null,
    first_name: draft.first_name || "",
    last_name: draft.last_name || "",
    phone: draft.phone || "",
    birth_date: draft.birth_date || "",
    nationality: draft.nationality || "",
    gender: draft.gender || "",
    email: draft.email || "",
    dni_number: "",
    passport_number: "",
    tax_id: "",
  };
}

function toConvertServiceFromDraft(draft: QuoteServiceDraft): ConvertServiceForm {
  return {
    type: draft.type || "",
    description: draft.description || "",
    note: draft.note || "",
    sale_price:
      typeof draft.sale_price === "number" && Number.isFinite(draft.sale_price)
        ? String(draft.sale_price)
        : "",
    cost_price:
      typeof draft.cost_price === "number" && Number.isFinite(draft.cost_price)
        ? String(draft.cost_price)
        : "",
    currency: draft.currency || "ARS",
    destination: draft.destination || "",
    reference: draft.reference || "",
    operator_id:
      typeof draft.operator_id === "number" && Number.isFinite(draft.operator_id)
        ? Math.trunc(draft.operator_id)
        : null,
    departure_date: draft.departure_date || "",
    return_date: draft.return_date || "",
  };
}

function formatUserName(
  user?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    id_user?: number;
  } | null,
): string {
  if (!user) return "Sin responsable";
  const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim();
  if (fullName) return fullName;
  if (user.email) return user.email;
  if (typeof user.id_user === "number") return `Usuario ${user.id_user}`;
  return "Sin responsable";
}

function startOfDayMs(dateValue: string): number | null {
  if (!dateValue) return null;
  const d = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.getTime();
}

function endOfDayMs(dateValue: string): number | null {
  if (!dateValue) return null;
  const d = new Date(`${dateValue}T23:59:59.999`);
  if (Number.isNaN(d.getTime())) return null;
  return d.getTime();
}

function matchesPresenceFilter(
  filter: PresenceFilter,
  count: number,
): boolean {
  if (filter === "with") return count > 0;
  if (filter === "without") return count === 0;
  return true;
}

function toDateMs(value: string): number {
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function SectionCard({
  id,
  title,
  subtitle,
  open,
  onToggle,
  right,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: (id: string) => void;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`${SECTION_GLASS} overflow-hidden`}>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          className="flex-1 text-left transition hover:opacity-90"
          onClick={() => onToggle(id)}
        >
          <h3 className="text-sm font-semibold text-sky-950 dark:text-sky-100">{title}</h3>
          {subtitle && (
            <p className="text-xs text-sky-900/75 dark:text-sky-100/70">{subtitle}</p>
          )}
        </button>
        <div className="flex items-center gap-2">
          {right}
          <button
            type="button"
            className={CHIP}
            onClick={() => onToggle(id)}
            aria-label={open ? `Ocultar ${title}` : `Expandir ${title}`}
          >
            {open ? "Ocultar" : "Expandir"}
          </button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key={`${id}-content`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-sky-300/30 p-4 dark:border-sky-200/15">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

export default function QuotesPage() {
  const { token } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [search, setSearch] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);

  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [formMode, setFormMode] = useState<FormMode>("create");
  const [form, setForm] = useState<QuoteFormState>(defaultForm());
  const [listView, setListView] = useState<QuoteListView>("card");
  const [expandedQuoteId, setExpandedQuoteId] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [paxFilter, setPaxFilter] = useState<PresenceFilter>("all");
  const [serviceFilter, setServiceFilter] = useState<PresenceFilter>("all");
  const [sortBy, setSortBy] = useState<
    | "updated_desc"
    | "updated_asc"
    | "created_desc"
    | "created_asc"
    | "quote_desc"
    | "quote_asc"
  >("updated_desc");
  const [formSections, setFormSections] = useState<Record<string, boolean>>({
    lead: true,
    booking: true,
    custom: true,
    pax: true,
    services: true,
  });

  const [requiredFields, setRequiredFields] = useState<string[]>([]);
  const [hiddenFields, setHiddenFields] = useState<string[]>([]);
  const [customFields, setCustomFields] = useState<QuoteCustomField[]>([]);

  const [passengers, setPassengers] = useState<PassengerOption[]>([]);
  const [operators, setOperators] = useState<OperatorOption[]>([]);
  const [users, setUsers] = useState<AppUserOption[]>([]);
  const [financeCurrencies, setFinanceCurrencies] = useState<FinanceCurrency[]>(
    [],
  );
  const [loadingCurrencies, setLoadingCurrencies] = useState(false);
  const [serviceTypes, setServiceTypes] = useState<ServiceTypeOption[]>([]);
  const [loadingServiceTypes, setLoadingServiceTypes] = useState(false);

  const [convertQuote, setConvertQuote] = useState<QuoteItem | null>(null);
  const [convertForm, setConvertForm] = useState<ConvertFormState | null>(null);

  const canConfigure = useMemo(() => isManagerRole(profile?.role), [profile]);
  const canAssignOwner = useMemo(
    () => isManagerRole(profile?.role) || isLeaderRole(profile?.role),
    [profile],
  );
  const currencyOptions = useMemo(() => {
    const configured = financeCurrencies
      .filter((currency) => currency.enabled)
      .map((currency) => currency.code.toUpperCase())
      .filter(Boolean);
    const unique = Array.from(new Set(configured)).sort((a, b) =>
      a.localeCompare(b, "es"),
    );
    return unique.length > 0 ? unique : ["ARS", "USD"];
  }, [financeCurrencies]);

  const toggleFormSection = useCallback((section: string) => {
    setFormSections((prev) => ({ ...prev, [section]: !prev[section] }));
  }, []);

  const quoteRows = useMemo(
    () =>
      quotes.map((q) => {
        const bookingDraft = normalizeQuoteBookingDraft(q.booking_draft);
        const paxCount = normalizeQuotePaxDrafts(q.pax_drafts).length;
        const serviceCount = normalizeQuoteServiceDrafts(q.service_drafts).length;
        const displayId = q.agency_quote_id ?? q.id_quote;
        const ownerName = formatUserName(
          q.user
            ? {
                id_user: q.user.id_user,
                first_name: q.user.first_name,
                last_name: q.user.last_name,
              }
            : undefined,
        );
        const createdAtMs = toDateMs(q.creation_date);
        const updatedAtMs = toDateMs(q.updated_at);
        const localSearchBlob = [
          displayId,
          q.public_id || "",
          q.lead_name || "",
          q.lead_phone || "",
          q.lead_email || "",
          bookingDraft.details || "",
          ownerName,
        ]
          .join(" ")
          .toLowerCase();
        return {
          quote: q,
          bookingDraft,
          paxCount,
          serviceCount,
          displayId,
          ownerName,
          createdAtMs,
          updatedAtMs,
          localSearchBlob,
        };
      }),
    [quotes],
  );

  const filteredQuotes = useMemo(() => {
    const fromMs = startOfDayMs(createdFrom);
    const toMs = endOfDayMs(createdTo);
    const ownerId = ownerFilter === "all" ? null : Number(ownerFilter);
    const hasOwnerFilter = ownerId != null && Number.isFinite(ownerId);
    const normalizedSearch = search.trim().toLowerCase();

    const base = quoteRows.filter((row) => {
      if (hasOwnerFilter && row.quote.id_user !== ownerId) return false;
      if (!matchesPresenceFilter(paxFilter, row.paxCount)) return false;
      if (!matchesPresenceFilter(serviceFilter, row.serviceCount)) return false;
      if (fromMs != null && row.createdAtMs < fromMs) return false;
      if (toMs != null && row.createdAtMs > toMs) return false;
      if (normalizedSearch && !row.localSearchBlob.includes(normalizedSearch)) return false;
      return true;
    });

    const sorted = [...base].sort((a, b) => {
      if (sortBy === "updated_desc") return b.updatedAtMs - a.updatedAtMs;
      if (sortBy === "updated_asc") return a.updatedAtMs - b.updatedAtMs;
      if (sortBy === "created_desc") return b.createdAtMs - a.createdAtMs;
      if (sortBy === "created_asc") return a.createdAtMs - b.createdAtMs;
      if (sortBy === "quote_desc") return b.displayId - a.displayId;
      return a.displayId - b.displayId;
    });

    return sorted;
  }, [createdFrom, createdTo, ownerFilter, paxFilter, quoteRows, search, serviceFilter, sortBy]);

  const quoteStats = useMemo(() => {
    const total = quoteRows.length;
    const visible = filteredQuotes.length;
    const withPax = filteredQuotes.filter((row) => row.paxCount > 0).length;
    const withServices = filteredQuotes.filter((row) => row.serviceCount > 0).length;
    return { total, visible, withPax, withServices };
  }, [filteredQuotes, quoteRows]);

  const hasActiveFilters = useMemo(
    () =>
      ownerFilter !== "all" ||
      createdFrom !== "" ||
      createdTo !== "" ||
      paxFilter !== "all" ||
      serviceFilter !== "all",
    [createdFrom, createdTo, ownerFilter, paxFilter, serviceFilter],
  );

  const clearFilters = useCallback(() => {
    setOwnerFilter("all");
    setCreatedFrom("");
    setCreatedTo("");
    setPaxFilter("all");
    setServiceFilter("all");
    setSortBy("updated_desc");
  }, []);

  const toggleExpandedQuote = useCallback((quoteId: number) => {
    setExpandedQuoteId((prev) => (prev === quoteId ? null : quoteId));
  }, []);

  const loadQuotes = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const qs = new URLSearchParams({ take: "50" });
      if (search.trim()) qs.set("q", search.trim());
      const res = await authFetch(`/api/quotes?${qs.toString()}`, { cache: "no-store" }, token);
      const payload = (await res.json().catch(() => null)) as
        | { items?: unknown[]; error?: string }
        | null;
      if (!res.ok) {
        throw new Error(payload?.error || "No se pudo cargar cotizaciones");
      }
      const items = Array.isArray(payload?.items)
        ? payload.items.map(normalizeQuoteItem).filter((x): x is QuoteItem => x !== null)
        : [];
      setQuotes(items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error cargando cotizaciones");
      setQuotes([]);
    } finally {
      setLoading(false);
    }
  }, [search, token]);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    (async () => {
      try {
        const [profileRes, cfgRes, paxRes, opRes, userRes] = await Promise.all([
          authFetch("/api/user/profile", { cache: "no-store" }, token),
          authFetch("/api/quotes/config", { cache: "no-store" }, token),
          authFetch("/api/clients?take=200", { cache: "no-store" }, token),
          authFetch("/api/operators", { cache: "no-store" }, token),
          authFetch("/api/users", { cache: "no-store" }, token),
        ]);

        if (profileRes.ok) {
          const p = (await profileRes.json()) as Profile;
          if (alive) setProfile(p);
        }

        if (cfgRes.ok) {
          const cfg = (await cfgRes.json()) as QuoteConfigDTO | null;
          if (alive) {
            setRequiredFields(normalizeQuoteRequiredFields(cfg?.required_fields));
            setHiddenFields(normalizeQuoteHiddenFields(cfg?.hidden_fields));
            setCustomFields(normalizeQuoteCustomFields(cfg?.custom_fields));
          }
        }

        if (paxRes.ok) {
          const payload = (await paxRes.json()) as { items?: unknown[] };
          const list = Array.isArray(payload?.items) ? payload.items : [];
          if (alive) {
            setPassengers(
              list
                .map((item) => {
                  if (!item || typeof item !== "object") return null;
                  const rec = item as Record<string, unknown>;
                  const id = Number(rec.id_client);
                  if (!Number.isFinite(id)) return null;
                  return {
                    id_client: id,
                    first_name: String(rec.first_name || ""),
                    last_name: String(rec.last_name || ""),
                    phone: typeof rec.phone === "string" ? rec.phone : undefined,
                    email: typeof rec.email === "string" ? rec.email : null,
                  } as PassengerOption;
                })
                .filter((x): x is PassengerOption => x !== null),
            );
          }
        }

        if (opRes.ok) {
          const list = (await opRes.json()) as unknown[];
          if (alive) {
            setOperators(
              (Array.isArray(list) ? list : [])
                .map((op) => {
                  if (!op || typeof op !== "object") return null;
                  const rec = op as Record<string, unknown>;
                  const id = Number(rec.id_operator);
                  const name = cleanString(rec.name);
                  if (!Number.isFinite(id) || !name) return null;
                  return { id_operator: id, name } as OperatorOption;
                })
                .filter((x): x is OperatorOption => x !== null),
            );
          }
        }

        if (userRes.ok) {
          const list = (await userRes.json()) as unknown[];
          if (alive) {
            setUsers(
              (Array.isArray(list) ? list : [])
                .map((u) => {
                  if (!u || typeof u !== "object") return null;
                  const rec = u as Record<string, unknown>;
                  const id = Number(rec.id_user);
                  if (!Number.isFinite(id)) return null;
                  return {
                    id_user: id,
                    first_name:
                      typeof rec.first_name === "string" ? rec.first_name : null,
                    last_name:
                      typeof rec.last_name === "string" ? rec.last_name : null,
                    role: typeof rec.role === "string" ? rec.role : null,
                    email: typeof rec.email === "string" ? rec.email : null,
                  } as AppUserOption;
                })
                .filter((x): x is AppUserOption => x !== null),
            );
          }
        }
      } catch {
        if (alive) {
          toast.error("No se pudieron cargar datos de cotizaciones.");
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    (async () => {
      try {
        setLoadingCurrencies(true);
        const picks = await loadFinancePicks(token);
        if (!alive) return;
        setFinanceCurrencies(picks?.currencies ?? []);
      } catch {
        if (!alive) return;
        setFinanceCurrencies([]);
      } finally {
        if (alive) setLoadingCurrencies(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    (async () => {
      try {
        setLoadingServiceTypes(true);
        const res = await authFetch("/api/service-types", { cache: "no-store" }, token);
        if (!res.ok) throw new Error("No se pudieron cargar tipos de servicio");
        const data = (await res.json().catch(() => null)) as unknown;
        if (!alive) return;
        setServiceTypes(normalizeServiceTypes(data));
      } catch {
        if (!alive) return;
        setServiceTypes([]);
      } finally {
        if (alive) setLoadingServiceTypes(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadQuotes();
    }, 250);
    return () => clearTimeout(t);
  }, [loadQuotes]);

  const onChangeBase =
    (key: keyof QuoteFormState) =>
    (
      e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
    ) => {
      const value = e.target.value;
      setForm((prev) => ({ ...prev, [key]: value }));
    };

  const onChangeBookingDraft =
    (key: keyof QuoteBookingDraft) =>
    (
      e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
    ) => {
      const raw = e.target.value;
      setForm((prev) => ({
        ...prev,
        booking_draft: {
          ...prev.booking_draft,
          [key]: key === "pax_count" ? (raw === "" ? null : Number(raw)) : raw,
        },
      }));
    };

  const startCreate = () => {
    setFormMode("create");
    const next = defaultForm();
    next.booking_draft.currency = currencyOptions[0] || "ARS";
    setForm(next);
    setExpandedQuoteId(null);
    setFormSections({
      lead: true,
      booking: true,
      custom: true,
      pax: true,
      services: true,
    });
  };

  const startEdit = (quote: QuoteItem) => {
    setFormMode("edit");
    setForm({
      id_quote: quote.id_quote,
      id_user: quote.id_user,
      lead_name: quote.lead_name || "",
      lead_phone: quote.lead_phone || "",
      lead_email: quote.lead_email || "",
      note: quote.note || "",
      booking_draft: normalizeQuoteBookingDraft(quote.booking_draft),
      pax_drafts: normalizeQuotePaxDrafts(quote.pax_drafts),
      service_drafts: normalizeQuoteServiceDrafts(quote.service_drafts),
      custom_values: normalizeQuoteCustomValues(quote.custom_values),
    });
    setExpandedQuoteId(quote.id_quote);
    setFormSections({
      lead: true,
      booking: true,
      custom: true,
      pax: false,
      services: false,
    });
  };

  const validateForm = (): string | null => {
    const required = requiredFields.filter((f) => !hiddenFields.includes(f));

    const valueByKey: Record<string, string> = {
      lead_name: cleanString(form.lead_name),
      lead_phone: cleanString(form.lead_phone),
      lead_email: cleanString(form.lead_email),
      details: cleanString(form.booking_draft.details),
      departure_date: cleanString(form.booking_draft.departure_date),
      return_date: cleanString(form.booking_draft.return_date),
      currency: cleanString(form.booking_draft.currency),
      pax_count:
        typeof form.booking_draft.pax_count === "number" &&
        Number.isFinite(form.booking_draft.pax_count)
          ? String(form.booking_draft.pax_count)
          : "",
    };

    for (const key of required) {
      if (!cleanString(valueByKey[key])) {
        return `El campo ${key} es obligatorio por configuración.`;
      }
    }

    for (const field of customFields) {
      if (isCustomValueMissing(field, form.custom_values[field.key])) {
        return `El campo personalizado ${field.label} es obligatorio.`;
      }
    }

    return null;
  };

  const saveQuote = async () => {
    if (!token) return;
    const validation = validateForm();
    if (validation) {
      toast.error(validation);
      return;
    }

    const payload = {
      lead_name: cleanString(form.lead_name),
      lead_phone: cleanString(form.lead_phone),
      lead_email: cleanString(form.lead_email),
      note: cleanString(form.note),
      booking_draft: normalizeQuoteBookingDraft(form.booking_draft),
      pax_drafts: normalizeQuotePaxDrafts(form.pax_drafts),
      service_drafts: normalizeQuoteServiceDrafts(form.service_drafts),
      custom_values: normalizeQuoteCustomValues(form.custom_values),
      ...(canAssignOwner && form.id_user ? { id_user: form.id_user } : {}),
    };

    try {
      setSaving(true);
      const endpoint =
        formMode === "edit" && form.id_quote
          ? `/api/quotes/${form.id_quote}`
          : "/api/quotes";
      const method = formMode === "edit" && form.id_quote ? "PUT" : "POST";
      const res = await authFetch(
        endpoint,
        { method, body: JSON.stringify(payload) },
        token,
      );
      const data = (await res.json().catch(() => null)) as
        | { error?: string }
        | QuoteItem
        | null;
      if (!res.ok) throw new Error(data && "error" in data ? data.error || "Error" : "Error");
      toast.success(formMode === "edit" ? "Cotización actualizada" : "Cotización creada");
      startCreate();
      await loadQuotes();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error guardando cotización");
    } finally {
      setSaving(false);
    }
  };

  const deleteQuote = async (quote: QuoteItem) => {
    if (!token) return;
    const ok = window.confirm(
      `¿Eliminar cotización ${quote.agency_quote_id ?? quote.id_quote}?`,
    );
    if (!ok) return;
    try {
      const res = await authFetch(`/api/quotes/${quote.id_quote}`, { method: "DELETE" }, token);
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error || "No se pudo eliminar");
      if (form.id_quote === quote.id_quote) startCreate();
      await loadQuotes();
      toast.success("Cotización eliminada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error eliminando");
    }
  };

  const addPaxDraft = () => {
    setForm((prev) => ({
      ...prev,
      pax_drafts: [
        ...prev.pax_drafts,
        {
          mode: "free",
          client_id: null,
          is_titular: prev.pax_drafts.length === 0,
          first_name: "",
          last_name: "",
          phone: "",
          email: "",
          birth_date: "",
          nationality: "",
          gender: "",
          notes: "",
        },
      ],
    }));
  };

  const updatePaxDraft = (
    index: number,
    patch: Partial<QuotePaxDraft>,
    normalizeTitular = false,
  ) => {
    setForm((prev) => {
      const next = prev.pax_drafts.map((p, i) => (i === index ? { ...p, ...patch } : p));
      if (normalizeTitular && patch.is_titular) {
        return {
          ...prev,
          pax_drafts: next.map((p, i) => ({ ...p, is_titular: i === index })),
        };
      }
      return { ...prev, pax_drafts: next };
    });
  };

  const removePaxDraft = (index: number) => {
    setForm((prev) => {
      const next = prev.pax_drafts.filter((_, i) => i !== index);
      const hasTitular = next.some((p) => p.is_titular);
      if (!hasTitular && next.length > 0) {
        next[0] = { ...next[0], is_titular: true };
      }
      return { ...prev, pax_drafts: next };
    });
  };

  const addServiceDraft = () => {
    setForm((prev) => ({
      ...prev,
      service_drafts: [
        ...prev.service_drafts,
        { ...defaultService(), currency: currencyOptions[0] || "ARS" },
      ],
    }));
  };

  const updateServiceDraft = (index: number, patch: Partial<QuoteServiceDraft>) => {
    setForm((prev) => ({
      ...prev,
      service_drafts: prev.service_drafts.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));
  };

  const removeServiceDraft = (index: number) => {
    setForm((prev) => ({
      ...prev,
      service_drafts: prev.service_drafts.filter((_, i) => i !== index),
    }));
  };

  const openConvert = (quote: QuoteItem) => {
    const bookingDraft = normalizeQuoteBookingDraft(quote.booking_draft);
    const paxDrafts = normalizeQuotePaxDrafts(quote.pax_drafts);
    const serviceDrafts = normalizeQuoteServiceDrafts(quote.service_drafts);

    let titularDraft = paxDrafts.find((p) => p.is_titular);
    if (!titularDraft && paxDrafts.length > 0) titularDraft = paxDrafts[0];

    const companions = paxDrafts
      .filter((p) => p !== titularDraft)
      .map((p) => toPassengerFromDraft(p));

    const titular = titularDraft
      ? toPassengerFromDraft(titularDraft)
      : defaultPassenger();

    setConvertQuote(quote);
    setConvertForm({
      booking: {
        id_user: quote.id_user,
        clientStatus: bookingDraft.clientStatus || "Pendiente",
        operatorStatus: bookingDraft.operatorStatus || "Pendiente",
        status: bookingDraft.status || "Abierta",
        details: bookingDraft.details || "",
        invoice_type: bookingDraft.invoice_type || "Coordinar con administracion",
        invoice_observation: bookingDraft.invoice_observation || "",
        observation: bookingDraft.observation || "",
        departure_date: bookingDraft.departure_date || "",
        return_date: bookingDraft.return_date || "",
      },
      titular,
      companions,
      services:
        serviceDrafts.length > 0
          ? serviceDrafts.map((s) => toConvertServiceFromDraft(s))
          : [],
    });
  };

  const closeConvert = () => {
    setConvertQuote(null);
    setConvertForm(null);
  };

  const updateConvertPassenger = (
    scope: "titular" | "companions",
    index: number,
    patch: Partial<ConvertPassengerForm>,
  ) => {
    setConvertForm((prev) => {
      if (!prev) return prev;
      if (scope === "titular") {
        return { ...prev, titular: { ...prev.titular, ...patch } };
      }
      return {
        ...prev,
        companions: prev.companions.map((c, i) => (i === index ? { ...c, ...patch } : c)),
      };
    });
  };

  const addConvertCompanion = () => {
    setConvertForm((prev) =>
      prev
        ? {
            ...prev,
            companions: [...prev.companions, defaultPassenger()],
          }
        : prev,
    );
  };

  const removeConvertCompanion = (index: number) => {
    setConvertForm((prev) =>
      prev
        ? {
            ...prev,
            companions: prev.companions.filter((_, i) => i !== index),
          }
        : prev,
    );
  };

  const updateConvertService = (index: number, patch: Partial<ConvertServiceForm>) => {
    setConvertForm((prev) =>
      prev
        ? {
            ...prev,
            services: prev.services.map((s, i) => (i === index ? { ...s, ...patch } : s)),
          }
        : prev,
    );
  };

  const addConvertService = () => {
    setConvertForm((prev) =>
      prev
        ? {
            ...prev,
            services: [
              ...prev.services,
              { ...defaultConvertService(), currency: currencyOptions[0] || "ARS" },
            ],
          }
        : prev,
    );
  };

  const removeConvertService = (index: number) => {
    setConvertForm((prev) =>
      prev
        ? {
            ...prev,
            services: prev.services.filter((_, i) => i !== index),
          }
        : prev,
    );
  };

  const submitConvert = async () => {
    if (!token || !convertQuote || !convertForm) return;

    const reqPassenger = (p: ConvertPassengerForm) => {
      if (p.mode === "existing") {
        return {
          mode: "existing" as const,
          client_id: p.client_id,
        };
      }
      return {
        mode: "new" as const,
        first_name: cleanString(p.first_name),
        last_name: cleanString(p.last_name),
        phone: cleanString(p.phone),
        birth_date: cleanString(p.birth_date),
        nationality: cleanString(p.nationality),
        gender: cleanString(p.gender),
        email: cleanString(p.email),
        dni_number: cleanString(p.dni_number),
        passport_number: cleanString(p.passport_number),
        tax_id: cleanString(p.tax_id),
      };
    };

    const payload = {
      booking: {
        ...convertForm.booking,
        id_user: canAssignOwner ? convertForm.booking.id_user : undefined,
      },
      titular: reqPassenger(convertForm.titular),
      companions: convertForm.companions.map((p) => reqPassenger(p)),
      services: convertForm.services.map((s) => ({
        type: cleanString(s.type),
        description: cleanString(s.description),
        note: cleanString(s.note),
        sale_price: toNumber(s.sale_price),
        cost_price: toNumber(s.cost_price),
        currency: cleanString(s.currency),
        destination: cleanString(s.destination),
        reference: cleanString(s.reference),
        operator_id: s.operator_id,
        departure_date: cleanString(s.departure_date),
        return_date: cleanString(s.return_date),
      })),
      delete_quote: true,
    };

    try {
      setConverting(true);
      const res = await authFetch(
        `/api/quotes/${convertQuote.id_quote}/convert`,
        { method: "POST", body: JSON.stringify(payload) },
        token,
      );
      const data = (await res.json().catch(() => null)) as
        | { error?: string; id_booking?: number }
        | null;
      if (!res.ok) {
        throw new Error(data?.error || "No se pudo convertir");
      }
      toast.success(
        `Cotización convertida en reserva #${
          data?.id_booking ?? ""
        }`,
      );
      closeConvert();
      await loadQuotes();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al convertir");
    } finally {
      setConverting(false);
    }
  };

  if (loading && quotes.length === 0) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-[40vh] items-center justify-center">
          <Spinner />
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <section className="mx-auto max-w-7xl p-6 text-slate-950 dark:text-white">
        <ToastContainer position="top-right" autoClose={2200} />

        <div className="mb-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-sky-950 dark:text-sky-50">
                Cotizaciones
              </h1>
              <p className="mt-1 text-sm text-sky-900/75 dark:text-sky-100/70">
                Guardá presupuestos flexibles y convertilos en reserva cuando se confirme.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canConfigure && (
                <Link href="/quotes/config" className={SUBTLE_BTN}>
                  Configuración
                </Link>
              )}
              <button type="button" className={BTN} onClick={startCreate}>
                Nueva cotización
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className={STAT_CARD}>
              <p className="text-[11px] uppercase tracking-[0.18em] text-sky-800/70 dark:text-sky-100/65">
                Total
              </p>
              <p className="mt-1 text-xl font-semibold text-sky-950 dark:text-sky-50">
                {quoteStats.total}
              </p>
            </div>
            <div className={STAT_CARD}>
              <p className="text-[11px] uppercase tracking-[0.18em] text-sky-800/70 dark:text-sky-100/65">
                Visibles
              </p>
              <p className="mt-1 text-xl font-semibold text-sky-950 dark:text-sky-50">
                {quoteStats.visible}
              </p>
            </div>
            <div className={STAT_CARD}>
              <p className="text-[11px] uppercase tracking-[0.18em] text-sky-800/70 dark:text-sky-100/65">
                Con Pax
              </p>
              <p className="mt-1 text-xl font-semibold text-sky-950 dark:text-sky-50">
                {quoteStats.withPax}
              </p>
            </div>
            <div className={STAT_CARD}>
              <p className="text-[11px] uppercase tracking-[0.18em] text-sky-800/70 dark:text-sky-100/65">
                Con Servicios
              </p>
              <p className="mt-1 text-xl font-semibold text-sky-950 dark:text-sky-50">
                {quoteStats.withServices}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
          <div className={`${GLASS} space-y-4 p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-sky-950 dark:text-sky-50">
                  {formMode === "edit" ? "Editar cotización" : "Nueva cotización"}
                </h2>
                <p className="text-xs text-sky-900/75 dark:text-sky-100/70">
                  Formulario flexible con datos base, potencial cliente/s, pax y servicios.
                </p>
              </div>
              {formMode === "edit" && (
                <button type="button" className={SUBTLE_BTN} onClick={startCreate}>
                  Cancelar edición
                </button>
              )}
            </div>

            <SectionCard
              id="lead"
              title="Potencial cliente/s y contacto"
              subtitle="Datos iniciales de potencial cliente/s"
              open={Boolean(formSections.lead)}
              onToggle={toggleFormSection}
            >
              {canAssignOwner && (
                <div>
                  <label className="mb-1 block text-xs opacity-75">Vendedor responsable</label>
                  <select
                    className={SELECT}
                    value={form.id_user || profile?.id_user || ""}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        id_user: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                  >
                    <option value="">Seleccionar</option>
                    {users.map((u) => (
                      <option key={u.id_user} value={u.id_user}>
                        {`${u.first_name || ""} ${u.last_name || ""}`.trim() ||
                          u.email ||
                          `Usuario ${u.id_user}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {!hiddenFields.includes("lead_name") && (
                  <div>
                    <label className="mb-1 block text-xs opacity-75">Cliente · Nombre</label>
                    <input
                      className={INPUT}
                      value={form.lead_name}
                      onChange={onChangeBase("lead_name")}
                    />
                  </div>
                )}
                {!hiddenFields.includes("lead_phone") && (
                  <div>
                    <label className="mb-1 block text-xs opacity-75">Cliente · Teléfono</label>
                    <input
                      className={INPUT}
                      value={form.lead_phone}
                      onChange={onChangeBase("lead_phone")}
                    />
                  </div>
                )}
                {!hiddenFields.includes("lead_email") && (
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs opacity-75">Cliente · Email</label>
                    <input
                      className={INPUT}
                      value={form.lead_email}
                      onChange={onChangeBase("lead_email")}
                    />
                  </div>
                )}
              </div>

              <div className="mt-3">
                <label className="mb-1 block text-xs opacity-75">Notas</label>
                <textarea
                  className={`${INPUT} min-h-24`}
                  value={form.note}
                  onChange={onChangeBase("note")}
                />
              </div>
            </SectionCard>

            <SectionCard
              id="booking"
              title="Datos base de reserva"
              subtitle="Borrador editable para la futura conversión"
              open={Boolean(formSections.booking)}
              onToggle={toggleFormSection}
            >
              <div className="grid gap-3 md:grid-cols-2">
                {!hiddenFields.includes("details") && (
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs opacity-75">Detalle</label>
                    <textarea
                      className={`${INPUT} min-h-20`}
                      value={String(form.booking_draft.details || "")}
                      onChange={onChangeBookingDraft("details")}
                    />
                  </div>
                )}
                {!hiddenFields.includes("departure_date") && (
                  <div>
                    <label className="mb-1 block text-xs opacity-75">Salida</label>
                    <input
                      type="date"
                      className={INPUT}
                      value={String(form.booking_draft.departure_date || "")}
                      onChange={onChangeBookingDraft("departure_date")}
                    />
                  </div>
                )}
                {!hiddenFields.includes("return_date") && (
                  <div>
                    <label className="mb-1 block text-xs opacity-75">Regreso</label>
                    <input
                      type="date"
                      className={INPUT}
                      value={String(form.booking_draft.return_date || "")}
                      onChange={onChangeBookingDraft("return_date")}
                    />
                  </div>
                )}
                {!hiddenFields.includes("currency") && (
                  <div>
                    <label className="mb-1 block text-xs opacity-75">Moneda</label>
                    <select
                      className={SELECT}
                      value={String(form.booking_draft.currency || "")}
                      onChange={onChangeBookingDraft("currency")}
                      disabled={loadingCurrencies}
                    >
                      {loadingCurrencies && (
                        <>
                          {form.booking_draft.currency ? (
                            <option value={String(form.booking_draft.currency)}>
                              {String(form.booking_draft.currency)}
                            </option>
                          ) : null}
                          <option value="" disabled>
                            Cargando monedas...
                          </option>
                        </>
                      )}
                      {!loadingCurrencies && <option value="">Seleccionar moneda</option>}
                      {!loadingCurrencies &&
                        currencyOptions.map((code) => (
                          <option key={code} value={code}>
                            {code}
                          </option>
                        ))}
                      {!loadingCurrencies &&
                        form.booking_draft.currency &&
                        !currencyOptions.includes(
                          String(form.booking_draft.currency).toUpperCase(),
                        ) && (
                          <option value={String(form.booking_draft.currency)}>
                            {String(form.booking_draft.currency)} (no listado)
                          </option>
                        )}
                    </select>
                  </div>
                )}
                {!hiddenFields.includes("pax_count") && (
                  <div>
                    <label className="mb-1 block text-xs opacity-75">
                      Cantidad de pasajeros (count)
                    </label>
                    <input
                      type="number"
                      min={0}
                      className={INPUT}
                      value={
                        typeof form.booking_draft.pax_count === "number"
                          ? form.booking_draft.pax_count
                          : ""
                      }
                      onChange={onChangeBookingDraft("pax_count")}
                    />
                  </div>
                )}
              </div>
            </SectionCard>

            {customFields.length > 0 && (
              <SectionCard
                id="custom"
                title="Campos personalizados"
                subtitle="Campos dinámicos configurados por agencia"
                open={Boolean(formSections.custom)}
                onToggle={toggleFormSection}
              >
                <div className="grid gap-3 md:grid-cols-2">
                  {customFields.map((field) => {
                    const val = form.custom_values[field.key];
                    const commonProps = {
                      className: INPUT,
                      value:
                        typeof val === "string" || typeof val === "number"
                          ? String(val)
                          : "",
                      onChange: (
                        e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
                      ) => {
                        const raw = e.target.value;
                        setForm((prev) => ({
                          ...prev,
                          custom_values: {
                            ...prev.custom_values,
                            [field.key]:
                              field.type === "number"
                                ? raw === ""
                                  ? ""
                                  : Number(raw)
                                : raw,
                          },
                        }));
                      },
                    };

                    if (field.type === "textarea") {
                      return (
                        <div className="md:col-span-2" key={field.key}>
                          <label className="mb-1 block text-xs opacity-75">{field.label}</label>
                          <textarea {...commonProps} className={`${INPUT} min-h-20`} />
                        </div>
                      );
                    }

                    if (field.type === "select") {
                      return (
                        <div key={field.key}>
                          <label className="mb-1 block text-xs opacity-75">{field.label}</label>
                          <select {...commonProps} className={SELECT}>
                            <option value="">Seleccionar</option>
                            {(field.options || []).map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    }

                    if (field.type === "boolean") {
                      return (
                        <div key={field.key}>
                          <label className="mb-1 block text-xs opacity-75">{field.label}</label>
                          <select
                            className={SELECT}
                            value={
                              typeof val === "boolean"
                                ? val
                                  ? "true"
                                  : "false"
                                : ""
                            }
                            onChange={(e) => {
                              const raw = e.target.value;
                              setForm((prev) => ({
                                ...prev,
                                custom_values: {
                                  ...prev.custom_values,
                                  [field.key]:
                                    raw === ""
                                      ? ""
                                      : raw === "true"
                                        ? true
                                        : false,
                                },
                              }));
                            }}
                          >
                            <option value="">Seleccionar</option>
                            <option value="true">Sí</option>
                            <option value="false">No</option>
                          </select>
                        </div>
                      );
                    }

                    return (
                      <div key={field.key}>
                        <label className="mb-1 block text-xs opacity-75">{field.label}</label>
                        <input
                          {...commonProps}
                          type={
                            field.type === "number"
                              ? "number"
                              : field.type === "date"
                                ? "date"
                                : "text"
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            )}

            <SectionCard
              id="pax"
              title="Pax borrador"
              subtitle="Titular y acompañantes opcionales"
              open={Boolean(formSections.pax)}
              onToggle={toggleFormSection}
              right={
                <button
                  type="button"
                  className={AMBER_BTN}
                  onClick={(e) => {
                    e.stopPropagation();
                    addPaxDraft();
                  }}
                >
                  Agregar pax
                </button>
              }
            >
              {form.pax_drafts.length === 0 ? (
                <p className="text-xs opacity-75">No hay pax cargados.</p>
              ) : (
                <div className="space-y-3">
                  {form.pax_drafts.map((p, idx) => (
                    <div
                      key={`pax-${idx}`}
                      className="rounded-2xl border border-sky-300/30 bg-white/55 p-3 dark:border-sky-200/20 dark:bg-sky-950/20"
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <select
                          className={SELECT}
                          value={p.mode === "existing" ? "existing" : "free"}
                          onChange={(e) =>
                            updatePaxDraft(idx, {
                              mode: e.target.value === "existing" ? "existing" : "free",
                              client_id: e.target.value === "existing" ? p.client_id || null : null,
                            })
                          }
                        >
                          <option value="free">Pax libre</option>
                          <option value="existing">Pax existente</option>
                        </select>
                        <label className="inline-flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={Boolean(p.is_titular)}
                            onChange={(e) =>
                              updatePaxDraft(idx, { is_titular: e.target.checked }, true)
                            }
                          />
                          Titular
                        </label>
                        <button
                          type="button"
                          className={DANGER_BTN}
                          onClick={() => removePaxDraft(idx)}
                        >
                          Quitar
                        </button>
                      </div>

                      {p.mode === "existing" ? (
                        <select
                          className={SELECT}
                          value={p.client_id || ""}
                          onChange={(e) =>
                            updatePaxDraft(idx, {
                              client_id: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                        >
                          <option value="">Seleccionar pasajero</option>
                          {passengers.map((opt) => (
                            <option key={opt.id_client} value={opt.id_client}>
                              {opt.first_name} {opt.last_name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="grid gap-2 md:grid-cols-2">
                          <input
                            className={INPUT}
                            placeholder="Nombre"
                            value={p.first_name || ""}
                            onChange={(e) => updatePaxDraft(idx, { first_name: e.target.value })}
                          />
                          <input
                            className={INPUT}
                            placeholder="Apellido"
                            value={p.last_name || ""}
                            onChange={(e) => updatePaxDraft(idx, { last_name: e.target.value })}
                          />
                          <input
                            className={INPUT}
                            placeholder="Teléfono"
                            value={p.phone || ""}
                            onChange={(e) => updatePaxDraft(idx, { phone: e.target.value })}
                          />
                          <input
                            className={INPUT}
                            placeholder="Email"
                            value={p.email || ""}
                            onChange={(e) => updatePaxDraft(idx, { email: e.target.value })}
                          />
                          <input
                            type="date"
                            className={INPUT}
                            value={p.birth_date || ""}
                            onChange={(e) => updatePaxDraft(idx, { birth_date: e.target.value })}
                          />
                          <div className="space-y-1">
                            <DestinationPicker
                              type="country"
                              multiple={false}
                              value={null}
                              onChange={(value) =>
                                updatePaxDraft(idx, {
                                  nationality: destinationValueToLabel(value),
                                })
                              }
                              placeholder="Nacionalidad"
                              includeDisabled={true}
                              className="relative z-30 [&>label]:hidden"
                            />
                            {p.nationality ? (
                              <p className="text-xs text-sky-900/70 dark:text-sky-100/70">
                                Guardará: <b>{p.nationality}</b>
                              </p>
                            ) : null}
                          </div>
                          <select
                            className={SELECT}
                            value={p.gender || ""}
                            onChange={(e) => updatePaxDraft(idx, { gender: e.target.value })}
                          >
                            <option value="">Género</option>
                            <option value="Masculino">Masculino</option>
                            <option value="Femenino">Femenino</option>
                            <option value="Otro">Otro</option>
                            <option value="Prefiere no decir">Prefiere no decir</option>
                          </select>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              id="services"
              title="Servicios borrador"
              subtitle="Servicios opcionales a convertir luego en reserva"
              open={Boolean(formSections.services)}
              onToggle={toggleFormSection}
              right={
                <button
                  type="button"
                  className={AMBER_BTN}
                  onClick={(e) => {
                    e.stopPropagation();
                    addServiceDraft();
                  }}
                >
                  Agregar servicio
                </button>
              }
            >
              {form.service_drafts.length === 0 ? (
                <p className="text-xs opacity-75">No hay servicios cargados.</p>
              ) : (
                <div className="space-y-3">
                  {form.service_drafts.map((s, idx) => (
                    <div
                      key={`svc-${idx}`}
                      className="rounded-2xl border border-sky-300/30 bg-white/55 p-3 dark:border-sky-200/20 dark:bg-sky-950/20"
                    >
                      <div className="mb-2 flex justify-end">
                        <button
                          type="button"
                          className={DANGER_BTN}
                          onClick={() => removeServiceDraft(idx)}
                        >
                          Quitar
                        </button>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        <select
                          className={SELECT}
                          value={s.type || ""}
                          onChange={(e) => updateServiceDraft(idx, { type: e.target.value })}
                          disabled={loadingServiceTypes}
                        >
                          <option value="">Tipo de servicio</option>
                          {serviceTypes.map((typeOption) => (
                            <option key={typeOption.value} value={typeOption.value}>
                              {typeOption.label}
                            </option>
                          ))}
                          {s.type &&
                            !serviceTypes.some((typeOption) => typeOption.value === s.type) && (
                              <option value={s.type}>{s.type} (no listado)</option>
                            )}
                        </select>
                        <select
                          className={SELECT}
                          value={s.currency || ""}
                          onChange={(e) => updateServiceDraft(idx, { currency: e.target.value })}
                          disabled={loadingCurrencies}
                        >
                          <option value="">Moneda</option>
                          {currencyOptions.map((code) => (
                            <option key={code} value={code}>
                              {code}
                            </option>
                          ))}
                          {s.currency &&
                            !currencyOptions.includes(s.currency.toUpperCase()) && (
                              <option value={s.currency}>{s.currency} (no listado)</option>
                            )}
                        </select>
                        <input
                          type="number"
                          className={INPUT}
                          placeholder="Venta"
                          value={typeof s.sale_price === "number" ? s.sale_price : ""}
                          onChange={(e) =>
                            updateServiceDraft(idx, {
                              sale_price: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                        />
                        <input
                          type="number"
                          className={INPUT}
                          placeholder="Costo"
                          value={typeof s.cost_price === "number" ? s.cost_price : ""}
                          onChange={(e) =>
                            updateServiceDraft(idx, {
                              cost_price: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                        />
                        <select
                          className={SELECT}
                          value={s.operator_id || ""}
                          onChange={(e) =>
                            updateServiceDraft(idx, {
                              operator_id: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                        >
                          <option value="">Operador</option>
                          {operators.map((op) => (
                            <option key={op.id_operator} value={op.id_operator}>
                              {op.name}
                            </option>
                          ))}
                        </select>
                        <div className="space-y-1">
                          <DestinationPicker
                            type="destination"
                            multiple={false}
                            value={null}
                            onChange={(value) =>
                              updateServiceDraft(idx, {
                                destination: destinationValueToLabel(value),
                              })
                            }
                            placeholder="Destino"
                            className="relative z-30 [&>label]:hidden"
                          />
                          {s.destination ? (
                            <p className="text-xs text-sky-900/70 dark:text-sky-100/70">
                              Guardará: <b>{s.destination}</b>
                            </p>
                          ) : null}
                        </div>
                        <input
                          className={INPUT}
                          placeholder="Referencia / Nro File / Localizador"
                          value={s.reference || ""}
                          onChange={(e) =>
                            updateServiceDraft(idx, { reference: e.target.value })
                          }
                        />
                        <input
                          type="date"
                          className={INPUT}
                          value={s.departure_date || ""}
                          onChange={(e) =>
                            updateServiceDraft(idx, { departure_date: e.target.value })
                          }
                        />
                        <input
                          type="date"
                          className={INPUT}
                          value={s.return_date || ""}
                          onChange={(e) =>
                            updateServiceDraft(idx, { return_date: e.target.value })
                          }
                        />
                        <textarea
                          className={`${INPUT} min-h-16 md:col-span-2`}
                          placeholder="Descripción"
                          value={s.description || ""}
                          onChange={(e) =>
                            updateServiceDraft(idx, { description: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={BTN} onClick={saveQuote} disabled={saving}>
                {saving
                  ? "Guardando..."
                  : formMode === "edit"
                    ? "Guardar cambios"
                    : "Crear cotización"}
              </button>
              {formMode === "edit" && (
                <button type="button" className={SUBTLE_BTN} onClick={startCreate}>
                  Nueva cotización
                </button>
              )}
            </div>
          </div>

          <div className={`${GLASS} space-y-4 p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-sky-950 dark:text-sky-50">
                  Listado
                </h2>
                <p className="text-xs text-sky-900/75 dark:text-sky-100/70">
                  Vistas: card, grilla y tabla.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={SUBTLE_BTN}
                  onClick={() => void loadQuotes()}
                  disabled={loading}
                >
                  {loading ? "Cargando..." : "Actualizar"}
                </button>
                <span className={CHIP}>{quoteStats.visible} visibles</span>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <div className="relative">
                <input
                  className={`${INPUT} pr-12`}
                  placeholder="Buscar por número, cliente, teléfono o email"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-sky-700/70 dark:text-sky-100/60">
                  #{quoteStats.visible}
                </span>
              </div>
              <button
                type="button"
                className={hasActiveFilters ? AMBER_BTN : SUBTLE_BTN}
                onClick={() => setFiltersOpen((prev) => !prev)}
              >
                {filtersOpen ? "Ocultar filtros" : "Mostrar filtros"}
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {([
                { id: "card", label: "Card" },
                { id: "grid", label: "Grilla" },
                { id: "table", label: "Tabla" },
              ] as Array<{ id: QuoteListView; label: string }>).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className={listView === mode.id ? AMBER_BTN : SUBTLE_BTN}
                  onClick={() => setListView(mode.id)}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            <AnimatePresence initial={false}>
              {filtersOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className={`${SECTION_GLASS} space-y-3 p-3`}
                >
                  <div className="grid gap-2 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs opacity-75">Responsable</label>
                      <select
                        className={SELECT}
                        value={ownerFilter}
                        onChange={(e) => setOwnerFilter(e.target.value)}
                      >
                        <option value="all">Todos</option>
                        {users.map((u) => (
                          <option key={u.id_user} value={u.id_user}>
                            {`${u.first_name || ""} ${u.last_name || ""}`.trim() ||
                              u.email ||
                              `Usuario ${u.id_user}`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs opacity-75">Orden</label>
                      <select
                        className={SELECT}
                        value={sortBy}
                        onChange={(e) =>
                          setSortBy(
                            e.target.value as
                              | "updated_desc"
                              | "updated_asc"
                              | "created_desc"
                              | "created_asc"
                              | "quote_desc"
                              | "quote_asc",
                          )
                        }
                      >
                        <option value="updated_desc">Actualizadas (nuevas primero)</option>
                        <option value="updated_asc">Actualizadas (viejas primero)</option>
                        <option value="created_desc">Creadas (nuevas primero)</option>
                        <option value="created_asc">Creadas (viejas primero)</option>
                        <option value="quote_desc">Número mayor a menor</option>
                        <option value="quote_asc">Número menor a mayor</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs opacity-75">Creada desde</label>
                      <input
                        type="date"
                        className={INPUT}
                        value={createdFrom}
                        onChange={(e) => setCreatedFrom(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs opacity-75">Creada hasta</label>
                      <input
                        type="date"
                        className={INPUT}
                        value={createdTo}
                        onChange={(e) => setCreatedTo(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs opacity-75">Pax</label>
                      <select
                        className={SELECT}
                        value={paxFilter}
                        onChange={(e) => setPaxFilter(e.target.value as PresenceFilter)}
                      >
                        <option value="all">Todos</option>
                        <option value="with">Con pax</option>
                        <option value="without">Sin pax</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs opacity-75">Servicios</label>
                      <select
                        className={SELECT}
                        value={serviceFilter}
                        onChange={(e) => setServiceFilter(e.target.value as PresenceFilter)}
                      >
                        <option value="all">Todos</option>
                        <option value="with">Con servicios</option>
                        <option value="without">Sin servicios</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button type="button" className={SUBTLE_BTN} onClick={clearFilters}>
                      Limpiar filtros
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {filteredQuotes.length === 0 ? (
              <div className="rounded-2xl border border-sky-300/35 bg-white/50 p-4 text-sm text-sky-900/80 dark:border-sky-200/20 dark:bg-sky-950/20 dark:text-sky-100/80">
                No hay cotizaciones para mostrar con estos filtros.
              </div>
            ) : listView === "table" ? (
              <div className="overflow-hidden rounded-2xl border border-sky-300/35 bg-white/55 shadow-sm shadow-sky-950/10 dark:border-sky-200/20 dark:bg-sky-950/20">
                <div className="max-h-[72vh] overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 bg-sky-100/80 text-sky-900 dark:bg-sky-900/50 dark:text-sky-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">#</th>
                        <th className="px-3 py-2 text-left font-semibold">Cliente</th>
                        <th className="px-3 py-2 text-left font-semibold">Responsable</th>
                        <th className="px-3 py-2 text-left font-semibold">Creación</th>
                        <th className="px-3 py-2 text-left font-semibold">Pax</th>
                        <th className="px-3 py-2 text-left font-semibold">Servicios</th>
                        <th className="px-3 py-2 text-left font-semibold">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredQuotes.map((row) => {
                        const q = row.quote;
                        const isExpanded = expandedQuoteId === q.id_quote;
                        return (
                          <Fragment key={q.id_quote}>
                            <tr
                              className="cursor-pointer border-t border-sky-300/25 text-sky-950 transition hover:bg-sky-100/55 dark:border-sky-200/15 dark:text-sky-50 dark:hover:bg-sky-800/25"
                              onClick={() => toggleExpandedQuote(q.id_quote)}
                            >
                              <td className="px-3 py-2 font-semibold">{row.displayId}</td>
                              <td className="px-3 py-2">
                                <p className="font-semibold">
                                  {q.lead_name || "Cliente sin nombre"}
                                </p>
                                <p className="text-xs opacity-75">{q.lead_phone || "Sin teléfono"}</p>
                              </td>
                              <td className="px-3 py-2">{row.ownerName}</td>
                              <td className="px-3 py-2">{formatDate(q.creation_date)}</td>
                              <td className="px-3 py-2">{row.paxCount}</td>
                              <td className="px-3 py-2">{row.serviceCount}</td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap gap-1">
                                  <button
                                    type="button"
                                    className="rounded-full border border-sky-500/45 bg-sky-300/25 px-3 py-1 text-xs font-medium text-sky-900 transition hover:bg-sky-300/35 dark:text-sky-50"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEdit(q);
                                    }}
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-full border border-amber-500/45 bg-amber-300/25 px-3 py-1 text-xs font-medium text-amber-900 transition hover:bg-amber-300/35 dark:text-amber-50"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openConvert(q);
                                    }}
                                  >
                                    Convertir
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr
                                className="border-t border-sky-300/25 bg-sky-100/40 dark:border-sky-200/15 dark:bg-sky-900/20"
                              >
                                <td colSpan={7} className="p-3">
                                  <div className="grid gap-2 text-xs text-sky-900/90 dark:text-sky-100/85">
                                    <p>
                                      <span className="font-semibold">Detalle:</span>{" "}
                                      {row.bookingDraft.details || "Sin detalle"}
                                    </p>
                                    <p>
                                      <span className="font-semibold">Email:</span>{" "}
                                      {q.lead_email || "Sin email"}
                                    </p>
                                    <p>
                                      <span className="font-semibold">Salida/Regreso:</span>{" "}
                                      {formatDate(row.bookingDraft.departure_date || "")} /{" "}
                                      {formatDate(row.bookingDraft.return_date || "")}
                                    </p>
                                    <div>
                                      <button
                                        type="button"
                                        className={`${DANGER_BTN} px-3 py-1 text-xs`}
                                        onClick={() => deleteQuote(q)}
                                      >
                                        Eliminar
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div
                className={
                  listView === "grid"
                    ? "grid gap-3 md:grid-cols-2"
                    : "flex flex-col gap-3"
                }
              >
                {filteredQuotes.map((row, idx) => {
                  const q = row.quote;
                  const isExpanded = expandedQuoteId === q.id_quote;
                  return (
                    <motion.article
                      key={q.id_quote}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, delay: idx * 0.02 }}
                      className="rounded-2xl border border-sky-300/35 bg-white/60 p-3 shadow-sm shadow-sky-950/10 backdrop-blur-xl dark:border-sky-200/20 dark:bg-sky-950/25"
                    >
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-sky-800/75 dark:text-sky-100/70">
                            Cotización #{row.displayId}
                          </p>
                          <h3 className="text-sm font-semibold text-sky-950 dark:text-sky-50">
                            {q.lead_name || "Cliente sin nombre"}
                          </h3>
                        </div>
                        <span className="text-xs text-sky-900/75 dark:text-sky-100/70">
                          {formatDate(q.creation_date)}
                        </span>
                      </div>

                      <div className="space-y-1 text-xs text-sky-900/85 dark:text-sky-100/80">
                        <p>{q.lead_phone || "Sin teléfono"}</p>
                        <p>{q.lead_email || "Sin email"}</p>
                        <p>{row.ownerName}</p>
                        <p>
                          Pax: {row.paxCount} · Servicios: {row.serviceCount}
                        </p>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" className={SUBTLE_BTN} onClick={() => startEdit(q)}>
                          Editar
                        </button>
                        <button
                          type="button"
                          className={DETAIL_AMBER_BTN}
                          onClick={() => openConvert(q)}
                        >
                          Convertir
                        </button>
                        <button
                          type="button"
                          className={SUBTLE_BTN}
                          onClick={() => toggleExpandedQuote(q.id_quote)}
                        >
                          {isExpanded ? "Ocultar detalle" : "Ver detalle"}
                        </button>
                        <button type="button" className={DANGER_BTN} onClick={() => deleteQuote(q)}>
                          Eliminar
                        </button>
                      </div>

                      <AnimatePresence initial={false}>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            className="overflow-hidden"
                          >
                            <div className="mt-3 grid gap-2 rounded-2xl border border-amber-300/35 bg-gradient-to-br from-amber-100/35 via-amber-100/20 to-emerald-100/35 p-3 text-xs text-amber-900 dark:border-amber-200/30 dark:from-amber-900/25 dark:via-amber-900/15 dark:to-emerald-900/25 dark:text-amber-100">
                              <p>
                                <span className="font-semibold">Detalle:</span>{" "}
                                {row.bookingDraft.details || "Sin detalle"}
                              </p>
                              <p>
                                <span className="font-semibold">Salida:</span>{" "}
                                {formatDate(row.bookingDraft.departure_date || "")}
                              </p>
                              <p>
                                <span className="font-semibold">Regreso:</span>{" "}
                                {formatDate(row.bookingDraft.return_date || "")}
                              </p>
                              <p>
                                <span className="font-semibold">Moneda:</span>{" "}
                                {row.bookingDraft.currency || "Sin moneda"}
                              </p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.article>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {convertQuote && convertForm && (
          <div className="fixed inset-0 z-[120]">
            <div
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
              onClick={closeConvert}
            />
            <div className="absolute left-1/2 top-1/2 max-h-[92vh] w-[min(96vw,1100px)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-3xl border border-white/30 bg-slate-900/95 p-5 text-white shadow-2xl">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">
                  Convertir cotización #{convertQuote.agency_quote_id ?? convertQuote.id_quote}
                </h2>
                <button type="button" className={BTN} onClick={closeConvert}>
                  Cerrar
                </button>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-white/20 bg-white/5 p-4">
                  <h3 className="mb-2 text-sm font-semibold">Datos obligatorios de reserva</h3>
                  <div className="grid gap-2 md:grid-cols-3">
                    {canAssignOwner && (
                      <select
                        className={SELECT}
                        value={convertForm.booking.id_user || ""}
                        onChange={(e) =>
                          setConvertForm((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  booking: {
                                    ...prev.booking,
                                    id_user: e.target.value ? Number(e.target.value) : null,
                                  },
                                }
                              : prev,
                          )
                        }
                      >
                        <option value="">Vendedor</option>
                        {users.map((u) => (
                          <option key={u.id_user} value={u.id_user}>
                            {`${u.first_name || ""} ${u.last_name || ""}`.trim() ||
                              u.email ||
                              `Usuario ${u.id_user}`}
                          </option>
                        ))}
                      </select>
                    )}
                    <input
                      className={INPUT}
                      placeholder="Estado cliente"
                      value={convertForm.booking.clientStatus}
                      onChange={(e) =>
                        setConvertForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                booking: { ...prev.booking, clientStatus: e.target.value },
                              }
                            : prev,
                        )
                      }
                    />
                    <input
                      className={INPUT}
                      placeholder="Estado operador"
                      value={convertForm.booking.operatorStatus}
                      onChange={(e) =>
                        setConvertForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                booking: { ...prev.booking, operatorStatus: e.target.value },
                              }
                            : prev,
                        )
                      }
                    />
                    <input
                      className={INPUT}
                      placeholder="Estado reserva"
                      value={convertForm.booking.status}
                      onChange={(e) =>
                        setConvertForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                booking: { ...prev.booking, status: e.target.value },
                              }
                            : prev,
                        )
                      }
                    />
                    <input
                      className={INPUT}
                      placeholder="Tipo de factura"
                      value={convertForm.booking.invoice_type}
                      onChange={(e) =>
                        setConvertForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                booking: { ...prev.booking, invoice_type: e.target.value },
                              }
                            : prev,
                        )
                      }
                    />
                    <input
                      type="date"
                      className={INPUT}
                      value={convertForm.booking.departure_date}
                      onChange={(e) =>
                        setConvertForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                booking: {
                                  ...prev.booking,
                                  departure_date: e.target.value,
                                },
                              }
                            : prev,
                        )
                      }
                    />
                    <input
                      type="date"
                      className={INPUT}
                      value={convertForm.booking.return_date}
                      onChange={(e) =>
                        setConvertForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                booking: { ...prev.booking, return_date: e.target.value },
                              }
                            : prev,
                        )
                      }
                    />
                    <textarea
                      className={`${INPUT} min-h-16 md:col-span-3`}
                      placeholder="Detalle"
                      value={convertForm.booking.details}
                      onChange={(e) =>
                        setConvertForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                booking: { ...prev.booking, details: e.target.value },
                              }
                            : prev,
                        )
                      }
                    />
                    <input
                      className={`${INPUT} md:col-span-3`}
                      placeholder="Observación factura"
                      value={convertForm.booking.invoice_observation}
                      onChange={(e) =>
                        setConvertForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                booking: {
                                  ...prev.booking,
                                  invoice_observation: e.target.value,
                                },
                              }
                            : prev,
                        )
                      }
                    />
                    <input
                      className={`${INPUT} md:col-span-3`}
                      placeholder="Observación interna"
                      value={convertForm.booking.observation}
                      onChange={(e) =>
                        setConvertForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                booking: { ...prev.booking, observation: e.target.value },
                              }
                            : prev,
                        )
                      }
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-white/20 bg-white/5 p-4">
                  <h3 className="mb-2 text-sm font-semibold">Titular</h3>
                  <div className="grid gap-2 md:grid-cols-2">
                    <select
                      className={SELECT}
                      value={convertForm.titular.mode}
                      onChange={(e) =>
                        updateConvertPassenger("titular", 0, {
                          mode:
                            e.target.value === "existing" ? "existing" : "new",
                          client_id:
                            e.target.value === "existing"
                              ? convertForm.titular.client_id
                              : null,
                        })
                      }
                    >
                      <option value="new">Crear pax nuevo</option>
                      <option value="existing">Usar pax existente</option>
                    </select>

                    {convertForm.titular.mode === "existing" ? (
                      <select
                        className={SELECT}
                        value={convertForm.titular.client_id || ""}
                        onChange={(e) =>
                          updateConvertPassenger("titular", 0, {
                            client_id: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                      >
                        <option value="">Seleccionar pax</option>
                        {passengers.map((p) => (
                          <option key={p.id_client} value={p.id_client}>
                            {p.first_name} {p.last_name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <>
                        <input
                          className={INPUT}
                          placeholder="Nombre"
                          value={convertForm.titular.first_name}
                          onChange={(e) =>
                            updateConvertPassenger("titular", 0, {
                              first_name: e.target.value,
                            })
                          }
                        />
                        <input
                          className={INPUT}
                          placeholder="Apellido"
                          value={convertForm.titular.last_name}
                          onChange={(e) =>
                            updateConvertPassenger("titular", 0, {
                              last_name: e.target.value,
                            })
                          }
                        />
                        <input
                          className={INPUT}
                          placeholder="Teléfono"
                          value={convertForm.titular.phone}
                          onChange={(e) =>
                            updateConvertPassenger("titular", 0, {
                              phone: e.target.value,
                            })
                          }
                        />
                        <input
                          type="date"
                          className={INPUT}
                          value={convertForm.titular.birth_date}
                          onChange={(e) =>
                            updateConvertPassenger("titular", 0, {
                              birth_date: e.target.value,
                            })
                          }
                        />
                        <div className="space-y-1">
                          <DestinationPicker
                            type="country"
                            multiple={false}
                            value={null}
                            onChange={(value) =>
                              updateConvertPassenger("titular", 0, {
                                nationality: destinationValueToLabel(value),
                              })
                            }
                            placeholder="Nacionalidad"
                            includeDisabled={true}
                            className="relative z-30 [&>label]:hidden"
                          />
                          {convertForm.titular.nationality ? (
                            <p className="text-xs text-sky-100/80">
                              Guardará: <b>{convertForm.titular.nationality}</b>
                            </p>
                          ) : null}
                        </div>
                        <select
                          className={SELECT}
                          value={convertForm.titular.gender}
                          onChange={(e) =>
                            updateConvertPassenger("titular", 0, {
                              gender: e.target.value,
                            })
                          }
                        >
                          <option value="">Género</option>
                          <option value="Masculino">Masculino</option>
                          <option value="Femenino">Femenino</option>
                          <option value="Otro">Otro</option>
                          <option value="Prefiere no decir">Prefiere no decir</option>
                        </select>
                        <input
                          className={INPUT}
                          placeholder="Email"
                          value={convertForm.titular.email}
                          onChange={(e) =>
                            updateConvertPassenger("titular", 0, {
                              email: e.target.value,
                            })
                          }
                        />
                      </>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/20 bg-white/5 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Acompañantes</h3>
                    <button type="button" className={BTN} onClick={addConvertCompanion}>
                      Agregar
                    </button>
                  </div>

                  {convertForm.companions.length === 0 ? (
                    <p className="text-xs opacity-70">Sin acompañantes.</p>
                  ) : (
                    <div className="space-y-3">
                      {convertForm.companions.map((p, idx) => (
                        <div
                          key={`comp-${idx}`}
                          className="rounded-2xl border border-white/20 bg-white/10 p-3"
                        >
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <select
                              className={SELECT}
                              value={p.mode}
                              onChange={(e) =>
                                updateConvertPassenger("companions", idx, {
                                  mode:
                                    e.target.value === "existing"
                                      ? "existing"
                                      : "new",
                                  client_id:
                                    e.target.value === "existing" ? p.client_id : null,
                                })
                              }
                            >
                              <option value="new">Nuevo</option>
                              <option value="existing">Existente</option>
                            </select>
                            <button
                              type="button"
                              className={DANGER_BTN}
                              onClick={() => removeConvertCompanion(idx)}
                            >
                              Quitar
                            </button>
                          </div>

                          {p.mode === "existing" ? (
                            <select
                              className={SELECT}
                              value={p.client_id || ""}
                              onChange={(e) =>
                                updateConvertPassenger("companions", idx, {
                                  client_id: e.target.value ? Number(e.target.value) : null,
                                })
                              }
                            >
                              <option value="">Seleccionar pax</option>
                              {passengers.map((opt) => (
                                <option key={opt.id_client} value={opt.id_client}>
                                  {opt.first_name} {opt.last_name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div className="grid gap-2 md:grid-cols-2">
                              <input
                                className={INPUT}
                                placeholder="Nombre"
                                value={p.first_name}
                                onChange={(e) =>
                                  updateConvertPassenger("companions", idx, {
                                    first_name: e.target.value,
                                  })
                                }
                              />
                              <input
                                className={INPUT}
                                placeholder="Apellido"
                                value={p.last_name}
                                onChange={(e) =>
                                  updateConvertPassenger("companions", idx, {
                                    last_name: e.target.value,
                                  })
                                }
                              />
                              <input
                                className={INPUT}
                                placeholder="Teléfono"
                                value={p.phone}
                                onChange={(e) =>
                                  updateConvertPassenger("companions", idx, {
                                    phone: e.target.value,
                                  })
                                }
                              />
                              <input
                                type="date"
                                className={INPUT}
                                value={p.birth_date}
                                onChange={(e) =>
                                  updateConvertPassenger("companions", idx, {
                                    birth_date: e.target.value,
                                  })
                                }
                              />
                              <div className="space-y-1">
                                <DestinationPicker
                                  type="country"
                                  multiple={false}
                                  value={null}
                                  onChange={(value) =>
                                    updateConvertPassenger("companions", idx, {
                                      nationality: destinationValueToLabel(value),
                                    })
                                  }
                                  placeholder="Nacionalidad"
                                  includeDisabled={true}
                                  className="relative z-30 [&>label]:hidden"
                                />
                                {p.nationality ? (
                                  <p className="text-xs text-sky-100/80">
                                    Guardará: <b>{p.nationality}</b>
                                  </p>
                                ) : null}
                              </div>
                              <select
                                className={SELECT}
                                value={p.gender}
                                onChange={(e) =>
                                  updateConvertPassenger("companions", idx, {
                                    gender: e.target.value,
                                  })
                                }
                              >
                                <option value="">Género</option>
                                <option value="Masculino">Masculino</option>
                                <option value="Femenino">Femenino</option>
                                <option value="Otro">Otro</option>
                                <option value="Prefiere no decir">Prefiere no decir</option>
                              </select>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-white/20 bg-white/5 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Servicios</h3>
                    <button type="button" className={BTN} onClick={addConvertService}>
                      Agregar
                    </button>
                  </div>

                  {convertForm.services.length === 0 ? (
                    <p className="text-xs opacity-70">Sin servicios para convertir.</p>
                  ) : (
                    <div className="space-y-3">
                      {convertForm.services.map((s, idx) => (
                        <div
                          key={`conv-svc-${idx}`}
                          className="rounded-2xl border border-white/20 bg-white/10 p-3"
                        >
                          <div className="mb-2 flex justify-end">
                            <button
                              type="button"
                              className={DANGER_BTN}
                              onClick={() => removeConvertService(idx)}
                            >
                              Quitar
                            </button>
                          </div>
                          <div className="grid gap-2 md:grid-cols-2">
                            <select
                              className={SELECT}
                              value={s.type}
                              onChange={(e) =>
                                updateConvertService(idx, { type: e.target.value })
                              }
                              disabled={loadingServiceTypes}
                            >
                              <option value="">Tipo de servicio</option>
                              {serviceTypes.map((typeOption) => (
                                <option key={typeOption.value} value={typeOption.value}>
                                  {typeOption.label}
                                </option>
                              ))}
                              {s.type &&
                                !serviceTypes.some(
                                  (typeOption) => typeOption.value === s.type,
                                ) && <option value={s.type}>{s.type} (no listado)</option>}
                            </select>
                            <select
                              className={SELECT}
                              value={s.currency}
                              onChange={(e) =>
                                updateConvertService(idx, { currency: e.target.value })
                              }
                              disabled={loadingCurrencies}
                            >
                              <option value="">Moneda</option>
                              {currencyOptions.map((code) => (
                                <option key={code} value={code}>
                                  {code}
                                </option>
                              ))}
                              {s.currency &&
                                !currencyOptions.includes(s.currency.toUpperCase()) && (
                                  <option value={s.currency}>{s.currency} (no listado)</option>
                                )}
                            </select>
                            <input
                              type="number"
                              className={INPUT}
                              placeholder="Venta"
                              value={s.sale_price}
                              onChange={(e) =>
                                updateConvertService(idx, { sale_price: e.target.value })
                              }
                            />
                            <input
                              type="number"
                              className={INPUT}
                              placeholder="Costo"
                              value={s.cost_price}
                              onChange={(e) =>
                                updateConvertService(idx, { cost_price: e.target.value })
                              }
                            />
                            <select
                              className={SELECT}
                              value={s.operator_id || ""}
                              onChange={(e) =>
                                updateConvertService(idx, {
                                  operator_id: e.target.value ? Number(e.target.value) : null,
                                })
                              }
                            >
                              <option value="">Operador</option>
                              {operators.map((op) => (
                                <option key={op.id_operator} value={op.id_operator}>
                                  {op.name}
                                </option>
                              ))}
                            </select>
                            <div className="space-y-1">
                              <DestinationPicker
                                type="destination"
                                multiple={false}
                                value={null}
                                onChange={(value) =>
                                  updateConvertService(idx, {
                                    destination: destinationValueToLabel(value),
                                  })
                                }
                                placeholder="Destino"
                                className="relative z-30 [&>label]:hidden"
                              />
                              {s.destination ? (
                                <p className="text-xs text-sky-100/80">
                                  Guardará: <b>{s.destination}</b>
                                </p>
                              ) : null}
                            </div>
                            <input
                              className={INPUT}
                              placeholder="Referencia / Nro File / Localizador"
                              value={s.reference}
                              onChange={(e) =>
                                updateConvertService(idx, { reference: e.target.value })
                              }
                            />
                            <input
                              type="date"
                              className={INPUT}
                              value={s.departure_date}
                              onChange={(e) =>
                                updateConvertService(idx, {
                                  departure_date: e.target.value,
                                })
                              }
                            />
                            <input
                              type="date"
                              className={INPUT}
                              value={s.return_date}
                              onChange={(e) =>
                                updateConvertService(idx, {
                                  return_date: e.target.value,
                                })
                              }
                            />
                            <textarea
                              className={`${INPUT} min-h-16 md:col-span-2`}
                              placeholder="Descripción"
                              value={s.description}
                              onChange={(e) =>
                                updateConvertService(idx, {
                                  description: e.target.value,
                                })
                              }
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={BTN}
                    disabled={converting}
                    onClick={submitConvert}
                  >
                    {converting ? "Convirtiendo..." : "Confirmar conversión"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </ProtectedRoute>
  );
}
