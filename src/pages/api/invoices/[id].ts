// src/pages/api/invoices/[id].ts

import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { decodePublicId, encodePublicId } from "@/lib/publicIds";
import { jwtVerify, type JWTPayload } from "jose";

/* ================= JWT SECRET (igual que invoices/index) ================= */
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

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
    const v = c[k];
    if (typeof v === "string" && v) return v;
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
    const role = p.role;
    const email = p.email;

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

const patchSchema = z.object({
  description21: z.string().optional(),
  description10_5: z.string().optional(),
  descriptionNonComputable: z.string().optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const rawId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!rawId) {
    return res.status(400).json({ success: false, message: "ID inválido" });
  }
  const rawIdStr = String(rawId);
  const parsedId = Number(rawIdStr);
  const decoded =
    Number.isFinite(parsedId) && parsedId > 0
      ? null
      : decodePublicId(rawIdStr);
  if (decoded && decoded.t !== "invoice") {
    return res.status(400).json({ success: false, message: "ID inválido" });
  }
  if (!decoded && (!Number.isFinite(parsedId) || parsedId <= 0)) {
    return res.status(400).json({ success: false, message: "ID inválido" });
  }

  if (req.method === "GET") {
    const invoice = await prisma.invoice.findFirst({
      where: decoded
        ? { id_agency: decoded.a, agency_invoice_id: decoded.i }
        : { id_invoice: parsedId },
      include: {
        booking: {
          include: { titular: true, agency: true },
        },
      },
    });

    if (!invoice) {
      return res
        .status(404)
        .json({ success: false, message: "Factura no encontrada" });
    }

    const public_id =
      invoice.agency_invoice_id != null
        ? encodePublicId({
            t: "invoice",
            a: invoice.id_agency,
            i: invoice.agency_invoice_id,
          })
        : null;
    return res.status(200).json({
      success: true,
      invoice: { ...invoice, public_id },
    });
  }

  if (req.method === "PATCH") {
    const auth = await getUserFromAuth(req);
    if (!auth?.id_user || !auth.id_agency) {
      return res
        .status(401)
        .json({ success: false, message: "No autenticado" });
    }

    let rawBody: unknown = req.body;
    if (typeof rawBody === "string") {
      try {
        rawBody = JSON.parse(rawBody);
      } catch {
        return res.status(400).json({
          success: false,
          message: "Body inválido (JSON esperado)",
        });
      }
    }

    const parsed = patchSchema.safeParse(rawBody ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.errors.map((e) => e.message).join(", "),
      });
    }

    const { description21, description10_5, descriptionNonComputable } =
      parsed.data;
    if (
      description21 === undefined &&
      description10_5 === undefined &&
      descriptionNonComputable === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "Debe enviar al menos una descripción",
      });
    }

    if (decoded && decoded.a !== auth.id_agency) {
      return res.status(404).json({
        success: false,
        message: "Factura no encontrada",
      });
    }

    const invoice = await prisma.invoice.findFirst({
      where: decoded
        ? { id_agency: auth.id_agency, agency_invoice_id: decoded.i }
        : { id_invoice: parsedId },
      select: {
        id_invoice: true,
        id_agency: true,
        payloadAfip: true,
        booking: { select: { id_agency: true } },
      },
    });

    if (!invoice) {
      return res
        .status(404)
        .json({ success: false, message: "Factura no encontrada" });
    }

    if (invoice.booking?.id_agency !== auth.id_agency) {
      return res.status(403).json({
        success: false,
        message: "Factura no pertenece a tu agencia.",
      });
    }

    if (!isRecord(invoice.payloadAfip)) {
      return res.status(400).json({
        success: false,
        message: "La factura no tiene datos AFIP editables.",
      });
    }

    const normalize = (value?: string) => {
      if (value === undefined) return undefined;
      const trimmed = value.trim();
      return trimmed ? [trimmed] : [];
    };

    const next21 = normalize(description21);
    const next10 = normalize(description10_5);
    const nextNon = normalize(descriptionNonComputable);

    const nextPayload: Prisma.InputJsonObject = {
      ...(invoice.payloadAfip as Prisma.InputJsonObject),
      ...(next21 !== undefined ? { description21: next21 } : {}),
      ...(next10 !== undefined ? { description10_5: next10 } : {}),
      ...(nextNon !== undefined ? { descriptionNonComputable: nextNon } : {}),
    };

    const updated = await prisma.invoice.update({
      where: { id_invoice: invoice.id_invoice },
      data: { payloadAfip: nextPayload },
      select: { id_invoice: true, payloadAfip: true },
    });

    return res.status(200).json({
      success: true,
      invoice: updated,
    });
  }

  res.setHeader("Allow", ["GET", "PATCH"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
