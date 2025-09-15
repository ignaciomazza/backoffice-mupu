// src/components/templates/TemplateDataForm.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { nanoid } from "nanoid/non-secure";
import type {
  TemplateConfig,
  BlockType,
  TemplateFormValues,
  OrderedBlock,
  BlockFormValue,
  ContentBlock,
  ListBlock,
  KeyValueBlock,
  TwoColumnsBlock,
  ThreeColumnsBlock,
} from "@/types/templates";
import { asStringArray, buildInitialOrderedBlocks } from "@/lib/templateConfig";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import { toast } from "react-toastify";
import TextPresetPicker from "./TextPresetPicker";

const cx = (...c: Array<string | false | null | undefined>) =>
  c.filter(Boolean).join(" ");

/* =============================================================================
 * UI atoms
 * ========================================================================== */
const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide opacity-70">
    {children}
  </label>
);

const TextInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (
  props,
) => (
  <input
    {...props}
    className={cx(
      "w-full rounded-xl border border-sky-950/10 bg-sky-100/20 p-2 px-3 outline-none backdrop-blur dark:border-white/10 dark:bg-white/10",
      props.className,
    )}
  />
);

const TextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (
  props,
) => (
  <textarea
    {...props}
    className={cx(
      "w-full rounded-xl border border-sky-950/10 bg-sky-100/20 p-2 px-3 outline-none backdrop-blur dark:border-white/10 dark:bg-white/10",
      props.className,
    )}
  />
);

function LevelSelect({
  value,
  onChange,
}: {
  value: 1 | 2 | 3;
  onChange: (v: 1 | 2 | 3) => void;
}) {
  return (
    <select
      className="w-full cursor-pointer rounded-xl border border-white/10 bg-white/50 p-2 px-3 outline-none backdrop-blur dark:border-white/10 dark:bg-white/10"
      value={value}
      onChange={(e) => onChange(Number(e.target.value) as 1 | 2 | 3)}
    >
      <option value={1}>H1</option>
      <option value={2}>H2</option>
      <option value={3}>H3</option>
    </select>
  );
}

/* =============================================================================
 * Helpers tipados
 * ========================================================================== */
const isEditable = (b: OrderedBlock) => b.origin !== "fixed";

/* ====== Metadatos visuales por tipo (icono + ayudas) ====== */
const TypeIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    className={cx("h-4 w-4", className)}
    fill="currentColor"
  >
    <circle cx="12" cy="12" r="10" className="opacity-20" />
    <path
      d="M7 8h10M7 12h7M7 16h10"
      stroke="currentColor"
      strokeWidth={1.5}
      fill="none"
    />
  </svg>
);

const ListIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    className={cx("h-4 w-4", className)}
    fill="currentColor"
  >
    <circle cx="5" cy="7" r="1.25" />
    <circle cx="5" cy="12" r="1.25" />
    <circle cx="5" cy="17" r="1.25" />
    <path
      d="M9 7h10M9 12h10M9 17h10"
      stroke="currentColor"
      strokeWidth={1.5}
      fill="none"
    />
  </svg>
);

const KVIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    className={cx("h-4 w-4", className)}
    fill="currentColor"
  >
    <rect x="3" y="6" width="18" height="4" rx="1" className="opacity-30" />
    <rect x="3" y="14" width="18" height="4" rx="1" className="opacity-60" />
  </svg>
);

const ColumnsIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    className={cx("h-4 w-4", className)}
    fill="currentColor"
  >
    <rect x="3" y="5" width="7.5" height="14" rx="1" className="opacity-40" />
    <rect
      x="13.5"
      y="5"
      width="7.5"
      height="14"
      rx="1"
      className="opacity-70"
    />
  </svg>
);

const ThreeColsIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    className={cx("h-4 w-4", className)}
    fill="currentColor"
  >
    <rect x="3" y="5" width="5.5" height="14" rx="1" className="opacity-40" />
    <rect
      x="9.25"
      y="5"
      width="5.5"
      height="14"
      rx="1"
      className="opacity-60"
    />
    <rect
      x="15.5"
      y="5"
      width="5.5"
      height="14"
      rx="1"
      className="opacity-80"
    />
  </svg>
);

type TypeMeta = {
  label: string;
  help: string;
  icon: React.ReactNode;
};

const BLOCK_META: Record<BlockType, TypeMeta> = {
  heading: {
    label: "Título",
    help: "Encabezado principal (H1–H3). Úsalo para secciones grandes.",
    icon: <TypeIcon />,
  },
  subtitle: {
    label: "Subtítulo",
    help: "Subencabezado para separar contenido dentro de una sección.",
    icon: <TypeIcon />,
  },
  paragraph: {
    label: "Párrafo",
    help: "Bloque de texto libre (ideal para descripciones o condiciones).",
    icon: <TypeIcon />,
  },
  list: {
    label: "Lista",
    help: "Viñetas para incluir puntos clave, servicios o aclaraciones.",
    icon: <ListIcon />,
  },
  keyValue: {
    label: "Clave/Valor",
    help: "Filas tipo 'Campo: Valor' (ej.: Check-in: 14:00).",
    icon: <KVIcon />,
  },
  twoColumns: {
    label: "Dos columnas",
    help: "Texto lado A / lado B (por ejemplo, incluye/excluye).",
    icon: <ColumnsIcon />,
  },
  threeColumns: {
    label: "Tres columnas",
    help: "Texto en tres paneles (izquierda/centro/derecha).",
    icon: <ThreeColsIcon />,
  },
};

/** Resumen compacto por bloque (con soporte para "fixed" leyendo del config) */
function summarize(block: OrderedBlock, origin?: ContentBlock): string {
  const v = block.value as BlockFormValue | undefined;
  const clean = (s?: string) =>
    (s ?? "").toString().replace(/\s+/g, " ").trim();

  // Si el bloque tiene value (form/extra), usamos eso
  if (v) {
    switch (block.type) {
      case "heading": {
        const h = v as Extract<BlockFormValue, { type: "heading" }>;
        return clean(h.text) || "Sin título";
      }
      case "subtitle": {
        const s = v as Extract<BlockFormValue, { type: "subtitle" }>;
        return clean(s.text) || "Sin subtítulo";
      }
      case "paragraph": {
        const p = v as Extract<BlockFormValue, { type: "paragraph" }>;
        const t = clean(p.text);
        return t || "Vacío";
      }
      case "list": {
        const l = v as Extract<BlockFormValue, { type: "list" }>;
        const items = asStringArray(l.items);
        return items.length ? `${items.length} ítem(s)` : "Sin ítems";
      }
      case "keyValue": {
        const kv = v as Extract<BlockFormValue, { type: "keyValue" }>;
        const n = (kv.pairs ?? []).length;
        return n ? `${n} par(es) clave/valor` : "Sin filas";
      }
      case "twoColumns": {
        const t = v as Extract<BlockFormValue, { type: "twoColumns" }>;
        return [
          clean(t.left) ? "Izq ok" : "Izq vacía",
          clean(t.right) ? "Der ok" : "Der vacía",
        ].join(" · ");
      }
      case "threeColumns": {
        const t = v as Extract<BlockFormValue, { type: "threeColumns" }>;
        return [
          clean(t.left) ? "Izq ok" : "Izq vacía",
          clean(t.center) ? "Centro ok" : "Centro vacío",
          clean(t.right) ? "Der ok" : "Der vacía",
        ].join(" · ");
      }
    }
  }

  // Si NO hay value y es un bloque FIJO, usamos el origin del config
  if (block.origin === "fixed" && origin) {
    switch (origin.type) {
      case "heading":
        return clean(origin.text) || "Sin título";
      case "subtitle":
        return clean(origin.text) || "Sin subtítulo";
      case "paragraph":
        return clean(origin.text) || "Vacío";
      case "list": {
        const items = asStringArray((origin as ListBlock).items);
        return items.length ? `${items.length} ítem(s)` : "Sin ítems";
      }
      case "keyValue": {
        const n = ((origin as KeyValueBlock).pairs ?? []).length;
        return n ? `${n} par(es) clave/valor` : "Sin filas";
      }
      case "twoColumns": {
        const o = origin as TwoColumnsBlock;
        return [
          clean(o.left) ? "Izq ok" : "Izq vacía",
          clean(o.right) ? "Der ok" : "Der vacía",
        ].join(" · ");
      }
      case "threeColumns": {
        const o = origin as ThreeColumnsBlock;
        return [
          clean(o.left) ? "Izq ok" : "Izq vacía",
          clean(o.center) ? "Centro ok" : "Centro vacío",
          clean(o.right) ? "Der ok" : "Der vacía",
        ].join(" · ");
      }
    }
  }

  return "Vacío";
}

/* =============================================================================
 * Hook: inicializa blocks si están vacíos
 * ========================================================================== */
function useEnsureBlocksInitialized(
  cfg: TemplateConfig,
  value: TemplateFormValues,
  onChange: (next: TemplateFormValues) => void,
) {
  useEffect(() => {
    if (Array.isArray(value.blocks) && value.blocks.length > 0) return;
    const initial = buildInitialOrderedBlocks(cfg);
    onChange({ ...value, blocks: initial });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, value.blocks]);
}

/* =============================================================================
 * Presets (data)
 * ========================================================================== */
type DataPresetEnvelope = {
  version: number;
  kind: "data";
  data: { blocks: OrderedBlock[] };
};

/* =============================================================================
 * Main
 * ========================================================================== */
type Props = {
  cfg: TemplateConfig;
  value: TemplateFormValues;
  onChange: (next: TemplateFormValues) => void;
  className?: string;
  token?: string | null;
  /** Tipo del documento actual (lo usamos para guardar presets de contenido) */
  docType: "quote" | "confirmation";
};

export default function TemplateDataForm({
  cfg,
  value,
  onChange,
  className,
  token,
  docType,
}: Props) {
  useEnsureBlocksInitialized(cfg, value, onChange);

  const { token: ctxToken } = useAuth();
  const authToken = token ?? ctxToken ?? null;

  const blocks = useMemo<OrderedBlock[]>(
    () => (Array.isArray(value.blocks) ? value.blocks : []),
    [value.blocks],
  );

  // Mapa para bloques originales del config (para mostrar resumen en "fixed")
  const originMap = useMemo(() => {
    const map = new Map<string, ContentBlock>();
    (cfg.content?.blocks ?? []).forEach((b) =>
      map.set(b.id, b as ContentBlock),
    );
    return map;
  }, [cfg]);

  /** estado de acordeones (abierto/cerrado por id) */
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries((blocks || []).map((b) => [b.id, isEditable(b)])),
  );
  useEffect(() => {
    // si cambian los blocks (p.ej. preset), reseteamos acordeones
    setOpen(Object.fromEntries(blocks.map((b) => [b.id, isEditable(b)])));
  }, [blocks]);

  const toggle = (id: string) => setOpen((st) => ({ ...st, [id]: !st[id] }));

  const patchBlock = (id: string, patch: Partial<OrderedBlock>) => {
    const next = blocks.map((b) => (b.id === id ? { ...b, ...patch } : b));
    onChange({ ...value, blocks: next });
  };

  const move = (id: string, dir: "up" | "down") => {
    const i = blocks.findIndex((b) => b.id === id);
    if (i < 0) return;
    const j = dir === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= blocks.length) return;
    const arr = [...blocks];
    const [it] = arr.splice(i, 1);
    arr.splice(j, 0, it);
    onChange({ ...value, blocks: arr });
  };

  const remove = (id: string) => {
    const b = blocks.find((x) => x.id === id);
    if (!b || !isEditable(b)) return;
    onChange({ ...value, blocks: blocks.filter((x) => x.id !== id) });
  };

  const addNew = (type: BlockType) => {
    const nb = makeNewBlock(type);
    onChange({ ...value, blocks: [...blocks, nb] });
    setOpen((st) => ({ ...st, [nb.id]: true }));
  };

  // --------------------------- PRESETS ---------------------------
  const saveCurrentAsPreset = async () => {
    try {
      if (!authToken) return toast.error("No hay token de autenticación.");
      const title = window.prompt("Nombre del preset de contenido:");
      if (!title || !title.trim()) return;

      const envelope: DataPresetEnvelope = {
        version: 2,
        kind: "data",
        data: { blocks },
      };

      const payload = {
        title: title.trim(),
        content: "",
        doc_type: docType,
        data: envelope,
      };

      const res = await authFetch(
        "/api/text-preset",
        { method: "POST", body: JSON.stringify(payload) },
        authToken,
      );
      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({}) as Record<string, unknown>);
        const msg =
          (data?.error as string) ||
          (data?.message as string) ||
          "No se pudo guardar el preset.";
        throw new Error(msg);
      }

      toast.success("Preset de contenido guardado.");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Error guardando el preset.",
      );
    }
  };

  const box =
    "mb-6 rounded-2xl border h-fit border-slate-900/10 bg-white/50 p-4 dark:border-white/10 dark:bg-white/10";
  const btn = "rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/20";
  const danger =
    "rounded-full bg-red-600/80 px-3 py-1 text-xs text-white hover:bg-red-600";

  /* ------------------------- Leyenda ------------------------- */
  const Legend = () => (
    <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
      <span className="rounded-full bg-amber-200/70 px-2 py-0.5 text-amber-900 dark:bg-amber-400/20 dark:text-amber-100">
        Fijo
      </span>
      <span className="rounded-full bg-emerald-200/70 px-2 py-0.5 text-emerald-900 dark:bg-emerald-400/20 dark:text-emerald-100">
        Campo (config)
      </span>
      <span className="rounded-full bg-sky-200/70 px-2 py-0.5 text-sky-900 dark:bg-sky-400/20 dark:text-sky-100">
        Campo (nuevo)
      </span>
      <span className="ml-3 text-xs opacity-60">
        Tip: hacé click en la cabecera para ver/ocultar el editor.
      </span>
    </div>
  );

  return (
    <div className={cx("space-y-6", className)}>
      {/* PRESETS toolbar */}
      <section className={cx(box)}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold opacity-90">
            Presets de contenido
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={saveCurrentAsPreset}
              className="rounded-full bg-sky-100 px-3 py-1 text-sm text-sky-900 shadow-sm hover:opacity-90 dark:bg-white/10 dark:text-white"
              title="Guardar los bloques actuales como preset"
            >
              Guardar preset
            </button>
          </div>
        </div>

        <TextPresetPicker
          token={authToken}
          docType={docType}
          onApply={(content) => {
            if (!content?.trim()) return;
            onChange({
              ...value,
              blocks: [
                ...(value.blocks ?? []),
                {
                  id: nanoid(),
                  origin: "extra", // creado por el usuario
                  type: "paragraph",
                  value: { type: "paragraph", text: content },
                },
              ],
            });
          }}
          onApplyData={(maybeBlocks) => {
            if (Array.isArray(maybeBlocks)) {
              onChange({ ...value, blocks: maybeBlocks as OrderedBlock[] });
            }
          }}
        />
      </section>

      {/* Constructor de contenido */}
      <section className="mb-6 h-fit rounded-2xl border border-slate-900/10 bg-white/50 p-4 dark:border-white/10 dark:bg-white/10">
        {/* Toolbar agregar */}
        <div className={cx(box)}>
          <h3 className="mb-3 text-base font-semibold opacity-90">
            Contenido del documento
          </h3>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["heading", "Título"],
                ["subtitle", "Subtítulo"],
                ["paragraph", "Párrafo"],
                ["list", "Lista"],
                ["keyValue", "Clave/Valor"],
                ["twoColumns", "Dos columnas"],
                ["threeColumns", "Tres columnas"],
              ] as Array<[BlockType, string]>
            ).map(([t, label]) => (
              <button
                key={t}
                type="button"
                onClick={() => addNew(t)}
                className="rounded-full bg-sky-100 px-3 py-1 text-xs text-sky-900 hover:opacity-90 dark:bg-white/10 dark:text-white"
              >
                + {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs opacity-70">
            Podés agregar nuevos bloques (son <b>campos</b> del formulario),
            moverlos y eliminarlos. Los bloques <b>fijos</b> de la configuración
            pueden reordenarse, pero no se editan desde acá.
          </p>

          <Legend />
        </div>

        {/* Listado/edición */}
        <div className="space-y-3">
          {blocks.length === 0 ? (
            <div className={cx(box, "text-sm opacity-70")}>
              No hay bloques todavía. Agregá alguno con los botones de arriba.
            </div>
          ) : (
            blocks.map((b, idx) => {
              const meta = BLOCK_META[b.type];
              const isFixed = b.origin === "fixed";
              const originBadge = isFixed
                ? "bg-amber-200/70 text-amber-900 dark:bg-amber-400/20 dark:text-amber-100"
                : b.origin === "extra"
                  ? "bg-sky-200/70 text-sky-900 dark:bg-sky-400/20 dark:text-sky-100"
                  : "bg-emerald-200/70 text-emerald-900 dark:bg-emerald-400/20 dark:text-emerald-100";
              const originLabel = isFixed
                ? "Fijo"
                : b.origin === "extra"
                  ? "Campo (nuevo)"
                  : "Campo (config)";

              return (
                <div key={b.id} className={cx(box, "overflow-hidden p-0")}>
                  {/* Header block (clickable) */}
                  <button
                    type="button"
                    onClick={() => toggle(b.id)}
                    aria-expanded={Boolean(open[b.id])}
                    className={cx(
                      "flex w-full items-center justify-between gap-3 px-4 py-3 text-left",
                      "hover:bg-white/60 dark:hover:bg-white/5",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="w-6 shrink-0 text-right text-xs opacity-60">
                        {idx + 1}.
                      </span>
                      <span className="shrink-0 text-sky-600 dark:text-sky-300">
                        <span className="inline-flex size-5 items-center justify-center">
                          {meta.icon}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide">
                        {meta.label}
                      </span>
                      <span
                        className={cx(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide",
                          originBadge,
                        )}
                      >
                        {originLabel}
                      </span>

                      {/* resumen */}
                      <span className="ml-2 line-clamp-1 min-w-0 flex-1 truncate text-sm opacity-70">
                        {summarize(b, originMap.get(b.id))}
                      </span>

                      {/* ayuda (title simple) */}
                      <span
                        className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] opacity-70"
                        title={meta.help}
                      >
                        Ayuda
                      </span>
                    </div>

                    <span
                      className={cx(
                        "ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10",
                        open[b.id] ? "rotate-180" : "rotate-0",
                      )}
                      aria-hidden
                    >
                      ▲
                    </span>
                  </button>

                  {/* Toolbar derecha (mover/quitar) */}
                  <div className="flex items-center justify-end gap-1 px-4 pb-2 pt-1">
                    <button
                      type="button"
                      onClick={() => move(b.id, "up")}
                      className={btn}
                      title="Mover arriba"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(b.id, "down")}
                      className={btn}
                      title="Mover abajo"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(b.id)}
                      className={cx(
                        isEditable(b)
                          ? danger
                          : "cursor-not-allowed opacity-40",
                      )}
                      disabled={!isEditable(b)}
                      title={
                        isEditable(b)
                          ? "Quitar bloque"
                          : "No se puede quitar un bloque fijo"
                      }
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

                  {/* Editor */}
                  {open[b.id] ? (
                    <div className="border-t border-white/10 px-4 py-3">
                      <BlockEditor
                        block={b}
                        onPatch={(patch) =>
                          patchBlock(b.id, {
                            value: patchValueForType(b, patch),
                          })
                        }
                      />
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

/* =============================================================================
 * Factory + patchValue
 * ========================================================================== */
function makeNewBlock(type: BlockType): OrderedBlock {
  const id = nanoid();
  switch (type) {
    case "heading":
      return {
        id,
        origin: "extra",
        type,
        label: undefined,
        value: { type: "heading", text: "", level: 1 },
      };
    case "subtitle":
      return {
        id,
        origin: "extra",
        type,
        value: { type: "subtitle", text: "" },
      };
    case "paragraph":
      return {
        id,
        origin: "extra",
        type,
        value: { type: "paragraph", text: "" },
      };
    case "list":
      return {
        id,
        origin: "extra",
        type,
        value: { type: "list", items: [] },
      };
    case "keyValue":
      return {
        id,
        origin: "extra",
        type,
        value: { type: "keyValue", pairs: [] },
      };
    case "twoColumns":
      return {
        id,
        origin: "extra",
        type,
        value: { type: "twoColumns", left: "", right: "" },
      };
    case "threeColumns":
      return {
        id,
        origin: "extra",
        type,
        value: { type: "threeColumns", left: "", center: "", right: "" },
      };
  }
}

/** Asegura que el `value` tenga la `type` correcta y mergea el patch parcial */
function patchValueForType(
  b: OrderedBlock,
  patch:
    | Partial<Extract<BlockFormValue, { type: "heading" }>>
    | Partial<Extract<BlockFormValue, { type: "subtitle" }>>
    | Partial<Extract<BlockFormValue, { type: "paragraph" }>>
    | Partial<Extract<BlockFormValue, { type: "list" }>>
    | Partial<Extract<BlockFormValue, { type: "keyValue" }>>
    | Partial<Extract<BlockFormValue, { type: "twoColumns" }>>
    | Partial<Extract<BlockFormValue, { type: "threeColumns" }>>,
): BlockFormValue {
  const existing = b.value;
  switch (b.type) {
    case "heading":
      return {
        type: "heading",
        text: (existing as Extract<BlockFormValue, { type: "heading" }>)?.text,
        level:
          (existing as Extract<BlockFormValue, { type: "heading" }>)?.level ??
          1,
        ...(patch as Partial<Extract<BlockFormValue, { type: "heading" }>>),
      };
    case "subtitle":
      return {
        type: "subtitle",
        text: (existing as Extract<BlockFormValue, { type: "subtitle" }>)?.text,
        ...(patch as Partial<Extract<BlockFormValue, { type: "subtitle" }>>),
      };
    case "paragraph":
      return {
        type: "paragraph",
        text: (existing as Extract<BlockFormValue, { type: "paragraph" }>)
          ?.text,
        ...(patch as Partial<Extract<BlockFormValue, { type: "paragraph" }>>),
      };
    case "list":
      return {
        type: "list",
        items:
          (existing as Extract<BlockFormValue, { type: "list" }>)?.items ?? [],
        ...(patch as Partial<Extract<BlockFormValue, { type: "list" }>>),
      };
    case "keyValue":
      return {
        type: "keyValue",
        pairs:
          (existing as Extract<BlockFormValue, { type: "keyValue" }>)?.pairs ??
          [],
        ...(patch as Partial<Extract<BlockFormValue, { type: "keyValue" }>>),
      };
    case "twoColumns":
      return {
        type: "twoColumns",
        left: (existing as Extract<BlockFormValue, { type: "twoColumns" }>)
          ?.left,
        right: (existing as Extract<BlockFormValue, { type: "twoColumns" }>)
          ?.right,
        ...(patch as Partial<Extract<BlockFormValue, { type: "twoColumns" }>>),
      };
    case "threeColumns":
      return {
        type: "threeColumns",
        left: (existing as Extract<BlockFormValue, { type: "threeColumns" }>)
          ?.left,
        center: (existing as Extract<BlockFormValue, { type: "threeColumns" }>)
          ?.center,
        right: (existing as Extract<BlockFormValue, { type: "threeColumns" }>)
          ?.right,
        ...(patch as Partial<
          Extract<BlockFormValue, { type: "threeColumns" }>
        >),
      };
  }
}

/* =============================================================================
 * Editor por bloque
 * ========================================================================== */
function BlockEditor({
  block,
  onPatch,
}: {
  block: OrderedBlock;
  onPatch: (
    v:
      | Partial<Extract<BlockFormValue, { type: "heading" }>>
      | Partial<Extract<BlockFormValue, { type: "subtitle" }>>
      | Partial<Extract<BlockFormValue, { type: "paragraph" }>>
      | Partial<Extract<BlockFormValue, { type: "list" }>>
      | Partial<Extract<BlockFormValue, { type: "keyValue" }>>
      | Partial<Extract<BlockFormValue, { type: "twoColumns" }>>
      | Partial<Extract<BlockFormValue, { type: "threeColumns" }>>,
  ) => void;
}) {
  if (!isEditable(block)) {
    return (
      <div className="text-xs opacity-70">
        Bloque <b>fijo</b>: el contenido se define en la configuración del
        template. Podés mover su posición, pero no editarlo acá.
      </div>
    );
  }

  const v =
    block.value ??
    ((): BlockFormValue => {
      switch (block.type) {
        case "heading":
          return { type: "heading", text: "Título", level: 1 };
        case "subtitle":
          return { type: "subtitle", text: "Subtítulo" };
        case "paragraph":
          return { type: "paragraph", text: "Texto del párrafo" };
        case "list":
          return { type: "list", items: [] };
        case "keyValue":
          return { type: "keyValue", pairs: [{ key: "", value: "" }] };
        case "twoColumns":
          return { type: "twoColumns", left: "", right: "" };
        case "threeColumns":
          return { type: "threeColumns", left: "", center: "", right: "" };
      }
    })();

  switch (block.type) {
    case "heading":
      return (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[120px_1fr]">
          <div>
            <FieldLabel>Nivel</FieldLabel>
            <LevelSelect
              value={
                (v as Extract<BlockFormValue, { type: "heading" }>).level ?? 1
              }
              onChange={(level) => onPatch({ level })}
            />
          </div>
          <div>
            <FieldLabel>Título</FieldLabel>
            <TextInput
              placeholder="Escribir…"
              value={
                (v as Extract<BlockFormValue, { type: "heading" }>).text ?? ""
              }
              onChange={(e) => onPatch({ text: e.target.value })}
            />
          </div>
        </div>
      );

    case "subtitle":
      return (
        <div>
          <FieldLabel>Subtítulo</FieldLabel>
          <TextInput
            placeholder="Escribir…"
            value={
              (v as Extract<BlockFormValue, { type: "subtitle" }>).text ?? ""
            }
            onChange={(e) => onPatch({ text: e.target.value })}
          />
        </div>
      );

    case "paragraph":
      return (
        <div>
          <FieldLabel>Párrafo</FieldLabel>
          <TextArea
            rows={4}
            placeholder="Escribir…"
            value={
              (v as Extract<BlockFormValue, { type: "paragraph" }>).text ?? ""
            }
            onChange={(e) => onPatch({ text: e.target.value })}
          />
        </div>
      );

    case "list": {
      const items = asStringArray(
        (v as Extract<BlockFormValue, { type: "list" }>).items,
      );
      const update = (idx: number, next: string) => {
        const arr = [...items];
        arr[idx] = next;
        onPatch({ items: arr });
      };
      const add = () => onPatch({ items: [...items, ""] });
      const del = (idx: number) =>
        onPatch({ items: items.filter((_, i) => i !== idx) });

      return (
        <div>
          <FieldLabel>Ítems</FieldLabel>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-2">
                <TextInput
                  placeholder={`Ítem ${i + 1}`}
                  value={it}
                  onChange={(e) => update(i, e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => del(i)}
                  className="rounded-full bg-red-600/80 px-3 py-1 text-xs text-white hover:bg-red-600"
                  title="Quitar ítem"
                >
                  Quitar
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={add}
              className="rounded-full bg-sky-100 px-3 py-1 text-xs text-sky-900 hover:opacity-90 dark:bg-white/10 dark:text-white"
              title="Agregar ítem"
            >
              + Agregar ítem
            </button>
          </div>
        </div>
      );
    }

    case "keyValue": {
      const pairs =
        (v as Extract<BlockFormValue, { type: "keyValue" }>).pairs ?? [];
      const update = (idx: number, field: "key" | "value", next: string) => {
        const arr = [...pairs];
        arr[idx] = { ...arr[idx], [field]: next };
        onPatch({ pairs: arr });
      };
      const add = () => onPatch({ pairs: [...pairs, { key: "", value: "" }] });
      const del = (idx: number) =>
        onPatch({ pairs: pairs.filter((_, i) => i !== idx) });

      return (
        <div>
          <FieldLabel>Pares clave/valor</FieldLabel>
          <div className="space-y-2">
            {pairs.map((p, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <TextInput
                  placeholder="Clave"
                  value={p.key}
                  onChange={(e) => update(i, "key", e.target.value)}
                />
                <TextInput
                  placeholder="Valor"
                  value={p.value}
                  onChange={(e) => update(i, "value", e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => del(i)}
                  className="rounded-full bg-red-600/80 px-3 py-1 text-xs text-white hover:bg-red-600"
                  title="Quitar fila"
                >
                  Quitar
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={add}
              className="rounded-full bg-sky-100 px-3 py-1 text-xs text-sky-900 hover:opacity-90 dark:bg-white/10 dark:text-white"
              title="Agregar par"
            >
              + Agregar par
            </button>
          </div>
        </div>
      );
    }

    case "twoColumns":
      return (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <FieldLabel>Columna izquierda</FieldLabel>
            <TextArea
              rows={3}
              placeholder="Escribir…"
              value={
                (v as Extract<BlockFormValue, { type: "twoColumns" }>).left ??
                ""
              }
              onChange={(e) => onPatch({ left: e.target.value })}
            />
          </div>
          <div>
            <FieldLabel>Columna derecha</FieldLabel>
            <TextArea
              rows={3}
              placeholder="Escribir…"
              value={
                (v as Extract<BlockFormValue, { type: "twoColumns" }>).right ??
                ""
              }
              onChange={(e) => onPatch({ right: e.target.value })}
            />
          </div>
        </div>
      );

    case "threeColumns":
      return (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <FieldLabel>Izquierda</FieldLabel>
            <TextArea
              rows={3}
              placeholder="Escribir…"
              value={
                (v as Extract<BlockFormValue, { type: "threeColumns" }>).left ??
                ""
              }
              onChange={(e) => onPatch({ left: e.target.value })}
            />
          </div>
          <div>
            <FieldLabel>Centro</FieldLabel>
            <TextArea
              rows={3}
              placeholder="Escribir…"
              value={
                (v as Extract<BlockFormValue, { type: "threeColumns" }>)
                  .center ?? ""
              }
              onChange={(e) => onPatch({ center: e.target.value })}
            />
          </div>
          <div>
            <FieldLabel>Derecha</FieldLabel>
            <TextArea
              rows={3}
              placeholder="Escribir…"
              value={
                (v as Extract<BlockFormValue, { type: "threeColumns" }>)
                  .right ?? ""
              }
              onChange={(e) => onPatch({ right: e.target.value })}
            />
          </div>
        </div>
      );
  }
}
