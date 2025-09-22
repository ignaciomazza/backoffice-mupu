// src/components/templates/BlocksCanvas.tsx
"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  forwardRef,
} from "react";
import type { OrderedBlock, BlockFormValue } from "@/types/templates";
import type { BlocksCanvasProps, CanvasOptions } from "./TemplateEditor";

/* ============================================================================
 * Utils
 * ========================================================================== */

const cx = (...c: Array<string | false | null | undefined>) =>
  c.filter(Boolean).join(" ");

const WS_PRESERVE: React.CSSProperties = {
  whiteSpace: "break-spaces",
  tabSize: 4,
};

function wsFor(multiline: boolean): React.CSSProperties {
  // Para single-line (título, subtítulo) evitamos break-spaces
  return multiline ? WS_PRESERVE : { whiteSpace: "pre-wrap", tabSize: 4 };
}

/** Normaliza saltos/espacios problemáticos */
function sanitizeText(raw: string): string {
  let s = raw ?? "";
  s = s.replace(/\r\n?/g, "\n");
  s = s.replace(/\u2028|\u2029/g, "\n");
  s = s.replace(/\u00A0/g, " ");
  s = s.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "");
  return s;
}

function placeCaretAtEnd(el: HTMLElement) {
  try {
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection?.();
    sel?.removeAllRanges();
    sel?.addRange(range);
  } catch {}
}

/* ============================================================================
 * Tipos + patchValue
 * ========================================================================== */

type HeadingV = Extract<BlockFormValue, { type: "heading" }>;
type SubtitleV = Extract<BlockFormValue, { type: "subtitle" }>;
type ParagraphV = Extract<BlockFormValue, { type: "paragraph" }>;
type ListV = Extract<BlockFormValue, { type: "list" }>;
type KeyValueV = Extract<BlockFormValue, { type: "keyValue" }>;
type TwoColsV = Extract<BlockFormValue, { type: "twoColumns" }>;
type ThreeColsV = Extract<BlockFormValue, { type: "threeColumns" }>;

function patchValueForTypeLocal(
  b: OrderedBlock,
  patch:
    | Partial<HeadingV>
    | Partial<SubtitleV>
    | Partial<ParagraphV>
    | Partial<ListV>
    | Partial<KeyValueV>
    | Partial<TwoColsV>
    | Partial<ThreeColsV>,
): BlockFormValue {
  const existing = b.value;
  switch (b.type) {
    case "heading": {
      const ex: HeadingV = (existing as HeadingV) ?? {
        type: "heading",
        text: "",
        level: 1,
      };
      return {
        type: "heading",
        text: ex.text ?? "",
        level: 1,
        ...(patch as Partial<HeadingV>),
      };
    }
    case "subtitle": {
      const ex: SubtitleV = (existing as SubtitleV) ?? {
        type: "subtitle",
        text: "",
      };
      return {
        type: "subtitle",
        text: ex.text ?? "",
        ...(patch as Partial<SubtitleV>),
      };
    }
    case "paragraph": {
      const ex: ParagraphV = (existing as ParagraphV) ?? {
        type: "paragraph",
        text: "",
      };
      return {
        type: "paragraph",
        text: ex.text ?? "",
        ...(patch as Partial<ParagraphV>),
      };
    }
    case "list": {
      const ex: ListV = (existing as ListV) ?? { type: "list", items: [] };
      return {
        type: "list",
        items: Array.isArray(ex.items) ? ex.items : [],
        ...(patch as Partial<ListV>),
      };
    }
    case "keyValue": {
      const ex: KeyValueV = (existing as KeyValueV) ?? {
        type: "keyValue",
        pairs: [],
      };
      return {
        type: "keyValue",
        pairs: Array.isArray(ex.pairs) ? ex.pairs : [],
        ...(patch as Partial<KeyValueV>),
      };
    }
    case "twoColumns": {
      const ex: TwoColsV = (existing as TwoColsV) ?? {
        type: "twoColumns",
        left: "",
        right: "",
      };
      return {
        type: "twoColumns",
        left: ex.left ?? "",
        right: ex.right ?? "",
        ...(patch as Partial<TwoColsV>),
      };
    }
    case "threeColumns": {
      const ex: ThreeColsV = (existing as ThreeColsV) ?? {
        type: "threeColumns",
        left: "",
        center: "",
        right: "",
      };
      return {
        type: "threeColumns",
        left: ex.left ?? "",
        center: ex.center ?? "",
        right: ex.right ?? "",
        ...(patch as Partial<ThreeColsV>),
      };
    }
  }
}

/* ============================================================================
 * Editable (semi-controlado)
 * ========================================================================== */

type EditableProps = {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  placeholder?: string;
  readOnly?: boolean;
  multiline?: boolean; // default true
  style?: React.CSSProperties;
  "data-testid"?: string;

  onEnter?: () => void;
  onShiftEnter?: () => void;
  onBackspaceEmpty?: () => void;
  onArrowUpAtStart?: () => void;
  onArrowDownAtEnd?: () => void;
};

const EditableText = forwardRef<HTMLDivElement, EditableProps>(
  (
    {
      value,
      onChange,
      className,
      placeholder,
      readOnly,
      multiline = true,
      style,
      "data-testid": testId,
      onEnter,
      onShiftEnter,
      onBackspaceEmpty,
      onArrowUpAtStart,
      onArrowDownAtEnd,
    },
    ref,
  ) => {
    const localRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      const el = localRef.current;
      if (!el) return;
      const domText = sanitizeText(el.innerText || "");
      if (domText !== value) el.innerText = value || "";
    }, [value]);

    const setRefs = (el: HTMLDivElement | null): void => {
      localRef.current = el;
      if (typeof ref === "function") {
        ref(el);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
      }
    };

    const handleInput: React.FormEventHandler<HTMLDivElement> = (e) => {
      if (readOnly) return;
      let raw = (e.currentTarget.innerText ?? "").toString();
      if (!multiline) raw = raw.replace(/\n+/g, " "); // fuerza single-line
      onChange(sanitizeText(raw));
    };

    const handlePaste: React.ClipboardEventHandler<HTMLDivElement> = (e) => {
      if (readOnly) return;
      e.preventDefault();
      let text = e.clipboardData.getData("text/plain") || "";
      if (!multiline) text = text.replace(/\s*\n+\s*/g, " ");
      document.execCommand("insertText", false, sanitizeText(text));
    };

    const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
      const el = localRef.current!;
      if (!el) return;

      if (e.key === "Enter") {
        if (e.shiftKey && onShiftEnter) {
          e.preventDefault();
          onShiftEnter();
          return;
        }
        if (!multiline || onEnter) {
          e.preventDefault();
          onEnter?.();
          return;
        }
        // default multiline
        e.preventDefault();
        document.execCommand?.("insertText", false, "\n");
        return;
      }

      if (e.key === "Backspace" && onBackspaceEmpty) {
        if ((el.innerText || "").trim().length === 0) {
          e.preventDefault();
          onBackspaceEmpty();
          return;
        }
      }

      if (e.key === "ArrowUp" && onArrowUpAtStart) {
        const atStart =
          (window.getSelection?.()?.getRangeAt(0)?.startOffset ?? 0) === 0;
        if (atStart) {
          e.preventDefault();
          onArrowUpAtStart();
          return;
        }
      }
      if (e.key === "ArrowDown" && onArrowDownAtEnd) {
        const len = (el.innerText || "").length;
        const sel = window.getSelection?.();
        const end =
          !!sel && sel.rangeCount > 0 && sel.getRangeAt(0).endOffset === len;
        if (end) {
          e.preventDefault();
          onArrowDownAtEnd();
          return;
        }
      }

      if (e.key === "Tab") {
        e.preventDefault();
        document.execCommand("insertText", false, "\t");
      }
    };

    const showGhost = !value.trim();
    const wsStyle = wsFor(!!multiline);

    return (
      <div className="focus-within:ring-current/20 relative -mx-1 block w-full rounded-lg px-1 ring-0 transition focus-within:ring-2">
        {showGhost && placeholder ? (
          <div
            className={cx(
              "pointer-events-none absolute inset-0 select-none opacity-40",
              className,
            )}
            style={{ ...style, ...wsStyle }}
          >
            {placeholder}
          </div>
        ) : null}

        <div
          ref={setRefs}
          data-testid={testId}
          role="textbox"
          contentEditable={!readOnly}
          suppressContentEditableWarning
          className={cx(
            "block w-full outline-none",
            multiline ? "min-h-[1.6em]" : "min-h-[1.4em]",
            className,
          )}
          style={{ ...style, ...wsStyle }}
          onInput={handleInput}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          spellCheck
        />
      </div>
    );
  },
);
EditableText.displayName = "EditableText";

/* ============================================================================
 * Block wrapper (drag & actions)
 * ========================================================================== */

type BlockShellProps = {
  children: React.ReactNode;
  idx: number;
  onDragMove: (from: number, to: number) => void;
  onRemove?: () => void;
  canEdit: boolean;
  canRemove: boolean;
  accentColor: string;
  dividerColor: string;
};

const BlockShell: React.FC<BlockShellProps> = ({
  children,
  idx,
  onDragMove,
  onRemove,
  canEdit,
  canRemove,
  accentColor,
  dividerColor,
}) => {
  const [over, setOver] = useState<"none" | "top" | "bottom">("none");

  const handleDragStart: React.DragEventHandler<HTMLSpanElement> = (e) => {
    e.dataTransfer.setData("text/plain", String(idx));
    const img = document.createElement("canvas");
    img.width = img.height = 1;
    e.dataTransfer.setDragImage(img, 0, 0);
  };

  const handleDragOver: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    setOver(y < rect.height / 2 ? "top" : "bottom");
  };

  const clearOver = () => setOver("none");

  const handleDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const from = Number(e.dataTransfer.getData("text/plain"));
    const to = idx + (over === "bottom" ? 1 : 0);
    clearOver();
    if (!Number.isNaN(from)) onDragMove(from, to);
  };

  return (
    <div
      className="group relative"
      onDragOver={handleDragOver}
      onDragLeave={clearOver}
      onDrop={handleDrop}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-[-3px] h-[3px] opacity-0 transition-opacity"
        style={{
          backgroundColor: accentColor,
          opacity: over === "top" ? 0.9 : 0,
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-[-3px] h-[3px] opacity-0 transition-opacity"
        style={{
          backgroundColor: accentColor,
          opacity: over === "bottom" ? 0.9 : 0,
        }}
      />

      <div className="absolute -right-2 -top-2 z-10 hidden items-center gap-1 rounded-full bg-black/30 p-1 text-white backdrop-blur-sm group-focus-within:flex group-hover:flex">
        <span
          className="cursor-grab rounded-full px-2 py-1 text-xs opacity-90"
          title="Arrastrar para mover"
          draggable
          onDragStart={handleDragStart}
        >
          ⋮⋮
        </span>
        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-full bg-red-600/80 px-2 py-1 text-xs hover:bg-red-600"
            title="Quitar bloque"
          >
            Eliminar
          </button>
        ) : (
          <span
            className="rounded-full bg-white/20 px-2 py-1 text-[10px] uppercase tracking-wide opacity-80"
            title={
              canEdit
                ? "Bloque fijo: no se puede eliminar"
                : "Bloque fijo: no editable"
            }
          >
            fijo
          </span>
        )}
      </div>

      <div
        className="rounded-xl px-3 py-2 transition-colors hover:bg-white/5"
        style={{ border: `1px solid ${dividerColor}` }}
      >
        {children}
      </div>
    </div>
  );
};

/* ============================================================================
 * Render por tipo
 * ========================================================================== */

function HeadingEditor({
  b,
  onPatch,
  options,
  readOnly,
}: {
  b: OrderedBlock;
  onPatch: (patch: Partial<BlockFormValue>) => void;
  options: CanvasOptions;
  readOnly: boolean;
}) {
  const hv = (b.value as HeadingV) ?? { type: "heading", text: "", level: 1 };
  const size = "text-2xl";

  return (
    <div className="flex items-start gap-2">
      <EditableText
        value={hv.text ?? ""}
        onChange={(text) => onPatch({ text, level: 1 })}
        className={cx(size, "py-1 leading-snug")}
        placeholder="Escribí el título…"
        readOnly={readOnly}
        multiline={false}
        style={{
          fontFamily: options.headingFont,
          fontWeight: options.headingWeight,
        }}
      />
    </div>
  );
}

function SubtitleEditor({
  b,
  onPatch,
  readOnly,
}: {
  b: OrderedBlock;
  onPatch: (patch: Partial<BlockFormValue>) => void;
  readOnly: boolean;
}) {
  const sv = (b.value as SubtitleV) ?? { type: "subtitle", text: "" };
  return (
    <EditableText
      value={sv.text ?? ""}
      onChange={(text) => onPatch({ text })}
      className="text-lg font-medium opacity-95"
      placeholder="Escribí el subtítulo…"
      readOnly={readOnly}
      multiline={false}
    />
  );
}

function ParagraphEditor({
  b,
  onPatch,
  readOnly,
}: {
  b: OrderedBlock;
  onPatch: (patch: Partial<BlockFormValue>) => void;
  readOnly: boolean;
}) {
  const pv = (b.value as ParagraphV) ?? { type: "paragraph", text: "" };
  return (
    <EditableText
      value={pv.text ?? ""}
      onChange={(text) => onPatch({ text })}
      className="leading-relaxed"
      placeholder="Párrafo… (Enter para salto de línea, Tab para tabular)"
      readOnly={readOnly}
      multiline
      onShiftEnter={() => document.execCommand?.("insertText", false, "\n")}
    />
  );
}

/* ===== Lista =============================================================== */

function ListEditor({
  b,
  onPatch,
  options,
  readOnly,
}: {
  b: OrderedBlock;
  onPatch: (patch: Partial<BlockFormValue>) => void;
  options: CanvasOptions;
  readOnly: boolean;
}) {
  const lv = (b.value as ListV) ?? { type: "list", items: [] };
  const items: string[] = Array.isArray(lv.items) ? lv.items : [];

  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const setItemRef =
    (i: number) =>
    (el: HTMLDivElement | null): void => {
      itemRefs.current[i] = el;
    };
  const focusItem = (i: number) => {
    const el = itemRefs.current[i];
    if (el) {
      placeCaretAtEnd(el);
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  };

  const update = (i: number, next: string) => {
    const arr = [...items];
    arr[i] = next;
    onPatch({ items: arr });
  };

  const addAt = (index: number) => {
    const arr = [...items];
    arr.splice(index, 0, "");
    onPatch({ items: arr });
    requestAnimationFrame(() => focusItem(index));
  };
  const addEnd = () => addAt(items.length);

  const delAt = (i: number) => {
    const arr = items.filter((_, idx) => idx !== i);
    onPatch({ items: arr });
    const to = Math.max(0, i - 1);
    requestAnimationFrame(() => focusItem(to));
  };

  const move = (from: number, dir: -1 | 1) => {
    const to = from + dir;
    if (to < 0 || to >= items.length) return;
    const arr = [...items];
    const [it] = arr.splice(from, 1);
    arr.splice(to, 0, it);
    onPatch({ items: arr });
    requestAnimationFrame(() => focusItem(to));
  };

  return (
    <ul className={cx("list-inside list-disc", options.listSpaceClass)}>
      {items.map((it, i) => (
        <li key={i}>
          <div className="flex items-start gap-2">
            <EditableText
              ref={setItemRef(i)}
              value={it}
              onChange={(t) => update(i, t)}
              className="flex-1"
              placeholder={`Ítem ${i + 1}`}
              readOnly={readOnly}
              multiline={false}
              onEnter={() => !readOnly && addAt(i + 1)}
              onShiftEnter={() =>
                !readOnly && document.execCommand?.("insertText", false, "\n")
              }
              onBackspaceEmpty={() => !readOnly && delAt(i)}
            />
            {!readOnly && (
              <div className="flex items-center gap-1 pt-1">
                <button
                  className="rounded-full bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
                  onClick={() => move(i, -1)}
                  title="Subir"
                >
                  ↑
                </button>
                <button
                  className="rounded-full bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
                  onClick={() => move(i, 1)}
                  title="Bajar"
                >
                  ↓
                </button>
                <button
                  className="rounded-full bg-red-600/80 px-2 py-1 text-xs text-white hover:bg-red-600"
                  onClick={() => delAt(i)}
                  title="Quitar ítem"
                >
                  Quitar
                </button>
              </div>
            )}
          </div>
        </li>
      ))}
      {!readOnly && (
        <li>
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              className="rounded-full bg-sky-100 px-2 py-1 text-xs text-sky-900 hover:opacity-90 dark:bg-white/10 dark:text-white"
              onClick={addEnd}
              title="Agregar ítem"
            >
              + Agregar ítem
            </button>
            <span className="text-[11px] opacity-60">
              Enter = nuevo • Shift+Enter = salto • Backspace vacío = borrar
            </span>
          </div>
        </li>
      )}
    </ul>
  );
}

/* ===== Clave/Valor ========================================================= */

function KeyValueEditor({
  b,
  onPatch,
  readOnly,
  panelBg,
  innerRadiusClass,
}: {
  b: OrderedBlock;
  onPatch: (patch: Partial<BlockFormValue>) => void;
  readOnly: boolean;
  panelBg: string;
  innerRadiusClass: string;
}) {
  const kv = (b.value as KeyValueV) ?? { type: "keyValue", pairs: [] };
  const pairs: Array<{ key: string; value: string }> = Array.isArray(kv.pairs)
    ? kv.pairs
    : [];

  const keyRefs = useRef<Array<HTMLDivElement | null>>([]);
  const valRefs = useRef<Array<HTMLDivElement | null>>([]);

  const setKeyRef =
    (i: number) =>
    (el: HTMLDivElement | null): void => {
      keyRefs.current[i] = el;
    };
  const setValRef =
    (i: number) =>
    (el: HTMLDivElement | null): void => {
      valRefs.current[i] = el;
    };

  const focusKey = (i: number) => {
    const el = keyRefs.current[i];
    if (el) placeCaretAtEnd(el);
  };
  const focusVal = (i: number) => {
    const el = valRefs.current[i];
    if (el) placeCaretAtEnd(el);
  };

  const update = (i: number, field: "key" | "value", next: string) => {
    const arr = [...pairs];
    arr[i] = { ...arr[i], [field]: next };
    onPatch({ pairs: arr });
  };

  const addAt = (index: number) => {
    const arr = [...pairs];
    arr.splice(index, 0, { key: "", value: "" });
    onPatch({ pairs: arr });
    requestAnimationFrame(() => focusKey(index));
  };
  const addEnd = () => addAt(pairs.length);

  const delAt = (i: number) => {
    const arr = pairs.filter((_, idx) => idx !== i);
    onPatch({ pairs: arr });
    const to = Math.max(0, i - 1);
    requestAnimationFrame(() => focusVal(to));
  };

  return (
    <div className="grid gap-2">
      {pairs.map((p, i) => (
        <div
          key={i}
          className={cx(
            "grid grid-cols-[1fr_1fr_auto] items-start gap-2",
            innerRadiusClass,
            "p-2",
          )}
          style={{ backgroundColor: panelBg }}
        >
          <EditableText
            ref={setKeyRef(i)}
            value={p.key}
            onChange={(t) => update(i, "key", t)}
            placeholder="Clave"
            readOnly={readOnly}
            multiline={false}
            onEnter={() => !readOnly && focusVal(i)}
            onBackspaceEmpty={() => {
              if (readOnly) return;
              if (!p.key.trim() && !p.value.trim()) delAt(i);
            }}
          />
          <EditableText
            ref={setValRef(i)}
            value={p.value}
            onChange={(t) => update(i, "value", t)}
            placeholder="Valor"
            readOnly={readOnly}
            multiline={false}
            onEnter={() => !readOnly && addAt(i + 1)}
            onShiftEnter={() =>
              !readOnly && document.execCommand?.("insertText", false, "\n")
            }
            onBackspaceEmpty={() => {
              if (readOnly) return;
              if (!p.value.trim() && !p.key.trim()) delAt(i);
            }}
          />
          {!readOnly && (
            <div className="flex items-center gap-1 pt-1">
              <button
                className="rounded-full bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
                onClick={() => addAt(i + 1)}
                title="Agregar debajo"
              >
                + Fila
              </button>
              <button
                className="rounded-full bg-red-600/80 px-2 py-1 text-xs text-white hover:bg-red-600"
                onClick={() => delAt(i)}
                title="Quitar fila"
              >
                Quitar
              </button>
            </div>
          )}
        </div>
      ))}
      {!readOnly && (
        <div className="flex items-center gap-2">
          <button
            className="w-max rounded-full bg-sky-100 px-3 py-1 text-xs text-sky-900 hover:opacity-90 dark:bg-white/10 dark:text-white"
            onClick={addEnd}
            title="Agregar fila"
          >
            + Agregar fila
          </button>
          <span className="text-[11px] opacity-60">
            Enter (clave→valor / valor→nueva) • Shift+Enter = salto • Backspace
            vacío = borrar
          </span>
        </div>
      )}
    </div>
  );
}

/* ===== Dos y Tres columnas ================================================= */

function TwoColsEditor({
  b,
  onPatch,
  readOnly,
  panelBg,
  innerRadiusClass,
  options,
}: {
  b: OrderedBlock;
  onPatch: (patch: Partial<BlockFormValue>) => void;
  readOnly: boolean;
  panelBg: string;
  innerRadiusClass: string;
  options: CanvasOptions;
}) {
  const tv = (b.value as TwoColsV) ?? {
    type: "twoColumns",
    left: "",
    right: "",
  };
  return (
    <div className={cx("grid md:grid-cols-2", options.gapGridClass)}>
      <div
        className={cx("p-3", innerRadiusClass)}
        style={{ backgroundColor: panelBg }}
      >
        <EditableText
          value={tv.left ?? ""}
          onChange={(left) => onPatch({ left })}
          placeholder="Columna izquierda…"
          readOnly={readOnly}
        />
      </div>
      <div
        className={cx("p-3", innerRadiusClass)}
        style={{ backgroundColor: panelBg }}
      >
        <EditableText
          value={tv.right ?? ""}
          onChange={(right) => onPatch({ right })}
          placeholder="Columna derecha…"
          readOnly={readOnly}
        />
      </div>
    </div>
  );
}

function ThreeColsEditor({
  b,
  onPatch,
  readOnly,
  panelBg,
  innerRadiusClass,
  options,
}: {
  b: OrderedBlock;
  onPatch: (patch: Partial<BlockFormValue>) => void;
  readOnly: boolean;
  panelBg: string;
  innerRadiusClass: string;
  options: CanvasOptions;
}) {
  const tv = (b.value as ThreeColsV) ?? {
    type: "threeColumns",
    left: "",
    center: "",
    right: "",
  };
  return (
    <div className={cx("grid md:grid-cols-3", options.gapGridClass)}>
      <div
        className={cx("p-3", innerRadiusClass)}
        style={{ backgroundColor: panelBg }}
      >
        <EditableText
          value={tv.left ?? ""}
          onChange={(left) => onPatch({ left })}
          placeholder="Izquierda…"
          readOnly={readOnly}
        />
      </div>
      <div
        className={cx("p-3", innerRadiusClass)}
        style={{ backgroundColor: panelBg }}
      >
        <EditableText
          value={tv.center ?? ""}
          onChange={(center) => onPatch({ center })}
          placeholder="Centro…"
          readOnly={readOnly}
        />
      </div>
      <div
        className={cx("p-3", innerRadiusClass)}
        style={{ backgroundColor: panelBg }}
      >
        <EditableText
          value={tv.right ?? ""}
          onChange={(right) => onPatch({ right })}
          placeholder="Derecha…"
          readOnly={readOnly}
        />
      </div>
    </div>
  );
}

/* ============================================================================
 * Main
 * ========================================================================== */

const BlocksCanvas: React.FC<BlocksCanvasProps> = ({
  blocks,
  onChange,
  lockedIds,
  options,
}) => {
  const move = useCallback(
    (from: number, to: number) => {
      if (from === to || from < 0 || from >= blocks.length) return;
      const safeTo = Math.max(0, Math.min(blocks.length, to));
      const arr = [...blocks];
      const [it] = arr.splice(from, 1);
      arr.splice(safeTo > from ? safeTo - 1 : safeTo, 0, it);
      onChange(arr);
    },
    [blocks, onChange],
  );

  const remove = useCallback(
    (id: string) => {
      const b = blocks.find((x) => x.id === id);
      if (!b || lockedIds.has(id)) return;
      onChange(blocks.filter((x) => x.id !== id));
    },
    [blocks, lockedIds, onChange],
  );

  const patchBlock = useCallback(
    (id: string, patch: Partial<BlockFormValue>) => {
      const next = blocks.map((b) =>
        b.id === id ? { ...b, value: patchValueForTypeLocal(b, patch) } : b,
      );
      onChange(next);
    },
    [blocks, onChange],
  );

  return (
    <div className="space-y-3">
      {blocks.map((b, idx) => {
        const readOnly = lockedIds.has(b.id);
        const canRemove = !readOnly;

        return (
          <BlockShell
            key={b.id}
            idx={idx}
            onDragMove={move}
            onRemove={() => remove(b.id)}
            canEdit={!readOnly}
            canRemove={canRemove}
            accentColor={options.accentColor}
            dividerColor={options.dividerColor}
          >
            {b.type === "heading" && (
              <HeadingEditor
                b={b}
                onPatch={(p) => patchBlock(b.id, p)}
                readOnly={readOnly}
                options={options}
              />
            )}
            {b.type === "subtitle" && (
              <SubtitleEditor
                b={b}
                onPatch={(p) => patchBlock(b.id, p)}
                readOnly={readOnly}
              />
            )}
            {b.type === "paragraph" && (
              <ParagraphEditor
                b={b}
                onPatch={(p) => patchBlock(b.id, p)}
                readOnly={readOnly}
              />
            )}
            {b.type === "list" && (
              <ListEditor
                b={b}
                onPatch={(p) => patchBlock(b.id, p)}
                options={options}
                readOnly={readOnly}
              />
            )}
            {b.type === "keyValue" && (
              <KeyValueEditor
                b={b}
                onPatch={(p) => patchBlock(b.id, p)}
                readOnly={readOnly}
                panelBg={options.panelBgStrong}
                innerRadiusClass={options.innerRadiusClass}
              />
            )}
            {b.type === "twoColumns" && (
              <TwoColsEditor
                b={b}
                onPatch={(p) => patchBlock(b.id, p)}
                readOnly={readOnly}
                panelBg={options.panelBgStrong}
                innerRadiusClass={options.innerRadiusClass}
                options={options}
              />
            )}
            {b.type === "threeColumns" && (
              <ThreeColsEditor
                b={b}
                onPatch={(p) => patchBlock(b.id, p)}
                readOnly={readOnly}
                panelBg={options.panelBgStrong}
                innerRadiusClass={options.innerRadiusClass}
                options={options}
              />
            )}
          </BlockShell>
        );
      })}
    </div>
  );
};

export default BlocksCanvas;
