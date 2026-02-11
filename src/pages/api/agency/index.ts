// src/pages/api/agency/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";
import { z } from "zod";
import { Prisma, type Agency as AgencyModel } from "@prisma/client";

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

/* ==== Utils / Validaciones ==== */
function toLocalDate(v?: unknown): Date | undefined {
  if (typeof v !== "string" || !v) return undefined;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m)
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
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

const trimToUndefined = z
  .string()
  .transform((s) => s.trim())
  .transform((s) => (s.length ? s : undefined));

const urlOptional = trimToUndefined.refine(
  (v) => !v || /^https?:\/\//i.test(v),
  { message: "Debe incluir http:// o https://", path: [] },
);

const emailOptional = trimToUndefined.refine(
  (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  { message: "Email inválido", path: [] },
);

const zSocial = z
  .object({
    instagram: trimToUndefined.optional(),
    facebook: trimToUndefined.optional(),
    twitter: trimToUndefined.optional(),
    tiktok: trimToUndefined.optional(),
  })
  .partial();

const AgencyBaseSchema = z.object({
  name: z
    .string()
    .min(2, "Nombre requerido")
    .transform((s) => s.trim()),
  legal_name: z
    .string()
    .min(2, "Razón social requerida")
    .transform((s) => s.trim()),
  tax_id: z
    .string()
    .min(11, "CUIT inválido")
    .transform((s) => s.trim())
    .refine((v) => validateCUIT(v), "CUIT inválido"),
  address: trimToUndefined.optional(),
  phone: trimToUndefined.optional(),
  email: emailOptional.optional(),
  website: urlOptional.optional(),
  social: zSocial.optional().nullable(),
  foundation_date: z
    .union([
      z
        .string()
        .refine((v) => !v || !!toLocalDate(v), "Fecha inválida (YYYY-MM-DD)"),
      z.date(),
      z.undefined(),
      z.null(),
    ])
    .optional(),
  logo_url: urlOptional.optional(),
});

const AgencyCreateSchema = AgencyBaseSchema.strict();
const AgencyUpdateSchema = AgencyBaseSchema.strict();

function sanitizeAgencyForResponse(a: AgencyModel | null) {
  if (!a) return a;
  const { afip_cert_base64, afip_key_base64, ...rest } = a;
  return {
    ...rest,
    afip: {
      certUploaded: Boolean(
        afip_cert_base64 && String(afip_cert_base64).length,
      ),
      keyUploaded: Boolean(afip_key_base64 && String(afip_key_base64).length),
    },
  };
}

type SocialInput = z.infer<typeof zSocial> | null | undefined;
function normalizeSocial(input: SocialInput) {
  if (!input || typeof input !== "object") return null;
  const cleaned: Record<string, string> = {};
  if (input.instagram) cleaned.instagram = input.instagram;
  if (input.facebook) cleaned.facebook = input.facebook;
  if (input.twitter) cleaned.twitter = input.twitter;
  if (input.tiktok) cleaned.tiktok = input.tiktok;
  return Object.keys(cleaned).length ? cleaned : null;
}

function errorName(e: unknown) {
  if (typeof e === "object" && e !== null) {
    const n = (e as Record<string, unknown>).name;
    if (typeof n === "string") return n;
  }
  return undefined;
}

function parseZodIssue(e: unknown): { message?: string; field?: string } {
  if (typeof e === "object" && e !== null) {
    const issues = (e as Record<string, unknown>).issues;
    if (Array.isArray(issues) && issues.length > 0) {
      const firstIssue = issues[0] as Record<string, unknown>;
      const msg = firstIssue.message;
      const path = firstIssue.path;

      const field =
        Array.isArray(path) && path.length > 0
          ? path
              .filter((p) => typeof p === "string" || typeof p === "number")
              .map(String)
              .join(".")
          : undefined;

      return {
        message: typeof msg === "string" ? msg : undefined,
        field: field || undefined,
      };
    }
  }
  return {};
}

/* ==== Handlers ==== */
async function handleGET(req: NextApiRequest, res: NextApiResponse) {
  const auth = await getUserFromAuth(req);
  if (!auth?.id_agency) {
    return res.status(401).json({ error: "No autenticado" });
  }

  try {
    const agency = await prisma.agency.findUnique({
      where: { id_agency: auth.id_agency },
    });
    if (!agency) {
      return res.status(404).json({ error: "Agencia no encontrada" });
    }
    return res.status(200).json(sanitizeAgencyForResponse(agency));
  } catch (e: unknown) {
    console.error("[agency][GET]", e);
    return res.status(500).json({ error: "Error al obtener la agencia" });
  }
}

async function handlePOST(req: NextApiRequest, res: NextApiResponse) {
  const auth = await getUserFromAuth(req);
  if (!auth) return res.status(401).json({ error: "No autenticado" });
  if (auth.role !== "desarrollador") {
    return res.status(403).json({ error: "No autorizado" });
  }

  try {
    const parsed = AgencyCreateSchema.parse(req.body ?? {});
    const {
      name,
      legal_name,
      tax_id,
      address,
      phone,
      email,
      website,
      social,
      foundation_date,
      logo_url,
    } = parsed;

    const socialData = normalizeSocial(social);

    const created = await prisma.agency.create({
      data: {
        name,
        legal_name,
        tax_id,
        address: address ?? null,
        phone: phone ?? null,
        email: email ?? null,
        website: website ?? null,
        social: socialData ?? Prisma.DbNull,
        foundation_date: foundation_date
          ? toLocalDate(
              foundation_date instanceof Date
                ? foundation_date.toISOString().slice(0, 10)
                : (foundation_date as string),
            )
          : undefined,
        logo_url: logo_url ?? null,
      },
    });

    return res.status(201).json(sanitizeAgencyForResponse(created));
  } catch (e: unknown) {
    if (errorName(e) === "ZodError") {
      const issue = parseZodIssue(e);
      return res
        .status(400)
        .json({
          error: issue.message || "Datos inválidos",
          field: issue.field,
          hint: issue.field
            ? `Revisá el campo '${issue.field}' y corregí el formato solicitado.`
            : "Revisá los datos obligatorios y volvé a intentar.",
        });
    }
    console.error("[agency][POST]", e);
    return res.status(500).json({ error: "Error al crear la agencia" });
  }
}

async function handlePUT(req: NextApiRequest, res: NextApiResponse) {
  const auth = await getUserFromAuth(req);
  if (!auth?.id_agency) {
    return res.status(401).json({ error: "No autenticado" });
  }
  if (!["gerente", "desarrollador"].includes(auth.role)) {
    return res.status(403).json({ error: "No autorizado" });
  }

  try {
    const parsed = AgencyUpdateSchema.parse(req.body ?? {});
    const {
      name,
      legal_name,
      tax_id,
      address,
      phone,
      email,
      website,
      social,
      foundation_date,
      logo_url,
    } = parsed;

    const socialData = normalizeSocial(social);

    const updated = await prisma.agency.update({
      where: { id_agency: auth.id_agency },
      data: {
        name,
        legal_name,
        tax_id,
        address: address ?? null,
        phone: phone ?? null,
        email: email ?? null,
        website: website ?? null,
        social: socialData ?? Prisma.DbNull,
        foundation_date: foundation_date
          ? toLocalDate(
              foundation_date instanceof Date
                ? foundation_date.toISOString().slice(0, 10)
                : (foundation_date as string),
            )
          : undefined,
        logo_url: logo_url ?? null,
      },
    });

    return res.status(200).json(sanitizeAgencyForResponse(updated));
  } catch (e: unknown) {
    if (errorName(e) === "ZodError") {
      const issue = parseZodIssue(e);
      return res
        .status(400)
        .json({
          error: issue.message || "Datos inválidos",
          field: issue.field,
          hint: issue.field
            ? `Revisá el campo '${issue.field}' y corregí el formato solicitado.`
            : "Revisá los datos obligatorios y volvé a intentar.",
        });
    }
    console.error("[agency][PUT]", e);
    return res.status(500).json({ error: "Error al actualizar la agencia" });
  }
}

/* ==== Router ==== */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") return handleGET(req, res);
  if (req.method === "POST") return handlePOST(req, res);
  if (req.method === "PUT") return handlePUT(req, res);

  res.setHeader("Allow", ["GET", "POST", "PUT"]);
  return res.status(405).end(`Método ${req.method} no permitido`);
}
