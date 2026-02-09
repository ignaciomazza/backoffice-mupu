export type QuoteBookingDraft = {
  details?: string;
  departure_date?: string;
  return_date?: string;
  pax_count?: number | null;
  currency?: string;
  clientStatus?: string;
  operatorStatus?: string;
  status?: string;
  invoice_type?: string;
  invoice_observation?: string;
  observation?: string;
};

export type QuotePaxDraft = {
  mode?: "free" | "existing";
  client_id?: number | null;
  is_titular?: boolean;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  birth_date?: string;
  nationality?: string;
  gender?: string;
  notes?: string;
};

export type QuoteServiceDraft = {
  type?: string;
  description?: string;
  note?: string;
  sale_price?: number | null;
  cost_price?: number | null;
  currency?: string;
  destination?: string;
  reference?: string;
  operator_id?: number | null;
  departure_date?: string;
  return_date?: string;
};

export type QuoteCustomValues = Record<string, unknown>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function cleanString(v: unknown, max = 500): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s) return undefined;
  return s.slice(0, max);
}

function toPositiveInt(v: unknown): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.trunc(n);
}

function toNullableNumber(v: unknown): number | null | undefined {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

export function normalizeQuoteBookingDraft(input: unknown): QuoteBookingDraft {
  if (!isRecord(input)) return {};
  return {
    details: cleanString(input.details, 2000),
    departure_date: cleanString(input.departure_date, 32),
    return_date: cleanString(input.return_date, 32),
    pax_count:
      typeof input.pax_count === "number" && Number.isFinite(input.pax_count)
        ? Math.max(0, Math.trunc(input.pax_count))
        : null,
    currency: cleanString(input.currency, 16),
    clientStatus: cleanString(input.clientStatus, 60),
    operatorStatus: cleanString(input.operatorStatus, 60),
    status: cleanString(input.status, 60),
    invoice_type: cleanString(input.invoice_type, 120),
    invoice_observation: cleanString(input.invoice_observation, 2000),
    observation: cleanString(input.observation, 2000),
  };
}

export function normalizeQuotePaxDrafts(input: unknown): QuotePaxDraft[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((raw) => {
      if (!isRecord(raw)) return null;
      const mode = raw.mode === "existing" ? "existing" : "free";
      const birth =
        typeof raw.birth_date === "string" ? raw.birth_date.trim() : "";
      return {
        mode,
        client_id: toPositiveInt(raw.client_id) ?? null,
        is_titular: Boolean(raw.is_titular),
        first_name: cleanString(raw.first_name, 80),
        last_name: cleanString(raw.last_name, 80),
        phone: cleanString(raw.phone, 40),
        email: cleanString(raw.email, 120),
        birth_date: birth || undefined,
        nationality: cleanString(raw.nationality, 60),
        gender: cleanString(raw.gender, 40),
        notes: cleanString(raw.notes, 300),
      } as QuotePaxDraft;
    })
    .filter((v): v is QuotePaxDraft => v !== null);
}

export function normalizeQuoteServiceDrafts(
  input: unknown,
): QuoteServiceDraft[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((raw) => {
      if (!isRecord(raw)) return null;
      const dep =
        typeof raw.departure_date === "string" ? raw.departure_date.trim() : "";
      const ret =
        typeof raw.return_date === "string" ? raw.return_date.trim() : "";
      const sale = toNullableNumber(raw.sale_price);
      const cost = toNullableNumber(raw.cost_price);
      return {
        type: cleanString(raw.type, 80),
        description: cleanString(raw.description, 2000),
        note: cleanString(raw.note, 2000),
        sale_price: sale ?? null,
        cost_price: cost ?? null,
        currency: cleanString(raw.currency, 16),
        destination: cleanString(raw.destination, 200),
        reference: cleanString(raw.reference, 120),
        operator_id: toPositiveInt(raw.operator_id) ?? null,
        departure_date: dep || undefined,
        return_date: ret || undefined,
      } as QuoteServiceDraft;
    })
    .filter((v): v is QuoteServiceDraft => v !== null);
}

export function normalizeQuoteCustomValues(input: unknown): QuoteCustomValues {
  if (!isRecord(input)) return {};
  const out: QuoteCustomValues = {};
  for (const [k, v] of Object.entries(input)) {
    const key = k.trim();
    if (!key) continue;
    if (
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean" ||
      v === null
    ) {
      out[key] = v;
      continue;
    }
    if (Array.isArray(v)) {
      out[key] = v
        .filter(
          (item) =>
            typeof item === "string" ||
            typeof item === "number" ||
            typeof item === "boolean",
        )
        .slice(0, 100);
    }
  }
  return out;
}

