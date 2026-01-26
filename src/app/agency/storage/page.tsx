"use client";

import { useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import { formatBytes } from "@/lib/storage/constants";

const pct = (value: number, total: number) =>
  total > 0 ? Math.min((value / total) * 100, 110) : 0;

type StorageSummary = {
  enabled: boolean;
  scope: "agency" | "group";
  owner_id: number;
  member_count: number;
  packs: { storage: number; transfer: number };
  base_gb: { storage: number; transfer: number };
  limits: { storage_bytes: number; transfer_bytes: number };
  usage: {
    storage_bytes: number;
    transfer_bytes: number;
    pending_bytes: number;
    transfer_month: string;
  };
  percent: { storage: number; transfer: number };
  thresholds: { warn: number; limit: number; block: number };
  blocked: boolean;
};

export default function AgencyStoragePage() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<StorageSummary | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    (async () => {
      try {
        const res = await authFetch("/api/storage/summary", {}, token);
        if (!res.ok) throw new Error("Error al cargar almacenamiento");
        const data = (await res.json()) as StorageSummary;
        setSummary(data);
      } catch (err) {
        console.error("[agency/storage]", err);
        setSummary(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const scopeLabel = useMemo(() => {
    if (!summary) return "";
    return summary.scope === "group"
      ? `Grupo de facturación (${summary.member_count} agencias)`
      : "Agencia individual";
  }, [summary]);

  return (
    <ProtectedRoute>
      <section className="text-sky-950 dark:text-white">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.2em] text-sky-900/70 dark:text-sky-100/70">
            Agencia
          </p>
          <h1 className="text-3xl font-semibold">Almacenamiento</h1>
        </div>

        {loading && (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Spinner />
          </div>
        )}

        {!loading && summary && (
          <div className="rounded-3xl border border-white/10 bg-white/10 p-6 shadow-md shadow-sky-950/10 backdrop-blur">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Plan de archivos</p>
                <p className="text-xs text-sky-900/70 dark:text-white/70">
                  {summary.enabled
                    ? `${summary.base_gb.storage} GB almacenamiento · ${summary.base_gb.transfer} GB transferencia/mes`
                    : "Sin plan activo"}
                </p>
                <p className="mt-2 text-xs text-sky-900/60 dark:text-white/60">
                  {scopeLabel}
                </p>
              </div>
              {summary.enabled && (
                <div className="rounded-full border border-white/10 bg-white/60 px-3 py-1 text-xs text-sky-900 dark:bg-white/10 dark:text-white">
                  Packs: {summary.packs.storage} almacenamiento · {summary.packs.transfer} transferencia
                </div>
              )}
            </div>

            {!summary.enabled && (
              <div className="mt-4 rounded-2xl border border-amber-200/40 bg-amber-50/70 p-4 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-100">
                Activá el plan de archivos para habilitar subidas y control de cupo.
              </div>
            )}

            {summary.enabled && (
              <div className="mt-6 space-y-5">
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Almacenamiento usado</span>
                    <span className="font-semibold">
                      {formatBytes(summary.usage.storage_bytes)} / {formatBytes(summary.limits.storage_bytes)}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/40">
                    <div
                      className={`h-full rounded-full ${summary.blocked ? "bg-rose-500" : "bg-sky-500"}`}
                      style={{
                        width: `${pct(summary.usage.storage_bytes, summary.limits.storage_bytes)}%`,
                      }}
                    />
                  </div>
                  {summary.blocked && (
                    <p className="mt-2 text-xs text-rose-600">
                      Se superó el 110% del cupo. Se bloquean nuevas subidas.
                    </p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Transferencia mensual</span>
                    <span className="font-semibold">
                      {formatBytes(summary.usage.transfer_bytes)} / {formatBytes(summary.limits.transfer_bytes)}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/40">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{
                        width: `${pct(summary.usage.transfer_bytes, summary.limits.transfer_bytes)}%`,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-sky-900/60 dark:text-white/60">
                    Mes en curso: {new Date(summary.usage.transfer_month).toLocaleDateString("es-AR", { month: "long", year: "numeric" })}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {!loading && !summary && (
          <p className="text-sm text-rose-600">No se pudo cargar el almacenamiento.</p>
        )}
      </section>
    </ProtectedRoute>
  );
}
