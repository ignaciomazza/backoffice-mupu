// src/pages/api/dev/agencies/[id]/billing/adjustments/[adjustmentId].ts
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

function parseAgencyId(param: unknown): number {
  const raw = Array.isArray(param) ? param[0] : param;
  const id = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(id) || id <= 0)
    throw httpError(400, "ID de agencia invalido");
  return id;
}

function parseAdjustmentId(param: unknown): number {
  const raw = Array.isArray(param) ? param[0] : param;
  const id = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(id) || id <= 0)
    throw httpError(400, "ID invalido");
  return id;
}

function toDate(value?: string | Date | null) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const raw = String(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
    );
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const decimalInput = z.preprocess((v) => {
  if (v === "" || v === null || v === undefined) return undefined;
  if (typeof v === "string") return Number(v);
  return v;
}, z.number().finite());

const AdjustmentSchema = z
  .object({
    kind: z
      .string()
      .transform((v) => v.trim().toLowerCase())
      .refine((v) => v === "tax" || v === "discount", "Tipo invalido"),
    mode: z
      .string()
      .transform((v) => v.trim().toLowerCase())
      .refine((v) => v === "percent" || v === "fixed", "Modo invalido"),
    value: decimalInput,
    currency: z
      .string()
      .optional()
      .transform((v) => (v ? v.trim().toUpperCase() : undefined)),
    label: z
      .string()
      .optional()
      .transform((v) => (v ? v.trim() : undefined)),
    starts_at: z.union([z.string(), z.date(), z.null(), z.undefined()]),
    ends_at: z.union([z.string(), z.date(), z.null(), z.undefined()]),
    active: z.boolean().optional(),
  })
  .strict();

async function handlePUT(req: NextApiRequest, res: NextApiResponse) {
  await requireDeveloper(req);
  const id_agency = parseAgencyId(req.query.id);
  const id_adjustment = parseAdjustmentId(req.query.adjustmentId);

  const parsed = AdjustmentSchema.parse(req.body ?? {});
  const value = Number(parsed.value ?? 0);
  if (!Number.isFinite(value)) {
    return res.status(400).json({ error: "Valor invalido" });
  }

  const existing = await prisma.agencyBillingAdjustment.findUnique({
    where: { id_adjustment },
  });
  if (!existing || existing.id_agency !== id_agency) {
    return res.status(404).json({ error: "Ajuste no encontrado" });
  }

  const updated = await prisma.agencyBillingAdjustment.update({
    where: { id_adjustment },
    data: {
      kind: parsed.kind,
      mode: parsed.mode,
      value,
      currency: parsed.currency ?? null,
      label: parsed.label ?? null,
      starts_at: toDate(parsed.starts_at),
      ends_at: toDate(parsed.ends_at),
      active: parsed.active ?? true,
    },
  });

  return res.status(200).json({ ...updated, value: Number(updated.value) });
}

async function handleDELETE(req: NextApiRequest, res: NextApiResponse) {
  await requireDeveloper(req);
  const id_agency = parseAgencyId(req.query.id);
  const id_adjustment = parseAdjustmentId(req.query.adjustmentId);

  const existing = await prisma.agencyBillingAdjustment.findUnique({
    where: { id_adjustment },
  });
  if (!existing || existing.id_agency !== id_agency) {
    return res.status(404).json({ error: "Ajuste no encontrado" });
  }

  await prisma.agencyBillingAdjustment.delete({
    where: { id_adjustment },
  });

  return res.status(200).json({ ok: true });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
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
    if (req.method === "DELETE") return await handleDELETE(req, res);
    res.setHeader("Allow", ["PUT", "DELETE"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (e) {
    const err = e as AppError;
    const status = typeof err.status === "number" ? err.status : 500;
    const message = err.message || "Error";
    return res.status(status).json({ error: message });
  }
}
