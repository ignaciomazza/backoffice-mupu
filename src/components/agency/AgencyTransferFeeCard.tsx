// src/components/agency/AgencyTransferFeeCard.tsx

"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "react-toastify";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";

type TransferFeeGetResponse = { transfer_fee_pct: number | null };

export default function AgencyTransferFeeCard() {
  const { token } = useAuth();

  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [saving, setSaving] = useState(false);

  // guardamos en UI como porcentaje humano (ej: "2.40" => 2.40%)
  const [pctStr, setPctStr] = useState<string>("2.40");

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      try {
        const res = await authFetch("/api/agency/transfer-fee", {}, token);
        if (res.status === 403) {
          setForbidden(true);
          // dejamos el default visual 2.40%
          return;
        }
        if (!res.ok) throw new Error("No se pudo obtener el porcentaje");
        const data = (await res.json()) as TransferFeeGetResponse;
        const pct = Number(data?.transfer_fee_pct ?? 0.024);
        // pasamos a porcentaje para mostrar (x100)
        setPctStr((pct * 100).toFixed(2));
      } catch (e) {
        console.error("[agency/transfer-fee][GET]", e);
        toast.error("Error cargando el costo bancarios");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const disabled = loading || saving || forbidden;

  const handleSave = async () => {
    const raw = pctStr.replace(",", ".").trim();
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      toast.error("Ingresá un porcentaje válido entre 0 y 100.");
      return;
    }

    setSaving(true);
    try {
      // enviamos en proporción (2.4% => 0.024)
      const body = { transfer_fee_pct: n / 100 };
      const res = await authFetch(
        "/api/agency/transfer-fee",
        { method: "PUT", body: JSON.stringify(body) },
        token,
      );
      if (res.status === 403) {
        setForbidden(true);
        toast.error("No autorizado");
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "No se pudo guardar el porcentaje");
      }
      toast.success("Costos bancarios actualizados");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error guardando";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      layout
      className="space-y-4 rounded-3xl border border-white/10 bg-white/10 p-6 shadow-md shadow-sky-950/10 backdrop-blur"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-sky-950 dark:text-white">
          Costos bancarios
        </h2>
        {forbidden && (
          <span className="text-xs text-sky-950/60 dark:text-white/60">
            Sin permisos para editar
          </span>
        )}
      </div>

      <p className="text-sm text-sky-950/80 dark:text-white/70">
        Este porcentaje se usa por defecto para calcular los{" "}
        <i>costos bancarios</i> de los servicios (por ej. 2.40% =
        0.024). No modifica servicios ya guardados.
      </p>

      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="ml-1 block text-sm dark:text-white">
            Porcentaje
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.01"
              min={0}
              max={100}
              inputMode="decimal"
              value={pctStr}
              onChange={(e) => setPctStr(e.target.value)}
              disabled={disabled}
              className="w-full rounded-2xl border border-sky-950/10 bg-white/50 px-3 py-2 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
            />
            <span className="pb-2 text-sky-950/70 dark:text-white/70">%</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={disabled}
          className="rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 disabled:opacity-50 dark:bg-white/10 dark:text-white"
        >
          {saving ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </motion.div>
  );
}
