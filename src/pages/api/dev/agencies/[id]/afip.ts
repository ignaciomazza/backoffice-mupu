// src/pages/api/dev/agencies/[id]/afip.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";
import { z } from "zod";
import crypto from "crypto";

/* =========================
   ENV / Crypto
========================= */
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

const ENC_ALGO = "aes-256-gcm";
function getEncKey(): Buffer {
  const raw = process.env.AFIP_SECRET_KEY;
  if (!raw) throw new Error("AFIP_SECRET_KEY no configurado");

  // base64 de 32 bytes
  if (/^[A-Za-z0-9+/=]+$/.test(raw) && raw.length % 4 === 0) {
    const b = Buffer.from(raw, "base64");
    if (b.length === 32) return b;
  }
  // hex de 32 bytes
  if (/^[0-9a-fA-F]+$/.test(raw) && raw.length === 64) {
    return Buffer.from(raw, "hex");
  }
  // cualquier string → derivar a 32 bytes
  return crypto.createHash("sha256").update(raw).digest();
}

function encryptToString(plaintextUTF8: string): string {
  const iv = crypto.randomBytes(12);
  const key = getEncKey();
  const cipher = crypto.createCipheriv(ENC_ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintextUTF8, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${ciphertext.toString("hex")}:${tag.toString("hex")}`;
}

/* =========================
   Types / Auth helpers
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

async function requireDeveloper(req: NextApiRequest): Promise<number> {
  const token = getTokenFromRequest(req);
  if (!token) throw httpError(401, "No autenticado");

  const { payload } = await jwtVerify(
    token,
    new TextEncoder().encode(JWT_SECRET),
  );
  const p = payload as TokenPayload;
  const id_user = Number(p.id_user ?? p.userId ?? p.uid) || 0;
  const role = normalizeRole(p.role);

  if (!id_user || role !== "desarrollador")
    throw httpError(403, "No autorizado");
  return id_user;
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

function extractBase64(input: string): string {
  let s = (input || "").trim();
  // data URL
  const m = s.match(/^data:[^;]+;base64,(.+)$/i);
  if (m) s = m[1].trim();

  // Si viene PEM/CRT → guardamos texto completo en base64
  if (s.startsWith("-----BEGIN"))
    return Buffer.from(s, "utf8").toString("base64");

  // Si parece base64, normalizamos saltos
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(s)) return s.replace(/\r?\n/g, "");

  // Fallback: texto plano → base64
  return Buffer.from(s, "utf8").toString("base64");
}

function sanitizeMeta(row: {
  afip_cert_base64: string | null;
  afip_key_base64: string | null;
}) {
  return {
    certUploaded: Boolean(
      row.afip_cert_base64 && String(row.afip_cert_base64).length > 0,
    ),
    keyUploaded: Boolean(
      row.afip_key_base64 && String(row.afip_key_base64).length > 0,
    ),
  };
}

/* =========================
   Validation
========================= */
const PutSchema = z
  .object({
    cert: z.string().min(1, "cert requerido").optional(),
    key: z.string().min(1, "key requerida").optional(),
  })
  .refine((d) => d.cert || d.key, { message: "Enviá 'cert' y/o 'key'." });

/* =========================
   Handlers
========================= */

// GET → estado (flags) de cert/key de la agencia indicada
async function handleGET(req: NextApiRequest, res: NextApiResponse) {
  await requireDeveloper(req);
  const id_agency = parseAgencyId(req.query.id);

  const agency = await prisma.agency.findUnique({
    where: { id_agency },
    select: { afip_cert_base64: true, afip_key_base64: true },
  });
  if (!agency) return res.status(404).json({ error: "Agencia no encontrada" });

  return res.status(200).json(
    sanitizeMeta({
      afip_cert_base64: agency.afip_cert_base64,
      afip_key_base64: agency.afip_key_base64,
    }),
  );
}

// PUT → set/rotar cert y/o key (texto pegado, nunca devolvemos secretos)
async function handlePUT(req: NextApiRequest, res: NextApiResponse) {
  await requireDeveloper(req);
  const id_agency = parseAgencyId(req.query.id);

  try {
    const parsed = PutSchema.parse(req.body ?? {});
    const data: {
      afip_cert_base64?: string | null;
      afip_key_base64?: string | null;
    } = {};

    if (parsed.cert) {
      const certB64 = extractBase64(parsed.cert);
      if (certB64.length > 10 * 1024 * 1024)
        return res.status(413).json({ error: "Cert demasiado grande" });
      data.afip_cert_base64 = encryptToString(certB64);
    }

    if (parsed.key) {
      const keyB64 = extractBase64(parsed.key);
      if (keyB64.length > 10 * 1024 * 1024)
        return res.status(413).json({ error: "Key demasiado grande" });
      data.afip_key_base64 = encryptToString(keyB64);
    }

    const updated = await prisma.agency.update({
      where: { id_agency },
      data,
      select: { afip_cert_base64: true, afip_key_base64: true },
    });

    return res.status(200).json(
      sanitizeMeta({
        afip_cert_base64: updated.afip_cert_base64,
        afip_key_base64: updated.afip_key_base64,
      }),
    );
  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: e.issues?.[0]?.message || "Datos inválidos" });
    }
    console.error("[dev/agencies/:id/afip][PUT]", e);
    return res.status(500).json({ error: "Error guardando credenciales" });
  }
}

// DELETE → limpia cert, key o ambos (?type=cert|key|both; default both)
async function handleDELETE(req: NextApiRequest, res: NextApiResponse) {
  await requireDeveloper(req);
  const id_agency = parseAgencyId(req.query.id);

  const typeParam = Array.isArray(req.query.type)
    ? req.query.type[0]
    : req.query.type;
  const type = (typeParam || "both") as "cert" | "key" | "both";

  const data =
    type === "cert"
      ? { afip_cert_base64: null }
      : type === "key"
        ? { afip_key_base64: null }
        : { afip_cert_base64: null, afip_key_base64: null };

  const updated = await prisma.agency.update({
    where: { id_agency },
    data,
    select: { afip_cert_base64: true, afip_key_base64: true },
  });

  return res.status(200).json(
    sanitizeMeta({
      afip_cert_base64: updated.afip_cert_base64,
      afip_key_base64: updated.afip_key_base64,
    }),
  );
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
    if (req.method === "PUT") return await handlePUT(req, res);
    if (req.method === "DELETE") return await handleDELETE(req, res);

    res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (e) {
    const err = e as AppError;
    const status = typeof err.status === "number" ? err.status : 500;
    const message = err.message || "Error inesperado";
    return res.status(status).json({ error: message });
  }
}

/* ==========================================
   Notas:
   - Solo rol "desarrollador".
   - No hay subida de archivos, solo texto pegado (PEM/base64).
   - Se guarda cifrado (AES-256-GCM) en DB; la API nunca devuelve secretos.
========================================== */
