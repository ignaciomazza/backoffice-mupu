// src/components/resources/ResourceForm.tsx
"use client";

import { useState, FormEvent, ChangeEvent, KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { toast } from "react-toastify";
import Spinner from "@/components/Spinner";
import { authFetch } from "@/utils/authFetch";

interface ResourceFormProps {
  onCreated: (res: {
    id_resource: number;
    title: string;
    description: string | null;
    createdAt: string;
  }) => void;
  agencyId: number | null;
}

type KvRow = { key: string; value: string };

type Template = {
  label: string;
  title: string;
  body: string;
};

const templates: Template[] = [
  {
    label: "Hotel",
    title: "Hotel:",
    body:
      "Contacto:\nCheck-in:\nCheck-out:\nDirección:\nObservaciones:\n",
  },
  {
    label: "Destino",
    title: "Destino:",
    body: "Mejor época:\nTraslados:\nTips locales:\nPuntos clave:\n",
  },
  {
    label: "Credenciales",
    title: "Accesos:",
    body: "Usuarios:\n- Usuario: \n- Contraseña: \n\nNotas:\n",
  },
  {
    label: "Links",
    title: "Enlaces útiles:",
    body: "- https://\n- https://\n",
  },
];

// Heroicons copied inline
const PlusIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="size-6"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 4.5v15m7.5-7.5h-15"
    />
  </svg>
);

const MinusIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="size-6"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
  </svg>
);

export default function ResourceForm({
  onCreated,
  agencyId,
}: ResourceFormProps) {
  const { token } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [linkInput, setLinkInput] = useState("");
  const [links, setLinks] = useState<string[]>([]);
  const [listInput, setListInput] = useState("");
  const [listItems, setListItems] = useState<string[]>([]);
  const [kvKey, setKvKey] = useState("");
  const [kvValue, setKvValue] = useState("");
  const [kvRows, setKvRows] = useState<KvRow[]>([]);

  const handleChangeTitle = (e: ChangeEvent<HTMLInputElement>) =>
    setTitle(e.target.value);

  const handleApplyTemplate = (template: Template) => {
    setIsFormVisible(true);
    setTitle((prev) => (prev.trim() ? prev : template.title));
    setDescription((prev) => {
      const base = prev.trim();
      const snippet = template.body.trim();
      if (!base) return snippet;
      return `${base}\n\n${snippet}`;
    });
  };

  const addLink = () => {
    const value = linkInput.trim();
    if (!value) return;
    setLinks((prev) => [...prev, value]);
    setLinkInput("");
  };

  const addListItem = () => {
    const value = listInput.trim();
    if (!value) return;
    setListItems((prev) => [...prev, value]);
    setListInput("");
  };

  const addKvRow = () => {
    const key = kvKey.trim();
    const value = kvValue.trim();
    if (!key || !value) return;
    setKvRows((prev) => [...prev, { key, value }]);
    setKvKey("");
    setKvValue("");
  };

  const handleKeyAdd =
    (handler: () => void) => (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      handler();
    };

  const buildDescription = () => {
    const blocks: string[] = [];
    const notes = description.trim();
    if (notes) blocks.push(notes);
    if (links.length) {
      blocks.push(`Enlaces:\n${links.map((link) => `- ${link}`).join("\n")}`);
    }
    if (listItems.length) {
      blocks.push(`Lista:\n${listItems.map((item) => `- ${item}`).join("\n")}`);
    }
    if (kvRows.length) {
      blocks.push(
        `Datos:\n${kvRows.map((row) => `- ${row.key}: ${row.value}`).join("\n")}`,
      );
    }
    const combined = blocks.join("\n\n").trim();
    return combined.length > 0 ? combined : null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Completa el título.");
      return;
    }
    if (!agencyId) {
      toast.error("No pudimos detectar la agencia todavía.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        description: buildDescription(),
        id_agency: agencyId,
      };
      const res = await authFetch(
        "/api/resources",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
        token,
      );

      if (!res.ok) {
        let msg = "Error al crear recurso";
        try {
          const err = await res.json();
          msg = err?.message || err?.error || msg;
        } catch {}
        throw new Error(msg);
      }

      const data = await res.json();
      const newResource = data.resource || data;
      onCreated(newResource);
      setTitle("");
      setDescription("");
      setLinkInput("");
      setListInput("");
      setKvKey("");
      setKvValue("");
      setLinks([]);
      setListItems([]);
      setKvRows([]);
      toast.success("Recurso creado");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al crear recurso";
      console.error(err);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ maxHeight: 120, opacity: 1 }}
      animate={{
        maxHeight: isFormVisible ? 2000 : 120,
        opacity: 1,
        transition: { duration: 0.4, ease: "easeInOut" },
      }}
      className="mb-6 space-y-4 overflow-hidden rounded-3xl border border-sky-200/60 bg-white/80 p-6 text-sky-950 shadow-lg shadow-sky-950/10 backdrop-blur dark:border-white/10 dark:bg-sky-950/40 dark:text-white"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="text-lg font-semibold">Centro de notas internas</p>
          <p className="text-sm text-sky-900/70 dark:text-white/70">
            Guarda accesos, links, destinos y recordatorios sin perder contexto.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsFormVisible(!isFormVisible)}
          className="inline-flex items-center justify-center rounded-full border border-sky-200/70 bg-white/70 p-2 text-sky-900 shadow-sm shadow-sky-950/10 transition-transform hover:scale-95 active:scale-90 dark:border-white/10 dark:bg-white/5 dark:text-white"
        >
          {isFormVisible ? <MinusIcon /> : <PlusIcon />}
        </button>
      </div>

      {isFormVisible && (
        <motion.form
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onSubmit={handleSubmit}
          className="space-y-5"
        >
          <div className="flex flex-wrap items-center gap-2 text-xs text-sky-900/70 dark:text-white/60">
            <span className="mr-1 text-[11px] uppercase tracking-wide">
              Plantillas
            </span>
            {templates.map((template) => (
              <button
                key={template.label}
                type="button"
                onClick={() => handleApplyTemplate(template)}
                className="rounded-full border border-sky-200/70 bg-white/70 px-3 py-1 text-xs text-sky-900 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200/70 hover:text-emerald-700 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:text-emerald-200"
              >
                {template.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <label className="ml-1 block text-sm font-medium">
                Título
              </label>
              <input
                type="text"
                name="title"
                value={title}
                onChange={handleChangeTitle}
                className="w-full rounded-2xl border border-sky-200/70 bg-white/70 p-3 text-sm text-sky-950 outline-none transition focus:border-emerald-200 focus:ring-2 focus:ring-emerald-200/40 dark:border-white/10 dark:bg-white/5 dark:text-white"
                placeholder="Hotelerías recomendadas, accesos de operadores..."
                required
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="ml-1 block text-sm font-medium">
                Notas principales
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                className="w-full rounded-2xl border border-sky-200/70 bg-white/70 p-3 text-sm text-sky-950 outline-none transition focus:border-emerald-200 focus:ring-2 focus:ring-emerald-200/40 dark:border-white/10 dark:bg-white/5 dark:text-white"
                placeholder="Detalles rápidos, tips, recordatorios..."
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-3 rounded-2xl border border-sky-200/60 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
              <div>
                <p className="text-sm font-semibold">Enlaces</p>
                <p className="text-xs text-sky-900/70 dark:text-white/60">
                  Guarda URLs rápidas para el equipo.
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  onKeyDown={handleKeyAdd(addLink)}
                  placeholder="https://..."
                  className="w-full rounded-xl border border-sky-200/70 bg-white/80 px-3 py-2 text-xs text-sky-950 outline-none transition focus:border-emerald-200 dark:border-white/10 dark:bg-white/10 dark:text-white"
                />
                <button
                  type="button"
                  onClick={addLink}
                  className="rounded-full border border-emerald-200/70 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-900 transition hover:scale-95 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100"
                >
                  +
                </button>
              </div>
              {links.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {links.map((link, index) => (
                    <button
                      key={`${link}-${index}`}
                      type="button"
                      onClick={() =>
                        setLinks((prev) => prev.filter((_, i) => i !== index))
                      }
                      className="rounded-full border border-sky-200/70 bg-white/80 px-3 py-1 text-[11px] text-sky-900 transition hover:border-emerald-200/70 dark:border-white/10 dark:bg-white/5 dark:text-white"
                      title="Quitar"
                    >
                      {link}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-2xl border border-sky-200/60 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
              <div>
                <p className="text-sm font-semibold">Lista rápida</p>
                <p className="text-xs text-sky-900/70 dark:text-white/60">
                  Checklist simple para tareas o recordatorios.
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={listInput}
                  onChange={(e) => setListInput(e.target.value)}
                  onKeyDown={handleKeyAdd(addListItem)}
                  placeholder="Agregar ítem"
                  className="w-full rounded-xl border border-sky-200/70 bg-white/80 px-3 py-2 text-xs text-sky-950 outline-none transition focus:border-emerald-200 dark:border-white/10 dark:bg-white/10 dark:text-white"
                />
                <button
                  type="button"
                  onClick={addListItem}
                  className="rounded-full border border-emerald-200/70 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-900 transition hover:scale-95 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100"
                >
                  +
                </button>
              </div>
              {listItems.length > 0 && (
                <div className="space-y-2">
                  {listItems.map((item, index) => (
                    <div
                      key={`${item}-${index}`}
                      className="flex items-center justify-between rounded-xl border border-sky-200/60 bg-white/80 px-3 py-1 text-[11px] text-sky-900 dark:border-white/10 dark:bg-white/5 dark:text-white"
                    >
                      <span>{item}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setListItems((prev) =>
                            prev.filter((_, i) => i !== index),
                          )
                        }
                        className="rounded-full border border-sky-200/70 px-2 text-[10px] text-sky-900 transition hover:border-emerald-200/70 dark:border-white/10 dark:text-white"
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-2xl border border-sky-200/60 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
              <div>
                <p className="text-sm font-semibold">Tabla simple</p>
                <p className="text-xs text-sky-900/70 dark:text-white/60">
                  Guarda campos tipo usuario/clave o contacto.
                </p>
              </div>
              <div className="grid gap-2">
                <input
                  type="text"
                  value={kvKey}
                  onChange={(e) => setKvKey(e.target.value)}
                  onKeyDown={handleKeyAdd(addKvRow)}
                  placeholder="Campo"
                  className="w-full rounded-xl border border-sky-200/70 bg-white/80 px-3 py-2 text-xs text-sky-950 outline-none transition focus:border-emerald-200 dark:border-white/10 dark:bg-white/10 dark:text-white"
                />
                <input
                  type="text"
                  value={kvValue}
                  onChange={(e) => setKvValue(e.target.value)}
                  onKeyDown={handleKeyAdd(addKvRow)}
                  placeholder="Valor"
                  className="w-full rounded-xl border border-sky-200/70 bg-white/80 px-3 py-2 text-xs text-sky-950 outline-none transition focus:border-emerald-200 dark:border-white/10 dark:bg-white/10 dark:text-white"
                />
              </div>
              <button
                type="button"
                onClick={addKvRow}
                className="w-full rounded-full border border-emerald-200/70 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-900 transition hover:scale-95 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100"
              >
                Agregar fila
              </button>
              {kvRows.length > 0 && (
                <div className="space-y-2 text-[11px] text-sky-900 dark:text-white">
                  {kvRows.map((row, index) => (
                    <div
                      key={`${row.key}-${row.value}-${index}`}
                      className="flex items-center justify-between rounded-xl border border-sky-200/60 bg-white/80 px-3 py-1 dark:border-white/10 dark:bg-white/5"
                    >
                      <div className="flex flex-col">
                        <span className="font-semibold">{row.key}</span>
                        <span className="text-[10px] text-sky-900/70 dark:text-white/70">
                          {row.value}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setKvRows((prev) =>
                            prev.filter((_, i) => i !== index),
                          )
                        }
                        className="rounded-full border border-sky-200/70 px-2 text-[10px] text-sky-900 transition hover:border-emerald-200/70 dark:border-white/10 dark:text-white"
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {!agencyId && (
            <p className="text-xs text-rose-600">
              Cargando datos de agencia. Espera unos segundos para crear el
              recurso.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-sky-900/70 dark:text-white/60">
              Las listas y tablas se guardan como secciones dentro de la nota.
            </p>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-full border border-emerald-300/60 bg-emerald-500/10 px-6 py-2 text-sm font-semibold text-emerald-900 shadow-sm shadow-emerald-900/10 transition-transform hover:scale-95 active:scale-90 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100"
              disabled={submitting || !title.trim() || !agencyId}
            >
              {submitting ? (
                <Spinner />
              ) : (
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
                    d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
                  />
                </svg>
              )}
              Crear recurso
            </button>
          </div>
        </motion.form>
      )}
    </motion.div>
  );
}
