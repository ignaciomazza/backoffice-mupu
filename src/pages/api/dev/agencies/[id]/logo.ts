// src/pages/api/dev/agencies/[id]/logo.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { S3, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { jwtVerify, type JWTPayload } from "jose";

/* =========================
   ENV / S3 client
========================= */
const {
  SPACES_ENDPOINT = "https://nyc3.digitaloceanspaces.com",
  SPACES_BUCKET = process.env.SPACES_BUCKET ?? "mupuviajes",
  SPACES_REGION = process.env.SPACES_REGION ?? "us-east-1",
  SPACES_SECRET_KEY,
  JWT_SECRET,
} = process.env;

// compat con env viejas
const SPACES_ACCESS_KEY =
  process.env.SPACES_ACCESS_KEY ?? process.env.SPACES_ACCES_KEY;

if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");
if (!SPACES_ACCESS_KEY || !SPACES_SECRET_KEY) {
  throw new Error("Credenciales de Spaces no configuradas");
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

/* =========================
   Auth helpers
========================= */
type TokenPayload = JWTPayload & {
  id_user?: number;
  userId?: number;
  uid?: number;
  role?: string;
  email?: string;
};

type AppError = Error & { status?: number };

function httpError(status: number, message: string): AppError {
  const err = new Error(message) as AppError;
  err.status = status;
  return err;
}

function normalizeRole(r?: string) {
  return (r ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function getTokenFromRequest(req: NextApiRequest): string | null {
  if (req.cookies?.token) return req.cookies.token;
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  for (const k of [
    "session",
    "auth_token",
    "access_token",
    "next-auth.session-token",
  ]) {
    const v = req.cookies?.[k];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

async function requireDeveloper(req: NextApiRequest): Promise<{
  id_user: number;
  email?: string;
}> {
  const token = getTokenFromRequest(req);
  if (!token) throw httpError(401, "No autenticado");

  const { payload } = await jwtVerify(
    token,
    new TextEncoder().encode(JWT_SECRET),
  );
  const p = payload as TokenPayload;
  const id_user = Number(p.id_user ?? p.userId ?? p.uid) || 0;
  const role = normalizeRole(p.role);

  if (!id_user || role !== "desarrollador") {
    throw httpError(403, "No autorizado");
  }
  return { id_user, email: p.email };
}

/* =========================
   Utils
========================= */
function parseAgencyId(param: unknown): number {
  const raw = Array.isArray(param) ? param[0] : param;
  const id = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(id) || id <= 0) throw httpError(400, "ID inválido");
  return id;
}

const IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
]);

function extFromContentType(ct?: string, fallback = "png"): string {
  if (!ct) return fallback;
  if (ct === "image/png") return "png";
  if (ct === "image/jpeg" || ct === "image/jpg") return "jpg";
  if (ct === "image/webp") return "webp";
  if (ct === "image/svg+xml") return "svg";
  return fallback;
}

function randomKey(id_agency: number, ext: string) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `agencies/${id_agency}/logo-${Date.now()}-${rand}.${ext}`;
}

function publicUrlFor(key: string) {
  const base = SPACES_ENDPOINT.replace(/\/+$/, "");
  return `${base}/${SPACES_BUCKET}/${key}`;
}

function keyFromUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    // path-style: https://endpoint/bucket/key
    const parts = u.pathname.replace(/^\/+/, "").split("/");
    if (parts.length >= 2 && parts[0] === SPACES_BUCKET) {
      return parts.slice(1).join("/");
    }
    // subdomain-style: https://bucket.region.digitaloceanspaces.com/key
    if (u.hostname.startsWith(`${SPACES_BUCKET}.`)) {
      return u.pathname.replace(/^\/+/, "");
    }
    return url.split(`${SPACES_BUCKET}/`)[1] || null;
  } catch {
    return url.split(`${SPACES_BUCKET}/`)[1] || null;
  }
}

/* =========================
   Handlers
========================= */

// GET: obtiene logo_url de la agencia indicada
async function handleGET(req: NextApiRequest, res: NextApiResponse) {
  await requireDeveloper(req);
  const id_agency = parseAgencyId(req.query.id);

  const agency = await prisma.agency.findUnique({
    where: { id_agency },
    select: { logo_url: true },
  });
  if (!agency) return res.status(404).json({ error: "Agencia no encontrada" });

  return res.status(200).json({ logo_url: agency.logo_url ?? null });
}

// POST: genera URL pre-firmada para subir el logo de esa agencia
async function handlePOST(req: NextApiRequest, res: NextApiResponse) {
  await requireDeveloper(req);
  const id_agency = parseAgencyId(req.query.id);

  const body = (req.body ?? {}) as { contentType?: unknown };
  const contentType =
    typeof body.contentType === "string" ? body.contentType : "image/png";

  if (!IMAGE_MIME.has(contentType)) {
    return res
      .status(400)
      .json({ error: "Tipo de archivo inválido (png, jpg, webp, svg)" });
  }

  const ext = extFromContentType(contentType);
  const Key = randomKey(id_agency, ext);

  const cmd = new PutObjectCommand({
    Bucket: SPACES_BUCKET,
    Key,
    ContentType: contentType,
    ACL: "public-read", // si tu bucket es privado, quitá esto y serví por CDN con signed URLs
  });

  const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 60 * 5 }); // 5 min
  const publicUrl = publicUrlFor(Key);

  return res.status(200).json({
    method: "PUT" as const,
    uploadUrl,
    key: Key,
    publicUrl,
    headers: {
      "Content-Type": contentType,
      "x-amz-acl": "public-read",
    },
  });
}

// PUT: confirma y guarda logo_url; limpia el anterior si corresponde
async function handlePUT(req: NextApiRequest, res: NextApiResponse) {
  await requireDeveloper(req);
  const id_agency = parseAgencyId(req.query.id);

  const body = (req.body ?? {}) as { key?: unknown; url?: unknown };
  const key = typeof body.key === "string" ? body.key.trim() : "";
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const finalKey = key || keyFromUrl(url);

  if (!finalKey) return res.status(400).json({ error: "Falta 'key' o 'url'" });

  const existing = await prisma.agency.findUnique({
    where: { id_agency },
    select: { logo_url: true },
  });
  if (!existing)
    return res.status(404).json({ error: "Agencia no encontrada" });

  const newUrl = publicUrlFor(finalKey);

  if (existing.logo_url && existing.logo_url !== newUrl) {
    const oldKey = keyFromUrl(existing.logo_url);
    if (oldKey) {
      try {
        await s3.send(
          new DeleteObjectCommand({ Bucket: SPACES_BUCKET, Key: oldKey }),
        );
      } catch (err) {
        // logging, pero no bloquea la actualización
        console.error("[dev/agencies/:id/logo][DELETE-OLD] error:", err);
      }
    }
  }

  const updated = await prisma.agency.update({
    where: { id_agency },
    data: { logo_url: newUrl },
    select: { id_agency: true, logo_url: true },
  });

  return res.status(200).json(updated);
}

// DELETE: elimina el logo actual del bucket y limpia la DB
async function handleDELETE(req: NextApiRequest, res: NextApiResponse) {
  await requireDeveloper(req);
  const id_agency = parseAgencyId(req.query.id);

  const agency = await prisma.agency.findUnique({
    where: { id_agency },
    select: { logo_url: true },
  });
  if (!agency) return res.status(404).json({ error: "Agencia no encontrada" });

  if (agency.logo_url) {
    const oldKey = keyFromUrl(agency.logo_url);
    if (oldKey) {
      await s3.send(
        new DeleteObjectCommand({ Bucket: SPACES_BUCKET, Key: oldKey }),
      );
    }
  }

  await prisma.agency.update({
    where: { id_agency },
    data: { logo_url: null },
  });

  return res.status(200).json({ ok: true });
}

/* =========================
   Router
========================= */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method === "GET") return await handleGET(req, res);
    if (req.method === "POST") return await handlePOST(req, res);
    if (req.method === "PUT") return await handlePUT(req, res);
    if (req.method === "DELETE") return await handleDELETE(req, res);

    res.setHeader("Allow", ["GET", "POST", "PUT", "DELETE"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (e) {
    const err = e as AppError;
    const status = typeof err.status === "number" ? err.status : 500;
    const message = err.message || "Error inesperado";
    return res.status(status).json({ error: message });
  }
}
