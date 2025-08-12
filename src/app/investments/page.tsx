// src/app/investments/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import Spinner from "@/components/Spinner";
import { motion } from "framer-motion";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// ==== Tipos ====
type Investment = {
  id_investment: number;
  id_agency: number;
  category: string;
  description: string;
  amount: number;
  currency: string;
  created_at: string;
  paid_at?: string | null;
  user_id?: number | null;
  operator_id?: number | null;
  user?: { id_user: number; first_name: string; last_name: string } | null;
  operator?: { id_operator: number; name: string } | null;
  createdBy?: { id_user: number; first_name: string; last_name: string } | null;
};

type User = { id_user: number; first_name: string; last_name: string };
type Operator = { id_operator: number; name: string };

// ==== Debounce simple ====
function useDebounced<T>(value: T, delay = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

// ==== Constantes ====
const DEFAULT_CATEGORIES = [
  "MONOTRIBUTOS",
  "ALQUILER",
  "LUZ",
  "AFIP",
  "TEL/INTERNET",
  "MUNICIPALIDAD",
  "PUBLICIDAD",
  "DEPTO MARKETING",
  "DEPTO PROGRAMACIÓN",
  "DEPTO SALÓN",
  "DEPTO ONLINE",
  "DEPTO ADMINISTRACIÓN",
  "DEPTO DECO",
  "MANTENCIÓN OFICINA",
  "LIBRERIA  E IMPRENTA",
  "GENERALES",
  "AMADEUS",
  "APTOUR",
  "CAFÉ Y AZUCAR",
  "COMIDA",
  "DEBITO BANCARIO MACRO SRL",
  "DEBITO BANCARIO GALICIA SRL",
  "OPERADOR",
  "SUELDO",
  "COMISION",
] as const;

// ==== Componente ====
export default function Page() {
  const { token } = useAuth();

  // ------- UI / form state -------
  const [isFormOpen, setIsFormOpen] = useState(true);
  const [loading, setLoading] = useState(false);

  // auxiliares (selects)
  const [users, setUsers] = useState<User[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [agencyId, setAgencyId] = useState<number | null>(null);

  // lista
  const [items, setItems] = useState<Investment[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // filtros
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("");
  const [currency, setCurrency] = useState<string>("");
  const debouncedQ = useDebounced(q, 400);

  // form
  const [form, setForm] = useState<{
    category: string;
    description: string;
    amount: string; // mantener string para el input
    currency: string;
    paid_at: string; // YYYY-MM-DD
    user_id: number | null;
    operator_id: number | null;
    paid_today: boolean;
  }>({
    category: "",
    description: "",
    amount: "",
    currency: "ARS",
    paid_at: "",
    user_id: null,
    operator_id: null,
    paid_today: false,
  });

  // === Estado de edición ===
  const [editingId, setEditingId] = useState<number | null>(null);

  function resetForm() {
    setForm({
      category: "",
      description: "",
      amount: "",
      currency: "ARS",
      paid_at: "",
      user_id: null,
      operator_id: null,
      paid_today: false,
    });
    setEditingId(null);
  }

  function beginEdit(inv: Investment) {
    setForm({
      category: inv.category ?? "",
      description: inv.description ?? "",
      amount: String(inv.amount ?? ""),
      currency: inv.currency ?? "ARS",
      paid_at: inv.paid_at ? inv.paid_at.slice(0, 10) : "",
      user_id: inv.user_id ?? null,
      operator_id: inv.operator_id ?? null,
      paid_today: false,
    });
    setEditingId(inv.id_investment);
    setIsFormOpen(true);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function deleteCurrent() {
    if (!editingId || !token) return;
    try {
      const res = await authFetch(
        `/api/investments/${editingId}`,
        { method: "DELETE" },
        token,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "No se pudo eliminar el gasto");
      }
      setItems((prev) => prev.filter((i) => i.id_investment !== editingId));
      toast.success("Gasto eliminado");
      resetForm();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    }
  }

  // ========= Cargar perfil (agencyId) + users =========
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const pr = await authFetch(
          "/api/user/profile",
          { cache: "no-store" },
          token,
        );
        if (pr.ok) {
          const p = await pr.json();
          setAgencyId(p.id_agency ?? null);
        }
      } catch {}
      try {
        const u = await authFetch("/api/users", { cache: "no-store" }, token);
        if (u.ok) setUsers(await u.json());
      } catch {}
    })();
  }, [token]);

  // ========= Cargar operadores usando agencyId =========
  useEffect(() => {
    if (!token || agencyId == null) return;
    (async () => {
      try {
        const o = await authFetch(
          `/api/operators?agencyId=${agencyId}`,
          { cache: "no-store" },
          token,
        );
        if (o.ok) setOperators(await o.json());
        else setOperators([]);
      } catch {
        setOperators([]);
      }
    })();
  }, [token, agencyId]);

  // ========= Lista con abort/race-safe =========
  const listAbortRef = useRef<AbortController | null>(null);
  const reqIdRef = useRef(0);

  const buildQuery = useCallback(
    (cursor?: number | null) => {
      const qs = new URLSearchParams();
      if (debouncedQ.trim()) qs.append("q", debouncedQ.trim());
      if (category) qs.append("category", category);
      if (currency) qs.append("currency", currency);
      qs.append("take", "24");
      if (cursor) qs.append("cursor", String(cursor));
      return qs.toString();
    },
    [debouncedQ, category, currency],
  );

  const fetchList = useCallback(async () => {
    if (!token) return;
    setLoadingList(true);

    // cancelar anterior
    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;
    const myId = ++reqIdRef.current;

    try {
      const res = await authFetch(
        `/api/investments?${buildQuery()}`,
        { cache: "no-store", signal: controller.signal },
        token,
      );
      if (!res.ok) throw new Error("No se pudo obtener la lista");
      const { items, nextCursor } = (await res.json()) as {
        items: Investment[];
        nextCursor: number | null;
      };
      if (myId !== reqIdRef.current) return;
      setItems(items);
      setNextCursor(nextCursor ?? null);
    } catch (e: unknown) {
      if ((e as { name?: string }).name === "AbortError") return;
      console.error(e);
      toast.error("Error cargando gastos");
      setItems([]);
      setNextCursor(null);
    } finally {
      if (!controller.signal.aborted) setLoadingList(false);
    }
  }, [buildQuery, token]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const loadMore = useCallback(async () => {
    if (!token || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await authFetch(
        `/api/investments?${buildQuery(nextCursor)}`,
        { cache: "no-store" },
        token,
      );
      if (!res.ok) throw new Error("No se pudieron cargar más");
      const { items: more, nextCursor: c } = (await res.json()) as {
        items: Investment[];
        nextCursor: number | null;
      };
      setItems((prev) => [...prev, ...more]);
      setNextCursor(c ?? null);
    } catch (e: unknown) {
      console.error(e);
      toast.error("No se pudieron cargar más registros");
    } finally {
      setLoadingMore(false);
    }
  }, [token, nextCursor, loadingMore, buildQuery]);

  // ========= Crear / Actualizar =========
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const categoryLower = form.category.trim().toLowerCase();
    const amountNum = Number(form.amount);

    if (!form.category || !form.description || !form.currency) {
      toast.error("Completá categoría, descripción y moneda");
      return;
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error("El monto debe ser un número positivo");
      return;
    }
    if (categoryLower === "operador" && !form.operator_id) {
      toast.error("Para categoría OPERADOR, seleccioná un operador");
      return;
    }
    if (["sueldo", "comision"].includes(categoryLower) && !form.user_id) {
      toast.error("Para SUELDO/COMISION, seleccioná un usuario");
      return;
    }

    const paid_at =
      form.paid_today && !form.paid_at
        ? new Date().toISOString().slice(0, 10)
        : form.paid_at || undefined;

    const payload = {
      category: form.category,
      description: form.description,
      amount: amountNum,
      currency: form.currency,
      paid_at,
      user_id: form.user_id ?? undefined,
      operator_id: form.operator_id ?? undefined,
    };

    setLoading(true);
    try {
      // CREATE vs UPDATE
      if (!editingId) {
        const res = await authFetch(
          "/api/investments",
          { method: "POST", body: JSON.stringify(payload) },
          token || undefined,
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || "No se pudo crear el gasto");
        }
        const created = (await res
          .json()
          .catch(() => null)) as Investment | null;
        if (created) {
          setItems((prev) => [created, ...prev]);
        } else {
          await fetchList();
        }
        toast.success("Gasto cargado");
        resetForm();
      } else {
        const res = await authFetch(
          `/api/investments/${editingId}`,
          { method: "PUT", body: JSON.stringify(payload) },
          token || undefined,
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || "No se pudo actualizar el gasto");
        }
        const updated = (await res.json()) as Investment;
        setItems((prev) =>
          prev.map((it) =>
            it.id_investment === updated.id_investment ? updated : it,
          ),
        );
        toast.success("Gasto actualizado");
        resetForm();
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  // ========= Helpers UI =========
  const isOperador = form.category.toLowerCase() === "operador";
  const isSueldo = form.category.toLowerCase() === "sueldo";
  const isComision = form.category.toLowerCase() === "comision";

  const input =
    "w-full appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white";

  const formatDate = (s?: string | null) =>
    s ? new Date(s).toLocaleDateString("es-AR", { timeZone: "UTC" }) : "-";

  const previewAmount = useMemo(() => {
    const n = Number(form.amount);
    if (!Number.isFinite(n)) return "";
    try {
      return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: form.currency || "ARS",
        minimumFractionDigits: 2,
      }).format(n);
    } catch {
      return `${n.toFixed(2)} ${form.currency}`;
    }
  }, [form.amount, form.currency]);

  const totalsByCurrency = useMemo(() => {
    return items.reduce<Record<string, number>>((acc, it) => {
      acc[it.currency] = (acc[it.currency] || 0) + Number(it.amount || 0);
      return acc;
    }, {});
  }, [items]);

  const resetFilters = () => {
    setQ("");
    setCategory("");
    setCurrency("");
  };

  return (
    <ProtectedRoute>
      <section className="text-sky-950 dark:text-white">
        {/* FORM */}
        <motion.div
          layout
          initial={{ maxHeight: 100, opacity: 1 }}
          animate={{
            maxHeight: isFormOpen ? 700 : 100,
            opacity: 1,
            transition: { duration: 0.4, ease: "easeInOut" },
          }}
          className="mb-6 space-y-3 overflow-hidden rounded-3xl border border-white/10 bg-white/10 p-6 shadow-md shadow-sky-950/10 backdrop-blur"
        >
          <div
            className="flex cursor-pointer items-center justify-between"
            onClick={() => setIsFormOpen((v) => !v)}
          >
            <p className="text-lg font-medium">
              {editingId ? "Editar gasto" : "Cargar gasto"}
            </p>
            <button className="rounded-full bg-sky-100 p-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white">
              {isFormOpen ? (
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
                    d="M5 12h14"
                  />
                </svg>
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
                    d="M12 4.5v15m7.5-7.5h-15"
                  />
                </svg>
              )}
            </button>
          </div>

          {isFormOpen && (
            <form
              onSubmit={onSubmit}
              className="grid grid-cols-1 gap-4 md:grid-cols-2"
            >
              <div>
                <label className="ml-2 block">Categoría</label>
                <select
                  className={`${input} cursor-pointer`}
                  value={form.category}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      category: e.target.value,
                      user_id: null,
                      operator_id: null,
                    }))
                  }
                  required
                >
                  <option value="" disabled>
                    Seleccionar…
                  </option>
                  {DEFAULT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="ml-2 block">Fecha de pago (opcional)</label>
                <input
                  type="date"
                  className={`${input} cursor-pointer`}
                  value={form.paid_at}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, paid_at: e.target.value }))
                  }
                />
              </div>

              <div className="md:col-span-2">
                <label className="ml-2 block">Descripción</label>
                <input
                  className={input}
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  placeholder="Concepto / detalle del gasto…"
                  required
                />
              </div>

              <div>
                <label className="ml-2 block">Monto</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  className={input}
                  value={form.amount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, amount: e.target.value }))
                  }
                  placeholder="0.00"
                  required
                />
                {form.amount && (
                  <div className="ml-2 mt-1 text-sm opacity-80">
                    {previewAmount}
                  </div>
                )}
              </div>

              <div>
                <label className="ml-2 block">Moneda</label>
                <select
                  className={`${input} cursor-pointer`}
                  value={form.currency}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, currency: e.target.value }))
                  }
                  required
                >
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                </select>
              </div>

              {isOperador && (
                <div className="md:col-span-2">
                  <label className="ml-2 block">Operador</label>
                  <select
                    className={`${input} cursor-pointer`}
                    value={form.operator_id ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        operator_id: e.target.value
                          ? Number(e.target.value)
                          : null,
                      }))
                    }
                    required
                  >
                    <option value="" disabled>
                      Seleccionar operador…
                    </option>
                    {operators.map((o) => (
                      <option key={o.id_operator} value={o.id_operator}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(isSueldo || isComision) && (
                <div className="md:col-span-2">
                  <label className="ml-2 block">
                    {isSueldo ? "Empleado" : "Vendedor"}
                  </label>
                  <select
                    className={`${input} cursor-pointer`}
                    value={form.user_id ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        user_id: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                    required
                  >
                    <option value="" disabled>
                      Seleccionar usuario…
                    </option>
                    {users.map((u) => (
                      <option key={u.id_user} value={u.id_user}>
                        {u.first_name} {u.last_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex flex-wrap gap-3 md:col-span-2">
                <button
                  type="submit"
                  disabled={loading}
                  className={`mt-2 rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white ${
                    loading ? "opacity-60" : ""
                  }`}
                >
                  {loading ? (
                    <Spinner />
                  ) : editingId ? (
                    "Actualizar gasto"
                  ) : (
                    "Agregar gasto"
                  )}
                </button>

                {editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("¿Eliminar este gasto?")) deleteCurrent();
                    }}
                    className="mt-2 rounded-full bg-red-600 px-6 py-2 text-center text-red-100 shadow-sm shadow-red-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-red-800"
                    title="Eliminar gasto"
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
                )}
              </div>
            </form>
          )}
        </motion.div>

        {/* FILTROS */}
        <div className="mb-4 flex items-center gap-2">
          <div className="flex w-full items-center gap-2 rounded-2xl border border-sky-950/10 backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white">
            <input
              className="w-full bg-transparent p-2 px-3 outline-none"
              placeholder="Buscar por texto, usuario u operador…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") fetchList();
              }}
            />
            <button
              onClick={fetchList}
              className="w-fit cursor-pointer appearance-none px-3 outline-none"
              title="Buscar"
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
                  d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                />
              </svg>
            </button>
          </div>

          <select
            className="cursor-pointer appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Categoria</option>
            {DEFAULT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            className="cursor-pointer appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            <option value="">Moneda</option>
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>

          <button
            onClick={resetFilters}
            className="h-full cursor-pointer appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
            title="Limpiar filtros"
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
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
          </button>
        </div>

        {/* RESUMEN */}
        {Object.keys(totalsByCurrency).length > 0 && (
          <div className="mb-3 flex flex-wrap gap-3 text-sm opacity-90">
            {Object.entries(totalsByCurrency).map(([cur, total]) => (
              <span
                key={cur}
                className="rounded-xl border border-white/10 bg-white/10 px-3 py-1"
              >
                Total {cur}:{" "}
                {new Intl.NumberFormat("es-AR", {
                  style: "currency",
                  currency: cur,
                }).format(total)}
              </span>
            ))}
          </div>
        )}

        {/* LISTA */}
        {loadingList ? (
          <div className="flex min-h-[40vh] items-center">
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/10 p-6 text-center opacity-80">
            No hay gastos para los filtros seleccionados.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((it) => (
              <div
                key={it.id_investment}
                className="rounded-3xl border border-white/10 bg-white/10 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">{it.category}</div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm opacity-70">
                      #{it.id_investment}
                    </div>
                    <button
                      onClick={() => beginEdit(it)}
                      className="rounded-full bg-sky-100 p-1.5 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white"
                      title="Editar gasto"
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
                          d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="mt-1 text-lg opacity-90">{it.description}</div>
                <div className="mt-2 flex flex-wrap gap-4 text-sm">
                  <span>
                    <b>Monto:</b>{" "}
                    {new Intl.NumberFormat("es-AR", {
                      style: "currency",
                      currency: it.currency,
                    }).format(it.amount)}
                  </span>
                  <span>
                    <b>Creado:</b> {formatDate(it.created_at)}
                  </span>
                  {it.paid_at && (
                    <span>
                      <b>Pagado:</b> {formatDate(it.paid_at)}
                    </span>
                  )}
                  {it.operator && (
                    <span>
                      <b>Operador:</b> {it.operator.name}
                    </span>
                  )}
                  {it.user && (
                    <span>
                      <b>Usuario:</b> {it.user.first_name} {it.user.last_name}
                    </span>
                  )}
                  {it.createdBy && (
                    <span className="opacity-80">
                      <b>Cargado por:</b> {it.createdBy.first_name}{" "}
                      {it.createdBy.last_name}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {nextCursor && (
              <div className="flex justify-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 disabled:opacity-60 dark:bg-white/10 dark:text-white"
                >
                  {loadingMore ? <Spinner /> : "Ver más"}
                </button>
              </div>
            )}
          </div>
        )}

        <ToastContainer />
      </section>
    </ProtectedRoute>
  );
}
