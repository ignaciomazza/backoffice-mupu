// src/pages/api/dev/agencies/[id]/billing/group.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";
import { z } from "zod";

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

async function requireDeveloper(req: NextApiRequest): Promise<void> {
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
}

function parseAgencyId(param: unknown): number {
  const raw = Array.isArray(param) ? param[0] : param;
  const id = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(id) || id <= 0)
    throw httpError(400, "ID de agencia invalido");
  return id;
}

async function resolveOwnerId(id_agency: number) {
  const agency = await prisma.agency.findUnique({
    where: { id_agency },
    select: { id_agency: true, billing_owner_agency_id: true },
  });
  if (!agency) throw httpError(404, "Agencia no encontrada");
  return agency.billing_owner_agency_id ?? agency.id_agency;
}

async function handleGET(req: NextApiRequest, res: NextApiResponse) {
  await requireDeveloper(req);
  const id_agency = parseAgencyId(req.query.id);

  const ownerId = await resolveOwnerId(id_agency);
  const [owner, members] = await Promise.all([
    prisma.agency.findUnique({
      where: { id_agency: ownerId },
      select: { id_agency: true, name: true, legal_name: true },
    }),
    prisma.agency.findMany({
      where: {
        OR: [
          { id_agency: ownerId },
          { billing_owner_agency_id: ownerId },
        ],
      },
      orderBy: { name: "asc" },
      select: { id_agency: true, name: true, legal_name: true },
    }),
  ]);

  if (!owner) throw httpError(404, "Agencia no encontrada");

  return res.status(200).json({
    owner: owner,
    is_owner: ownerId === id_agency,
    members,
  });
}

const UpdateSchema = z
  .object({
    owner_id: z.number().int().positive().nullable().optional(),
  })
  .strict();

async function handlePUT(req: NextApiRequest, res: NextApiResponse) {
  await requireDeveloper(req);
  const id_agency = parseAgencyId(req.query.id);
  const parsed = UpdateSchema.parse(req.body ?? {});

  const ownerRaw = parsed.owner_id ?? null;
  let ownerId: number | null = ownerRaw;

  if (ownerId && ownerId !== id_agency) {
    const owner = await prisma.agency.findUnique({
      where: { id_agency: ownerId },
      select: { id_agency: true, billing_owner_agency_id: true },
    });
    if (!owner) throw httpError(404, "Agencia no encontrada");
    ownerId = owner.billing_owner_agency_id ?? owner.id_agency;
  } else {
    ownerId = null;
  }

  if (ownerId === id_agency) ownerId = null;

  await prisma.agency.update({
    where: { id_agency },
    data: { billing_owner_agency_id: ownerId },
  });

  return res.status(200).json({ ok: true });
}

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
            .json({ error: e.issues?.[0]?.message || "Datos invalidos" });
        }
        throw e;
      }
    }
    res.setHeader("Allow", ["GET", "PUT"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (e) {
    const err = e as AppError;
    const status = typeof err.status === "number" ? err.status : 500;
    const message = err.message || "Error";
    return res.status(status).json({ error: message });
  }
}
