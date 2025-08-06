// src/app/resources/[id]/page.tsx
"use client";

import { useState, useEffect, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import { useAuth } from "@/context/AuthContext";
import { toast } from "react-toastify";
import Link from "next/link";

export default function ResourceDetailPage() {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const { token } = useAuth();
  const router = useRouter();

  const [resource, setResource] = useState<{
    id_resource: number;
    title: string;
    description?: string;
    createdAt: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);

  const isManager = role === "gerente" || role === "desarrollador" || role === "lider";

  // Estados para edición inline
  const [isEditing, setIsEditing] = useState(false);
  const [titleEdit, setTitleEdit] = useState("");
  const [descEdit, setDescEdit] = useState("");
  const [saving, setSaving] = useState(false);

  // 1) Carga perfil
  useEffect(() => {
    if (!token) return;
    fetch("/api/user/profile", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setRole(data.role))
      .catch((err) => console.error("Error fetching profile:", err));
  }, [token]);

  // 2) Carga recurso
  useEffect(() => {
    if (!token || !id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/resources/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Status ${res.status}`);
        return res.json();
      })
      .then((data) => setResource(data))
      .catch((err) => {
        console.error("Error fetching resource:", err);
        toast.error("No se pudo cargar el recurso");
      })
      .finally(() => setLoading(false));
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
      const res = await fetch(`/api/resources/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
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
      const res = await fetch(`/api/resources/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: titleEdit.trim(),
          description: descEdit.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al actualizar");
      }
      const updated = await res.json();
      setResource(updated);
      toast.success("Recurso actualizado");
      setIsEditing(false);
    } catch (err: unknown) {
      console.error("Error updating resource:", err);
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
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
          <div className="mb-4 flex flex-col justify-between gap-3 md:mb-6">
            <Link
              className="group relative h-10 w-40 rounded-3xl bg-white/10 text-center text-xl font-semibold text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white"
              href="/resources"
            >
              <div className="absolute left-1 top-1 z-10 grid h-8 w-1/4 place-items-center rounded-3xl bg-sky-100 duration-500 group-hover:w-[152px] dark:bg-gray-500">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.4}
                  stroke="currentColor"
                  className="size-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
                  />
                </svg>
              </div>
              <p className="flex h-full translate-x-2 items-center justify-center text-sm font-light">
                volver
              </p>
            </Link>

            {isEditing ? (
              <form
                onSubmit={handleSave}
                className="space-y-4 rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white"
              >
                <div>
                  <label className="mb-1 block font-medium dark:text-white">
                    Título
                  </label>
                  <input
                    type="text"
                    value={titleEdit}
                    onChange={(e) => setTitleEdit(e.target.value)}
                    className="w-full rounded-2xl border border-sky-950/10 p-2 outline-none backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium dark:text-white">
                    Descripción
                  </label>
                  <textarea
                    value={descEdit}
                    onChange={(e) => setDescEdit(e.target.value)}
                    rows={6}
                    className="w-full rounded-2xl border border-sky-950/10 p-2 outline-none backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
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
                        className="size-6"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z"
                        />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setTitleEdit(resource.title);
                      setDescEdit(resource.description ?? "");
                    }}
                    className="rounded-full bg-red-600 px-6 py-2 text-center text-red-100 shadow-sm shadow-red-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-red-800"
                  >
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
                        d="M6 18 18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </form>
            ) : (
              <div className="w-full space-y-3">
                <h1 className="text-center text-3xl font-semibold">
                  {resource.title}
                </h1>
                <p className="mr-6 text-end text-sm text-gray-600">
                  Creado el {formatDate(resource.createdAt)}
                </p>
                <div className="whitespace-pre-wrap rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white">
                  {resource.description || (
                    <span className="text-gray-500">Sin descripción</span>
                  )}
                </div>
                {isManager && (
                  <div className="flex gap-4">
                    <button
                      onClick={() => setIsEditing(true)}
                      className="rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.4}
                        stroke="currentColor"
                        className="size-6"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={handleDelete}
                      className="rounded-full bg-red-600 px-6 py-2 text-center text-red-100 shadow-sm shadow-red-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-red-800"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.4}
                        stroke="currentColor"
                        className="size-6"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                        />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!loading && resource === null && (
          <p className="text-center text-gray-500">Recurso no encontrado.</p>
        )}
      </section>
    </ProtectedRoute>
  );
}
