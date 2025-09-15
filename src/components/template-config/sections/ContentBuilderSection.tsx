// src/components/template-config/sections/ContentBuilderSection.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  badge,
  getAt,
  input,
  normalizeKey,
  section,
  setAt,
  isObject,
} from "./_helpers";
import { Config } from "../types";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";

/** ===== Tipos de bloque ===== */
type BlockType =
  | "heading"
  | "subtitle"
  | "paragraph"
  | "list"
  | "keyValue"
  | "twoColumns"
  | "threeColumns";

type BlockMode = "fixed" | "form";

/** Estilo especial para Mupu por bloque (solo textos fijos) */
type MupuStyle = {
  color?: string; // hex/css; si no está, hereda del preset
  /** para keyValue: a qué aplicar */
  target?: "all" | "keys" | "values";
};

type BaseBlock = {
  id: string;
  type: BlockType;
  mode: BlockMode;
  label?: string;
  fieldKey?: string;
  required?: boolean;
  /** Solo visible/usable por la agencia Mupu (id=1) cuando el bloque es fijo */
  mupuStyle?: MupuStyle;
};

type HeadingBlock = BaseBlock & {
  type: "heading";
  text?: string;
  level?: 1;
};
type SubtitleBlock = BaseBlock & { type: "subtitle"; text?: string };
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
type ThreeColumnsBlock = BaseBlock & {
  type: "threeColumns";
  left?: string;
  center?: string;
  right?: string;
};
type ContentBlock =
  | HeadingBlock
  | SubtitleBlock
  | ParagraphBlock
  | ListBlock
  | KeyValueBlock
  | TwoColumnsBlock
  | ThreeColumnsBlock;

/** Utils de validación */
function isBlock(v: unknown): v is ContentBlock {
  if (!isObject(v)) return false;
  const t = (v as Record<string, unknown>)["type"];
  return (
    t === "heading" ||
    t === "subtitle" ||
    t === "paragraph" ||
    t === "list" ||
    t === "keyValue" ||
    t === "twoColumns" ||
    t === "threeColumns"
  );
}

/** Etiqueta visible en español para cada tipo de bloque */
function blockTypeEtiqueta(t: BlockType): string {
  switch (t) {
    case "heading":
      return "Título";
    case "subtitle":
      return "Subtítulo";
    case "paragraph":
      return "Párrafo";
    case "list":
      return "Lista";
    case "keyValue":
      return "Clave/Valor";
    case "twoColumns":
      return "Dos columnas";
    case "threeColumns":
      return "Tres columnas";
    default:
      return "Bloque";
  }
}

/** Botón reutilizable para agregar bloques */
const AddBlockButton: React.FC<
  React.PropsWithChildren<{ onAdd: () => void }>
> = ({ onAdd, children }) => (
  <button
    type="button"
    onClick={onAdd}
    className="rounded-full bg-slate-200 px-4 py-1 text-sm text-slate-900 shadow-sm transition hover:scale-[0.98] dark:bg-white/10 dark:text-white"
  >
    + {children}
  </button>
);

type Props = {
  cfg: Config;
  disabled: boolean;
  onChange: (next: Config) => void;
};

type AgencyLite = {
  id?: number;
  id_agency?: number;
  [k: string]: unknown;
};

const ContentBuilderSection: React.FC<Props> = ({
  cfg,
  disabled,
  onChange,
}) => {
  /** ===== State derivado de config ===== */
  const blocks = useMemo(
    () =>
      (getAt<unknown[]>(cfg, ["content", "blocks"], []) || []).filter(
        isBlock,
      ) as ContentBlock[],
    [cfg],
  );

  const setBlocks = (next: ContentBlock[]) =>
    onChange(setAt(cfg, ["content", "blocks"], next));

  /** ===== Solo Mupu (agencia id=1) puede customizar tipografías y color por bloque fijo ===== */
  const { token } = useAuth();
  const [isMupuAgency, setIsMupuAgency] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!token) {
      return;
    }
    (async () => {
      try {
        const res = await authFetch(
          "/api/agency",
          { cache: "no-store" },
          token,
        );
        const data = (await res.json().catch(() => ({}))) as AgencyLite;
        const agencyId =
          (typeof data.id === "number" ? data.id : data.id_agency) ?? null;
        if (mounted) {
          setIsMupuAgency(agencyId === 1);
        }
      } catch {
        if (mounted) {
          setIsMupuAgency(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token]);

  /** ===== CRUD de bloques ===== */
  const addBlock = (type: BlockType) => {
    const id = `b_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const base: BaseBlock = {
      id,
      type,
      mode: "fixed",
      label: "",
      required: true,
      fieldKey: normalizeKey(type, id),
    };

    let byType: ContentBlock;
    switch (type) {
      case "heading":
        byType = { ...base, type, text: "Título", level: 1 };
        break;
      case "subtitle":
        byType = { ...base, type, text: "Subtítulo" };
        break;
      case "paragraph":
        byType = { ...base, type, text: "Texto del párrafo" };
        break;
      case "list":
        byType = { ...base, type, items: ["Ítem 1", "Ítem 2"] };
        break;
      case "keyValue":
        byType = { ...base, type, pairs: [{ key: "Clave", value: "Valor" }] };
        break;
      case "twoColumns":
        byType = { ...base, type, left: "Izquierda", right: "Derecha" };
        break;
      case "threeColumns":
        byType = {
          ...base,
          type,
          left: "Izquierda",
          center: "Centro",
          right: "Derecha",
        };
        break;
      default:
        byType = base as ContentBlock;
        break;
    }

    setBlocks([...blocks, byType]);
  };

  const updateBlock = (id: string, patch: Partial<ContentBlock>) => {
    setBlocks(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const removeBlock = (id: string) => {
    setBlocks(blocks.filter((b) => b.id !== id));
  };

  const moveBlock = (id: string, dir: "up" | "down") => {
    const idx = blocks.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const target = dir === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    const [item] = next.splice(idx, 1);
    next.splice(target, 0, item);
    setBlocks(next);
  };

  /** ===== Helpers UI para MupuStyle ===== */
  const setMupuStyle = (id: string, patch: Partial<MupuStyle>) => {
    const blk = blocks.find((b) => b.id === id);
    if (!blk) return;
    const current = blk.mupuStyle ?? {};
    updateBlock(id, { mupuStyle: { ...current, ...patch } });
  };

  const resetMupuStyle = (id: string) => {
    updateBlock(id, { mupuStyle: undefined });
  };

  /** ===== Render ===== */
  return (
    <section className={`${section} col-span-2`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Contenido del documento</h2>
        <div className="flex flex-wrap items-center gap-2">
          <AddBlockButton onAdd={() => addBlock("heading")}>
            Título
          </AddBlockButton>
          <AddBlockButton onAdd={() => addBlock("subtitle")}>
            Subtítulo
          </AddBlockButton>
          <AddBlockButton onAdd={() => addBlock("paragraph")}>
            Párrafo
          </AddBlockButton>
          <AddBlockButton onAdd={() => addBlock("list")}>Lista</AddBlockButton>
          <AddBlockButton onAdd={() => addBlock("keyValue")}>
            Clave/Valor
          </AddBlockButton>
          <AddBlockButton onAdd={() => addBlock("twoColumns")}>
            Dos columnas
          </AddBlockButton>
          <AddBlockButton onAdd={() => addBlock("threeColumns")}>
            Tres columnas
          </AddBlockButton>
        </div>
      </div>

      {blocks.length === 0 ? (
        <p className="text-sm opacity-70">
          No hay secciones aún. Agregá un bloque para empezar.
        </p>
      ) : (
        <div className="space-y-2">
          {blocks.map((b, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === blocks.length - 1;
            const fieldKey =
              b.fieldKey ||
              normalizeKey(b.label || "", `${b.type}_${b.id.slice(-4)}`);

            const onlyFixed = b.mode === "fixed";
            const showMupuControls = isMupuAgency && onlyFixed;

            return (
              <details
                key={b.id}
                open
                className="group rounded-xl border border-slate-900/10 bg-white/40 p-2 dark:border-white/10 dark:bg-white/5"
              >
                <summary className="flex cursor-pointer select-none items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={badge}>{blockTypeEtiqueta(b.type)}</span>
                    <span className="opacity-70">
                      {b.label?.trim() ? b.label : "Sin etiqueta"}
                    </span>
                    {b.mode === "form" && (
                      <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                        campo: <code>{fieldKey}</code>
                      </span>
                    )}
                    {showMupuControls && b.mupuStyle?.color && (
                      <span className="rounded-md bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-700 dark:text-sky-300">
                        color: <code>{b.mupuStyle.color}</code>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      className="cursor-pointer appearance-none rounded-lg border border-slate-900/10 bg-white/70 px-2 py-1 text-xs dark:border-white/10 dark:bg-white/10"
                      value={b.mode}
                      onChange={(e) =>
                        updateBlock(b.id, { mode: e.target.value as BlockMode })
                      }
                      disabled={disabled}
                      title="Dónde se completa este contenido"
                    >
                      <option value="fixed">Fijo</option>
                      <option value="form">Se completa en el formulario</option>
                    </select>

                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.preventDefault();
                        moveBlock(b.id, "up");
                      }}
                      disabled={disabled || isFirst}
                      className="rounded-full bg-white/70 px-2 py-1 shadow-sm disabled:opacity-40 dark:bg-white/10"
                      title="Mover arriba"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.preventDefault();
                        moveBlock(b.id, "down");
                      }}
                      disabled={disabled || isLast}
                      className="rounded-full bg-white/70 px-2 py-1 shadow-sm disabled:opacity-40 dark:bg-white/10"
                      title="Mover abajo"
                    >
                      ↓
                    </button>

                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.preventDefault();
                        removeBlock(b.id);
                      }}
                      disabled={disabled}
                      className="rounded-full bg-red-600 px-3 py-1 text-xs text-red-100 shadow-sm dark:bg-red-800"
                      title="Quitar"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="size-5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18 18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                </summary>

                <div className="mt-2 space-y-3 px-2 pb-2">
                  {/* etiqueta + obligatorio + clave (solo lectura visual) */}
                  <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_auto]">
                    <label className="text-sm">
                      Etiqueta
                      <input
                        className={`${input} mt-1`}
                        value={b.label ?? ""}
                        onChange={(e) => {
                          const newLabel = e.target.value;
                          const newKey = normalizeKey(
                            newLabel,
                            `${b.type}_${b.id.slice(-4)}`,
                          );
                          setBlocks(
                            blocks.map((x) =>
                              x.id === b.id
                                ? { ...x, label: newLabel, fieldKey: newKey }
                                : x,
                            ),
                          );
                        }}
                        disabled={disabled}
                        placeholder="Ej.: Datos del viaje"
                      />
                    </label>

                    <div className="flex items-center gap-3">
                      {b.mode === "form" && (
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={b.required !== false}
                            onChange={(e) =>
                              updateBlock(b.id, { required: e.target.checked })
                            }
                            disabled={disabled}
                          />
                          Obligatorio
                        </label>
                      )}
                      {b.mode === "form" && (
                        <div
                          className="rounded-lg border border-slate-900/10 bg-white/60 px-2 py-1 text-[11px] dark:border-white/10 dark:bg-white/10"
                          title="Clave de formulario (auto-generada)"
                        >
                          clave: <code>{fieldKey}</code>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ===== Campos específicos por tipo ===== */}
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
                    </div>
                  )}

                  {b.type === "subtitle" && (
                    <label className="text-sm">
                      Texto del subtítulo
                      <input
                        className={`${input} mt-1`}
                        value={(b as SubtitleBlock).text ?? ""}
                        onChange={(e) =>
                          updateBlock(b.id, {
                            text: e.target.value,
                          } as Partial<SubtitleBlock>)
                        }
                        disabled={disabled || b.mode === "form"}
                        placeholder="Subtítulo"
                      />
                    </label>
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
                        placeholder={"Ítem 1\nÍtem 2\nÍtem 3"}
                      />
                    </label>
                  )}

                  {b.type === "keyValue" && (
                    <KeyValueEditor
                      disabled={disabled}
                      block={b as KeyValueBlock}
                      onChange={(pairs) =>
                        updateBlock(b.id, { pairs } as Partial<KeyValueBlock>)
                      }
                    />
                  )}

                  {b.type === "twoColumns" && (
                    <TwoColumnsEditor
                      disabled={disabled}
                      block={b as TwoColumnsBlock}
                      onChange={(patch) => updateBlock(b.id, patch)}
                    />
                  )}

                  {b.type === "threeColumns" && (
                    <ThreeColumnsEditor
                      disabled={disabled}
                      block={b as ThreeColumnsBlock}
                      onChange={(patch) => updateBlock(b.id, patch)}
                    />
                  )}

                  {/* ======== Controles Mupu por bloque (solo fijos) ======== */}
                  {showMupuControls && (
                    <details className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-2 open:pb-3">
                      <summary className="cursor-pointer select-none text-sm font-medium text-sky-800 dark:text-sky-300">
                        Mupu – estilo de texto (solo fijo)
                      </summary>

                      <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
                        {/* Color */}
                        <label className="text-sm">
                          Color del texto
                          <div className="mt-1 flex items-center gap-2">
                            <input
                              type="color"
                              className="h-8 w-10 cursor-pointer rounded border border-slate-900/10 bg-white/70 dark:border-white/10 dark:bg-white/10"
                              value={b.mupuStyle?.color ?? "#1F2937"}
                              onChange={(e) =>
                                setMupuStyle(b.id, { color: e.target.value })
                              }
                              disabled={disabled}
                              title="Elegí un color — dejá vacío para Poppins"
                            />
                            <input
                              className={`${input} flex-1`}
                              value={b.mupuStyle?.color ?? ""}
                              onChange={(e) =>
                                setMupuStyle(b.id, {
                                  color: e.target.value || undefined,
                                })
                              }
                              placeholder="#1F2937 o rgba(...)"
                              disabled={disabled}
                            />
                          </div>
                        </label>
                      </div>

                      {/* A qué aplicar (solo Clave/Valor) */}
                      {b.type === "keyValue" && (
                        <div className="mt-2">
                          <label className="text-sm">
                            Aplicar a
                            <select
                              className={`${input} mt-1`}
                              value={b.mupuStyle?.target ?? "all"}
                              onChange={(e) =>
                                setMupuStyle(b.id, {
                                  target: e.target.value as MupuStyle["target"],
                                })
                              }
                              disabled={disabled}
                            >
                              <option value="all">Claves y valores</option>
                              <option value="keys">Solo claves</option>
                              <option value="values">Solo valores</option>
                            </select>
                          </label>
                        </div>
                      )}

                      <div className="mt-3">
                        <button
                          type="button"
                          className="rounded-full bg-slate-200 px-3 py-1 text-xs text-slate-900 shadow-sm transition hover:scale-[0.98] dark:bg-white/10 dark:text-white"
                          onClick={() => resetMupuStyle(b.id)}
                          disabled={disabled}
                          title="Volver a heredar colores/tipo"
                        >
                          Restablecer estilo Mupu del bloque
                        </button>
                      </div>
                    </details>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
};

/** ===== Sub-editors ===== */
const KeyValueEditor: React.FC<{
  disabled: boolean;
  block: KeyValueBlock;
  onChange: (pairs: { key: string; value: string }[]) => void;
}> = ({ disabled, block, onChange }) => {
  const pairs = block.pairs ?? [];
  return (
    <div className="space-y-2">
      {pairs.map((p, i) => (
        <div
          key={i}
          className="grid grid-cols-[1fr_1fr_auto] items-center gap-2"
        >
          <input
            className={input}
            value={p.key}
            onChange={(e) =>
              onChange(
                pairs.map((pair, idx) =>
                  idx === i ? { ...pair, key: e.target.value } : pair,
                ),
              )
            }
            disabled={disabled || block.mode === "form"}
            placeholder="Clave"
          />
          <input
            className={input}
            value={p.value}
            onChange={(e) =>
              onChange(
                pairs.map((pair, idx) =>
                  idx === i ? { ...pair, value: e.target.value } : pair,
                ),
              )
            }
            disabled={disabled || block.mode === "form"}
            placeholder="Valor"
          />
          <button
            type="button"
            onClick={() => onChange(pairs.filter((_, idx) => idx !== i))}
            disabled={disabled}
            className="rounded-full bg-red-600 px-3 py-1 text-sm text-red-100 shadow-sm dark:bg-red-800"
            title="Quitar fila"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="size-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...(pairs ?? []), { key: "", value: "" }])}
        disabled={disabled || block.mode === "form"}
        className="rounded-full bg-slate-200 px-3 py-1 text-sm text-slate-900 shadow-sm dark:bg-white/10 dark:text-white"
      >
        + Agregar fila
      </button>
    </div>
  );
};

const TwoColumnsEditor: React.FC<{
  disabled: boolean;
  block: TwoColumnsBlock;
  onChange: (patch: Partial<TwoColumnsBlock>) => void;
}> = ({ disabled, block, onChange }) => (
  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
    <label className="text-sm">
      Columna izquierda
      <textarea
        className={`${input} mt-1 h-24`}
        value={block.left ?? ""}
        onChange={(e) => onChange({ left: e.target.value })}
        disabled={disabled || block.mode === "form"}
        placeholder="Texto izquierda…"
      />
    </label>
    <label className="text-sm">
      Columna derecha
      <textarea
        className={`${input} mt-1 h-24`}
        value={block.right ?? ""}
        onChange={(e) => onChange({ right: e.target.value })}
        disabled={disabled || block.mode === "form"}
        placeholder="Texto derecha…"
      />
    </label>
  </div>
);

const ThreeColumnsEditor: React.FC<{
  disabled: boolean;
  block: ThreeColumnsBlock;
  onChange: (patch: Partial<ThreeColumnsBlock>) => void;
}> = ({ disabled, block, onChange }) => (
  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
    <label className="text-sm">
      Izquierda
      <textarea
        className={`${input} mt-1 h-24`}
        value={block.left ?? ""}
        onChange={(e) => onChange({ left: e.target.value })}
        disabled={disabled || block.mode === "form"}
        placeholder="Texto izquierda…"
      />
    </label>
    <label className="text-sm">
      Centro
      <textarea
        className={`${input} mt-1 h-24`}
        value={block.center ?? ""}
        onChange={(e) => onChange({ center: e.target.value })}
        disabled={disabled || block.mode === "form"}
        placeholder="Texto centro…"
      />
    </label>
    <label className="text-sm">
      Derecha
      <textarea
        className={`${input} mt-1 h-24`}
        value={block.right ?? ""}
        onChange={(e) => onChange({ right: e.target.value })}
        disabled={disabled || block.mode === "form"}
        placeholder="Texto derecha…"
      />
    </label>
  </div>
);

export default ContentBuilderSection;
