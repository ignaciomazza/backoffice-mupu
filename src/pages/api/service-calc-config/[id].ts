// src/pages/api/service-calc-config/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";

/* =============================
 * Delegates “lite” locales
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

type FindUniqueArgs = {
  where: Record<string, unknown>;
  select?: Record<string, boolean>;
};
type UpdateArgs<Row extends object> = {
  where: Record<string, unknown>;
  data: Partial<Row>;
  select?: Record<string, boolean>;
};
type DeleteArgs = {
  where: Record<string, unknown>;
};
type CreateArgs<Row extends object> = {
  data: Partial<Row>;
};

type ServiceCalcConfigDelegateLite = {
  findUnique(
    args: FindUniqueArgs,
  ): Promise<Partial<ServiceCalcConfigRow> | null>;
  update(args: UpdateArgs<ServiceCalcConfigRow>): Promise<ServiceCalcConfigRow>;
  delete(args: DeleteArgs): Promise<ServiceCalcConfigRow>;
  create(args: CreateArgs<ServiceCalcConfigRow>): Promise<ServiceCalcConfigRow>;
};
type AgencyDelegateLite = {
  findUnique(args: FindUniqueArgs): Promise<Partial<AgencyRow> | null>;
  update(args: UpdateArgs<AgencyRow>): Promise<AgencyRow>;
};

type Db = typeof prisma & {
  serviceCalcConfig: ServiceCalcConfigDelegateLite;
  agency: AgencyDelegateLite;
};
const db = prisma as Db;

/* =============================
 * Auth helpers
 * ============================= */
type TokenPayload = JWTPayload & {
  id_user?: number;
  userId?: number;
  uid?: number;
  id_agency?: number;
  agencyId?: number;
  aid?: number;
  role?: string;
  email?: string;
};

const JWT_SECRET = process.env.JWT_SECRET;

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

/* =============================
 * Utils
 * ============================= */
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

type CalcConfigResponse = {
  billing_breakdown_mode: string; // "auto" | "manual"
  transfer_fee_pct: number; // proporción (0.024 = 2.4%)
};

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

    const idParam = Array.isArray(req.query.id)
      ? req.query.id[0]
      : req.query.id;
    const id = Number(idParam); // tratamos [id] como id_agency

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "ID inválido" });
    }
    if (id !== auth.id_agency) {
      // Evitamos enumeración cruzada de agencias
      return res.status(404).json({ error: "No encontrado" });
    }

    if (req.method === "GET") {
      const [cfg, agency] = await Promise.all([
        db.serviceCalcConfig.findUnique({
          where: { id_agency: id },
          select: { billing_breakdown_mode: true },
        }),
        db.agency.findUnique({
          where: { id_agency: id },
          select: { transfer_fee_pct: true },
        }),
      ]);

      const payload: CalcConfigResponse = {
        billing_breakdown_mode:
          (cfg?.billing_breakdown_mode as string) ?? "auto",
        transfer_fee_pct:
          agency?.transfer_fee_pct != null
            ? Number(agency.transfer_fee_pct)
            : 0.024,
      };
      return res.status(200).json(payload);
    }

    if (req.method === "PUT") {
      if (!canWrite(auth.role)) {
        return res.status(403).json({ error: "Sin permisos" });
      }

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

      await prisma.$transaction(async (txAny) => {
        const tx = txAny as Db;

        if (mode !== undefined) {
          // upsert manual con clave única id_agency:
          const existing = await tx.serviceCalcConfig.findUnique({
            where: { id_agency: id },
            select: { id_config: true },
          });
          if (existing) {
            await tx.serviceCalcConfig.update({
              where: { id_agency: id },
              data: { billing_breakdown_mode: mode },
            });
          } else {
            await tx.serviceCalcConfig.create({
              data: { id_agency: id, billing_breakdown_mode: mode },
            });
          }
        }

        if (pct !== undefined) {
          await tx.agency.update({
            where: { id_agency: id },
            data: { transfer_fee_pct: pct },
          });
        }
      });

      const [cfg, agency] = await Promise.all([
        db.serviceCalcConfig.findUnique({
          where: { id_agency: id },
          select: { billing_breakdown_mode: true },
        }),
        db.agency.findUnique({
          where: { id_agency: id },
          select: { transfer_fee_pct: true },
        }),
      ]);

      const payload: CalcConfigResponse = {
        billing_breakdown_mode:
          (cfg?.billing_breakdown_mode as string) ?? "auto",
        transfer_fee_pct:
          agency?.transfer_fee_pct != null
            ? Number(agency.transfer_fee_pct)
            : 0.024,
      };
      return res.status(200).json(payload);
    }

    if (req.method === "DELETE") {
      if (!canWrite(auth.role)) {
        return res.status(403).json({ error: "Sin permisos" });
      }

      // Borramos la fila de config (si existe). No tocamos transfer_fee_pct.
      const existing = await db.serviceCalcConfig.findUnique({
        where: { id_agency: id },
        select: { id_config: true },
      });
      if (!existing) {
        return res.status(204).end();
      }

      await db.serviceCalcConfig.delete({ where: { id_agency: id } });
      return res.status(204).end();
    }

    res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (e) {
    console.error("[service-calc-config/[id]] error", e);
    return res.status(500).json({ error: "Error en service-calc-config/[id]" });
  }
}
