// src/pages/api/agency/logo/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { S3, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { jwtVerify, JWTPayload } from "jose";

/** ====== ENV ====== */
const {
  SPACES_ENDPOINT = "https://nyc3.digitaloceanspaces.com",
  SPACES_BUCKET = process.env.SPACES_BUCKET ?? "mupuviajes",
  SPACES_REGION = process.env.SPACES_REGION ?? "us-east-1",
  SPACES_SECRET_KEY,
  JWT_SECRET,
} = process.env;

const SPACES_ACCESS_KEY =
  process.env.SPACES_ACCESS_KEY ?? process.env.SPACES_ACCES_KEY;

if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");
if (!SPACES_ACCESS_KEY || !SPACES_SECRET_KEY) {
  throw new Error("Credenciales de Spaces no configuradas");
}

/** ====== S3 Client (DO Spaces compatible) ====== */
const s3 = new S3({
  endpoint: SPACES_ENDPOINT,
  region: SPACES_REGION,
  credentials: {
    accessKeyId: SPACES_ACCESS_KEY!,
    secretAccessKey: SPACES_SECRET_KEY!,
  },
  forcePathStyle: true,
});

/** ====== Tipos / helpers de auth y error ====== */
type TokenPayload = JWTPayload & {
  id_user?: number;
  userId?: number;
  uid?: number;
  role?: string;
  id_agency?: number;
  agencyId?: number;
  aid?: number;
  email?: string;
};

class HttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function getTokenFromRequest(req: NextApiRequest): string | null {
  if (req.cookies?.token) return req.cookies.token;
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

async function getAuth(req: NextApiRequest): Promise<{
  id_user: number;
  id_agency: number;
  role: string;
}> {
  const token = getTokenFromRequest(req);
  if (!token) throw new HttpError("No autenticado", 401);

  const { payload } = await jwtVerify(
    token,
    new TextEncoder().encode(JWT_SECRET),
  );
  const p = payload as TokenPayload;

  const id_user = Number(p.id_user ?? p.userId ?? p.uid) || 0;
  let id_agency = Number(p.id_agency ?? p.agencyId ?? p.aid) || 0;
  const role = String(p.role || "").toLowerCase();

  if (!id_user) throw new HttpError("Token inválido", 401);
  if (!id_agency) {
    const u = await prisma.user.findUnique({
      where: { id_user },
      select: { id_agency: true },
    });
    id_agency = u?.id_agency || 0;
  }
  if (!id_agency) throw new HttpError("Token sin agencia", 401);

  return { id_user, id_agency, role };
}

function requireManagerOrDev(role: string) {
  const r = role.toLowerCase();
  if (!["gerente", "desarrollador"].includes(r)) {
    throw new HttpError("No autorizado", 403);
  }
}

/** ====== Utils ====== */
const IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
]);

function safeExtFrom(ct?: string, fallback = "png") {
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
    const parts = u.pathname.replace(/^\/+/, "").split("/");
    if (parts.length >= 2 && parts[0] === SPACES_BUCKET) {
      return parts.slice(1).join("/");
    }
    if (u.hostname.startsWith(`${SPACES_BUCKET}.`)) {
      return u.pathname.replace(/^\/+/, "");
    }
    return url.split(`${SPACES_BUCKET}/`)[1] || null;
  } catch {
    return url.split(`${SPACES_BUCKET}/`)[1] || null;
  }
}

function getStatus(e: unknown, fallback = 500) {
  if (typeof e === "object" && e !== null) {
    const s = (e as Record<string, unknown>).status;
    if (typeof s === "number") return s;
  }
  return fallback;
}

/** ====== Handlers ====== */
async function handleGET(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id_agency } = await getAuth(req);
    const agency = await prisma.agency.findUnique({
      where: { id_agency },
      select: { logo_url: true },
    });
    return res.status(200).json({ logo_url: agency?.logo_url ?? null });
  } catch (e: unknown) {
    const status = getStatus(e, 401);
    return res.status(status).json({ error: (e as Error).message });
  }
}

async function handlePOST(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id_agency, role } = await getAuth(req);
    requireManagerOrDev(role);

    const { contentType } = (req.body ?? {}) as { contentType?: string };
    const ct = typeof contentType === "string" ? contentType : "image/png";
    if (!IMAGE_MIME.has(ct)) {
      return res
        .status(400)
        .json({ error: "Tipo de archivo inválido (png, jpg, webp, svg)" });
    }

    const ext = safeExtFrom(ct);
    const Key = randomKey(id_agency, ext);

    const putCmd = new PutObjectCommand({
      Bucket: SPACES_BUCKET,
      Key,
      ContentType: ct,
      ACL: "public-read",
    });

    const uploadUrl = await getSignedUrl(s3, putCmd, { expiresIn: 60 * 5 });
    const publicUrl = publicUrlFor(Key);

    return res.status(200).json({
      method: "PUT",
      uploadUrl,
      key: Key,
      publicUrl,
      headers: { "Content-Type": ct, "x-amz-acl": "public-read" },
    });
  } catch (e: unknown) {
    const status = getStatus(e, 500);
    return res.status(status).json({ error: (e as Error).message });
  }
}

async function handlePUT(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id_agency, role } = await getAuth(req);
    requireManagerOrDev(role);

    const { key, url } = (req.body ?? {}) as { key?: string; url?: string };
    const finalKey =
      typeof key === "string" && key.trim()
        ? key.trim()
        : keyFromUrl(typeof url === "string" ? url : undefined);

    if (!finalKey) {
      return res.status(400).json({ error: "Falta 'key' o 'url'" });
    }

    const existing = await prisma.agency.findUnique({
      where: { id_agency },
      select: { logo_url: true },
    });

    const newUrl = publicUrlFor(finalKey);

    if (existing?.logo_url && existing.logo_url !== newUrl) {
      const oldKey = keyFromUrl(existing.logo_url);
      if (oldKey) {
        try {
          await s3.send(
            new DeleteObjectCommand({
              Bucket: SPACES_BUCKET,
              Key: oldKey,
            }),
          );
        } catch (err) {
          console.error("[agency/logo][DELETE-OLD] error:", err);
        }
      }
    }

    const updated = await prisma.agency.update({
      where: { id_agency },
      data: { logo_url: newUrl },
      select: { id_agency: true, logo_url: true },
    });

    return res.status(200).json(updated);
  } catch (e: unknown) {
    const status = getStatus(e, 500);
    return res.status(status).json({ error: (e as Error).message });
  }
}

async function handleDELETE(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id_agency, role } = await getAuth(req);
    requireManagerOrDev(role);

    const agency = await prisma.agency.findUnique({
      where: { id_agency },
      select: { logo_url: true },
    });
    if (!agency?.logo_url) {
      return res.status(200).json({ message: "No había logo para borrar" });
    }

    const oldKey = keyFromUrl(agency.logo_url);
    if (oldKey) {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: SPACES_BUCKET,
          Key: oldKey,
        }),
      );
    }

    await prisma.agency.update({
      where: { id_agency },
      data: { logo_url: null },
    });

    return res.status(200).json({ message: "Logo eliminado" });
  } catch (e: unknown) {
    const status = getStatus(e, 500);
    return res.status(status).json({ error: (e as Error).message });
  }
}

/** ====== Router ====== */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") return handleGET(req, res);
  if (req.method === "POST") return handlePOST(req, res);
  if (req.method === "PUT") return handlePUT(req, res);
  if (req.method === "DELETE") return handleDELETE(req, res);

  res.setHeader("Allow", ["GET", "POST", "PUT", "DELETE"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
