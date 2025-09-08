"use client";

import React, { useMemo } from "react";

// Config genérica
export type Config = Record<string, unknown>;

// Helpers
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function getAt<T>(
  obj: Record<string, unknown>,
  path: string[],
  fallback: T,
): T {
  let cur: unknown = obj;
  for (const k of path) {
    if (!isObject(cur)) return fallback;
    cur = (cur as Record<string, unknown>)[k];
  }
  return (cur as T) ?? fallback;
}
function setAt(
  obj: Record<string, unknown>,
  path: string[],
  value: unknown,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...obj };
  let cur: Record<string, unknown> = next;
  for (let i = 0; i < path.length - 1; i += 1) {
    const k = path[i];
    const v = cur[k];
    if (!isObject(v)) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[path[path.length - 1]] = value;
  return next;
}
function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}

// Escala de grises
const GRAYS = [
  "#000000",
  "#111111",
  "#1F2937", // gray-800
  "#374151", // gray-700
  "#6B7280", // gray-500
  "#9CA3AF", // gray-400
  "#D1D5DB", // gray-300
  "#F3F4F6",
  "#FFFFFF",
] as const;

// Tipografías disponibles (por ahora solo Poppins)
const FONTS = ["Poppins"] as const;

const CONTACT_OPTIONS = [
  "phones",
  "email",
  "website",
  "address",
  "instagram",
  "facebook",
  "twitter",
  "tiktok",
] as const;

// ====== Content Builder ======
type BlockType = "heading" | "paragraph" | "list" | "keyValue" | "twoColumns";
type BlockMode = "fixed" | "form";

type BaseBlock = {
  id: string;
  type: BlockType;
  mode: BlockMode; // fixed: queda en config; form: se completa en el formulario
  label?: string;
  fieldKey?: string;
};

type HeadingBlock = BaseBlock & {
  type: "heading";
  text?: string;
  level?: 1 | 2 | 3;
};
type ParagraphBlock = BaseBlock & { type: "paragraph"; text?: string };
type ListBlock = BaseBlock & { type: "list"; items?: string[] };
type KeyValueBlock = BaseBlock & {
  type: "keyValue";
  pairs?: { key: string; value: string }[];
};
type TwoColumnsBlock = BaseBlock & {
  type: "twoColumns";
  left?: string;
  right?: string;
};

type ContentBlock =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | KeyValueBlock
  | TwoColumnsBlock;

function isBlock(v: unknown): v is ContentBlock {
  if (!isObject(v)) return false;
  const t = v["type"];
  return (
    t === "heading" ||
    t === "paragraph" ||
    t === "list" ||
    t === "keyValue" ||
    t === "twoColumns"
  );
}
function normalizeBlocks(v: unknown): ContentBlock[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isBlock) as ContentBlock[];
}

// UI bits
const input =
  "w-full appearance-none rounded-2xl bg-white/50 border border-slate-900/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white";
const section =
  "mb-6 rounded-2xl border h-fit border-slate-900/10 bg-white/50 p-4 dark:border-white/10 dark:bg-white/10";

type Props = {
  cfg: Config;
  disabled: boolean;
  onChange: (next: Config) => void;
};

const TemplateConfigForm: React.FC<Props> = ({ cfg, disabled, onChange }) => {
  // ============ STYLES ============
  const bg = getAt<string>(cfg, ["styles", "colors", "background"], "#FFFFFF");
  const text = getAt<string>(cfg, ["styles", "colors", "text"], "#111111");
  const accent = getAt<string>(cfg, ["styles", "colors", "accent"], "#6B7280");
  const headingFont = getAt<string>(
    cfg,
    ["styles", "fonts", "heading"],
    "Poppins",
  );
  const bodyFont = getAt<string>(cfg, ["styles", "fonts", "body"], "Poppins");

  const setColor = (key: "background" | "text" | "accent", value: string) =>
    onChange(setAt(cfg, ["styles", "colors", key], value));
  const setFont = (key: "heading" | "body", value: string) =>
    onChange(setAt(cfg, ["styles", "fonts", key], value));

  // ============ COVER ============
  // Nuevos modos: "logo" (usa logo agencia) | "url"
  const coverMode = getAt<string>(cfg, ["coverImage", "mode"], "logo");
  const coverUrl = getAt<string>(cfg, ["coverImage", "url"], "");

  // biblioteca (portadas guardadas)
  const saved = asStringArray(getAt(cfg, ["coverImage", "saved"], []));
  const setCoverMode = (m: "logo" | "url") =>
    onChange(setAt(cfg, ["coverImage", "mode"], m));
  const setCoverUrl = (u: string) =>
    onChange(setAt(cfg, ["coverImage", "url"], u));
  const addToLibrary = (url: string) => {
    if (!url) return;
    const next = Array.from(new Set([...saved, url]));
    onChange(setAt(cfg, ["coverImage", "saved"], next));
  };
  const removeFromLibrary = (url: string) => {
    const next = saved.filter((s) => s !== url);
    onChange(setAt(cfg, ["coverImage", "saved"], next));
  };

  // ============ CONTACT ============
  const contactItems = asStringArray(cfg["contactItems"]);
  const toggleContact = (key: (typeof CONTACT_OPTIONS)[number]) => {
    const set = new Set(contactItems);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    onChange(setAt(cfg, ["contactItems"], Array.from(set)));
  };

  // ============ CONTENT BUILDER ============
  const blocks = useMemo(
    () => normalizeBlocks(getAt(cfg, ["content", "blocks"], [])),
    [cfg],
  );

  const setBlocks = (next: ContentBlock[]) => {
    onChange(setAt(cfg, ["content", "blocks"], next));
  };

  const addBlock = (type: BlockType) => {
    const id = `b_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const base: BaseBlock = { id, type, mode: "fixed", label: "" };
    const byType: ContentBlock =
      type === "heading"
        ? { ...base, type, text: "Título", level: 1 }
        : type === "paragraph"
          ? { ...base, type, text: "Texto del párrafo" }
          : type === "list"
            ? { ...base, type, items: ["Item 1", "Item 2"] }
            : type === "keyValue"
              ? { ...base, type, pairs: [{ key: "Clave", value: "Valor" }] }
              : { ...base, type, left: "Izquierda", right: "Derecha" }; // twoColumns

    setBlocks([...blocks, byType]);
  };

  const updateBlock = (id: string, patch: Partial<ContentBlock>) => {
    const next = blocks.map((b) => (b.id === id ? { ...b, ...patch } : b));
    setBlocks(next);
  };

  const removeBlock = (id: string) => {
    setBlocks(blocks.filter((b) => b.id !== id));
  };

  // ============ PAYMENT OPTIONS ============
  const paymentOptions = asStringArray(getAt(cfg, ["paymentOptions"], []));
  const addPayment = () => {
    const next = [...paymentOptions, "Instrucciones de pago"];
    onChange(setAt(cfg, ["paymentOptions"], next));
  };
  const updatePayment = (idx: number, value: string) => {
    const next = paymentOptions.map((v, i) => (i === idx ? value : v));
    onChange(setAt(cfg, ["paymentOptions"], next));
  };
  const removePayment = (idx: number) => {
    const next = paymentOptions.filter((_, i) => i !== idx);
    onChange(setAt(cfg, ["paymentOptions"], next));
  };

  return (
    <>
      {/* STYLES */}
      <section className={section}>
        <h2 className="mb-3 text-lg font-semibold">Estilos</h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {(["background", "text", "accent"] as const).map((k) => {
            const title =
              k === "background" ? "Fondo" : k === "text" ? "Texto" : "Acento";
            const current =
              k === "background" ? bg : k === "text" ? text : accent;

            return (
              <div key={k}>
                <p className="mb-1 text-sm">{title}</p>
                <div className="flex flex-wrap gap-2">
                  {GRAYS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(k, c)}
                      disabled={disabled}
                      style={{ backgroundColor: c }}
                      className={`size-8 rounded-full border ${
                        current === c
                          ? "ring-2 ring-slate-500 ring-offset-2"
                          : "border-black/20"
                      }`}
                      aria-label={`${k} ${c}`}
                      title={c}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block text-sm">
            Tipografía títulos
            <select
              className={`${input} mt-1`}
              value={headingFont}
              onChange={(e) => setFont("heading", e.target.value)}
              disabled={disabled}
            >
              {FONTS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Tipografía cuerpo
            <select
              className={`${input} mt-1`}
              value={bodyFont}
              onChange={(e) => setFont("body", e.target.value)}
              disabled={disabled}
            >
              {FONTS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* COVER */}
      <section className={section}>
        <h2 className="mb-3 text-lg font-semibold">Portada</h2>

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={coverMode === "logo"}
              onChange={() => setCoverMode("logo")}
              disabled={disabled}
            />
            Logo de la agencia
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={coverMode === "url"}
              onChange={() => setCoverMode("url")}
              disabled={disabled}
            />
            Usar URL
          </label>
        </div>

        {coverMode === "url" && (
          <div className="mt-3">
            <div className="flex gap-2">
              <input
                className={input}
                placeholder="https://…/portada.jpg"
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                disabled={disabled}
              />
              <button
                type="button"
                onClick={() => addToLibrary(coverUrl)}
                disabled={disabled || !coverUrl}
                className="rounded-xl bg-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm dark:bg-white/10 dark:text-white"
                title="Guardar en biblioteca"
              >
                Guardar
              </button>
            </div>

            {coverUrl ? (
              <div className="mt-3 overflow-hidden rounded-xl border border-slate-900/10 dark:border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={coverUrl}
                  alt="Vista previa portada"
                  className="max-h-48 w-full object-cover"
                />
              </div>
            ) : null}
          </div>
        )}

        {/* Biblioteca de portadas guardadas */}
        {saved.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-sm opacity-80">Biblioteca</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {saved.map((url) => (
                <div
                  key={url}
                  className="overflow-hidden rounded-xl border border-slate-900/10 p-2 dark:border-white/10"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt="cover guardada"
                    className="h-24 w-full rounded-lg object-cover"
                    onClick={() => {
                      setCoverMode("url");
                      setCoverUrl(url);
                    }}
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setCoverMode("url");
                        setCoverUrl(url);
                      }}
                      className="rounded-lg bg-slate-200 px-2 py-1 text-xs text-slate-900 dark:bg-white/10 dark:text-white"
                    >
                      Usar
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFromLibrary(url)}
                      className="rounded-lg bg-red-600 px-2 py-1 text-xs text-red-100 dark:bg-red-800"
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* CONTACT */}
      <section className={section}>
        <h2 className="mb-3 text-lg font-semibold">Contacto a mostrar</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {CONTACT_OPTIONS.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={contactItems.includes(opt)}
                onChange={() => toggleContact(opt)}
                disabled={disabled}
              />
              {opt}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs opacity-70">
          * Si marcás <b>phones</b>, el usuario podrá elegir cuál teléfono en el
          formulario.
        </p>
      </section>

      {/* PAYMENT OPTIONS - UX mejorada */}
      <section className={section}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Opciones de pago</h2>
          <button
            onClick={addPayment}
            disabled={disabled}
            className="rounded-full bg-slate-200 px-4 py-1 text-sm text-slate-900 shadow-sm dark:bg-white/10 dark:text-white"
          >
            + Agregar opción
          </button>
        </div>

        {paymentOptions.length === 0 ? (
          <p className="text-sm opacity-70">Sin opciones de pago.</p>
        ) : (
          <div className="space-y-2">
            {paymentOptions.map((p, idx) => (
              <div
                key={idx}
                className="items-center rounded-xl border border-slate-900/10 bg-white/40 p-3 dark:border-white/10 dark:bg-white/5"
              >
                <label className="block text-sm">
                  Descripción
                  <input
                    className={`${input} mt-1`}
                    value={p}
                    onChange={(e) => updatePayment(idx, e.target.value)}
                    disabled={disabled}
                    placeholder="Ej.: Transferencia ARS — alias: …"
                  />
                </label>
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={() => removePayment(idx)}
                    disabled={disabled}
                    className="rounded-full bg-red-600 px-3 py-1 text-sm text-red-100 shadow-sm dark:bg-red-800"
                  >
                    Quitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* CONTENT BUILDER - UX mejorada */}
      <section className={`${section} col-span-2`}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Contenido del documento</h2>
          <div className="flex flex-wrap gap-2">
            <AddBlockButton onAdd={() => addBlock("heading")}>
              Título
            </AddBlockButton>
            <AddBlockButton onAdd={() => addBlock("paragraph")}>
              Párrafo
            </AddBlockButton>
            <AddBlockButton onAdd={() => addBlock("list")}>
              Lista
            </AddBlockButton>
            <AddBlockButton onAdd={() => addBlock("keyValue")}>
              Clave/Valor
            </AddBlockButton>
            <AddBlockButton onAdd={() => addBlock("twoColumns")}>
              Dos columnas
            </AddBlockButton>
          </div>
        </div>

        {blocks.length === 0 ? (
          <p className="text-sm opacity-70">
            No hay secciones aún. Agregá un bloque para empezar.
          </p>
        ) : (
          <div className="space-y-2">
            {blocks.map((b) => (
              <details
                key={b.id}
                open
                className="group rounded-xl border border-slate-900/10 bg-white/40 p-2 dark:border-white/10 dark:bg-white/5"
              >
                <summary className="flex cursor-pointer select-none items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-black/10 px-2 py-0.5 text-[11px] uppercase tracking-wide dark:bg-white/10">
                      {b.type}
                    </span>
                    <span className="opacity-70">
                      {b.label || "Sin etiqueta"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      className="rounded-lg border border-slate-900/10 bg-white/70 px-2 py-1 text-xs dark:border-white/10 dark:bg-white/10"
                      value={b.mode}
                      onChange={(e) =>
                        updateBlock(b.id, { mode: e.target.value as BlockMode })
                      }
                      disabled={disabled}
                    >
                      <option value="fixed">Fijo</option>
                      <option value="form">Se completa en el formulario</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => removeBlock(b.id)}
                      disabled={disabled}
                      className="rounded-full bg-red-600 px-3 py-1 text-xs text-red-100 shadow-sm dark:bg-red-800"
                    >
                      Quitar
                    </button>
                  </div>
                </summary>

                <div className="mt-2 space-y-2 px-2 pb-2">
                  {/* label / fieldKey */}
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="text-sm">
                      Etiqueta (UI)
                      <input
                        className={`${input} mt-1`}
                        value={b.label ?? ""}
                        onChange={(e) =>
                          updateBlock(b.id, { label: e.target.value })
                        }
                        disabled={disabled}
                        placeholder="Ej.: Datos del viaje"
                      />
                    </label>
                    <label className="text-sm">
                      Clave de formulario (si modo = form)
                      <input
                        className={`${input} mt-1`}
                        value={b.fieldKey ?? ""}
                        onChange={(e) =>
                          updateBlock(b.id, { fieldKey: e.target.value })
                        }
                        disabled={disabled}
                        placeholder="Ej.: trip_data"
                      />
                    </label>
                  </div>

                  {/* Campos por tipo */}
                  {b.type === "heading" && (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
                      <label className="text-sm">
                        Texto
                        <input
                          className={`${input} mt-1`}
                          value={(b as HeadingBlock).text ?? ""}
                          onChange={(e) =>
                            updateBlock(b.id, {
                              text: e.target.value,
                            } as Partial<HeadingBlock>)
                          }
                          disabled={disabled || b.mode === "form"}
                          placeholder="Título"
                        />
                      </label>
                      <label className="text-sm">
                        Nivel
                        <select
                          className={`${input} mt-1 !w-auto`}
                          value={(b as HeadingBlock).level ?? 1}
                          onChange={(e) =>
                            updateBlock(b.id, {
                              level: Number(e.target.value) as 1 | 2 | 3,
                            } as Partial<HeadingBlock>)
                          }
                          disabled={disabled}
                        >
                          <option value={1}>H1</option>
                          <option value={2}>H2</option>
                          <option value={3}>H3</option>
                        </select>
                      </label>
                    </div>
                  )}

                  {b.type === "paragraph" && (
                    <label className="text-sm">
                      Texto
                      <textarea
                        className={`${input} mt-1 h-28 font-sans`}
                        value={(b as ParagraphBlock).text ?? ""}
                        onChange={(e) =>
                          updateBlock(b.id, {
                            text: e.target.value,
                          } as Partial<ParagraphBlock>)
                        }
                        disabled={disabled || b.mode === "form"}
                        placeholder="Escribí el texto…"
                      />
                    </label>
                  )}

                  {b.type === "list" && (
                    <label className="text-sm">
                      Ítems (uno por línea)
                      <textarea
                        className={`${input} mt-1 h-28 font-mono`}
                        value={((b as ListBlock).items ?? []).join("\n")}
                        onChange={(e) =>
                          updateBlock(b.id, {
                            items: e.target.value
                              .split("\n")
                              .map((s) => s.trim())
                              .filter((s) => s.length > 0),
                          } as Partial<ListBlock>)
                        }
                        disabled={disabled || b.mode === "form"}
                        placeholder={"Item 1\nItem 2\nItem 3"}
                      />
                    </label>
                  )}

                  {b.type === "keyValue" && (
                    <div className="space-y-2">
                      {((b as KeyValueBlock).pairs ?? []).map((p, idx) => (
                        <div
                          key={idx}
                          className="grid grid-cols-[1fr_1fr_auto] items-center gap-2"
                        >
                          <input
                            className={input}
                            value={p.key}
                            onChange={(e) => {
                              const current = (b as KeyValueBlock).pairs ?? [];
                              const next = current.map((pair, i) =>
                                i === idx
                                  ? { ...pair, key: e.target.value }
                                  : pair,
                              );
                              updateBlock(b.id, {
                                pairs: next,
                              } as Partial<KeyValueBlock>);
                            }}
                            disabled={disabled || b.mode === "form"}
                            placeholder="Clave"
                          />
                          <input
                            className={input}
                            value={p.value}
                            onChange={(e) => {
                              const current = (b as KeyValueBlock).pairs ?? [];
                              const next = current.map((pair, i) =>
                                i === idx
                                  ? { ...pair, value: e.target.value }
                                  : pair,
                              );
                              updateBlock(b.id, {
                                pairs: next,
                              } as Partial<KeyValueBlock>);
                            }}
                            disabled={disabled || b.mode === "form"}
                            placeholder="Valor"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const current = (b as KeyValueBlock).pairs ?? [];
                              const next = current.filter((_, i) => i !== idx);
                              updateBlock(b.id, {
                                pairs: next,
                              } as Partial<KeyValueBlock>);
                            }}
                            disabled={disabled}
                            className="rounded-full bg-red-600 px-3 py-1 text-sm text-red-100 shadow-sm dark:bg-red-800"
                          >
                            Quitar
                          </button>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() => {
                          const current = (b as KeyValueBlock).pairs ?? [];
                          updateBlock(b.id, {
                            pairs: [...current, { key: "", value: "" }],
                          } as Partial<KeyValueBlock>);
                        }}
                        disabled={disabled || b.mode === "form"}
                        className="rounded-full bg-slate-200 px-3 py-1 text-sm text-slate-900 shadow-sm dark:bg-white/10 dark:text-white"
                      >
                        + Agregar fila
                      </button>
                    </div>
                  )}

                  {b.type === "twoColumns" && (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <label className="text-sm">
                        Columna izquierda
                        <textarea
                          className={`${input} mt-1 h-24`}
                          value={(b as TwoColumnsBlock).left ?? ""}
                          onChange={(e) =>
                            updateBlock(b.id, {
                              left: e.target.value,
                            } as Partial<TwoColumnsBlock>)
                          }
                          disabled={disabled || b.mode === "form"}
                          placeholder="Texto izquierda…"
                        />
                      </label>
                      <label className="text-sm">
                        Columna derecha
                        <textarea
                          className={`${input} mt-1 h-24`}
                          value={(b as TwoColumnsBlock).right ?? ""}
                          onChange={(e) =>
                            updateBlock(b.id, {
                              right: e.target.value,
                            } as Partial<TwoColumnsBlock>)
                          }
                          disabled={disabled || b.mode === "form"}
                          placeholder="Texto derecha…"
                        />
                      </label>
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>
    </>
  );
};

// Botoncito reutilizable para agregar bloques
const AddBlockButton: React.FC<
  React.PropsWithChildren<{ onAdd: () => void }>
> = ({ onAdd, children }) => {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="rounded-full bg-slate-200 px-4 py-1 text-sm text-slate-900 shadow-sm transition hover:scale-[0.98] dark:bg-white/10 dark:text-white"
    >
      + {children}
    </button>
  );
};

export default TemplateConfigForm;
