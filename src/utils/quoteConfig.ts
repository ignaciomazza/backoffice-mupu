export type QuoteCustomFieldType =
  | "text"
  | "number"
  | "date"
  | "select"
  | "boolean"
  | "textarea";

export type QuoteCustomField = {
  key: string;
  label: string;
  type: QuoteCustomFieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: string[];
};

export const QUOTE_REQUIRED_FIELD_OPTIONS: Array<{ key: string; label: string }> =
  [
    { key: "lead_name", label: "Nombre del potencial cliente" },
    { key: "lead_phone", label: "Teléfono/WhatsApp del potencial cliente" },
    { key: "lead_email", label: "Email del potencial cliente" },
    { key: "details", label: "Detalle viaje" },
    { key: "departure_date", label: "Fecha salida" },
    { key: "return_date", label: "Fecha regreso" },
    { key: "currency", label: "Moneda" },
    { key: "pax_count", label: "Cantidad de pasajeros (count)" },
  ];

export const QUOTE_HIDDEN_FIELD_OPTIONS = QUOTE_REQUIRED_FIELD_OPTIONS;

const KEY_REGEX = /^[a-z0-9_]+$/;
const TYPE_SET = new Set<QuoteCustomFieldType>([
  "text",
  "number",
  "date",
  "select",
  "boolean",
  "textarea",
]);

export function normalizeQuoteRequiredFields(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const allowed = new Set(QUOTE_REQUIRED_FIELD_OPTIONS.map((opt) => opt.key));
  const out = new Set<string>();
  for (const item of input) {
    if (typeof item !== "string") continue;
    const key = item.trim();
    if (!key || !allowed.has(key)) continue;
    out.add(key);
  }
  return Array.from(out);
}

export function normalizeQuoteHiddenFields(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const allowed = new Set(QUOTE_HIDDEN_FIELD_OPTIONS.map((opt) => opt.key));
  const out = new Set<string>();
  for (const item of input) {
    if (typeof item !== "string") continue;
    const key = item.trim();
    if (!key || !allowed.has(key)) continue;
    out.add(key);
  }
  return Array.from(out);
}

export function normalizeQuoteCustomFields(input: unknown): QuoteCustomField[] {
  if (!Array.isArray(input)) return [];
  const out: QuoteCustomField[] = [];
  const seen = new Set<string>();

  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const key = typeof rec.key === "string" ? rec.key.trim() : "";
    const label = typeof rec.label === "string" ? rec.label.trim() : "";
    const typeRaw = typeof rec.type === "string" ? rec.type.trim() : "";
    const type = TYPE_SET.has(typeRaw as QuoteCustomFieldType)
      ? (typeRaw as QuoteCustomFieldType)
      : null;
    if (!key || !KEY_REGEX.test(key) || !label || !type) continue;
    if (seen.has(key)) continue;
    seen.add(key);

    const field: QuoteCustomField = { key, label, type };

    if (typeof rec.required === "boolean") field.required = rec.required;
    if (typeof rec.placeholder === "string" && rec.placeholder.trim()) {
      field.placeholder = rec.placeholder.trim().slice(0, 120);
    }
    if (typeof rec.help === "string" && rec.help.trim()) {
      field.help = rec.help.trim().slice(0, 200);
    }
    if (type === "select" && Array.isArray(rec.options)) {
      const options = rec.options
        .map((opt) => (typeof opt === "string" ? opt.trim() : ""))
        .filter((opt) => opt.length > 0)
        .slice(0, 50);
      if (options.length > 0) field.options = options;
    }

    out.push(field);
  }
  return out;
}
