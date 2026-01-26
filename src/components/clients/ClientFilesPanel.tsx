"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import {
  ALLOWED_FILE_MIME,
  MAX_FILE_MB,
  formatBytes,
} from "@/lib/storage/constants";
import { ACTION_BUTTON, DANGER_BUTTON } from "@/components/bookings/palette";

type FileItem = {
  id_file: number;
  public_id: string;
  original_name: string;
  display_name?: string | null;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

type FilesResponse = {
  files?: FileItem[];
};

type Props = {
  clientId: number;
  expanded: boolean;
};

const ACCEPT = ALLOWED_FILE_MIME.join(",");
const MAX_BYTES = MAX_FILE_MB * 1024 * 1024;

export default function ClientFilesPanel({ clientId, expanded }: Props) {
  const { token } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchFiles = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await authFetch(`/api/files?clientId=${clientId}`, {}, token);
      if (!res.ok) {
        setFiles([]);
        return;
      }
      const data = (await res.json()) as FilesResponse;
      setFiles(Array.isArray(data.files) ? data.files : []);
    } catch (err) {
      console.error("[client-files]", err);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [clientId, token]);

  useEffect(() => {
    if (!expanded) return;
    void fetchFiles();
  }, [expanded, fetchFiles]);

  const fileLabel = useMemo(() => {
    if (loading) return "Cargando documentos...";
    if (!files.length) return "Sin documentos";
    return `${files.length} archivo${files.length === 1 ? "" : "s"}`;
  }, [files.length, loading]);

  const validateFile = (file: File) => {
    if (!ALLOWED_FILE_MIME.includes(file.type as (typeof ALLOWED_FILE_MIME)[number])) {
      toast.error("Formato inválido. Usá PDF o imágenes (JPG, PNG, WEBP).");
      return false;
    }
    if (file.size > MAX_BYTES) {
      toast.error(`El archivo supera ${MAX_FILE_MB}MB.`);
      return false;
    }
    return true;
  };

  const uploadFile = async (file: File) => {
    if (!token) return;
    if (!validateFile(file)) return;

    setUploading(true);
    try {
      const pres = await authFetch(
        "/api/files",
        {
          method: "POST",
          body: JSON.stringify({
            client_id: clientId,
            file_name: file.name,
            size_bytes: file.size,
            content_type: file.type,
          }),
        },
        token,
      );

      if (!pres.ok) {
        const err = await pres.json().catch(() => ({}));
        throw new Error(err?.error || "No se pudo preparar la subida");
      }

      const payload = (await pres.json()) as {
        uploadUrl: string;
        headers: Record<string, string>;
        file: FileItem;
      };

      const put = await fetch(payload.uploadUrl, {
        method: "PUT",
        headers: payload.headers ?? { "Content-Type": file.type },
        body: file,
      });

      if (!put.ok) {
        throw new Error("Falló la subida al storage");
      }

      const confirm = await authFetch(
        `/api/files/${payload.file.public_id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ action: "confirm" }),
        },
        token,
      );
      if (!confirm.ok) {
        const err = await confirm.json().catch(() => ({}));
        throw new Error(err?.error || "No se pudo confirmar el archivo");
      }

      toast.success("Archivo subido");
      await fetchFiles();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al subir archivo";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const handlePickFile = () => inputRef.current?.click();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    void uploadFile(file);
    event.target.value = "";
  };

  const handleDownload = async (file: FileItem) => {
    if (!token) return;
    try {
      const res = await authFetch(
        `/api/files/${file.public_id}/download`,
        { cache: "no-store" },
        token,
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "No se pudo descargar");
      }
      const data = (await res.json()) as { url?: string };
      if (data.url) window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al descargar";
      toast.error(msg);
    }
  };

  const handleDelete = async (file: FileItem) => {
    if (!token) return;
    if (!confirm("¿Eliminar este archivo?")) return;
    setDeletingId(file.id_file);
    try {
      const res = await authFetch(
        `/api/files/${file.public_id}`,
        { method: "DELETE" },
        token,
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "No se pudo eliminar");
      }
      toast.success("Archivo eliminado");
      await fetchFiles();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al eliminar";
      toast.error(msg);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-sky-950/5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-sky-900/70 dark:text-sky-100/70">
            Documentos
          </p>
          <p className="text-sm text-sky-950/80 dark:text-white/80">
            {fileLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={ACCEPT}
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={handlePickFile}
            disabled={uploading}
            className={`${ACTION_BUTTON} px-4 py-2 text-xs font-semibold disabled:opacity-60`}
          >
            {uploading ? "Subiendo..." : "Subir archivo"}
          </button>
        </div>
      </div>

      {files.length > 0 && (
        <div className="mt-4 space-y-2 text-sm">
          {files.map((file) => (
            <div
              key={file.id_file}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/60 px-3 py-2 dark:bg-white/5"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {file.display_name || file.original_name}
                </p>
                <p className="text-xs text-sky-900/60 dark:text-white/60">
                  {formatBytes(file.size_bytes)} · {new Date(file.created_at).toLocaleDateString("es-AR")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownload(file)}
                  className={`${ACTION_BUTTON} px-3 py-1 text-xs`}
                >
                  Descargar
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(file)}
                  disabled={deletingId === file.id_file}
                  className={`${DANGER_BUTTON} px-3 py-1 text-xs disabled:opacity-60`}
                >
                  {deletingId === file.id_file ? "Eliminando..." : "Eliminar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {loading && files.length === 0 && (
        <p className="mt-3 text-xs text-sky-900/60 dark:text-white/60">
          Cargando documentos...
        </p>
      )}
    </div>
  );
}
