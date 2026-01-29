// src/pages/api/service-type-presets/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";
import type { Prisma } from "@prisma/client";

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

type PresetRow = {
  id_preset: number;
  id_agency: number;
};

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

    const current = (await prisma.serviceTypePreset.findUnique({
      where: { id_preset: id },
      select: { id_preset: true, id_agency: true },
    })) as PresetRow | null;

    if (!current || current.id_agency !== auth.id_agency) {
      return res.status(404).json({ error: "No encontrado" });
    }

    if (req.method === "GET") {
      const preset = await prisma.serviceTypePreset.findUnique({
        where: { id_preset: id },
        include: { items: { include: { category: true } } },
      });
      return res.status(200).json(preset);
    }

    if (req.method === "PUT") {
      if (!canWrite(auth.role)) {
        return res.status(403).json({ error: "Sin permisos" });
      }
      const body = (req.body ?? {}) as {
        name?: unknown;
        currency?: unknown;
        enabled?: unknown;
        sort_order?: unknown;
        operator_id?: unknown;
        items?: unknown;
      };

      const patch: Prisma.ServiceTypePresetUpdateInput = {};
      if (typeof body.name === "string") {
        const name = body.name.trim();
        if (!name) return res.status(400).json({ error: "name vacío" });
        patch.name = name;
      }
      if (typeof body.currency === "string") {
        const currency = body.currency.trim().toUpperCase();
        if (!currency) return res.status(400).json({ error: "currency inválida" });
        patch.currency = currency;
      }
      if (body.enabled !== undefined) {
        const val = parseBool(body.enabled);
        if (val == null) return res.status(400).json({ error: "enabled inválido" });
        patch.enabled = val;
      }
      if (body.sort_order !== undefined) {
        patch.sort_order = parseOptionalInt(body.sort_order) ?? 0;
      }
      if (body.operator_id !== undefined) {
        const parsed = parseOptionalInt(body.operator_id);
        const nextOperatorId = parsed && parsed > 0 ? parsed : null;
        if (nextOperatorId != null) {
          const op = await prisma.operator.findFirst({
            where: { id_operator: nextOperatorId, id_agency: auth.id_agency },
            select: { id_operator: true },
          });
          if (!op) {
            return res
              .status(400)
              .json({ error: "Operador inválido para tu agencia" });
          }
        }
        patch.operator =
          nextOperatorId != null
            ? { connect: { id_operator: nextOperatorId } }
            : { disconnect: true };
      }

      const items = Array.isArray(body.items) ? body.items : null;
      let normalizedItems: Array<{
        category_id: number;
        sale_price: number;
        cost_price: number;
        sale_markup_pct?: number | null;
      }> | null = null;
      if (items) {
        normalizedItems = items
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
          return res.status(400).json({ error: "items inválidos" });
        }
      }

      if (normalizedItems) {
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
      }

      try {
        const updated = await prisma.$transaction(async (tx) => {
          const preset = await tx.serviceTypePreset.update({
            where: { id_preset: id },
            data: patch,
          });
          if (normalizedItems) {
            await tx.serviceTypePresetItem.deleteMany({
              where: { preset_id: id },
            });
            await tx.serviceTypePresetItem.createMany({
              data: normalizedItems.map((it) => ({
                preset_id: id,
                category_id: it.category_id,
                sale_price: it.sale_price,
                cost_price: it.cost_price,
                sale_markup_pct:
                  typeof it.sale_markup_pct === "number"
                    ? it.sale_markup_pct
                    : null,
              })),
            });
          }
          return preset;
        });
        const full = await prisma.serviceTypePreset.findUnique({
          where: { id_preset: updated.id_preset },
          include: { items: { include: { category: true } } },
        });
        return res.status(200).json(full);
      } catch (e) {
        return sendError(
          res,
          "service-type-presets/PUT",
          e,
          500,
          "Error actualizando preset",
        );
      }
    }

    if (req.method === "DELETE") {
      if (!canWrite(auth.role)) {
        return res.status(403).json({ error: "Sin permisos" });
      }
      try {
        await prisma.serviceTypePreset.delete({ where: { id_preset: id } });
        return res.status(200).json({ ok: true });
      } catch (e) {
        return sendError(
          res,
          "service-type-presets/DELETE",
          e,
          500,
          "Error eliminando preset",
        );
      }
    }

    res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (e) {
    return sendError(res, "service-type-presets", e);
  }
}
