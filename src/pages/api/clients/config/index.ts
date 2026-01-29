// src/pages/api/clients/config/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { jwtVerify, type JWTPayload } from "jose";
import prisma, { Prisma } from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import { z } from "zod";
import {
  normalizeCustomFields,
  normalizeHiddenFields,
  normalizeRequiredFields,
} from "@/utils/clientConfig";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

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

type AuthContext = {
  id_agency: number;
  role: string;
};

const customFieldSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_]+$/),
  label: z.string().trim().min(1).max(80),
  type: z.enum(["text", "date", "number"]),
  required: z.boolean().optional(),
  placeholder: z.string().trim().max(120).optional(),
  help: z.string().trim().max(200).optional(),
  builtin: z.boolean().optional(),
});

const putSchema = z.object({
  visibility_mode: z.enum(["all", "team", "own"]),
  required_fields: z.array(z.string()).optional(),
  custom_fields: z.array(customFieldSchema).optional(),
  hidden_fields: z.array(z.string()).optional(),
  use_simple_companions: z.boolean().optional(),
});

function getTokenFromRequest(req: NextApiRequest): string | null {
  if (req.cookies?.token) return req.cookies.token;
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  for (const k of [
    "session",
    "auth_token",
    "access_token",
    "next-auth.session-token",
  ]) {
    const v = (req.cookies || {})[k];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

async function resolveAuth(req: NextApiRequest): Promise<AuthContext | null> {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET),
    );
    const p = payload as TokenPayload;
    const id_agency = Number(p.id_agency ?? p.agencyId ?? p.aid) || 0;
    const role = String(p.role || "").toLowerCase();
    if (id_agency) return { id_agency, role };

    const id_user = Number(p.id_user ?? p.userId ?? p.uid) || 0;
    const email = p.email || "";
    if (id_user || email) {
      const u = await prisma.user.findFirst({
        where: id_user ? { id_user } : { email },
        select: { id_agency: true, role: true },
      });
      if (u?.id_agency) {
        return {
          id_agency: u.id_agency,
          role: (role || u.role || "").toLowerCase(),
        };
      }
    }
  } catch {
    return null;
  }
  return null;
}

function canWrite(role: string) {
  return ["gerente", "administrativo", "desarrollador"].includes(
    (role || "").toLowerCase(),
  );
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  const reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const auth = await resolveAuth(req);
  if (!auth?.id_agency) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") {
    try {
      const config = await prisma.clientConfig.findFirst({
        where: { id_agency: auth.id_agency },
      });
      return res.status(200).json(config ?? null);
    } catch (e) {
      console.error("[clients/config][GET]", reqId, e);
      return res.status(500).json({ error: "Error obteniendo configuración" });
    }
  }

  if (req.method === "PUT") {
    if (!canWrite(auth.role)) {
      return res.status(403).json({ error: "Sin permisos" });
    }
    try {
      const body =
        typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const parsed = putSchema.safeParse(body);
      if (!parsed.success)
        return res.status(400).json({ error: parsed.error.message });

      const {
        visibility_mode,
        required_fields,
        custom_fields,
        hidden_fields,
        use_simple_companions,
      } = parsed.data;

      await prisma.$transaction(async (tx) => {
        const existing = await tx.clientConfig.findUnique({
          where: { id_agency: auth.id_agency },
          select: {
            id_config: true,
            required_fields: true,
            hidden_fields: true,
            custom_fields: true,
          },
        });

        const nextRequired =
          required_fields !== undefined
            ? normalizeRequiredFields(required_fields)
            : existing?.required_fields ?? null;

        const nextHidden =
          hidden_fields !== undefined
            ? normalizeHiddenFields(hidden_fields)
            : existing?.hidden_fields ?? null;

        const filteredRequired =
          nextRequired == null
            ? null
            : (nextHidden && Array.isArray(nextHidden)
                ? (nextRequired as string[]).filter(
                    (field) => !(nextHidden as string[]).includes(field),
                  )
                : (nextRequired as string[]));

        const nextCustom =
          custom_fields !== undefined
            ? normalizeCustomFields(custom_fields)
            : existing?.custom_fields ?? null;

        const requiredValue =
          filteredRequired === null
            ? Prisma.DbNull
            : (filteredRequired as Prisma.InputJsonValue);
        const hiddenValue =
          nextHidden === null
            ? Prisma.DbNull
            : (nextHidden as Prisma.InputJsonValue);
        const customValue =
          nextCustom === null
            ? Prisma.DbNull
            : (nextCustom as Prisma.InputJsonValue);

        if (existing) {
          await tx.clientConfig.update({
            where: { id_agency: auth.id_agency },
            data: {
              visibility_mode,
              required_fields: requiredValue,
              hidden_fields: hiddenValue,
              custom_fields: customValue,
              ...(typeof use_simple_companions === "boolean"
                ? { use_simple_companions }
                : {}),
            },
          });
          return;
        }
        const agencyConfigId = await getNextAgencyCounter(
          tx,
          auth.id_agency,
          "client_config",
        );
        await tx.clientConfig.create({
          data: {
            id_agency: auth.id_agency,
            agency_client_config_id: agencyConfigId,
            visibility_mode,
            required_fields: requiredValue,
            hidden_fields: hiddenValue,
            custom_fields: customValue,
            use_simple_companions: Boolean(use_simple_companions),
          },
        });
      });

      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error("[clients/config][PUT]", reqId, e);
      return res.status(500).json({ error: "Error guardando configuración" });
    }
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}
