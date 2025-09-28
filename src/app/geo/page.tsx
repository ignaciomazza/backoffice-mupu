"use client";

import React, { useEffect, useState } from "react";
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

/* =========================== Utils =========================== */

function useDebounced<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/* =========================== Tokens de UI =========================== */

const input =
  "w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sky-950 outline-none shadow-sm dark:border-sky-800/40 dark:bg-sky-900/20 dark:text-white";
const inputUpper = `${input} uppercase`;
const cardBase =
  "rounded-2xl border border-sky-200/60 bg-white p-5 shadow-sm dark:border-sky-800/40 dark:bg-sky-900/10";
const rowBase =
  "rounded-xl bg-white shadow-sm hover:shadow-md transition-shadow dark:bg-sky-900/10";

/* =========================== Página =========================== */

export default function GeoAdminPage() {
  const { token, role, loading } = useAuth();
  const [tab, setTab] = useState<"countries" | "destinations">("countries");

  const r = (role ?? "").toLowerCase();
  const allowed = r === "desarrollador" || r === "gerente";
  const isDev = r === "desarrollador";

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
      </motion.header>

      {/* Panel principal */}
      <AnimatePresence mode="wait">
        {tab === "countries" ? (
          <motion.div
            key="tab-countries"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="space-y-8"
          >
            <CountriesPanel token={token} />
            {isDev && <DevJsonPanel token={token} mode="countries" />}
          </motion.div>
        ) : (
          <motion.div
            key="tab-destinations"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="space-y-8"
          >
            <DestinationsPanel token={token} />
            {isDev && <DevJsonPanel token={token} mode="destinations" />}
          </motion.div>
        )}
      </AnimatePresence>

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

  const fetchList = async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debounced.trim()) params.set("q", debounced.trim());
      params.set("take", "500");

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
  };

  useEffect(() => {
    const c = new AbortController();
    fetchList(c.signal);
    return () => c.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const startEdit = (id: number) => setEditingId(id);

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
    <>
      <Card>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Buscar país">
            <input
              className={input}
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
              className={input}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onKeyDown={onKeyDownCreate}
            />
          </Field>
          <Field label="Código de país (2 letras)">
            <input
              className={inputUpper}
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
              className={input}
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
        <div className="overflow-hidden rounded-xl border border-sky-200/60">
          <table className="min-w-full border-separate border-spacing-y-1">
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
                    onCancel={() => setEditingId(null)}
                    onSave={saveEdit}
                  />
                ) : (
                  <motion.tr
                    key={r.id_country}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={rowBase}
                  >
                    <Td>{r.name}</Td>
                    <Td>{r.iso2}</Td>
                    <Td>
                      <button
                        className={`h-full cursor-pointer appearance-none rounded-full border px-5 py-1.5 text-sm shadow-sm transition ${
                          r.enabled
                            ? "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-900/30 dark:text-emerald-100"
                            : "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/30 dark:text-amber-100"
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
    </>
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
  } catch {
    toast.error("Error al eliminar");
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
    <tr className="rounded-xl bg-sky-50 shadow-sm dark:bg-sky-900/10">
      <Td>
        <input
          className={input}
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />
      </Td>
      <Td>
        <input
          className={inputUpper}
          maxLength={2}
          value={draft.iso2}
          onChange={(e) =>
            setDraft((d) => ({ ...d, iso2: e.target.value.toUpperCase() }))
          }
        />
      </Td>
      <Td>
        <select
          className={input}
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
          "/api/countries?take=1000",
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

  const fetchList = async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debounced.trim()) params.set("q", debounced.trim());
      if (countryIso2) params.set("countryIso2", countryIso2);
      params.set("take", "30");

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
  };

  useEffect(() => {
    const c = new AbortController();
    fetchList(c.signal);
    return () => c.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, countryIso2]);

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
    } catch {
      toast.error("Error al eliminar");
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
    <>
      <Card>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Buscar destino">
            <input
              className={input}
              placeholder="Ej.: Miami, Bariloche…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </Field>
          <Field label="Filtrar por país">
            <select
              className={input}
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
              className={input}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onKeyDown={onKeyDownCreate}
            />
          </Field>
          <Field label="País" className="md:col-span-2">
            <select
              className={input}
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
              className={input}
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
              className={input}
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
        <div className="overflow-hidden rounded-xl border border-sky-200/60">
          <table className="min-w-full border-separate border-spacing-y-1">
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
            <table className="min-w-full border-separate border-spacing-y-1">
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
                      className={rowBase}
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
                          className={`h-full cursor-pointer appearance-none rounded-full border px-5 py-1.5 text-sm shadow-sm transition ${
                            r.enabled
                              ? "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-900/30 dark:text-emerald-100"
                              : "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/30 dark:text-amber-100"
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
    </>
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
    <tr className="rounded-xl bg-sky-50 shadow-sm dark:bg-sky-900/10">
      <Td>
        <input
          className={input}
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />
      </Td>
      <Td>
        <select
          className={input}
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
          className={input}
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
          className={input}
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

/* =========================== Dev · Carga JSON =========================== */

function DevJsonPanel({
  token,
  mode,
}: {
  token?: string | null;
  mode: "countries" | "destinations";
}) {
  const [open, setOpen] = useState(false);
  const [upsert, setUpsert] = useState(true);
  const [text, setText] = useState("");
  const [valid, setValid] = useState<null | number>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    // placeholder útil
    if (mode === "countries") {
      setText(
        `[
  { "name": "Argentina", "iso2": "AR", "enabled": true },
  { "name": "Uruguay",   "iso2": "UY" }
]`,
      );
    } else {
      setText(
        `[
  { "name": "Miami", "countryIso2": "US", "alt_names": ["miami beach"] },
  { "name": "Bariloche", "countryIso2": "AR", "enabled": true }
]`,
      );
    }
  }, [mode]);

  // validación rápida
  useEffect(() => {
    try {
      const arr = JSON.parse(text);
      if (!Array.isArray(arr)) {
        setValid(null);
        setError("El JSON debe ser un array");
        return;
      }
      setValid(arr.length);
      setError(null);
    } catch (e: unknown) {
      setValid(null);
      setError((e as Error)?.message || "JSON inválido");
    }
  }, [text]);

  const submit = async () => {
    try {
      setSending(true);
      const items = JSON.parse(text);

      if (mode === "countries") {
        const res = await authFetch(
          "/api/countries/bulk",
          {
            method: "POST",
            body: JSON.stringify({ upsert, items }),
          },
          token,
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || "Error al cargar países");
        const created = (body?.created ?? body?.items?.length ?? 0) as number;
        toast.success(`Países procesados: ${created}`);
      } else {
        const res = await authFetch(
          "/api/destinations/bulk",
          {
            method: "POST",
            body: JSON.stringify({ upsert, items }),
          },
          token,
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || "Error al cargar destinos");
        const count = (body?.count ?? 0) as number;
        toast.success(`Destinos procesados: ${count}`);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error en carga JSON");
    } finally {
      setSending(false);
    }
  };

  return (
    <Card
      title={`Dev · Carga JSON (${mode === "countries" ? "países" : "destinos"})`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm opacity-80">
          Pegá un <b>array JSON</b>. Campos mínimos:
          {mode === "countries" ? (
            <>
              {" "}
              <code>name</code> y <code>iso2</code>.{" "}
            </>
          ) : (
            <>
              {" "}
              <code>name</code> y <code>countryIso2</code> o{" "}
              <code>countryId</code>.{" "}
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={upsert}
              onChange={(e) => setUpsert(e.target.checked)}
            />
            Upsert
          </label>
          <Secondary onClick={() => setOpen((v) => !v)}>
            {open ? "Ocultar" : "Mostrar"}
          </Secondary>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mt-4 space-y-3"
          >
            <textarea
              className={`${input} min-h-[180px] font-mono`}
              spellCheck={false}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder='[{"name":"...","iso2":".."}]'
            />
            <div className="flex items-center justify-between text-sm">
              <div
                className={
                  error
                    ? "text-amber-700 dark:text-amber-300"
                    : "text-emerald-700 dark:text-emerald-300"
                }
              >
                {error
                  ? `⚠ ${error}`
                  : valid != null
                    ? `✓ JSON válido · ${valid} ítems`
                    : "—"}
              </div>
              <Primary
                onClick={submit}
                loading={sending}
                disabled={!!error || !valid}
              >
                Enviar JSON
              </Primary>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
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
      transition={{ duration: 0.2 }}
      className={cardBase}
    >
      {title ? (
        <h3 className="mb-3 text-lg font-semibold tracking-tight">{title}</h3>
      ) : null}
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
      className={`rounded-full border px-6 py-2 font-medium ${
        active
          ? "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-800/40 dark:bg-sky-900/30 dark:text-sky-100"
          : "border-sky-200/70 bg-sky-50 text-sky-900/70 transition-colors hover:border-sky-300 hover:bg-sky-100 hover:text-sky-900 dark:border-sky-800/20 dark:bg-sky-900/10 dark:text-sky-100/60 hover:dark:border-sky-800/40 hover:dark:bg-sky-900/30 hover:dark:text-sky-100"
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
      className="rounded-full border border-sky-300 bg-sky-100 px-6 py-2 font-medium text-sky-900 transition-colors hover:opacity-95 disabled:opacity-60 dark:border-sky-800/40 dark:bg-sky-900/30 dark:text-sky-100"
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
      className="rounded-full border border-sky-200 bg-white px-6 py-2 font-medium text-sky-900 transition-colors hover:opacity-95 disabled:opacity-60 dark:border-sky-800/40 dark:bg-sky-900/10 dark:text-sky-100"
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
      className="rounded-full border border-red-700/30 bg-red-600/80 px-6 py-2 font-medium text-white transition-colors hover:opacity-95 disabled:opacity-60 dark:border-red-800/40 dark:bg-red-900/40"
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
      className="size-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 7.125 16.862 4.487M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
      />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="size-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.75 9.75v8.25m4.5-8.25v8.25M4.5 6.75h15m-1.5 0-.43 11.62a2.25 2.25 0 0 1-2.24 2.13H8.67a2.25 2.25 0 0 1-2.24-2.13L6 6.75m3-2.25h6a1.5 1.5 0 0 1 1.5 1.5v.75H4.5V6A1.5 1.5 0 0 1 6 4.5h3Z"
      />
    </svg>
  );
}
