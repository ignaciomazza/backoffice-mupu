import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { resolveAuth } from "@/lib/auth";
import { decodePublicId, encodePublicId } from "@/lib/publicIds";
import { normalizeRole } from "@/utils/permissions";
import { DeleteObjectCommand, S3 } from "@aws-sdk/client-s3";
import { ensureStorageUsage } from "@/lib/storage/usage";

const {
  SPACES_ENDPOINT = "https://nyc3.digitaloceanspaces.com",
  SPACES_REGION = process.env.SPACES_REGION ?? "us-east-1",
  SPACES_SECRET_KEY,
} = process.env;

const SPACES_ACCESS_KEY =
  process.env.SPACES_ACCESS_KEY ?? process.env.SPACES_ACCES_KEY;
const SPACES_FILES_BUCKET =
  process.env.SPACES_FILES_BUCKET ?? process.env.SPACES_BUCKET;

if (!SPACES_ACCESS_KEY || !SPACES_SECRET_KEY) {
  throw new Error("Credenciales de Spaces no configuradas");
}
if (!SPACES_FILES_BUCKET) {
  throw new Error("SPACES_FILES_BUCKET no configurado");
}

const s3 = new S3({
  endpoint: SPACES_ENDPOINT,
  region: SPACES_REGION,
  credentials: {
    accessKeyId: SPACES_ACCESS_KEY,
    secretAccessKey: SPACES_SECRET_KEY,
  },
  forcePathStyle: true,
});

function canManage(role: string) {
  return [
    "desarrollador",
    "gerente",
    "administrativo",
    "vendedor",
    "lider",
  ].includes(normalizeRole(role));
}

function canOverrideBlocked(role: string) {
  const normalized = normalizeRole(role);
  return (
    normalized === "gerente" ||
    normalized === "administrativo" ||
    normalized === "desarrollador"
  );
}

function isBlocked(status?: string | null): boolean {
  return String(status || "").toLowerCase() === "bloqueada";
}

function serializeFile(file: {
  id_file: number;
  agency_file_id: number;
  id_agency: number;
  booking_id: number | null;
  client_id: number | null;
  service_id: number | null;
  original_name: string;
  display_name: string | null;
  mime_type: string;
  size_bytes: bigint;
  status: string;
  created_at: Date;
  downloaded_at: Date | null;
  download_count: number;
}) {
  return {
    id_file: file.id_file,
    agency_file_id: file.agency_file_id,
    public_id: encodePublicId({
      t: "file",
      a: file.id_agency,
      i: file.agency_file_id,
    }),
    booking_id: file.booking_id,
    client_id: file.client_id,
    service_id: file.service_id,
    original_name: file.original_name,
    display_name: file.display_name,
    mime_type: file.mime_type,
    size_bytes: Number(file.size_bytes ?? 0),
    status: file.status,
    created_at: file.created_at,
    downloaded_at: file.downloaded_at,
    download_count: file.download_count,
  };
}

function parseFileId(raw: string) {
  const idNum = Number(raw);
  if (Number.isFinite(idNum) && idNum > 0) return { id: idNum };
  const decoded = decodePublicId(raw);
  if (!decoded || decoded.t !== "file") return null;
  return { decoded };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const auth = await resolveAuth(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const raw = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!raw) return res.status(400).json({ error: "ID inválido" });
  const parsed = parseFileId(String(raw));
  if (!parsed) return res.status(400).json({ error: "ID inválido" });

  const where = parsed.decoded
    ? {
        id_agency: auth.id_agency,
        agency_file_id: parsed.decoded.i,
      }
    : { id_file: parsed.id, id_agency: auth.id_agency };

  if (req.method === "GET") {
    const file = await prisma.fileAsset.findFirst({ where });
    if (!file) return res.status(404).json({ error: "Archivo no encontrado" });
    return res.status(200).json({ file: serializeFile(file) });
  }

  if (req.method === "PATCH") {
    if (!canManage(auth.role)) {
      return res.status(403).json({ error: "Sin permisos" });
    }

    const action = String(req.body?.action ?? "").trim().toLowerCase();
    if (action !== "confirm") {
      return res.status(400).json({ error: "Acción inválida" });
    }

    try {
      const updated = await prisma.$transaction(async (tx) => {
        const existing = await tx.fileAsset.findFirst({ where });
        if (!existing) return null;
        if (existing.status === "active") return existing;

        if (existing.booking_id) {
          const booking = await tx.booking.findFirst({
            where: { id_booking: existing.booking_id, id_agency: auth.id_agency },
            select: { status: true },
          });
          if (isBlocked(booking?.status) && !canOverrideBlocked(auth.role)) {
            throw new Error("RESERVA_BLOQUEADA");
          }
        }
        if (!existing.booking_id && existing.service_id) {
          const service = await tx.service.findFirst({
            where: { id_service: existing.service_id, id_agency: auth.id_agency },
            select: { booking: { select: { status: true } } },
          });
          if (isBlocked(service?.booking?.status) && !canOverrideBlocked(auth.role)) {
            throw new Error("RESERVA_BLOQUEADA");
          }
        }

        await ensureStorageUsage(tx, existing.id_agency);
        await tx.agencyStorageUsage.update({
          where: { id_agency: existing.id_agency },
          data: {
            storage_bytes: { increment: existing.size_bytes },
            transfer_bytes: { increment: existing.size_bytes },
          },
        });

        return tx.fileAsset.update({
          where: { id_file: existing.id_file },
          data: { status: "active", display_name: existing.display_name },
        });
      });

      if (!updated) {
        return res.status(404).json({ error: "Archivo no encontrado" });
      }

      return res.status(200).json({ file: serializeFile(updated) });
    } catch (error) {
      if (error instanceof Error && error.message === "RESERVA_BLOQUEADA") {
        return res.status(403).json({ error: "Reserva bloqueada" });
      }
      console.error("[files][PATCH]", error);
      return res.status(500).json({ error: "Error al confirmar archivo" });
    }
  }

  if (req.method === "DELETE") {
    if (!canManage(auth.role)) {
      return res.status(403).json({ error: "Sin permisos" });
    }

    try {
      const existing = await prisma.fileAsset.findFirst({ where });
      if (!existing) {
        return res.status(404).json({ error: "Archivo no encontrado" });
      }
      if (existing.booking_id) {
        const booking = await prisma.booking.findFirst({
          where: { id_booking: existing.booking_id, id_agency: auth.id_agency },
          select: { status: true },
        });
        if (isBlocked(booking?.status) && !canOverrideBlocked(auth.role)) {
          return res.status(403).json({ error: "Reserva bloqueada" });
        }
      }
      if (!existing.booking_id && existing.service_id) {
        const service = await prisma.service.findFirst({
          where: { id_service: existing.service_id, id_agency: auth.id_agency },
          select: { booking: { select: { status: true } } },
        });
        if (isBlocked(service?.booking?.status) && !canOverrideBlocked(auth.role)) {
          return res.status(403).json({ error: "Reserva bloqueada" });
        }
      }

      try {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: SPACES_FILES_BUCKET,
            Key: existing.storage_key,
          }),
        );
      } catch (err) {
        console.error("[files][DELETE][storage]", err);
      }

      await prisma.$transaction(async (tx) => {
        if (existing.status === "active") {
          await ensureStorageUsage(tx, existing.id_agency);
          await tx.agencyStorageUsage.update({
            where: { id_agency: existing.id_agency },
            data: { storage_bytes: { decrement: existing.size_bytes } },
          });
        }
        await tx.fileAsset.delete({ where: { id_file: existing.id_file } });
      });

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("[files][DELETE]", error);
      return res.status(500).json({ error: "Error al borrar archivo" });
    }
  }

  res.setHeader("Allow", ["GET", "PATCH", "DELETE"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
