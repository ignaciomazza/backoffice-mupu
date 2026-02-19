// src/pages/api/dev/agencies/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";
import { z } from "zod";
import {
  parseDateInputInBuenosAires,
  toDateKeyInBuenosAiresLegacySafe,
} from "@/lib/buenosAiresDate";

/* ========== Auth helpers ========== */
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

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
  // compat
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

/* ========== Validaciones / utils ========== */
function parseId(param: unknown): number {
  const raw = Array.isArray(param) ? param[0] : param;
  const id = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(id) || id <= 0) throw httpError(400, "ID inválido");
  return id;
}

function toLocalDate(v?: string | null): Date | undefined {
  if (!v) return undefined;
  const parsed = parseDateInputInBuenosAires(v);
  return parsed ?? undefined;
}

function validateCUIT(cuitRaw: string): boolean {
  const cuit = (cuitRaw || "").replace(/\D/g, "");
  if (cuit.length !== 11) return false;
  const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const digits = cuit.split("").map(Number);
  const dv = digits.pop()!;
  const sum = digits.reduce((acc, d, i) => acc + d * mult[i], 0);
  let mod = 11 - (sum % 11);
  if (mod === 11) mod = 0;
  if (mod === 10) mod = 9;
  return dv === mod;
}

const trimUndef = z
  .string()
  .transform((s) => s.trim())
  .transform((s) => (s.length ? s : undefined));

const urlOptional = trimUndef.refine((v) => !v || /^https?:\/\//i.test(v), {
  message: "Debe incluir http:// o https://",
});
const emailOptional = trimUndef.refine(
  (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  { message: "Email inválido" },
);

const AgencyUpdateSchema = z
  .object({
    name: z
      .string()
      .min(2)
      .transform((s) => s.trim()),
    legal_name: z
      .string()
      .min(2)
      .transform((s) => s.trim()),
    tax_id: z
      .string()
      .min(11)
      .transform((s) => s.trim())
      .refine((v) => validateCUIT(v), "CUIT inválido"),
    address: trimUndef.optional(),
    phone: trimUndef.optional(),
    email: emailOptional.optional(),
    website: urlOptional.optional(),
    foundation_date: z
      .union([z.string(), z.date(), z.undefined(), z.null()])
      .optional(),
    logo_url: urlOptional.optional(),
  })
  .strict();

/* ========== Serialización segura ========== */
type AgencySelected = {
  id_agency: number;
  name: string;
  legal_name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  tax_id: string;
  website: string | null;
  foundation_date: Date | null;
  logo_url: string | null;
  creation_date: Date;
  afip_cert_base64: unknown | null;
  afip_key_base64: unknown | null;
};

function sanitizeAgency(a: AgencySelected) {
  const { afip_cert_base64, afip_key_base64, ...rest } = a;
  return {
    ...rest,
    afip: {
      certUploaded: Boolean(
        afip_cert_base64 && String(afip_cert_base64).length > 0,
      ),
      keyUploaded: Boolean(
        afip_key_base64 && String(afip_key_base64).length > 0,
      ),
    },
  };
}

/* ========== GET: obtener agencia + counts ========== */
async function handleGET(req: NextApiRequest, res: NextApiResponse) {
  await requireDeveloper(req);
  const id = parseId(req.query.id);

  const a = await prisma.agency.findUnique({
    where: { id_agency: id },
    select: {
      id_agency: true,
      name: true,
      legal_name: true,
      address: true,
      phone: true,
      email: true,
      tax_id: true,
      website: true,
      foundation_date: true,
      logo_url: true,
      creation_date: true,
      afip_cert_base64: true,
      afip_key_base64: true,
    },
  });

  if (!a) return res.status(404).json({ error: "Agencia no encontrada" });

  const [users, clients, bookings] = await Promise.all([
    prisma.user.count({ where: { id_agency: id } }),
    prisma.client.count({ where: { id_agency: id } }),
    prisma.booking.count({ where: { id_agency: id } }),
  ]);

  return res
    .status(200)
    .json({
      ...sanitizeAgency(a as AgencySelected),
      counts: { users, clients, bookings },
    });
}

/* ========== PUT: actualizar agencia ========== */
async function handlePUT(req: NextApiRequest, res: NextApiResponse) {
  await requireDeveloper(req);
  const id = parseId(req.query.id);

  const parsed = (() => {
    // Permitimos Date o string; normalizamos
    const p = AgencyUpdateSchema.parse(req.body ?? {});
    return {
      ...p,
      foundation_date: p.foundation_date
        ? toLocalDate(
            p.foundation_date instanceof Date
              ? (toDateKeyInBuenosAiresLegacySafe(p.foundation_date) ?? "")
              : (p.foundation_date as string),
          )
        : undefined,
    };
  })();

  const updated = await prisma.agency.update({
    where: { id_agency: id },
    data: {
      name: parsed.name,
      legal_name: parsed.legal_name,
      tax_id: parsed.tax_id,
      address: parsed.address ?? null,
      phone: parsed.phone ?? null,
      email: parsed.email ?? null,
      website: parsed.website ?? null,
      foundation_date: parsed.foundation_date,
      logo_url: parsed.logo_url ?? null,
    },
    select: {
      id_agency: true,
      name: true,
      legal_name: true,
      address: true,
      phone: true,
      email: true,
      tax_id: true,
      website: true,
      foundation_date: true,
      logo_url: true,
      creation_date: true,
      afip_cert_base64: true,
      afip_key_base64: true,
    },
  });

  return res.status(200).json(sanitizeAgency(updated as AgencySelected));
}

/* ========== DELETE: borrar SOLO si no hay relaciones ========== */
async function handleDELETE(req: NextApiRequest, res: NextApiResponse) {
  await requireDeveloper(req);
  const id = parseId(req.query.id);

  // Verificamos relaciones relevantes antes de borrar
  const [users, clients, bookings, services, operators, investments, receipts] =
    await Promise.all([
      prisma.user.count({ where: { id_agency: id } }),
      prisma.client.count({ where: { id_agency: id } }),
      prisma.booking.count({ where: { id_agency: id } }),
      prisma.service.count({ where: { booking: { id_agency: id } } }),
      prisma.operator.count({ where: { id_agency: id } }),
      prisma.investment.count({ where: { id_agency: id } }),
      prisma.receipt.count({ where: { booking: { id_agency: id } } }),
    ]);

  const total =
    users + clients + bookings + services + operators + investments + receipts;

  if (total > 0) {
    return res.status(409).json({
      error:
        "No se puede eliminar: la agencia tiene registros vinculados (usuarios, pasajeros, reservas u otros).",
      counts: {
        users,
        clients,
        bookings,
        services,
        operators,
        investments,
        receipts,
      },
    });
  }

  await prisma.agency.delete({ where: { id_agency: id } });
  return res.status(200).json({ ok: true });
}

/* ========== Router ========== */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method === "GET") return await handleGET(req, res);
    if (req.method === "PUT") {
      try {
        return await handlePUT(req, res);
      } catch (e) {
        if (e instanceof z.ZodError) {
          return res
            .status(400)
            .json({ error: e.issues?.[0]?.message || "Datos inválidos" });
        }
        throw e;
      }
    }
    if (req.method === "DELETE") return await handleDELETE(req, res);

    res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (e) {
    // Manejo de errores tipado
    const err = e as AppError;
    const status = typeof err.status === "number" ? err.status : 500;
    const message = err.message || "Error";
    return res.status(status).json({ error: message });
  }
}
