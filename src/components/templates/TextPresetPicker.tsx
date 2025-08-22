// src/components/templates/TextPresetPicker.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Spinner from "@/components/Spinner";
import { toast } from "react-toastify";
import { authFetch } from "@/utils/authFetch";
import PresetEditorModal from "./PresetEditorModal";

export type DocType = "quote" | "confirmation";

export type TextPreset = {
  id_preset: number;
  title: string;
  content: string;
  doc_type: DocType;
  created_at: string;
};

type Props = {
  token: string | null;
  docType: DocType;
  onApply: (content: string) => void;
  refreshSignal?: number;
};

// helpers localStorage
const LS_VIEW = "textpresets:view";
const LS_PIN = (doc: DocType) => `textpresets:pins:${doc}`;

export default function TextPresetPicker({
  token,
  docType,
  onApply,
  refreshSignal = 0,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [presets, setPresets] = useState<TextPreset[]>([]);
  const [q, setQ] = useState("");
  const [view, setView] = useState<"compact" | "grid">("compact");
  const [showAll, setShowAll] = useState(false);

  // edición
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<TextPreset | null>(null);

  // favoritos
  const [pinned, setPinned] = useState<number[]>([]);

  // cargar prefs
  useEffect(() => {
    const v =
      (localStorage.getItem(LS_VIEW) as "compact" | "grid") || "compact";
    setView(v);
    const pinsRaw = localStorage.getItem(LS_PIN(docType));
    try {
      setPinned(pinsRaw ? (JSON.parse(pinsRaw) as number[]) : []);
    } catch {
      setPinned([]);
    }
  }, [docType]);

  // fetch
  useEffect(() => {
    let abort = false;
    (async () => {
      if (!token) return;
      try {
        setLoading(true);
        // Si tu API usa docType=, ajustá aquí.
        const res = await authFetch(
          `/api/text-preset?doc_type=${docType}&take=200`,
          {},
          token,
        );
        if (!res.ok) throw new Error("No se pudieron cargar los presets");
        const data = await res.json();
        const items: TextPreset[] = Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data)
            ? data
            : [];
        if (!abort) setPresets(items);
      } catch (e) {
        if (!abort) toast.error(e instanceof Error ? e.message : String(e));
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
    // en búsqueda mostrar todo; sin búsqueda limitar a 6 si no "ver todo"
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
      if (!token) return toast.error("No hay token.");
      const ok = window.confirm(`¿Eliminar preset "${p.title}"?`);
      if (!ok) return;
      const res = await authFetch(
        `/api/text-preset/${p.id_preset}`,
        { method: "DELETE" },
        token,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "No se pudo eliminar el preset.");
      }
      toast.success("Preset eliminado.");
      // refrescar lista local
      setPresets((prev) => prev.filter((x) => x.id_preset !== p.id_preset));
      // sacar de pins si corresponde
      setPinned((prev) => {
        const next = prev.filter((id) => id !== p.id_preset);
        localStorage.setItem(LS_PIN(docType), JSON.stringify(next));
        return next;
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error eliminando preset.");
    }
  };

  const openEdit = (p: TextPreset) => {
    setEditing(p);
    setEditorOpen(true);
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
        onClick={() => onApply(p.content)}
      >
        <div className="mb-1 flex items-center gap-2">
          <div className="truncate text-sm font-medium">{p.title}</div>
          {pinned.includes(p.id_preset) && (
            <span className="rounded-full bg-yellow-200/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-yellow-900 dark:bg-yellow-400/20 dark:text-yellow-200">
              fav
            </span>
          )}
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide opacity-70">
            {p.doc_type}
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
          onClick={() => onApply(p.content)}
          className="rounded-full px-2 py-1 text-xs opacity-80 hover:bg-white/20"
          title="Usar"
        >
          Usar
        </button>
        <button
          type="button"
          onClick={() => openEdit(p)}
          className="rounded-full px-2 py-1 text-xs opacity-80 hover:bg-white/20"
          title="Editar"
        >
          Editar
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
            onChange={(e) => setQ(e.target.value)}
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

      {/* editor */}
      <PresetEditorModal
        open={editorOpen}
        token={token}
        preset={editing}
        docType={docType}
        onClose={() => setEditorOpen(false)}
        onSaved={() => {
          // para simplificar, refetch al cerrar (padre puede pasar refreshSignal si prefiere)
          setEditorOpen(false);
          setEditing(null);
          // pequeño truco: forzamos recarga haciendo un setPresets local (se actualizará al guardar real)
          // si querés refetch, podés levantar un "refreshSignal" desde el padre; acá actualizo editable in place:
          // (el modal ya llama PUT; si querés que este componente rehaga GET, podés añadir un prop)
        }}
      />
    </div>
  );
}
