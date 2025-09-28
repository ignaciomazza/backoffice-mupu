// src/app/geo/page.tsx
"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import Spinner from "@/components/Spinner";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

/* =========================== Tipos mínimos =========================== */

type Country = {
  id_country: number;
  name: string;
  iso2: string;
  iso3?: string | null;
  slug: string;
  enabled?: boolean;
};

type CountryOption = Pick<Country, "id_country" | "name" | "iso2">;

type DestinationRow = {
  id_destination: number;
  name: string;
  slug: string;
  alt_names: string[];
  popularity: number;
  enabled: boolean;
  country: { id_country: number; name: string; iso2: string };
};
type DestinationRowUI = DestinationRow & { _editing?: boolean };

type NewCountry = {
  name: string;
  code2: string;
  enabled?: boolean;
};

type NewDestination = {
  name: string;
  countryId: number;
  alt_names?: string[];
  enabled?: boolean;
};

/* =========================== Utils UI =========================== */

function useDebounced<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/* =========================== Página =========================== */

export default function GeoAdminPage() {
  const { token, role, loading } = useAuth();
  const [tab, setTab] = useState<"countries" | "destinations">("countries");
  const [importOpen, setImportOpen] = useState(false);

  const allowed = useMemo(() => {
    const r = (role ?? "").toLowerCase();
    return r === "desarrollador" || r === "gerente";
  }, [role]);

  const isDev = useMemo(
    () => (role ?? "").toLowerCase() === "desarrollador",
    [role],
  );

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="mb-2 text-2xl font-semibold">Acceso restringido</h1>
        <p className="opacity-80">
          Esta sección es solo para <strong>Desarrolladores</strong> y{" "}
          <strong>Gerentes</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6 text-sky-950 dark:text-white">
      <motion.header
        initial={{ y: -6, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Administración de países y destinos
          </h1>
          <p className="text-sm opacity-80">
            Cargar, editar y activar/desactivar de forma rápida.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDev && (
            <Primary onClick={() => setImportOpen(true)}>
              Importar JSON (dev)
            </Primary>
          )}
          <nav className="flex gap-2">
            <TabButton
              active={tab === "countries"}
              onClick={() => setTab("countries")}
            >
              Países
            </TabButton>
            <TabButton
              active={tab === "destinations"}
              onClick={() => setTab("destinations")}
            >
              Destinos
            </TabButton>
          </nav>
        </div>
      </motion.header>

      <AnimatePresence mode="wait">
        {tab === "countries" ? (
          <motion.div
            key="tab-countries"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <CountriesPanel token={token} />
          </motion.div>
        ) : (
          <motion.div
            key="tab-destinations"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <DestinationsPanel token={token} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Importación JSON (solo dev) */}
      {isDev && (
        <JSONImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          token={token}
          onImported={() => {
            window.dispatchEvent(new CustomEvent("geo:refresh"));
          }}
        />
      )}

      <ToastContainer />
    </div>
  );
}

/* =========================== Panel: Países =========================== */

function CountriesPanel({ token }: { token?: string | null }) {
  const [q, setQ] = useState("");
  const debounced = useDebounced(q, 400);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Country[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);

  // acciones con spinner
  const [createLoading, setCreateLoading] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  // form crear
  const [form, setForm] = useState<NewCountry>({
    name: "",
    code2: "",
    enabled: true,
  });

  const fetchList = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (debounced.trim()) params.set("q", debounced.trim());
        params.set("take", "1000");
        params.set("includeDisabled", "true");

        const res = await authFetch(
          `/api/countries?${params.toString()}`,
          { signal, cache: "no-store" },
          token,
        );
        if (!res.ok) throw new Error("No se pudieron obtener los países");
        const json = (await res.json()) as { items: Country[] };
        setRows(json.items);
      } catch (e) {
        if ((e as Error).name !== "AbortError")
          toast.error("Error al cargar países");
      } finally {
        setLoading(false);
      }
    },
    [debounced, token],
  );

  useEffect(() => {
    const onRefresh = () => fetchList();
    window.addEventListener("geo:refresh", onRefresh);
    return () => window.removeEventListener("geo:refresh", onRefresh);
  }, [fetchList]);

  useEffect(() => {
    const c = new AbortController();
    fetchList(c.signal);
    return () => c.abort();
  }, [fetchList]);

  const startEdit = (id: number) => setEditingId(id);
  const cancelEdit = () => setEditingId(null);

  const saveEdit = async (row: Country) => {
    try {
      setSavingId(row.id_country);
      const res = await authFetch(
        `/api/countries/${row.id_country}`,
        {
          method: "PUT",
          body: JSON.stringify({
            name: row.name,
            iso2: row.iso2,
            enabled: row.enabled ?? true,
          }),
        },
        token,
      );
      if (!res.ok) throw new Error("No se pudo actualizar el país");
      toast.success("País actualizado");
      setEditingId(null);
      fetchList();
    } catch {
      toast.error("Error al actualizar");
    } finally {
      setSavingId(null);
    }
  };

  const toggleEnabled = async (row: Country) => {
    try {
      setTogglingId(row.id_country);
      const res = await authFetch(
        `/api/countries/${row.id_country}`,
        {
          method: "PUT",
          body: JSON.stringify({ enabled: !(row.enabled ?? true) }),
        },
        token,
      );
      if (!res.ok) throw new Error();
      setRows((rs) =>
        rs.map((r) =>
          r.id_country === row.id_country
            ? { ...r, enabled: !(row.enabled ?? true) }
            : r,
        ),
      );
    } catch {
      toast.error("No se pudo cambiar el estado");
    } finally {
      setTogglingId(null);
    }
  };

  const create = async () => {
    if (!form.name.trim() || !form.code2.trim()) {
      toast.error("Completá nombre y código de 2 letras");
      return;
    }
    try {
      setCreateLoading(true);
      const res = await authFetch(
        "/api/countries",
        {
          method: "POST",
          body: JSON.stringify({
            name: form.name.trim(),
            iso2: form.code2.trim().toUpperCase(),
            enabled: form.enabled ?? true,
          }),
        },
        token,
      );
      if (!res.ok) throw new Error();
      toast.success("País creado");
      setForm({ name: "", code2: "", enabled: true });
      fetchList();
    } catch {
      toast.error("Error al crear");
    } finally {
      setCreateLoading(false);
    }
  };

  const onKeyDownCreate = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") create();
  };

  return (
    <div className="space-y-8">
      <Card>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Buscar país">
            <input
              className="w-full rounded-2xl border border-white/10 bg-white/50 p-2 outline-none backdrop-blur placeholder:font-light dark:bg-white/10"
              placeholder="Ej.: Argentina o AR"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </Field>
          <div className="flex items-end md:col-span-2">
            {loading ? <Spinner /> : null}
          </div>
        </div>
      </Card>

      <Card title="Agregar país (rápido)">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Field label="Nombre del país">
            <input
              className="w-full rounded-2xl border border-white/10 bg-white/50 p-2 outline-none backdrop-blur placeholder:font-light dark:bg-white/10"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onKeyDown={onKeyDownCreate}
            />
          </Field>
          <Field label="Código de país (2 letras)">
            <input
              className="w-full rounded-2xl border border-white/10 bg-white/50 p-2 uppercase outline-none backdrop-blur placeholder:font-light dark:bg-white/10"
              maxLength={2}
              value={form.code2}
              onChange={(e) =>
                setForm((f) => ({ ...f, code2: e.target.value }))
              }
              onKeyDown={onKeyDownCreate}
              placeholder="AR, US, MX…"
            />
          </Field>
          <Field label="Estado">
            <select
              className="w-full cursor-pointer appearance-none rounded-2xl border border-white/10 bg-white/50 p-2 shadow-sm shadow-sky-950/10 outline-none backdrop-blur dark:bg-white/10"
              value={String(form.enabled ?? true)}
              onChange={(e) =>
                setForm((f) => ({ ...f, enabled: e.target.value === "true" }))
              }
            >
              <option value="true">Activo</option>
              <option value="false">Inactivo</option>
            </select>
          </Field>
          <div className="flex items-end">
            <Primary onClick={create} loading={createLoading}>
              Crear país
            </Primary>
          </div>
        </div>
      </Card>

      <Card title="Listado">
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="min-w-full border-separate border-spacing-y-1 p-1">
            <thead>
              <tr className="text-left text-xs uppercase opacity-70">
                <Th>Nombre</Th>
                <Th>Código 2</Th>
                <Th>Estado</Th>
                <Th>Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) =>
                editingId === r.id_country ? (
                  <CountryEditRow
                    key={r.id_country}
                    row={r}
                    saving={savingId === r.id_country}
                    onCancel={cancelEdit}
                    onSave={saveEdit}
                  />
                ) : (
                  <motion.tr
                    key={r.id_country}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl shadow-sm shadow-sky-950/5 backdrop-blur"
                  >
                    <Td>{r.name}</Td>
                    <Td>{r.iso2}</Td>
                    <Td>
                      <button
                        className={`h-full cursor-pointer appearance-none rounded-full border px-4 py-1 text-xs shadow-sm transition ${
                          r.enabled
                            ? "border-emerald-200 bg-emerald-100 text-emerald-900 dark:border-emerald-800/40 dark:bg-emerald-900/30 dark:text-emerald-100"
                            : "border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-800/40 dark:bg-amber-900/30 dark:text-amber-100"
                        } ${togglingId === r.id_country ? "opacity-60" : ""}`}
                        onClick={() => toggleEnabled(r)}
                        title="Cambiar estado"
                        disabled={togglingId === r.id_country}
                        aria-busy={togglingId === r.id_country}
                      >
                        {togglingId === r.id_country ? (
                          <Spinner />
                        ) : r.enabled ? (
                          "Activo"
                        ) : (
                          "Inactivo"
                        )}
                      </button>
                    </Td>
                    <Td>
                      <div className="flex gap-2">
                        <Secondary onClick={() => startEdit(r.id_country)}>
                          <EditIcon />
                        </Secondary>
                        <Danger
                          onClick={() =>
                            removeCountry(
                              r.id_country,
                              token,
                              () => fetchList(),
                              setDeletingId,
                            )
                          }
                          loading={deletingId === r.id_country}
                        >
                          <TrashIcon />
                        </Danger>
                      </div>
                    </Td>
                  </motion.tr>
                ),
              )}
              {rows.length === 0 && (
                <tr>
                  <Td colSpan={4} className="py-8 text-center opacity-70">
                    Sin resultados
                  </Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

async function removeCountry(
  id: number,
  token?: string | null,
  onOk?: () => void,
  setDeletingId?: React.Dispatch<React.SetStateAction<number | null>>,
) {
  if (!confirm("¿Eliminar país?")) return;
  try {
    setDeletingId?.(id);
    const res = await authFetch(
      `/api/countries/${id}`,
      { method: "DELETE" },
      token,
    );
    if (!res.status || (res.status !== 204 && !res.ok)) throw new Error();
    toast.success("País eliminado");
    onOk?.();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al eliminar";
    toast.error(msg || "Error al eliminar");
  } finally {
    setDeletingId?.(null);
  }
}

function CountryEditRow({
  row,
  onCancel,
  onSave,
  saving,
}: {
  row: Country;
  onCancel: () => void;
  onSave: (row: Country) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<Country>({ ...row });
  useEffect(() => setDraft({ ...row }), [row]);

  return (
    <tr className="rounded-xl bg-white/70 shadow-sm shadow-sky-950/5 backdrop-blur dark:bg-white/10">
      <Td>
        <input
          className="w-full rounded-2xl border border-white/10 bg-white/50 p-2 outline-none backdrop-blur placeholder:font-light dark:bg-white/10"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />
      </Td>
      <Td>
        <input
          className="w-full rounded-2xl border border-white/10 bg-white/50 p-2 uppercase outline-none backdrop-blur placeholder:font-light dark:bg-white/10"
          maxLength={2}
          value={draft.iso2}
          onChange={(e) =>
            setDraft((d) => ({ ...d, iso2: e.target.value.toUpperCase() }))
          }
        />
      </Td>
      <Td>
        <select
          className="w-full rounded-2xl border border-white/10 bg-white/50 p-2 outline-none backdrop-blur dark:bg-white/10"
          value={String(draft.enabled ?? true)}
          onChange={(e) =>
            setDraft((d) => ({ ...d, enabled: e.target.value === "true" }))
          }
        >
          <option value="true">Activo</option>
          <option value="false">Inactivo</option>
        </select>
      </Td>
      <Td>
        <div className="flex gap-2">
          <Primary onClick={() => onSave(draft)} loading={saving}>
            Guardar
          </Primary>
          <Secondary onClick={onCancel}>Cancelar</Secondary>
        </div>
      </Td>
    </tr>
  );
}

/* =========================== Panel: Destinos =========================== */

function DestinationsPanel({ token }: { token?: string | null }) {
  const [q, setQ] = useState("");
  const debounced = useDebounced(q, 400);
  const [countryIso2, setCountryIso2] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<DestinationRowUI[]>([]);
  const [countries, setCountries] = useState<CountryOption[]>([]);

  // acciones con spinner
  const [createLoading, setCreateLoading] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  // recordá último país usado para alta rápida
  const LAST_COUNTRY_KEY = "geo:lastCountryId";

  // form crear
  const [form, setForm] = useState<NewDestination>({
    name: "",
    countryId: 0,
    alt_names: [],
    enabled: true,
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch(
          "/api/countries?take=1000&includeDisabled=true",
          { cache: "no-store" },
          token,
        );
        const json = (await res.json()) as { items: CountryOption[] };
        setCountries(json.items);
        const lastId = Number(localStorage.getItem(LAST_COUNTRY_KEY) || 0);
        if (lastId) setForm((f) => ({ ...f, countryId: lastId }));
      } catch {
        /* ignore */
      }
    })();
  }, [token]);

  const fetchList = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (debounced.trim()) params.set("q", debounced.trim());
        if (countryIso2) params.set("countryIso2", countryIso2);
        params.set("take", "200");
        params.set("includeDisabled", "true");

        const res = await authFetch(
          `/api/destinations?${params.toString()}`,
          { signal, cache: "no-store" },
          token,
        );
        if (!res.ok) throw new Error("No se pudieron obtener los destinos");
        const json = (await res.json()) as { items: DestinationRow[] };
        setRows(json.items.map((r) => ({ ...r, _editing: false })));
      } catch (e) {
        if ((e as Error).name !== "AbortError")
          toast.error("Error al cargar destinos");
      } finally {
        setLoading(false);
      }
    },
    [debounced, countryIso2, token],
  );

  useEffect(() => {
    const onRefresh = () => fetchList();
    window.addEventListener("geo:refresh", onRefresh);
    return () => window.removeEventListener("geo:refresh", onRefresh);
  }, [fetchList]);

  useEffect(() => {
    const c = new AbortController();
    fetchList(c.signal);
    return () => c.abort();
  }, [fetchList]);

  const startEdit = (id: number) =>
    setRows((rs) =>
      rs.map((r) => (r.id_destination === id ? { ...r, _editing: true } : r)),
    );
  const cancelEdit = (id: number) =>
    setRows((rs) =>
      rs.map((r) => (r.id_destination === id ? { ...r, _editing: false } : r)),
    );

  const saveEdit = async (row: DestinationRow) => {
    try {
      setSavingId(row.id_destination);
      const res = await authFetch(
        `/api/destinations/${row.id_destination}`,
        {
          method: "PUT",
          body: JSON.stringify({
            name: row.name,
            alt_names: row.alt_names,
            enabled: row.enabled,
            countryId: row.country.id_country,
          }),
        },
        token,
      );
      if (!res.ok) throw new Error("No se pudo actualizar el destino");
      toast.success("Destino actualizado");
      fetchList();
    } catch {
      toast.error("Error al actualizar");
    } finally {
      setSavingId(null);
    }
  };

  const toggleEnabled = async (r: DestinationRowUI) => {
    try {
      setTogglingId(r.id_destination);
      const res = await authFetch(
        `/api/destinations/${r.id_destination}`,
        { method: "PUT", body: JSON.stringify({ enabled: !r.enabled }) },
        token,
      );
      if (!res.ok) throw new Error();
      setRows((rs) =>
        rs.map((x) =>
          x.id_destination === r.id_destination
            ? { ...x, enabled: !x.enabled }
            : x,
        ),
      );
    } catch {
      toast.error("No se pudo cambiar el estado");
    } finally {
      setTogglingId(null);
    }
  };

  const remove = async (id: number) => {
    if (!confirm("¿Eliminar destino?")) return;
    try {
      setDeletingId(id);
      const res = await authFetch(
        `/api/destinations/${id}`,
        { method: "DELETE" },
        token,
      );
      if (!res.status || (res.status !== 204 && !res.ok)) throw new Error();
      toast.success("Destino eliminado");
      fetchList();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al eliminar";
      toast.error(msg || "Error al eliminar");
    } finally {
      setDeletingId(null);
    }
  };

  const create = async () => {
    if (!form.name.trim() || !form.countryId) {
      toast.error("Completá destino y país");
      return;
    }
    try {
      setCreateLoading(true);
      const res = await authFetch(
        "/api/destinations",
        {
          method: "POST",
          body: JSON.stringify({
            name: form.name.trim(),
            countryId: form.countryId,
            alt_names: (form.alt_names ?? [])
              .map((s) => s.toLowerCase())
              .filter(Boolean),
            enabled: form.enabled ?? true,
          }),
        },
        token,
      );
      if (!res.ok) throw new Error();
      toast.success("Destino creado");
      localStorage.setItem(LAST_COUNTRY_KEY, String(form.countryId || 0));
      setForm({
        name: "",
        countryId: form.countryId,
        alt_names: [],
        enabled: true,
      });
      fetchList();
    } catch {
      toast.error("Error al crear");
    } finally {
      setCreateLoading(false);
    }
  };

  const onKeyDownCreate = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") create();
  };

  return (
    <div className="space-y-8">
      <Card>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Buscar destino">
            <input
              className="w-full rounded-2xl border border-white/10 bg-white/50 p-2 outline-none backdrop-blur placeholder:font-light dark:bg-white/10"
              placeholder="Ej.: Miami, Bariloche…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </Field>
          <Field label="Filtrar por país">
            <select
              className="w-full rounded-2xl border border-white/10 bg-white/50 p-2 outline-none backdrop-blur dark:bg-white/10"
              value={countryIso2}
              onChange={(e) => setCountryIso2(e.target.value)}
            >
              <option value="">Todos</option>
              {countries.map((c) => (
                <option key={c.id_country} value={c.iso2}>
                  {c.name} ({c.iso2})
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">{loading ? <Spinner /> : null}</div>
        </div>
      </Card>

      <Card title="Agregar destino (rápido)">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <Field label="Nombre del destino" className="md:col-span-2">
            <input
              className="w-full rounded-2xl border border-white/10 bg-white/50 p-2 outline-none backdrop-blur placeholder:font-light dark:bg-white/10"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onKeyDown={onKeyDownCreate}
            />
          </Field>
          <Field label="País" className="md:col-span-2">
            <select
              className="w-full rounded-2xl border border-white/10 bg-white/50 p-2 outline-none backdrop-blur dark:bg-white/10"
              value={String(form.countryId || "")}
              onChange={(e) =>
                setForm((f) => ({ ...f, countryId: Number(e.target.value) }))
              }
            >
              <option value="">Seleccionar…</option>
              {countries.map((c) => (
                <option key={c.id_country} value={c.id_country}>
                  {c.name} ({c.iso2})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Estado">
            <select
              className="w-full rounded-2xl border border-white/10 bg-white/50 p-2 outline-none backdrop-blur dark:bg-white/10"
              value={String(form.enabled ?? true)}
              onChange={(e) =>
                setForm((f) => ({ ...f, enabled: e.target.value === "true" }))
              }
            >
              <option value="true">Activo</option>
              <option value="false">Inactivo</option>
            </select>
          </Field>
          <Field label="Otros nombres (opcional)" className="md:col-span-3">
            <input
              className="w-full rounded-2xl border border-white/10 bg-white/50 p-2 outline-none backdrop-blur placeholder:font-light dark:bg-white/10"
              placeholder="miami, miami beach"
              value={(form.alt_names ?? []).join(", ")}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  alt_names: e.target.value
                    .split(",")
                    .map((s) => s.trim().toLowerCase())
                    .filter(Boolean),
                }))
              }
              onKeyDown={onKeyDownCreate}
            />
          </Field>
          <div className="flex items-end">
            <Primary onClick={create} loading={createLoading}>
              Crear destino
            </Primary>
          </div>
        </div>
      </Card>

      <Card title="Listado">
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="min-w-full border-separate border-spacing-y-1 p-1">
            <thead>
              <tr className="text-left text-xs uppercase opacity-70">
                <Th>Destino</Th>
                <Th>País</Th>
                <Th>Otros nombres</Th>
                <Th>Estado</Th>
                <Th>Acciones</Th>
              </tr>
            </thead>
          </table>
          <div className="max-h-[48vh] overflow-auto">
            <table className="min-w-full border-separate border-spacing-y-1 p-1">
              <tbody>
                {rows.map((r) =>
                  r._editing ? (
                    <DestinationEditRow
                      key={r.id_destination}
                      row={r}
                      saving={savingId === r.id_destination}
                      countries={countries}
                      onCancel={() => cancelEdit(r.id_destination)}
                      onSave={(row) => saveEdit(row)}
                    />
                  ) : (
                    <motion.tr
                      key={r.id_destination}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl shadow-sm shadow-sky-950/5 backdrop-blur"
                    >
                      <Td>{r.name}</Td>
                      <Td>
                        {r.country.name} ({r.country.iso2})
                      </Td>
                      <Td className="truncate">
                        {r.alt_names.join(", ") || "-"}
                      </Td>
                      <Td>
                        <button
                          className={`h-full cursor-pointer appearance-none rounded-full border px-4 py-1 text-xs shadow-sm transition ${
                            r.enabled
                              ? "border-emerald-200 bg-emerald-100 text-emerald-900 dark:border-emerald-800/40 dark:bg-emerald-900/30 dark:text-emerald-100"
                              : "border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-800/40 dark:bg-amber-900/30 dark:text-amber-100"
                          } ${togglingId === r.id_destination ? "opacity-60" : ""}`}
                          onClick={() => toggleEnabled(r)}
                          title="Cambiar estado"
                          disabled={togglingId === r.id_destination}
                          aria-busy={togglingId === r.id_destination}
                        >
                          {togglingId === r.id_destination ? (
                            <Spinner />
                          ) : r.enabled ? (
                            "Activo"
                          ) : (
                            "Inactivo"
                          )}
                        </button>
                      </Td>
                      <Td>
                        <div className="flex gap-2">
                          <Secondary
                            onClick={() => startEdit(r.id_destination)}
                          >
                            <EditIcon />
                          </Secondary>
                          <Danger
                            onClick={() => remove(r.id_destination)}
                            loading={deletingId === r.id_destination}
                          >
                            <TrashIcon />
                          </Danger>
                        </div>
                      </Td>
                    </motion.tr>
                  ),
                )}
                {rows.length === 0 && (
                  <tr>
                    <Td colSpan={5} className="py-8 text-center opacity-70">
                      Sin resultados
                    </Td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );
}

function DestinationEditRow({
  row,
  countries,
  onCancel,
  onSave,
  saving,
}: {
  row: DestinationRow;
  countries: CountryOption[];
  onCancel: () => void;
  onSave: (row: DestinationRow) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<DestinationRow>({ ...row });

  return (
    <tr className="rounded-xl bg-white/70 shadow-sm shadow-sky-950/5 backdrop-blur dark:bg-white/10">
      <Td>
        <input
          className="w-full rounded-2xl border border-white/10 bg-white/50 p-2 outline-none backdrop-blur placeholder:font-light dark:bg-white/10"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />
      </Td>
      <Td>
        <select
          className="w-full rounded-2xl border border-white/10 bg-white/50 p-2 outline-none backdrop-blur dark:bg-white/10"
          value={draft.country.id_country}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              country: { ...d.country, id_country: Number(e.target.value) },
            }))
          }
        >
          {countries.map((c) => (
            <option key={c.id_country} value={c.id_country}>
              {c.name} ({c.iso2})
            </option>
          ))}
        </select>
      </Td>
      <Td>
        <input
          className="w-full rounded-2xl border border-white/10 bg-white/50 p-2 outline-none backdrop-blur placeholder:font-light dark:bg-white/10"
          value={draft.alt_names.join(", ")}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              alt_names: e.target.value
                .split(",")
                .map((s) => s.trim().toLowerCase())
                .filter(Boolean),
            }))
          }
        />
      </Td>
      <Td>
        <select
          className="w-full rounded-2xl border border-white/10 bg-white/50 p-2 outline-none backdrop-blur dark:bg-white/10"
          value={String(draft.enabled)}
          onChange={(e) =>
            setDraft((d) => ({ ...d, enabled: e.target.value === "true" }))
          }
        >
          <option value="true">Activo</option>
          <option value="false">Inactivo</option>
        </select>
      </Td>
      <Td>
        <div className="flex gap-2">
          <Primary onClick={() => onSave(draft)} loading={saving}>
            Guardar
          </Primary>
          <Secondary onClick={onCancel}>Cancelar</Secondary>
        </div>
      </Td>
    </tr>
  );
}

/* =========================== Modal Import JSON (dev) =========================== */

function JSONImportModal({
  open,
  onClose,
  token,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  token?: string | null;
  onImported?: () => void;
}) {
  const [kind, setKind] = useState<"countries" | "destinations">("countries");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (kind === "countries") {
      setText(
        JSON.stringify(
          {
            upsert: true,
            items: [
              { name: "España", iso2: "ES", enabled: true },
              { name: "Francia", iso2: "FR", enabled: false },
            ],
          },
          null,
          2,
        ),
      );
    } else {
      setText(
        JSON.stringify(
          {
            upsert: true,
            items: [
              {
                name: "Madrid",
                countryIso2: "ES",
                alt_names: ["madrid capital"],
                enabled: true,
              },
              {
                name: "París",
                countryIso2: "FR",
                alt_names: ["paris"],
                enabled: true,
              },
            ],
          },
          null,
          2,
        ),
      );
    }
  }, [open, kind]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  const submit = async () => {
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      toast.error("JSON inválido");
      return;
    }

    const url =
      kind === "countries" ? "/api/countries/bulk" : "/api/destinations/bulk";

    setLoading(true);
    try {
      const res = await authFetch(
        url,
        { method: "POST", body: JSON.stringify(payload) },
        token,
      );
      const body = await res
        .json()
        .catch(() => ({}) as Record<string, unknown>);
      if (!res.ok) {
        const msg =
          (body && (body as { error?: string }).error) || "Error al importar";
        throw new Error(msg);
      }
      toast.success("Importación exitosa");
      onImported?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al importar");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center">
      <div
        className="absolute inset-0 bg-sky-950/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative z-[101] w-[min(900px,92vw)] rounded-3xl border border-white/10 bg-white/95 p-5 shadow-2xl dark:bg-sky-950/80"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            Importar JSON — {kind === "countries" ? "Países" : "Destinos"}
          </h3>
          <Secondary onClick={onClose}>Cerrar</Secondary>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          <TabButton
            active={kind === "countries"}
            onClick={() => setKind("countries")}
          >
            Países
          </TabButton>
          <TabButton
            active={kind === "destinations"}
            onClick={() => setKind("destinations")}
          >
            Destinos
          </TabButton>
        </div>

        <div className="space-y-3">
          <p className="text-sm opacity-80">
            Pegá el JSON. Se usa <b>upsert</b> por defecto (no duplica).
          </p>
          <textarea
            className="h-[46vh] w-full resize-none rounded-2xl border border-white/10 bg-white/50 p-3 font-mono text-sm outline-none dark:bg-white/10"
            spellCheck={false}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex justify-end">
            <Primary onClick={submit} loading={loading}>
              Importar
            </Primary>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* =========================== UI helpers =========================== */

function Card({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0.95, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-3xl border border-white/10 bg-white/10 p-5 shadow-md shadow-sky-950/10 backdrop-blur"
    >
      {title ? <h3 className="mb-3 text-lg font-semibold">{title}</h3> : null}
      {children}
    </motion.section>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm opacity-80">{label}</label>
      {children}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2">{children}</th>;
}
function Td({
  children,
  colSpan,
  className = "",
}: {
  children: React.ReactNode;
  colSpan?: number;
  className?: string;
}) {
  return (
    <td colSpan={colSpan} className={`px-3 py-2 align-top ${className}`}>
      {children}
    </td>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`rounded-full border px-4 py-1 font-medium ${
        active
          ? "border-sky-200 bg-sky-100 text-sky-900 dark:border-sky-800/40 dark:bg-sky-900/30 dark:text-sky-100"
          : "border-sky-200/50 bg-sky-100/50 text-sky-900/50 transition-colors hover:border-sky-200 hover:bg-sky-100 hover:text-sky-900 dark:border-sky-800/20 dark:bg-sky-900/10 dark:text-sky-100/50 hover:dark:border-sky-800/40 hover:dark:bg-sky-900/30 hover:dark:text-sky-100"
      }`}
    >
      {children}
    </motion.button>
  );
}

function Primary({
  onClick,
  children,
  loading,
  disabled,
}: {
  onClick: () => void;
  children: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <motion.button
      whileTap={!loading ? { scale: 0.98 } : undefined}
      onClick={onClick}
      disabled={loading || disabled}
      aria-busy={!!loading}
      className="rounded-full border border-sky-200 bg-sky-100 px-4 py-1 font-medium text-sky-900 disabled:opacity-60 dark:border-sky-800/40 dark:bg-sky-900/30 dark:text-sky-100"
    >
      {loading ? <Spinner /> : children}
    </motion.button>
  );
}
function Secondary({
  onClick,
  children,
  disabled,
}: {
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border border-sky-200 bg-sky-100 px-4 py-1 font-medium text-sky-900 disabled:opacity-60 dark:border-sky-800/40 dark:bg-sky-900/30 dark:text-sky-100"
    >
      {children}
    </motion.button>
  );
}
function Danger({
  onClick,
  children,
  loading,
  disabled,
}: {
  onClick: () => void;
  children: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <motion.button
      whileTap={!loading ? { scale: 0.98 } : undefined}
      onClick={onClick}
      disabled={loading || disabled}
      aria-busy={!!loading}
      className="rounded-full border border-red-700/50 bg-red-600/70 px-4 py-1 font-medium text-red-50 disabled:opacity-60 dark:border-red-800/40 dark:bg-red-900/30 dark:text-red-100"
    >
      {loading ? <Spinner /> : children}
    </motion.button>
  );
}

/* =========================== Íconos =========================== */

function EditIcon() {
  return (
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
        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
      />
    </svg>
  );
}
function TrashIcon() {
  return (
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
        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
      />
    </svg>
  );
}
