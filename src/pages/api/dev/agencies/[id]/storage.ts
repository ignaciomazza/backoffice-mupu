// src/pages/api/dev/agencies/[id]/storage.ts
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
    throw httpError(400, "ID de agencia inválido");
  return id;
}

const numberInput = z.preprocess((v) => {
  if (v === "" || v === null || v === undefined) return undefined;
  if (typeof v === "string") return Number(v);
  return v;
}, z.number().int().min(1));

const boolInput = z.preprocess((v) => {
  if (typeof v === "string") return v === "true";
  return v;
}, z.boolean());

const StorageConfigSchema = z
  .object({
    enabled: boolInput,
    scope: z.enum(["agency", "group"]),
    storage_pack_count: numberInput,
    transfer_pack_count: numberInput,
    notes: z
      .string()
      .optional()
      .transform((v) => (v ? v.trim() : "")),
  })
  .strict();

async function handleGET(req: NextApiRequest, res: NextApiResponse) {
  await requireDeveloper(req);
  const id_agency = parseAgencyId(req.query.id);

  const agency = await prisma.agency.findUnique({
    where: { id_agency },
    select: {
      id_agency: true,
      name: true,
      legal_name: true,
      billing_owner_agency_id: true,
    },
  });
  if (!agency) return res.status(404).json({ error: "Agencia no encontrada" });

  const ownerId = agency.billing_owner_agency_id ?? agency.id_agency;
  const [owner, localConfig, ownerConfig] = await Promise.all([
    prisma.agency.findUnique({
      where: { id_agency: ownerId },
      select: { id_agency: true, name: true, legal_name: true },
    }),
    prisma.agencyStorageConfig.findUnique({
      where: { id_agency },
    }),
    prisma.agencyStorageConfig.findUnique({
      where: { id_agency: ownerId },
    }),
  ]);

  return res.status(200).json({
    agency,
    owner: owner
      ? {
          ...owner,
          is_owner: owner.id_agency === agency.id_agency,
        }
      : null,
    local_config: localConfig,
    owner_config: ownerConfig,
  });
}

async function handlePUT(req: NextApiRequest, res: NextApiResponse) {
  await requireDeveloper(req);
  const id_agency = parseAgencyId(req.query.id);

  const agency = await prisma.agency.findUnique({
    where: { id_agency },
    select: { id_agency: true, billing_owner_agency_id: true },
  });
  if (!agency) return res.status(404).json({ error: "Agencia no encontrada" });

  const body = StorageConfigSchema.parse(req.body ?? {});
  const ownerId = agency.billing_owner_agency_id ?? agency.id_agency;
  const targetId = body.scope === "group" ? ownerId : agency.id_agency;

  const config = await prisma.agencyStorageConfig.upsert({
    where: { id_agency: targetId },
    update: {
      enabled: body.enabled,
      scope: body.scope,
      storage_pack_count: body.storage_pack_count,
      transfer_pack_count: body.transfer_pack_count,
      notes: body.notes ?? null,
    },
    create: {
      id_agency: targetId,
      enabled: body.enabled,
      scope: body.scope,
      storage_pack_count: body.storage_pack_count,
      transfer_pack_count: body.transfer_pack_count,
      notes: body.notes ?? null,
    },
  });

  return res.status(200).json({ config, target_id: targetId });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method === "GET") return await handleGET(req, res);
    if (req.method === "PUT") return await handlePUT(req, res);
    res.setHeader("Allow", ["GET", "PUT"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (err) {
    const error = err as AppError;
    if (error?.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error("[dev/agencies/:id/storage]", err);
    return res.status(500).json({ error: "Error en storage" });
  }
}
