// src/pages/api/agency/afip/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";
import { z } from "zod";
import crypto from "crypto";

/* ==== JWT / Auth helpers ==== */
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

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

type DecodedAuth = {
  id_user: number;
  id_agency: number;
  role: string;
  email?: string;
};

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
  const c = req.cookies || {};
  for (const k of [
    "session",
    "auth_token",
    "access_token",
    "next-auth.session-token",
  ]) {
    const v = c[k];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

async function getUserFromAuth(
  req: NextApiRequest,
): Promise<DecodedAuth | null> {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return null;

    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET),
    );
    const p = payload as TokenPayload;

    const id_user = Number(p.id_user ?? p.userId ?? p.uid) || undefined;
    let id_agency = Number(p.id_agency ?? p.agencyId ?? p.aid) || undefined;
    let role = normalizeRole(p.role);
    const email = p.email;

    if (id_user && (!id_agency || !role)) {
      const u = await prisma.user.findUnique({
        where: { id_user },
        select: { id_agency: true, role: true, email: true },
      });
      if (!u) return null;
      id_agency = id_agency ?? u.id_agency;
      role = role || normalizeRole(u.role);
    } else if (!id_user && email) {
      const u = await prisma.user.findUnique({
        where: { email },
        select: { id_user: true, id_agency: true, role: true },
      });
      if (!u) return null;
      return {
        id_user: u.id_user,
        id_agency: u.id_agency,
        role: normalizeRole(u.role),
        email,
      };
    }

    if (!id_user || !id_agency) return null;
    return { id_user, id_agency, role, email: email ?? undefined };
  } catch {
    return null;
  }
}

/* ==== Cifrado (AES-256-GCM) ==== */
const ENC_ALGO = "aes-256-gcm";
function getEncKey(): Buffer {
  const raw = process.env.AFIP_SECRET_KEY;
  if (!raw) throw new Error("AFIP_SECRET_KEY no configurado");
  if (/^[A-Za-z0-9+/=]+$/.test(raw) && raw.length % 4 === 0) {
    const b = Buffer.from(raw, "base64");
    if (b.length === 32) return b;
  }
  if (/^[0-9a-fA-F]+$/.test(raw) && raw.length === 64) {
    return Buffer.from(raw, "hex");
  }
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

/* ==== Validaciones y helpers ==== */
const PutSchema = z
  .object({
    cert: z.string().min(1, "cert requerido").optional(),
    key: z.string().min(1, "key requerida").optional(),
  })
  .refine((d) => d.cert || d.key, { message: "Enviá 'cert' y/o 'key'." });

function extractBase64(input: string): string {
  let s = (input || "").trim();
  const m = s.match(/^data:[^;]+;base64,(.+)$/i);
  if (m) s = m[1].trim();
  if (s.startsWith("-----BEGIN")) {
    return Buffer.from(s, "utf8").toString("base64");
  }
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(s)) {
    return s.replace(/\r?\n/g, "");
  }
  return Buffer.from(s, "utf8").toString("base64");
}

type AfipMeta = {
  afip_cert_base64: string | null;
  afip_key_base64: string | null;
};
function sanitizeMeta(a: AfipMeta | null) {
  return {
    certUploaded: Boolean(
      a?.afip_cert_base64 && String(a.afip_cert_base64).length > 0,
    ),
    keyUploaded: Boolean(
      a?.afip_key_base64 && String(a.afip_key_base64).length > 0,
    ),
  };
}

/* ==== Handlers ==== */
async function handleGET(req: NextApiRequest, res: NextApiResponse) {
  const auth = await getUserFromAuth(req);
  if (!auth?.id_agency)
    return res.status(401).json({ error: "No autenticado" });

  if (!["gerente", "desarrollador"].includes(auth.role)) {
    return res.status(403).json({ error: "No autorizado" });
  }

  try {
    const agency = await prisma.agency.findUnique({
      where: { id_agency: auth.id_agency },
      select: { afip_cert_base64: true, afip_key_base64: true },
    });
    if (!agency)
      return res.status(404).json({ error: "Agencia no encontrada" });
    return res.status(200).json(sanitizeMeta(agency));
  } catch (e: unknown) {
    console.error("[agency/afip][GET]", e);
    return res.status(500).json({ error: "Error obteniendo estado AFIP" });
  }
}

async function handlePUT(req: NextApiRequest, res: NextApiResponse) {
  const auth = await getUserFromAuth(req);
  if (!auth?.id_agency)
    return res.status(401).json({ error: "No autenticado" });
  if (!["gerente", "desarrollador"].includes(auth.role)) {
    return res.status(403).json({ error: "No autorizado" });
  }

  try {
    const { cert, key } = PutSchema.parse(req.body ?? {});
    const data: Record<string, string | null | undefined> = {};

    if (cert) {
      const certB64 = extractBase64(cert);
      if (certB64.length > 10 * 1024 * 1024) {
        return res.status(413).json({ error: "Cert demasiado grande" });
      }
      data.afip_cert_base64 = encryptToString(certB64);
    }

    if (key) {
      const keyB64 = extractBase64(key);
      if (keyB64.length > 10 * 1024 * 1024) {
        return res.status(413).json({ error: "Key demasiado grande" });
      }
      data.afip_key_base64 = encryptToString(keyB64);
    }

    const updated = await prisma.agency.update({
      where: { id_agency: auth.id_agency },
      data,
      select: { afip_cert_base64: true, afip_key_base64: true },
    });

    return res.status(200).json(sanitizeMeta(updated));
  } catch (e: unknown) {
    if (
      typeof e === "object" &&
      e !== null &&
      (e as Record<string, unknown>).name === "ZodError"
    ) {
      const issues = (e as Record<string, unknown>).issues;
      const msg =
        Array.isArray(issues) &&
        issues[0] &&
        typeof (issues[0] as Record<string, unknown>).message === "string"
          ? String((issues[0] as Record<string, unknown>).message)
          : "Datos inválidos";
      return res.status(400).json({ error: msg });
    }
    console.error("[agency/afip][PUT]", e);
    return res.status(500).json({ error: "Error subiendo credenciales AFIP" });
  }
}

async function handleDELETE(req: NextApiRequest, res: NextApiResponse) {
  const auth = await getUserFromAuth(req);
  if (!auth?.id_agency)
    return res.status(401).json({ error: "No autenticado" });
  if (!["gerente", "desarrollador"].includes(auth.role)) {
    return res.status(403).json({ error: "No autorizado" });
  }

  const type =
    (Array.isArray(req.query.type) ? req.query.type[0] : req.query.type) ||
    "both";
  const toClear =
    type === "cert"
      ? { afip_cert_base64: null }
      : type === "key"
        ? { afip_key_base64: null }
        : { afip_cert_base64: null, afip_key_base64: null };

  try {
    const updated = await prisma.agency.update({
      where: { id_agency: auth.id_agency },
      data: toClear,
      select: { afip_cert_base64: true, afip_key_base64: true },
    });
    return res.status(200).json(sanitizeMeta(updated));
  } catch (e: unknown) {
    console.error("[agency/afip][DELETE]", e);
    return res
      .status(500)
      .json({ error: "Error eliminando credenciales AFIP" });
  }
}

/* ==== Router ==== */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") return handleGET(req, res);
  if (req.method === "PUT") return handlePUT(req, res);
  if (req.method === "DELETE") return handleDELETE(req, res);

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  return res.status(405).end(`Método ${req.method} no permitido`);
}

/* NOTA:
 - AFIP_SECRET_KEY requerido (32 bytes o se deriva con SHA-256).
 - Nunca devolvemos secretos; solo flags cert/key subidos.
*/
