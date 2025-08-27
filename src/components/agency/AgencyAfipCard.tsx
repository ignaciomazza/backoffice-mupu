// src/components/agency/AgencyAfipCard.tsx
"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "react-toastify";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";

type AfipStatus = {
  certUploaded: boolean;
  keyUploaded: boolean;
};

export default function AgencyAfipCard() {
  const { token } = useAuth();

  const [status, setStatus] = useState<AfipStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<"cert" | "key" | "both" | null>(
    null,
  );
  const [forbidden, setForbidden] = useState(false);

  // Inputs (solo texto)
  const [certText, setCertText] = useState("");
  const [keyText, setKeyText] = useState("");

  // Cargar estado inicial
  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      try {
        const res = await authFetch("/api/agency/afip", {}, token);
        if (res.status === 403) {
          setForbidden(true);
          setStatus({ certUploaded: false, keyUploaded: false });
          return;
        }
        if (!res.ok) throw new Error("No se pudo obtener estado AFIP");
        const data = (await res.json()) as AfipStatus;
        setStatus(data);
      } catch (e) {
        console.error("[AFIP][GET]", e);
        toast.error("Error cargando estado AFIP");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const clearLocal = () => {
    setCertText("");
    setKeyText("");
  };

  const handleSave = async () => {
    if (!certText && !keyText) {
      toast.info("Pegá al menos Cert o Key.");
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch(
        "/api/agency/afip",
        {
          method: "PUT",
          body: JSON.stringify({
            ...(certText ? { cert: certText } : {}),
            ...(keyText ? { key: keyText } : {}),
          }),
        },
        token,
      );
      if (res.status === 403) {
        setForbidden(true);
        toast.error("No autorizado");
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Error guardando credenciales");
      }
      const data = (await res.json()) as AfipStatus;
      setStatus(data);
      clearLocal();
      toast.success("Credenciales actualizadas");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error guardando";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (type: "cert" | "key" | "both") => {
    setDeleting(type);
    try {
      const qs = type === "both" ? "" : `?type=${type}`;
      const res = await authFetch(
        `/api/agency/afip${qs}`,
        { method: "DELETE" },
        token,
      );
      if (res.status === 403) {
        setForbidden(true);
        toast.error("No autorizado");
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Error eliminando credenciales");
      }
      const data = (await res.json()) as AfipStatus;
      setStatus(data);
      if (type !== "both") {
        if (type === "cert") setCertText("");
        if (type === "key") setKeyText("");
      } else {
        clearLocal();
      }
      toast.success(
        type === "both" ? "Cert y Key eliminados" : `Se eliminó ${type}`,
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error eliminando";
      toast.error(msg);
    } finally {
      setDeleting(null);
    }
  };

  const disabled = loading || forbidden;
  const canSave = !disabled && (certText.length > 0 || keyText.length > 0);

  return (
    <motion.div
      layout
      className="space-y-4 rounded-3xl border border-white/10 bg-white/10 p-6 shadow-md shadow-sky-950/10 backdrop-blur"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-sky-950 dark:text-white">
          AFIP – Certificado & Clave
        </h2>

        {/* Estado actual */}
        {!loading && status && (
          <div className="flex gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs ${
                status.certUploaded
                  ? "border-emerald-700/30 bg-emerald-500/20 text-emerald-800 hover:bg-emerald-500/30 dark:text-emerald-200"
                  : "bg-yellow-600/20 text-yellow-800 dark:text-yellow-200"
              }`}
              title="Estado del Certificado"
            >
              Cert: {status.certUploaded ? "Cargado" : "Falta"}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs ${
                status.keyUploaded
                  ? "border-emerald-700/30 bg-emerald-500/20 text-emerald-800 hover:bg-emerald-500/30 dark:text-emerald-200"
                  : "bg-yellow-600/20 text-yellow-800 dark:text-yellow-200"
              }`}
              title="Estado de la Clave"
            >
              Key: {status.keyUploaded ? "Cargada" : "Falta"}
            </span>
          </div>
        )}
      </div>

      {forbidden && (
        <p className="text-sm text-sky-950/70 dark:text-white/70">
          Tu rol no tiene permisos para editar estas credenciales.
        </p>
      )}

      {/* CERT */}
      <div className="grid gap-2 md:grid-cols-2">
        <div className="space-y-2">
          <label className="ml-1 block min-h-10 text-sm dark:text-white">
            Certificado (.pem, .crt) — pegá el texto
          </label>
          <textarea
            disabled={disabled}
            value={certText}
            onChange={(e) => setCertText(e.target.value)}
            placeholder="-----BEGIN CERTIFICATE-----\nMIIC...==\n-----END CERTIFICATE-----"
            className="min-h-[120px] w-full rounded-2xl border border-sky-950/10 bg-white/50 p-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
          />
          {status?.certUploaded && (
            <button
              type="button"
              disabled={disabled || deleting === "cert"}
              onClick={() => handleDelete("cert")}
              className="rounded-full bg-red-600/90 px-4 py-2 text-red-50 shadow-sm shadow-red-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-red-800"
            >
              {deleting === "cert" ? "Eliminando..." : "Eliminar Cert"}
            </button>
          )}
        </div>

        {/* KEY */}
        <div className="space-y-2">
          <label className="ml-1 block min-h-10 text-sm dark:text-white">
            Clave privada (.key/.pem) — pegá el texto
          </label>
          <textarea
            disabled={disabled}
            value={keyText}
            onChange={(e) => setKeyText(e.target.value)}
            placeholder="-----BEGIN PRIVATE KEY-----\nMIIE...==\n-----END PRIVATE KEY-----"
            className="min-h-[120px] w-full rounded-2xl border border-sky-950/10 bg-white/50 p-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
          />
          {status?.keyUploaded && (
            <button
              type="button"
              disabled={disabled || deleting === "key"}
              onClick={() => handleDelete("key")}
              className="rounded-full bg-red-600/90 px-4 py-2 text-red-50 shadow-sm shadow-red-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-red-800"
            >
              {deleting === "key" ? "Eliminando..." : "Eliminar Key"}
            </button>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!canSave || saving}
          onClick={handleSave}
          className={`rounded-full px-6 py-2 shadow-sm transition-transform hover:scale-95 active:scale-90 ${
            canSave
              ? "border-emerald-700/30 bg-emerald-500/20 text-emerald-800 hover:bg-emerald-500/30 dark:text-emerald-200"
              : "bg-gray-300 text-gray-500 dark:bg-white/10 dark:text-white/40"
          }`}
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>

        {(status?.certUploaded || status?.keyUploaded) && (
          <button
            type="button"
            disabled={disabled || deleting === "both"}
            onClick={() => handleDelete("both")}
            className="rounded-full bg-red-600/90 px-6 py-2 text-red-50 shadow-sm shadow-red-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-red-800"
          >
            {deleting === "both" ? "Eliminando..." : "Eliminar Cert & Key"}
          </button>
        )}
      </div>

      <p className="mt-2 text-xs text-sky-950/70 dark:text-white/60">
        Las credenciales se almacenan cifradas y nunca se devuelven por la API.
        Pegá el contenido en formato PEM o en base64.{" "}
        <b>No se permiten archivos.</b>
      </p>
    </motion.div>
  );
}
