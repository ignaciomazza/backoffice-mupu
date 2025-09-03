// src/pages/api/template-config/[doc_type]/index.ts

import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

// ===================== Tipos internos =====================
type TokenPayload = JWTPayload & {
  id_user?: number;
  userId?: number;
  uid?: number;
  role?: string;
  id_agency?: number;
  agencyId?: number;
  aid?: number;
  email?: string;
};

type DecodedUser = {
  id_user?: number;
  id_agency?: number;
  role?: string;
  email?: string;
};

type UpsertBody = {
  // JSON arbitrario, pero sin `any`
  config?: Prisma.InputJsonObject;
  // modo merge profundo con lo existente
  mode?: "replace" | "merge";
};

// ===================== Auth helpers =====================
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

function getTokenFromRequest(req: NextApiRequest): string | null {
  if (req.cookies?.token) return req.cookies.token;

  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);

  const c = req.cookies || {};
  for (const k of [
    "session",
    "auth_token",
    "access_token",
    "next-auth.session-token",
  ]) {
    if (c[k]) return c[k]!;
  }
  return null;
}

async function getUserFromAuth(
  req: NextApiRequest,
): Promise<DecodedUser | null> {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return null;

    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET),
    );
    const p = payload as TokenPayload;

    const id_user = Number(p.id_user ?? p.userId ?? p.uid) || undefined;
    const id_agency = Number(p.id_agency ?? p.agencyId ?? p.aid) || undefined;
    const role = (p.role || "") as string | undefined;
    const email = p.email;

    // completar por email si falta id_user
    if (!id_user && email) {
      const u = await prisma.user.findUnique({
        where: { email },
        select: { id_user: true, id_agency: true, role: true, email: true },
      });
      if (u)
        return {
          id_user: u.id_user,
          id_agency: u.id_agency,
          role: u.role,
          email: u.email,
        };
    }

    // completar agency si falta
    if (id_user && !id_agency) {
      const u = await prisma.user.findUnique({
        where: { id_user },
        select: { id_agency: true, role: true, email: true },
      });
      if (u)
        return {
          id_user,
          id_agency: u.id_agency,
          role: role ?? u.role,
          email: email ?? u.email ?? undefined,
        };
    }

    return { id_user, id_agency, role, email };
  } catch {
    return null;
  }
}

// ===================== Guards/Helpers para InputJson* =====================
function isInputJsonObject(v: unknown): v is Prisma.InputJsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function asInputJsonObject(v: unknown): Prisma.InputJsonObject {
  return isInputJsonObject(v) ? v : ({} as Prisma.InputJsonObject);
}
function isInputJsonArray(v: unknown): v is Prisma.InputJsonArray {
  return Array.isArray(v);
}

// tipos auxiliares mutables para evitar TS2542
type InputJV = Prisma.InputJsonValue | null | undefined;
type MutableInputJsonObject = { [k: string]: InputJV };
function toMutable(obj: Prisma.InputJsonObject): MutableInputJsonObject {
  return { ...(obj as unknown as MutableInputJsonObject) };
}

// Deep merge para Prisma.InputJsonObject (objetos → merge profundo; arrays/primitivos → reemplazo)
function deepMergeInput(
  base: Prisma.InputJsonObject,
  patch: Prisma.InputJsonObject,
): Prisma.InputJsonObject {
  const out = toMutable(base);

  for (const key of Object.keys(patch)) {
    const pv = patch[key] as InputJV;
    const bv = base[key] as InputJV;

    if (isInputJsonObject(bv) && isInputJsonObject(pv)) {
      out[key] = deepMergeInput(bv, pv) as InputJV;
      continue;
    }

    if (isInputJsonArray(pv)) {
      out[key] = pv;
      continue;
    }

    // primitivo / null / undefined → reemplazo directo
    out[key] = pv;
  }

  return out as unknown as Prisma.InputJsonObject;
}

// ===================== Zod inline (schemas mínimos) =====================
const zColors = z
  .object({
    background: z.string().optional(),
    text: z.string().optional(),
    accent: z.string().optional(),
    overlayOpacity: z.number().min(0).max(1).optional(),
  })
  .partial();

const zFonts = z
  .object({
    heading: z.string().optional(),
    body: z.string().optional(),
  })
  .partial();

const zCoverImage = z
  .object({
    mode: z.enum(["url", "none"]).optional(),
    url: z.string().optional(),
  })
  .partial();

const zCommon = z
  .object({
    styles: z
      .object({
        colors: zColors.optional(),
        fonts: zFonts.optional(),
      })
      .partial()
      .optional(),
    coverImage: zCoverImage.optional(),
    contactItems: z
      .array(
        z.enum([
          "phones",
          "email",
          "website",
          "address",
          "instagram",
          "facebook",
          "twitter",
          "tiktok",
        ]),
      )
      .optional(),
    labels: z.record(z.string()).optional(),
    termsAndConditions: z.string().optional(),
    metodosDePago: z.record(z.string()).optional(),
  })
  .partial();

const zConfirmationCfg = zCommon;
const zQuoteCfg = zCommon;

function validateByDocType(docType: string, value: unknown) {
  const schema = docType === "confirmation" ? zConfirmationCfg : zQuoteCfg;
  return schema.parse(value ?? {});
}

// ===================== Defaults (para resolved=1) =====================
const CFG_DEFAULTS: Record<string, Prisma.InputJsonObject> = {
  confirmation: {
    styles: {
      colors: {
        background: "#000000",
        text: "#ffffff",
        accent: "#ffffff",
        overlayOpacity: 0.4,
      },
      fonts: { heading: "Poppins", body: "Poppins" },
    },
    coverImage: { mode: "url", url: "/images/avion.jpg" },
    contactItems: ["phones", "email", "website", "address", "instagram"],
    labels: {
      header: "Confirmación de servicios y contrato de viaje",
      confirmedData: "DATOS DE SERVICIOS CONFIRMADOS",
      pax: "DATOS DEL PASAJERO",
      services: "DETALLE DE SERVICIOS CONFIRMADOS",
      terms: "Cláusulas / Condiciones",
      planPago: "PLAN DE PAGO",
    },
    termsAndConditions: "Condiciones generales disponibles en la agencia.",
    metodosDePago: {
      ARS: "Efectivo o transferencia.",
      USD: "Transferencia en USD.",
    },
  },
  quote: {
    styles: {
      colors: {
        background: "#000000",
        text: "#ffffff",
        accent: "#ffffff",
        overlayOpacity: 0.4,
      },
      fonts: { heading: "Poppins", body: "Poppins" },
    },
    contactItems: ["phones", "email", "website", "address", "instagram"],
    labels: {
      title: "Propuesta de Viaje",
      prices: "Precios",
      planPago: "Formas de pago",
    },
    metodosDePago: {
      ARS: "Transferencia en ARS.",
      USD: "Transferencia en USD.",
    },
  },
};

// ===================== Handlers =====================
async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  try {
    const auth = await getUserFromAuth(req);
    if (!auth?.id_user || !auth?.id_agency) {
      return res.status(401).json({ error: "No autenticado" });
    }

    const doc_type = Array.isArray(req.query.doc_type)
      ? req.query.doc_type[0]
      : req.query.doc_type;
    const docType = (doc_type || "").trim();
    if (!docType) return res.status(400).json({ error: "doc_type requerido" });

    const row = await prisma.templateConfig.findUnique({
      where: {
        id_agency_doc_type: { id_agency: auth.id_agency, doc_type: docType },
      },
    });

    const resolvedFlag = String(req.query.resolved || "") === "1";
    const defaults = CFG_DEFAULTS[docType] ?? {};
    const stored = row?.config ?? {};

    let payloadConfig: Prisma.InputJsonObject = asInputJsonObject(stored);
    if (resolvedFlag) {
      payloadConfig = deepMergeInput(
        asInputJsonObject(defaults),
        asInputJsonObject(stored),
      );
      // Validamos el resultado (por seguridad)
      validateByDocType(docType, payloadConfig);
    }

    return res.status(200).json({
      exists: !!row,
      id_template: row?.id_template ?? null,
      id_agency: auth.id_agency,
      doc_type: docType,
      config: payloadConfig,
      created_at: row?.created_at ?? null,
      updated_at: row?.updated_at ?? null,
    });
  } catch (error) {
    console.error("[template-config][GET]", error);
    return res.status(500).json({ error: "Error obteniendo la configuración" });
  }
}

function canEdit(role?: string) {
  const r = (role || "").toLowerCase();
  return ["gerente", "administrativo", "desarrollador"].includes(r);
}

async function handleUpsert(req: NextApiRequest, res: NextApiResponse) {
  try {
    const auth = await getUserFromAuth(req);
    const roleFromCookie = (req.cookies?.role || "").toLowerCase();
    const role = (auth?.role || roleFromCookie || "").toLowerCase();

    if (!auth?.id_user || !auth?.id_agency) {
      return res.status(401).json({ error: "No autenticado" });
    }
    if (!canEdit(role)) {
      return res
        .status(403)
        .json({ error: "No autorizado para editar templates" });
    }

    const doc_type = Array.isArray(req.query.doc_type)
      ? req.query.doc_type[0]
      : req.query.doc_type;
    const docType = (doc_type || "").trim();
    if (!docType) return res.status(400).json({ error: "doc_type requerido" });

    const body = (req.body ?? {}) as UpsertBody;
    const mode = body.mode === "merge" ? "merge" : "replace";

    // Validar con Zod y normalizar a InputJsonObject
    const validated = validateByDocType(docType, body.config ?? {});
    const incoming = asInputJsonObject(validated);

    // obtenemos actual si existe
    const current = await prisma.templateConfig.findUnique({
      where: {
        id_agency_doc_type: { id_agency: auth.id_agency, doc_type: docType },
      },
      select: { config: true },
    });

    let nextConfig: Prisma.InputJsonObject;
    if (mode === "merge" && current?.config) {
      nextConfig = deepMergeInput(asInputJsonObject(current.config), incoming);
    } else {
      nextConfig = incoming;
    }

    const saved = await prisma.templateConfig.upsert({
      where: {
        id_agency_doc_type: { id_agency: auth.id_agency, doc_type: docType },
      },
      create: {
        id_agency: auth.id_agency,
        doc_type: docType,
        config: nextConfig,
      },
      update: { config: nextConfig },
    });

    return res.status(200).json({
      ok: true,
      id_template: saved.id_template,
      id_agency: saved.id_agency,
      doc_type: saved.doc_type,
      config: saved.config,
      created_at: saved.created_at,
      updated_at: saved.updated_at,
    });
  } catch (error) {
    console.error("[template-config][UPSERT]", error);
    return res.status(500).json({ error: "Error guardando la configuración" });
  }
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse) {
  try {
    const auth = await getUserFromAuth(req);
    const roleFromCookie = (req.cookies?.role || "").toLowerCase();
    const role = (auth?.role || roleFromCookie || "").toLowerCase();

    if (!auth?.id_user || !auth?.id_agency) {
      return res.status(401).json({ error: "No autenticado" });
    }
    if (!canEdit(role)) {
      return res
        .status(403)
        .json({ error: "No autorizado para borrar templates" });
    }

    const doc_type = Array.isArray(req.query.doc_type)
      ? req.query.doc_type[0]
      : req.query.doc_type;
    const docType = (doc_type || "").trim();
    if (!docType) return res.status(400).json({ error: "doc_type requerido" });

    await prisma.templateConfig.delete({
      where: {
        id_agency_doc_type: { id_agency: auth.id_agency, doc_type: docType },
      },
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[template-config][DELETE]", error);
    return res.status(500).json({ error: "Error eliminando la configuración" });
  }
}

// ===================== Router =====================
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") return handleGet(req, res);
  if (req.method === "PUT" || req.method === "POST")
    return handleUpsert(req, res);
  if (req.method === "DELETE") return handleDelete(req, res);
  res.setHeader("Allow", ["GET", "PUT", "POST", "DELETE"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
