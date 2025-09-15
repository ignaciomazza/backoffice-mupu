// src/components/template-config/sections/_helpers.ts
export type AnyObj = Record<string, unknown>;

export function isObject(v: unknown): v is AnyObj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function getAt<T>(obj: AnyObj, path: string[], fallback: T): T {
  let cur: unknown = obj;
  for (const k of path) {
    if (!isObject(cur)) return fallback;
    cur = (cur as AnyObj)[k];
  }
  return (cur as T) ?? fallback;
}

export function setAt(obj: AnyObj, path: string[], value: unknown): AnyObj {
  const next: AnyObj = { ...obj };
  let cur: AnyObj = next;
  for (let i = 0; i < path.length - 1; i += 1) {
    const k = path[i];
    const v = cur[k];
    if (!isObject(v)) cur[k] = {};
    cur = cur[k] as AnyObj;
  }
  cur[path[path.length - 1]] = value;
  return next;
}

export function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}

export function normalizeKey(label: string, fallback: string) {
  const s =
    (label || "")
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "") || "";
  return s || fallback;
}

export const input =
  "w-full appearance-none rounded-2xl bg-white/50 border border-slate-900/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white";

export const section =
  "mb-6 rounded-2xl border h-fit border-slate-900/10 bg-white/50 p-4 dark:border-white/10 dark:bg-white/10";

export const badge =
  "rounded-full bg-black/10 px-2 py-0.5 text-[11px] uppercase tracking-wide dark:bg-white/10";
