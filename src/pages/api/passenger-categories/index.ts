// src/pages/api/passenger-categories/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import { jwtVerify, type JWTPayload } from "jose";
import type { Prisma, PrismaClient } from "@prisma/client";

type Order = "asc" | "desc";

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

type ClientLike = PrismaClient | Prisma.TransactionClient;
type PassengerCategoryDelegateLike = {
  findMany: (args: Prisma.PassengerCategoryFindManyArgs) => Promise<PassengerCategoryRow[]>;
  create: (args: Prisma.PassengerCategoryCreateArgs) => Promise<PassengerCategoryRow>;
};

function readProp<T>(obj: Record<string, unknown>, name: string): T | null {
  const v = obj[name];
  return v && typeof v === "object" ? (v as T) : null;
}

function requirePassengerCategoryDelegate(
  client: ClientLike,
): PassengerCategoryDelegateLike {
  const bag = client as unknown as Record<string, unknown>;
  const svc =
    readProp<PassengerCategoryDelegateLike>(bag, "passengerCategory") ||
    readProp<PassengerCategoryDelegateLike>(bag, "passenger_category") ||
    readProp<PassengerCategoryDelegateLike>(bag, "PassengerCategory") ||
    readProp<PassengerCategoryDelegateLike>(bag, "passengerCategories");
  if (!svc || typeof svc.findMany !== "function") {
    throw new Error(
      'No se encontró el delegate Prisma "passengerCategory". Verificá el modelo y corré `npx prisma generate`.',
    );
  }
  return svc;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    const auth = await getAuth(req);
    if (!auth) return res.status(401).json({ error: "No autenticado" });

    const passengerCategory = requirePassengerCategoryDelegate(prisma);

    if (req.method === "GET") {
      try {
        const { q, enabled } = req.query;
        const where: Prisma.PassengerCategoryWhereInput = {
          id_agency: auth.id_agency,
        };
        if (typeof q === "string" && q.trim()) {
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
        const items = await passengerCategory.findMany({
          where,
          orderBy: [
            { sort_order: "asc" as Order },
            { name: "asc" as Order },
          ],
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
        return res.status(200).json(items as PassengerCategoryDTO[]);
      } catch (e) {
        return sendError(
          res,
          "passenger-categories/GET",
          e,
          500,
          "Error en listado",
        );
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
          min_age?: unknown;
          max_age?: unknown;
          ignore_age?: unknown;
          enabled?: unknown;
          sort_order?: unknown;
        };

        const rawName = typeof body.name === "string" ? body.name.trim() : "";
        let rawCode =
          typeof body.code === "string" ? body.code.trim() : slugify(rawName);
        const min_age = parseOptionalInt(body.min_age);
        const max_age = parseOptionalInt(body.max_age);
        const ignore_age = parseBool(body.ignore_age);
        const enabled = parseBool(body.enabled);
        const sort_order = parseOptionalInt(body.sort_order);

        if (!rawName) return res.status(400).json({ error: "name es requerido" });
        if (!rawCode) rawCode = slugify(rawName);
        if (rawName.length > 80) {
          return res.status(400).json({ error: "name demasiado largo (máx 80)" });
        }
        if (rawCode.length > 60) {
          return res.status(400).json({ error: "code demasiado largo (máx 60)" });
        }
        if (
          min_age != null &&
          max_age != null &&
          Number.isFinite(min_age) &&
          Number.isFinite(max_age) &&
          min_age > max_age
        ) {
          return res.status(400).json({ error: "min_age no puede ser mayor a max_age" });
        }

        const created = await prisma.$transaction(async (tx) => {
          const agencyCategoryId = await getNextAgencyCounter(
            tx,
            auth.id_agency,
            "passenger_category",
          );
          const delegate = requirePassengerCategoryDelegate(tx);
          return delegate.create({
            data: {
              id_agency: auth.id_agency,
              agency_passenger_category_id: agencyCategoryId,
              name: rawName,
              code: slugify(rawCode),
              min_age: min_age ?? null,
              max_age: max_age ?? null,
              ignore_age: Boolean(ignore_age),
              enabled: enabled == null ? true : enabled,
              sort_order: sort_order ?? 0,
            },
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
        });

        return res.status(201).json(created as PassengerCategoryDTO);
      } catch (e) {
        const maybeKnown = e as { code?: string };
        if (maybeKnown?.code === "P2002") {
          return res
            .status(409)
            .json({ error: "Ya existe una categoría con ese code o name" });
        }
        return sendError(
          res,
          "passenger-categories/POST",
          e,
          500,
          "Error creando categoría",
        );
      }
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (e) {
    return sendError(res, "passenger-categories", e);
  }
}
