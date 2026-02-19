import { toDateKeyInBuenosAires } from "@/lib/buenosAiresDate";

type DuplicateField = "dni_number" | "passport_number" | "tax_id" | "name_birth";

export type ClientDuplicateCandidate = {
  id_client: number;
  agency_client_id?: number | null;
  first_name?: string | null;
  last_name?: string | null;
  birth_date?: Date | string | null;
  dni_number?: string | null;
  passport_number?: string | null;
  tax_id?: string | null;
};

export type ClientDuplicateInput = {
  first_name?: string | null;
  last_name?: string | null;
  birth_date?: Date | string | null;
  dni_number?: string | null;
  passport_number?: string | null;
  tax_id?: string | null;
};

export type ClientDuplicateMatch = {
  client: ClientDuplicateCandidate;
  field: DuplicateField;
  label: string;
  value: string | null;
};

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function onlyDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function sameLooseValue(input: unknown, existing: unknown): boolean {
  const a = String(input ?? "").trim();
  const b = String(existing ?? "").trim();
  if (!a || !b) return false;

  const textA = normalizeText(a);
  const textB = normalizeText(b);
  if (textA && textB && textA === textB) return true;

  const digitsA = onlyDigits(a);
  const digitsB = onlyDigits(b);
  return Boolean(digitsA && digitsB && digitsA === digitsB);
}

function dateKey(value: Date | string | null | undefined): string {
  if (!value) return "";
  return toDateKeyInBuenosAires(value) ?? "";
}

function sameBirthDate(
  a: Date | string | null | undefined,
  b: Date | string | null | undefined,
): boolean {
  const keyA = dateKey(a);
  const keyB = dateKey(b);
  return Boolean(keyA && keyB && keyA === keyB);
}

function normalizeName(value: unknown): string {
  return normalizeText(value);
}

function formatDateAR(value: Date | string | null | undefined): string {
  const key = dateKey(value);
  if (!key) return "";
  const [y, m, d] = key.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

function paxNumber(client: ClientDuplicateCandidate): number {
  return client.agency_client_id ?? client.id_client;
}

function paxName(client: ClientDuplicateCandidate): string {
  const name = `${client.first_name ?? ""} ${client.last_name ?? ""}`.trim();
  return name || "Sin nombre";
}

function matchByField(
  candidates: ClientDuplicateCandidate[],
  inputValue: string | null | undefined,
  field: "dni_number" | "passport_number" | "tax_id",
  label: string,
): ClientDuplicateMatch | null {
  const value = String(inputValue ?? "").trim();
  if (!value) return null;
  for (const candidate of candidates) {
    const candidateValue = candidate[field];
    if (!sameLooseValue(value, candidateValue)) continue;
    return {
      client: candidate,
      field,
      label,
      value: String(candidateValue ?? value).trim() || null,
    };
  }
  return null;
}

function matchByNameBirth(
  candidates: ClientDuplicateCandidate[],
  input: ClientDuplicateInput,
): ClientDuplicateMatch | null {
  const first = normalizeName(input.first_name);
  const last = normalizeName(input.last_name);
  const birth = input.birth_date;
  if (!first || !last || !birth) return null;

  for (const candidate of candidates) {
    if (normalizeName(candidate.first_name) !== first) continue;
    if (normalizeName(candidate.last_name) !== last) continue;
    if (!sameBirthDate(candidate.birth_date, birth)) continue;
    return {
      client: candidate,
      field: "name_birth",
      label: "Nombre y fecha de nacimiento",
      value: formatDateAR(candidate.birth_date) || formatDateAR(birth) || null,
    };
  }
  return null;
}

export function findClientDuplicate(
  candidates: ClientDuplicateCandidate[],
  input: ClientDuplicateInput,
): ClientDuplicateMatch | null {
  const byDni = matchByField(candidates, input.dni_number, "dni_number", "DNI");
  if (byDni) return byDni;

  const byPassport = matchByField(
    candidates,
    input.passport_number,
    "passport_number",
    "Pasaporte",
  );
  if (byPassport) return byPassport;

  const byTax = matchByField(candidates, input.tax_id, "tax_id", "CUIT / RUT");
  if (byTax) return byTax;

  const byNameBirth = matchByNameBirth(candidates, input);
  if (byNameBirth) return byNameBirth;

  return null;
}

export function buildClientDuplicateMessage(match: ClientDuplicateMatch): string {
  const number = paxNumber(match.client);
  const name = paxName(match.client);
  if (match.field === "name_birth") {
    const datePart = match.value ? ` (${match.value})` : "";
    return `Datos duplicados: nombre y fecha de nacimiento${datePart} ya cargados en el pax N° ${number} - ${name}.`;
  }
  const valuePart = match.value ? ` ${match.value}` : "";
  return `Datos duplicados: ${match.label}${valuePart} ya cargado en el pax N° ${number} - ${name}.`;
}

export function buildClientDuplicateResponse(match: ClientDuplicateMatch) {
  const number = paxNumber(match.client);
  const name = paxName(match.client);
  return {
    error: buildClientDuplicateMessage(match),
    code: "CLIENT_DUPLICATE",
    duplicate: {
      id_client: match.client.id_client,
      agency_client_id: match.client.agency_client_id ?? null,
      pax_number: number,
      pax_name: name,
      matched_field: match.field,
      matched_label: match.label,
      matched_value: match.value,
    },
  };
}
