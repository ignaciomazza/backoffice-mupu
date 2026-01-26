import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { resolveAuth } from "@/lib/auth";
import { decodePublicId } from "@/lib/publicIds";
import { ensureStorageUsage } from "@/lib/storage/usage";
import { GetObjectCommand, S3 } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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

function safeDownloadName(name: string): string {
  const base = name.split("/").pop() || name;
  const cleaned = base
    .normalize("NFD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  return cleaned || "archivo";
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
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

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

  try {
    const file = await prisma.fileAsset.findFirst({ where });
    if (!file) return res.status(404).json({ error: "Archivo no encontrado" });
    if (file.status !== "active") {
      return res.status(409).json({ error: "Archivo no disponible" });
    }

    const fileName = safeDownloadName(file.display_name || file.original_name);
    const command = new GetObjectCommand({
      Bucket: SPACES_FILES_BUCKET,
      Key: file.storage_key,
      ResponseContentDisposition: `attachment; filename="${fileName}"`,
    });

    const url = await getSignedUrl(s3, command, { expiresIn: 60 * 5 });

    await prisma.$transaction(async (tx) => {
      await ensureStorageUsage(tx, file.id_agency);
      await tx.agencyStorageUsage.update({
        where: { id_agency: file.id_agency },
        data: { transfer_bytes: { increment: file.size_bytes } },
      });
      await tx.fileAsset.update({
        where: { id_file: file.id_file },
        data: {
          download_count: { increment: 1 },
          downloaded_at: new Date(),
        },
      });
    });

    return res.status(200).json({ url });
  } catch (error) {
    console.error("[files][download]", error);
    return res.status(500).json({ error: "Error al generar descarga" });
  }
}
