// src/app/resources/page.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import ResourceCard from "@/components/resources/ResourceCard";
import ResourceForm from "@/components/resources/ResourceForm";
import { authFetch } from "@/utils/authFetch";

interface Resource {
  id_resource: number;
  public_id?: string | null;
  title: string;
  description: string | null;
  createdAt: string;
}

const URL_REGEX = /https?:\/\/[^\s]+/gi;

const extractLinks = (text?: string | null) =>
  text ? text.match(URL_REGEX) ?? [] : [];

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

export default function Page() {
  const { token } = useAuth();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [agencyId, setAgencyId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<"recent" | "oldest" | "title">("recent");
  const [filterMode, setFilterMode] = useState<"all" | "links" | "empty">(
    "all",
  );
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // 1) Perfil (role + agency)
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
        if (!res.ok) throw new Error("Error al obtener perfil");
        const data = await res.json();
        setRole(data.role);
        setAgencyId(data.id_agency);
      } catch (err) {
        if ((err as DOMException)?.name !== "AbortError") {
          console.error("❌ Error fetching profile:", err);
        }
      }
    })();

    return () => controller.abort();
  }, [token]);

  // 2) Recursos por agencyId
  useEffect(() => {
    if (agencyId === null || !token) return;
    setLoading(true);
    const controller = new AbortController();

    (async () => {
      try {
        const res = await authFetch(
          `/api/resources?agencyId=${agencyId}`,
          { signal: controller.signal },
          token,
        );
        if (!res.ok) throw new Error("Error al obtener recursos");
        const data: Resource[] = await res.json();
        setResources(data);
      } catch (err) {
        if ((err as DOMException)?.name !== "AbortError") {
          console.error("❌ Error fetching resources:", err);
          setResources([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [agencyId, token]);

  const stats = useMemo(() => {
    const total = resources.length;
    const withNotes = resources.filter((r) => r.description?.trim()).length;
    const withLinks = resources.filter(
      (r) => extractLinks(r.description).length > 0,
    ).length;
    const latest = resources[0]?.createdAt;
    return {
      total,
      withNotes,
      withLinks,
      latest: latest ? formatDate(latest) : "-",
    };
  }, [resources]);

  const displayed = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const filtered = resources.filter((r) => {
      const titleMatch = r.title.toLowerCase().includes(term);
      const descMatch = (r.description ?? "").toLowerCase().includes(term);
      if (term && !titleMatch && !descMatch) return false;
      if (filterMode === "links") {
        return extractLinks(r.description).length > 0;
      }
      if (filterMode === "empty") {
        return !(r.description ?? "").trim();
      }
      return true;
    });

    const sorted = [...filtered];
    if (sortBy === "title") {
      sorted.sort((a, b) => a.title.localeCompare(b.title, "es"));
    } else if (sortBy === "oldest") {
      sorted.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    } else {
      sorted.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    }
    return sorted;
  }, [resources, searchTerm, filterMode, sortBy]);

  const handleCreated = (newRes: Resource) => {
    setResources((prev) => [newRes, ...prev]);
  };

  const isManager =
    role === "gerente" ||
    role === "desarrollador" ||
    role === "lider" ||
    role === "administrativo";

  return (
    <ProtectedRoute>
      <section className="space-y-6 text-sky-950 dark:text-white">
        <div className="relative overflow-hidden rounded-3xl border border-sky-200/60 bg-white/70 p-6 shadow-sm shadow-sky-950/10 backdrop-blur dark:border-white/10 dark:bg-sky-950/40">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.25em] text-sky-700/70 dark:text-white/60">
                recursos internos
              </p>
              <h1 className="text-3xl font-semibold">
                Notas vivas para gerentes y equipos
              </h1>
              <p className="max-w-xl text-sm text-sky-900/70 dark:text-white/70">
                Guarda hoteles, destinos, accesos o tips con una estructura más
                clara. Buscá rápido, filtrá por links y alterná entre cards o
                tabla.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-sky-200/60 bg-white/70 p-4 text-sky-950 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white">
                <p className="text-xs uppercase tracking-wide text-sky-900/60 dark:text-white/60">
                  Total
                </p>
                <p className="text-lg font-semibold">{stats.total}</p>
              </div>
              <div className="rounded-2xl border border-sky-200/60 bg-white/70 p-4 text-sky-950 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white">
                <p className="text-xs uppercase tracking-wide text-sky-900/60 dark:text-white/60">
                  Con notas
                </p>
                <p className="text-lg font-semibold">{stats.withNotes}</p>
              </div>
              <div className="rounded-2xl border border-sky-200/60 bg-white/70 p-4 text-sky-950 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white">
                <p className="text-xs uppercase tracking-wide text-sky-900/60 dark:text-white/60">
                  Con links
                </p>
                <p className="text-lg font-semibold">{stats.withLinks}</p>
              </div>
              <div className="rounded-2xl border border-sky-200/60 bg-white/70 p-4 text-sky-950 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white">
                <p className="text-xs uppercase tracking-wide text-sky-900/60 dark:text-white/60">
                  Último
                </p>
                <p className="text-base font-semibold">{stats.latest}</p>
              </div>
            </div>
          </div>
        </div>

        {isManager && (
          <ResourceForm onCreated={handleCreated} agencyId={agencyId} />
        )}

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex w-full items-center gap-3 rounded-2xl border border-sky-200/60 bg-white/70 px-4 py-2 text-sky-950 shadow-sm shadow-sky-950/10 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-white">
            <input
              type="text"
              placeholder="Buscar por título o descripción..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-transparent text-sm outline-none placeholder:text-sky-900/50 dark:placeholder:text-white/50"
            />
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="size-5 text-sky-900/60 dark:text-white/70"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
              />
            </svg>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-sky-200/60 bg-white/70 px-2 py-1 text-xs text-sky-900 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white">
              {[
                { key: "all", label: "Todos" },
                { key: "links", label: "Con links" },
                { key: "empty", label: "Sin nota" },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() =>
                    setFilterMode(item.key as "all" | "links" | "empty")
                  }
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    filterMode === item.key
                      ? "border-emerald-200/60 bg-emerald-500/10 text-emerald-900 dark:border-emerald-400/30 dark:text-emerald-100"
                      : "border-transparent text-sky-900/70 hover:text-sky-900 dark:text-white/70"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as "recent" | "oldest" | "title")
              }
              className="rounded-full border border-sky-200/60 bg-white/70 px-4 py-2 text-xs text-sky-900 shadow-sm outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
            >
              <option value="recent">Recientes</option>
              <option value="oldest">Antiguos</option>
              <option value="title">A-Z</option>
            </select>

            <div className="flex items-center gap-2 rounded-full border border-sky-200/60 bg-white/70 px-2 py-1 shadow-sm dark:border-white/10 dark:bg-white/5">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`rounded-full border p-2 text-xs transition ${
                  viewMode === "grid"
                    ? "border-sky-200/70 bg-sky-900/10 text-sky-900 dark:border-white/10 dark:text-white"
                    : "border-transparent text-sky-900/70 dark:text-white/70"
                }`}
                aria-label="Vista en cards"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="size-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 3.75h6.5v6.5h-6.5v-6.5Zm0 9.5h6.5v6.5h-6.5v-6.5Zm9.5-9.5h6.5v6.5h-6.5v-6.5Zm0 9.5h6.5v6.5h-6.5v-6.5Z"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`rounded-full border p-2 text-xs transition ${
                  viewMode === "table"
                    ? "border-sky-200/70 bg-sky-900/10 text-sky-900 dark:border-white/10 dark:text-white"
                    : "border-transparent text-sky-900/70 dark:text-white/70"
                }`}
                aria-label="Vista en tabla"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="size-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 6.75h15M4.5 12h15M4.5 17.25h15"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[50vh] items-center justify-center">
            <Spinner />
          </div>
        ) : displayed.length === 0 ? (
          <div className="rounded-3xl border border-sky-200/60 bg-white/70 p-10 text-center text-sky-900 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white">
            <p className="text-lg font-semibold">Todavía no hay recursos</p>
            <p className="mt-2 text-sm text-sky-900/70 dark:text-white/70">
              Crea tu primera nota o ajusta los filtros para ver resultados.
            </p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {displayed.map((res) => (
              <ResourceCard
                key={res.id_resource}
                resource={res}
                expandedId={expandedId}
                setExpandedId={setExpandedId}
              />
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-sky-200/60 bg-white/70 shadow-sm dark:border-white/10 dark:bg-white/5">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-sky-100/80 text-xs uppercase tracking-wide text-sky-900 dark:bg-sky-900/30 dark:text-white">
                  <tr>
                    <th className="px-4 py-3">Título</th>
                    <th className="px-4 py-3">Creado</th>
                    <th className="px-4 py-3">Nota</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((res) => (
                    <tr
                      key={res.id_resource}
                      className="border-t border-sky-200/40 text-sky-900 dark:border-white/10 dark:text-white"
                    >
                      <td className="px-4 py-3 font-semibold">{res.title}</td>
                      <td className="px-4 py-3 text-xs">
                        {formatDate(res.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-xs text-sky-900/70 dark:text-white/70">
                        {(res.description ?? "Sin descripción").slice(0, 80)}
                        {(res.description ?? "").length > 80 ? "..." : ""}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/resources/${res.public_id ?? res.id_resource}`}
                          className="inline-flex items-center gap-2 rounded-full border border-emerald-300/60 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-900 shadow-sm shadow-emerald-900/10 transition hover:scale-95 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100"
                        >
                          Ver detalle
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
                              d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15M12 9l3 3m0 0-3 3m3-3H2.25"
                            />
                          </svg>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </ProtectedRoute>
  );
}
