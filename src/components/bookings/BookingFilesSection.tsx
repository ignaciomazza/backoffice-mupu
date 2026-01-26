"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { authFetch } from "@/utils/authFetch";
import { useAuth } from "@/context/AuthContext";
import {
  ALLOWED_FILE_MIME,
  MAX_FILE_MB,
  formatBytes,
} from "@/lib/storage/constants";
import { ACTION_BUTTON, DANGER_BUTTON } from "@/components/bookings/palette";
import { normalizeRole } from "@/utils/permissions";

const ACCEPT = ALLOWED_FILE_MIME.join(",");
const MAX_BYTES = MAX_FILE_MB * 1024 * 1024;

type FileItem = {
  id_file: number;
  public_id: string;
  original_name: string;
  display_name?: string | null;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  client?: { id_client: number; first_name: string; last_name: string } | null;
};

type BookingFilesResponse = {
  booking_files?: FileItem[];
  pax_files?: FileItem[];
};

type Props = {
  bookingId: number;
  bookingKey: string | number;
  passengers: { id_client: number; name: string }[];
  bookingStatus?: string | null;
  role?: string | null;
};

function isBlocked(status?: string | null): boolean {
  return String(status || "").toLowerCase() === "bloqueada";
}

function canOverrideBlocked(role?: string | null) {
  const normalized = normalizeRole(role || "");
  return (
    normalized === "gerente" ||
    normalized === "administrativo" ||
    normalized === "desarrollador"
  );
}

export default function BookingFilesSection({
  bookingId,
  bookingKey,
  passengers,
  bookingStatus,
  role,
}: Props) {
  const { token } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [bookingFiles, setBookingFiles] = useState<FileItem[]>([]);
  const [paxFiles, setPaxFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [uploadingPaxId, setUploadingPaxId] = useState<number | null>(null);

  const blocked = isBlocked(bookingStatus);
  const canBypass = canOverrideBlocked(role);
  const uploadsDisabled = blocked && !canBypass;

  const fetchFiles = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const key = encodeURIComponent(String(bookingKey));
      const res = await authFetch(
        `/api/files?bookingId=${key}&includePax=1`,
        {},
        token,
      );
      if (!res.ok) {
        setBookingFiles([]);
        setPaxFiles([]);
        return;
      }
      const data = (await res.json()) as BookingFilesResponse;
      setBookingFiles(Array.isArray(data.booking_files) ? data.booking_files : []);
      setPaxFiles(Array.isArray(data.pax_files) ? data.pax_files : []);
    } catch (err) {
      console.error("[booking-files]", err);
      setBookingFiles([]);
      setPaxFiles([]);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [bookingKey, token]);

  useEffect(() => {
    if (!expanded) return;
    void fetchFiles();
  }, [expanded, fetchFiles]);

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

  const uploadFile = async (
    file: File,
    target: { bookingId?: number; clientId?: number },
  ) => {
    if (!token) return;
    if (!validateFile(file)) return;

    if (target.clientId) {
      setUploadingPaxId(target.clientId);
    } else {
      setUploading(true);
    }
    try {
      const pres = await authFetch(
        "/api/files",
        {
          method: "POST",
          body: JSON.stringify({
            booking_id: target.bookingId,
            client_id: target.clientId,
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
      setUploadingPaxId(null);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (uploadsDisabled) {
      toast.error("La reserva está bloqueada para subir archivos.");
      event.target.value = "";
      return;
    }
    void uploadFile(file, { bookingId });
    event.target.value = "";
  };

  const uploadPaxFile = async (clientId: number, file: File) => {
    if (uploadsDisabled) {
      toast.error("La reserva está bloqueada para subir archivos.");
      return;
    }
    await uploadFile(file, { bookingId, clientId });
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
    if (uploadsDisabled) {
      toast.error("La reserva está bloqueada para eliminar archivos.");
      return;
    }
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

  const paxGrouped = useMemo(() => {
    const map = new Map<number, { id: number; name: string; files: FileItem[] }>();
    for (const file of paxFiles) {
      const client = file.client;
      if (!client) continue;
      const existing = map.get(client.id_client);
      const name = `${client.first_name} ${client.last_name}`.trim() || "Pax";
      if (existing) {
        existing.files.push(file);
      } else {
        map.set(client.id_client, { id: client.id_client, name, files: [file] });
      }
    }
    return Array.from(map.values());
  }, [paxFiles]);

  const paxWithFiles = useMemo(() => {
    const grouped = new Map(paxGrouped.map((g) => [g.id, g]));
    return passengers.map((p) => ({
      id: p.id_client,
      name: p.name,
      files: grouped.get(p.id_client)?.files ?? [],
    }));
  }, [passengers, paxGrouped]);

  const totalFiles = bookingFiles.length + paxFiles.length;
  const summaryLabel = !loaded
    ? "Sin cargar"
    : totalFiles
      ? `${totalFiles} archivo${totalFiles === 1 ? "" : "s"}`
      : "Sin archivos";

  return (
    <div className="mb-10 rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-sky-900/70 dark:text-sky-100/70">
            Documentación
          </p>
          <p className="text-lg font-semibold">Archivos</p>
          <p className="text-sm text-sky-950/70 dark:text-white/70">
            {summaryLabel} · PDF o imágenes · Máx {MAX_FILE_MB}MB
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className={`${ACTION_BUTTON} px-4 py-2 text-xs font-semibold disabled:opacity-60`}
          >
            {expanded ? "Ocultar" : "Mostrar"}
          </button>
        </div>
      </div>

      {expanded && (
        <>
          <div className="mt-3 flex items-center justify-between text-xs text-sky-900/60 dark:text-white/60">
            <span>
              {uploadsDisabled
                ? "Reserva bloqueada: solo gerencia/administración."
                : "Subidas habilitadas para el equipo."}
            </span>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept={ACCEPT}
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading || uploadsDisabled}
              className={`${ACTION_BUTTON} px-4 py-2 text-xs font-semibold disabled:opacity-60`}
            >
              {uploadsDisabled
                ? "Subida bloqueada"
                : uploading
                  ? "Subiendo..."
                  : "Subir archivo"}
            </button>
          </div>

      {loading && bookingFiles.length === 0 && (
        <p className="mt-4 text-sm text-sky-900/70 dark:text-white/70">
          Cargando archivos...
        </p>
      )}

      {bookingFiles.length > 0 ? (
        <div className="mt-4 space-y-2">
          {bookingFiles.map((file) => (
            <div
              key={file.id_file}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/60 px-3 py-2 text-sm dark:bg-white/5"
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
                {!uploadsDisabled && (
                  <button
                    type="button"
                    onClick={() => handleDelete(file)}
                    disabled={deletingId === file.id_file}
                    className={`${DANGER_BUTTON} px-3 py-1 text-xs disabled:opacity-60`}
                  >
                    {deletingId === file.id_file ? "Eliminando..." : "Eliminar"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : !loading ? (
        <p className="mt-4 text-sm text-sky-900/70 dark:text-white/70">
          Sin archivos en la reserva.
        </p>
      ) : null}

      <div className="mt-6 border-t border-white/10 pt-4">
        <p className="text-sm font-semibold">Archivos de pasajeros</p>
        {paxWithFiles.length === 0 && (
          <p className="mt-2 text-sm text-sky-900/70 dark:text-white/70">
            Sin documentación cargada para pasajeros.
          </p>
        )}
        {paxWithFiles.length > 0 && (
          <div className="mt-3 space-y-3">
            {paxWithFiles.map((group) => (
              <div
                key={group.id}
                className="rounded-2xl border border-white/10 bg-white/40 p-3 dark:bg-white/5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{group.name}</p>
                  <label
                    className={`${ACTION_BUTTON} cursor-pointer px-3 py-1 text-xs font-semibold ${
                      uploadsDisabled ? "pointer-events-none opacity-50" : ""
                    }`}
                  >
                    {uploadingPaxId === group.id ? "Subiendo..." : "Subir doc"}
                    <input
                      type="file"
                      className="hidden"
                      accept={ACCEPT}
                      disabled={uploadsDisabled}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        void uploadPaxFile(group.id, file);
                        event.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <div className="mt-2 space-y-2">
                  {group.files.length === 0 && (
                    <p className="text-xs text-sky-900/60 dark:text-white/60">
                      Sin archivos aún.
                    </p>
                  )}
                  {group.files.map((file) => (
                    <div
                      key={file.id_file}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/60 px-3 py-2 text-sm dark:bg-white/5"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {file.display_name || file.original_name}
                        </p>
                        <p className="text-xs text-sky-900/60 dark:text-white/60">
                          {formatBytes(file.size_bytes)} ·{" "}
                          {new Date(file.created_at).toLocaleDateString("es-AR")}
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
                        {!uploadsDisabled && (
                          <button
                            type="button"
                            onClick={() => handleDelete(file)}
                            disabled={deletingId === file.id_file}
                            className={`${DANGER_BUTTON} px-3 py-1 text-xs disabled:opacity-60`}
                          >
                            {deletingId === file.id_file
                              ? "Eliminando..."
                              : "Eliminar"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}
