// src/pages/api/dev/agencies/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";
import { z } from "zod";
import { toDateKeyInBuenosAires } from "@/lib/buenosAiresDate";

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

/* ========== Validaciones creación ========== */
// Helpers
function toLocalDate(v?: string | null): Date | undefined {
  if (!v) return undefined;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
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

const AgencyCreateSchema = z
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
function sanitizeAgency(a: {
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
  billing_owner_agency_id: number | null;
  afip_cert_base64?: unknown | null;
  afip_key_base64?: unknown | null;
}) {
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

function chargeSortDate(charge: {
  period_end?: Date | null;
  period_start?: Date | null;
  created_at?: Date | null;
}) {
  return (
    charge.period_end ??
    charge.period_start ??
    charge.created_at ??
    new Date(0)
  );
}

function getBillingStatus(
  charge: {
    status?: string | null;
    period_end?: Date | null;
  } | null,
) {
  if (!charge) return "NONE";
  const status = String(charge.status || "").toUpperCase();
  if (status === "PAID") return "PAID";
  if (charge.period_end && charge.period_end < new Date()) return "OVERDUE";
  return "PENDING";
}

/* ========== GET (lista con cursor “ver más”) ========== */
async function handleGET(req: NextApiRequest, res: NextApiResponse) {
  await requireDeveloper(req);

  const qRaw = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q;
  const query = typeof qRaw === "string" ? qRaw.trim() : "";
  const limitRaw = Array.isArray(req.query.limit)
    ? req.query.limit[0]
    : req.query.limit;
  const limitNum = Math.min(
    50,
    Math.max(5, Number.parseInt(String(limitRaw ?? "20"), 10) || 20),
  );
  const cursorRaw = Array.isArray(req.query.cursor)
    ? req.query.cursor[0]
    : req.query.cursor;
  const cursorId = cursorRaw ? Number.parseInt(String(cursorRaw), 10) : null;

  const where =
    query.length > 0
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { legal_name: { contains: query, mode: "insensitive" as const } },
            { email: { contains: query, mode: "insensitive" as const } },
            { tax_id: { contains: query } },
          ],
        }
      : {};

  const list = await prisma.agency.findMany({
    where,
    orderBy: { id_agency: "desc" },
    ...(cursorId ? { cursor: { id_agency: cursorId }, skip: 1 } : undefined),
    take: limitNum + 1,
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
      billing_owner_agency_id: true,
      afip_cert_base64: true,
      afip_key_base64: true,
    },
  });

  let nextCursor: number | null = null;
  let items = list;
  if (list.length > limitNum) {
    items = list.slice(0, limitNum);
    nextCursor = items[items.length - 1]?.id_agency ?? null;
  }

  const ownerIds = Array.from(
    new Set(
      items.map((a) => a.billing_owner_agency_id ?? a.id_agency),
    ),
  );

  const [ownerAgencies, charges] = await Promise.all([
    prisma.agency.findMany({
      where: { id_agency: { in: ownerIds } },
      select: { id_agency: true, name: true },
    }),
    prisma.agencyBillingCharge.findMany({
      where: { id_agency: { in: ownerIds } },
      select: {
        id_agency: true,
        status: true,
        period_start: true,
        period_end: true,
        created_at: true,
        charge_kind: true,
      },
    }),
  ]);

  const ownerNameMap = ownerAgencies.reduce<Record<number, string>>(
    (acc, row) => {
      acc[row.id_agency] = row.name;
      return acc;
    },
    {},
  );

  const recurringCharges = charges.filter(
    (charge) =>
      String(charge.charge_kind || "RECURRING").toUpperCase() !== "EXTRA",
  );

  const lastChargeByOwner = recurringCharges.reduce<
    Record<number, typeof charges[number]>
  >((acc, charge) => {
    const current = acc[charge.id_agency];
    if (!current || chargeSortDate(charge) > chargeSortDate(current)) {
      acc[charge.id_agency] = charge;
    }
    return acc;
  }, {});

  const withCounts = await Promise.all(
    items.map(async (a) => {
      const [users, clients, bookings] = await Promise.all([
        prisma.user.count({ where: { id_agency: a.id_agency } }),
        prisma.client.count({ where: { id_agency: a.id_agency } }),
        prisma.booking.count({ where: { id_agency: a.id_agency } }),
      ]);
      const ownerId = a.billing_owner_agency_id ?? a.id_agency;
      const lastCharge = lastChargeByOwner[ownerId] ?? null;
      return {
        ...sanitizeAgency(a),
        counts: { users, clients, bookings },
        billing: {
          owner_id: ownerId,
          owner_name: ownerNameMap[ownerId] ?? a.name,
          is_owner: ownerId === a.id_agency,
          status: getBillingStatus(lastCharge),
          period_start: lastCharge?.period_start ?? null,
          period_end: lastCharge?.period_end ?? null,
        },
      };
    }),
  );

  return res.status(200).json({ items: withCounts, nextCursor });
}

/* ========== POST (crear agencia) ========== */
async function handlePOST(req: NextApiRequest, res: NextApiResponse) {
  await requireDeveloper(req);

  try {
    const parsed = AgencyCreateSchema.parse(req.body ?? {});
    const created = await prisma.agency.create({
      data: {
        name: parsed.name,
        legal_name: parsed.legal_name,
        tax_id: parsed.tax_id,
        address: parsed.address ?? null,
        phone: parsed.phone ?? null,
        email: parsed.email ?? null,
        website: parsed.website ?? null,
        foundation_date: parsed.foundation_date
          ? toLocalDate(
              parsed.foundation_date instanceof Date
                ? (toDateKeyInBuenosAires(parsed.foundation_date) ?? "")
                : (parsed.foundation_date as string),
            )
          : undefined,
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
        billing_owner_agency_id: true,
        afip_cert_base64: true,
        afip_key_base64: true,
      },
    });

    return res.status(201).json({
      ...sanitizeAgency(created),
      counts: { users: 0, clients: 0, bookings: 0 },
    });
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "name" in e &&
      (e as { name: string }).name === "ZodError"
    ) {
      const zz = e as { issues?: { message?: string }[] };
      return res
        .status(400)
        .json({ error: zz.issues?.[0]?.message || "Datos inválidos" });
    }
    // eslint-disable-next-line no-console
    console.error("[dev/agencies][POST]", e);
    return res.status(500).json({ error: "Error al crear la agencia" });
  }
}

/* ========== Router ========== */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method === "GET") return await handleGET(req, res);
    if (req.method === "POST") return await handlePOST(req, res);
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (e) {
    const err = e as AppError;
    const status = typeof err.status === "number" ? err.status : 500;
    const message = err.message || "Error";
    return res.status(status).json({ error: message });
  }
}
