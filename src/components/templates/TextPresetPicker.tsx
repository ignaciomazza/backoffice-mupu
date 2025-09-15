// src/components/templates/TextPresetPicker.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Spinner from "@/components/Spinner";
import { toast } from "react-toastify";
import { authFetch } from "@/utils/authFetch";

/* =========================
 * Tipos
 * ======================= */
export type DocType = "quote" | "confirmation";

export type TextPreset = {
  id_preset: number;
  title: string;
  content: string; // legacy
  doc_type: DocType | string; // admitimos string por compatibilidad remota
  data?: unknown; // JSON (nuevo)
  created_at: string;
};

type DataPresetEnvelope = {
  version: number;
  kind: "data";
  data: { blocks: unknown };
};

type Props = {
  token: string | null;
  docType: DocType;
  onApply: (content: string) => void; // legacy
  onApplyData?: (blocks: unknown) => void; // NUEVO: aplica JSON de bloques
  refreshSignal?: number;
};

/* =========================
 * Helpers
 * ======================= */
const LS_VIEW = "textpresets:view";
const LS_PIN = (doc: DocType) => `textpresets:pins:${doc}`;

function isTextPreset(x: unknown): x is TextPreset {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id_preset === "number" &&
    typeof o.title === "string" &&
    typeof o.content === "string" &&
    typeof o.created_at === "string" &&
    typeof o.doc_type === "string"
  );
}

function parseTextPresetArray(x: unknown): TextPreset[] {
  if (!Array.isArray(x)) return [];
  return x.filter(isTextPreset);
}

function isDataEnvelope(x: unknown): x is DataPresetEnvelope {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    o.kind === "data" &&
    typeof (o as { kind?: unknown }).kind === "string" &&
    typeof (o as { version?: unknown }).version !== "undefined" &&
    typeof (o as { data?: unknown }).data === "object" &&
    o !== null
  );
}

/* =========================
 * Componente
 * ======================= */
export default function TextPresetPicker({
  token,
  docType,
  onApply,
  onApplyData,
  refreshSignal = 0,
}: Props) {
  const [loading, setLoading] = useState<boolean>(false);
  const [presets, setPresets] = useState<TextPreset[]>([]);
  const [q, setQ] = useState<string>("");
  const [view, setView] = useState<"compact" | "grid">("compact");
  const [showAll, setShowAll] = useState<boolean>(false);

  // favoritos
  const [pinned, setPinned] = useState<number[]>([]);

  // cargar prefs iniciales
  useEffect(() => {
    const v =
      (localStorage.getItem(LS_VIEW) as "compact" | "grid") || "compact";
    setView(v);

    const pinsRaw = localStorage.getItem(LS_PIN(docType));
    try {
      const parsed: unknown = pinsRaw ? JSON.parse(pinsRaw) : [];
      setPinned(
        Array.isArray(parsed)
          ? parsed.filter((n): n is number => typeof n === "number")
          : [],
      );
    } catch {
      setPinned([]);
    }
  }, [docType]);

  // fetch presets
  useEffect(() => {
    let abort = false;
    (async () => {
      if (!token) return;
      try {
        setLoading(true);
        const res = await authFetch(
          `/api/text-preset?doc_type=${docType}&take=200`,
          {},
          token,
        );
        if (!res.ok) {
          throw new Error("No se pudieron cargar los presets");
        }
        const data: unknown = await res.json();

        // La API puede devolver { items, nextCursor } o un array directo (compat)
        const items: TextPreset[] = Array.isArray(
          (data as { items?: unknown }).items,
        )
          ? parseTextPresetArray((data as { items: unknown }).items)
          : parseTextPresetArray(data);

        if (!abort) setPresets(items);
      } catch (e: unknown) {
        if (!abort)
          toast.error(e instanceof Error ? e.message : "Error inesperado");
      } finally {
        if (!abort) setLoading(false);
      }
    })();
    return () => {
      abort = true;
    };
  }, [token, docType, refreshSignal]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const arr = !t
      ? presets
      : presets.filter(
          (p) =>
            p.title.toLowerCase().includes(t) ||
            p.content.toLowerCase().includes(t),
        );
    // ordenar: favoritos primero, luego fecha desc, y dentro por título
    const pinSet = new Set(pinned);
    return [...arr].sort((a, b) => {
      const ap = pinSet.has(a.id_preset) ? 1 : 0;
      const bp = pinSet.has(b.id_preset) ? 1 : 0;
      if (ap !== bp) return bp - ap;
      const ad = new Date(a.created_at).getTime();
      const bd = new Date(b.created_at).getTime();
      if (bd !== ad) return bd - ad;
      return a.title.localeCompare(b.title);
    });
  }, [q, presets, pinned]);

  const visible = useMemo(() => {
    if (q.trim()) return filtered;
    if (showAll) return filtered;
    return filtered.slice(0, 6);
  }, [filtered, q, showAll]);

  const toggleView = () => {
    const v = view === "compact" ? "grid" : "compact";
    setView(v);
    localStorage.setItem(LS_VIEW, v);
  };

  const togglePin = (id: number) => {
    setPinned((prev) => {
      const has = prev.includes(id);
      const next = has ? prev.filter((x) => x !== id) : [id, ...prev];
      localStorage.setItem(LS_PIN(docType), JSON.stringify(next));
      return next;
    });
  };

  const askDelete = async (p: TextPreset) => {
    try {
      if (!token) {
        toast.error("No hay token.");
        return;
      }
      const ok = window.confirm(`¿Eliminar preset "${p.title}"?`);
      if (!ok) return;

      const res = await authFetch(
        `/api/text-preset/${p.id_preset}`,
        { method: "DELETE" },
        token,
      );
      if (!res.ok) {
        let apiMsg = "No se pudo eliminar el preset.";
        try {
          const j: unknown = await res.json();
          if (
            typeof j === "object" &&
            j !== null &&
            "error" in j &&
            typeof (j as { error?: unknown }).error === "string"
          ) {
            apiMsg = (j as { error: string }).error;
          }
        } catch {
          // noop
        }
        throw new Error(apiMsg);
      }

      toast.success("Preset eliminado.");
      setPresets((prev) => prev.filter((x) => x.id_preset !== p.id_preset));
      setPinned((prev) => {
        const next = prev.filter((idNum) => idNum !== p.id_preset);
        localStorage.setItem(LS_PIN(docType), JSON.stringify(next));
        return next;
      });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error eliminando preset.");
    }
  };

  const handleUse = (p: TextPreset) => {
    // Si hay JSON con bloques y el padre soporta onApplyData, priorizar eso
    if (onApplyData && p.data && isDataEnvelope(p.data)) {
      const blocks = (p.data as DataPresetEnvelope).data?.blocks;
      if (typeof blocks !== "undefined") {
        onApplyData(blocks);
        return;
      }
    }
    // Fallback: legacy content (texto)
    onApply(p.content);
  };

  const Item = ({ p }: { p: TextPreset }) => (
    <div
      className={`group relative rounded-2xl border border-white/10 bg-white/10 p-3 text-left transition-colors hover:bg-white/20 dark:text-white ${
        view === "grid" ? "" : "flex items-center justify-between gap-3"
      }`}
      title={p.title}
    >
      <div
        className={`${view === "grid" ? "" : "min-w-0 flex-1"} cursor-pointer`}
        onClick={() => handleUse(p)}
      >
        <div className="mb-1 flex items-center gap-2">
          <div className="truncate text-sm font-medium">{p.title}</div>
          {pinned.includes(p.id_preset) && (
            <span className="rounded-full bg-yellow-200/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-yellow-900 dark:bg-yellow-400/20 dark:text-yellow-200">
              fav
            </span>
          )}
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide opacity-70">
            {String(p.doc_type)}
          </span>
        </div>
        <div
          className={`whitespace-pre-wrap text-xs opacity-70 ${
            view === "grid" ? "line-clamp-2" : "truncate"
          }`}
        >
          {p.content}
        </div>
      </div>

      {/* acciones */}
      <div className="mt-2 flex shrink-0 items-center gap-1 self-start">
        <button
          type="button"
          onClick={() => handleUse(p)}
          className="rounded-full px-2 py-1 text-xs opacity-80 hover:bg-white/20"
          title="Usar"
        >
          Usar
        </button>
        <button
          type="button"
          onClick={() => askDelete(p)}
          className="rounded-full px-2 py-1 text-xs text-red-600 opacity-80 hover:bg-red-500/10 dark:text-red-400"
          title="Eliminar"
        >
          Eliminar
        </button>
        <button
          type="button"
          onClick={() => togglePin(p.id_preset)}
          className="rounded-full px-2 py-1 text-xs opacity-80 hover:bg-white/20"
          title={
            pinned.includes(p.id_preset) ? "Quitar favorito" : "Marcar favorito"
          }
        >
          {pinned.includes(p.id_preset) ? "★" : "☆"}
        </button>
      </div>
    </div>
  );

  const onSearchChange = (ev: React.ChangeEvent<HTMLInputElement>) =>
    setQ(ev.target.value);

  return (
    <div className="mb-4 space-y-2">
      {/* header */}
      <div className="flex items-center justify-between">
        <p className="ml-1 text-xs font-semibold uppercase tracking-wide opacity-70">
          Presets ({docType === "quote" ? "Cotización" : "Confirmación"})
        </p>
        <div className="flex items-center gap-2">
          <input
            className="w-56 rounded-2xl border border-white/10 bg-white/10 p-2 px-3 text-sm outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:text-white"
            placeholder="Buscar…"
            value={q}
            onChange={onSearchChange}
          />
          <button
            type="button"
            onClick={toggleView}
            className="rounded-full bg-white/10 px-3 py-1 text-xs opacity-80 hover:bg-white/20"
            title={view === "compact" ? "Ver en grilla" : "Ver compacto"}
          >
            {view === "compact" ? "Grilla" : "Compacto"}
          </button>
        </div>
      </div>

      {/* list */}
      {loading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 p-3">
          <Spinner /> <span className="text-sm opacity-80">Cargando…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-3 text-sm opacity-80">
          No hay presets para este tipo de documento.
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {visible.map((p) => (
            <Item key={p.id_preset} p={p} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((p) => (
            <Item key={p.id_preset} p={p} />
          ))}
        </div>
      )}

      {/* ver más / menos (solo si no hay búsqueda) */}
      {!q.trim() && filtered.length > 6 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="rounded-full bg-white/10 px-3 py-1 text-xs opacity-80 hover:bg-white/20"
          >
            {showAll ? "Ver menos" : `Ver todos (${filtered.length})`}
          </button>
        </div>
      )}
    </div>
  );
}
