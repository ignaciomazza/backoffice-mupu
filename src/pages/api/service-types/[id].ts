// src/pages/api/service-types/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";

/* =============================
 * Delegates “lite” locales
 * ============================= */
type ServiceTypeRow = {
  id_service_type: number;
  id_agency: number;
  code: string;
  name: string;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
};

type ServiceTypeFindUniqueArgs = {
  where: Record<string, unknown>;
  select?: Partial<Record<keyof ServiceTypeRow, boolean>>;
};
type ServiceTypeUpdateArgs = {
  where: Record<string, unknown>;
  data: Partial<Pick<ServiceTypeRow, "code" | "name" | "enabled">>;
  select?: Partial<Record<keyof ServiceTypeRow, boolean>>;
};

type ServiceTypeDelegateLite = {
  findUnique(args: ServiceTypeFindUniqueArgs): Promise<ServiceTypeRow | null>;
  update(args: ServiceTypeUpdateArgs): Promise<ServiceTypeRow>;
  delete(args: { where: Record<string, unknown> }): Promise<ServiceTypeRow>;
};

type Db = typeof prisma & { serviceType: ServiceTypeDelegateLite };
const db = prisma as Db;

/* =============================
 * Auth helpers (robustos)
 * ============================= */
const JWT_SECRET = process.env.JWT_SECRET || "";
const isProd = process.env.NODE_ENV === "production";

type TokenPayload = JWTPayload & {
  id_agency?: number;
  agencyId?: number;
  aid?: number;
  role?: string;
};

function getBearerToken(req: NextApiRequest): string | null {
  const a = req.headers.authorization || "";
  return a.startsWith("Bearer ") ? a.slice(7) : null;
}
function getCookieToken(req: NextApiRequest): string | null {
  const c = req.cookies as Record<string, string | undefined>;
  // tu cookie principal primero
  if (c?.token) return c.token;
  // fallback por si quedó algo viejo con otro nombre
  for (const k of [
    "session",
    "auth_token",
    "access_token",
    "next-auth.session-token",
  ]) {
    if (c?.[k]) return c[k] as string;
  }
  return null;
}

/**
 * Verifica candidatos en orden:
 * 1) Authorization Bearer
 * 2) Cookie(s)
 * Si uno falla, prueba el siguiente (evita 401 por cookie vieja).
 */
export async function getAuth(req: NextApiRequest) {
  if (!JWT_SECRET) return null;
  const candidates = [getBearerToken(req), getCookieToken(req)].filter(
    Boolean,
  ) as string[];

  for (const tok of candidates) {
    try {
      const { payload } = await jwtVerify(
        tok,
        new TextEncoder().encode(JWT_SECRET),
      );
      const p = payload as TokenPayload;
      const id_agency = Number(p.id_agency ?? p.agencyId ?? p.aid) || undefined;
      const role = String(p.role ?? "").toLowerCase();
      if (id_agency) return { id_agency, role };
      // si no hay agency, seguí probando siguiente candidato
    } catch {
      // token inválido → probamos el siguiente candidato
      continue;
    }
  }
  return null;
}

export function canWrite(role: string) {
  return ["gerente", "administrativo", "desarrollador"].includes(
    (role || "").toLowerCase(),
  );
}

export function sendError(
  res: import("next").NextApiResponse,
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

/* =============================
 * Utils
 * ============================= */
function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita diacríticos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Type-guard para detectar errores Prisma por código
function hasPrismaCode(
  e: unknown,
  code: string,
): e is { code: string } & Record<string, unknown> {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    typeof (e as { code?: unknown }).code === "string" &&
    (e as { code: string }).code === code
  );
}

/* =============================
 * Types DTO
 * ============================= */
type ServiceTypeDTO = Pick<
  ServiceTypeRow,
  "id_service_type" | "code" | "name" | "enabled" | "created_at" | "updated_at"
>;

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
    const id = Number(idParam);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "ID inválido" });
    }

    // Verificamos pertenencia a la agencia
    const current = await db.serviceType.findUnique({
      where: { id_service_type: id },
      select: {
        id_service_type: true,
        id_agency: true,
        code: true,
        name: true,
        enabled: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!current || current.id_agency !== auth.id_agency) {
      return res.status(404).json({ error: "No encontrado" });
    }

    if (req.method === "GET") {
      const dto: ServiceTypeDTO = {
        id_service_type: current.id_service_type,
        code: current.code,
        name: current.name,
        enabled: current.enabled,
        created_at: current.created_at,
        updated_at: current.updated_at,
      };
      return res.status(200).json(dto);
    }

    if (req.method === "PUT") {
      if (!canWrite(auth.role)) {
        return res.status(403).json({ error: "Sin permisos" });
      }

      const body = (req.body ?? {}) as {
        name?: unknown;
        code?: unknown;
        enabled?: unknown;
      };

      const patch: Partial<Pick<ServiceTypeRow, "name" | "code" | "enabled">> =
        {};

      if (typeof body.name === "string") {
        const name = body.name.trim();
        if (!name) return res.status(400).json({ error: "name vacío" });
        if (name.length > 80) {
          return res
            .status(400)
            .json({ error: "name demasiado largo (máx 80)" });
        }
        patch.name = name;
      }

      if (typeof body.code === "string") {
        const raw = body.code.trim();
        const code = slugify(raw || (patch.name ?? current.name));
        if (!code) {
          return res.status(400).json({ error: "code inválido" });
        }
        if (code.length > 60) {
          return res
            .status(400)
            .json({ error: "code demasiado largo (máx 60)" });
        }
        patch.code = code;
      }

      if (typeof body.enabled === "boolean") {
        patch.enabled = body.enabled;
      } else if (typeof body.enabled === "string") {
        if (body.enabled === "true") patch.enabled = true;
        else if (body.enabled === "false") patch.enabled = false;
        else {
          return res
            .status(400)
            .json({ error: "enabled debe ser booleano o 'true'/'false'" });
        }
      }

      if (
        typeof patch.name === "undefined" &&
        typeof patch.code === "undefined" &&
        typeof patch.enabled === "undefined"
      ) {
        return res
          .status(400)
          .json({ error: "No hay cambios para aplicar en el payload" });
      }

      try {
        const updated = await db.serviceType.update({
          where: { id_service_type: id },
          data: patch,
          select: {
            id_service_type: true,
            code: true,
            name: true,
            enabled: true,
            created_at: true,
            updated_at: true,
          },
        });

        return res.status(200).json(updated as ServiceTypeDTO);
      } catch (e: unknown) {
        if (hasPrismaCode(e, "P2002")) {
          return res
            .status(409)
            .json({ error: "Ya existe un tipo con ese code o name" });
        }
        console.error("[service-types][PUT]", e);
        return res
          .status(500)
          .json({ error: "Error actualizando ServiceType" });
      }
    }

    if (req.method === "DELETE") {
      if (!canWrite(auth.role)) {
        return res.status(403).json({ error: "Sin permisos" });
      }

      try {
        await db.serviceType.delete({ where: { id_service_type: id } });
        return res.status(204).end();
      } catch (e) {
        console.error("[service-types][DELETE]", e);
        return res.status(500).json({ error: "Error eliminando ServiceType" });
      }
    }

    res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (e) {
    console.error("[service-types/[id]] error", e);
    return res.status(500).json({ error: "Error en service-types/[id]" });
  }
}
