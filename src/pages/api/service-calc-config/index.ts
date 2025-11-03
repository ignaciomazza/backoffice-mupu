// src/pages/api/service-calc-config/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";
import type { Prisma, PrismaClient } from "@prisma/client";

/* =============================
 * Types “lite”
 * ============================= */
type ServiceCalcConfigRow = {
  id_config: number;
  id_agency: number;
  billing_breakdown_mode: string; // "auto" | "manual"
  created_at: Date;
  updated_at: Date;
};

type AgencyRow = {
  id_agency: number;
  transfer_fee_pct: number | null;
};

type CalcConfigResponse = {
  billing_breakdown_mode: string; // "auto" | "manual"
  transfer_fee_pct: number; // proporción (0.024 = 2.4%)
};

/* =============================
 * Helpers comunes
 * ============================= */
const JWT_SECRET = process.env.JWT_SECRET;
const isProd = process.env.NODE_ENV === "production";

type TokenPayload = JWTPayload & {
  id_agency?: number;
  agencyId?: number;
  aid?: number;
  role?: string;
};

function getTokenFromRequest(req: NextApiRequest): string | null {
  if (req.cookies?.token) return req.cookies.token;
  const a = req.headers.authorization || "";
  if (a.startsWith("Bearer ")) return a.slice(7);
  for (const k of [
    "session",
    "auth_token",
    "access_token",
    "next-auth.session-token",
  ]) {
    const v = (req.cookies as Record<string, string | undefined>)?.[k];
    if (v) return v;
  }
  return null;
}

async function getAuth(req: NextApiRequest) {
  try {
    const tok = getTokenFromRequest(req);
    if (!tok || !JWT_SECRET) return null;
    const { payload } = await jwtVerify(
      tok,
      new TextEncoder().encode(JWT_SECRET),
    );
    const p = payload as TokenPayload;
    const id_agency = Number(p.id_agency ?? p.agencyId ?? p.aid) || undefined;
    const role = String(p.role ?? "").toLowerCase();
    if (!id_agency) return null;
    return { id_agency, role };
  } catch {
    return null;
  }
}

function canWrite(role: string) {
  return ["gerente", "administrativo", "desarrollador"].includes(role);
}

function parsePct(input: unknown): number | null {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    if (input > 1) return input / 100;
    if (input < 0) return null;
    return input;
  }
  if (typeof input === "string") {
    const raw = input.replace(",", ".").trim();
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    if (n > 1) return n / 100;
    if (n < 0) return null;
    return n;
  }
  return null;
}

function sendError(
  res: NextApiResponse,
  tag: string,
  e: unknown,
  status = 500,
  fallback = "Error interno",
) {
  console.error(`[${tag}]`, e);
  const detail =
    e instanceof Error ? e.message : typeof e === "string" ? e : undefined;
  if (isProd) return res.status(status).json({ error: fallback });
  return res.status(status).json({ error: fallback, detail });
}

/* ========== Delegates sin any ========== */
type ClientLike = PrismaClient | Prisma.TransactionClient;

type ServiceCalcConfigLike = {
  findUnique: (
    args: Prisma.ServiceCalcConfigFindUniqueArgs,
  ) => Promise<Partial<ServiceCalcConfigRow> | null>;
  upsert: (
    args: Prisma.ServiceCalcConfigUpsertArgs,
  ) => Promise<ServiceCalcConfigRow>;
};

type AgencyLike = {
  findUnique: (
    args: Prisma.AgencyFindUniqueArgs,
  ) => Promise<Partial<AgencyRow> | null>;
  update: (args: Prisma.AgencyUpdateArgs) => Promise<AgencyRow>;
};

function readProp<T>(obj: Record<string, unknown>, name: string): T | null {
  const v = obj[name];
  return v && typeof v === "object" ? (v as T) : null;
}

/** Acepta prisma o tx y resuelve delegates robustamente (sin any) */
function requireDelegates(client: ClientLike) {
  const bag = client as unknown as Record<string, unknown>;

  const scc =
    readProp<ServiceCalcConfigLike>(bag, "serviceCalcConfig") ||
    readProp<ServiceCalcConfigLike>(bag, "ServiceCalcConfig") ||
    readProp<ServiceCalcConfigLike>(bag, "service_calc_config");

  if (!scc || typeof scc.findUnique !== "function") {
    throw new Error(
      'No se encontró el delegate Prisma "serviceCalcConfig". Verificá `model ServiceCalcConfig { ... }` y corré `npx prisma generate`.',
    );
  }

  const ag =
    readProp<AgencyLike>(bag, "agency") ||
    readProp<AgencyLike>(bag, "Agency") ||
    readProp<AgencyLike>(bag, "agencies");

  if (!ag || typeof ag.findUnique !== "function") {
    throw new Error(
      'No se encontró el delegate Prisma "agency". Verificá `model Agency { ... }` y corré `npx prisma generate`.',
    );
  }

  return { serviceCalcConfig: scc, agency: ag };
}

/* =============================
 * Handler
 * ============================= */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    const auth = await getAuth(req);
    if (!auth) return res.status(401).json({ error: "No autenticado" });

    const { serviceCalcConfig, agency } = requireDelegates(prisma);

    if (req.method === "GET") {
      try {
        const [cfg, ag] = await Promise.all([
          serviceCalcConfig.findUnique({
            where: { id_agency: auth.id_agency },
            select: { billing_breakdown_mode: true },
          }),
          agency.findUnique({
            where: { id_agency: auth.id_agency },
            select: { transfer_fee_pct: true },
          }),
        ]);

        const payload: CalcConfigResponse = {
          billing_breakdown_mode:
            (cfg?.billing_breakdown_mode as string) ?? "auto",
          transfer_fee_pct:
            ag?.transfer_fee_pct != null ? Number(ag.transfer_fee_pct) : 0.024,
        };
        return res.status(200).json(payload);
      } catch (e) {
        return sendError(
          res,
          "service-calc-config/GET",
          e,
          500,
          "Error leyendo configuración",
        );
      }
    }

    if (req.method === "POST") {
      if (!canWrite(auth.role)) {
        return res.status(403).json({ error: "Sin permisos" });
      }

      try {
        const body = (req.body ?? {}) as {
          billing_breakdown_mode?: unknown;
          transfer_fee_pct?: unknown;
        };

        let mode: string | undefined;
        if (typeof body.billing_breakdown_mode === "string") {
          const v = body.billing_breakdown_mode.trim().toLowerCase();
          if (!["auto", "manual"].includes(v)) {
            return res.status(400).json({
              error: 'billing_breakdown_mode debe ser "auto" o "manual"',
            });
          }
          mode = v;
        }

        const pct =
          body.transfer_fee_pct !== undefined
            ? parsePct(body.transfer_fee_pct)
            : undefined;
        if (body.transfer_fee_pct !== undefined && pct == null) {
          return res.status(400).json({
            error:
              "transfer_fee_pct inválido (acepta proporción 0–1 o porcentaje 0–100)",
          });
        }

        if (mode === undefined && pct === undefined) {
          return res
            .status(400)
            .json({ error: "No hay cambios para aplicar en el payload" });
        }

        await prisma.$transaction(async (tx) => {
          const { serviceCalcConfig: scc, agency: ag } = requireDelegates(tx);

          if (mode !== undefined) {
            await scc.upsert({
              where: { id_agency: auth.id_agency },
              update: { billing_breakdown_mode: mode },
              create: {
                id_agency: auth.id_agency,
                billing_breakdown_mode: mode,
              },
            });
          }
          if (pct !== undefined) {
            await ag.update({
              where: { id_agency: auth.id_agency },
              data: { transfer_fee_pct: pct },
            });
          }
        });

        const [cfg, ag] = await Promise.all([
          serviceCalcConfig.findUnique({
            where: { id_agency: auth.id_agency },
            select: { billing_breakdown_mode: true },
          }),
          agency.findUnique({
            where: { id_agency: auth.id_agency },
            select: { transfer_fee_pct: true },
          }),
        ]);

        const payload: CalcConfigResponse = {
          billing_breakdown_mode:
            (cfg?.billing_breakdown_mode as string) ?? "auto",
          transfer_fee_pct:
            ag?.transfer_fee_pct != null ? Number(ag.transfer_fee_pct) : 0.024,
        };
        return res.status(200).json(payload);
      } catch (e) {
        return sendError(
          res,
          "service-calc-config/POST",
          e,
          500,
          "Error guardando configuración",
        );
      }
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (e) {
    return sendError(res, "service-calc-config", e);
  }
}
