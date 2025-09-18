/* utils/normalize.ts
   Escalable, sin deps externas. Optimizado con caches LRU y nuevos campos derivados
   para filtros/estadísticas (_gender, _hasPhone/_hasEmail, _ageBucket, _docDNI/_docCUIT/_passport/_postalCode).
*/

export type NormalizeContext = {
  countryDefault?: string; // ISO-3166 alpha-2, ej "AR", "US"
  callingCodeDefault?: string; // ej "54", "1"
};

export type NormalizerConfig = {
  // Teléfono
  minPhoneDigits: number; // debajo de esto => vacío
  maxPhoneDigits: number; // por arriba => probablemente no válido
  // “Vacíos” y ruido
  minEntropyBits: number; // p/descartar cadenas de baja información (repetitivas)
  maxRepeatRun: number; // repeticiones consecutivas permitidas (ej "111111")
  // Fuzzy matching nacionalidad
  countryMaxLev: number; // distancia máx en BK-Tree
  jwMinScore: number; // umbral mínimo Jaro-Winkler
  // Caching
  lruSize: number;
};

export const DEFAULT_CONFIG: NormalizerConfig = {
  minPhoneDigits: 6,
  maxPhoneDigits: 17, // ITU E.164 máx 15 (+2 margen para basura benigna)
  minEntropyBits: 1.2, // ~ruido muy bajo => sospechoso
  maxRepeatRun: 3,
  countryMaxLev: 2,
  jwMinScore: 0.88, // >= 0.88 suele ser “muy similar”
  lruSize: 5000,
};

/* ---------------------- regex precompiladas ---------------------- */
const RE_DASHES = /[‐-‒–—―]/g;
const RE_QUOTES = /[“”«»„]|['´`]/g;
const RE_DIACRITICS = /\p{Diacritic}/gu;
const RE_SPACES = /\s+/g;
const RE_ONLY_SIGNS = /^[\W_]+$/;
const RE_ALL_ZERO = /^0+$/;
const RE_RUN_NUM = /^(\d)\1{3,}$/;
const RE_RUN_ALPHA = /^([a-z])\1{3,}$/i;
const RE_EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;

/* ---------------------- utilidades base ---------------------- */

// Normaliza texto (quita diacríticos, colapsa espacios, homoglifos comunes)
export function cleanStr(s?: string | null): string {
  if (!s) return "";
  const nf = s
    .replace(RE_DASHES, "-")
    .replace(RE_QUOTES, '"')
    .replace(/[‐]/g, "-");
  return nf
    .normalize("NFKD")
    .replace(RE_DIACRITICS, "")
    .replace(RE_SPACES, " ")
    .trim();
}

// Entropía de Shannon (bits/caracter). Baja entropía => string repetitivo (placeholders).
export function shannonEntropy(str: string): number {
  if (!str) return 0;
  const freq = new Map<string, number>();
  for (const ch of str) freq.set(ch, (freq.get(ch) || 0) + 1);
  const n = str.length;
  let H = 0;
  for (const [, c] of freq) {
    const p = c / n;
    H -= p * Math.log2(p);
  }
  return H;
}

// ¿candidato vacío? mezcla reglas + entropía
export function isTrivialEmpty(
  s?: string | null,
  cfg: NormalizerConfig = DEFAULT_CONFIG,
): boolean {
  if (!s) return true;
  const t = cleanStr(s).toLowerCase();

  if (
    t === "" ||
    t === "-" ||
    t === "—" ||
    t === "na" ||
    t === "n/a" ||
    t === "no aplica" ||
    t === "sin dato" ||
    t === "s/n" ||
    t === "null" ||
    t === "none" ||
    t === "0" ||
    t === "xx" ||
    t === "xxx" ||
    t === "sin telefono" ||
    t === "sin telefono fijo" ||
    t === "sin mail" ||
    t === "sin email"
  ) {
    return true;
  }

  if (RE_ONLY_SIGNS.test(t)) return true; // solo signos
  if (RE_ALL_ZERO.test(t)) return true; // todos ceros
  if (RE_RUN_NUM.test(t)) return true; // 1111, 999999…
  if (RE_RUN_ALPHA.test(t)) return true; // aaaa

  // Runs largos del mismo char
  if (new RegExp(`(.)\\1{${cfg.maxRepeatRun},}`).test(t)) return true;

  // Entropía baja => repetitivo/previsible
  if (shannonEntropy(t) < cfg.minEntropyBits) return true;

  return false;
}

export function titleCase(s?: string | null): string {
  const t = cleanStr(s).toLowerCase();
  if (!t) return "";
  return t.replace(
    /\b([a-zñáéíóúü])([a-zñáéíóúü]*)/g,
    (_, a, b) => a.toUpperCase() + b,
  );
}

export function normalizeOwner(
  first?: string | null,
  last?: string | null,
): string {
  const f = titleCase(first);
  const l = titleCase(last);
  return [f, l].filter(Boolean).join(" ").trim();
}
export function normalizeFullName(
  first?: string | null,
  last?: string | null,
): string {
  const f = titleCase(first);
  const l = titleCase(last);
  return [l, f].filter(Boolean).join(" ").trim();
}

/* ---------------------- Caches LRU ---------------------- */
class LRU<K, V> {
  private max: number;
  private map = new Map<K, V>();
  constructor(max = 1000) {
    this.max = Math.max(1, max);
  }
  get(k: K): V | undefined {
    const v = this.map.get(k);
    if (v !== undefined) {
      this.map.delete(k);
      this.map.set(k, v);
    }
    return v;
  }
  set(k: K, v: V) {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, v);
    if (this.map.size > this.max) {
      const first = this.map.keys().next().value as K;
      this.map.delete(first);
    }
  }
}

const emailCache = new LRU<
  string,
  { value: string; empty: boolean; method: string; score: number }
>(DEFAULT_CONFIG.lruSize);
const phoneCache = new LRU<
  string,
  {
    e164Like: string;
    national: string;
    empty: boolean;
    score: number;
    method: string;
    hasPlus: boolean;
    len: number;
    isLikelyIntl: boolean;
  }
>(DEFAULT_CONFIG.lruSize);
const localityCache = new LRU<string, { value: string; empty: boolean }>(
  DEFAULT_CONFIG.lruSize,
);
const genderCache = new LRU<
  string,
  { value: "M" | "F" | "X" | ""; method: string }
>(DEFAULT_CONFIG.lruSize);
const dniCache = new LRU<
  string,
  { digits: string; formatted: string; empty: boolean; validAR: boolean }
>(DEFAULT_CONFIG.lruSize);
const cuitCache = new LRU<
  string,
  {
    digits: string;
    formatted: string;
    empty: boolean;
    valid: boolean;
    type: "CUIT" | "CUIL" | "CUIT/CUIL" | "";
  }
>(DEFAULT_CONFIG.lruSize);
const passportCache = new LRU<
  string,
  { value: string; empty: boolean; plausible: boolean }
>(DEFAULT_CONFIG.lruSize);
const postalCache = new LRU<string, { value: string; empty: boolean }>(
  DEFAULT_CONFIG.lruSize,
);

/* ---------------------- Email ---------------------- */

export function normalizeEmail(email?: string | null): {
  value: string;
  empty: boolean;
  method: string;
  score: number;
} {
  const key = (email || "").toLowerCase().trim();
  const cached = emailCache.get(key);
  if (cached) return cached;

  const raw = cleanStr(email).toLowerCase();
  if (!raw) {
    const r = { value: "", empty: true, method: "empty", score: 0 };
    emailCache.set(key, r);
    return r;
  }
  const ok = RE_EMAIL.test(raw);
  const r = {
    value: ok ? raw : "",
    empty: !ok,
    method: ok ? "regex" : "invalid",
    score: ok ? 1 : 0,
  };
  emailCache.set(key, r);
  return r;
}

/* ---------------------- Género ---------------------- */
const GENDER_MAP: Record<string, "M" | "F" | "X"> = {
  m: "M",
  masc: "M",
  male: "M",
  hombre: "M",
  varon: "M",
  "m.": "M",
  masculino: "M",
  f: "F",
  fem: "F",
  female: "F",
  mujer: "F",
  "f.": "F",
  femenino: "F",
  x: "X",
  other: "X",
  otro: "X",
  "no binario": "X",
  no_binario: "X",
  nd: "X",
  "n/d": "X",
};

export function normalizeGender(raw?: string | null): {
  value: "M" | "F" | "X" | "";
  method: string;
} {
  const key = (raw || "").toLowerCase().trim();
  const cached = genderCache.get(key);
  if (cached) return cached;

  const t = cleanStr(raw).toLowerCase();
  if (!t) {
    const r = { value: "" as const, method: "empty" };
    genderCache.set(key, r);
    return r;
  }
  const v = GENDER_MAP[t];
  const r = v
    ? { value: v, method: "rule" }
    : { value: "X" as const, method: "fallback" };
  genderCache.set(key, r);
  return r;
}

/* ---------------------- Localidad ---------------------- */

const LOCALITY_PREFIX =
  /^(ciudad autonoma de|ciudad de|provincia de|mun\.?|municipio de)\b\s+/i;
export function normalizeLocality(raw?: string | null): {
  value: string;
  empty: boolean;
} {
  const key = (raw || "").toLowerCase().trim();
  const cached = localityCache.get(key);
  if (cached) return cached;

  let t = cleanStr(raw);
  if (!t) {
    const r = { value: "", empty: true };
    localityCache.set(key, r);
    return r;
  }
  t = t
    .replace(LOCALITY_PREFIX, "")
    .replace(/\s+-\s+.*$/i, "")
    .replace(/\s+$/g, "")
    .trim();
  const r = { value: titleCase(t), empty: t.length === 0 };
  localityCache.set(key, r);
  return r;
}

/* ---------------------- Postal code ---------------------- */
export function normalizePostalCode(raw?: string | null): {
  value: string;
  empty: boolean;
} {
  const key = (raw || "").toUpperCase().trim();
  const cached = postalCache.get(key);
  if (cached) return cached;

  let t = cleanStr(raw).toUpperCase();
  if (!t) {
    const r = { value: "", empty: true };
    postalCache.set(key, r);
    return r;
  }
  t = t.replace(/[^A-Z0-9-]/g, "").trim();
  const r = { value: t, empty: t.length === 0 };
  postalCache.set(key, r);
  return r;
}

/* ---------------------- Similaridad de strings ---------------------- */

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array(b.length + 1)
    .fill(0)
    .map((_, i) => i);
  for (let i = 0; i < a.length; i++) {
    let prev = i + 1;
    for (let j = 0; j < b.length; j++) {
      const temp = dp[j + 1];
      dp[j + 1] = Math.min(
        dp[j + 1] + 1,
        prev + 1,
        dp[j] + (a[i] === b[j] ? 0 : 1),
      );
      prev = temp;
    }
    dp[0] = i + 1;
  }
  return dp[b.length];
}

export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  const m = Math.floor(Math.max(a.length, b.length) / 2) - 1;
  const aFlags = Array(a.length).fill(false);
  const bFlags = Array(b.length).fill(false);
  let matches = 0;

  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - m);
    const end = Math.min(i + m + 1, b.length);
    for (let j = start; j < end; j++) {
      if (!bFlags[j] && a[i] === b[j]) {
        aFlags[i] = bFlags[j] = true;
        matches++;
        break;
      }
    }
  }
  if (!matches) return 0;

  let t = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (aFlags[i]) {
      while (!bFlags[k]) k++;
      if (a[i] !== b[k]) t++;
      k++;
    }
  }
  t /= 2;

  const jaro =
    (matches / a.length + matches / b.length + (matches - t) / matches) / 3;
  let l = 0;
  while (l < 4 && a[l] === b[l]) l++;
  return jaro + l * 0.1 * (1 - jaro);
}

/* ---------------------- BK-Tree para países/nacionalidades ---------------------- */

// Pequeño diccionario base (extensible en runtime)
type Iso2 = string;
const COUNTRY_SYNONYMS: Record<Iso2, string[]> = {
  AR: ["argentina", "argentino", "rep argentina", "argentine"],
  UY: ["uruguay", "uruguayo"],
  BR: ["brasil", "brazil", "brasileño", "brasileira"],
  US: [
    "estados unidos",
    "usa",
    "united states",
    "estadounidense",
    "eeuu",
    "ee.uu",
  ],
  ES: ["espana", "españa", "spanish", "espanol", "español"],
  MX: ["mexico", "méxico", "mexicano"],
};

type BKNode = { term: string; iso: Iso2; children: Map<number, BKNode> };
let BK_ROOT: BKNode | null = null;

function bkInsert(root: BKNode, term: string, iso: Iso2) {
  let node = root;
  let dist = levenshtein(term, node.term);
  while (node.children.has(dist)) {
    node = node.children.get(dist)!;
    dist = levenshtein(term, node.term);
  }
  node.children.set(dist, { term, iso, children: new Map() });
}

function buildBKIfNeeded() {
  if (BK_ROOT) return;
  const entries: [string, Iso2][] = [];
  for (const [iso, arr] of Object.entries(COUNTRY_SYNONYMS)) {
    for (const s of arr) entries.push([cleanStr(s).toLowerCase(), iso]);
  }
  if (!entries.length) return;
  const [first, iso] = entries[0];
  BK_ROOT = { term: first, iso, children: new Map() };
  for (let i = 1; i < entries.length; i++)
    bkInsert(BK_ROOT, entries[i][0], entries[i][1]);
}

function bkSearch(
  term: string,
  maxDist: number,
): { iso: Iso2; term: string; dist: number }[] {
  if (!BK_ROOT) return [];
  const out: { iso: Iso2; term: string; dist: number }[] = [];
  const stack: BKNode[] = [BK_ROOT];
  while (stack.length) {
    const node = stack.pop()!;
    const d = levenshtein(term, node.term);
    if (d <= maxDist) out.push({ iso: node.iso, term: node.term, dist: d });
    // explorar anillos [d - maxDist, d + maxDist]
    for (let i = d - maxDist; i <= d + maxDist; i++) {
      const child = node.children.get(i);
      if (child) stack.push(child);
    }
  }
  return out;
}

const natCache = new LRU<
  string,
  { iso2?: Iso2; label: string; score: number; method: string }
>(DEFAULT_CONFIG.lruSize);

/* ---------------------- Nacionalidad ---------------------- */

export function normalizeNationality(
  raw?: string | null,
  cfg: NormalizerConfig = DEFAULT_CONFIG,
): { iso2?: Iso2; label: string; score: number; method: string } {
  const key = (raw || "").toLowerCase();
  const cached = natCache.get(key);
  if (cached) return cached;

  const t = cleanStr(raw).toLowerCase();
  if (!t) {
    const r = { iso2: undefined, label: "", score: 0, method: "empty" };
    natCache.set(key, r);
    return r;
  }

  buildBKIfNeeded();

  // 1) match exacto por sinónimo
  for (const [iso, list] of Object.entries(COUNTRY_SYNONYMS)) {
    if (list.some((x) => cleanStr(x).toLowerCase() === t)) {
      const r = {
        iso2: iso as Iso2,
        label: list[0],
        score: 1,
        method: "exact",
      };
      natCache.set(key, r);
      return r;
    }
  }

  // 2) BK-Tree por Levenshtein + 3) Re-ordenar por Jaro-Winkler
  const ranked = bkSearch(t, cfg.countryMaxLev)
    .map((c) => ({ ...c, jw: jaroWinkler(t, c.term) }))
    .sort((a, b) => b.jw - a.jw);

  if (ranked.length && ranked[0].jw >= cfg.jwMinScore) {
    const top = ranked[0];
    const r = {
      iso2: top.iso,
      label: top.term,
      score: top.jw,
      method: "bk+jw",
    };
    natCache.set(key, r);
    return r;
  }

  // 4) fallback
  const r = { iso2: undefined, label: t, score: 0.5, method: "fallback" };
  natCache.set(key, r);
  return r;
}

// Permite inyectar/entrenar sinónimos en runtime (migraciones o seeds)
export function registerCountrySynonyms(iso2: Iso2, names: string[]) {
  const base = COUNTRY_SYNONYMS[iso2] || [];
  COUNTRY_SYNONYMS[iso2] = Array.from(
    new Set([...base, ...names.map((n) => cleanStr(n).toLowerCase())]),
  );
  BK_ROOT = null; // fuerza rebuild
}

/* ---------------------- DNI ---------------------- */

export function normalizeDNI(raw?: string | null): {
  digits: string; // solo dígitos
  formatted: string; // 12.345.678
  empty: boolean;
  validAR: boolean; // heurístico: 6-9 dígitos (7-8 típico)
} {
  const key = (raw || "").trim();
  const cached = dniCache.get(key);
  if (cached) return cached;

  const digits = (cleanStr(raw).match(/\d+/g) || []).join("");
  if (!digits) {
    const r = { digits: "", formatted: "", empty: true, validAR: false };
    dniCache.set(key, r);
    return r;
  }
  const validAR = digits.length >= 6 && digits.length <= 9; // la mayoría 7-8
  const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const r = { digits, formatted, empty: false, validAR };
  dniCache.set(key, r);
  return r;
}

/* ---------------------- CUIT/CUIL ---------------------- */

// Algoritmo verificador CUIT/CUIL
function cuitCheck(digits: string): boolean {
  if (!/^\d{11}$/.test(digits)) return false;
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const d = digits.split("").map((x) => +x);
  const s = w.reduce((acc, wi, i) => acc + wi * d[i], 0);
  let v = 11 - (s % 11);
  if (v === 11) v = 0;
  if (v === 10) v = 9;
  return v === d[10];
}

export function normalizeCUIT(raw?: string | null): {
  digits: string; // 11 dígitos si plausible
  formatted: string; // 20-12345678-3
  empty: boolean;
  valid: boolean;
  type: "" | "CUIT" | "CUIL" | "CUIT/CUIL";
} {
  const key = (raw || "").trim();
  const cached = cuitCache.get(key);
  if (cached) return cached;

  const digits = (cleanStr(raw).match(/\d+/g) || []).join("");
  if (!digits) {
    const r = {
      digits: "",
      formatted: "",
      empty: true,
      valid: false,
      type: "" as const,
    };
    cuitCache.set(key, r);
    return r;
  }

  const valid = cuitCheck(digits);
  const head = digits.slice(0, 2);
  const body = digits.slice(2, 10);
  const dv = digits.slice(10);
  const formatted = digits.length === 11 ? `${head}-${body}-${dv}` : digits;

  // 👇 usar un nombre distinto de "type" y tiparlo al union
  let kind: "" | "CUIT" | "CUIL" | "CUIT/CUIL" = "";
  if (/^(20|23|24|27)$/.test(head)) kind = "CUIL";
  else if (/^(30|33|34)$/.test(head)) kind = "CUIT";
  else if (digits.length === 11) kind = "CUIT/CUIL";

  const r = {
    digits,
    formatted,
    empty: false,
    valid,
    type: kind, // ✅ ahora coincide con el union
  };
  cuitCache.set(key, r);
  return r;
}

/* ---------------------- Pasaporte (simple) ---------------------- */
export function normalizePassport(raw?: string | null): {
  value: string; // alfanumérico limpio
  empty: boolean;
  plausible: boolean; // 5..10 chars alfanum.
} {
  const key = (raw || "").trim();
  const cached = passportCache.get(key);
  if (cached) return cached;

  const t = cleanStr(raw)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!t) {
    const r = { value: "", empty: true, plausible: false };
    passportCache.set(key, r);
    return r;
  }
  const plausible = t.length >= 5 && t.length <= 10;
  const r = { value: t, empty: false, plausible };
  passportCache.set(key, r);
  return r;
}

/* ---------------------- Edad ---------------------- */

export function ageFromISO(iso?: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}

export type AgeBucket = "u18" | "a18_25" | "a26_40" | "a41_60" | "g60";
export function ageBucketFromAge(a?: number | null): AgeBucket | null {
  if (typeof a !== "number" || !isFinite(a)) return null;
  if (a <= 17) return "u18";
  if (a <= 25) return "a18_25";
  if (a <= 40) return "a26_40";
  if (a <= 60) return "a41_60";
  return "g60";
}

/* ---------------------- Teléfono ---------------------- */

export function normalizePhone(
  raw?: string | null,
  ctx: NormalizeContext = {},
  cfg: NormalizerConfig = DEFAULT_CONFIG,
): {
  e164Like: string; // "+" si venía; si no, cc + nacional o dígitos crudos
  national: string; // dígitos locales (si inferible), si no, dígitos puros
  empty: boolean;
  score: number; // 0..1 (calidad)
  method: string; // "intl", "intl-likely", "default-cc", "raw", "empty", "rule"
  hasPlus: boolean;
  len: number;
  isLikelyIntl: boolean;
} {
  const key = JSON.stringify([raw || "", ctx.callingCodeDefault || ""]);
  const cached = phoneCache.get(key);
  if (cached) return cached;

  if (isTrivialEmpty(raw, cfg)) {
    const r = {
      e164Like: "",
      national: "",
      empty: true,
      score: 0,
      method: "empty",
      hasPlus: false,
      len: 0,
      isLikelyIntl: false,
    };
    phoneCache.set(key, r);
    return r;
  }
  let s = (raw || "").trim();

  // quitar extensiones simples
  s = s.replace(/\b(ext|int|leg)\.?\s*\d+$/i, "");

  // 00 => +
  if (s.startsWith("00")) s = "+" + s.slice(2);

  const hasPlus = s.startsWith("+");
  // Normalizamos: solo dígitos (preserva +)
  s = (hasPlus ? "+" : "") + s.replace(/[^\d]/g, "");

  const digits = s.replace(/\D/g, "");
  const len = digits.length;

  // descartar secuencias triviales/ruidosas
  if (
    !digits ||
    len < cfg.minPhoneDigits ||
    len > cfg.maxPhoneDigits ||
    RE_RUN_NUM.test(digits) ||
    shannonEntropy(digits) < cfg.minEntropyBits
  ) {
    const r = {
      e164Like: "",
      national: "",
      empty: true,
      score: 0,
      method: "rule",
      hasPlus: false,
      len,
      isLikelyIntl: false,
    };
    phoneCache.set(key, r);
    return r;
  }

  // Si ya vino con +, tomamos como internacional
  if (hasPlus) {
    const r = {
      e164Like: s,
      national: digits,
      empty: false,
      score: 1,
      method: "intl",
      hasPlus: true,
      len,
      isLikelyIntl: true,
    };
    phoneCache.set(key, r);
    return r;
  }

  // Sin + : evitar prefijar cc si ya viene con cc (ej: "54 9 ...")
  const cc = cleanStr(ctx.callingCodeDefault);
  const startsWithCC = cc && digits.startsWith(cc);

  // Heurística AR: si empieza con "54" sin "+", lo tratamos como internacional probable
  if (!hasPlus && startsWithCC) {
    const r = {
      e164Like: digits, // sin "+"
      national: digits,
      empty: false,
      score: 0.9,
      method: "intl-likely",
      hasPlus: false,
      len,
      isLikelyIntl: true,
    };
    phoneCache.set(key, r);
    return r;
  }

  // Sin + y sin cc explícito → podemos “sugerir” código por defecto si existe
  if (cc && /^\d{1,4}$/.test(cc)) {
    const r = {
      e164Like: startsWithCC ? digits : cc + digits,
      national: digits,
      empty: false,
      score: 0.8,
      method: "default-cc",
      hasPlus: false,
      len,
      isLikelyIntl: false,
    };
    phoneCache.set(key, r);
    return r;
  }

  // Crudo pero limpio
  const r = {
    e164Like: digits,
    national: digits,
    empty: false,
    score: 0.6,
    method: "raw",
    hasPlus: false,
    len,
    isLikelyIntl: false,
  };
  phoneCache.set(key, r);
  return r;
}

/* ---------------------- Facades de alto nivel ---------------------- */

export function normalizeClientRecord(
  c: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    address?: string | null;
    phone?: string | null;
    birth_date?: string | null;
    nationality?: string | null;
    locality?: string | null;
    postal_code?: string | null;
    gender?: string | null;
    dni_number?: string | null;
    passport_number?: string | null;
    tax_id?: string | null;
    user?: { first_name?: string | null; last_name?: string | null } | null;
  },
  ctx: NormalizeContext = {},
  cfg: NormalizerConfig = DEFAULT_CONFIG,
) {
  const owner = normalizeOwner(c.user?.first_name, c.user?.last_name);
  const full = normalizeFullName(c.first_name, c.last_name);

  // Email principal: usa email válido; si no hay, detecta en address
  const emailRaw = normalizeEmail(c.email);
  let emailBest = emailRaw;
  let emailFromAddress: string | null = null;
  if (emailBest.empty && c.address) {
    const candidate = (c.address || "").trim();
    if (RE_EMAIL.test(candidate)) {
      const det = normalizeEmail(candidate);
      if (!det.empty) {
        emailBest = det;
        emailFromAddress = det.value;
      }
    }
  }

  const phone = normalizePhone(c.phone, ctx, cfg);
  const age = ageFromISO(c.birth_date);
  const nat = normalizeNationality(c.nationality, cfg);
  const loc = normalizeLocality(c.locality);
  const gen = normalizeGender(c.gender);
  const dni = normalizeDNI(c.dni_number);
  const cuit = normalizeCUIT(c.tax_id);
  const pass = normalizePassport(c.passport_number);
  const postal = normalizePostalCode(c.postal_code);

  return {
    _fullName: full,
    _owner: owner || "",

    // Contacto
    _email: emailBest, // <- “mejor” email disponible
    _email_raw: emailRaw,
    _email_from_address: emailFromAddress,
    _phone: phone,
    _hasEmail: !emailBest.empty,
    _hasPhone: !phone.empty,

    // Personales
    _age: age,
    _ageBucket: ageBucketFromAge(age),
    _gender: gen.value as "M" | "F" | "X" | "",

    // Ubicación / país
    _nat: nat,
    _locality: loc.value,
    _postalCode: postal.value,

    // Docs
    _docDNI: dni, // {digits, formatted, validAR}
    _docCUIT: cuit, // {digits, formatted, valid, type}
    _passport: pass, // {value, plausible}
  };
}
