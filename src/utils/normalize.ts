// utils/normalize.ts
// Normalizaciones y campos derivados para ClientStats (tabla + filtros + stats).
// Sin dependencias externas. Incluye caching LRU para performance.

/* =========================================================
 * Tipos de contexto / config
 * ========================================================= */

export type NormalizeContext = {
  // hoy la única que realmente usamos es callingCodeDefault
  countryDefault?: string; // ej "AR"
  callingCodeDefault?: string; // ej "54"
};

export type NormalizerConfig = {
  // Teléfono
  minPhoneDigits: number; // debajo de esto => vacío
  maxPhoneDigits: number; // por arriba => se descarta como no confiable

  // Ruido / placeholders
  minEntropyBits: number; // entropía Shannon mínima
  maxRepeatRun: number; // repeticiones consecutivas permitidas ("1111111")

  // Cache
  lruSize: number;
};

export const DEFAULT_CONFIG: NormalizerConfig = {
  minPhoneDigits: 6,
  maxPhoneDigits: 17, // ITU E.164 máx 15 (+2 margen)
  minEntropyBits: 1.2,
  maxRepeatRun: 3,
  lruSize: 5000,
};

/* =========================================================
 * Regex precompiladas
 * ========================================================= */
const RE_DASHES = /[‐-‒–—―]/g;
const RE_QUOTES = /[“”«»„]|['´`]/g;
const RE_DIACRITICS = /\p{Diacritic}/gu;
const RE_SPACES = /\s+/g;

const RE_ONLY_SIGNS = /^[\W_]+$/;
const RE_ALL_ZERO = /^0+$/;
const RE_RUN_NUM = /^(\d)\1{3,}$/;
const RE_RUN_ALPHA = /^([a-z])\1{3,}$/i;

const RE_EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;

/* =========================================================
 * Utils base
 * ========================================================= */

// Limpia string: unifica guiones/comillas, quita diacríticos, colapsa espacios.
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

// Entropía de Shannon (bits/caracter). Baja entropía => repetitivo / placeholder.
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

// ¿Valor vacío / ruido obvio?
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

  // runs largos del mismo char
  if (new RegExp(`(.)\\1{${cfg.maxRepeatRun},}`).test(t)) return true;

  // entropía baja => “basura”
  if (shannonEntropy(t) < cfg.minEntropyBits) return true;

  return false;
}

// Capitaliza cada palabra mínimamente
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

/* =========================================================
 * Cache LRU simple
 * ========================================================= */

class LRU<K, V> {
  private max: number;
  private map = new Map<K, V>();
  constructor(max = 1000) {
    this.max = Math.max(1, max);
  }
  get(k: K): V | undefined {
    const v = this.map.get(k);
    if (v !== undefined) {
      // renovar LRU
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

/* =========================================================
 * Caches
 * ========================================================= */

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

const natCache = new LRU<string, { iso2?: string; label: string }>(
  DEFAULT_CONFIG.lruSize,
);

/* =========================================================
 * Email
 * ========================================================= */

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

/* =========================================================
 * Género
 * ========================================================= */

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

/* =========================================================
 * Localidad
 * ========================================================= */

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

/**
 * canonicalizeLocalityForStats()
 *
 * Objetivo:
 * - Agrupar variantes como "San Miguel", "san miguel", "San Miguel Buenos Aires",
 *   "Muñiz San Miguel", "San Miguel Bs As", etc. -> "San Miguel".
 * - Pero NO mezclar "San Miguel de Tucuman" con "San Miguel" (Buenos Aires).
 *
 * Heurística:
 *  1. Detectar explícitamente "san miguel de tucuman" y conservarlo.
 *  2. Sacar sufijos tipo "buenos aires", "bs as", "argentina", etc.
 *  3. Si termina en "san miguel" (o "muniz san miguel", etc.), colapsar a "san miguel".
 *  4. TitleCase final.
 */
export function canonicalizeLocalityForStats(localityNorm: string): string {
  // localityNorm debería venir ya bastante normalizado (titleCase, sin prefijos tipo "Municipio de").
  // Pero igual limpiamos y bajamos a minúsculas para heurística.
  const base = cleanStr(localityNorm).toLowerCase().trim();
  if (!base) return "";

  // Caso especial: San Miguel de Tucuman → mantenemos esa frase completa.
  if (base.includes("san miguel de tucuman")) {
    return "San Miguel de Tucuman";
  }

  // Quitamos sufijos provinciales comunes tipo "buenos aires", "bs as", ", argentina", etc.
  // Ej: "san miguel bs as", "san miguel buenos aires", "san miguel buenos aires argentina"
  let s = base.replace(
    /(,\s*)?(provincia de )?(pcia\.?\s*)?(bs\.?\s*as\.?|bs as|bsas|buenos aires|buenosaires|argentina)\s*$/i,
    "",
  );

  s = s.trim().replace(/\s+/g, " ");

  // Si queda algo que termina en "san miguel" (ej "muniz san miguel"), lo reducimos a "san miguel".
  if (/\bsan miguel$/.test(s)) {
    s = "san miguel";
  }

  return titleCase(s);
}

/* =========================================================
 * Nacionalidad
 * =========================================================
   El form guarda p.ej. "Argentina (AR)".
   Queremos exponerlo como { iso2: "AR", label: "Argentina" }.

   Casos legacy:
   - "argentina"        -> { iso2: undefined, label: "Argentina" }
   - "AR" / "ar"        -> { iso2: "AR", label: "AR" }
*/

export function normalizeNationality(raw?: string | null): {
  iso2?: string;
  label: string;
} {
  const key = (raw || "").trim().toLowerCase();
  const cached = natCache.get(key);
  if (cached) return cached;

  const cleaned = cleanStr(raw);
  if (!cleaned) {
    const r = { iso2: undefined, label: "" };
    natCache.set(key, r);
    return r;
  }

  // Caso principal: "Argentina (AR)"
  const m = cleaned.match(/^(.+?)\s*\(([A-Za-z]{2})\)$/);
  if (m) {
    const countryName = titleCase(m[1]); // "Argentina"
    const iso2 = m[2].toUpperCase(); // "AR"
    const r = { iso2, label: countryName };
    natCache.set(key, r);
    return r;
  }

  // Caso "AR", "ar"
  const compact = cleaned.replace(/\s+/g, "");
  if (/^[A-Za-z]{2}$/.test(compact)) {
    const iso2 = compact.toUpperCase();
    const r = { iso2, label: iso2 };
    natCache.set(key, r);
    return r;
  }

  // Caso legacy "argentina"
  const fallbackLabel = titleCase(cleaned);
  const r = { iso2: undefined, label: fallbackLabel };
  natCache.set(key, r);
  return r;
}

/* =========================================================
 * DNI
 * ========================================================= */

export function normalizeDNI(raw?: string | null): {
  digits: string; // solo dígitos
  formatted: string; // 12.345.678
  empty: boolean;
  validAR: boolean; // heurística: 6-9 dígitos (7-8 típico AR)
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

  const validAR = digits.length >= 6 && digits.length <= 9;
  const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const r = { digits, formatted, empty: false, validAR };
  dniCache.set(key, r);
  return r;
}

/* =========================================================
 * CUIT/CUIL
 * ========================================================= */

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

  let kind: "" | "CUIT" | "CUIL" | "CUIT/CUIL" = "";
  if (/^(20|23|24|27)$/.test(head)) kind = "CUIL";
  else if (/^(30|33|34)$/.test(head)) kind = "CUIT";
  else if (digits.length === 11) kind = "CUIT/CUIL";

  const r = {
    digits,
    formatted,
    empty: false,
    valid,
    type: kind,
  };
  cuitCache.set(key, r);
  return r;
}

/* =========================================================
 * Pasaporte
 * ========================================================= */

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

/* =========================================================
 * Edad
 * ========================================================= */

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

// Buckets de edad para stats
export type AgeBucket = "u18" | "a18_25" | "a26_40" | "a41_60" | "g60";

export function ageBucketFromAge(a: number | null): AgeBucket | null {
  if (a == null || !Number.isFinite(a)) return null;
  if (a <= 17) return "u18";
  if (a <= 25) return "a18_25";
  if (a <= 40) return "a26_40";
  if (a <= 60) return "a41_60";
  return "g60";
}

/* =========================================================
 * Teléfono
 * ========================================================= */

export function normalizePhone(
  raw?: string | null,
  ctx: NormalizeContext = {},
  cfg: NormalizerConfig = DEFAULT_CONFIG,
): {
  e164Like: string; // "+" si venía; si no, cc + nacional o dígitos crudos
  national: string; // dígitos locales (si inferible)
  empty: boolean;
  score: number; // 0..1 (calidad)
  method: string; // "intl" | "intl-likely" | "default-cc" | "raw" | "empty" | "rule"
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

  // quitar extensiones tipo "int.1234"
  s = s.replace(/\b(ext|int|leg)\.?\s*\d+$/i, "");

  // "00" => "+"
  if (s.startsWith("00")) s = "+" + s.slice(2);

  const hasPlus = s.startsWith("+");

  // dejar sólo dígitos (preservando "+")
  s = (hasPlus ? "+" : "") + s.replace(/[^\d]/g, "");

  const digits = s.replace(/\D/g, "");
  const len = digits.length;

  // descartar basura
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

  // Si ya trae +
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

  // Sin + : heurística para CC por defecto
  const cc = cleanStr(ctx.callingCodeDefault);
  const startsWithCC = cc && digits.startsWith(cc);

  // ejemplo AR: "54911..." -> lo tomamos como internacional probable aunque no tenga "+"
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

  // No tiene "+" ni CC explícito -> preprender CC por defecto si tenemos una
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

/* =========================================================
 * Facade principal
 * =========================================================
 * Devuelve campos "_" listos para usar en ClientStats
 * (tabla, filtros, stats, ordenamiento).
 */

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
    registration_date?: string | null;
    user?: { first_name?: string | null; last_name?: string | null } | null;
  },
  ctx: NormalizeContext = {},
  cfg: NormalizerConfig = DEFAULT_CONFIG,
) {
  const owner = normalizeOwner(c.user?.first_name, c.user?.last_name);
  const full = normalizeFullName(c.first_name, c.last_name);

  // Email principal: usamos c.email si es válido; si no, tratamos de extraer de address.
  const emailRaw = normalizeEmail(c.email);
  let emailBest = emailRaw;
  if (emailBest.empty && c.address) {
    const candidate = (c.address || "").trim();
    if (RE_EMAIL.test(candidate)) {
      const det = normalizeEmail(candidate);
      if (!det.empty) {
        emailBest = det;
      }
    }
  }

  const phone = normalizePhone(c.phone, ctx, cfg);

  const age = ageFromISO(c.birth_date);
  const ageBucket = ageBucketFromAge(age);

  const nat = normalizeNationality(c.nationality);
  const natDisplay = nat.label || "";

  const locInfo = normalizeLocality(c.locality);
  const locCanonical = canonicalizeLocalityForStats(locInfo.value);

  const gen = normalizeGender(c.gender);
  const dni = normalizeDNI(c.dni_number);
  const cuit = normalizeCUIT(c.tax_id);
  const pass = normalizePassport(c.passport_number);

  // timestamp numérico de registro, para ordenar y para "últimos 30 días"
  const regMs = (() => {
    if (!c.registration_date) return 0;
    const ts = new Date(c.registration_date).getTime();
    return Number.isFinite(ts) ? ts : 0;
  })();

  return {
    _fullName: full,
    _owner: owner || "",

    // Contacto
    _email: emailBest, // {value, empty,...}
    _phone: phone, // {national, e164Like, empty,...}
    _hasEmail: !emailBest.empty,
    _hasPhone: !phone.empty,

    // Personales
    _age: age,
    _ageBucket: ageBucket, // "u18" | "a18_25" | ...
    _gender: gen.value as "M" | "F" | "X" | "",

    // Ubicación / país
    _nat: nat, // {iso2?, label}
    _natDisplay: natDisplay, // string amigable: "Argentina"
    _locality: locInfo.value, // ej "San Miguel Buenos Aires"
    _localityCanonical: locCanonical, // ej "San Miguel" (para agrupar stats)

    // Docs
    _docDNI: dni, // {digits, formatted, validAR}
    _docCUIT: cuit, // {digits, formatted, valid, type}
    _passport: pass, // {value, plausible}

    // Registro
    _registrationTs: regMs, // ms epoch, 0 si inválido
  };
}
