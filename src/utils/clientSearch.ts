type SearchUser = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

export type SearchableClient = {
  id_client?: number | null;
  agency_client_id?: number | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  address?: string | null;
  postal_code?: string | null;
  locality?: string | null;
  company_name?: string | null;
  tax_id?: string | null;
  commercial_address?: string | null;
  dni_number?: string | null;
  passport_number?: string | null;
  birth_date?: string | Date | null;
  nationality?: string | null;
  gender?: string | null;
  email?: string | null;
  custom_fields?: unknown;
  user?: SearchUser | null;
};

const NO_MATCH_SCORE = 1_000_000;

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function toDateText(value: unknown): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function flattenUnknown(value: unknown, seen = new WeakSet<object>()): string[] {
  if (value == null) return [];
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenUnknown(item, seen));
  }
  if (typeof value === "object") {
    if (seen.has(value)) return [];
    seen.add(value);
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, nested]) => [key, ...flattenUnknown(nested, seen)],
    );
  }
  return [];
}

function uniqueNonEmpty(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = raw.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function collectSearchValues(client: SearchableClient): string[] {
  const customValues = flattenUnknown(client.custom_fields);
  const userName = `${client.user?.first_name ?? ""} ${client.user?.last_name ?? ""}`.trim();
  return uniqueNonEmpty([
    String(client.id_client ?? ""),
    String(client.agency_client_id ?? ""),
    client.first_name ?? "",
    client.last_name ?? "",
    `${client.first_name ?? ""} ${client.last_name ?? ""}`.trim(),
    `${client.last_name ?? ""} ${client.first_name ?? ""}`.trim(),
    client.phone ?? "",
    client.address ?? "",
    client.postal_code ?? "",
    client.locality ?? "",
    client.company_name ?? "",
    client.tax_id ?? "",
    client.commercial_address ?? "",
    client.dni_number ?? "",
    client.passport_number ?? "",
    client.email ?? "",
    client.nationality ?? "",
    client.gender ?? "",
    toDateText(client.birth_date),
    userName,
    client.user?.email ?? "",
    ...customValues,
  ]);
}

function maxAllowedDistance(token: string): number {
  if (token.length >= 10) return 2;
  if (token.length >= 4) return 1;
  return 0;
}

function levenshteinWithin(a: string, b: string, maxDistance: number): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > maxDistance) return maxDistance + 1;
  if (!m) return n <= maxDistance ? n : maxDistance + 1;
  if (!n) return m <= maxDistance ? m : maxDistance + 1;

  let prev = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    const curr = new Array<number>(n + 1).fill(maxDistance + 1);
    curr[0] = i;
    const from = Math.max(1, i - maxDistance);
    const to = Math.min(n, i + maxDistance);
    let rowMin = curr[0];

    for (let j = from; j <= to; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }

    if (rowMin > maxDistance) return maxDistance + 1;
    prev = curr;
  }

  return prev[n];
}

function scoreTextToken(token: string, candidate: string): number {
  if (!candidate) return NO_MATCH_SCORE;

  if (candidate === token || candidate.startsWith(token)) return 0;
  if (candidate.includes(token)) return 1;

  const maxDistance = maxAllowedDistance(token);
  if (maxDistance <= 0) return NO_MATCH_SCORE;

  const words = candidate.split(/[^a-z0-9]+/).filter(Boolean);
  let best = NO_MATCH_SCORE;

  for (const word of words) {
    if (word === token || word.startsWith(token)) {
      if (best > 1) best = 1;
      continue;
    }
    if (word.includes(token)) {
      if (best > 2) best = 2;
      continue;
    }
    if (Math.abs(word.length - token.length) > maxDistance) continue;

    const distance = levenshteinWithin(token, word, maxDistance);
    if (distance <= maxDistance) {
      const score = 3 + distance;
      if (score < best) best = score;
    }
  }

  if (best < NO_MATCH_SCORE) return best;

  if (Math.abs(candidate.length - token.length) <= maxDistance) {
    const distance = levenshteinWithin(token, candidate, maxDistance);
    if (distance <= maxDistance) return 3 + distance;
  }

  return NO_MATCH_SCORE;
}

function scoreDigitToken(queryDigits: string, candidateDigits: string): number {
  if (!candidateDigits) return NO_MATCH_SCORE;
  if (candidateDigits === queryDigits || candidateDigits.startsWith(queryDigits)) {
    return 0;
  }
  if (candidateDigits.includes(queryDigits)) return 1;

  const maxDistance =
    queryDigits.length >= 10 ? 2 : queryDigits.length >= 6 ? 1 : 0;
  if (maxDistance <= 0) return NO_MATCH_SCORE;
  if (Math.abs(candidateDigits.length - queryDigits.length) > maxDistance) {
    return NO_MATCH_SCORE;
  }

  const distance = levenshteinWithin(queryDigits, candidateDigits, maxDistance);
  if (distance <= maxDistance) return 2 + distance;
  return NO_MATCH_SCORE;
}

export function scoreClientBySimilarity(
  client: SearchableClient,
  query: string,
): number {
  const normalizedQuery = normalizeText(query);
  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const queryDigits = toDigits(query);

  if (!queryTokens.length && !queryDigits) return 0;

  const values = collectSearchValues(client);
  if (!values.length) return NO_MATCH_SCORE;

  const textCandidates = values
    .map((value) => normalizeText(value))
    .filter(Boolean);
  const digitCandidates = values.map((value) => toDigits(value)).filter(Boolean);

  let textScore = NO_MATCH_SCORE;
  if (queryTokens.length) {
    let sum = 0;
    let allTokensMatched = true;
    for (const token of queryTokens) {
      let best = NO_MATCH_SCORE;
      for (const candidate of textCandidates) {
        const score = scoreTextToken(token, candidate);
        if (score < best) best = score;
        if (best === 0) break;
      }
      if (best >= NO_MATCH_SCORE) {
        allTokensMatched = false;
        break;
      }
      sum += best;
    }
    if (allTokensMatched) {
      textScore = sum / queryTokens.length;
    }
  }

  let digitScore = NO_MATCH_SCORE;
  if (queryDigits.length >= 3) {
    for (const candidateDigits of digitCandidates) {
      const score = scoreDigitToken(queryDigits, candidateDigits);
      if (score < digitScore) digitScore = score;
      if (digitScore === 0) break;
    }
  }

  const bestScore = Math.min(textScore, digitScore);
  return Number.isFinite(bestScore) ? bestScore : NO_MATCH_SCORE;
}

export function rankClientsBySimilarity<T extends SearchableClient>(
  list: T[],
  query: string,
): T[] {
  const normalizedQuery = normalizeText(query);
  const queryDigits = toDigits(query);
  if (!normalizedQuery && !queryDigits) return list;

  const ranked = list
    .map((client) => ({
      client,
      score: scoreClientBySimilarity(client, query),
    }))
    .filter((entry) => entry.score < NO_MATCH_SCORE)
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return Number(b.client.id_client ?? 0) - Number(a.client.id_client ?? 0);
    });

  return ranked.map((entry) => entry.client);
}
