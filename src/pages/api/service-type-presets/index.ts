// src/pages/api/service-type-presets/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import { jwtVerify, type JWTPayload } from "jose";
import type { Prisma, PrismaClient } from "@prisma/client";

type Order = "asc" | "desc";

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

function parseNumber(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (typeof input === "string") {
    const raw = input.replace(",", ".").trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

type ClientLike = PrismaClient | Prisma.TransactionClient;
type PresetDelegateLike = {
  findMany: (args: Prisma.ServiceTypePresetFindManyArgs) => Promise<unknown[]>;
  create: (args: Prisma.ServiceTypePresetCreateArgs) => Promise<unknown>;
};

function readProp<T>(obj: Record<string, unknown>, name: string): T | null {
  const v = obj[name];
  return v && typeof v === "object" ? (v as T) : null;
}

function requirePresetDelegate(client: ClientLike): PresetDelegateLike {
  const bag = client as unknown as Record<string, unknown>;
  const svc =
    readProp<PresetDelegateLike>(bag, "serviceTypePreset") ||
    readProp<PresetDelegateLike>(bag, "service_type_preset") ||
    readProp<PresetDelegateLike>(bag, "ServiceTypePreset") ||
    readProp<PresetDelegateLike>(bag, "serviceTypePresets");
  if (!svc || typeof svc.findMany !== "function") {
    throw new Error(
      'No se encontró el delegate Prisma "serviceTypePreset". Verificá el modelo y corré `npx prisma generate`.',
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

    const presetDelegate = requirePresetDelegate(prisma);

    if (req.method === "GET") {
      try {
        const serviceTypeId = parseOptionalInt(req.query.service_type_id);
        const operatorId = parseOptionalInt(req.query.operator_id);
        const enabled = parseBool(req.query.enabled);

        const where: Prisma.ServiceTypePresetWhereInput = {
          id_agency: auth.id_agency,
        };
        if (serviceTypeId) where.service_type_id = serviceTypeId;
        if (operatorId != null) where.operator_id = operatorId;
        if (enabled != null) where.enabled = enabled;

        const items = await presetDelegate.findMany({
          where,
          orderBy: [
            { sort_order: "asc" as Order },
            { name: "asc" as Order },
          ],
          include: {
            items: {
              include: { category: true },
              orderBy: { id_item: "asc" as Order },
            },
          },
        });
        return res.status(200).json(items);
      } catch (e) {
        return sendError(
          res,
          "service-type-presets/GET",
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
          service_type_id?: unknown;
          operator_id?: unknown;
          name?: unknown;
          currency?: unknown;
          enabled?: unknown;
          sort_order?: unknown;
          items?: unknown;
        };

        const service_type_id = parseOptionalInt(body.service_type_id);
        const operator_id_raw = parseOptionalInt(body.operator_id);
        const operator_id =
          operator_id_raw && operator_id_raw > 0 ? operator_id_raw : null;
        const name = typeof body.name === "string" ? body.name.trim() : "";
        const currency =
          typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "";
        const enabled = parseBool(body.enabled);
        const sort_order = parseOptionalInt(body.sort_order);
        const items = Array.isArray(body.items) ? body.items : [];

        if (!service_type_id) {
          return res.status(400).json({ error: "service_type_id requerido" });
        }
        if (!name) return res.status(400).json({ error: "name requerido" });
        if (!currency) return res.status(400).json({ error: "currency requerida" });

        const normalizedItems = items
          .map((it) => {
            if (!it || typeof it !== "object") return null;
            const rec = it as Record<string, unknown>;
            const category_id = parseOptionalInt(rec.category_id);
            const cost_price = parseNumber(rec.cost_price);
            const sale_markup_pct = parseNumber(rec.sale_markup_pct);
            let sale_price = parseNumber(rec.sale_price);
            if (
              sale_price == null &&
              cost_price != null &&
              sale_markup_pct != null
            ) {
              sale_price = cost_price * (1 + sale_markup_pct / 100);
            }
            if (!category_id || sale_price == null || cost_price == null) return null;
            return { category_id, sale_price, cost_price, sale_markup_pct };
          })
          .filter(Boolean) as Array<{
          category_id: number;
          sale_price: number;
          cost_price: number;
          sale_markup_pct?: number | null;
        }>;

        if (!normalizedItems.length) {
          return res
            .status(400)
            .json({ error: "items requeridos (por categoría)" });
        }

        const categoryIds = Array.from(
          new Set(normalizedItems.map((it) => it.category_id)),
        );
        if (categoryIds.length > 0) {
          const cats = await prisma.passengerCategory.findMany({
            where: { id_category: { in: categoryIds }, id_agency: auth.id_agency },
            select: { id_category: true },
          });
          const ok = new Set(cats.map((c) => c.id_category));
          const bad = categoryIds.filter((id) => !ok.has(id));
          if (bad.length) {
            return res.status(400).json({
              error: `Hay categorías inválidas para tu agencia: ${bad.join(", ")}`,
            });
          }
        }

        const created = await prisma.$transaction(async (tx) => {
          const typeExists = await tx.serviceType.findFirst({
            where: { id_service_type: service_type_id, id_agency: auth.id_agency },
            select: { id_service_type: true },
          });
          if (!typeExists) {
            throw new Error("Tipo inválido para tu agencia");
          }
          if (operator_id) {
            const op = await tx.operator.findFirst({
              where: { id_operator: operator_id, id_agency: auth.id_agency },
              select: { id_operator: true },
            });
            if (!op) {
              throw new Error("Operador inválido para tu agencia");
            }
          }
          const agencyPresetId = await getNextAgencyCounter(
            tx,
            auth.id_agency,
            "service_type_preset",
          );
          const delegate = requirePresetDelegate(tx);
          return delegate.create({
            data: {
              id_agency: auth.id_agency,
              agency_service_type_preset_id: agencyPresetId,
              service_type_id,
              operator_id: operator_id ?? null,
              name,
              currency,
              enabled: enabled == null ? true : enabled,
              sort_order: sort_order ?? 0,
              items: {
                create: normalizedItems.map((it) => ({
                  category_id: it.category_id,
                  sale_price: it.sale_price,
                  cost_price: it.cost_price,
                  sale_markup_pct:
                    typeof it.sale_markup_pct === "number"
                      ? it.sale_markup_pct
                      : null,
                })),
              },
            },
            include: { items: { include: { category: true } } },
          });
        });

        return res.status(201).json(created);
      } catch (e) {
        const maybeKnown = e as { code?: string };
        if (maybeKnown?.code === "P2002") {
          return res.status(409).json({ error: "Ya existe un preset similar" });
        }
        return sendError(
          res,
          "service-type-presets/POST",
          e,
          500,
          "Error creando preset",
        );
      }
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (e) {
    return sendError(res, "service-type-presets", e);
  }
}
