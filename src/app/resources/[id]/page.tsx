// src/app/resources/[id]/page.tsx
"use client";

import { useState, useEffect, FormEvent, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import { useAuth } from "@/context/AuthContext";
import { toast } from "react-toastify";
import Link from "next/link";
import { authFetch } from "@/utils/authFetch";

interface Resource {
  id_resource: number;
  public_id?: string | null;
  title: string;
  description?: string | null;
  createdAt: string;
}

type KeyValueRow = { key: string; value: string };

const URL_REGEX = /https?:\/\/[^\s]+/gi;

const normalizeLine = (value: string) =>
  value.replace(/\s+/g, " ").trim();

const parseContent = (text: string) => {
  const links = Array.from(new Set(text.match(URL_REGEX) ?? []));
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const bulletValues = lines
    .filter((line) => /^[-•*]\s+/.test(line))
    .map((line) => line.replace(/^[-•*]\s+/, "").trim())
    .filter(Boolean);

  const keyValues: KeyValueRow[] = [];
  const keyValueSignatures = new Set<string>();

  for (const value of bulletValues) {
    const match = value.match(/^([^:]{2,}):\s*(.+)$/);
    if (!match) continue;
    const key = match[1].trim();
    const val = match[2].trim();
    if (!key || !val) continue;
    if (/^https?:\/\//i.test(key)) continue;
    const signature = normalizeLine(`${key}: ${val}`);
    if (keyValueSignatures.has(signature)) continue;
    keyValueSignatures.add(signature);
    keyValues.push({ key, value: val });
  }

  const listItems = Array.from(
    new Set(
      bulletValues.filter((value) => {
        const normalized = normalizeLine(value);
        if (!normalized) return false;
        if (keyValueSignatures.has(normalized)) return false;
        if (/^https?:\/\//i.test(normalized)) return false;
        return true;
      }),
    ),
  );

  return { links, listItems, keyValues };
};

export default function ResourceDetailPage() {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const { token } = useAuth();
  const router = useRouter();

  const [resource, setResource] = useState<Resource | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);

  const isManager =
    role === "gerente" ||
    role === "desarrollador" ||
    role === "lider" ||
    role === "administrativo";

  // Estados para edición inline
  const [isEditing, setIsEditing] = useState(false);
  const [titleEdit, setTitleEdit] = useState("");
  const [descEdit, setDescEdit] = useState("");
  const [saving, setSaving] = useState(false);

  const parsed = useMemo(() => {
    if (!resource?.description) {
      return { links: [], listItems: [], keyValues: [] as KeyValueRow[] };
    }
    return parseContent(resource.description);
  }, [resource?.description]);

  // 1) Carga perfil
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();

    (async () => {
      try {
        const res = await authFetch(
          "/api/user/profile",
          { signal: controller.signal },
          token,
        );
        if (!res.ok) throw new Error("Error perfil");
        const data = await res.json();
        setRole(data.role);
      } catch (err) {
        if ((err as DOMException)?.name !== "AbortError") {
          console.error("Error fetching profile:", err);
        }
      }
    })();

    return () => controller.abort();
  }, [token]);

  // 2) Carga recurso
  useEffect(() => {
    if (!token || !id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();

    (async () => {
      try {
        const res = await authFetch(
          `/api/resources/${id}`,
          { signal: controller.signal },
          token,
        );
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data: Resource = await res.json();
        setResource(data);
      } catch (err) {
        if ((err as DOMException)?.name !== "AbortError") {
          console.error("Error fetching resource:", err);
          toast.error("No se pudo cargar el recurso");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [id, token]);

  // 3) Cuando el recurso llega, inicializo los campos de edición
  useEffect(() => {
    if (resource) {
      setTitleEdit(resource.title);
      setDescEdit(resource.description ?? "");
    }
  }, [resource]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  const handleDelete = async () => {
    if (!confirm("¿Estás seguro de que deseas eliminar este recurso?")) return;
    try {
      const res = await authFetch(
        `/api/resources/${id}`,
        { method: "DELETE" },
        token,
      );
      if (!res.ok) throw new Error(`Error ${res.status}`);
      toast.success("Recurso eliminado");
      router.push("/resources");
    } catch (err) {
      console.error("Error deleting resource:", err);
      toast.error("No se pudo eliminar el recurso");
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!titleEdit.trim()) {
      toast.error("El título es obligatorio");
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch(
        `/api/resources/${id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            title: titleEdit.trim(),
            description: descEdit.trim() || null,
          }),
        },
        token,
      );
      if (!res.ok) {
        let msg = "Error al actualizar";
        try {
          const err = await res.json();
          msg = err?.error || msg;
        } catch {}
        throw new Error(msg);
      }
      const updated: Resource = await res.json();
      setResource(updated);
      toast.success("Recurso actualizado");
      setIsEditing(false);
    } catch (err) {
      console.error("Error updating resource:", err);
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async (value: string, label: string) => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard no disponible");
      }
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado`);
    } catch (err) {
      console.error("Error copying:", err);
      toast.error("No se pudo copiar");
    }
  };

  return (
    <ProtectedRoute>
      <section className="mx-auto space-y-6 py-8 text-sky-950 dark:text-white">
        {(!id || loading) && (
          <div className="flex h-64 items-center justify-center">
            <Spinner />
          </div>
        )}

        {!loading && resource && (
          <>
            <div className="rounded-3xl border border-sky-200/60 bg-white/70 p-6 shadow-sm shadow-sky-950/10 backdrop-blur dark:border-white/10 dark:bg-sky-950/40">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <Link
                  className="inline-flex items-center gap-2 rounded-full border border-sky-200/70 bg-white/70 px-4 py-2 text-xs font-semibold text-sky-900 shadow-sm transition hover:-translate-y-0.5 dark:border-white/10 dark:bg-white/5 dark:text-white"
                  href="/resources"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.4}
                    stroke="currentColor"
                    className="size-4"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
                    />
                  </svg>
                  Volver a recursos
                </Link>

                {isManager && !isEditing && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setIsEditing(true)}
                      className="inline-flex items-center gap-2 rounded-full border border-emerald-300/60 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-900 shadow-sm shadow-emerald-900/10 transition hover:scale-95 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.4}
                        stroke="currentColor"
                        className="size-4"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                        />
                      </svg>
                      Editar
                    </button>
                    <button
                      onClick={handleDelete}
                      className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-red-950/20 transition hover:scale-95"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.4}
                        stroke="currentColor"
                        className="size-4"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                        />
                      </svg>
                      Eliminar
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-6 space-y-2">
                <p className="text-xs uppercase tracking-[0.25em] text-sky-700/70 dark:text-white/60">
                  recurso
                </p>
                <h1 className="text-3xl font-semibold">{resource.title}</h1>
                <p className="text-sm text-sky-900/70 dark:text-white/70">
                  Creado el {formatDate(resource.createdAt)}
                </p>
              </div>

              {(parsed.links.length > 0 ||
                parsed.listItems.length > 0 ||
                parsed.keyValues.length > 0) && (
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-sky-900/70 dark:text-white/70">
                  {parsed.links.length > 0 && (
                    <span className="rounded-full border border-emerald-200/70 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100">
                      {parsed.links.length} links
                    </span>
                  )}
                  {parsed.listItems.length > 0 && (
                    <span className="rounded-full border border-sky-200/70 bg-white/70 px-3 py-1 text-[11px] font-semibold text-sky-900 dark:border-white/10 dark:bg-white/5 dark:text-white">
                      {parsed.listItems.length} ítems
                    </span>
                  )}
                  {parsed.keyValues.length > 0 && (
                    <span className="rounded-full border border-amber-200/70 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100">
                      {parsed.keyValues.length} datos
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="space-y-6">
                {isEditing ? (
                  <form
                    onSubmit={handleSave}
                    className="space-y-4 rounded-3xl border border-sky-200/60 bg-white/70 p-6 text-sky-950 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white"
                  >
                    <div>
                      <label className="mb-1 block text-sm font-medium">
                        Título
                      </label>
                      <input
                        type="text"
                        value={titleEdit}
                        onChange={(e) => setTitleEdit(e.target.value)}
                        className="w-full rounded-2xl border border-sky-200/70 bg-white/70 p-3 text-sm text-sky-950 outline-none transition focus:border-emerald-200 focus:ring-2 focus:ring-emerald-200/40 dark:border-white/10 dark:bg-white/5 dark:text-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">
                        Descripción
                      </label>
                      <textarea
                        value={descEdit}
                        onChange={(e) => setDescEdit(e.target.value)}
                        rows={8}
                        className="w-full rounded-2xl border border-sky-200/70 bg-white/70 p-3 text-sm text-sky-950 outline-none transition focus:border-emerald-200 focus:ring-2 focus:ring-emerald-200/40 dark:border-white/10 dark:bg-white/5 dark:text-white"
                      />
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="submit"
                        disabled={saving}
                        className="inline-flex items-center gap-2 rounded-full border border-emerald-300/60 bg-emerald-500/10 px-6 py-2 text-xs font-semibold text-emerald-900 shadow-sm shadow-emerald-900/10 transition hover:scale-95 disabled:opacity-60 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100"
                      >
                        {saving ? (
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
                              d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z"
                            />
                          </svg>
                        )}
                        Guardar cambios
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditing(false);
                          setTitleEdit(resource.title);
                          setDescEdit(resource.description ?? "");
                        }}
                        className="inline-flex items-center gap-2 rounded-full border border-sky-200/70 bg-white/70 px-6 py-2 text-xs font-semibold text-sky-900 shadow-sm transition hover:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-white"
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-4 rounded-3xl border border-sky-200/60 bg-white/70 p-6 text-sky-950 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-semibold">Notas</h2>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(resource.description ?? "", "Nota")
                        }
                        className="rounded-full border border-sky-200/70 bg-white/70 px-3 py-1 text-[11px] font-semibold text-sky-900 transition hover:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-white"
                      >
                        Copiar nota
                      </button>
                    </div>
                    <div className="whitespace-pre-wrap text-sm text-sky-900/80 dark:text-white/80">
                      {resource.description || (
                        <span className="text-sky-900/50 dark:text-white/50">
                          Sin descripción
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {!isEditing && parsed.listItems.length > 0 && (
                  <div className="space-y-3 rounded-3xl border border-sky-200/60 bg-white/70 p-6 text-sky-950 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white">
                    <h3 className="text-lg font-semibold">Lista rápida</h3>
                    <ul className="space-y-2 text-sm">
                      {parsed.listItems.map((item, index) => (
                        <li key={`${item}-${index}`} className="flex gap-3">
                          <span className="mt-2 inline-flex size-2 rounded-full bg-emerald-400" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <aside className="space-y-4">
                <div className="space-y-3 rounded-3xl border border-sky-200/60 bg-white/70 p-6 text-sky-950 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-sky-900/70 dark:text-white/70">
                    Resumen
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span>Links detectados</span>
                      <span className="font-semibold">
                        {parsed.links.length}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Ítems</span>
                      <span className="font-semibold">
                        {parsed.listItems.length}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Datos</span>
                      <span className="font-semibold">
                        {parsed.keyValues.length}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        `${resource.title}\n\n${resource.description ?? ""}`,
                        "Contenido",
                      )
                    }
                    className="inline-flex items-center justify-center rounded-full border border-emerald-300/60 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-900 shadow-sm shadow-emerald-900/10 transition hover:scale-95 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100"
                  >
                    Copiar todo
                  </button>
                </div>

                {parsed.keyValues.length > 0 && (
                  <div className="rounded-3xl border border-sky-200/60 bg-white/70 p-6 text-sky-950 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white">
                    <h3 className="mb-3 text-lg font-semibold">
                      Datos clave
                    </h3>
                    <div className="overflow-hidden rounded-2xl border border-sky-200/60 dark:border-white/10">
                      <table className="min-w-full text-sm">
                        <thead className="bg-sky-100/80 text-xs uppercase tracking-wide text-sky-900 dark:bg-sky-900/30 dark:text-white">
                          <tr>
                            <th className="px-3 py-2 text-left">Campo</th>
                            <th className="px-3 py-2 text-left">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parsed.keyValues.map((row, index) => (
                            <tr
                              key={`${row.key}-${row.value}-${index}`}
                              className="border-t border-sky-200/40 dark:border-white/10"
                            >
                              <td className="px-3 py-2 font-semibold">
                                {row.key}
                              </td>
                              <td className="px-3 py-2 text-sky-900/70 dark:text-white/70">
                                {row.value}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {parsed.links.length > 0 && (
                  <div className="space-y-3 rounded-3xl border border-sky-200/60 bg-white/70 p-6 text-sky-950 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white">
                    <h3 className="text-lg font-semibold">Enlaces</h3>
                    <div className="space-y-2">
                      {parsed.links.map((link) => (
                        <div
                          key={link}
                          className="flex items-center justify-between gap-2 rounded-2xl border border-sky-200/60 bg-white/70 px-3 py-2 text-xs text-sky-900 dark:border-white/10 dark:bg-white/5 dark:text-white"
                        >
                          <a
                            href={link}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-200"
                          >
                            {link}
                          </a>
                          <button
                            type="button"
                            onClick={() => handleCopy(link, "Link")}
                            className="rounded-full border border-sky-200/70 px-2 py-1 text-[10px] font-semibold text-sky-900 transition hover:border-emerald-200/70 dark:border-white/10 dark:text-white"
                          >
                            Copiar
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </aside>
            </div>
          </>
        )}

        {!loading && resource === null && (
          <p className="text-center text-gray-500">Recurso no encontrado.</p>
        )}
      </section>
    </ProtectedRoute>
  );
}
