// src/components/agency/AgencyLogoCard.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "react-toastify";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";

const ACCEPT = "image/png,image/jpeg,image/jpg,image/webp,image/svg+xml";
const MAX_MB = 5;

type LogoGetResponse = { logo_url: string | null };
type PresignResponse = {
  method: "PUT";
  uploadUrl: string;
  key: string;
  publicUrl: string;
  headers: Record<string, string>;
};
type SaveResponse = { id_agency: number; logo_url: string | null };

export default function AgencyLogoCard() {
  const { token } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [working, setWorking] = useState<"upload" | "delete" | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      try {
        const res = await authFetch("/api/agency/logo", {}, token);
        if (res.status === 403) {
          setForbidden(true);
          setLogoUrl(null);
          return;
        }
        if (!res.ok) throw new Error("No se pudo obtener el logo");
        const data = (await res.json()) as LogoGetResponse;
        setLogoUrl(data.logo_url ?? null);
      } catch (e) {
        console.error("[agency/logo][GET]", e);
        toast.error("Error cargando el logo");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const onPickFile = () => inputRef.current?.click();

  const validateFile = (f: File) => {
    if (!ACCEPT.split(",").includes(f.type)) {
      toast.error("Formato inválido. Usá PNG, JPG, WEBP o SVG.");
      return false;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      toast.error(`El archivo supera ${MAX_MB}MB.`);
      return false;
    }
    return true;
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!validateFile(f)) {
      e.target.value = "";
      return;
    }
    setWorking("upload");
    try {
      // 1) pedir URL prefirmada
      const pres = await authFetch(
        "/api/agency/logo",
        {
          method: "POST",
          body: JSON.stringify({ contentType: f.type }),
        },
        token,
      );
      if (pres.status === 403) {
        setForbidden(true);
        toast.error("No autorizado");
        return;
      }
      if (!pres.ok) {
        const err = await pres.json().catch(() => ({}));
        throw new Error(err?.error || "No se pudo generar URL de subida");
      }
      const { uploadUrl, headers, key, publicUrl } =
        (await pres.json()) as PresignResponse;

      // 2) subir directo al bucket
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: headers ?? { "Content-Type": f.type },
        body: f,
      });
      if (!put.ok) {
        throw new Error("Falló la subida al storage");
      }

      // 3) confirmar en la API para guardar logo_url
      const save = await authFetch(
        "/api/agency/logo",
        {
          method: "PUT",
          body: JSON.stringify({ key, url: publicUrl }),
        },
        token,
      );
      if (!save.ok) {
        const err = await save.json().catch(() => ({}));
        throw new Error(err?.error || "No se pudo guardar el logo");
      }
      const saved = (await save.json()) as SaveResponse;
      setLogoUrl(saved.logo_url);
      toast.success("Logo actualizado");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error subiendo el logo";
      toast.error(msg);
    } finally {
      setWorking(null);
      if (e.target) e.target.value = "";
    }
  };

  const handleDelete = async () => {
    if (!logoUrl) return;
    if (!confirm("¿Eliminar el logo actual?")) return;
    setWorking("delete");
    try {
      const res = await authFetch(
        "/api/agency/logo",
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
        throw new Error(err?.error || "No se pudo eliminar el logo");
      }
      setLogoUrl(null);
      toast.success("Logo eliminado");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error eliminando el logo";
      toast.error(msg);
    } finally {
      setWorking(null);
    }
  };

  const disabled = loading || forbidden || working !== null;

  return (
    <motion.div
      layout
      className="space-y-4 rounded-3xl border border-white/10 bg-white/10 p-6 shadow-md shadow-sky-950/10 backdrop-blur"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-sky-950 dark:text-white">
          Logo de la agencia
        </h2>
        {forbidden && (
          <span className="text-xs text-sky-950/60 dark:text-white/60">
            Sin permisos para editar
          </span>
        )}
      </div>

      {/* Preview */}
      <div className="flex items-center gap-4">
        <div className="size-24 overflow-hidden rounded-2xl border border-white/10 bg-white/40 dark:bg-white/10">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Logo de la agencia"
              className="size-full object-contain"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-xs text-sky-950/60 dark:text-white/60">
              Sin logo
            </div>
          )}
        </div>

        <div className="text-xs text-sky-950/70 dark:text-white/70">
          Formatos aceptados: PNG, JPG, WEBP o SVG. Máx. {MAX_MB}MB.
          <br />
          Recomendado: fondo transparente y lado mayor ≤ 512px.
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={handleFile}
        />
        <button
          type="button"
          onClick={onPickFile}
          disabled={disabled}
          className="rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 disabled:opacity-50 dark:bg-white/10 dark:text-white"
        >
          {working === "upload"
            ? "Subiendo..."
            : logoUrl
              ? "Reemplazar logo"
              : "Subir logo"}
        </button>

        {logoUrl && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={disabled}
            className="rounded-full bg-red-600/90 px-6 py-2 text-red-50 shadow-sm shadow-red-950/20 transition-transform hover:scale-95 active:scale-90 disabled:opacity-50 dark:bg-red-800"
          >
            {working === "delete" ? "Eliminando..." : "Eliminar logo"}
          </button>
        )}
      </div>
    </motion.div>
  );
}
