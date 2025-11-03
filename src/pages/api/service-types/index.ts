import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";
import type { Prisma, PrismaClient } from "@prisma/client";

/* =============================
 * Types “lite” locales
 * ============================= */
type Order = "asc" | "desc";

type ServiceTypeRow = {
  id_service_type: number;
  id_agency: number;
  code: string;
  name: string;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
};

type ServiceTypeDTO = Pick<
  ServiceTypeRow,
  "id_service_type" | "code" | "name" | "enabled" | "created_at" | "updated_at"
>;

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

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
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

type ServiceTypeDelegateLike = {
  findMany: (args: Prisma.ServiceTypeFindManyArgs) => Promise<ServiceTypeRow[]>;
  create: (args: Prisma.ServiceTypeCreateArgs) => Promise<ServiceTypeRow>;
};

function readProp<T>(obj: Record<string, unknown>, name: string): T | null {
  const v = obj[name];
  return v && typeof v === "object" ? (v as T) : null;
}

function requireServiceTypeDelegate(
  client: ClientLike,
): ServiceTypeDelegateLike {
  const bag = client as unknown as Record<string, unknown>;
  const svc =
    readProp<ServiceTypeDelegateLike>(bag, "serviceType") ||
    readProp<ServiceTypeDelegateLike>(bag, "service_type") ||
    readProp<ServiceTypeDelegateLike>(bag, "ServiceType") ||
    readProp<ServiceTypeDelegateLike>(bag, "serviceTypes");
  if (!svc || typeof svc.findMany !== "function") {
    throw new Error(
      'No se encontró el delegate Prisma "serviceType". Verificá `model ServiceType { ... }` y corré `npx prisma generate`.',
    );
  }
  return svc;
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

    const serviceType = requireServiceTypeDelegate(prisma);

    if (req.method === "GET") {
      try {
        const { q, enabled } = req.query;

        const where: Prisma.ServiceTypeWhereInput = {
          id_agency: auth.id_agency,
        };

        if (typeof q === "string" && q.trim()) {
          // evitamos `mode: "insensitive"` por compatibilidad de engines
          where.OR = [
            { name: { contains: q.trim() } },
            { code: { contains: q.trim() } },
          ];
        }

        if (
          typeof enabled === "string" &&
          (enabled === "true" || enabled === "false")
        ) {
          where.enabled = enabled === "true";
        }

        const items = await serviceType.findMany({
          where,
          orderBy: { name: "asc" as Order },
          select: {
            id_service_type: true,
            code: true,
            name: true,
            enabled: true,
            created_at: true,
            updated_at: true,
          },
        });

        return res.status(200).json(items as ServiceTypeDTO[]);
      } catch (e) {
        return sendError(res, "service-types/GET", e, 500, "Error en listado");
      }
    }

    if (req.method === "POST") {
      if (!canWrite(auth.role)) {
        return res.status(403).json({ error: "Sin permisos" });
      }
      try {
        const body = (req.body ?? {}) as {
          name?: unknown;
          code?: unknown;
          enabled?: unknown;
        };

        const rawName = typeof body.name === "string" ? body.name.trim() : "";
        let rawCode =
          typeof body.code === "string" ? body.code.trim() : slugify(rawName);
        const rawEnabled =
          typeof body.enabled === "boolean"
            ? body.enabled
            : typeof body.enabled === "string"
              ? body.enabled === "true"
              : true;

        if (!rawName) {
          return res.status(400).json({ error: "name es requerido" });
        }
        if (!rawCode) rawCode = slugify(rawName);
        if (rawName.length > 80) {
          return res
            .status(400)
            .json({ error: "name demasiado largo (máx 80)" });
        }
        if (rawCode.length > 60) {
          return res
            .status(400)
            .json({ error: "code demasiado largo (máx 60)" });
        }

        const created = await serviceType.create({
          data: {
            id_agency: auth.id_agency,
            name: rawName,
            code: slugify(rawCode),
            enabled: Boolean(rawEnabled),
          },
          select: {
            id_service_type: true,
            code: true,
            name: true,
            enabled: true,
            created_at: true,
            updated_at: true,
          },
        });

        return res.status(201).json(created as ServiceTypeDTO);
      } catch (e) {
        const maybeKnown = e as { code?: string };
        if (maybeKnown?.code === "P2002") {
          return res
            .status(409)
            .json({ error: "Ya existe un tipo con ese code o name" });
        }
        return sendError(
          res,
          "service-types/POST",
          e,
          500,
          "Error creando ServiceType",
        );
      }
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (e) {
    return sendError(res, "service-types", e);
  }
}
