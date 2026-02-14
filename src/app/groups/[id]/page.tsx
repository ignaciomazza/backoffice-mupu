"use client";

import Link from "next/link";
import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useParams } from "next/navigation";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { AnimatePresence, motion } from "framer-motion";
import { requestGroupApi } from "@/lib/groups/clientApi";
import ClientPicker from "@/components/clients/ClientPicker";
import DestinationPicker, {
  DestinationOption,
} from "@/components/DestinationPicker";
import type { Client, ClientCustomField } from "@/types";
import type {
  Booking,
  ClientPayment,
  Invoice,
  Operator,
  OperatorDue,
  Receipt,
  Service,
} from "@/types";
import type { CreditNoteWithItems } from "@/services/creditNotes";
import {
  DEFAULT_REQUIRED_FIELDS,
  DOCUMENT_ANY_KEY,
  normalizeCustomFields,
  normalizeHiddenFields,
  normalizeRequiredFields,
} from "@/utils/clientConfig";
import { useAuth } from "@/context/AuthContext";
import ReceiptForm from "@/components/receipts/ReceiptForm";
import ReceiptList from "@/components/receipts/ReceiptList";
import ClientPaymentForm from "@/components/client-payments/ClientPaymentForm";
import ClientPaymentList from "@/components/client-payments/ClientPaymentList";
import OperatorDueForm from "@/components/operator-dues/OperatorDueForm";
import OperatorDueList from "@/components/operator-dues/OperatorDueList";
import OperatorPaymentForm from "@/components/investments/OperatorPaymentForm";
import OperatorPaymentList from "@/components/investments/OperatorPaymentList";
import InvoiceList from "@/components/invoices/InvoiceList";
import CreditNoteList from "@/components/credit-notes/CreditNoteList";
import type { SubmitResult } from "@/types/receipts";

type GroupStatus =
  | "BORRADOR"
  | "PUBLICADA"
  | "CONFIRMADA"
  | "CERRADA"
  | "CANCELADA";

type GroupType = "AGENCIA" | "ESTUDIANTIL" | "PRECOMPRADO";

type Departure = {
  id_travel_group_departure: number;
  agency_travel_group_departure_id?: number | null;
  public_id: string | null;
  name: string;
  code?: string | null;
  status: string;
  departure_date: string;
  return_date: string | null;
  capacity_total: number | null;
};

type Group = {
  id_travel_group: number;
  agency_travel_group_id?: number | null;
  public_id: string | null;
  code?: string | null;
  name: string;
  type: GroupType;
  status: GroupStatus;
  capacity_mode: string;
  capacity_total: number | null;
  allow_overbooking: boolean;
  waitlist_enabled: boolean;
  sale_mode?: string | null;
  start_date: string | null;
  end_date: string | null;
  departures: Departure[];
  _count: {
    passengers: number;
    bookings: number;
    departures: number;
    inventories: number;
  };
};

type PassengerItem = {
  id_travel_group_passenger: number;
  status: string;
  waitlist_position: number | null;
  metadata?: Record<string, unknown> | null;
  client_id: number | null;
  booking_id: number | null;
  client: {
    id_client: number;
    agency_client_id: number | null;
    first_name: string;
    last_name: string;
    dni_number: string | null;
    phone: string;
    email: string | null;
  } | null;
  booking: {
    id_booking: number;
    agency_booking_id: number | null;
    status: string;
    clientStatus: string;
    details: string;
  } | null;
  travelGroupDeparture: {
    id_travel_group_departure: number;
    name: string;
  } | null;
  pending_payment: {
    amount: string;
    count: number;
  };
};

type GroupInventoryItem = {
  id_travel_group_inventory: number;
  agency_travel_group_inventory_id: number | null;
  travel_group_departure_id: number | null;
  inventory_type: string;
  service_type: string | null;
  label: string;
  provider: string | null;
  locator: string | null;
  total_qty: number;
  assigned_qty: number;
  confirmed_qty: number;
  blocked_qty: number;
  currency: string | null;
  unit_cost: string | number | null;
  note: string | null;
  travelGroupDeparture?: {
    id_travel_group_departure: number;
    name: string;
    departure_date: string | Date;
  } | null;
};

type ServiceTypeOption = {
  id_service_type: number;
  code: string;
  name: string;
  enabled?: boolean;
};

type OperatorOption = {
  id_operator: number;
  agency_operator_id?: number | null;
  name: string;
};

type FinanceCurrencyOption = {
  code: string;
  name?: string | null;
  symbol?: string | null;
  enabled?: boolean;
  is_primary?: boolean;
};

type ServiceCalcConfigPayload = {
  transfer_fee_pct?: number | string | null;
};

type InventoryFinancialMeta = {
  v: 1;
  pricingMode?: "MANUAL" | "VENTA_TOTAL";
  billingMode?: "AUTO" | "MANUAL";
  operatorId?: number | null;
  saleUnitPrice?: number | null;
  saleTotalPrice?: number | null;
  taxable21?: number | null;
  taxable105?: number | null;
  exemptAmount?: number | null;
  otherTaxes?: number | null;
  transferFeePct?: number | null;
};

type InventoryFinancialRow = {
  inventoryId: number;
  currency: string;
  totalQty: number;
  assignedQty: number;
  confirmedQty: number;
  blockedQty: number;
  availableQty: number;
  unitCost: number;
  costTotal: number;
  costAssigned: number;
  costConfirmed: number;
  costBlocked: number;
  costAvailable: number;
  saleTotal: number;
  transferFeePct: number;
  transferFeeAmount: number;
  taxesTotal: number;
  grossMargin: number;
  operationalDebt: number;
};

type InventoryFinancialSummary = {
  currency: string;
  servicesCount: number;
  totalQty: number;
  assignedQty: number;
  confirmedQty: number;
  blockedQty: number;
  availableQty: number;
  costTotal: number;
  costAssigned: number;
  costConfirmed: number;
  costBlocked: number;
  costAvailable: number;
  saleTotal: number;
  transferFeeAmount: number;
  taxesTotal: number;
  grossMargin: number;
  operationalDebt: number;
};

type GroupFinancePassengerOption = {
  passengerId: number;
  bookingId: number;
  clientId: number;
  agencyBookingId: number | null;
  agencyClientId: number | null;
  passengerName: string;
  departureName: string | null;
  status: string;
};

type GroupFinanceReservationOption = {
  key: string;
  label: string;
  bookingIds: number[];
  primaryBookingId: number;
  primaryAgencyBookingId: number | null;
  passengerCount: number;
  departureId: number | null;
  departureName: string | null;
};

type FinanceBookingPayload = Booking & {
  Receipt?: Receipt[];
  invoices?: Invoice[];
  services?: Service[];
  public_id?: string | null;
};

type FinanceCurrencySummary = {
  currency: string;
  pendingClientAmount: number;
  overdueClientAmount: number;
  pendingOperatorAmount: number;
  receiptsAmount: number;
  invoicedAmount: number;
  creditNotesAmount: number;
  netBalance: number;
};

type ClientEditableDraft = {
  id_client?: number;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  dni_number: string;
  passport_number: string;
  tax_id: string;
  birth_date: string;
  nationality: string;
  gender: string;
  address: string;
  locality: string;
  postal_code: string;
  company_name: string;
  commercial_address: string;
  category_id: string;
  custom_fields: Record<string, string>;
} | null;

type ClientConfigPayload = {
  required_fields?: unknown;
  hidden_fields?: unknown;
  custom_fields?: unknown;
} | null;

type PassengerCategoryOption = {
  id_category: number;
  name: string;
  enabled?: boolean;
};

type InventoryDraft = {
  departure_id: string;
  inventory_type: string;
  service_type: string;
  operator_id: string;
  label: string;
  provider: string;
  locator: string;
  pricing_mode: "MANUAL" | "VENTA_TOTAL";
  billing_mode: "AUTO" | "MANUAL";
  total_qty: string;
  assigned_qty: string;
  confirmed_qty: string;
  blocked_qty: string;
  currency: string;
  unit_cost: string;
  sale_unit_price: string;
  sale_total_price: string;
  taxable_21: string;
  taxable_105: string;
  exempt_amount: string;
  other_taxes: string;
  transfer_fee_pct: string;
  note: string;
};

type DepartureDetail = Departure & {
  code: string | null;
  release_date: string | null;
  allow_overbooking: boolean | null;
  overbooking_limit: number | null;
  waitlist_enabled: boolean | null;
  waitlist_limit: number | null;
  note: string | null;
};

type DepartureDraft = {
  name: string;
  code: string;
  status: GroupStatus;
  departure_date: string;
  return_date: string;
  release_date: string;
  capacity_total: string;
  allow_overbooking: boolean;
  overbooking_limit: string;
  waitlist_enabled: boolean;
  waitlist_limit: string;
  note: string;
};

type BulkProgress = {
  title: string;
  status: "running" | "success" | "error";
  percent: number;
  step: string;
  lines: string[];
  timestamp: number;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "-";
  return d.toLocaleDateString("es-AR");
}

function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parsePassengerNote(
  metadata: Record<string, unknown> | null | undefined,
): string {
  if (!metadata || typeof metadata !== "object") return "";
  const raw = metadata.note;
  return typeof raw === "string" ? raw : "";
}

function toAmountNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

const INVENTORY_META_PREFIX = "[OFI_INV_META]";
const INVENTORY_META_SUFFIX = "[/OFI_INV_META]";

function normalizeMoneyValue(
  value: number | string | null | undefined,
): number | null {
  if (value == null || value === "") return null;
  const parsed =
    typeof value === "number"
      ? value
      : Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed)) return null;
  return Number(parsed.toFixed(2));
}

function parseInventoryNote(
  note: string | null | undefined,
): { noteText: string; meta: InventoryFinancialMeta | null } {
  const raw = String(note || "");
  const start = raw.indexOf(INVENTORY_META_PREFIX);
  const end = raw.indexOf(INVENTORY_META_SUFFIX);
  if (start !== 0 || end <= INVENTORY_META_PREFIX.length) {
    return { noteText: raw.trim(), meta: null };
  }
  const jsonText = raw
    .slice(INVENTORY_META_PREFIX.length, end)
    .trim();
  const text = raw.slice(end + INVENTORY_META_SUFFIX.length).trim();
  try {
    const parsed = JSON.parse(jsonText) as Partial<InventoryFinancialMeta>;
    if (Number(parsed?.v) !== 1) {
      return { noteText: text, meta: null };
    }
    const pricingMode =
      parsed.pricingMode === "VENTA_TOTAL" ? "VENTA_TOTAL" : "MANUAL";
    const billingMode =
      parsed.billingMode === "MANUAL" ? "MANUAL" : "AUTO";
    const meta: InventoryFinancialMeta = {
      v: 1,
      pricingMode,
      billingMode,
      operatorId:
        typeof parsed.operatorId === "number" && parsed.operatorId > 0
          ? parsed.operatorId
          : null,
      saleUnitPrice: normalizeMoneyValue(parsed.saleUnitPrice),
      saleTotalPrice: normalizeMoneyValue(parsed.saleTotalPrice),
      taxable21: normalizeMoneyValue(parsed.taxable21),
      taxable105: normalizeMoneyValue(parsed.taxable105),
      exemptAmount: normalizeMoneyValue(parsed.exemptAmount),
      otherTaxes: normalizeMoneyValue(parsed.otherTaxes),
      transferFeePct: normalizeMoneyValue(parsed.transferFeePct),
    };
    return { noteText: text, meta };
  } catch {
    return { noteText: raw.trim(), meta: null };
  }
}

function buildInventoryNote(
  noteText: string,
  meta: InventoryFinancialMeta | null,
): string | null {
  const normalizedNote = noteText.trim();
  if (!meta) return normalizedNote || null;
  const compact = {
    v: 1,
    pricingMode: meta.pricingMode || "MANUAL",
    billingMode: meta.billingMode || "AUTO",
    operatorId: meta.operatorId || null,
    saleUnitPrice: normalizeMoneyValue(meta.saleUnitPrice),
    saleTotalPrice: normalizeMoneyValue(meta.saleTotalPrice),
    taxable21: normalizeMoneyValue(meta.taxable21),
    taxable105: normalizeMoneyValue(meta.taxable105),
    exemptAmount: normalizeMoneyValue(meta.exemptAmount),
    otherTaxes: normalizeMoneyValue(meta.otherTaxes),
    transferFeePct: normalizeMoneyValue(meta.transferFeePct),
  };
  const hasMeaningfulValue = Object.entries(compact).some(([key, value]) => {
    if (key === "v") return false;
    if (value == null) return false;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") return value.trim().length > 0;
    return true;
  });
  if (!hasMeaningfulValue) return normalizedNote || null;
  const serialized = JSON.stringify(compact);
  const merged = `${INVENTORY_META_PREFIX}${serialized}${INVENTORY_META_SUFFIX}${normalizedNote ? `\n${normalizedNote}` : ""}`;
  return merged;
}

function formatMoney(value: number, currency: string): string {
  const code = String(currency || "ARS").toUpperCase();
  if (!Number.isFinite(value)) return `0 ${code}`;
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${code}`;
  }
}

const PASSENGER_STATUSES = [
  "PENDIENTE",
  "CONFIRMADO",
  "LISTA_ESPERA",
  "CANCELADO",
] as const;

const DEPARTURE_STATUS_OPTIONS: GroupStatus[] = [
  "BORRADOR",
  "PUBLICADA",
  "CONFIRMADA",
  "CERRADA",
  "CANCELADA",
];

const STATUS_STYLES: Record<string, string> = {
  BORRADOR:
    "border-slate-300/80 bg-slate-100/80 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200",
  PUBLICADA:
    "border-sky-300/80 bg-sky-100/80 text-sky-700 dark:border-sky-600 dark:bg-sky-900/30 dark:text-sky-200",
  CONFIRMADA:
    "border-emerald-300/80 bg-emerald-100/80 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-200",
  CERRADA:
    "border-zinc-300/80 bg-zinc-100/80 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200",
  CANCELADA:
    "border-amber-300/80 bg-amber-100/90 text-amber-800 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200",
  LISTA_ESPERA:
    "border-amber-300/80 bg-amber-100/90 text-amber-800 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200",
  CONFIRMADO:
    "border-emerald-300/80 bg-emerald-100/80 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-200",
  PENDIENTE:
    "border-sky-300/80 bg-sky-100/80 text-sky-700 dark:border-sky-600 dark:bg-sky-900/30 dark:text-sky-200",
  CANCELADO:
    "border-zinc-300/80 bg-zinc-100/80 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200",
};

const GROUP_STATUS_LABELS: Record<GroupStatus, string> = {
  BORRADOR: "Borrador",
  PUBLICADA: "Publicada",
  CONFIRMADA: "Confirmada",
  CERRADA: "Cerrada",
  CANCELADA: "Cancelada",
};

const GROUP_TYPE_LABELS: Record<GroupType, string> = {
  AGENCIA: "Agencia",
  ESTUDIANTIL: "Estudiantil",
  PRECOMPRADO: "Precomprado",
};

const PASSENGER_STATUS_LABELS: Record<(typeof PASSENGER_STATUSES)[number], string> = {
  PENDIENTE: "Pendiente",
  CONFIRMADO: "Confirmado",
  LISTA_ESPERA: "Lista de espera",
  CANCELADO: "Cancelado",
};

const PILL_BASE =
  "rounded-full border px-3 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";
const PILL_INACTIVE =
  "border-slate-300 bg-white/85 text-slate-700 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-slate-500";
const PILL_SKY_ACTIVE =
  "border-sky-400 bg-sky-100/90 text-sky-800 dark:border-sky-500 dark:bg-sky-900/35 dark:text-sky-200";
const PILL_EMERALD_ACTIVE =
  "border-emerald-400 bg-emerald-100/90 text-emerald-800 dark:border-emerald-500 dark:bg-emerald-900/35 dark:text-emerald-200";
const PILL_AMBER_ACTIVE =
  "border-amber-400 bg-amber-100/90 text-amber-800 dark:border-amber-500 dark:bg-amber-900/35 dark:text-amber-200";
const RESULT_PILL_BASE = "rounded-full px-2.5 py-0.5 text-xs font-medium";
const RESULT_PILL_OK = "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
const RESULT_PILL_WARN = "bg-rose-500/15 text-rose-700 dark:text-rose-300";
const DOC_FIELD_KEYS = ["dni_number", "passport_number", "tax_id"] as const;
const FIELD_INPUT_CLASS =
  "w-full rounded-2xl border border-sky-300/80 bg-white/90 px-3 py-2 text-sm text-slate-900 shadow-sm shadow-slate-900/10 outline-none transition focus:border-sky-500 disabled:cursor-not-allowed disabled:opacity-70 dark:border-sky-700/70 dark:bg-slate-900/70 dark:text-slate-100 dark:focus:border-sky-400";
const FIELD_TEXTAREA_CLASS =
  "w-full rounded-2xl border border-sky-300/80 bg-white/90 px-3 py-2 text-sm text-slate-900 shadow-sm shadow-slate-900/10 outline-none transition focus:border-sky-500 disabled:cursor-not-allowed disabled:opacity-70 dark:border-sky-700/70 dark:bg-slate-900/70 dark:text-slate-100 dark:focus:border-sky-400";
const FIELD_LABEL_CLASS =
  "ml-1 block text-sm font-medium text-slate-900 dark:text-slate-100";
const FIELD_HINT_CLASS = "ml-1 text-xs text-slate-600 dark:text-slate-400";
type SectionFilterKey =
  | "TODO"
  | "GRUPAL"
  | "COBROS"
  | "PAGOS"
  | "FACTURACION";

const SECTION_FILTERS: ReadonlyArray<{
  id: SectionFilterKey;
  label: string;
  tone: "sky" | "emerald" | "amber";
}> = [
  { id: "TODO", label: "Todo", tone: "sky" },
  { id: "GRUPAL", label: "Grupal", tone: "emerald" },
  { id: "COBROS", label: "Cobros", tone: "sky" },
  { id: "PAGOS", label: "Pagos", tone: "amber" },
  { id: "FACTURACION", label: "Facturación", tone: "emerald" },
] as const;

function normalizeCurrencyCode(value: string | null | undefined): string {
  return String(value || "ARS").trim().toUpperCase() || "ARS";
}

function parseApiReceipts(data: unknown): Receipt[] {
  if (!data || typeof data !== "object") return [];
  const rec = data as Record<string, unknown>;
  const raw = Array.isArray(rec.receipts) ? rec.receipts : [];
  return raw
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const row = item as Record<string, unknown>;
      const id = Number(row.id_receipt ?? row.id ?? 0);
      const amountRaw = row.amount ?? row.total ?? 0;
      const amount =
        typeof amountRaw === "number"
          ? amountRaw
          : Number(String(amountRaw || "0").replace(",", "."));
      return {
        ...(item as Partial<Receipt>),
        id_receipt: Number.isFinite(id) ? id : 0,
        receipt_number: String(row.receipt_number ?? row.number ?? ""),
        amount: Number.isFinite(amount) ? amount : 0,
        amount_currency: normalizeCurrencyCode(
          String(row.amount_currency ?? row.currency ?? "ARS"),
        ),
      } as Receipt;
    })
    .filter((item) => item.id_receipt > 0);
}

function pillClass(
  active: boolean,
  tone: "sky" | "emerald" | "amber" = "sky",
): string {
  if (!active) return `${PILL_BASE} ${PILL_INACTIVE}`;
  const toneClass =
    tone === "emerald"
      ? PILL_EMERALD_ACTIVE
      : tone === "amber"
        ? PILL_AMBER_ACTIVE
        : PILL_SKY_ACTIVE;
  return `${PILL_BASE} ${toneClass}`;
}

function Spinner({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="size-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700 dark:border-slate-600 dark:border-t-slate-200" />
      {label}
    </span>
  );
}

function CollapsiblePanel({
  open,
  children,
  className = "",
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          initial={{ height: 0, opacity: 0, y: -6 }}
          animate={{ height: "auto", opacity: 1, y: 0 }}
          exit={{ height: 0, opacity: 0, y: -6 }}
          transition={{
            height: { duration: 0.28, ease: "easeInOut" },
            opacity: { duration: 0.2, ease: "easeInOut" },
            y: { duration: 0.22, ease: "easeInOut" },
          }}
          className={`overflow-hidden ${className}`}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function ToggleIconButton({
  open,
  onClick,
  label,
  disabled = false,
}: {
  open: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="grid size-9 place-items-center rounded-full border border-sky-500/20 bg-sky-50/60 text-sky-950 shadow-sm shadow-sky-950/10 transition hover:bg-sky-100/70 disabled:cursor-not-allowed disabled:opacity-60 dark:border-sky-400/30 dark:bg-sky-100/10 dark:text-sky-100 dark:hover:bg-sky-100/20"
      title={open ? `Ocultar ${label}` : `Mostrar ${label}`}
      aria-label={open ? `Ocultar ${label}` : `Mostrar ${label}`}
      aria-expanded={open}
    >
      {open ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="size-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="size-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      )}
    </button>
  );
}

type ClientDraftField = Exclude<
  keyof NonNullable<ClientEditableDraft>,
  "id_client" | "custom_fields"
>;

function PassengerClientFields({
  draft,
  onChange,
  onCustomChange,
  disabled,
  requiredFields,
  hiddenFields,
  customFields,
  passengerCategories,
  title = "Datos personales",
  description = "Completá datos de contacto, identidad y facturación del pasajero.",
}: {
  draft: ClientEditableDraft;
  onChange: (field: ClientDraftField, value: string) => void;
  onCustomChange: (key: string, value: string) => void;
  disabled: boolean;
  requiredFields: string[];
  hiddenFields: string[];
  customFields: ClientCustomField[];
  passengerCategories: PassengerCategoryOption[];
  title?: string;
  description?: string;
}) {
  if (!draft) return null;

  const hiddenSet = new Set(hiddenFields);
  const normalizedRequired =
    requiredFields.length > 0 ? requiredFields : DEFAULT_REQUIRED_FIELDS;
  const requiredSet = new Set(
    normalizedRequired.filter((field) => !hiddenSet.has(field)),
  );

  const isHidden = (field: string) => hiddenSet.has(field);
  const isRequired = (field: string) => requiredSet.has(field);
  const docRequired = requiredSet.has(DOCUMENT_ANY_KEY);
  const hasDoc = DOC_FIELD_KEYS.some(
    (field) => String(draft[field] ?? "").trim().length > 0,
  );

  const requiredLabel = (label: string, required: boolean) => (
    <label
      className={`${FIELD_LABEL_CLASS} ${
        required ? "after:ml-1 after:text-rose-500 after:content-['*']" : ""
      }`}
    >
      {label}
    </label>
  );

  const handleNationalitySelect = (
    value: DestinationOption | DestinationOption[] | null,
  ) => {
    const selected = value && !Array.isArray(value) ? value.displayLabel : "";
    onChange("nationality", selected);
  };

  return (
    <div className="rounded-2xl border border-sky-300/80 bg-white/70 p-4 shadow-sm shadow-slate-900/10 dark:border-sky-700/70 dark:bg-slate-900/60">
      <div className="mb-3">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </p>
        <p className={FIELD_HINT_CLASS}>{description}</p>
      </div>

      {docRequired && !hasDoc ? (
        <p className="mb-3 rounded-xl border border-amber-300/80 bg-amber-100/85 px-3 py-2 text-xs text-amber-900 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200">
          Debés completar al menos uno: DNI, Pasaporte o CUIT/RUT.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {!isHidden("first_name") ? (
          <div className="space-y-1">
            {requiredLabel("Nombre", isRequired("first_name"))}
            <input
              value={draft.first_name}
              onChange={(e) => onChange("first_name", e.target.value)}
              disabled={disabled}
              placeholder="Ej: Juan"
              className={FIELD_INPUT_CLASS}
            />
          </div>
        ) : null}

        {!isHidden("last_name") ? (
          <div className="space-y-1">
            {requiredLabel("Apellido", isRequired("last_name"))}
            <input
              value={draft.last_name}
              onChange={(e) => onChange("last_name", e.target.value)}
              disabled={disabled}
              placeholder="Ej: Pérez"
              className={FIELD_INPUT_CLASS}
            />
          </div>
        ) : null}

        {!isHidden("phone") ? (
          <div className="space-y-1">
            {requiredLabel("Teléfono", isRequired("phone"))}
            <input
              value={draft.phone}
              onChange={(e) => onChange("phone", e.target.value)}
              disabled={disabled}
              placeholder="Ej: 11 1234 5678"
              className={FIELD_INPUT_CLASS}
            />
          </div>
        ) : null}

        {!isHidden("email") ? (
          <div className="space-y-1">
            {requiredLabel("Correo electrónico", isRequired("email"))}
            <input
              type="email"
              value={draft.email}
              onChange={(e) => onChange("email", e.target.value)}
              disabled={disabled}
              placeholder="nombre@email.com"
              className={FIELD_INPUT_CLASS}
            />
          </div>
        ) : null}

        {!isHidden("gender") ? (
          <div className="space-y-1">
            {requiredLabel("Género", isRequired("gender"))}
            <select
              value={draft.gender}
              onChange={(e) => onChange("gender", e.target.value)}
              disabled={disabled}
              className={FIELD_INPUT_CLASS}
            >
              <option value="">Seleccionar</option>
              <option value="Masculino">Masculino</option>
              <option value="Femenino">Femenino</option>
              <option value="No Binario">No Binario</option>
            </select>
          </div>
        ) : null}

        {!isHidden("birth_date") ? (
          <div className="space-y-1">
            {requiredLabel("Fecha de nacimiento", isRequired("birth_date"))}
            <input
              type="date"
              value={draft.birth_date}
              onChange={(e) => onChange("birth_date", e.target.value)}
              disabled={disabled}
              className={FIELD_INPUT_CLASS}
            />
            <p className={FIELD_HINT_CLASS}>Completá en formato día/mes/año.</p>
          </div>
        ) : null}

        {!isHidden("nationality") ? (
          <div className="space-y-1 md:col-span-2">
            {requiredLabel("Nacionalidad", isRequired("nationality"))}
            <DestinationPicker
              type="country"
              multiple={false}
              value={null}
              onChange={handleNationalitySelect}
              placeholder="Ej.: Argentina, Uruguay..."
              disabled={disabled}
              includeDisabled={true}
            />
            <p className={FIELD_HINT_CLASS}>
              {draft.nationality
                ? `Se guardará: ${draft.nationality}`
                : "Buscá el país para registrar la nacionalidad."}
            </p>
          </div>
        ) : null}

        {!isHidden("dni_number") ? (
          <div className="space-y-1">
            {requiredLabel("Documento / DNI", isRequired("dni_number"))}
            <input
              value={draft.dni_number}
              onChange={(e) => onChange("dni_number", e.target.value)}
              disabled={disabled}
              placeholder="Ej: 32123456"
              className={FIELD_INPUT_CLASS}
            />
          </div>
        ) : null}

        {!isHidden("passport_number") ? (
          <div className="space-y-1">
            {requiredLabel("Pasaporte", isRequired("passport_number"))}
            <input
              value={draft.passport_number}
              onChange={(e) => onChange("passport_number", e.target.value)}
              disabled={disabled}
              placeholder="Ej: AA123456"
              className={FIELD_INPUT_CLASS}
            />
          </div>
        ) : null}

        {!isHidden("tax_id") ? (
          <div className="space-y-1">
            {requiredLabel("CUIT / RUT", isRequired("tax_id"))}
            <input
              value={draft.tax_id}
              onChange={(e) => onChange("tax_id", e.target.value)}
              disabled={disabled}
              placeholder="Ej: 20-12345678-3"
              className={FIELD_INPUT_CLASS}
            />
          </div>
        ) : null}

        {!isHidden("postal_code") ? (
          <div className="space-y-1">
            {requiredLabel("Código postal", isRequired("postal_code"))}
            <input
              value={draft.postal_code}
              onChange={(e) => onChange("postal_code", e.target.value)}
              disabled={disabled}
              placeholder="Ej: 1425"
              className={FIELD_INPUT_CLASS}
            />
          </div>
        ) : null}

        {!isHidden("address") ? (
          <div className="space-y-1 md:col-span-2">
            {requiredLabel("Dirección", isRequired("address"))}
            <input
              value={draft.address}
              onChange={(e) => onChange("address", e.target.value)}
              disabled={disabled}
              placeholder="Ej: Av. Corrientes 1234"
              className={FIELD_INPUT_CLASS}
            />
          </div>
        ) : null}

        {!isHidden("locality") ? (
          <div className="space-y-1">
            {requiredLabel("Localidad", isRequired("locality"))}
            <input
              value={draft.locality}
              onChange={(e) => onChange("locality", e.target.value)}
              disabled={disabled}
              placeholder="Ej: CABA"
              className={FIELD_INPUT_CLASS}
            />
          </div>
        ) : null}

        {!isHidden("company_name") ? (
          <div className="space-y-1">
            {requiredLabel("Razón social", isRequired("company_name"))}
            <input
              value={draft.company_name}
              onChange={(e) => onChange("company_name", e.target.value)}
              disabled={disabled}
              placeholder="Opcional para facturación"
              className={FIELD_INPUT_CLASS}
            />
          </div>
        ) : null}

        {!isHidden("commercial_address") ? (
          <div className="space-y-1 md:col-span-2">
            {requiredLabel(
              "Domicilio comercial",
              isRequired("commercial_address"),
            )}
            <input
              value={draft.commercial_address}
              onChange={(e) => onChange("commercial_address", e.target.value)}
              disabled={disabled}
              placeholder="Opcional para facturación"
              className={FIELD_INPUT_CLASS}
            />
          </div>
        ) : null}

        {passengerCategories.length > 0 ? (
          <div className="space-y-1 md:col-span-2">
            <label className={FIELD_LABEL_CLASS}>Categoría de pasajero</label>
            <select
              value={draft.category_id}
              onChange={(e) => onChange("category_id", e.target.value)}
              disabled={disabled}
              className={FIELD_INPUT_CLASS}
            >
              <option value="">Sin categoría</option>
              {passengerCategories.map((item) => (
                <option key={item.id_category} value={item.id_category}>
                  {item.name}
                </option>
              ))}
            </select>
            <p className={FIELD_HINT_CLASS}>
              Podés usar categorías para segmentar planes y cobros.
            </p>
          </div>
        ) : null}

        {customFields.map((field) => {
          const value = draft.custom_fields[field.key] || "";
          const fieldRequired = Boolean(field.required);
          const inputType = field.type === "number" ? "number" : "text";
          return (
            <div key={field.key} className="space-y-1 md:col-span-2">
              {requiredLabel(field.label, fieldRequired)}
              {field.type === "date" ? (
                <input
                  type="date"
                  value={value}
                  onChange={(e) => onCustomChange(field.key, e.target.value)}
                  disabled={disabled}
                  className={FIELD_INPUT_CLASS}
                />
              ) : (
                <input
                  type={inputType}
                  value={value}
                  onChange={(e) => onCustomChange(field.key, e.target.value)}
                  disabled={disabled}
                  placeholder={field.placeholder || ""}
                  className={FIELD_INPUT_CLASS}
                />
              )}
              {field.help ? (
                <p className={FIELD_HINT_CLASS}>{field.help}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatGroupStatus(value: GroupStatus): string {
  return GROUP_STATUS_LABELS[value] ?? value;
}

function formatGroupType(value: GroupType): string {
  return GROUP_TYPE_LABELS[value] ?? value;
}

function formatPassengerStatus(value: string): string {
  return PASSENGER_STATUS_LABELS[value as keyof typeof PASSENGER_STATUS_LABELS] ?? value;
}

function formatDepartureStatus(value: string): string {
  return GROUP_STATUS_LABELS[value as GroupStatus] ?? value;
}

function formatGroupReference(group: Group): string {
  const code = typeof group.code === "string" ? group.code.trim() : "";
  if (code) return `Código ${code}`;
  if (group.agency_travel_group_id) return `Grupal Nº${group.agency_travel_group_id}`;
  return `Grupal Nº${group.id_travel_group}`;
}

function formatDepartureReference(dep: Departure): string {
  const code = typeof dep.code === "string" ? dep.code.trim() : "";
  if (code) return `Código ${code}`;
  if (dep.agency_travel_group_departure_id) {
    return `Salida Nº${dep.agency_travel_group_departure_id}`;
  }
  return `Salida Nº${dep.id_travel_group_departure}`;
}

function parseOptionalPositiveInteger(raw: string): number | null {
  const normalized = raw.trim();
  if (!normalized) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.trunc(value);
}

function defaultDepartureDraft(source?: Partial<DepartureDetail>): DepartureDraft {
  return {
    name: source?.name ?? "",
    code: source?.code ?? "",
    status: (source?.status as GroupStatus) ?? "BORRADOR",
    departure_date: source?.departure_date?.slice(0, 10) ?? "",
    return_date: source?.return_date?.slice(0, 10) ?? "",
    release_date: source?.release_date?.slice(0, 10) ?? "",
    capacity_total:
      source?.capacity_total != null ? String(source.capacity_total) : "",
    allow_overbooking: Boolean(source?.allow_overbooking),
    overbooking_limit:
      source?.overbooking_limit != null ? String(source.overbooking_limit) : "",
    waitlist_enabled: Boolean(source?.waitlist_enabled),
    waitlist_limit:
      source?.waitlist_limit != null ? String(source.waitlist_limit) : "",
    note: source?.note ?? "",
  };
}

function defaultInventoryDraft(
  source?: Partial<GroupInventoryItem>,
  options?: {
    defaultTransferFeePct?: number;
    operators?: OperatorOption[];
  },
): InventoryDraft {
  const parsedNote = parseInventoryNote(source?.note ?? "");
  const meta = parsedNote.meta;
  const providers = Array.isArray(options?.operators) ? options?.operators : [];
  const fallbackOperator =
    source?.provider &&
    providers.find(
      (op) => op.name.trim().toLowerCase() === source.provider?.trim().toLowerCase(),
    );
  const transferFeePct =
    meta?.transferFeePct != null
      ? meta.transferFeePct
      : (options?.defaultTransferFeePct ?? 2.4);
  return {
    departure_id:
      source?.travel_group_departure_id != null
        ? String(source.travel_group_departure_id)
        : "",
    inventory_type: source?.inventory_type ?? "",
    service_type: source?.service_type ?? "",
    operator_id:
      meta?.operatorId != null && meta.operatorId > 0
        ? String(meta.operatorId)
        : fallbackOperator
          ? String(fallbackOperator.id_operator)
          : "",
    label: source?.label ?? "",
    provider: source?.provider ?? "",
    locator: source?.locator ?? "",
    pricing_mode: meta?.pricingMode === "VENTA_TOTAL" ? "VENTA_TOTAL" : "MANUAL",
    billing_mode: meta?.billingMode === "MANUAL" ? "MANUAL" : "AUTO",
    total_qty:
      source?.total_qty != null ? String(source.total_qty) : "",
    assigned_qty:
      source?.assigned_qty != null ? String(source.assigned_qty) : "0",
    confirmed_qty:
      source?.confirmed_qty != null ? String(source.confirmed_qty) : "0",
    blocked_qty:
      source?.blocked_qty != null ? String(source.blocked_qty) : "0",
    currency: source?.currency ?? "ARS",
    unit_cost:
      source?.unit_cost != null ? String(source.unit_cost) : "",
    sale_unit_price:
      meta?.saleUnitPrice != null ? String(meta.saleUnitPrice) : "",
    sale_total_price:
      meta?.saleTotalPrice != null ? String(meta.saleTotalPrice) : "",
    taxable_21:
      meta?.taxable21 != null ? String(meta.taxable21) : "",
    taxable_105:
      meta?.taxable105 != null ? String(meta.taxable105) : "",
    exempt_amount:
      meta?.exemptAmount != null ? String(meta.exemptAmount) : "",
    other_taxes:
      meta?.otherTaxes != null ? String(meta.otherTaxes) : "",
    transfer_fee_pct:
      transferFeePct != null ? String(transferFeePct) : "",
    note: parsedNote.noteText,
  };
}

function defaultClientDraft(
  source?: Record<string, unknown> | null,
): NonNullable<ClientEditableDraft> {
  const sourceCustomFields =
    source?.custom_fields && typeof source.custom_fields === "object"
      ? (source.custom_fields as Record<string, unknown>)
      : {};
  const customFields: Record<string, string> = {};
  for (const [key, value] of Object.entries(sourceCustomFields)) {
    const normalizedKey = String(key || "").trim();
    const normalizedValue = String(value ?? "").trim();
    if (!normalizedKey || !normalizedValue) continue;
    customFields[normalizedKey] = normalizedValue;
  }

  return {
    id_client:
      source && Number.isFinite(Number(source.id_client))
        ? Number(source.id_client)
        : undefined,
    first_name: String(source?.first_name ?? ""),
    last_name: String(source?.last_name ?? ""),
    phone: String(source?.phone ?? ""),
    email: String(source?.email ?? ""),
    dni_number: String(source?.dni_number ?? ""),
    passport_number: String(source?.passport_number ?? ""),
    tax_id: String(source?.tax_id ?? ""),
    birth_date: toDateInputValue(
      source?.birth_date ? String(source.birth_date) : "",
    ),
    nationality: String(source?.nationality ?? ""),
    gender: String(source?.gender ?? ""),
    address: String(source?.address ?? ""),
    locality: String(source?.locality ?? ""),
    postal_code: String(source?.postal_code ?? ""),
    company_name: String(source?.company_name ?? ""),
    commercial_address: String(source?.commercial_address ?? ""),
    category_id:
      source && Number.isFinite(Number(source.category_id))
        ? String(source.category_id)
        : "",
    custom_fields: customFields,
  };
}

function toFriendlyServiceOptionsError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("unauthorized") || normalized.includes("auth_required")) {
    return "No pudimos cargar la configuración de servicios porque tu sesión expiró. Iniciá sesión nuevamente.";
  }
  if (normalized.includes("sin permisos") || normalized.includes("forbidden")) {
    return "No tenés permisos para ver toda la configuración de servicios. Podés continuar con carga manual.";
  }
  if (normalized.includes("service-type") || normalized.includes("service type")) {
    return "No pudimos cargar los tipos de servicio. Verificá configuración de servicios.";
  }
  return message;
}

export default function GroupDetailPage() {
  const params = useParams<{ id: string }>();
  const groupId = String(params?.id || "");
  const { token, role } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [group, setGroup] = useState<Group | null>(null);
  const [passengers, setPassengers] = useState<PassengerItem[]>([]);
  const [clientRequiredFields, setClientRequiredFields] = useState<string[]>(
    DEFAULT_REQUIRED_FIELDS,
  );
  const [clientHiddenFields, setClientHiddenFields] = useState<string[]>([]);
  const [clientCustomFields, setClientCustomFields] = useState<ClientCustomField[]>([]);
  const [passengerCategories, setPassengerCategories] = useState<
    PassengerCategoryOption[]
  >([]);

  const [bulkProgress, setBulkProgress] = useState<BulkProgress | null>(null);

  const [showDepartureCreate, setShowDepartureCreate] = useState(false);
  const [createDepartureDraft, setCreateDepartureDraft] = useState<DepartureDraft>(
    () => defaultDepartureDraft(),
  );
  const [editingDepartureId, setEditingDepartureId] = useState<number | null>(null);
  const [editingDepartureDraft, setEditingDepartureDraft] = useState<DepartureDraft>(
    () => defaultDepartureDraft(),
  );
  const [loadingDepartureId, setLoadingDepartureId] = useState<number | null>(null);
  const [showDepartureFilters, setShowDepartureFilters] = useState(false);

  const [passengerView, setPassengerView] = useState<"TABLE" | "LIST" | "GRID">("TABLE");
  const [passengerSearch, setPassengerSearch] = useState("");
  const [passengerStatusFilter, setPassengerStatusFilter] = useState<"ALL" | string>("ALL");
  const [showPassengerFilters, setShowPassengerFilters] = useState(false);
  const [showPassengerForm, setShowPassengerForm] = useState(true);
  const [passengerFormMode, setPassengerFormMode] = useState<"ALTA" | "EDICION">(
    "ALTA",
  );
  const [updatingPassengerStatusId, setUpdatingPassengerStatusId] =
    useState<number | null>(null);

  const [newPassengerMode, setNewPassengerMode] = useState<"EXISTENTE" | "NUEVO">(
    "EXISTENTE",
  );
  const [newPassengerClientId, setNewPassengerClientId] = useState<number | null>(
    null,
  );
  const [newPassengerDepartureId, setNewPassengerDepartureId] = useState("");
  const [newClientDraft, setNewClientDraft] =
    useState<ClientEditableDraft>(() => defaultClientDraft());
  const [activePassengerId, setActivePassengerId] = useState<number | null>(null);
  const [activePassengerStatus, setActivePassengerStatus] = useState("");
  const [activePassengerDepartureId, setActivePassengerDepartureId] = useState("");
  const [activePassengerNote, setActivePassengerNote] = useState("");
  const [activeClientDraft, setActiveClientDraft] =
    useState<ClientEditableDraft>(null);
  const [activeClientRaw, setActiveClientRaw] = useState<Record<string, unknown> | null>(null);
  const [activeClientLoading, setActiveClientLoading] = useState(false);

  const [inventories, setInventories] = useState<GroupInventoryItem[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceTypeOption[]>([]);
  const [operatorOptions, setOperatorOptions] = useState<OperatorOption[]>([]);
  const [financeCurrencies, setFinanceCurrencies] = useState<
    FinanceCurrencyOption[]
  >([]);
  const [serviceOptionsError, setServiceOptionsError] = useState<string | null>(
    null,
  );
  const [defaultTransferFeePct, setDefaultTransferFeePct] = useState(2.4);
  const [showInventoryForm, setShowInventoryForm] = useState(false);
  const [editingInventoryId, setEditingInventoryId] = useState<number | null>(
    null,
  );
  const [inventoryProviderMode, setInventoryProviderMode] = useState<
    "OPERADOR" | "MANUAL"
  >("OPERADOR");
  const [inventoryDraft, setInventoryDraft] = useState<InventoryDraft>(
    () => defaultInventoryDraft(undefined, { defaultTransferFeePct: 2.4 }),
  );
  const [showCollectForm, setShowCollectForm] = useState(true);
  const [sectionFilter, setSectionFilter] = useState<SectionFilterKey>("TODO");
  const [collectPassengerId, setCollectPassengerId] = useState("");
  const [collectBooking, setCollectBooking] = useState<FinanceBookingPayload | null>(
    null,
  );
  const [collectClientPayments, setCollectClientPayments] = useState<ClientPayment[]>(
    [],
  );
  const [collectReceipts, setCollectReceipts] = useState<Receipt[]>([]);
  const [collectLoading, setCollectLoading] = useState(false);
  const [collectLoadingError, setCollectLoadingError] = useState<string | null>(null);
  const [collectReceiptFormVisible, setCollectReceiptFormVisible] = useState(false);
  const [editingCollectReceipt, setEditingCollectReceipt] = useState<Receipt | null>(
    null,
  );

  const [financeReservationKey, setFinanceReservationKey] = useState("");
  const [financeBooking, setFinanceBooking] = useState<FinanceBookingPayload | null>(
    null,
  );
  const [financeClientPayments, setFinanceClientPayments] = useState<ClientPayment[]>(
    [],
  );
  const [financeReceipts, setFinanceReceipts] = useState<Receipt[]>([]);
  const [financeOperatorDues, setFinanceOperatorDues] = useState<OperatorDue[]>([]);
  const [financeInvoices, setFinanceInvoices] = useState<Invoice[]>([]);
  const [financeCreditNotes, setFinanceCreditNotes] = useState<CreditNoteWithItems[]>(
    [],
  );
  const [financeLoading, setFinanceLoading] = useState(false);
  const [financeLoadingError, setFinanceLoadingError] = useState<string | null>(null);
  const [financeOperatorPaymentsReloadKey, setFinanceOperatorPaymentsReloadKey] =
    useState(0);
  const [showManualInventoryStatsInputs, setShowManualInventoryStatsInputs] =
    useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        groupData,
        passengersData,
        inventoriesData,
        clientConfigData,
        categoriesData,
      ] = await Promise.all([
        requestGroupApi<Group>(
          `/api/groups/${encodeURIComponent(groupId)}`,
          {
            credentials: "include",
            cache: "no-store",
          },
          "No pudimos cargar la grupal.",
        ),
        requestGroupApi<{ items?: PassengerItem[] }>(
          `/api/groups/${encodeURIComponent(groupId)}/passengers`,
          {
            credentials: "include",
            cache: "no-store",
          },
          "No pudimos cargar los pasajeros.",
        ),
        requestGroupApi<{ items?: GroupInventoryItem[] }>(
          `/api/groups/${encodeURIComponent(groupId)}/inventories`,
          {
            credentials: "include",
            cache: "no-store",
          },
          "No pudimos cargar los servicios de la grupal.",
        ),
        requestGroupApi<ClientConfigPayload>(
          "/api/clients/config",
          {
            credentials: "include",
            cache: "no-store",
          },
          "No pudimos cargar la configuración de pasajeros.",
        ).catch(() => null),
        requestGroupApi<PassengerCategoryOption[]>(
          "/api/passenger-categories?enabled=true",
          {
            credentials: "include",
            cache: "no-store",
          },
          "No pudimos cargar las categorías de pasajeros.",
        ).catch(() => []),
      ]);

      setGroup(groupData);
      setPassengers(Array.isArray(passengersData.items) ? passengersData.items : []);
      setInventories(
        Array.isArray(inventoriesData.items) ? inventoriesData.items : [],
      );

      const normalizedHidden = normalizeHiddenFields(
        clientConfigData?.hidden_fields,
      );
      const normalizedRequired = normalizeRequiredFields(
        clientConfigData?.required_fields,
      ).filter((field) => !normalizedHidden.includes(field));
      const normalizedCustom = normalizeCustomFields(
        clientConfigData?.custom_fields,
      );
      const normalizedCategories = Array.isArray(categoriesData)
        ? categoriesData.filter(
            (item) =>
              Number.isFinite(Number(item.id_category)) &&
              Number(item.id_category) > 0,
          )
        : [];

      setClientHiddenFields(normalizedHidden);
      setClientRequiredFields(
        normalizedRequired.length > 0
          ? normalizedRequired
          : DEFAULT_REQUIRED_FIELDS.filter((field) => !normalizedHidden.includes(field)),
      );
      setClientCustomFields(normalizedCustom);
      setPassengerCategories(normalizedCategories);

      try {
        const [serviceTypesData, operatorsData, currenciesData, calcConfigData] =
          await Promise.all([
            requestGroupApi<ServiceTypeOption[]>(
              "/api/service-types?enabled=true",
              {
                credentials: "include",
                cache: "no-store",
              },
              "No pudimos cargar los tipos de servicio.",
            ).catch(() => []),
            requestGroupApi<OperatorOption[]>(
              "/api/operators",
              {
                credentials: "include",
                cache: "no-store",
              },
              "No pudimos cargar los operadores.",
            ).catch(() => []),
            requestGroupApi<FinanceCurrencyOption[]>(
              "/api/finance/currencies",
              {
                credentials: "include",
                cache: "no-store",
              },
              "No pudimos cargar las monedas de finanzas.",
            ).catch(() => []),
            requestGroupApi<ServiceCalcConfigPayload>(
              "/api/service-calc-config",
              {
                credentials: "include",
                cache: "no-store",
              },
              "No pudimos cargar la configuración de costos de transferencia.",
            ).catch(
              (): ServiceCalcConfigPayload => ({ transfer_fee_pct: 2.4 }),
            ),
          ]);

        const validServiceTypes = Array.isArray(serviceTypesData)
          ? serviceTypesData.filter(
              (item) =>
                typeof item.name === "string" &&
                item.name.trim().length > 0 &&
                item.enabled !== false,
            )
          : [];
        const validOperators = Array.isArray(operatorsData)
          ? operatorsData.filter(
              (item) =>
                Number.isFinite(Number(item.id_operator)) &&
                Number(item.id_operator) > 0 &&
                typeof item.name === "string" &&
                item.name.trim().length > 0,
            )
          : [];
        const validCurrencies = Array.isArray(currenciesData)
          ? currenciesData.filter(
              (item) =>
                typeof item.code === "string" &&
                item.code.trim().length > 0 &&
                item.enabled !== false,
            )
          : [];

        const parsedTransferFeePct = Number(
          String(calcConfigData?.transfer_fee_pct ?? "2.4").replace(",", "."),
        );
        const transferFeePct = Number.isFinite(parsedTransferFeePct)
          ? parsedTransferFeePct
          : 2.4;

        setServiceTypes(validServiceTypes);
        setOperatorOptions(validOperators);
        setFinanceCurrencies(validCurrencies);
        setDefaultTransferFeePct(transferFeePct);
        setServiceOptionsError(null);

        setInventoryDraft((prev) => {
          const next = { ...prev };
          if (
            !next.transfer_fee_pct.trim() ||
            Number.isNaN(Number(next.transfer_fee_pct.replace(",", ".")))
          ) {
            next.transfer_fee_pct = String(transferFeePct);
          }
          if (!next.currency.trim() && validCurrencies.length > 0) {
            next.currency = String(validCurrencies[0].code || "ARS")
              .trim()
              .toUpperCase();
          }
          return next;
        });
      } catch (serviceOptionsErrorRaw) {
        const serviceOptionsMessage =
          serviceOptionsErrorRaw instanceof Error
            ? serviceOptionsErrorRaw.message
            : "No pudimos cargar configuración de servicios.";
        setServiceTypes([]);
        setOperatorOptions([]);
        setFinanceCurrencies([]);
        setDefaultTransferFeePct(2.4);
        setServiceOptionsError(toFriendlyServiceOptionsError(serviceOptionsMessage));
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No pudimos cargar la pantalla de esta grupal.";
      setError(message);
      toast.error(message);
      setGroup(null);
      setPassengers([]);
      setInventories([]);
      setServiceTypes([]);
      setOperatorOptions([]);
      setFinanceCurrencies([]);
      setServiceOptionsError(null);
      setDefaultTransferFeePct(2.4);
      setClientRequiredFields(DEFAULT_REQUIRED_FIELDS);
      setClientHiddenFields([]);
      setClientCustomFields([]);
      setPassengerCategories([]);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const sortedDepartures = useMemo(() => {
    if (!group?.departures) return [];
    return [...group.departures].sort((a, b) => {
      const aTime = new Date(a.departure_date).getTime();
      const bTime = new Date(b.departure_date).getTime();
      if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
        return aTime - bTime;
      }
      return a.id_travel_group_departure - b.id_travel_group_departure;
    });
  }, [group?.departures]);

  const isSingleDepartureMode = useMemo(() => {
    return String(group?.sale_mode || "").toUpperCase() === "UNICA";
  }, [group?.sale_mode]);

  const activePassenger = useMemo(() => {
    if (!activePassengerId) return null;
    return (
      passengers.find((item) => item.id_travel_group_passenger === activePassengerId) ??
      null
    );
  }, [activePassengerId, passengers]);

  const financePassengerOptions = useMemo<GroupFinancePassengerOption[]>(() => {
    const list: GroupFinancePassengerOption[] = [];
    for (const passenger of passengers) {
      const bookingId = Number(passenger.booking_id || 0);
      const clientId = Number(passenger.client_id || 0);
      if (!Number.isFinite(bookingId) || bookingId <= 0) continue;
      if (!Number.isFinite(clientId) || clientId <= 0) continue;
      const passengerName = passenger.client
        ? `${passenger.client.first_name} ${passenger.client.last_name}`.trim()
        : `Cliente ${clientId}`;
      list.push({
        passengerId: passenger.id_travel_group_passenger,
        bookingId,
        clientId,
        agencyBookingId:
          passenger.booking?.agency_booking_id != null
            ? Number(passenger.booking.agency_booking_id)
            : null,
        agencyClientId:
          passenger.client?.agency_client_id != null
            ? Number(passenger.client.agency_client_id)
            : null,
        passengerName: passengerName || `Cliente ${clientId}`,
        departureName: passenger.travelGroupDeparture?.name || null,
        status: passenger.status || "PENDIENTE",
      });
    }
    return list.sort((a, b) => {
      const byName = a.passengerName.localeCompare(b.passengerName, "es");
      if (byName !== 0) return byName;
      return a.passengerId - b.passengerId;
    });
  }, [passengers]);

  const selectedCollectPassenger = useMemo(() => {
    const parsed = parseOptionalPositiveInteger(collectPassengerId);
    if (!parsed) return null;
    return (
      passengers.find((item) => item.id_travel_group_passenger === parsed) ?? null
    );
  }, [collectPassengerId, passengers]);

  const selectedCollectBookingId = useMemo(() => {
    const bookingId = Number(selectedCollectPassenger?.booking_id || 0);
    return Number.isFinite(bookingId) && bookingId > 0 ? bookingId : null;
  }, [selectedCollectPassenger?.booking_id]);

  const selectedCollectClientId = useMemo(() => {
    const clientId = Number(selectedCollectPassenger?.client_id || 0);
    return Number.isFinite(clientId) && clientId > 0 ? clientId : null;
  }, [selectedCollectPassenger?.client_id]);

  const financeReservationOptions = useMemo<GroupFinanceReservationOption[]>(() => {
    const byScope = new Map<
      string,
      {
        departureId: number | null;
        departureName: string | null;
        bookingIds: Set<number>;
        bookingAgencyById: Map<number, number | null>;
        passengerCount: number;
      }
    >();

    for (const passenger of passengers) {
      const bookingId = Number(passenger.booking_id || 0);
      if (!Number.isFinite(bookingId) || bookingId <= 0) continue;

      const departureId =
        passenger.travelGroupDeparture?.id_travel_group_departure != null
          ? Number(passenger.travelGroupDeparture.id_travel_group_departure)
          : null;
      const scopeKey = departureId == null ? "group" : `departure:${departureId}`;
      const current = byScope.get(scopeKey) ?? {
        departureId,
        departureName: passenger.travelGroupDeparture?.name || null,
        bookingIds: new Set<number>(),
        bookingAgencyById: new Map<number, number | null>(),
        passengerCount: 0,
      };

      current.passengerCount += 1;
      current.bookingIds.add(bookingId);
      current.bookingAgencyById.set(
        bookingId,
        passenger.booking?.agency_booking_id != null
          ? Number(passenger.booking.agency_booking_id)
          : null,
      );
      if (!current.departureName && passenger.travelGroupDeparture?.name) {
        current.departureName = passenger.travelGroupDeparture.name;
      }

      byScope.set(scopeKey, current);
    }

    const rows: GroupFinanceReservationOption[] = [];
    for (const [key, value] of byScope.entries()) {
      const bookingIds = Array.from(value.bookingIds).sort((a, b) => a - b);
      if (bookingIds.length === 0) continue;
      const primaryBookingId = bookingIds[0];
      const primaryAgencyBookingId =
        value.bookingAgencyById.get(primaryBookingId) ?? null;

      const baseLabel =
        value.departureId == null
          ? "Grupal general (sin salida)"
          : `Salida: ${value.departureName || `#${value.departureId}`}`;
      const technicalSuffix =
        bookingIds.length > 1 ? ` · ${bookingIds.length} reservas técnicas` : "";

      rows.push({
        key,
        label: `${baseLabel}${technicalSuffix}`,
        bookingIds,
        primaryBookingId,
        primaryAgencyBookingId,
        passengerCount: value.passengerCount,
        departureId: value.departureId,
        departureName: value.departureName,
      });
    }

    return rows.sort((a, b) => {
      if (a.departureId == null && b.departureId != null) return -1;
      if (a.departureId != null && b.departureId == null) return 1;
      if (a.departureId != null && b.departureId != null && a.departureId !== b.departureId) {
        return a.departureId - b.departureId;
      }
      return a.primaryBookingId - b.primaryBookingId;
    });
  }, [passengers]);

  const selectedFinanceReservation = useMemo(() => {
    if (!financeReservationKey) return null;
    return (
      financeReservationOptions.find((item) => item.key === financeReservationKey) ??
      null
    );
  }, [financeReservationKey, financeReservationOptions]);

  const selectedFinanceBookingId = selectedFinanceReservation?.primaryBookingId ?? null;

  useEffect(() => {
    if (passengers.length === 0) {
      setActivePassengerId(null);
      return;
    }
    if (
      activePassengerId == null ||
      !passengers.some((item) => item.id_travel_group_passenger === activePassengerId)
    ) {
      setActivePassengerId(passengers[0].id_travel_group_passenger);
    }
  }, [activePassengerId, passengers]);

  useEffect(() => {
    if (financePassengerOptions.length === 0) {
      setCollectPassengerId("");
      return;
    }
    if (
      collectPassengerId &&
      financePassengerOptions.some(
        (item) => String(item.passengerId) === collectPassengerId,
      )
    ) {
      return;
    }
    const preferredId =
      activePassenger &&
      financePassengerOptions.some(
        (item) => item.passengerId === activePassenger.id_travel_group_passenger,
      )
        ? activePassenger.id_travel_group_passenger
        : financePassengerOptions[0].passengerId;
    setCollectPassengerId(String(preferredId));
  }, [
    activePassenger,
    collectPassengerId,
    financePassengerOptions,
  ]);

  useEffect(() => {
    if (financeReservationOptions.length === 0) {
      setFinanceReservationKey("");
      return;
    }
    if (
      financeReservationKey &&
      financeReservationOptions.some((item) => item.key === financeReservationKey)
    ) {
      return;
    }
    const preferredKey =
      activePassenger?.travelGroupDeparture?.id_travel_group_departure != null
        ? `departure:${activePassenger.travelGroupDeparture.id_travel_group_departure}`
        : "group";
    const hasPreferred = financeReservationOptions.some(
      (item) => item.key === preferredKey,
    );
    setFinanceReservationKey(
      hasPreferred ? preferredKey : financeReservationOptions[0].key,
    );
  }, [activePassenger, financeReservationKey, financeReservationOptions]);

  useEffect(() => {
    setEditingCollectReceipt(null);
    setCollectReceiptFormVisible(false);
  }, [selectedCollectBookingId, selectedCollectClientId]);

  useEffect(() => {
    if (!activePassenger) {
      setActivePassengerStatus("");
      setActivePassengerDepartureId("");
      setActivePassengerNote("");
      return;
    }
    setActivePassengerStatus(activePassenger.status || "");
    setActivePassengerDepartureId(
      activePassenger.travelGroupDeparture?.id_travel_group_departure
        ? String(activePassenger.travelGroupDeparture.id_travel_group_departure)
        : "",
    );
    setActivePassengerNote(parsePassengerNote(activePassenger.metadata));
  }, [activePassenger]);

  useEffect(() => {
    if (!activePassenger && passengerFormMode === "EDICION") {
      setPassengerFormMode("ALTA");
    }
  }, [activePassenger, passengerFormMode]);

  const serviceTypeOptions = useMemo(() => {
    return [...serviceTypes].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [serviceTypes]);

  const inventoryCurrencyOptions = useMemo(() => {
    const configCodes = financeCurrencies
      .map((item) => String(item.code || "").trim().toUpperCase())
      .filter(Boolean);
    const inventoryCodes = inventories
      .map((item) => String(item.currency || "").trim().toUpperCase())
      .filter(Boolean);
    return Array.from(new Set([...configCodes, ...inventoryCodes, "ARS"]));
  }, [financeCurrencies, inventories]);

  const currencyLabelByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of financeCurrencies) {
      const code = String(item.code || "").trim().toUpperCase();
      if (!code) continue;
      const name = String(item.name || "").trim();
      map.set(code, name ? `${code} · ${name}` : code);
    }
    return map;
  }, [financeCurrencies]);

  const inventoryFinancialRows = useMemo<InventoryFinancialRow[]>(() => {
    return inventories.map((item) => {
      const parsedNote = parseInventoryNote(item.note ?? "");
      const meta = parsedNote.meta;
      const currency = String(item.currency || "ARS").toUpperCase();
      const totalQty = Number(item.total_qty || 0);
      const assignedQty = Number(item.assigned_qty || 0);
      const confirmedQty = Number(item.confirmed_qty || 0);
      const blockedQty = Number(item.blocked_qty || 0);
      const availableQty = Math.max(totalQty - assignedQty - blockedQty, 0);
      const unitCost = toAmountNumber(item.unit_cost);
      const costTotal = unitCost * totalQty;
      const costAssigned = unitCost * assignedQty;
      const costConfirmed = unitCost * confirmedQty;
      const costBlocked = unitCost * blockedQty;
      const costAvailable = unitCost * availableQty;
      const saleTotal =
        meta?.pricingMode === "VENTA_TOTAL"
          ? Number(meta.saleTotalPrice || 0)
          : Number(meta?.saleUnitPrice || 0) * totalQty;
      const transferFeePct =
        Number(
          meta?.transferFeePct != null
            ? meta.transferFeePct
            : defaultTransferFeePct,
        ) || 0;
      const transferFeeAmount = saleTotal > 0
        ? (saleTotal * transferFeePct) / 100
        : 0;
      const taxesTotal =
        Number(meta?.taxable21 || 0) +
        Number(meta?.taxable105 || 0) +
        Number(meta?.exemptAmount || 0) +
        Number(meta?.otherTaxes || 0);
      const grossMargin = saleTotal - costTotal - transferFeeAmount - taxesTotal;
      const operationalDebt = Math.max(costAssigned - costConfirmed, 0);
      return {
        inventoryId: item.id_travel_group_inventory,
        currency,
        totalQty,
        assignedQty,
        confirmedQty,
        blockedQty,
        availableQty,
        unitCost,
        costTotal,
        costAssigned,
        costConfirmed,
        costBlocked,
        costAvailable,
        saleTotal,
        transferFeePct,
        transferFeeAmount,
        taxesTotal,
        grossMargin,
        operationalDebt,
      };
    });
  }, [defaultTransferFeePct, inventories]);

  const inventoryFinancialSummary = useMemo<InventoryFinancialSummary[]>(() => {
    const acc = new Map<string, InventoryFinancialSummary>();
    for (const row of inventoryFinancialRows) {
      const current = acc.get(row.currency) ?? {
        currency: row.currency,
        servicesCount: 0,
        totalQty: 0,
        assignedQty: 0,
        confirmedQty: 0,
        blockedQty: 0,
        availableQty: 0,
        costTotal: 0,
        costAssigned: 0,
        costConfirmed: 0,
        costBlocked: 0,
        costAvailable: 0,
        saleTotal: 0,
        transferFeeAmount: 0,
        taxesTotal: 0,
        grossMargin: 0,
        operationalDebt: 0,
      };
      current.servicesCount += 1;
      current.totalQty += row.totalQty;
      current.assignedQty += row.assignedQty;
      current.confirmedQty += row.confirmedQty;
      current.blockedQty += row.blockedQty;
      current.availableQty += row.availableQty;
      current.costTotal += row.costTotal;
      current.costAssigned += row.costAssigned;
      current.costConfirmed += row.costConfirmed;
      current.costBlocked += row.costBlocked;
      current.costAvailable += row.costAvailable;
      current.saleTotal += row.saleTotal;
      current.transferFeeAmount += row.transferFeeAmount;
      current.taxesTotal += row.taxesTotal;
      current.grossMargin += row.grossMargin;
      current.operationalDebt += row.operationalDebt;
      acc.set(row.currency, current);
    }
    return [...acc.values()].sort((a, b) => a.currency.localeCompare(b.currency));
  }, [inventoryFinancialRows]);

  const inventoryFinancialById = useMemo(() => {
    return new Map(
      inventoryFinancialRows.map((item) => [item.inventoryId, item] as const),
    );
  }, [inventoryFinancialRows]);

  const inventoryDraftPreview = useMemo(() => {
    const qtyTotal = Number(inventoryDraft.total_qty || 0);
    const qtyAssigned = Number(inventoryDraft.assigned_qty || 0);
    const qtyConfirmed = Number(inventoryDraft.confirmed_qty || 0);
    const qtyBlocked = Number(inventoryDraft.blocked_qty || 0);
    const qtyAvailable = Math.max(qtyTotal - qtyAssigned - qtyBlocked, 0);
    const unitCost = toAmountNumber(inventoryDraft.unit_cost);
    const costTotal = unitCost * qtyTotal;
    const saleTotal =
      inventoryDraft.pricing_mode === "VENTA_TOTAL"
        ? toAmountNumber(inventoryDraft.sale_total_price)
        : toAmountNumber(inventoryDraft.sale_unit_price) * qtyTotal;
    const taxes =
      toAmountNumber(inventoryDraft.taxable_21) +
      toAmountNumber(inventoryDraft.taxable_105) +
      toAmountNumber(inventoryDraft.exempt_amount) +
      toAmountNumber(inventoryDraft.other_taxes);
    const transferFeePct = toAmountNumber(inventoryDraft.transfer_fee_pct);
    const transferFeeAmount =
      saleTotal > 0 ? (saleTotal * transferFeePct) / 100 : 0;
    const margin = saleTotal - costTotal - taxes - transferFeeAmount;
    const operationalDebt = Math.max((qtyAssigned - qtyConfirmed) * unitCost, 0);
    return {
      qtyTotal,
      qtyAssigned,
      qtyConfirmed,
      qtyBlocked,
      qtyAvailable,
      unitCost,
      costTotal,
      saleTotal,
      taxes,
      transferFeePct,
      transferFeeAmount,
      margin,
      operationalDebt,
    };
  }, [inventoryDraft]);

  const filteredPassengers = useMemo(() => {
    const q = passengerSearch.trim().toLowerCase();
    return passengers.filter((item) => {
      if (passengerStatusFilter !== "ALL" && item.status !== passengerStatusFilter) {
        return false;
      }
      if (!q) return true;
      const fullName = `${item.client?.first_name || ""} ${item.client?.last_name || ""}`
        .trim()
        .toLowerCase();
      const departureName = item.travelGroupDeparture?.name?.toLowerCase() || "";
      const bookingRef = String(item.booking?.agency_booking_id ?? item.booking?.id_booking ?? "");
      const clientRef = String(item.client?.agency_client_id ?? item.client?.id_client ?? "");
      return (
        fullName.includes(q) ||
        departureName.includes(q) ||
        bookingRef.includes(q) ||
        clientRef.includes(q)
      );
    });
  }, [
    passengers,
    passengerSearch,
    passengerStatusFilter,
  ]);

  const effectiveClientRequiredFields = useMemo(
    () =>
      (clientRequiredFields.length > 0
        ? clientRequiredFields
        : DEFAULT_REQUIRED_FIELDS
      ).filter((field) => !clientHiddenFields.includes(field)),
    [clientHiddenFields, clientRequiredFields],
  );

  const requiredClientCustomKeys = useMemo(
    () => clientCustomFields.filter((field) => field.required).map((field) => field.key),
    [clientCustomFields],
  );

  const allowedClientCustomKeys = useMemo(
    () => new Set(clientCustomFields.map((field) => field.key)),
    [clientCustomFields],
  );

  function updateNewClientDraftField(
    field: ClientDraftField,
    value: string,
  ) {
    setNewClientDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  function updateActiveClientDraftField(
    field: ClientDraftField,
    value: string,
  ) {
    setActiveClientDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  function updateNewClientCustomField(key: string, value: string) {
    setNewClientDraft((prev) =>
      prev
        ? {
            ...prev,
            custom_fields: {
              ...(prev.custom_fields || {}),
              [key]: value,
            },
          }
        : prev,
    );
  }

  function updateActiveClientCustomField(key: string, value: string) {
    setActiveClientDraft((prev) =>
      prev
        ? {
            ...prev,
            custom_fields: {
              ...(prev.custom_fields || {}),
              [key]: value,
            },
          }
        : prev,
    );
  }

  function sanitizeClientCustomFields(
    draft: NonNullable<ClientEditableDraft>,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    for (const key of allowedClientCustomKeys) {
      const value = String(draft.custom_fields?.[key] ?? "").trim();
      if (!value) continue;
      out[key] = value;
    }
    return out;
  }

  function validateClientDraft(
    draft: NonNullable<ClientEditableDraft> | null,
  ): string | null {
    if (!draft) return "Completá los datos del pasajero.";
    const read = (field: keyof NonNullable<ClientEditableDraft>) =>
      String(draft[field] ?? "").trim();

    for (const field of effectiveClientRequiredFields) {
      if (field === DOCUMENT_ANY_KEY) continue;
      if (clientHiddenFields.includes(field)) continue;
      if (!read(field as keyof NonNullable<ClientEditableDraft>)) {
        const fieldLabel = field.replaceAll("_", " ");
        return `El campo ${fieldLabel} es obligatorio.`;
      }
    }

    const docRequired =
      effectiveClientRequiredFields.includes(DOCUMENT_ANY_KEY) ||
      effectiveClientRequiredFields.some((field) =>
        DOC_FIELD_KEYS.includes(field as (typeof DOC_FIELD_KEYS)[number]),
      );
    if (docRequired) {
      const hasDoc = DOC_FIELD_KEYS.some(
        (field) => String(draft[field] ?? "").trim().length > 0,
      );
      if (!hasDoc) {
        return "Completá DNI, Pasaporte o CUIT/RUT para continuar.";
      }
    }

    for (const key of requiredClientCustomKeys) {
      const value = String(draft.custom_fields?.[key] ?? "").trim();
      if (!value) {
        const fieldLabel =
          clientCustomFields.find((field) => field.key === key)?.label || key;
        return `El campo ${fieldLabel} es obligatorio.`;
      }
    }

    return null;
  }

  const activePassengerClientId = activePassenger?.client?.id_client ?? null;

  useEffect(() => {
    if (!activePassengerClientId) {
      setActiveClientDraft(null);
      setActiveClientRaw(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        setActiveClientLoading(true);
        const client = await requestGroupApi<Record<string, unknown>>(
          `/api/clients/${activePassengerClientId}`,
          {
            credentials: "include",
            cache: "no-store",
          },
          "No pudimos cargar los datos del pasajero.",
        );
        if (cancelled) return;
        setActiveClientRaw(client);
        setActiveClientDraft(defaultClientDraft(client));
      } catch {
        if (!cancelled) {
          setActiveClientDraft(null);
          setActiveClientRaw(null);
        }
      } finally {
        if (!cancelled) setActiveClientLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [activePassengerClientId]);

  const fetchCollectFinanceData = useCallback(
    async (bookingId: number | null, clientId: number | null) => {
      if (!bookingId || bookingId <= 0 || !clientId || clientId <= 0) {
        setCollectBooking(null);
        setCollectReceipts([]);
        setCollectClientPayments([]);
        setCollectLoading(false);
        setCollectLoadingError(null);
        return;
      }

      setCollectLoading(true);
      setCollectLoadingError(null);

      const results = await Promise.allSettled([
        requestGroupApi<FinanceBookingPayload>(
          `/api/bookings/${bookingId}`,
          {
            credentials: "include",
            cache: "no-store",
          },
          "No pudimos cargar la reserva del pasajero.",
        ),
        requestGroupApi<unknown>(
          `/api/receipts?bookingId=${bookingId}`,
          {
            credentials: "include",
            cache: "no-store",
          },
          "No pudimos cargar los recibos del pasajero.",
        ),
        requestGroupApi<{ payments?: ClientPayment[]; items?: ClientPayment[] }>(
          `/api/client-payments?bookingId=${bookingId}&clientId=${clientId}`,
          {
            credentials: "include",
            cache: "no-store",
          },
          "No pudimos cargar las cuotas del pasajero.",
        ),
      ]);

      const errors: string[] = [];

      const bookingResult = results[0];
      if (bookingResult.status === "fulfilled") {
        setCollectBooking(bookingResult.value);
      } else {
        setCollectBooking(null);
        errors.push(bookingResult.reason?.message || "Reserva no disponible.");
      }

      const receiptsResult = results[1];
      if (receiptsResult.status === "fulfilled") {
        const allReceipts = parseApiReceipts(receiptsResult.value);
        const filteredReceipts = allReceipts.filter((receipt) => {
          const ids = Array.isArray(receipt.clientIds)
            ? receipt.clientIds
                .map((id) => Number(id))
                .filter((id) => Number.isFinite(id) && id > 0)
            : [];
          if (ids.length === 0) {
            const bookingTitularId = Number(receipt.booking?.titular?.id_client || 0);
            if (Number.isFinite(bookingTitularId) && bookingTitularId > 0) {
              return bookingTitularId === clientId;
            }
            return true;
          }
          return ids.includes(clientId);
        });
        setCollectReceipts(filteredReceipts);
      } else {
        setCollectReceipts([]);
        errors.push(receiptsResult.reason?.message || "Recibos no disponibles.");
      }

      const clientPaymentsResult = results[2];
      if (clientPaymentsResult.status === "fulfilled") {
        const rows = Array.isArray(clientPaymentsResult.value.payments)
          ? clientPaymentsResult.value.payments
          : Array.isArray(clientPaymentsResult.value.items)
            ? clientPaymentsResult.value.items
            : [];
        setCollectClientPayments(rows);
      } else {
        setCollectClientPayments([]);
        errors.push(clientPaymentsResult.reason?.message || "Cuotas no disponibles.");
      }

      setCollectLoadingError(errors.length > 0 ? errors[0] : null);
      setCollectLoading(false);
    },
    [],
  );

  const refreshCollectData = useCallback(async () => {
    await fetchCollectFinanceData(selectedCollectBookingId, selectedCollectClientId);
  }, [fetchCollectFinanceData, selectedCollectBookingId, selectedCollectClientId]);

  useEffect(() => {
    void fetchCollectFinanceData(selectedCollectBookingId, selectedCollectClientId);
  }, [fetchCollectFinanceData, selectedCollectBookingId, selectedCollectClientId]);

  const fetchFinanceDataByReservation = useCallback(
    async (reservation: GroupFinanceReservationOption | null) => {
      if (!reservation || reservation.bookingIds.length === 0) {
        setFinanceBooking(null);
        setFinanceReceipts([]);
        setFinanceClientPayments([]);
        setFinanceOperatorDues([]);
        setFinanceInvoices([]);
        setFinanceCreditNotes([]);
        setFinanceLoading(false);
        setFinanceLoadingError(null);
        return;
      }

      const bookingIds = reservation.bookingIds
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0);
      if (bookingIds.length === 0) {
        setFinanceBooking(null);
        setFinanceReceipts([]);
        setFinanceClientPayments([]);
        setFinanceOperatorDues([]);
        setFinanceInvoices([]);
        setFinanceCreditNotes([]);
        setFinanceLoading(false);
        setFinanceLoadingError(null);
        return;
      }

      setFinanceLoading(true);
      setFinanceLoadingError(null);

      const errors: string[] = [];

      const bookingResult = await Promise.allSettled([
        requestGroupApi<FinanceBookingPayload>(
          `/api/bookings/${reservation.primaryBookingId}`,
          {
            credentials: "include",
            cache: "no-store",
          },
          "No pudimos cargar la reserva principal del contexto seleccionado.",
        ),
      ]);

      if (bookingResult[0]?.status === "fulfilled") {
        setFinanceBooking(bookingResult[0].value);
      } else {
        setFinanceBooking(null);
        errors.push(
          bookingResult[0]?.status === "rejected"
            ? bookingResult[0].reason?.message || "Reserva no disponible."
            : "Reserva no disponible.",
        );
      }

      const [receiptsSettled, clientPaymentsSettled, operatorDuesSettled, invoicesSettled, notesSettled] =
        await Promise.all([
          Promise.allSettled(
            bookingIds.map((bookingId) =>
              requestGroupApi<unknown>(
                `/api/receipts?bookingId=${bookingId}`,
                {
                  credentials: "include",
                  cache: "no-store",
                },
                "No pudimos cargar recibos del contexto de reserva.",
              ),
            ),
          ),
          Promise.allSettled(
            bookingIds.map((bookingId) =>
              requestGroupApi<{ payments?: ClientPayment[]; items?: ClientPayment[] }>(
                `/api/client-payments?bookingId=${bookingId}`,
                {
                  credentials: "include",
                  cache: "no-store",
                },
                "No pudimos cargar cuotas del contexto de reserva.",
              ),
            ),
          ),
          Promise.allSettled(
            bookingIds.map((bookingId) =>
              requestGroupApi<{ dues?: OperatorDue[] }>(
                `/api/operator-dues?bookingId=${bookingId}`,
                {
                  credentials: "include",
                  cache: "no-store",
                },
                "No pudimos cargar deudas de operador del contexto de reserva.",
              ),
            ),
          ),
          Promise.allSettled(
            bookingIds.map((bookingId) =>
              requestGroupApi<{ invoices?: Invoice[] }>(
                `/api/invoices?bookingId=${bookingId}`,
                {
                  credentials: "include",
                  cache: "no-store",
                },
                "No pudimos cargar facturación del contexto de reserva.",
              ),
            ),
          ),
          Promise.allSettled(
            bookingIds.map((bookingId) =>
              requestGroupApi<{ creditNotes?: CreditNoteWithItems[] }>(
                `/api/credit-notes?bookingId=${bookingId}`,
                {
                  credentials: "include",
                  cache: "no-store",
                },
                "No pudimos cargar notas de crédito del contexto de reserva.",
              ),
            ),
          ),
        ]);

      const receiptsMap = new Map<number, Receipt>();
      for (const item of receiptsSettled) {
        if (item.status === "fulfilled") {
          const rows = parseApiReceipts(item.value);
          for (const receipt of rows) {
            receiptsMap.set(receipt.id_receipt, receipt);
          }
        } else {
          errors.push(item.reason?.message || "Recibos no disponibles.");
        }
      }
      setFinanceReceipts([...receiptsMap.values()]);

      const paymentMap = new Map<number, ClientPayment>();
      for (const item of clientPaymentsSettled) {
        if (item.status === "fulfilled") {
          const rows = Array.isArray(item.value.payments)
            ? item.value.payments
            : Array.isArray(item.value.items)
              ? item.value.items
              : [];
          for (const payment of rows) {
            paymentMap.set(payment.id_payment, payment);
          }
        } else {
          errors.push(item.reason?.message || "Cuotas no disponibles.");
        }
      }
      setFinanceClientPayments([...paymentMap.values()]);

      const dueMap = new Map<number, OperatorDue>();
      for (const item of operatorDuesSettled) {
        if (item.status === "fulfilled") {
          const rows = Array.isArray(item.value.dues) ? item.value.dues : [];
          for (const due of rows) {
            dueMap.set(due.id_due, due);
          }
        } else {
          errors.push(item.reason?.message || "Deudas operador no disponibles.");
        }
      }
      setFinanceOperatorDues([...dueMap.values()]);

      const invoiceMap = new Map<number, Invoice>();
      for (const item of invoicesSettled) {
        if (item.status === "fulfilled") {
          const rows = Array.isArray(item.value.invoices) ? item.value.invoices : [];
          for (const invoice of rows) {
            invoiceMap.set(invoice.id_invoice, invoice);
          }
        } else {
          errors.push(item.reason?.message || "Facturas no disponibles.");
        }
      }
      setFinanceInvoices([...invoiceMap.values()]);

      const creditMap = new Map<number, CreditNoteWithItems>();
      for (const item of notesSettled) {
        if (item.status === "fulfilled") {
          const rows = Array.isArray(item.value.creditNotes)
            ? item.value.creditNotes
            : [];
          for (const note of rows) {
            creditMap.set(note.id_credit_note, note);
          }
        } else {
          errors.push(item.reason?.message || "Notas de crédito no disponibles.");
        }
      }
      setFinanceCreditNotes([...creditMap.values()]);

      setFinanceLoadingError(errors.length > 0 ? errors[0] : null);
      setFinanceLoading(false);
    },
    [],
  );

  const refreshFinanceData = useCallback(async () => {
    await fetchFinanceDataByReservation(selectedFinanceReservation);
  }, [fetchFinanceDataByReservation, selectedFinanceReservation]);

  useEffect(() => {
    void fetchFinanceDataByReservation(selectedFinanceReservation);
  }, [fetchFinanceDataByReservation, selectedFinanceReservation]);

  const financeSummaryByCurrency = useMemo<FinanceCurrencySummary[]>(() => {
    const map = new Map<string, FinanceCurrencySummary>();
    const ensure = (currencyRaw: string) => {
      const currency = normalizeCurrencyCode(currencyRaw);
      const existing = map.get(currency);
      if (existing) return existing;
      const next: FinanceCurrencySummary = {
        currency,
        pendingClientAmount: 0,
        overdueClientAmount: 0,
        pendingOperatorAmount: 0,
        receiptsAmount: 0,
        invoicedAmount: 0,
        creditNotesAmount: 0,
        netBalance: 0,
      };
      map.set(currency, next);
      return next;
    };

    for (const payment of financeClientPayments) {
      const row = ensure(String(payment.currency || "ARS"));
      const amount = toAmountNumber(payment.amount);
      const status = String(payment.derived_status || payment.status || "")
        .trim()
        .toUpperCase();
      if (status === "PENDIENTE" || status === "VENCIDA") {
        row.pendingClientAmount += amount;
      }
      if (status === "VENCIDA") {
        row.overdueClientAmount += amount;
      }
    }

    for (const due of financeOperatorDues) {
      const row = ensure(String(due.currency || "ARS"));
      const amount = toAmountNumber(due.amount);
      const status = String(due.status || "").trim().toUpperCase();
      if (status !== "PAGADA" && status !== "PAGO" && status !== "CANCELADA") {
        row.pendingOperatorAmount += amount;
      }
    }

    for (const receipt of financeReceipts) {
      const row = ensure(String(receipt.amount_currency || "ARS"));
      row.receiptsAmount += toAmountNumber(receipt.amount);
    }

    for (const invoice of financeInvoices) {
      const row = ensure(String(invoice.currency || "ARS"));
      row.invoicedAmount += toAmountNumber(invoice.total_amount);
    }

    for (const note of financeCreditNotes) {
      const row = ensure(String(note.currency || "ARS"));
      row.creditNotesAmount += toAmountNumber(note.total_amount);
    }

    for (const row of map.values()) {
      row.netBalance =
        row.pendingClientAmount -
        row.pendingOperatorAmount -
        row.creditNotesAmount;
    }

    return [...map.values()].sort((a, b) => a.currency.localeCompare(b.currency));
  }, [
    financeClientPayments,
    financeCreditNotes,
    financeInvoices,
    financeOperatorDues,
    financeReceipts,
  ]);

  const financeRole = useMemo(() => String(role || "").toLowerCase(), [role]);

  const collectBookingServices = useMemo<Service[]>(() => {
    return Array.isArray(collectBooking?.services) ? collectBooking.services : [];
  }, [collectBooking?.services]);

  const financeBookingServices = useMemo<Service[]>(() => {
    return Array.isArray(financeBooking?.services) ? financeBooking.services : [];
  }, [financeBooking?.services]);

  const financeLinkedPassengers = useMemo(() => {
    if (!selectedFinanceReservation) return [];
    if (selectedFinanceReservation.departureId == null) {
      return passengers.filter(
        (item) =>
          item.travelGroupDeparture?.id_travel_group_departure == null,
      );
    }
    return passengers.filter(
      (item) =>
        Number(item.travelGroupDeparture?.id_travel_group_departure || 0) ===
        selectedFinanceReservation.departureId,
    );
  }, [passengers, selectedFinanceReservation]);

  const reservationHasMultipleTechnicalBookings =
    (selectedFinanceReservation?.bookingIds.length ?? 0) > 1;

  const showGroupPanels = sectionFilter === "TODO" || sectionFilter === "GRUPAL";
  const showCobrosPanels = sectionFilter === "TODO" || sectionFilter === "COBROS";
  const showPagosPanels = sectionFilter === "TODO" || sectionFilter === "PAGOS";
  const showFacturacionPanel =
    sectionFilter === "TODO" || sectionFilter === "FACTURACION";

  function openProgress(title: string, step: string, percent: number) {
    setBulkProgress({
      title,
      status: "running",
      percent,
      step,
      lines: [],
      timestamp: Date.now(),
    });
  }

  function updateProgress(step: string, percent: number) {
    setBulkProgress((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        status: "running",
        step,
        percent,
        timestamp: Date.now(),
      };
    });
  }

  type ActionResult = {
    toastMessage?: string;
    summaryLines?: string[];
  };

  async function runAction(
    title: string,
    fn: () => Promise<ActionResult | void>,
  ) {
    setSubmitting(true);
    setError(null);
    setMessage(null);
    openProgress(title, "Validando datos...", 12);
    try {
      updateProgress("Enviando operación...", 46);
      const result = await fn();
      updateProgress("Actualizando información...", 78);
      await fetchAll();

      const successMessage = result?.toastMessage || `${title} completada.`;
      const summaryLines = result?.summaryLines?.length
        ? result.summaryLines
        : [successMessage];

      setMessage(successMessage);
      toast.success(successMessage);
      setBulkProgress({
        title,
        status: "success",
        percent: 100,
        step: "Operación completada.",
        lines: summaryLines,
        timestamp: Date.now(),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error inesperado.";
      setError(msg);
      toast.error(msg);
      setBulkProgress({
        title,
        status: "error",
        percent: 100,
        step: "La operación no se pudo completar.",
        lines: [msg],
        timestamp: Date.now(),
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddPassenger(e: FormEvent) {
    e.preventDefault();
    let clientIdToAdd = newPassengerClientId;
    if (newPassengerMode === "NUEVO") {
      const validationError = validateClientDraft(
        newClientDraft as NonNullable<ClientEditableDraft> | null,
      );
      if (validationError) {
        setError(validationError);
        toast.error(validationError);
        return;
      }
      if (!newClientDraft) {
        const msg = "Completá los datos del nuevo pasajero.";
        setError(msg);
        toast.error(msg);
        return;
      }

      const parsedCategoryId = parseOptionalPositiveInteger(
        newClientDraft.category_id,
      );
      if (newClientDraft.category_id.trim() && parsedCategoryId == null) {
        const msg = "La categoría del pasajero no es válida.";
        setError(msg);
        toast.error(msg);
        return;
      }

      const sanitizedCustomFields = sanitizeClientCustomFields(newClientDraft);
      try {
        const createdClient = await requestGroupApi<{ id_client: number }>(
          "/api/clients",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              first_name: newClientDraft.first_name.trim(),
              last_name: newClientDraft.last_name.trim(),
              phone: newClientDraft.phone.trim(),
              email: newClientDraft.email.trim(),
              dni_number: newClientDraft.dni_number.trim(),
              passport_number: newClientDraft.passport_number.trim(),
              tax_id: newClientDraft.tax_id.trim(),
              birth_date: newClientDraft.birth_date || "",
              nationality: newClientDraft.nationality.trim(),
              gender: newClientDraft.gender.trim(),
              address: newClientDraft.address.trim(),
              locality: newClientDraft.locality.trim(),
              postal_code: newClientDraft.postal_code.trim(),
              company_name: newClientDraft.company_name.trim(),
              commercial_address: newClientDraft.commercial_address.trim(),
              category_id: parsedCategoryId ?? null,
              custom_fields: sanitizedCustomFields,
            }),
          },
          "No pudimos crear el pasajero nuevo.",
        );
        clientIdToAdd = Number(createdClient.id_client);
      } catch (createError) {
        const msg =
          createError instanceof Error
            ? createError.message
            : "No pudimos crear el pasajero nuevo.";
        setError(msg);
        toast.error(msg);
        return;
      }
    }

    if (!clientIdToAdd) {
      const msg = "Seleccioná o creá un pasajero para agregar a la grupal.";
      setError(msg);
      toast.error(msg);
      return;
    }
    let createdPassengerId: number | null = null;
    await runAction("Alta de pasajero", async () => {
      const data = await requestGroupApi<{
        created_count?: number;
        skipped_count?: number;
        created?: Array<{ passenger_id?: number }>;
      }>(`/api/groups/${encodeURIComponent(groupId)}/passengers/bulk-create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          clientIds: [clientIdToAdd],
          departureId: newPassengerDepartureId || null,
        }),
      }, "No pudimos agregar el pasajero.");
      const firstCreated = Array.isArray(data.created) ? data.created[0] : null;
      createdPassengerId =
        firstCreated && typeof firstCreated.passenger_id === "number"
          ? firstCreated.passenger_id
          : null;
      setNewPassengerClientId(null);
      setNewPassengerDepartureId("");
      if (newPassengerMode === "NUEVO") {
        setNewClientDraft(defaultClientDraft());
        setNewPassengerMode("EXISTENTE");
      }
      return {
        toastMessage: `Pasajero agregado. Creados: ${data.created_count ?? 0}.`,
        summaryLines: [
          `Pasajeros creados: ${data.created_count ?? 0}`,
          `Pasajeros omitidos: ${data.skipped_count ?? 0}`,
        ],
      };
    });
    if (createdPassengerId) {
      setActivePassengerId(createdPassengerId);
      setPassengerFormMode("EDICION");
    }
  }

  async function handleSaveActivePassenger(e: FormEvent) {
    e.preventDefault();
    if (!activePassenger) {
      const msg = "Seleccioná un pasajero para editar.";
      setError(msg);
      toast.error(msg);
      return;
    }

    await runAction("Edición de pasajero", async () => {
      const payload: Record<string, unknown> = {
        passengerIds: [activePassenger.id_travel_group_passenger],
      };
      if (activePassengerStatus && activePassengerStatus !== activePassenger.status) {
        payload.status = activePassengerStatus;
      }
      if (activePassengerDepartureId === "CLEAR") {
        payload.clearDeparture = true;
      } else if (activePassengerDepartureId) {
        payload.departureId = activePassengerDepartureId;
      }
      payload.note = activePassengerNote.trim();

      const data = await requestGroupApi<{
        updated_count?: number;
      }>(
        `/api/groups/${encodeURIComponent(groupId)}/passengers/bulk-update`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        },
        "No pudimos guardar los cambios del pasajero.",
      );
      return {
        toastMessage: "Pasajero actualizado correctamente.",
        summaryLines: [`Registros actualizados: ${data.updated_count ?? 0}`],
      };
    });
  }

  async function handleSaveActiveClient(e: FormEvent) {
    e.preventDefault();
    if (!activeClientDraft || !activeClientRaw) {
      const msg = "No hay datos de pasajero para guardar.";
      setError(msg);
      toast.error(msg);
      return;
    }
    if (!activeClientDraft.id_client) {
      const msg = "No encontramos el identificador del pasajero para editar.";
      setError(msg);
      toast.error(msg);
      return;
    }

    const validationError = validateClientDraft(activeClientDraft);
    if (validationError) {
      setError(validationError);
      toast.error(validationError);
      return;
    }

    const parsedCategoryId = parseOptionalPositiveInteger(
      activeClientDraft.category_id,
    );
    if (activeClientDraft.category_id.trim() && parsedCategoryId == null) {
      const msg = "La categoría del pasajero no es válida.";
      setError(msg);
      toast.error(msg);
      return;
    }

    const sanitizedCustomFields = sanitizeClientCustomFields(activeClientDraft);
    const payload: Record<string, unknown> = {
      ...activeClientRaw,
      first_name: activeClientDraft.first_name.trim(),
      last_name: activeClientDraft.last_name.trim(),
      phone: activeClientDraft.phone.trim(),
      email: activeClientDraft.email.trim() || null,
      dni_number: activeClientDraft.dni_number.trim() || null,
      passport_number: activeClientDraft.passport_number.trim() || null,
      tax_id: activeClientDraft.tax_id.trim() || null,
      birth_date: activeClientDraft.birth_date || null,
      nationality: activeClientDraft.nationality.trim(),
      gender: activeClientDraft.gender.trim(),
      address: activeClientDraft.address.trim() || null,
      locality: activeClientDraft.locality.trim() || null,
      postal_code: activeClientDraft.postal_code.trim() || null,
      company_name: activeClientDraft.company_name.trim() || null,
      commercial_address: activeClientDraft.commercial_address.trim() || null,
      category_id: parsedCategoryId ?? null,
      custom_fields: sanitizedCustomFields,
    };

    await runAction("Actualización de datos del pasajero", async () => {
      await requestGroupApi(
        `/api/clients/${activeClientDraft.id_client}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        },
        "No pudimos guardar los datos del pasajero.",
      );
      return {
        toastMessage: "Datos del pasajero actualizados correctamente.",
        summaryLines: ["Los cambios personales fueron guardados."],
      };
    });
  }

  async function handleInlinePassengerStatusChange(
    passenger: PassengerItem,
    nextStatus: string,
  ) {
    const normalizedNextStatus = String(nextStatus || "").trim().toUpperCase();
    if (!normalizedNextStatus || normalizedNextStatus === passenger.status) return;

    setError(null);
    setUpdatingPassengerStatusId(passenger.id_travel_group_passenger);
    try {
      const data = await requestGroupApi<{ updated_count?: number }>(
        `/api/groups/${encodeURIComponent(groupId)}/passengers/bulk-update`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            passengerIds: [passenger.id_travel_group_passenger],
            status: normalizedNextStatus,
          }),
        },
        "No pudimos cambiar el estado del pasajero.",
      );

      setPassengers((prev) =>
        prev.map((item) =>
          item.id_travel_group_passenger === passenger.id_travel_group_passenger
            ? { ...item, status: normalizedNextStatus }
            : item,
        ),
      );

      if (
        activePassengerId === passenger.id_travel_group_passenger &&
        activePassengerStatus !== normalizedNextStatus
      ) {
        setActivePassengerStatus(normalizedNextStatus);
      }

      toast.success(
        data.updated_count && data.updated_count > 0
          ? "Estado del pasajero actualizado."
          : "No hubo cambios para aplicar.",
      );
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "No pudimos cambiar el estado del pasajero.";
      setError(msg);
      toast.error(msg);
    } finally {
      setUpdatingPassengerStatusId(null);
    }
  }

  async function handleSaveInventory(e: FormEvent) {
    e.preventDefault();
    const parsedOperatorId = parseOptionalPositiveInteger(
      inventoryDraft.operator_id,
    );
    const selectedOperatorName =
      parsedOperatorId != null
        ? (operatorOptions.find((item) => item.id_operator === parsedOperatorId)?.name ?? "")
        : "";
    const providerValue =
      inventoryProviderMode === "OPERADOR"
        ? selectedOperatorName.trim() || inventoryDraft.provider.trim()
        : inventoryDraft.provider.trim();
    const financialMeta: InventoryFinancialMeta = {
      v: 1,
      pricingMode: inventoryDraft.pricing_mode,
      billingMode: inventoryDraft.billing_mode,
      operatorId: parsedOperatorId ?? null,
      saleUnitPrice: normalizeMoneyValue(inventoryDraft.sale_unit_price),
      saleTotalPrice: normalizeMoneyValue(inventoryDraft.sale_total_price),
      taxable21: normalizeMoneyValue(inventoryDraft.taxable_21),
      taxable105: normalizeMoneyValue(inventoryDraft.taxable_105),
      exemptAmount: normalizeMoneyValue(inventoryDraft.exempt_amount),
      otherTaxes: normalizeMoneyValue(inventoryDraft.other_taxes),
      transferFeePct: normalizeMoneyValue(inventoryDraft.transfer_fee_pct),
    };

    const payload = {
      departure_id: inventoryDraft.departure_id || null,
      inventory_type: inventoryDraft.inventory_type.trim(),
      service_type: inventoryDraft.service_type.trim() || null,
      label: inventoryDraft.label.trim(),
      provider: providerValue || null,
      locator: inventoryDraft.locator.trim() || null,
      total_qty: inventoryDraft.total_qty.trim(),
      assigned_qty: inventoryDraft.assigned_qty.trim() || "0",
      confirmed_qty: inventoryDraft.confirmed_qty.trim() || "0",
      blocked_qty: inventoryDraft.blocked_qty.trim() || "0",
      currency: inventoryDraft.currency.trim().toUpperCase() || null,
      unit_cost: inventoryDraft.unit_cost.trim() || null,
      note: buildInventoryNote(inventoryDraft.note, financialMeta),
    };

    if (!payload.label || !payload.inventory_type || !payload.total_qty) {
      const msg = "Completá tipo, nombre y cantidad total del servicio.";
      setError(msg);
      toast.error(msg);
      return;
    }
    if (payload.note && payload.note.length > 1000) {
      const msg =
        "La nota del servicio supera el límite permitido. Reducí texto o datos adicionales.";
      setError(msg);
      toast.error(msg);
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      if (editingInventoryId) {
        await requestGroupApi(
          `/api/groups/${encodeURIComponent(groupId)}/inventories/${editingInventoryId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payload),
          },
          "No pudimos actualizar el servicio.",
        );
        toast.success("Servicio actualizado.");
      } else {
        await requestGroupApi(
          `/api/groups/${encodeURIComponent(groupId)}/inventories`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payload),
          },
          "No pudimos cargar el servicio.",
        );
        toast.success("Servicio cargado.");
      }
      setInventoryDraft(
        defaultInventoryDraft(undefined, {
          defaultTransferFeePct,
          operators: operatorOptions,
        }),
      );
      setEditingInventoryId(null);
      setInventoryProviderMode("OPERADOR");
      setShowInventoryForm(false);
      setShowManualInventoryStatsInputs(false);
      await fetchAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No pudimos guardar el servicio.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function startEditInventory(item: GroupInventoryItem) {
    setEditingInventoryId(item.id_travel_group_inventory);
    const nextDraft = defaultInventoryDraft(item, {
      defaultTransferFeePct,
      operators: operatorOptions,
    });
    setInventoryDraft(nextDraft);
    setInventoryProviderMode(
      parseOptionalPositiveInteger(nextDraft.operator_id) != null
        ? "OPERADOR"
        : "MANUAL",
    );
    setShowManualInventoryStatsInputs(false);
    setShowInventoryForm(true);
  }

  async function handleDeleteInventory(item: GroupInventoryItem) {
    const confirmed = window.confirm(
      `¿Seguro que querés eliminar el servicio "${item.label}"?`,
    );
    if (!confirmed) return;
    try {
      setSubmitting(true);
      await requestGroupApi(
        `/api/groups/${encodeURIComponent(groupId)}/inventories/${item.id_travel_group_inventory}`,
        {
          method: "DELETE",
          credentials: "include",
        },
        "No pudimos eliminar el servicio.",
      );
      toast.success("Servicio eliminado.");
      await fetchAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No pudimos eliminar el servicio.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function buildDeparturePayload(
    draft: DepartureDraft,
  ): { payload: Record<string, unknown> | null; error: string | null } {
    if (!draft.name.trim()) {
      return {
        payload: null,
        error: "El nombre de la salida es obligatorio.",
      };
    }
    if (!draft.departure_date) {
      return {
        payload: null,
        error: "La fecha de salida es obligatoria.",
      };
    }

    const capacityTotal = parseOptionalPositiveInteger(draft.capacity_total);
    if (draft.capacity_total.trim() && capacityTotal == null) {
      return {
        payload: null,
        error: "El cupo total de la salida es inválido.",
      };
    }
    const overbookingLimit = parseOptionalPositiveInteger(draft.overbooking_limit);
    if (draft.overbooking_limit.trim() && overbookingLimit == null) {
      return {
        payload: null,
        error: "El límite de sobreventa es inválido.",
      };
    }
    const waitlistLimit = parseOptionalPositiveInteger(draft.waitlist_limit);
    if (draft.waitlist_limit.trim() && waitlistLimit == null) {
      return {
        payload: null,
        error: "El límite de lista de espera es inválido.",
      };
    }

    return {
      payload: {
        name: draft.name.trim(),
        code: draft.code.trim() || null,
        status: draft.status,
        departure_date: draft.departure_date,
        return_date: draft.return_date || null,
        release_date: draft.release_date || null,
        capacity_total: capacityTotal,
        allow_overbooking: draft.allow_overbooking,
        overbooking_limit: overbookingLimit,
        waitlist_enabled: draft.waitlist_enabled,
        waitlist_limit: waitlistLimit,
        note: draft.note.trim() || null,
      },
      error: null,
    };
  }

  async function handleCreateDeparture(e: FormEvent) {
    e.preventDefault();
    const parsed = buildDeparturePayload(createDepartureDraft);
    if (!parsed.payload) {
      setError(parsed.error ?? "No pudimos validar la salida.");
      toast.error(parsed.error ?? "No pudimos validar la salida.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setMessage(null);
      await requestGroupApi(
        `/api/groups/${encodeURIComponent(groupId)}/departures`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(parsed.payload),
        },
        "No pudimos crear la salida.",
      );
      setCreateDepartureDraft(defaultDepartureDraft());
      setShowDepartureCreate(false);
      setMessage("Salida creada correctamente.");
      toast.success("Salida creada correctamente.");
      await fetchAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No pudimos crear la salida.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function startEditDeparture(dep: Departure) {
    const routeId = dep.public_id || String(dep.id_travel_group_departure);
    try {
      setLoadingDepartureId(dep.id_travel_group_departure);
      setError(null);
      const data = await requestGroupApi<DepartureDetail>(
        `/api/groups/${encodeURIComponent(groupId)}/departures/${encodeURIComponent(routeId)}`,
        {
          credentials: "include",
          cache: "no-store",
        },
        "No pudimos cargar los datos de la salida.",
      );
      setEditingDepartureId(dep.id_travel_group_departure);
      setEditingDepartureDraft(defaultDepartureDraft(data));
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "No pudimos cargar los datos de la salida.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoadingDepartureId(null);
    }
  }

  async function handleUpdateDeparture(e: FormEvent) {
    e.preventDefault();
    if (!editingDepartureId || !group) {
      return;
    }
    const currentDeparture = group.departures.find(
      (item) => item.id_travel_group_departure === editingDepartureId,
    );
    if (!currentDeparture) {
      const msg = "No encontramos la salida seleccionada para editar.";
      setError(msg);
      toast.error(msg);
      return;
    }

    const parsed = buildDeparturePayload(editingDepartureDraft);
    if (!parsed.payload) {
      setError(parsed.error ?? "No pudimos validar la salida.");
      toast.error(parsed.error ?? "No pudimos validar la salida.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setMessage(null);
      const routeId =
        currentDeparture.public_id || String(currentDeparture.id_travel_group_departure);
      await requestGroupApi(
        `/api/groups/${encodeURIComponent(groupId)}/departures/${encodeURIComponent(routeId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(parsed.payload),
        },
        "No pudimos actualizar la salida.",
      );
      setEditingDepartureId(null);
      setEditingDepartureDraft(defaultDepartureDraft());
      setMessage("Salida actualizada correctamente.");
      toast.success("Salida actualizada correctamente.");
      await fetchAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No pudimos actualizar la salida.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteDeparture(dep: Departure) {
    const confirmed = window.confirm(
      `¿Seguro que querés eliminar la salida "${dep.name}"?`,
    );
    if (!confirmed) return;

    try {
      setSubmitting(true);
      setError(null);
      setMessage(null);
      const routeId = dep.public_id || String(dep.id_travel_group_departure);
      await requestGroupApi(
        `/api/groups/${encodeURIComponent(groupId)}/departures/${encodeURIComponent(routeId)}`,
        {
          method: "DELETE",
          credentials: "include",
        },
        "No pudimos eliminar la salida.",
      );
      if (editingDepartureId === dep.id_travel_group_departure) {
        setEditingDepartureId(null);
        setEditingDepartureDraft(defaultDepartureDraft());
      }
      setMessage("Salida eliminada correctamente.");
      toast.success("Salida eliminada correctamente.");
      await fetchAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No pudimos eliminar la salida.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function focusPassengerPanel(passengerId: number) {
    setActivePassengerId(passengerId);
  }

  if (loading && !group) {
    return (
      <main className="min-h-screen px-4 py-6 text-slate-900 dark:text-slate-100 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-3xl border border-sky-200/80 bg-white/70 p-6 shadow-sm shadow-slate-900/10 backdrop-blur-md dark:border-sky-800/70 dark:bg-slate-900/55">
          Cargando grupal...
        </div>
      </main>
    );
  }

  if (!group) {
    return (
      <main className="min-h-screen px-4 py-6 text-slate-900 dark:text-slate-100 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-3xl border border-amber-300/80 bg-amber-100/90 p-6 text-amber-900 shadow-sm shadow-amber-900/10 backdrop-blur-sm dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200">
          {error || "No se encontró la grupal."}
          <div className="mt-3">
            <Link
              href="/groups"
              className="rounded-full border border-slate-300 bg-white/90 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-slate-500"
            >
              Volver a grupales
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-6 text-slate-900 dark:text-slate-100 sm:px-6 lg:px-8 [&_input]:border-sky-300/80 [&_input]:text-slate-900 dark:[&_input]:border-sky-700/70 dark:[&_input]:bg-slate-900/70 dark:[&_input]:text-slate-100 [&_select]:border-sky-300/80 [&_select]:text-slate-900 dark:[&_select]:border-sky-700/70 dark:[&_select]:bg-slate-900/70 dark:[&_select]:text-slate-100 [&_textarea]:border-sky-300/80 [&_textarea]:text-slate-900 dark:[&_textarea]:border-sky-700/70 dark:[&_textarea]:bg-slate-900/70 dark:[&_textarea]:text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header
          id="panel-resumen"
          className="rounded-3xl border border-sky-200/80 bg-white/70 p-6 shadow-sm shadow-slate-900/10 backdrop-blur-md dark:border-sky-800/70 dark:bg-slate-900/55"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
                  {group.name}
                </h1>
                <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${STATUS_STYLES[group.status] || STATUS_STYLES.BORRADOR}`}>
                  {formatGroupStatus(group.status)}
                </span>
                <span
                  className={`${RESULT_PILL_BASE} ${
                    group._count.passengers > 0 ? RESULT_PILL_OK : RESULT_PILL_WARN
                  }`}
                >
                  {group._count.passengers} pasajeros
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                {formatGroupType(group.type)} · {formatDate(group.start_date)} -{" "}
                {formatDate(group.end_date)}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                {formatGroupReference(group)}
              </p>
            </div>
            <Link
              href="/groups"
              className="rounded-full border border-slate-300 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-slate-500"
            >
              Volver
            </Link>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-700 dark:text-slate-300">
            <span className="rounded-full border border-slate-300 bg-white/80 px-2 py-1 dark:border-slate-600 dark:bg-slate-900/70">
              Pasajeros: {group._count.passengers}
            </span>
            <span className="rounded-full border border-slate-300 bg-white/80 px-2 py-1 dark:border-slate-600 dark:bg-slate-900/70">
              Reservas: {group._count.bookings}
            </span>
            <span className="rounded-full border border-slate-300 bg-white/80 px-2 py-1 dark:border-slate-600 dark:bg-slate-900/70">
              Salidas: {group._count.departures}
            </span>
            <span className="rounded-full border border-slate-300 bg-white/80 px-2 py-1 dark:border-slate-600 dark:bg-slate-900/70">
              Cupo: {group.capacity_total ?? "-"}
            </span>
            {group.allow_overbooking ? (
              <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2 py-1 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-200">
                Sobreventa
              </span>
            ) : null}
            {group.waitlist_enabled ? (
              <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-1 text-amber-800 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200">
                Lista de espera
              </span>
            ) : null}
          </div>
        </header>

        <nav className="sticky top-3 z-10 rounded-2xl border border-sky-200/80 bg-white/85 p-2 shadow-sm shadow-slate-900/10 backdrop-blur-md dark:border-sky-800/70 dark:bg-slate-900/70">
          <div className="flex flex-wrap gap-2">
            {SECTION_FILTERS.map((section) => (
              <button
                type="button"
                key={`section-filter-${section.id}`}
                onClick={() => setSectionFilter(section.id)}
                className={pillClass(sectionFilter === section.id, section.tone)}
              >
                {section.label}
              </button>
            ))}
          </div>
          <p className="mt-2 px-1 text-[11px] text-slate-600 dark:text-slate-400">
            Mostrando:{" "}
            <span className="font-semibold">
              {SECTION_FILTERS.find((item) => item.id === sectionFilter)?.label || "Todo"}
            </span>
          </p>
        </nav>

        {error ? (
          <p className="rounded-2xl border border-amber-300/80 bg-amber-100/90 px-4 py-2 text-sm text-amber-900 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="rounded-2xl border border-emerald-300/80 bg-emerald-100/90 px-4 py-2 text-sm text-emerald-900 dark:border-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-200">
            {message}
          </p>
        ) : null}

        {bulkProgress ? (
          <section
            className={`rounded-3xl border p-5 shadow-lg backdrop-blur-md ${
              bulkProgress.status === "error"
                ? "border-amber-300/80 bg-amber-100/85 text-amber-900 shadow-amber-900/10 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200"
                : bulkProgress.status === "success"
                  ? "border-emerald-300/80 bg-emerald-50/85 text-emerald-900 shadow-emerald-900/10 dark:border-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-200"
                  : "border-sky-200/80 bg-white/70 text-slate-800 shadow-slate-900/10 dark:border-sky-800/70 dark:bg-slate-900/55 dark:text-slate-200"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">
                  Estado de operación
                </p>
                <p className="text-xs opacity-85">{bulkProgress.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setBulkProgress(null)}
                className="rounded-full border border-slate-300/80 bg-white/85 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-slate-500"
              >
                Ocultar
              </button>
            </div>
            <div className="mt-3">
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-700/70">
                <div
                  className={`h-full transition-all duration-300 ${
                    bulkProgress.status === "error"
                      ? "bg-amber-500"
                      : bulkProgress.status === "success"
                        ? "bg-emerald-500"
                        : "bg-sky-500"
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, bulkProgress.percent))}%` }}
                />
              </div>
              <p className="mt-2 text-xs font-semibold">
                {bulkProgress.step} ({Math.round(bulkProgress.percent)}%)
              </p>
              {bulkProgress.lines.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs">
                  {bulkProgress.lines.map((line, idx) => (
                    <li key={`bulk-line-${idx}`}>• {line}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </section>
        ) : null}

        {showGroupPanels ? (
          <section
            id="panel-salidas"
            className={`rounded-3xl border border-sky-200/80 bg-white/70 shadow-sm shadow-slate-900/10 backdrop-blur-md dark:border-sky-800/70 dark:bg-slate-900/55 ${
              isSingleDepartureMode ? "p-4" : "p-5"
            }`}
          >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {isSingleDepartureMode ? "Salida principal" : "Gestión de salidas"}
              </h2>
              <p className="text-xs text-slate-700 dark:text-slate-300">
                {isSingleDepartureMode
                  ? "Esta grupal usa salida única. Se reutiliza en toda la operación."
                  : "Creá, editá o eliminá lotes/salidas de esta grupal."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowDepartureFilters((prev) => !prev)}
                className={pillClass(showDepartureFilters, "emerald")}
              >
                {showDepartureFilters ? "Ocultar campos avanzados" : "Mostrar campos avanzados"}
              </button>
              {!isSingleDepartureMode || sortedDepartures.length === 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowDepartureCreate((prev) => !prev);
                    if (!showDepartureCreate) {
                      setCreateDepartureDraft(
                        defaultDepartureDraft({
                          name: group.name,
                          status: group.status,
                          departure_date: group.start_date || "",
                          return_date: group.end_date || "",
                          capacity_total: group.capacity_total,
                          allow_overbooking: group.allow_overbooking,
                          waitlist_enabled: group.waitlist_enabled,
                        }),
                      );
                    }
                  }}
                  className={pillClass(showDepartureCreate, "sky")}
                >
                  {showDepartureCreate
                    ? "Cancelar nueva salida"
                    : isSingleDepartureMode
                      ? "Crear salida principal"
                      : "Agregar salida"}
                </button>
              ) : null}
            </div>
          </div>

          {sortedDepartures.length === 0 ? (
            <p className="rounded-2xl border border-slate-300/80 bg-white/70 px-4 py-3 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
              {isSingleDepartureMode
                ? "La salida principal todavía no está creada."
                : "Esta grupal todavía no tiene salidas cargadas."}
            </p>
          ) : (
            <div
              className={
                isSingleDepartureMode
                  ? "grid grid-cols-1 gap-3"
                  : "grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
              }
            >
              {(isSingleDepartureMode
                ? sortedDepartures.slice(0, 1)
                : sortedDepartures
              ).map((dep) => (
                <article
                  key={dep.id_travel_group_departure}
                  className="rounded-2xl border border-slate-300/80 bg-white/85 p-4 shadow-sm shadow-slate-900/10 dark:border-slate-600 dark:bg-slate-900/60"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        {dep.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {formatDepartureReference(dep)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLES[dep.status] || STATUS_STYLES.BORRADOR}`}
                    >
                      {formatDepartureStatus(dep.status)}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-slate-700 dark:text-slate-300 sm:grid-cols-2">
                    <span>Salida: {formatDate(dep.departure_date)}</span>
                    <span>Regreso: {formatDate(dep.return_date)}</span>
                    <span>Cupo: {dep.capacity_total ?? "-"}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void startEditDeparture(dep)}
                      disabled={submitting || loadingDepartureId === dep.id_travel_group_departure}
                      className="rounded-full border border-slate-300 bg-white/85 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-slate-500"
                    >
                      {loadingDepartureId === dep.id_travel_group_departure ? "Cargando..." : "Editar"}
                    </button>
                    {!isSingleDepartureMode ? (
                      <button
                        type="button"
                        onClick={() => void handleDeleteDeparture(dep)}
                        disabled={submitting}
                        className="rounded-full border border-amber-300 bg-amber-100/90 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200"
                      >
                        Eliminar
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}

          <CollapsiblePanel open={showDepartureCreate} className="mt-4">
            <form
              onSubmit={handleCreateDeparture}
              className="space-y-3 rounded-2xl border border-slate-300/80 bg-white/70 p-4 dark:border-slate-600 dark:bg-slate-900/60"
            >
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Nueva salida
              </p>
              <div className="flex flex-col gap-2">
                <label className="flex flex-col gap-1 text-sm">
                  Nombre
                  <input
                    value={createDepartureDraft.name}
                    onChange={(e) =>
                      setCreateDepartureDraft((prev) => ({ ...prev, name: e.target.value }))
                    }
                    disabled={submitting}
                    className={FIELD_INPUT_CLASS}
                    placeholder="Lote 1 / Salida principal"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Estado
                  <select
                    value={createDepartureDraft.status}
                    onChange={(e) =>
                      setCreateDepartureDraft((prev) => ({
                        ...prev,
                        status: e.target.value as GroupStatus,
                      }))
                    }
                    disabled={submitting}
                    className={FIELD_INPUT_CLASS}
                  >
                    {DEPARTURE_STATUS_OPTIONS.map((status) => (
                      <option key={`create-dep-status-${status}`} value={status}>
                        {formatGroupStatus(status)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Cupo total
                  <input
                    value={createDepartureDraft.capacity_total}
                    onChange={(e) =>
                      setCreateDepartureDraft((prev) => ({
                        ...prev,
                        capacity_total: e.target.value,
                      }))
                    }
                    inputMode="numeric"
                    disabled={submitting}
                    className={FIELD_INPUT_CLASS}
                    placeholder="20"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Fecha de salida
                  <input
                    type="date"
                    value={createDepartureDraft.departure_date}
                    onChange={(e) =>
                      setCreateDepartureDraft((prev) => ({
                        ...prev,
                        departure_date: e.target.value,
                      }))
                    }
                    disabled={submitting}
                    className={FIELD_INPUT_CLASS}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Fecha de regreso
                  <input
                    type="date"
                    value={createDepartureDraft.return_date}
                    onChange={(e) =>
                      setCreateDepartureDraft((prev) => ({
                        ...prev,
                        return_date: e.target.value,
                      }))
                    }
                    disabled={submitting}
                    className={FIELD_INPUT_CLASS}
                  />
                </label>
                <CollapsiblePanel open={showDepartureFilters} className="space-y-2">
                    <label className="flex flex-col gap-1 text-sm">
                      Código
                      <input
                        value={createDepartureDraft.code}
                        onChange={(e) =>
                          setCreateDepartureDraft((prev) => ({ ...prev, code: e.target.value }))
                        }
                        disabled={submitting}
                        className={FIELD_INPUT_CLASS}
                        placeholder="MX-LOTE-1"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      Fecha de liberación
                      <input
                        type="date"
                        value={createDepartureDraft.release_date}
                        onChange={(e) =>
                          setCreateDepartureDraft((prev) => ({
                            ...prev,
                            release_date: e.target.value,
                          }))
                        }
                        disabled={submitting}
                        className={FIELD_INPUT_CLASS}
                      />
                    </label>
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-200 bg-sky-100/50 p-2">
                      <button
                        type="button"
                        onClick={() =>
                          setCreateDepartureDraft((prev) => ({
                            ...prev,
                            allow_overbooking: !prev.allow_overbooking,
                          }))
                        }
                        className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                          createDepartureDraft.allow_overbooking
                            ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                            : "border-sky-300 bg-white text-slate-600"
                        }`}
                        disabled={submitting}
                      >
                        {createDepartureDraft.allow_overbooking ? "Sobreventa: activada" : "Sobreventa: desactivada"}
                      </button>
                      {createDepartureDraft.allow_overbooking ? (
                        <input
                          value={createDepartureDraft.overbooking_limit}
                          onChange={(e) =>
                            setCreateDepartureDraft((prev) => ({
                              ...prev,
                              overbooking_limit: e.target.value,
                            }))
                          }
                          inputMode="numeric"
                          disabled={submitting}
                          className="w-44 rounded-xl border border-sky-300/80 bg-white/90 px-3 py-1.5 text-xs text-slate-900 outline-none transition focus:border-sky-500 disabled:cursor-not-allowed disabled:opacity-70 dark:border-sky-700/70 dark:bg-slate-900/70 dark:text-slate-100"
                          placeholder="Límite sobreventa"
                        />
                      ) : null}
                      <button
                        type="button"
                        onClick={() =>
                          setCreateDepartureDraft((prev) => ({
                            ...prev,
                            waitlist_enabled: !prev.waitlist_enabled,
                          }))
                        }
                        className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                          createDepartureDraft.waitlist_enabled
                            ? "border-amber-300 bg-amber-100 text-amber-800"
                            : "border-sky-300 bg-white text-slate-600"
                        }`}
                        disabled={submitting}
                      >
                        {createDepartureDraft.waitlist_enabled ? "Lista de espera: activada" : "Lista de espera: desactivada"}
                      </button>
                      {createDepartureDraft.waitlist_enabled ? (
                        <input
                          value={createDepartureDraft.waitlist_limit}
                          onChange={(e) =>
                            setCreateDepartureDraft((prev) => ({
                              ...prev,
                              waitlist_limit: e.target.value,
                            }))
                          }
                          inputMode="numeric"
                          disabled={submitting}
                          className="w-44 rounded-xl border border-sky-300/80 bg-white/90 px-3 py-1.5 text-xs text-slate-900 outline-none transition focus:border-sky-500 disabled:cursor-not-allowed disabled:opacity-70 dark:border-sky-700/70 dark:bg-slate-900/70 dark:text-slate-100"
                          placeholder="Límite lista espera"
                        />
                      ) : null}
                    </div>
                    <label className="flex flex-col gap-1 text-sm">
                      Nota interna
                      <textarea
                        value={createDepartureDraft.note}
                        onChange={(e) =>
                          setCreateDepartureDraft((prev) => ({ ...prev, note: e.target.value }))
                        }
                        rows={2}
                        disabled={submitting}
                        className={FIELD_INPUT_CLASS}
                      />
                    </label>
                </CollapsiblePanel>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-full border border-slate-300 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-slate-500"
              >
                {submitting ? <Spinner label="Creando salida..." /> : "Crear salida"}
              </button>
            </form>
          </CollapsiblePanel>

          <CollapsiblePanel open={Boolean(editingDepartureId)} className="mt-4">
            <form
              onSubmit={handleUpdateDeparture}
              className="space-y-3 rounded-2xl border border-amber-300/80 bg-amber-100/60 p-4 dark:border-amber-600 dark:bg-amber-900/30"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  Editar salida
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setEditingDepartureId(null);
                    setEditingDepartureDraft(defaultDepartureDraft());
                  }}
                  className="rounded-full border border-amber-300 bg-amber-50/90 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200"
                >
                  Cancelar edición
                </button>
              </div>
              <div className="flex flex-col gap-2">
                <label className="flex flex-col gap-1 text-sm">
                  Nombre
                  <input
                    value={editingDepartureDraft.name}
                    onChange={(e) =>
                      setEditingDepartureDraft((prev) => ({ ...prev, name: e.target.value }))
                    }
                    disabled={submitting}
                    className={FIELD_INPUT_CLASS}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Estado
                  <select
                    value={editingDepartureDraft.status}
                    onChange={(e) =>
                      setEditingDepartureDraft((prev) => ({
                        ...prev,
                        status: e.target.value as GroupStatus,
                      }))
                    }
                    disabled={submitting}
                    className={FIELD_INPUT_CLASS}
                  >
                    {DEPARTURE_STATUS_OPTIONS.map((status) => (
                      <option key={`edit-dep-status-${status}`} value={status}>
                        {formatGroupStatus(status)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Cupo total
                  <input
                    value={editingDepartureDraft.capacity_total}
                    onChange={(e) =>
                      setEditingDepartureDraft((prev) => ({
                        ...prev,
                        capacity_total: e.target.value,
                      }))
                    }
                    inputMode="numeric"
                    disabled={submitting}
                    className={FIELD_INPUT_CLASS}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Fecha de salida
                  <input
                    type="date"
                    value={editingDepartureDraft.departure_date}
                    onChange={(e) =>
                      setEditingDepartureDraft((prev) => ({
                        ...prev,
                        departure_date: e.target.value,
                      }))
                    }
                    disabled={submitting}
                    className={FIELD_INPUT_CLASS}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Fecha de regreso
                  <input
                    type="date"
                    value={editingDepartureDraft.return_date}
                    onChange={(e) =>
                      setEditingDepartureDraft((prev) => ({
                        ...prev,
                        return_date: e.target.value,
                      }))
                    }
                    disabled={submitting}
                    className={FIELD_INPUT_CLASS}
                  />
                </label>
                <CollapsiblePanel open={showDepartureFilters} className="space-y-2">
                    <label className="flex flex-col gap-1 text-sm">
                      Código
                      <input
                        value={editingDepartureDraft.code}
                        onChange={(e) =>
                          setEditingDepartureDraft((prev) => ({ ...prev, code: e.target.value }))
                        }
                        disabled={submitting}
                        className={FIELD_INPUT_CLASS}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      Fecha de liberación
                      <input
                        type="date"
                        value={editingDepartureDraft.release_date}
                        onChange={(e) =>
                          setEditingDepartureDraft((prev) => ({
                            ...prev,
                            release_date: e.target.value,
                          }))
                        }
                        disabled={submitting}
                        className={FIELD_INPUT_CLASS}
                      />
                    </label>
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/70 p-2">
                      <button
                        type="button"
                        onClick={() =>
                          setEditingDepartureDraft((prev) => ({
                            ...prev,
                            allow_overbooking: !prev.allow_overbooking,
                          }))
                        }
                        className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                          editingDepartureDraft.allow_overbooking
                            ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                            : "border-amber-300 bg-white text-slate-600"
                        }`}
                        disabled={submitting}
                      >
                        {editingDepartureDraft.allow_overbooking ? "Sobreventa: activada" : "Sobreventa: desactivada"}
                      </button>
                      {editingDepartureDraft.allow_overbooking ? (
                        <input
                          value={editingDepartureDraft.overbooking_limit}
                          onChange={(e) =>
                            setEditingDepartureDraft((prev) => ({
                              ...prev,
                              overbooking_limit: e.target.value,
                            }))
                          }
                          inputMode="numeric"
                          disabled={submitting}
                          className="w-44 rounded-xl border border-sky-300/80 bg-white/90 px-3 py-1.5 text-xs text-slate-900 outline-none transition focus:border-sky-500 disabled:cursor-not-allowed disabled:opacity-70 dark:border-sky-700/70 dark:bg-slate-900/70 dark:text-slate-100"
                          placeholder="Límite sobreventa"
                        />
                      ) : null}
                      <button
                        type="button"
                        onClick={() =>
                          setEditingDepartureDraft((prev) => ({
                            ...prev,
                            waitlist_enabled: !prev.waitlist_enabled,
                          }))
                        }
                        className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                          editingDepartureDraft.waitlist_enabled
                            ? "border-amber-300 bg-amber-100 text-amber-800"
                            : "border-amber-300 bg-white text-slate-600"
                        }`}
                        disabled={submitting}
                      >
                        {editingDepartureDraft.waitlist_enabled ? "Lista de espera: activada" : "Lista de espera: desactivada"}
                      </button>
                      {editingDepartureDraft.waitlist_enabled ? (
                        <input
                          value={editingDepartureDraft.waitlist_limit}
                          onChange={(e) =>
                            setEditingDepartureDraft((prev) => ({
                              ...prev,
                              waitlist_limit: e.target.value,
                            }))
                          }
                          inputMode="numeric"
                          disabled={submitting}
                          className="w-44 rounded-xl border border-sky-300/80 bg-white/90 px-3 py-1.5 text-xs text-slate-900 outline-none transition focus:border-sky-500 disabled:cursor-not-allowed disabled:opacity-70 dark:border-sky-700/70 dark:bg-slate-900/70 dark:text-slate-100"
                          placeholder="Límite lista espera"
                        />
                      ) : null}
                    </div>
                    <label className="flex flex-col gap-1 text-sm">
                      Nota interna
                      <textarea
                        value={editingDepartureDraft.note}
                        onChange={(e) =>
                          setEditingDepartureDraft((prev) => ({ ...prev, note: e.target.value }))
                        }
                        rows={2}
                        disabled={submitting}
                        className={FIELD_INPUT_CLASS}
                      />
                    </label>
                </CollapsiblePanel>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-full border border-amber-300 bg-amber-100/90 px-4 py-2 text-sm font-semibold text-amber-800 transition hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200"
              >
                {submitting ? <Spinner label="Guardando salida..." /> : "Guardar cambios de salida"}
              </button>
            </form>
          </CollapsiblePanel>
          </section>
        ) : null}

        {showGroupPanels ? (
          <section
            id="panel-pasajero-activo"
            className="rounded-3xl border border-sky-200/80 bg-white/70 p-5 shadow-sm shadow-slate-900/10 backdrop-blur-md dark:border-sky-800/70 dark:bg-slate-900/55"
          >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Formulario de pasajero
              </h2>
              <p className="text-xs text-slate-700 dark:text-slate-300">
                Un único formulario para alta y edición de pasajeros.
              </p>
            </div>
            <ToggleIconButton
              open={showPassengerForm}
              onClick={() => setShowPassengerForm((prev) => !prev)}
              label="formulario"
            />
          </div>

          <CollapsiblePanel open={showPassengerForm} className="mt-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPassengerFormMode("ALTA")}
                className={pillClass(passengerFormMode === "ALTA", "sky")}
                disabled={submitting}
              >
                Alta
              </button>
              <button
                type="button"
                onClick={() => setPassengerFormMode("EDICION")}
                className={pillClass(passengerFormMode === "EDICION", "emerald")}
                disabled={submitting || !activePassenger}
              >
                Edición
              </button>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={passengerFormMode}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
              >
                {passengerFormMode === "ALTA" ? (
                  <form onSubmit={handleAddPassenger} className="mt-3 flex flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setNewPassengerMode("EXISTENTE")}
                        className={pillClass(newPassengerMode === "EXISTENTE", "sky")}
                        disabled={submitting}
                      >
                        Pasajero existente
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewPassengerMode("NUEVO")}
                        className={pillClass(newPassengerMode === "NUEVO", "emerald")}
                        disabled={submitting}
                      >
                        Pasajero nuevo
                      </button>
                    </div>

                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={newPassengerMode}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.16, ease: "easeInOut" }}
                      >
                        {newPassengerMode === "EXISTENTE" ? (
                          <div className="space-y-1">
                            <label className="ml-1 block text-sm font-medium text-slate-900 dark:text-slate-100">
                              Pasajero
                            </label>
                            <ClientPicker
                              label=""
                              valueId={newPassengerClientId}
                              onSelect={(client: Client) => setNewPassengerClientId(client.id_client)}
                              onClear={() => setNewPassengerClientId(null)}
                              placeholder="Buscar por N° pax, DNI, pasaporte, CUIT o nombre..."
                            />
                            <p className="ml-1 text-xs text-slate-600 dark:text-slate-400">
                              Seleccioná un pasajero existente o cambiá a modo nuevo para crearlo acá.
                            </p>
                          </div>
                        ) : (
                          <PassengerClientFields
                            draft={newClientDraft}
                            onChange={updateNewClientDraftField}
                            onCustomChange={updateNewClientCustomField}
                            disabled={submitting}
                            requiredFields={effectiveClientRequiredFields}
                            hiddenFields={clientHiddenFields}
                            customFields={clientCustomFields}
                            passengerCategories={passengerCategories}
                            title="Nuevo pasajero"
                            description="Completá los datos mínimos para crear y sumar el pasajero a esta grupal."
                          />
                        )}
                      </motion.div>
                    </AnimatePresence>

                    {isSingleDepartureMode ? (
                      <p className="rounded-2xl border border-slate-300/80 bg-white/70 px-3 py-2 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
                        Se asigna automáticamente a la salida principal:
                        {" "}
                        <span className="font-semibold">
                          {sortedDepartures[0]?.name || "Sin salida principal"}
                        </span>
                      </p>
                    ) : (
                      <label className="flex flex-col gap-1 text-sm">
                        <span className="ml-1 font-medium text-slate-900 dark:text-slate-100">
                          Salida destino
                        </span>
                        <select
                          value={newPassengerDepartureId}
                          onChange={(e) => setNewPassengerDepartureId(e.target.value)}
                          disabled={submitting}
                          className="rounded-2xl border bg-white/90 px-3 py-2 shadow-sm shadow-slate-900/10 outline-none transition focus:border-sky-500 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          <option value="">Automática</option>
                          {sortedDepartures.map((dep) => (
                            <option
                              key={dep.id_travel_group_departure}
                              value={dep.public_id || dep.id_travel_group_departure}
                            >
                              {dep.name} · {formatDate(dep.departure_date)}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    <button
                      type="submit"
                      disabled={
                        submitting ||
                        (newPassengerMode === "EXISTENTE" && !newPassengerClientId)
                      }
                      className="rounded-full border border-sky-300 bg-sky-50/70 px-4 py-2 text-sm font-semibold text-sky-800 transition hover:border-sky-400 hover:bg-sky-100/70 disabled:cursor-not-allowed disabled:opacity-50 dark:border-sky-600 dark:bg-slate-900/70 dark:text-sky-200"
                    >
                      {submitting ? (
                        <Spinner label="Guardando..." />
                      ) : newPassengerMode === "NUEVO" ? (
                        "Crear pasajero y agregar"
                      ) : (
                        "Agregar pasajero"
                      )}
                    </button>
                  </form>
                ) : !activePassenger ? (
                  <p className="mt-3 rounded-2xl border border-slate-300/80 bg-white/70 px-4 py-3 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
                    Seleccioná un pasajero en la tabla, lista o grilla para editarlo.
                  </p>
                ) : (
                  <div className="mt-3 flex flex-col gap-4">
                    <div className="rounded-2xl border border-slate-300/80 bg-white/70 px-3 py-2 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
                      Pasajero activo:{" "}
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {activePassenger.client
                          ? `${activePassenger.client.first_name} ${activePassenger.client.last_name}`
                          : `Cliente Nº${activePassenger.client_id ?? "-"}`}
                      </span>
                      {" · "}
                      Estado:{" "}
                      <span className="font-semibold">
                        {formatPassengerStatus(activePassengerStatus || activePassenger.status)}
                      </span>
                      {" · "}El estado se cambia rápido desde la tabla.
                    </div>

                    <form
                      onSubmit={handleSaveActivePassenger}
                      className="flex flex-col gap-3 rounded-2xl border border-slate-300/80 bg-white/70 p-4 dark:border-slate-600 dark:bg-slate-900/60"
                    >
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Datos operativos
                      </p>
                      {isSingleDepartureMode ? (
                        <p className="rounded-2xl border border-slate-300/80 bg-white/80 px-3 py-2 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-300">
                          Salida de este pasajero:{" "}
                          <span className="font-semibold">
                            {sortedDepartures[0]?.name || "Sin salida principal"}
                          </span>
                        </p>
                      ) : (
                        <label className="flex flex-col gap-1 text-sm">
                          <span className="ml-1 font-medium text-slate-900 dark:text-slate-100">
                            Salida
                          </span>
                          <select
                            value={activePassengerDepartureId}
                            onChange={(e) => setActivePassengerDepartureId(e.target.value)}
                            disabled={submitting}
                            className="rounded-2xl border bg-white/90 px-3 py-2 shadow-sm shadow-slate-900/10 outline-none transition focus:border-sky-500 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            <option value="CLEAR">Sin salida asignada</option>
                            {sortedDepartures.map((dep) => (
                              <option
                                key={dep.id_travel_group_departure}
                                value={dep.public_id || dep.id_travel_group_departure}
                              >
                                {dep.name} · {formatDate(dep.departure_date)}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <label className="flex flex-col gap-1 text-sm">
                        <span className="ml-1 font-medium text-slate-900 dark:text-slate-100">
                          Nota interna
                        </span>
                        <textarea
                          value={activePassengerNote}
                          onChange={(e) => setActivePassengerNote(e.target.value)}
                          rows={2}
                          disabled={submitting}
                          placeholder="Observaciones de este pasajero dentro de la grupal..."
                          className="rounded-2xl border bg-white/90 px-3 py-2 shadow-sm shadow-slate-900/10 outline-none transition focus:border-sky-500 disabled:cursor-not-allowed disabled:opacity-70"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={submitting}
                        className="rounded-full border border-sky-300 bg-sky-50/70 px-4 py-2 text-sm font-semibold text-sky-800 transition hover:border-sky-400 hover:bg-sky-100/70 disabled:cursor-not-allowed disabled:opacity-50 dark:border-sky-600 dark:bg-slate-900/70 dark:text-sky-200"
                      >
                        {submitting ? <Spinner label="Guardando..." /> : "Guardar datos operativos"}
                      </button>
                    </form>

                    <form onSubmit={handleSaveActiveClient} className="flex flex-col gap-3">
                      {activeClientLoading || !activeClientDraft ? (
                        <p className="rounded-2xl border border-slate-300/80 bg-white/70 px-4 py-3 text-xs text-slate-600 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-400">
                          Cargando datos del pasajero...
                        </p>
                      ) : (
                        <>
                          <PassengerClientFields
                            draft={activeClientDraft}
                            onChange={updateActiveClientDraftField}
                            onCustomChange={updateActiveClientCustomField}
                            disabled={submitting}
                            requiredFields={effectiveClientRequiredFields}
                            hiddenFields={clientHiddenFields}
                            customFields={clientCustomFields}
                            passengerCategories={passengerCategories}
                            title="Datos personales del pasajero"
                            description="Este bloque se reutiliza para editar la información del pasajero activo."
                          />
                          <button
                            type="submit"
                            disabled={submitting}
                            className="rounded-full border border-sky-300 bg-sky-50/70 px-4 py-2 text-sm font-semibold text-sky-800 transition hover:border-sky-400 hover:bg-sky-100/70 disabled:cursor-not-allowed disabled:opacity-50 dark:border-sky-600 dark:bg-slate-900/70 dark:text-sky-200"
                          >
                            {submitting ? (
                              <Spinner label="Guardando..." />
                            ) : (
                              "Guardar datos personales"
                            )}
                          </button>
                        </>
                      )}
                    </form>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </CollapsiblePanel>
          </section>
        ) : null}

        {showGroupPanels ? (
          <section
            id="panel-servicios"
            className="rounded-3xl border border-sky-200/80 bg-white/70 p-5 shadow-sm shadow-slate-900/10 backdrop-blur-md dark:border-sky-800/70 dark:bg-slate-900/55"
          >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Servicios de la grupal
              </h2>
              <p className="text-xs text-slate-700 dark:text-slate-300">
                {editingInventoryId
                  ? "Edición de servicio activa."
                  : "Agregá y administrá servicios por salida o generales."}
              </p>
            </div>
            <ToggleIconButton
              open={showInventoryForm}
              onClick={() => {
                setShowInventoryForm((prev) => !prev);
                if (showInventoryForm) {
                  setEditingInventoryId(null);
                  setInventoryDraft(
                    defaultInventoryDraft(undefined, {
                      defaultTransferFeePct,
                      operators: operatorOptions,
                    }),
                  );
                  setInventoryProviderMode("OPERADOR");
                  setShowManualInventoryStatsInputs(false);
                }
              }}
              label="formulario de servicios"
            />
          </div>
          {serviceOptionsError ? (
            <p className="mt-3 rounded-2xl border border-amber-300/80 bg-amber-100/85 px-3 py-2 text-xs text-amber-900 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200">
              {serviceOptionsError}
            </p>
          ) : null}
          <CollapsiblePanel open={showInventoryForm} className="mt-3">
            <form
              onSubmit={handleSaveInventory}
              className="space-y-4 rounded-2xl border border-sky-300/70 bg-white/60 p-4 dark:border-sky-700/60 dark:bg-slate-900/55"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Datos del servicio
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Cargá inventario con configuración de tipos, operadores y moneda.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  Tipo de servicio (configuración)
                  <select
                    value={inventoryDraft.service_type}
                    onChange={(e) => {
                      const next = e.target.value;
                      const selected = serviceTypeOptions.find(
                        (item) => item.code === next,
                      );
                      setInventoryDraft((prev) => ({
                        ...prev,
                        service_type: next,
                        inventory_type: selected?.name?.trim() || prev.inventory_type,
                      }));
                    }}
                    disabled={submitting}
                    className={FIELD_INPUT_CLASS}
                  >
                    <option value="">Seleccionar tipo</option>
                    {serviceTypeOptions.map((option) => (
                      <option key={option.id_service_type} value={option.code}>
                        {option.name} ({option.code})
                      </option>
                    ))}
                    {inventoryDraft.service_type &&
                    !serviceTypeOptions.some(
                      (item) => item.code === inventoryDraft.service_type,
                    ) ? (
                      <option value={inventoryDraft.service_type}>
                        {inventoryDraft.service_type} (no listado)
                      </option>
                    ) : null}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Tipo de inventario
                  <input
                    value={inventoryDraft.inventory_type}
                    onChange={(e) =>
                      setInventoryDraft((prev) => ({
                        ...prev,
                        inventory_type: e.target.value,
                      }))
                    }
                    placeholder="Aéreo, hotel, traslado..."
                    disabled={submitting}
                    className={FIELD_INPUT_CLASS}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm md:col-span-2">
                  Nombre / etiqueta
                  <input
                    value={inventoryDraft.label}
                    onChange={(e) =>
                      setInventoryDraft((prev) => ({ ...prev, label: e.target.value }))
                    }
                    placeholder="Ej: Bloqueo hotel Río / Aéreo AR1234"
                    disabled={submitting}
                    className={FIELD_INPUT_CLASS}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm md:col-span-2">
                  Salida asociada (opcional)
                  <select
                    value={inventoryDraft.departure_id}
                    onChange={(e) =>
                      setInventoryDraft((prev) => ({
                        ...prev,
                        departure_id: e.target.value,
                      }))
                    }
                    disabled={submitting}
                    className={FIELD_INPUT_CLASS}
                  >
                    <option value="">Sin salida específica</option>
                    {sortedDepartures.map((dep) => (
                      <option
                        key={dep.id_travel_group_departure}
                        value={dep.public_id || dep.id_travel_group_departure}
                      >
                        {dep.name} · {formatDate(dep.departure_date)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="rounded-2xl border border-sky-300/70 bg-white/65 p-3 dark:border-sky-700/60 dark:bg-slate-900/55">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 dark:text-slate-300">
                  Operador y moneda
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setInventoryProviderMode("OPERADOR")}
                    className={pillClass(inventoryProviderMode === "OPERADOR", "sky")}
                  >
                    Operador desde configuración
                  </button>
                  <button
                    type="button"
                    onClick={() => setInventoryProviderMode("MANUAL")}
                    className={pillClass(inventoryProviderMode === "MANUAL", "amber")}
                  >
                    Proveedor manual
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {inventoryProviderMode === "OPERADOR" ? (
                    <label className="flex flex-col gap-1 text-sm">
                      Operador
                      <select
                        value={inventoryDraft.operator_id}
                        onChange={(e) => {
                          const nextId = e.target.value;
                          const selected = operatorOptions.find(
                            (item) => String(item.id_operator) === nextId,
                          );
                          setInventoryDraft((prev) => ({
                            ...prev,
                            operator_id: nextId,
                            provider: selected?.name || prev.provider,
                          }));
                        }}
                        disabled={submitting}
                        className={FIELD_INPUT_CLASS}
                      >
                        <option value="">
                          {operatorOptions.length > 0
                            ? "Seleccionar operador"
                            : "Sin operadores disponibles"}
                        </option>
                        {operatorOptions.map((operator) => (
                          <option
                            key={operator.id_operator}
                            value={operator.id_operator}
                          >
                            {operator.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label className="flex flex-col gap-1 text-sm">
                      Proveedor (manual)
                      <input
                        value={inventoryDraft.provider}
                        onChange={(e) =>
                          setInventoryDraft((prev) => ({
                            ...prev,
                            provider: e.target.value,
                            operator_id: "",
                          }))
                        }
                        disabled={submitting}
                        placeholder="Ej: Operador interno / cupo propio"
                        className={FIELD_INPUT_CLASS}
                      />
                    </label>
                  )}
                  <label className="flex flex-col gap-1 text-sm">
                    Moneda
                    <select
                      value={inventoryDraft.currency}
                      onChange={(e) =>
                        setInventoryDraft((prev) => ({
                          ...prev,
                          currency: e.target.value.toUpperCase(),
                        }))
                      }
                      disabled={submitting}
                      className={FIELD_INPUT_CLASS}
                    >
                      {inventoryCurrencyOptions.map((code) => (
                        <option key={code} value={code}>
                          {currencyLabelByCode.get(code) || code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm md:col-span-2">
                    Localizador / referencia (opcional)
                    <input
                      value={inventoryDraft.locator}
                      onChange={(e) =>
                        setInventoryDraft((prev) => ({
                          ...prev,
                          locator: e.target.value,
                        }))
                      }
                      disabled={submitting}
                      placeholder="Ej: ABC123 / LOC-7788"
                      className={FIELD_INPUT_CLASS}
                    />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 rounded-2xl border border-sky-300/70 bg-sky-50/55 p-3 text-xs text-slate-700 dark:border-sky-700/60 dark:bg-sky-900/15 dark:text-slate-300 md:grid-cols-5">
                <div className="rounded-xl border border-sky-300/50 bg-white/80 p-2 dark:border-sky-700/60 dark:bg-slate-900/60">
                  <p className="text-[11px]">Comprados</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {inventoryDraftPreview.qtyTotal}
                  </p>
                </div>
                <div className="rounded-xl border border-sky-300/50 bg-white/80 p-2 dark:border-sky-700/60 dark:bg-slate-900/60">
                  <p className="text-[11px]">Asignados</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {inventoryDraftPreview.qtyAssigned}
                  </p>
                </div>
                <div className="rounded-xl border border-sky-300/50 bg-white/80 p-2 dark:border-sky-700/60 dark:bg-slate-900/60">
                  <p className="text-[11px]">Confirmados</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {inventoryDraftPreview.qtyConfirmed}
                  </p>
                </div>
                <div className="rounded-xl border border-sky-300/50 bg-white/80 p-2 dark:border-sky-700/60 dark:bg-slate-900/60">
                  <p className="text-[11px]">Bloqueados</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {inventoryDraftPreview.qtyBlocked}
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-300/60 bg-emerald-100/85 p-2 text-emerald-800 dark:border-emerald-700/70 dark:bg-emerald-900/20 dark:text-emerald-200">
                  <p className="text-[11px]">Disponibles</p>
                  <p className="text-sm font-semibold">{inventoryDraftPreview.qtyAvailable}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  Cupos comprados
                  <input
                    value={inventoryDraft.total_qty}
                    onChange={(e) =>
                      setInventoryDraft((prev) => ({
                        ...prev,
                        total_qty: e.target.value,
                      }))
                    }
                    inputMode="numeric"
                    disabled={submitting}
                    className={FIELD_INPUT_CLASS}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Bloqueados operativos
                  <input
                    value={inventoryDraft.blocked_qty}
                    onChange={(e) =>
                      setInventoryDraft((prev) => ({
                        ...prev,
                        blocked_qty: e.target.value,
                      }))
                    }
                    inputMode="numeric"
                    disabled={submitting}
                    className={FIELD_INPUT_CLASS}
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={() => setShowManualInventoryStatsInputs((prev) => !prev)}
                className={pillClass(showManualInventoryStatsInputs, "amber")}
              >
                {showManualInventoryStatsInputs
                  ? "Ocultar ajuste manual de asignados/confirmados"
                  : "Ajustar manualmente asignados/confirmados"}
              </button>

              <CollapsiblePanel open={showManualInventoryStatsInputs}>
                <div className="mt-2 grid grid-cols-1 gap-3 rounded-2xl border border-amber-300/70 bg-amber-100/70 p-3 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-100 md:grid-cols-2">
                  <label className="flex flex-col gap-1 text-sm">
                    Asignados a pasajeros
                    <input
                      value={inventoryDraft.assigned_qty}
                      onChange={(e) =>
                        setInventoryDraft((prev) => ({
                          ...prev,
                          assigned_qty: e.target.value,
                        }))
                      }
                      inputMode="numeric"
                      disabled={submitting}
                      className={FIELD_INPUT_CLASS}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Confirmados con operador
                    <input
                      value={inventoryDraft.confirmed_qty}
                      onChange={(e) =>
                        setInventoryDraft((prev) => ({
                          ...prev,
                          confirmed_qty: e.target.value,
                        }))
                      }
                      inputMode="numeric"
                      disabled={submitting}
                      className={FIELD_INPUT_CLASS}
                    />
                  </label>
                  <p className="md:col-span-2">
                    Este bloque es solo para correcciones puntuales. En operación diaria, usá los
                    indicadores para seguimiento y mantené mínimos los ajustes manuales.
                  </p>
                </div>
              </CollapsiblePanel>

              <p className="rounded-2xl border border-sky-300/70 bg-sky-50/55 px-3 py-2 text-xs text-slate-700 dark:border-sky-700/60 dark:bg-sky-900/15 dark:text-slate-300">
                <span className="font-semibold">Cómo leer estos cupos:</span> comprados = total adquirido, asignados = vinculados a pasajeros, confirmados = validados con operador, bloqueados = no disponibles para asignar.
              </p>

              <div className="rounded-2xl border border-sky-300/70 bg-white/65 p-3 dark:border-sky-700/60 dark:bg-slate-900/55">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 dark:text-slate-300">
                  Precios e impuestos (estimación)
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setInventoryDraft((prev) => ({
                        ...prev,
                        pricing_mode: "MANUAL",
                      }))
                    }
                    className={pillClass(inventoryDraft.pricing_mode === "MANUAL", "sky")}
                  >
                    Venta por unidad
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setInventoryDraft((prev) => ({
                        ...prev,
                        pricing_mode: "VENTA_TOTAL",
                      }))
                    }
                    className={pillClass(
                      inventoryDraft.pricing_mode === "VENTA_TOTAL",
                      "emerald",
                    )}
                  >
                    Venta total del servicio
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setInventoryDraft((prev) => ({
                        ...prev,
                        billing_mode:
                          prev.billing_mode === "MANUAL" ? "AUTO" : "MANUAL",
                      }))
                    }
                    className={pillClass(inventoryDraft.billing_mode === "MANUAL", "amber")}
                  >
                    {inventoryDraft.billing_mode === "MANUAL"
                      ? "Facturación manual"
                      : "Facturación automática"}
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-1 text-sm">
                    Costo unitario
                    <input
                      value={inventoryDraft.unit_cost}
                      onChange={(e) =>
                        setInventoryDraft((prev) => ({
                          ...prev,
                          unit_cost: e.target.value,
                        }))
                      }
                      inputMode="decimal"
                      placeholder="0,00"
                      disabled={submitting}
                      className={FIELD_INPUT_CLASS}
                    />
                  </label>
                  {inventoryDraft.pricing_mode === "MANUAL" ? (
                    <label className="flex flex-col gap-1 text-sm">
                      Venta unitaria estimada
                      <input
                        value={inventoryDraft.sale_unit_price}
                        onChange={(e) =>
                          setInventoryDraft((prev) => ({
                            ...prev,
                            sale_unit_price: e.target.value,
                          }))
                        }
                        inputMode="decimal"
                        placeholder="0,00"
                        disabled={submitting}
                        className={FIELD_INPUT_CLASS}
                      />
                    </label>
                  ) : (
                    <label className="flex flex-col gap-1 text-sm">
                      Venta total estimada
                      <input
                        value={inventoryDraft.sale_total_price}
                        onChange={(e) =>
                          setInventoryDraft((prev) => ({
                            ...prev,
                            sale_total_price: e.target.value,
                          }))
                        }
                        inputMode="decimal"
                        placeholder="0,00"
                        disabled={submitting}
                        className={FIELD_INPUT_CLASS}
                      />
                    </label>
                  )}
                  <label className="flex flex-col gap-1 text-sm">
                    Base/importe 21% (opcional)
                    <input
                      value={inventoryDraft.taxable_21}
                      onChange={(e) =>
                        setInventoryDraft((prev) => ({
                          ...prev,
                          taxable_21: e.target.value,
                        }))
                      }
                      inputMode="decimal"
                      placeholder="0,00"
                      disabled={submitting}
                      className={FIELD_INPUT_CLASS}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Base/importe 10,5% (opcional)
                    <input
                      value={inventoryDraft.taxable_105}
                      onChange={(e) =>
                        setInventoryDraft((prev) => ({
                          ...prev,
                          taxable_105: e.target.value,
                        }))
                      }
                      inputMode="decimal"
                      placeholder="0,00"
                      disabled={submitting}
                      className={FIELD_INPUT_CLASS}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Exento (opcional)
                    <input
                      value={inventoryDraft.exempt_amount}
                      onChange={(e) =>
                        setInventoryDraft((prev) => ({
                          ...prev,
                          exempt_amount: e.target.value,
                        }))
                      }
                      inputMode="decimal"
                      placeholder="0,00"
                      disabled={submitting}
                      className={FIELD_INPUT_CLASS}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Otros impuestos (opcional)
                    <input
                      value={inventoryDraft.other_taxes}
                      onChange={(e) =>
                        setInventoryDraft((prev) => ({
                          ...prev,
                          other_taxes: e.target.value,
                        }))
                      }
                      inputMode="decimal"
                      placeholder="0,00"
                      disabled={submitting}
                      className={FIELD_INPUT_CLASS}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm md:col-span-2">
                    Costo de transferencia (%)
                    <input
                      value={inventoryDraft.transfer_fee_pct}
                      onChange={(e) =>
                        setInventoryDraft((prev) => ({
                          ...prev,
                          transfer_fee_pct: e.target.value,
                        }))
                      }
                      inputMode="decimal"
                      placeholder={String(defaultTransferFeePct)}
                      disabled={submitting}
                      className={FIELD_INPUT_CLASS}
                    />
                    <span className="ml-1 text-xs text-slate-600 dark:text-slate-400">
                      Se usa para estimar costo financiero de cobro sobre la venta.
                    </span>
                  </label>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 rounded-2xl border border-sky-300/70 bg-sky-50/55 p-3 text-xs text-slate-700 dark:border-sky-700/60 dark:bg-sky-900/15 dark:text-slate-300 md:grid-cols-2">
                  <p>
                    Costo total estimado:{" "}
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {formatMoney(
                        inventoryDraftPreview.costTotal,
                        inventoryDraft.currency || "ARS",
                      )}
                    </span>
                  </p>
                  <p>
                    Venta estimada:{" "}
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {formatMoney(
                        inventoryDraftPreview.saleTotal,
                        inventoryDraft.currency || "ARS",
                      )}
                    </span>
                  </p>
                  <p>
                    Costos/impuestos adicionales:{" "}
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {formatMoney(
                        inventoryDraftPreview.taxes +
                          inventoryDraftPreview.transferFeeAmount,
                        inventoryDraft.currency || "ARS",
                      )}
                    </span>
                  </p>
                  <p>
                    Margen bruto estimado:{" "}
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {formatMoney(
                        inventoryDraftPreview.margin,
                        inventoryDraft.currency || "ARS",
                      )}
                    </span>
                  </p>
                </div>
              </div>

              <label className="flex flex-col gap-1 text-sm">
                Nota interna (opcional)
                <textarea
                  value={inventoryDraft.note}
                  onChange={(e) =>
                    setInventoryDraft((prev) => ({ ...prev, note: e.target.value }))
                  }
                  rows={2}
                  disabled={submitting}
                  className={FIELD_TEXTAREA_CLASS}
                />
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="rounded-full border border-sky-300 bg-sky-50/70 px-4 py-2 text-sm font-semibold text-sky-800 transition hover:border-sky-400 hover:bg-sky-100/70 disabled:cursor-not-allowed disabled:opacity-50 dark:border-sky-600 dark:bg-slate-900/70 dark:text-sky-200"
              >
                {submitting
                  ? <Spinner label="Guardando servicio..." />
                  : editingInventoryId
                    ? "Guardar servicio"
                    : "Agregar servicio"}
              </button>
            </form>
          </CollapsiblePanel>

          {inventoryFinancialSummary.length > 0 ? (
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {inventoryFinancialSummary.map((summary) => (
                <article
                  key={`fin-${summary.currency}`}
                  className="rounded-2xl border border-sky-300/70 bg-white/70 p-3 text-xs text-slate-700 dark:border-sky-700/60 dark:bg-slate-900/60 dark:text-slate-300"
                >
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Resumen financiero · {summary.currency}
                  </p>
                  <div className="mt-2 grid grid-cols-1 gap-1 md:grid-cols-2">
                    <p>
                      Servicios: <span className="font-semibold">{summary.servicesCount}</span>
                    </p>
                    <p>
                      Cupos comprados: <span className="font-semibold">{summary.totalQty}</span>
                    </p>
                    <p>
                      Cupos disponibles: <span className="font-semibold">{summary.availableQty}</span>
                    </p>
                    <p>
                      Costo total:{" "}
                      <span className="font-semibold">
                        {formatMoney(summary.costTotal, summary.currency)}
                      </span>
                    </p>
                    <p>
                      Venta estimada:{" "}
                      <span className="font-semibold">
                        {formatMoney(summary.saleTotal, summary.currency)}
                      </span>
                    </p>
                    <p>
                      Margen bruto estimado:{" "}
                      <span className="font-semibold">
                        {formatMoney(summary.grossMargin, summary.currency)}
                      </span>
                    </p>
                  </div>
                  <div className="mt-2 rounded-xl border border-amber-300/70 bg-amber-100/70 px-2.5 py-2 text-amber-900 dark:border-amber-600/60 dark:bg-amber-900/25 dark:text-amber-100">
                    Deuda operativa estimada:{" "}
                    <span className="font-semibold">
                      {formatMoney(summary.operationalDebt, summary.currency)}
                    </span>
                    {" · "}costo de cupos asignados a pasajeros que todavía no están confirmados con operador.
                  </div>
                </article>
              ))}
            </div>
          ) : null}

          <div className="mt-4 space-y-2">
            {inventories.length === 0 ? (
              <p className="rounded-2xl border border-sky-300/80 bg-white/70 px-4 py-3 text-sm text-slate-700 dark:border-sky-700/70 dark:bg-slate-900/60 dark:text-slate-300">
                Todavía no hay servicios cargados.
              </p>
            ) : (
              inventories.map((item) => {
                const parsedNote = parseInventoryNote(item.note ?? "");
                const metrics = inventoryFinancialById.get(item.id_travel_group_inventory);
                return (
                  <article
                    key={item.id_travel_group_inventory}
                    className="rounded-2xl border border-sky-300/80 bg-white/75 p-3 dark:border-sky-700/70 dark:bg-slate-900/60"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-100">
                          {item.label}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {item.inventory_type}
                          {item.service_type ? ` · ${item.service_type}` : ""}
                          {item.travelGroupDeparture?.name
                            ? ` · ${item.travelGroupDeparture.name}`
                            : ""}
                          {item.provider ? ` · ${item.provider}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => startEditInventory(item)}
                          disabled={submitting}
                          className="rounded-full border border-sky-300 bg-sky-50/70 px-3 py-1.5 text-xs font-semibold text-sky-800 transition hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-sky-700 dark:bg-slate-900/70 dark:text-sky-200 dark:hover:border-sky-600"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteInventory(item)}
                          disabled={submitting}
                          className="rounded-full border border-amber-300 bg-amber-100/90 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-700 dark:text-slate-300">
                      <span className="rounded-full border border-sky-300/80 bg-white/80 px-2 py-0.5 dark:border-sky-700 dark:bg-slate-900/70">
                        Comprados: {item.total_qty}
                      </span>
                      <span className="rounded-full border border-sky-300/80 bg-white/80 px-2 py-0.5 dark:border-sky-700 dark:bg-slate-900/70">
                        Asignados a pasajeros: {item.assigned_qty}
                      </span>
                      <span className="rounded-full border border-sky-300/80 bg-white/80 px-2 py-0.5 dark:border-sky-700 dark:bg-slate-900/70">
                        Confirmados con operador: {item.confirmed_qty}
                      </span>
                      <span className="rounded-full border border-sky-300/80 bg-white/80 px-2 py-0.5 dark:border-sky-700 dark:bg-slate-900/70">
                        Bloqueados: {item.blocked_qty}
                      </span>
                      {metrics ? (
                        <>
                          <span className="rounded-full border border-sky-300/80 bg-white/80 px-2 py-0.5 dark:border-sky-700 dark:bg-slate-900/70">
                            Costo total: {formatMoney(metrics.costTotal, metrics.currency)}
                          </span>
                          {metrics.saleTotal > 0 ? (
                            <span className="rounded-full border border-emerald-300/80 bg-emerald-100/90 px-2 py-0.5 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-200">
                              Venta estimada: {formatMoney(metrics.saleTotal, metrics.currency)}
                            </span>
                          ) : null}
                          <span className="rounded-full border border-amber-300/80 bg-amber-100/90 px-2 py-0.5 text-amber-800 dark:border-amber-700 dark:bg-amber-900/25 dark:text-amber-200">
                            Deuda operativa: {formatMoney(metrics.operationalDebt, metrics.currency)}
                          </span>
                        </>
                      ) : null}
                    </div>
                    {parsedNote.noteText ? (
                      <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                        Nota: {parsedNote.noteText}
                      </p>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>
          </section>
        ) : null}

        {showCobrosPanels ? (
          <section
            id="panel-cobros"
            className="rounded-3xl border border-sky-200/80 bg-white/70 p-5 shadow-sm shadow-slate-900/10 backdrop-blur-md dark:border-sky-800/70 dark:bg-slate-900/55"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Plan de pago, cobro y recibo del pasajero
                </h2>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  Cobros y recibos se gestionan por pasajero. La reserva grupal es el contexto operativo.
                </p>
              </div>
              <ToggleIconButton
                open={showCollectForm}
                onClick={() => setShowCollectForm((prev) => !prev)}
                label="cobros del pasajero"
              />
            </div>

            <CollapsiblePanel open={showCollectForm} className="mt-3">
              <div className="space-y-3 rounded-2xl border border-sky-300/70 bg-white/70 p-3 dark:border-sky-700/60 dark:bg-slate-900/60">
                <label className="flex flex-col gap-1 text-sm">
                  Pasajero para gestionar cobros
                  <select
                    value={collectPassengerId}
                    onChange={(e) => setCollectPassengerId(e.target.value)}
                    disabled={financePassengerOptions.length === 0}
                    className={FIELD_INPUT_CLASS}
                  >
                    {financePassengerOptions.length === 0 ? (
                      <option value="">No hay pasajeros con reserva activa</option>
                    ) : null}
                    {financePassengerOptions.map((option) => (
                      <option
                        key={`collect-passenger-${option.passengerId}`}
                        value={option.passengerId}
                      >
                        {option.passengerName} · Pax Nº
                        {option.agencyClientId ?? option.clientId} · Reserva Nº
                        {option.agencyBookingId ?? option.bookingId}
                        {option.departureName ? ` · ${option.departureName}` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                {financePassengerOptions.length === 0 ? (
                  <p className="rounded-2xl border border-slate-300/80 bg-white/80 px-3 py-2 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-300">
                    Todavía no hay pasajeros vinculados para gestionar cobros.
                  </p>
                ) : !selectedCollectPassenger || !selectedCollectBookingId || !selectedCollectClientId ? (
                  <p className="rounded-2xl border border-slate-300/80 bg-white/80 px-3 py-2 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-300">
                    Seleccioná un pasajero con reserva válida para continuar.
                  </p>
                ) : !collectBooking ? (
                  <p className="rounded-2xl border border-slate-300/80 bg-white/80 px-3 py-2 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-300">
                    {collectLoading ? "Cargando datos de cobro..." : "Reserva del pasajero no disponible."}
                  </p>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-sky-300/70 bg-sky-50/60 p-3 text-xs text-slate-700 dark:border-sky-700/60 dark:bg-sky-900/20 dark:text-slate-300">
                      <p>
                        Pasajero:{" "}
                        <span className="font-semibold">
                          {selectedCollectPassenger.client
                            ? `${selectedCollectPassenger.client.first_name} ${selectedCollectPassenger.client.last_name}`
                            : `Cliente ${selectedCollectClientId}`}
                        </span>
                        {" · "}Reserva Nº{" "}
                        <span className="font-semibold">
                          {collectBooking.agency_booking_id ?? collectBooking.id_booking}
                        </span>
                        {" · "}Cuotas: <span className="font-semibold">{collectClientPayments.length}</span>
                        {" · "}Recibos: <span className="font-semibold">{collectReceipts.length}</span>
                      </p>
                    </div>

                    {collectLoadingError ? (
                      <p className="rounded-2xl border border-amber-300/80 bg-amber-100/85 px-3 py-2 text-xs text-amber-900 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200">
                        {collectLoadingError}
                      </p>
                    ) : null}

                    <section className="space-y-3 rounded-2xl border border-sky-300/70 bg-white/70 p-3 dark:border-sky-700/60 dark:bg-slate-900/60">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Plan de pago y vencimientos
                      </p>
                      {!token ? (
                        <p className="rounded-xl border border-amber-300/80 bg-amber-100/80 px-3 py-2 text-xs text-amber-900 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200">
                          Necesitás sesión activa para crear cuotas del pasajero.
                        </p>
                      ) : (
                        <ClientPaymentForm
                          token={token}
                          booking={collectBooking}
                          defaultClientId={selectedCollectClientId}
                          lockClient={true}
                          onCreated={() => {
                            void refreshCollectData();
                          }}
                        />
                      )}
                      <ClientPaymentList
                        payments={collectClientPayments}
                        booking={collectBooking}
                        role={financeRole}
                        loading={collectLoading}
                        onPaymentDeleted={() => {
                          void refreshCollectData();
                        }}
                      />
                    </section>

                    <section className="space-y-3 rounded-2xl border border-sky-300/70 bg-white/70 p-3 dark:border-sky-700/60 dark:bg-slate-900/60">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          Cobro y recibo del pasajero
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            if (editingCollectReceipt) setEditingCollectReceipt(null);
                            setCollectReceiptFormVisible((prev) => !prev);
                          }}
                          className={pillClass(collectReceiptFormVisible, "sky")}
                        >
                          {collectReceiptFormVisible
                            ? "Ocultar formulario"
                            : "Nuevo recibo / asociar existente"}
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => void refreshCollectData()}
                          disabled={collectLoading}
                          className="rounded-full border border-slate-300 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-slate-500"
                        >
                          {collectLoading ? "Actualizando..." : "Refrescar recibos"}
                        </button>
                      </div>
                      {!token ? (
                        <p className="rounded-xl border border-amber-300/80 bg-amber-100/80 px-3 py-2 text-xs text-amber-900 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200">
                          Necesitás sesión activa para crear/editar recibos.
                        </p>
                      ) : (
                        <ReceiptForm
                          token={token}
                          editingReceiptId={editingCollectReceipt?.id_receipt ?? null}
                          isFormVisible={collectReceiptFormVisible}
                          setIsFormVisible={setCollectReceiptFormVisible}
                          bookingId={selectedCollectBookingId || undefined}
                          allowAgency={false}
                          enableAttachAction={!editingCollectReceipt}
                          initialServiceIds={editingCollectReceipt?.serviceIds || []}
                          initialConcept={editingCollectReceipt?.concept || ""}
                          initialAmount={
                            editingCollectReceipt
                              ? toAmountNumber(editingCollectReceipt.amount)
                              : undefined
                          }
                          initialCurrency={
                            editingCollectReceipt?.amount_currency
                              ? normalizeCurrencyCode(editingCollectReceipt.amount_currency)
                              : undefined
                          }
                          initialAmountWords={editingCollectReceipt?.amount_string || ""}
                          initialAmountWordsCurrency={
                            editingCollectReceipt?.base_currency
                              ? normalizeCurrencyCode(editingCollectReceipt.base_currency)
                              : undefined
                          }
                          initialPaymentDescription={editingCollectReceipt?.currency || ""}
                          initialFeeAmount={
                            editingCollectReceipt?.payment_fee_amount != null
                              ? toAmountNumber(editingCollectReceipt.payment_fee_amount)
                              : undefined
                          }
                          initialIssueDate={toDateInputValue(editingCollectReceipt?.issue_date)}
                          initialBaseAmount={editingCollectReceipt?.base_amount ?? null}
                          initialBaseCurrency={editingCollectReceipt?.base_currency ?? null}
                          initialCounterAmount={editingCollectReceipt?.counter_amount ?? null}
                          initialCounterCurrency={editingCollectReceipt?.counter_currency ?? null}
                          initialClientIds={
                            editingCollectReceipt?.clientIds?.length
                              ? editingCollectReceipt.clientIds
                              : [Number(selectedCollectClientId)]
                          }
                          loadServicesForBooking={async (bookingId) => {
                            if (
                              collectBooking.id_booking === bookingId &&
                              collectBookingServices.length > 0
                            ) {
                              return collectBookingServices.map((service) => ({
                                id_service: service.id_service,
                                description:
                                  service.description ||
                                  service.type ||
                                  `Servicio ${service.id_service}`,
                                currency: normalizeCurrencyCode(service.currency || "ARS"),
                                sale_price: toAmountNumber(service.sale_price),
                                card_interest: toAmountNumber(service.card_interest || 0),
                                taxableCardInterest: toAmountNumber(
                                  service.taxableCardInterest || 0,
                                ),
                                vatOnCardInterest: toAmountNumber(service.vatOnCardInterest || 0),
                                type: service.type,
                                destination: service.destination,
                              }));
                            }
                            const payload = await requestGroupApi<FinanceBookingPayload>(
                              `/api/bookings/${bookingId}`,
                              {
                                credentials: "include",
                                cache: "no-store",
                              },
                              "No pudimos cargar servicios de la reserva para el recibo.",
                            );
                            const remoteServices = Array.isArray(payload.services)
                              ? payload.services
                              : [];
                            return remoteServices.map((service) => ({
                              id_service: service.id_service,
                              description:
                                service.description ||
                                service.type ||
                                `Servicio ${service.id_service}`,
                              currency: normalizeCurrencyCode(service.currency || "ARS"),
                              sale_price: toAmountNumber(service.sale_price),
                              card_interest: toAmountNumber(service.card_interest || 0),
                              taxableCardInterest: toAmountNumber(service.taxableCardInterest || 0),
                              vatOnCardInterest: toAmountNumber(service.vatOnCardInterest || 0),
                              type: service.type,
                              destination: service.destination,
                            }));
                          }}
                          onAttachExisting={async ({ id_receipt, bookingId, serviceIds }) => {
                            await requestGroupApi(
                              `/api/receipts/${id_receipt}`,
                              {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                credentials: "include",
                                body: JSON.stringify({
                                  bookingId,
                                  booking: { id_booking: bookingId },
                                  clientIds: [Number(selectedCollectClientId)],
                                  serviceIds,
                                }),
                              },
                              "No pudimos asociar el recibo al pasajero seleccionado.",
                            );
                            await refreshCollectData();
                          }}
                          onSubmit={async (payload) => {
                            const normalizedPayload = {
                              ...payload,
                              booking: { id_booking: Number(selectedCollectBookingId) },
                              clientIds: [Number(selectedCollectClientId)],
                            };

                            if (editingCollectReceipt?.id_receipt) {
                              const routeId =
                                editingCollectReceipt.public_id || editingCollectReceipt.id_receipt;
                              const response = await requestGroupApi<SubmitResult>(
                                `/api/receipts/${routeId}`,
                                {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  credentials: "include",
                                  body: JSON.stringify(normalizedPayload),
                                },
                                "No pudimos actualizar el recibo.",
                              );
                              setEditingCollectReceipt(null);
                              setCollectReceiptFormVisible(false);
                              await refreshCollectData();
                              return response;
                            }

                            const response = await requestGroupApi<SubmitResult>(
                              "/api/receipts",
                              {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                credentials: "include",
                                body: JSON.stringify(normalizedPayload),
                              },
                              "No pudimos crear el recibo.",
                            );
                            setCollectReceiptFormVisible(false);
                            await refreshCollectData();
                            return response;
                          }}
                          onCancel={() => {
                            setEditingCollectReceipt(null);
                            setCollectReceiptFormVisible(false);
                          }}
                        />
                      )}

                      {collectReceipts.length > 0 ? (
                        <ReceiptList
                          token={token}
                          receipts={collectReceipts}
                          booking={collectBooking}
                          services={collectBookingServices}
                          role={financeRole}
                          onReceiptDeleted={() => {
                            void refreshCollectData();
                          }}
                          onReceiptEdit={(receipt) => {
                            setEditingCollectReceipt(receipt);
                            setCollectReceiptFormVisible(true);
                          }}
                        />
                      ) : (
                        <p className="rounded-2xl border border-slate-300/80 bg-white/80 px-3 py-2 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-300">
                          No hay recibos cargados para este pasajero.
                        </p>
                      )}
                    </section>
                  </div>
                )}
              </div>
            </CollapsiblePanel>
          </section>
        ) : null}

        {showPagosPanels ? (
          <section
            id="panel-finanzas"
            className="rounded-3xl border border-sky-200/80 bg-white/70 p-5 shadow-sm shadow-slate-900/10 backdrop-blur-md dark:border-sky-800/70 dark:bg-slate-900/55"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Pagos y vencimientos con operador
                </h2>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  Gestión consolidada de deudas y pagos operativos por reserva vinculada.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void refreshFinanceData()}
                disabled={financeLoading || !selectedFinanceReservation}
                className="rounded-full border border-slate-300 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-slate-500"
              >
                {financeLoading ? "Actualizando..." : "Refrescar pagos"}
              </button>
            </div>

            <div className="mt-3 space-y-3">
              <label className="flex flex-col gap-1 text-sm">
                Reserva grupal/salida para gestionar
                <select
                  value={financeReservationKey}
                  onChange={(e) => setFinanceReservationKey(e.target.value)}
                  disabled={financeReservationOptions.length === 0}
                  className={FIELD_INPUT_CLASS}
                >
                  {financeReservationOptions.length === 0 ? (
                    <option value="">No hay contextos de reserva</option>
                  ) : null}
                  {financeReservationOptions.map((option) => (
                    <option key={`payments-reservation-${option.key}`} value={option.key}>
                      {option.label} · {option.passengerCount} pax
                    </option>
                  ))}
                </select>
              </label>

              {financeReservationOptions.length === 0 ? (
                <p className="rounded-2xl border border-slate-300/80 bg-white/80 px-4 py-3 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
                  Todavía no hay reservas grupales/salidas disponibles para operar pagos a operador.
                </p>
              ) : !selectedFinanceReservation ? (
                <p className="rounded-2xl border border-slate-300/80 bg-white/80 px-4 py-3 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
                  Seleccioná una salida o contexto grupal para continuar.
                </p>
              ) : !financeBooking ? (
                <p className="rounded-2xl border border-slate-300/80 bg-white/80 px-4 py-3 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
                  {financeLoading ? "Cargando datos de pagos..." : "Reserva no disponible."}
                </p>
              ) : (
                <div className="space-y-4">
                  {reservationHasMultipleTechnicalBookings ? (
                    <p className="rounded-2xl border border-amber-300/80 bg-amber-100/90 px-3 py-2 text-xs text-amber-900 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200">
                      Esta salida tiene múltiples reservas técnicas históricas. La vista está consolidada y el alta operativa se registra sobre la reserva principal.
                    </p>
                  ) : null}
                  <div className="rounded-2xl border border-sky-300/70 bg-sky-50/60 p-3 text-xs text-slate-700 dark:border-sky-700/60 dark:bg-sky-900/20 dark:text-slate-300">
                    <p>
                      Pasajeros vinculados: <span className="font-semibold">{financeLinkedPassengers.length}</span>
                      {" · "}Deudas operador: <span className="font-semibold">{financeOperatorDues.length}</span>
                      {" · "}Pagos operador: <span className="font-semibold">ver listado</span>
                    </p>
                  </div>

                  {financeLoadingError ? (
                    <p className="rounded-2xl border border-amber-300/80 bg-amber-100/90 px-3 py-2 text-xs text-amber-900 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200">
                      {financeLoadingError}
                    </p>
                  ) : null}

                  {financeSummaryByCurrency.length > 0 ? (
                    <div className="space-y-2">
                      {financeSummaryByCurrency.map((summary) => (
                        <article
                          key={`finance-summary-payments-${summary.currency}`}
                          className="rounded-2xl border border-sky-300/70 bg-white/80 p-3 text-xs text-slate-700 dark:border-sky-700/60 dark:bg-slate-900/60 dark:text-slate-300"
                        >
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            Resumen {summary.currency}
                          </p>
                          <p className="mt-1">
                            Deuda pax vencida: <span className="font-semibold">{formatMoney(summary.overdueClientAmount, summary.currency)}</span>
                            {" · "}Deuda operador pendiente: <span className="font-semibold">{formatMoney(summary.pendingOperatorAmount, summary.currency)}</span>
                            {" · "}Balance neto: <span className="font-semibold">{formatMoney(summary.netBalance, summary.currency)}</span>
                          </p>
                        </article>
                      ))}
                    </div>
                  ) : null}

                  <section className="space-y-3 rounded-2xl border border-sky-300/70 bg-white/70 p-3 dark:border-sky-700/60 dark:bg-slate-900/60">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Vencimientos y deudas con operador
                    </p>
                    {!token ? (
                      <p className="rounded-xl border border-amber-300/80 bg-amber-100/80 px-3 py-2 text-xs text-amber-900 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200">
                        Necesitás sesión activa para crear vencimientos de operador.
                      </p>
                    ) : (
                      <OperatorDueForm
                        token={token}
                        booking={financeBooking}
                        availableServices={financeBookingServices}
                        onCreated={() => {
                          void refreshFinanceData();
                        }}
                      />
                    )}
                    <OperatorDueList
                      dues={financeOperatorDues}
                      booking={financeBooking}
                      role={financeRole}
                      operators={operatorOptions as unknown as Operator[]}
                      loading={financeLoading}
                      onDueDeleted={() => {
                        void refreshFinanceData();
                      }}
                      onStatusChanged={() => {
                        void refreshFinanceData();
                      }}
                    />
                  </section>

                  <section className="space-y-3 rounded-2xl border border-sky-300/70 bg-white/70 p-3 dark:border-sky-700/60 dark:bg-slate-900/60">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Pagos al operador
                    </p>
                    {!token ? (
                      <p className="rounded-xl border border-amber-300/80 bg-amber-100/80 px-3 py-2 text-xs text-amber-900 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200">
                        Necesitás sesión activa para registrar pagos a operador.
                      </p>
                    ) : (
                      <OperatorPaymentForm
                        token={token}
                        booking={financeBooking}
                        availableServices={financeBookingServices}
                        operators={operatorOptions as unknown as Operator[]}
                        onCreated={() => {
                          setFinanceOperatorPaymentsReloadKey((prev) => prev + 1);
                          void refreshFinanceData();
                        }}
                      />
                    )}
                    <OperatorPaymentList
                      token={token}
                      bookingId={selectedFinanceBookingId || undefined}
                      reloadKey={financeOperatorPaymentsReloadKey}
                    />
                  </section>
                </div>
              )}
            </div>
          </section>
        ) : null}

        {showFacturacionPanel ? (
          <section
            id="panel-facturacion"
            className="rounded-3xl border border-sky-200/80 bg-white/70 p-5 shadow-sm shadow-slate-900/10 backdrop-blur-md dark:border-sky-800/70 dark:bg-slate-900/55"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Facturación
                </h2>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  Facturas y notas de crédito por reserva vinculada.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void refreshFinanceData()}
                disabled={financeLoading || !selectedFinanceReservation}
                className="rounded-full border border-slate-300 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-slate-500"
              >
                {financeLoading ? "Actualizando..." : "Refrescar facturación"}
              </button>
            </div>

            <div className="mt-3 space-y-3">
              <label className="flex flex-col gap-1 text-sm">
                Reserva grupal/salida para gestionar
                <select
                  value={financeReservationKey}
                  onChange={(e) => setFinanceReservationKey(e.target.value)}
                  disabled={financeReservationOptions.length === 0}
                  className={FIELD_INPUT_CLASS}
                >
                  {financeReservationOptions.length === 0 ? (
                    <option value="">No hay contextos de reserva</option>
                  ) : null}
                  {financeReservationOptions.map((option) => (
                    <option key={`billing-reservation-${option.key}`} value={option.key}>
                      {option.label} · {option.passengerCount} pax
                    </option>
                  ))}
                </select>
              </label>

              {financeReservationOptions.length === 0 ? (
                <p className="rounded-2xl border border-slate-300/80 bg-white/80 px-4 py-3 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
                  Todavía no hay reservas grupales/salidas disponibles para facturar.
                </p>
              ) : !selectedFinanceReservation ? (
                <p className="rounded-2xl border border-slate-300/80 bg-white/80 px-4 py-3 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
                  Seleccioná una salida o contexto grupal para ver facturación.
                </p>
              ) : !financeBooking ? (
                <p className="rounded-2xl border border-slate-300/80 bg-white/80 px-4 py-3 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
                  {financeLoading ? "Cargando facturación..." : "Reserva no disponible."}
                </p>
              ) : (
                <div className="space-y-3">
                  {financeLoadingError ? (
                    <p className="rounded-2xl border border-amber-300/80 bg-amber-100/90 px-3 py-2 text-xs text-amber-900 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200">
                      {financeLoadingError}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Comprobantes de la reserva
                    </p>
                    <Link
                      href={`/bookings/services/${financeBooking.public_id || financeBooking.id_booking}`}
                      className="rounded-full border border-slate-300 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-slate-500"
                    >
                      Abrir detalle de reserva
                    </Link>
                  </div>

                  <div className="space-y-3 rounded-2xl border border-sky-300/70 bg-white/75 p-3 dark:border-sky-700/60 dark:bg-slate-900/60">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600 dark:text-slate-400">
                      Facturas
                    </p>
                    <InvoiceList
                      invoices={financeInvoices}
                      loading={financeLoading && financeInvoices.length === 0}
                      ready={true}
                    />
                  </div>

                  <div className="space-y-3 rounded-2xl border border-sky-300/70 bg-white/75 p-3 dark:border-sky-700/60 dark:bg-slate-900/60">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600 dark:text-slate-400">
                      Notas de crédito
                    </p>
                    <CreditNoteList creditNotes={financeCreditNotes} />
                  </div>
                </div>
              )}
            </div>
          </section>
        ) : null}
        {showGroupPanels ? (
          <section
            id="panel-pasajeros"
            className="rounded-3xl border border-sky-200/80 bg-white/70 p-5 shadow-sm shadow-slate-900/10 backdrop-blur-md dark:border-sky-800/70 dark:bg-slate-900/55"
          >
          <div className="my-1 flex flex-wrap items-center justify-between gap-4">
            <h2 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Pasajeros
              <span
                className={`${RESULT_PILL_BASE} ${
                  filteredPassengers.length > 0 ? RESULT_PILL_OK : RESULT_PILL_WARN
                }`}
              >
                {filteredPassengers.length}/{passengers.length}
              </span>
            </h2>

            <div className="flex items-center gap-1 rounded-full border border-slate-300/80 bg-white/80 p-1 text-xs dark:border-slate-600 dark:bg-slate-900/70">
              <button
                type="button"
                onClick={() => setPassengerView("GRID")}
                className={`flex items-center justify-center gap-1 rounded-full px-4 py-1.5 text-sm transition-colors ${
                  passengerView === "GRID"
                    ? "bg-emerald-500/15 text-emerald-700 shadow-sm shadow-emerald-900/20 dark:text-emerald-300"
                    : "text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
                }`}
                aria-pressed={passengerView === "GRID"}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="size-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z"
                  />
                </svg>
                Grilla
              </button>
              <button
                type="button"
                onClick={() => setPassengerView("LIST")}
                className={`flex items-center justify-center gap-1 rounded-full px-4 py-1.5 text-sm transition-colors ${
                  passengerView === "LIST"
                    ? "bg-emerald-500/15 text-emerald-700 shadow-sm shadow-emerald-900/20 dark:text-emerald-300"
                    : "text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
                }`}
                aria-pressed={passengerView === "LIST"}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="size-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
                  />
                </svg>
                Lista
              </button>
              <button
                type="button"
                onClick={() => setPassengerView("TABLE")}
                className={`flex items-center justify-center gap-1 rounded-full px-4 py-1.5 text-sm transition-colors ${
                  passengerView === "TABLE"
                    ? "bg-emerald-500/15 text-emerald-700 shadow-sm shadow-emerald-900/20 dark:text-emerald-300"
                    : "text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
                }`}
                aria-pressed={passengerView === "TABLE"}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="size-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 5.25h16.5M3.75 9.75h16.5M3.75 14.25h16.5M3.75 18.75h16.5"
                  />
                </svg>
                Tabla
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-700 dark:text-slate-300">
            Pasajero activo:{" "}
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {activePassenger?.client
                ? `${activePassenger.client.first_name} ${activePassenger.client.last_name}`
                : activePassenger
                  ? `Cliente Nº${activePassenger.client_id ?? "-"}`
                  : "Sin seleccionar"}
            </span>
          </p>

          <div className="mt-3 flex w-full flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex w-full items-center gap-2 rounded-2xl border border-slate-300/80 bg-white/80 px-4 py-1 text-slate-900 shadow-sm shadow-slate-900/10 backdrop-blur dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-100">
              <input
                value={passengerSearch}
                onChange={(e) => setPassengerSearch(e.target.value)}
                placeholder="Buscar pasajero/salida/reserva..."
                className="w-full bg-transparent py-1 outline-none placeholder:font-light placeholder:tracking-wide"
              />
              <button
                type="button"
                aria-label="Buscar"
                className="p-1 opacity-80 hover:opacity-100"
                title="Buscar"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="size-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                  />
                </svg>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowPassengerFilters((v) => !v)}
              className="flex items-center justify-center gap-2 rounded-2xl border border-slate-300/80 bg-white/80 px-6 py-2 text-slate-700 shadow-sm backdrop-blur transition hover:border-slate-400 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-slate-500"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.4}
                stroke="currentColor"
                className="size-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75"
                />
              </svg>
              <span>{showPassengerFilters ? "Ocultar" : "Filtros"}</span>
            </button>

            <button
              type="button"
              onClick={() => void fetchAll()}
              disabled={loading || submitting}
              className="inline-flex items-center justify-center rounded-2xl border border-slate-300/80 bg-white/80 px-4 py-2 text-slate-700 shadow-sm backdrop-blur transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-slate-500"
              title="Refrescar"
              aria-label="Refrescar"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className={`size-6 ${loading ? "animate-spin" : ""}`}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                />
              </svg>
            </button>
          </div>

          <CollapsiblePanel open={showPassengerFilters} className="mt-3">
            <div className="overflow-hidden rounded-3xl border border-sky-300/80 bg-white/70 p-4 text-slate-900 shadow-sm shadow-slate-900/10 backdrop-blur dark:border-sky-700/70 dark:bg-slate-900/60 dark:text-slate-100">
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  Estado
                  <select
                    value={passengerStatusFilter}
                    onChange={(e) => setPassengerStatusFilter(e.target.value)}
                    className={FIELD_INPUT_CLASS}
                  >
                    <option value="ALL">Todos</option>
                    {PASSENGER_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {formatPassengerStatus(s)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setPassengerSearch("");
                    setPassengerStatusFilter("ALL");
                  }}
                  className={pillClass(
                    passengerStatusFilter === "ALL" && !passengerSearch.trim(),
                    "emerald",
                  )}
                >
                  Limpiar filtros
                </button>
              </div>
            </div>
          </CollapsiblePanel>

          {filteredPassengers.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-slate-300/80 bg-white/70 px-4 py-3 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
              No hay pasajeros para los filtros actuales.
            </p>
          ) : passengerView === "TABLE" ? (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-300/80 bg-white/80 shadow-sm shadow-slate-900/10 dark:border-slate-600 dark:bg-slate-900/60">
              <table className="min-w-full text-left text-sm text-slate-800 dark:text-slate-100">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-[0.08em] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  <tr>
                    <th className="p-2">Pasajero</th>
                    <th className="p-2">Estado</th>
                    <th className="p-2">Salida</th>
                    <th className="p-2">Reserva</th>
                    <th className="p-2">Cuotas pendientes</th>
                    <th className="p-2">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPassengers.map((item) => {
                    const isActive =
                      activePassengerId === item.id_travel_group_passenger;
                    return (
                      <tr
                        key={item.id_travel_group_passenger}
                        className={`border-b border-slate-200/80 align-top dark:border-slate-700/80 ${
                          isActive ? "bg-emerald-50/50 dark:bg-emerald-900/10" : ""
                        }`}
                      >
                        <td className="p-2">
                          <p className="font-semibold text-slate-900 dark:text-slate-100">
                            {item.client
                              ? `${item.client.first_name} ${item.client.last_name}`
                              : `Cliente Nº${item.client_id ?? "-"}`}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            DNI: {item.client?.dni_number || "-"} · Tel:{" "}
                            {item.client?.phone || "-"}
                          </p>
                        </td>
                        <td className="p-2">
                          <select
                            value={item.status}
                            onChange={(e) =>
                              void handleInlinePassengerStatusChange(item, e.target.value)
                            }
                            disabled={
                              submitting ||
                              updatingPassengerStatusId ===
                                item.id_travel_group_passenger
                            }
                            className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold outline-none transition ${
                              STATUS_STYLES[item.status] || STATUS_STYLES.PENDIENTE
                            } disabled:cursor-not-allowed disabled:opacity-60`}
                            aria-label={`Estado de ${
                              item.client
                                ? `${item.client.first_name} ${item.client.last_name}`
                                : `pasajero ${item.id_travel_group_passenger}`
                            }`}
                          >
                            {PASSENGER_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {formatPassengerStatus(status)}
                              </option>
                            ))}
                          </select>
                          {updatingPassengerStatusId ===
                          item.id_travel_group_passenger ? (
                            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                              Actualizando...
                            </p>
                          ) : null}
                          {item.waitlist_position ? (
                            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                              Posición: {item.waitlist_position}
                            </p>
                          ) : null}
                        </td>
                        <td className="p-2 text-xs text-slate-700 dark:text-slate-300">
                          {item.travelGroupDeparture ? item.travelGroupDeparture.name : "-"}
                        </td>
                        <td className="p-2 text-xs text-slate-700 dark:text-slate-300">
                          {item.booking ? (
                            <>
                              Nº{item.booking.agency_booking_id ?? item.booking.id_booking}
                              <br />
                              {item.booking.clientStatus}
                            </>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="p-2 text-xs text-slate-700 dark:text-slate-300">
                          {item.pending_payment.count} ·{" "}
                          {Number(item.pending_payment.amount || "0").toFixed(2)}
                        </td>
                        <td className="p-2">
                          <button
                            type="button"
                            onClick={() => focusPassengerPanel(item.id_travel_group_passenger)}
                            className={pillClass(isActive, "sky")}
                          >
                            {isActive ? "En edición" : "Gestionar"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : passengerView === "LIST" ? (
            <div className="mt-4 space-y-2">
              {filteredPassengers.map((item) => {
                const isActive =
                  activePassengerId === item.id_travel_group_passenger;
                return (
                  <article
                    key={item.id_travel_group_passenger}
                    className={`rounded-2xl border p-3 shadow-sm shadow-slate-900/10 ${
                      isActive
                        ? "border-emerald-300/80 bg-emerald-50/60 dark:border-emerald-600 dark:bg-emerald-900/20"
                        : "border-slate-300/80 bg-white/80 dark:border-slate-600 dark:bg-slate-900/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-100">
                          {item.client
                            ? `${item.client.first_name} ${item.client.last_name}`
                            : `Cliente Nº${item.client_id ?? "-"}`}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Salida: {item.travelGroupDeparture?.name || "-"} · Reserva: Nº
                          {item.booking?.agency_booking_id ?? item.booking?.id_booking ?? "-"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => focusPassengerPanel(item.id_travel_group_passenger)}
                        className={pillClass(isActive, "sky")}
                      >
                        {isActive ? "En edición" : "Gestionar"}
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`rounded-full border px-2 py-0.5 font-bold ${STATUS_STYLES[item.status] || STATUS_STYLES.PENDIENTE}`}
                      >
                        {formatPassengerStatus(item.status)}
                      </span>
                      <span className="rounded-full border border-slate-300/80 bg-white/80 px-2 py-0.5 text-slate-700 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-300">
                        Pendientes: {item.pending_payment.count}
                      </span>
                      <span className="rounded-full border border-slate-300/80 bg-white/80 px-2 py-0.5 text-slate-700 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-300">
                        Monto: {Number(item.pending_payment.amount || "0").toFixed(2)}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredPassengers.map((item) => {
                const isActive =
                  activePassengerId === item.id_travel_group_passenger;
                return (
                  <article
                    key={item.id_travel_group_passenger}
                    className={`rounded-2xl border p-3 shadow-sm shadow-slate-900/10 ${
                      isActive
                        ? "border-emerald-300/80 bg-emerald-50/60 dark:border-emerald-600 dark:bg-emerald-900/20"
                        : "border-slate-300/80 bg-white/80 dark:border-slate-600 dark:bg-slate-900/60"
                    }`}
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLES[item.status] || STATUS_STYLES.PENDIENTE}`}
                      >
                        {formatPassengerStatus(item.status)}
                      </span>
                      <button
                        type="button"
                        onClick={() => focusPassengerPanel(item.id_travel_group_passenger)}
                        className={pillClass(isActive, "sky")}
                      >
                        {isActive ? "En edición" : "Gestionar"}
                      </button>
                    </div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {item.client
                        ? `${item.client.first_name} ${item.client.last_name}`
                        : `Cliente Nº${item.client_id ?? "-"}`}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      DNI: {item.client?.dni_number || "-"} · Tel: {item.client?.phone || "-"}
                    </p>
                    <p className="mt-2 text-xs text-slate-700 dark:text-slate-300">
                      Salida: {item.travelGroupDeparture?.name || "-"}
                    </p>
                    <p className="text-xs text-slate-700 dark:text-slate-300">
                      Reserva: Nº{item.booking?.agency_booking_id ?? item.booking?.id_booking ?? "-"}
                    </p>
                    <p className="mt-2 text-xs text-slate-700 dark:text-slate-300">
                      Pendientes: {item.pending_payment.count} ·{" "}
                      {Number(item.pending_payment.amount || "0").toFixed(2)}
                    </p>
                  </article>
                );
              })}
            </div>
          )}
          </section>
        ) : null}
      </div>
      <ToastContainer position="top-right" autoClose={3200} />
    </main>
  );
}
