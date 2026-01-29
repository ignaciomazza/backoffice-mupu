// src/pages/api/passenger-categories/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";
import type { Prisma } from "@prisma/client";

type PassengerCategoryRow = {
  id_category: number;
  id_agency: number;
  code: string;
  name: string;
  min_age: number | null;
  max_age: number | null;
  ignore_age: boolean;
  enabled: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
};

type PassengerCategoryDelegateLite = {
  findUnique(args: Prisma.PassengerCategoryFindUniqueArgs): Promise<PassengerCategoryRow | null>;
  update(args: Prisma.PassengerCategoryUpdateArgs): Promise<PassengerCategoryRow>;
  delete(args: Prisma.PassengerCategoryDeleteArgs): Promise<PassengerCategoryRow>;
};

type Db = typeof prisma & { passengerCategory: PassengerCategoryDelegateLite };
const db = prisma as Db;

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
  if (c?.token) return c.token;
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
    } catch {
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

function parseOptionalInt(input: unknown): number | null {
  if (input == null || input === "") return null;
  const n =
    typeof input === "number"
      ? input
      : Number(String(input).replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const int = Math.floor(n);
  return int >= 0 ? int : null;
}

function parseBool(input: unknown): boolean | null {
  if (typeof input === "boolean") return input;
  if (typeof input === "number") return input === 1 ? true : input === 0 ? false : null;
  if (typeof input === "string") {
    const s = input.trim().toLowerCase();
    if (["1", "true", "t", "yes", "y"].includes(s)) return true;
    if (["0", "false", "f", "no", "n"].includes(s)) return false;
  }
  return null;
}

type PassengerCategoryDTO = Pick<
  PassengerCategoryRow,
  | "id_category"
  | "code"
  | "name"
  | "min_age"
  | "max_age"
  | "ignore_age"
  | "enabled"
  | "sort_order"
  | "created_at"
  | "updated_at"
>;

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

    const current = await db.passengerCategory.findUnique({
      where: { id_category: id },
      select: {
        id_category: true,
        id_agency: true,
        code: true,
        name: true,
        min_age: true,
        max_age: true,
        ignore_age: true,
        enabled: true,
        sort_order: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!current || current.id_agency !== auth.id_agency) {
      return res.status(404).json({ error: "No encontrado" });
    }

    if (req.method === "GET") {
      const dto: PassengerCategoryDTO = {
        id_category: current.id_category,
        code: current.code,
        name: current.name,
        min_age: current.min_age,
        max_age: current.max_age,
        ignore_age: current.ignore_age,
        enabled: current.enabled,
        sort_order: current.sort_order,
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
        min_age?: unknown;
        max_age?: unknown;
        ignore_age?: unknown;
        enabled?: unknown;
        sort_order?: unknown;
      };

      const patch: Prisma.PassengerCategoryUpdateInput = {};

      if (typeof body.name === "string") {
        const name = body.name.trim();
        if (!name) return res.status(400).json({ error: "name vacío" });
        if (name.length > 80) {
          return res.status(400).json({ error: "name demasiado largo (máx 80)" });
        }
        patch.name = name;
      }

      if (typeof body.code === "string") {
        const raw = body.code.trim();
        const code = slugify(raw || String(patch.name ?? current.name));
        if (!code) return res.status(400).json({ error: "code inválido" });
        if (code.length > 60) {
          return res.status(400).json({ error: "code demasiado largo (máx 60)" });
        }
        patch.code = code;
      }

      const nextMin =
        body.min_age !== undefined ? parseOptionalInt(body.min_age) : current.min_age;
      const nextMax =
        body.max_age !== undefined ? parseOptionalInt(body.max_age) : current.max_age;

      if (body.min_age !== undefined) {
        patch.min_age = nextMin;
      }
      if (body.max_age !== undefined) {
        patch.max_age = nextMax;
      }
      if (body.ignore_age !== undefined) {
        const val = parseBool(body.ignore_age);
        if (val == null) {
          return res.status(400).json({ error: "ignore_age inválido" });
        }
        patch.ignore_age = val;
      }
      if (body.enabled !== undefined) {
        const val = parseBool(body.enabled);
        if (val == null) {
          return res.status(400).json({ error: "enabled inválido" });
        }
        patch.enabled = val;
      }
      if (body.sort_order !== undefined) {
        patch.sort_order = parseOptionalInt(body.sort_order) ?? 0;
      }

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: "Sin cambios" });
      }

      if (nextMin != null && nextMax != null && nextMin > nextMax) {
        return res.status(400).json({ error: "min_age no puede ser mayor a max_age" });
      }

      try {
        const updated = await db.passengerCategory.update({
          where: { id_category: id },
          data: patch,
          select: {
            id_category: true,
            code: true,
            name: true,
            min_age: true,
            max_age: true,
            ignore_age: true,
            enabled: true,
            sort_order: true,
            created_at: true,
            updated_at: true,
          },
        });
        return res.status(200).json(updated as PassengerCategoryDTO);
      } catch (e) {
        const maybeKnown = e as { code?: string };
        if (maybeKnown?.code === "P2002") {
          return res
            .status(409)
            .json({ error: "Ya existe una categoría con ese code o name" });
        }
        return sendError(
          res,
          "passenger-categories/PUT",
          e,
          500,
          "Error actualizando categoría",
        );
      }
    }

    if (req.method === "DELETE") {
      if (!canWrite(auth.role)) {
        return res.status(403).json({ error: "Sin permisos" });
      }
      try {
        await db.passengerCategory.delete({ where: { id_category: id } });
        return res.status(200).json({ ok: true });
      } catch (e) {
        return sendError(
          res,
          "passenger-categories/DELETE",
          e,
          500,
          "Error eliminando categoría",
        );
      }
    }

    res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (e) {
    return sendError(res, "passenger-categories", e);
  }
}
