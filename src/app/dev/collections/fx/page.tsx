"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import { normalizeRole } from "@/utils/permissions";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

type BspItem = {
  id_fx_rate: number;
  fx_type: "DOLAR_BSP";
  rate_date: string;
  ars_per_usd: number;
  note: string | null;
  created_at: string;
  updated_at: string;
};

function todayDateInput(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function AdminBspRatesPage() {
  const { token, role, loading: authLoading } = useAuth();
  const normalizedRole = useMemo(() => normalizeRole(role), [role]);
  const canAccess = normalizedRole === "desarrollador" || normalizedRole === "gerente";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<BspItem[]>([]);

  const [rateDate, setRateDate] = useState(todayDateInput());
  const [arsPerUsd, setArsPerUsd] = useState("");
  const [note, setNote] = useState("");

  const loadRates = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await authFetch(
        "/api/admin/fx-rates/bsp",
        { cache: "no-store" },
        token,
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || "No se pudo cargar cotización BSP");
      }
      const json = (await res.json()) as { items: BspItem[] };
      setItems(json.items || []);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo cargar cotización BSP";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token || !canAccess) return;
    void loadRates();
  }, [token, canAccess, loadRates]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    setSaving(true);
    try {
      const res = await authFetch(
        "/api/admin/fx-rates/bsp",
        {
          method: "POST",
          body: JSON.stringify({
            rate_date: rateDate,
            ars_per_usd: Number(arsPerUsd),
            note: note || undefined,
          }),
        },
        token,
      );

      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || "No se pudo guardar BSP");
      }

      toast.success("Cotización BSP guardada");
      setArsPerUsd("");
      setNote("");
      await loadRates();
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo guardar BSP";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-[40vh] items-center justify-center">
          <Spinner />
        </div>
      </ProtectedRoute>
    );
  }

  if (!canAccess) {
    return (
      <ProtectedRoute>
        <section className="mx-auto mt-6 max-w-4xl rounded-3xl border border-rose-300/40 bg-rose-100/20 p-6 text-sm text-rose-900 dark:border-rose-300/30 dark:bg-rose-500/10 dark:text-rose-50">
          No tenés permisos para acceder a Cotización BSP.
        </section>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <section className="mx-auto mt-4 max-w-5xl space-y-5 text-sky-950 dark:text-white">
        <header className="rounded-3xl border border-white/30 bg-white/10 p-6 shadow-lg shadow-sky-900/10 backdrop-blur">
          <h1 className="text-2xl font-semibold">Cotización BSP</h1>
          <p className="mt-1 text-sm opacity-80">
            Carga manual diaria de Dólar BSP (USD → ARS).
          </p>
        </header>

        <article className="rounded-3xl border border-white/30 bg-white/10 p-6 shadow-lg shadow-sky-900/10 backdrop-blur">
          <h2 className="text-lg font-semibold">Cargar/Actualizar valor</h2>
          <form className="mt-4 grid gap-3 md:grid-cols-3" onSubmit={handleSubmit}>
            <label className="grid gap-1 text-sm">
              <span className="text-xs opacity-70">Fecha</span>
              <input
                type="date"
                value={rateDate}
                onChange={(e) => setRateDate(e.target.value)}
                required
                className="rounded-2xl border border-sky-200 bg-white/60 px-4 py-2 text-sm shadow-sm outline-none dark:border-sky-200/60 dark:bg-sky-100/10"
              />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="text-xs opacity-70">ARS por USD</span>
              <input
                value={arsPerUsd}
                onChange={(e) => setArsPerUsd(e.target.value)}
                placeholder="1360.50"
                required
                className="rounded-2xl border border-sky-200 bg-white/60 px-4 py-2 text-sm shadow-sm outline-none dark:border-sky-200/60 dark:bg-sky-100/10"
              />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="text-xs opacity-70">Nota (opcional)</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Fuente / observación"
                className="rounded-2xl border border-sky-200 bg-white/60 px-4 py-2 text-sm shadow-sm outline-none dark:border-sky-200/60 dark:bg-sky-100/10"
              />
            </label>

            <div className="md:col-span-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-full border border-emerald-300/60 bg-emerald-100/5 px-4 py-2 text-xs font-medium shadow-sm shadow-emerald-900/10 transition hover:brightness-110 disabled:opacity-50"
              >
                {saving ? "Guardando..." : "Guardar BSP"}
              </button>
            </div>
          </form>
        </article>

        <article className="rounded-3xl border border-white/30 bg-white/10 p-6 shadow-lg shadow-sky-900/10 backdrop-blur">
          <h2 className="text-lg font-semibold">Últimos 30 días</h2>
          {loading ? (
            <div className="mt-4 flex min-h-[20vh] items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <div className="mt-4 overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs opacity-70">
                    <th className="pb-2 pr-3">Fecha</th>
                    <th className="pb-2 pr-3">ARS/USD</th>
                    <th className="pb-2 pr-3">Nota</th>
                    <th className="pb-2 pr-3">Actualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td className="py-3 text-xs opacity-70" colSpan={4}>
                        Sin registros.
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr key={item.id_fx_rate} className="border-t border-white/20">
                        <td className="py-2 pr-3">{item.rate_date}</td>
                        <td className="py-2 pr-3">{Number(item.ars_per_usd).toFixed(6)}</td>
                        <td className="py-2 pr-3">{item.note || "-"}</td>
                        <td className="py-2 pr-3">
                          {new Intl.DateTimeFormat("es-AR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "America/Argentina/Buenos_Aires",
                          }).format(new Date(item.updated_at))}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
          {/* TODO(PR #2): usar este valor para corrida automática del día 8. */}
        </article>
      </section>
      <ToastContainer position="top-right" autoClose={2200} />
    </ProtectedRoute>
  );
}
