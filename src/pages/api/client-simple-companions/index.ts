// src/pages/api/client-simple-companions/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";

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

async function getAuth(req: NextApiRequest) {
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

function parseIntId(input: unknown): number | null {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function parseOptionalInt(input: unknown): number | null {
  if (input == null || input === "") return null;
  const n = Number(input);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    const auth = await getAuth(req);
    if (!auth) return res.status(401).json({ error: "No autenticado" });

    if (req.method === "GET") {
      const clientId = parseIntId(req.query.client_id);
      if (!clientId) {
        return res.status(400).json({ error: "client_id requerido" });
      }
      try {
        const items = await prisma.clientSimpleCompanion.findMany({
          where: {
            client_id: clientId,
            client: { id_agency: auth.id_agency },
          },
          include: { category: true },
          orderBy: { id_template: "asc" },
        });
        return res.status(200).json(items);
      } catch (e) {
        return sendError(
          res,
          "client-simple-companions/GET",
          e,
          500,
          "Error en listado",
        );
      }
    }

    if (req.method === "POST") {
      const body = (req.body ?? {}) as {
        client_id?: unknown;
        category_id?: unknown;
        age?: unknown;
        notes?: unknown;
      };
      const client_id = parseIntId(body.client_id);
      if (!client_id) {
        return res.status(400).json({ error: "client_id requerido" });
      }
      const category_id = parseOptionalInt(body.category_id);
      const age = parseOptionalInt(body.age);
      const notes =
        typeof body.notes === "string" && body.notes.trim()
          ? body.notes.trim()
          : null;

      if (category_id == null && age == null && !notes) {
        return res.status(400).json({
          error: "Debés completar edad, categoría o notas.",
        });
      }

      try {
        const client = await prisma.client.findFirst({
          where: { id_client: client_id, id_agency: auth.id_agency },
          select: { id_client: true },
        });
        if (!client) {
          return res.status(400).json({ error: "Cliente inválido" });
        }

        if (category_id != null) {
          const cat = await prisma.passengerCategory.findFirst({
            where: { id_category: category_id, id_agency: auth.id_agency },
            select: { id_category: true },
          });
          if (!cat) {
            return res.status(400).json({
              error: "Categoría inválida para tu agencia",
            });
          }
        }

        const created = await prisma.clientSimpleCompanion.create({
          data: {
            client_id,
            category_id: category_id ?? null,
            age: age ?? null,
            notes,
          },
          include: { category: true },
        });
        return res.status(201).json(created);
      } catch (e) {
        return sendError(
          res,
          "client-simple-companions/POST",
          e,
          500,
          "Error creando acompañante",
        );
      }
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (e) {
    return sendError(res, "client-simple-companions", e);
  }
}
