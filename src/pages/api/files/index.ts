import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { resolveAuth } from "@/lib/auth";
import { decodePublicId, encodePublicId } from "@/lib/publicIds";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import { canAccessBookingByRole } from "@/lib/accessControl";
import { normalizeRole } from "@/utils/permissions";
import { S3, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  ALLOWED_FILE_MIME,
  MAX_FILE_MB,
  calcStorageLimitBytes,
  normalizePackCount,
} from "@/lib/storage/constants";
import { getUsageTotals, resolveStorageContext } from "@/lib/storage/usage";

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

const MAX_BYTES = MAX_FILE_MB * 1024 * 1024;
const PENDING_TTL_HOURS = 24;

function isAllowedMime(mime?: string): boolean {
  if (!mime) return false;
  return ALLOWED_FILE_MIME.includes(mime as (typeof ALLOWED_FILE_MIME)[number]);
}

function safeFileName(name: string): string {
  const base = name.split("/").pop() || name;
  return (
    base
      .normalize("NFD")
      .replace(/[^\w.-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 120) || "archivo"
  );
}

function buildStorageKey(
  id_agency: number,
  target: "booking" | "client" | "service",
  targetId: number,
  fileName: string,
): string {
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const clean = safeFileName(fileName);
  return `agencies/${id_agency}/files/${target}-${targetId}/${stamp}-${rand}-${clean}`;
}

function pickTarget(body: Record<string, unknown>) {
  const bookingId = Number(body.booking_id ?? body.bookingId ?? 0) || null;
  const clientId = Number(body.client_id ?? body.clientId ?? 0) || null;
  const serviceId = Number(body.service_id ?? body.serviceId ?? 0) || null;
  if (serviceId) {
    if (clientId || bookingId) return null;
    return { target: "service" as const, bookingId, clientId, serviceId };
  }
  if (clientId) {
    return {
      target: "client" as const,
      bookingId,
      clientId,
      serviceId,
    };
  }
  if (bookingId) {
    return { target: "booking" as const, bookingId, clientId, serviceId };
  }
  return null;
}

async function canAccessBooking(
  bookingId: number,
  auth: { id_user: number; id_agency: number; role: string },
): Promise<boolean> {
  const booking = await prisma.booking.findUnique({
    where: { id_booking: bookingId },
    select: { id_booking: true, id_agency: true, id_user: true },
  });
  if (!booking || booking.id_agency !== auth.id_agency) return false;
  return canAccessBookingByRole(auth, booking);
}

function isBlocked(status?: string | null): boolean {
  return String(status || "").toLowerCase() === "bloqueada";
}

function canOverrideBlocked(role: string): boolean {
  const normalized = normalizeRole(role);
  return (
    normalized === "gerente" ||
    normalized === "administrativo" ||
    normalized === "desarrollador"
  );
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
  client?: { id_client: number; first_name: string; last_name: string } | null;
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
    client: file.client
      ? {
          id_client: file.client.id_client,
          first_name: file.client.first_name,
          last_name: file.client.last_name,
        }
      : null,
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const auth = await resolveAuth(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") {
    const rawBookingId = req.query.bookingId ?? req.query.booking_id;
    const rawClientId = req.query.clientId ?? req.query.client_id;
    const rawServiceId = req.query.serviceId ?? req.query.service_id;
    const includePax = String(req.query.includePax ?? "").toLowerCase() === "1";

    try {
      if (rawBookingId) {
        const raw = Array.isArray(rawBookingId)
          ? rawBookingId[0]
          : rawBookingId;
        const idValue = Number(raw);
        const decoded =
          Number.isFinite(idValue) && idValue > 0
            ? null
            : decodePublicId(String(raw));
        if (decoded && decoded.t !== "booking") {
          return res.status(400).json({ error: "Reserva inválida" });
        }

        const booking = await prisma.booking.findFirst({
          where: decoded
            ? { id_agency: auth.id_agency, agency_booking_id: decoded.i }
            : { id_booking: idValue, id_agency: auth.id_agency },
          select: {
            id_booking: true,
            id_agency: true,
            id_user: true,
            titular_id: true,
            clients: { select: { id_client: true } },
          },
        });

        if (!booking) {
          return res.status(404).json({ error: "Reserva no encontrada" });
        }

        const canAccess = await canAccessBooking(booking.id_booking, {
          id_user: auth.id_user,
          id_agency: auth.id_agency,
          role: auth.role,
        });
        if (!canAccess) {
          return res.status(403).json({ error: "Sin permisos" });
        }

        const bookingFiles = await prisma.fileAsset.findMany({
          where: {
            id_agency: auth.id_agency,
            booking_id: booking.id_booking,
            status: "active",
          },
          orderBy: { created_at: "desc" },
        });

        let paxFiles: unknown[] = [];
        if (includePax) {
          const paxIds = [
            booking.titular_id,
            ...booking.clients.map((c) => c.id_client),
          ].filter(Boolean);
          if (paxIds.length) {
            const paxList = await prisma.fileAsset.findMany({
              where: {
                id_agency: auth.id_agency,
                client_id: { in: paxIds },
                status: "active",
              },
              include: {
                client: {
                  select: { id_client: true, first_name: true, last_name: true },
                },
              },
              orderBy: { created_at: "desc" },
            });
            paxFiles = paxList.map((f) => serializeFile(f));
          }
        }

        return res.status(200).json({
          booking_files: bookingFiles.map((f) => serializeFile(f)),
          pax_files: paxFiles,
        });
      }

      if (rawClientId) {
        const raw = Array.isArray(rawClientId) ? rawClientId[0] : rawClientId;
        const clientId = Number(raw);
        if (!Number.isFinite(clientId) || clientId <= 0) {
          return res.status(400).json({ error: "Pax inválido" });
        }
        const client = await prisma.client.findFirst({
          where: { id_client: clientId, id_agency: auth.id_agency },
          select: { id_client: true },
        });
        if (!client) {
          return res.status(404).json({ error: "Pax no encontrado" });
        }
        const files = await prisma.fileAsset.findMany({
          where: {
            id_agency: auth.id_agency,
            client_id: clientId,
            status: "active",
          },
          orderBy: { created_at: "desc" },
        });
        return res.status(200).json({ files: files.map(serializeFile) });
      }

      if (rawServiceId) {
        const raw = Array.isArray(rawServiceId) ? rawServiceId[0] : rawServiceId;
        const serviceId = Number(raw);
        if (!Number.isFinite(serviceId) || serviceId <= 0) {
          return res.status(400).json({ error: "Servicio inválido" });
        }
        const service = await prisma.service.findFirst({
          where: { id_service: serviceId, id_agency: auth.id_agency },
          select: { id_service: true, booking_id: true },
        });
        if (!service) {
          return res.status(404).json({ error: "Servicio no encontrado" });
        }
        const canAccess = await canAccessBooking(service.booking_id, {
          id_user: auth.id_user,
          id_agency: auth.id_agency,
          role: auth.role,
        });
        if (!canAccess) {
          return res.status(403).json({ error: "Sin permisos" });
        }
        const files = await prisma.fileAsset.findMany({
          where: {
            id_agency: auth.id_agency,
            service_id: serviceId,
            status: "active",
          },
          orderBy: { created_at: "desc" },
        });
        return res.status(200).json({ files: files.map(serializeFile) });
      }

      return res.status(400).json({ error: "Faltan parámetros" });
    } catch (error) {
      console.error("[files][GET]", error);
      return res.status(500).json({ error: "Error al obtener archivos" });
    }
  }

  if (req.method === "POST") {
    try {
      const targetInfo = pickTarget(req.body ?? {});
      if (!targetInfo) {
        return res
          .status(400)
          .json({ error: "Debes indicar booking_id, client_id o service_id" });
      }

      const fileName = String(req.body?.file_name ?? req.body?.name ?? "").trim();
      const contentType = String(
        req.body?.content_type ?? req.body?.contentType ?? "",
      ).trim();
      const sizeBytes = Number(req.body?.size_bytes ?? req.body?.size ?? 0);

      if (!fileName) {
        return res.status(400).json({ error: "Nombre de archivo inválido" });
      }
      if (!isAllowedMime(contentType)) {
        return res.status(400).json({ error: "Tipo de archivo no permitido" });
      }
      if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
        return res.status(400).json({ error: "Tamaño inválido" });
      }
      if (sizeBytes > MAX_BYTES) {
        return res.status(400).json({
          error: `El archivo supera ${MAX_FILE_MB}MB`,
        });
      }

      const role = normalizeRole(auth.role);
      const canUpload = [
        "desarrollador",
        "gerente",
        "administrativo",
        "vendedor",
        "lider",
      ].includes(role);
      if (!canUpload) {
        return res.status(403).json({ error: "Sin permisos" });
      }

      let targetId = 0;
      if (targetInfo.target === "booking") {
        const bookingId = targetInfo.bookingId ?? 0;
        const booking = await prisma.booking.findFirst({
          where: { id_booking: bookingId, id_agency: auth.id_agency },
          select: { id_booking: true, status: true },
        });
        if (!booking) {
          return res.status(404).json({ error: "Reserva no encontrada" });
        }
        if (isBlocked(booking.status) && !canOverrideBlocked(auth.role)) {
          return res.status(403).json({ error: "Reserva bloqueada" });
        }
        const canAccess = await canAccessBooking(booking.id_booking, {
          id_user: auth.id_user,
          id_agency: auth.id_agency,
          role: auth.role,
        });
        if (!canAccess) {
          return res.status(403).json({ error: "Sin permisos" });
        }
        targetId = booking.id_booking;
      }
      if (targetInfo.target === "client") {
        const clientId = targetInfo.clientId ?? 0;
        const client = await prisma.client.findFirst({
          where: { id_client: clientId, id_agency: auth.id_agency },
          select: { id_client: true },
        });
        if (!client) {
          return res.status(404).json({ error: "Pax no encontrado" });
        }
        if (targetInfo.bookingId) {
          const booking = await prisma.booking.findFirst({
            where: {
              id_booking: targetInfo.bookingId,
              id_agency: auth.id_agency,
            },
            select: { id_booking: true, status: true },
          });
          if (!booking) {
            return res.status(404).json({ error: "Reserva no encontrada" });
          }
          if (isBlocked(booking.status) && !canOverrideBlocked(auth.role)) {
            return res.status(403).json({ error: "Reserva bloqueada" });
          }
          const canAccess = await canAccessBooking(booking.id_booking, {
            id_user: auth.id_user,
            id_agency: auth.id_agency,
            role: auth.role,
          });
          if (!canAccess) {
            return res.status(403).json({ error: "Sin permisos" });
          }
        }
        targetId = client.id_client;
      }
      if (targetInfo.target === "service") {
        const serviceId = targetInfo.serviceId ?? 0;
        const service = await prisma.service.findFirst({
          where: { id_service: serviceId, id_agency: auth.id_agency },
          select: { id_service: true, booking_id: true, booking: { select: { status: true } } },
        });
        if (!service) {
          return res.status(404).json({ error: "Servicio no encontrado" });
        }
        if (isBlocked(service.booking?.status) && !canOverrideBlocked(auth.role)) {
          return res.status(403).json({ error: "Reserva bloqueada" });
        }
        const canAccess = await canAccessBooking(service.booking_id, {
          id_user: auth.id_user,
          id_agency: auth.id_agency,
          role: auth.role,
        });
        if (!canAccess) {
          return res.status(403).json({ error: "Sin permisos" });
        }
        targetId = service.id_service;
      }

      const context = await resolveStorageContext(prisma, auth.id_agency);
      if (!context.config || !context.config.enabled) {
        return res.status(403).json({ error: "Almacenamiento no habilitado" });
      }

      const storageLimit = calcStorageLimitBytes(
        normalizePackCount(context.config.storage_pack_count ?? 1),
      );
      await prisma.fileAsset.deleteMany({
        where: {
          status: "pending",
          created_at: {
            lt: new Date(Date.now() - PENDING_TTL_HOURS * 60 * 60 * 1000),
          },
        },
      });

      const usage = await getUsageTotals(
        prisma,
        context.memberIds,
        new Date(),
        PENDING_TTL_HOURS,
      );
      const projected = usage.storageBytes + usage.pendingBytes + sizeBytes;
      if (projected >= storageLimit * 1.1) {
        return res.status(403).json({
          error:
            "Superaste el 110% del cupo. Necesitás ampliar para seguir subiendo.",
        });
      }

      const key = buildStorageKey(
        auth.id_agency,
        targetInfo.target,
        targetId,
        fileName,
      );
      const command = new PutObjectCommand({
        Bucket: SPACES_FILES_BUCKET,
        Key: key,
        ContentType: contentType,
      });
      const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 60 * 5 });

      const created = await prisma.$transaction(async (tx) => {
        const agencyFileId = await getNextAgencyCounter(
          tx,
          auth.id_agency,
          "file",
        );
        return tx.fileAsset.create({
          data: {
            agency_file_id: agencyFileId,
            id_agency: auth.id_agency,
            booking_id:
              targetInfo.target === "booking"
                ? targetId
                : targetInfo.target === "client"
                  ? targetInfo.bookingId ?? null
                  : null,
            client_id: targetInfo.target === "client" ? targetId : null,
            service_id: targetInfo.target === "service" ? targetId : null,
            original_name: fileName,
            display_name: null,
            mime_type: contentType,
            size_bytes: BigInt(sizeBytes),
            storage_key: key,
            status: "pending",
            created_by: auth.id_user,
          },
        });
      });

      return res.status(201).json({
        uploadUrl,
        headers: { "Content-Type": contentType },
        file: serializeFile(created),
      });
    } catch (error) {
      console.error("[files][POST]", error);
      return res.status(500).json({ error: "Error al preparar la subida" });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
