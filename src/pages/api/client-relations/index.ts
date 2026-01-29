// src/pages/api/client-relations/index.ts
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

function parseIntId(input: unknown): number | null {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return null;
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
        const relations = await prisma.clientRelation.findMany({
          where: { id_agency: auth.id_agency, client_id: clientId },
          include: {
            related_client: {
              select: {
                id_client: true,
                first_name: true,
                last_name: true,
                agency_client_id: true,
                dni_number: true,
                passport_number: true,
                email: true,
              },
            },
          },
          orderBy: { id_relation: "asc" },
        });
        return res.status(200).json(relations);
      } catch (e) {
        return sendError(
          res,
          "client-relations/GET",
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
      const body = (req.body ?? {}) as {
        client_id?: unknown;
        related_client_id?: unknown;
        relation_type?: unknown;
      };
      const client_id = parseIntId(body.client_id);
      const related_client_id = parseIntId(body.related_client_id);
      const relation_type =
        typeof body.relation_type === "string"
          ? body.relation_type.trim()
          : null;

      if (!client_id || !related_client_id || client_id === related_client_id) {
        return res.status(400).json({ error: "IDs inválidos" });
      }

      try {
        const clients = await prisma.client.findMany({
          where: {
            id_client: { in: [client_id, related_client_id] },
            id_agency: auth.id_agency,
          },
          select: { id_client: true },
        });
        if (clients.length !== 2) {
          return res.status(400).json({ error: "Clientes inválidos para tu agencia" });
        }

        await prisma.clientRelation.createMany({
          data: [
            {
              id_agency: auth.id_agency,
              client_id,
              related_client_id,
              relation_type: relation_type || null,
            },
            {
              id_agency: auth.id_agency,
              client_id: related_client_id,
              related_client_id: client_id,
              relation_type: relation_type || null,
            },
          ],
          skipDuplicates: true,
        });

        return res.status(201).json({ ok: true });
      } catch (e) {
        return sendError(
          res,
          "client-relations/POST",
          e,
          500,
          "Error creando relación",
        );
      }
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (e) {
    return sendError(res, "client-relations", e);
  }
}
