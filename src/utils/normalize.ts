/* utils/normalize.ts
   Escalable, sin deps externas. Listo para sustituir por libs especializadas (p.ej., libphonenumber-js)
   manteniendo la misma interfaz de salida.
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

/* ---------------------- utilidades base ---------------------- */

// Normaliza texto (quita diacríticos, colapsa espacios, homoglifos comunes)
export function cleanStr(s?: string | null): string {
  if (!s) return "";
  const nf = s
    .replace(/[‐-‒–—―]/g, "-")
    .replace(/[“”«»„]|['´`]/g, '"')
    .replace(/[‐]/g, "-");
  return nf
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
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

  if (/^[\W_]+$/.test(t)) return true; // solo signos
  if (/^0+$/.test(t)) return true; // todos ceros
  if (/^(\d)\1{3,}$/.test(t)) return true; // 1111, 999999…
  if (/^([a-z])\1{3,}$/i.test(t)) return true; // aaaa

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

/* ---------------------- Email ---------------------- */

export function normalizeEmail(email?: string | null): {
  value: string;
  empty: boolean;
  method: string;
  score: number;
} {
  const raw = cleanStr(email).toLowerCase();
  if (!raw) return { value: "", empty: true, method: "empty", score: 0 };
  // RFC 5322 “light”
  const ok = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(
    raw,
  );
  return {
    value: ok ? raw : "",
    empty: !ok,
    method: ok ? "regex" : "invalid",
    score: ok ? 1 : 0,
  };
}

/* ---------------------- Género ---------------------- */
export function normalizeGender(raw?: string | null): {
  value: "M" | "F" | "X" | "";
  method: string;
} {
  const t = cleanStr(raw).toLowerCase();
  if (!t) return { value: "", method: "empty" };
  if (/^(m|masc|male|hombre|varon|m.)$/.test(t))
    return { value: "M", method: "rule" };
  if (/^(f|fem|female|mujer|f.)$/.test(t))
    return { value: "F", method: "rule" };
  return { value: "X", method: "fallback" };
}

/* ---------------------- Localidad ---------------------- */

const LOCALITY_PREFIX =
  /^(ciudad autonoma de|ciudad de|provincia de|mun\.?|municipio de)\b\s+/i;
export function normalizeLocality(raw?: string | null): {
  value: string;
  empty: boolean;
} {
  let t = cleanStr(raw);
  if (!t) return { value: "", empty: true };
  t = t
    .replace(LOCALITY_PREFIX, "")
    .replace(/\s+-\s+.*$/i, "")
    .trim();
  return { value: titleCase(t), empty: t.length === 0 };
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
  // Implementación compacta; valores en [0,1]
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
  // Winkler boost
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
  // añade según tus datos reales
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

/* ---------------------- LRU Cache ---------------------- */

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

  // 2) BK-Tree por Levenshtein
  const levCandidates = bkSearch(t, cfg.countryMaxLev);
  // 3) Re-ordenar por Jaro-Winkler (mejor percepción humana)
  const ranked = levCandidates
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

  // 4) fallback: devolvemos el label limpio
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

/* ---------------------- Teléfono ---------------------- */

export function normalizePhone(
  raw?: string | null,
  ctx: NormalizeContext = {},
  cfg: NormalizerConfig = DEFAULT_CONFIG,
): {
  e164Like: string; // si trae +, lo respetamos; si no, “cc+national” cuando haya hint
  national: string; // dígitos locales (si inferible), si no, dígitos puros
  empty: boolean;
  score: number; // 0..1 (calidad)
  method: string; // "intl", "default-cc", "raw"
} {
  if (isTrivialEmpty(raw, cfg))
    return {
      e164Like: "",
      national: "",
      empty: true,
      score: 0,
      method: "empty",
    };
  let s = (raw || "").trim();

  // quitar extensiones simples
  s = s.replace(/\b(ext|int|leg)\.?\s*\d+$/i, "");

  // 00 => +
  if (s.startsWith("00")) s = "+" + s.slice(2);

  const hasPlus = s.startsWith("+");
  // Normalizamos: solo dígitos (preserva +)
  s = (hasPlus ? "+" : "") + s.replace(/[^\d]/g, "");

  const digits = s.replace(/\D/g, "");
  // descartar secuencias triviales/ruidosas
  if (
    !digits ||
    digits.length < cfg.minPhoneDigits ||
    digits.length > cfg.maxPhoneDigits ||
    /^(\d)\1{3,}$/.test(digits) || // 1111...
    shannonEntropy(digits) < cfg.minEntropyBits
  ) {
    return {
      e164Like: "",
      national: "",
      empty: true,
      score: 0,
      method: "rule",
    };
  }

  // Internacional si tiene +
  if (hasPlus) {
    return {
      e164Like: s,
      national: digits,
      empty: false,
      score: 1,
      method: "intl",
    };
  }

  // Sin + : podemos “sugerir” código por defecto si existe
  const cc = cleanStr(ctx.callingCodeDefault);
  if (cc && /^\d{1,4}$/.test(cc)) {
    return {
      e164Like: cc + digits,
      national: digits,
      empty: false,
      score: 0.8,
      method: "default-cc",
    };
  }

  // Crudo pero limpio
  return {
    e164Like: digits,
    national: digits,
    empty: false,
    score: 0.6,
    method: "raw",
  };
}

/* ---------------------- Facades de alto nivel ---------------------- */

export function normalizeClientRecord(
  c: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
    birth_date?: string | null;
    nationality?: string | null;
    locality?: string | null;
    user?: { first_name?: string | null; last_name?: string | null } | null;
  },
  ctx: NormalizeContext = {},
  cfg: NormalizerConfig = DEFAULT_CONFIG,
) {
  const owner = normalizeOwner(c.user?.first_name, c.user?.last_name);
  const full = normalizeFullName(c.first_name, c.last_name);

  return {
    _fullName: full,
    _owner: owner || "",
    _email: normalizeEmail(c.email),
    _phone: normalizePhone(c.phone, ctx, cfg),
    _age: ageFromISO(c.birth_date),
    _nat: normalizeNationality(c.nationality, cfg),
    _locality: normalizeLocality(c.locality).value,
  };
}
