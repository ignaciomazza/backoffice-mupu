// src/components/templates/PresetEditorModal.tsx
"use client";

import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { authFetch } from "@/utils/authFetch";
import type { DocType, TextPreset } from "./TextPresetPicker";

type Props = {
  open: boolean;
  token: string | null;
  preset: TextPreset | null;
  docType: DocType;
  onClose: () => void;
  onSaved: () => void; // refrescar picker
};

export default function PresetEditorModal({
  open,
  token,
  preset,
  docType,
  onClose,
  onSaved,
}: Props) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (preset) {
      setTitle(preset.title);
      setContent(preset.content);
    } else {
      setTitle("");
      setContent("");
    }
  }, [preset]);

  if (!open) return null;

  const save = async () => {
    try {
      if (!token) return toast.error("No hay token.");
      if (!preset) return;
      const body = { title: title.trim(), content: content, doc_type: docType };
      if (!body.title) return toast.error("El título es requerido.");
      setLoading(true);
      const res = await authFetch(
        `/api/text-preset/${preset.id_preset}`,
        { method: "PUT", body: JSON.stringify(body) },
        token,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "No se pudo guardar el preset.");
      }
      toast.success("Preset actualizado.");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error guardando.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-white p-5 text-sky-950 shadow-xl dark:bg-zinc-900 dark:text-white">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Editar preset</h3>
          <button
            onClick={onClose}
            className="rounded-full bg-white/10 p-2 hover:bg-white/20 dark:bg-white/10"
            aria-label="Cerrar"
            title="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm opacity-80">Título</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-white/50 p-2 px-3 outline-none dark:border-white/10 dark:bg-white/10"
              placeholder="Título del preset"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm opacity-80">Contenido</label>
            <textarea
              rows={10}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-white/50 p-2 px-3 outline-none dark:border-white/10 dark:bg-white/10"
              placeholder="Texto del preset…"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm hover:opacity-80"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={loading}
            className="rounded-full bg-sky-100 px-4 py-2 text-sm text-sky-900 shadow-sm hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white"
          >
            {loading ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
