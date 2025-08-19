// src/pages/api/receipts/[id].ts
import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify, JWTPayload } from "jose";

// ============ Tipos ============
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
  role?: string;
  id_agency?: number;
  email?: string;
};

// ============ JWT ============
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

// ============ Helper de seguridad ============
async function ensureReceiptInAgency(receiptId: number, agencyId: number) {
  const r = await prisma.receipt.findUnique({
    where: { id_receipt: receiptId },
    select: { id_receipt: true, booking: { select: { id_agency: true } } },
  });
  if (!r) throw new Error("Recibo no encontrado");
  if (r.booking.id_agency !== agencyId)
    throw new Error("No autorizado para este recibo");
}

// ============ Handler ============
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const rawId = req.query.id;
  if (!rawId || Array.isArray(rawId) || isNaN(Number(rawId))) {
    return res.status(400).json({ error: "ID inválido" });
  }
  const id = Number(rawId);

  // auth básica (mismo criterio que en receipts/index.ts)
  const authUser = await getUserFromAuth(req);
  const authUserId = authUser?.id_user;
  const authAgencyId = authUser?.id_agency;
  if (!authUserId || !authAgencyId) {
    return res.status(401).json({ error: "No autenticado" });
  }

  if (req.method === "GET") {
    try {
      // seguridad: debe pertenecer a mi agencia (via booking)
      await ensureReceiptInAgency(id, authAgencyId);

      const receipt = await prisma.receipt.findUnique({
        where: { id_receipt: id },
      });

      if (!receipt) {
        return res.status(404).json({ error: "Recibo no encontrado" });
      }
      return res.status(200).json({ receipt });
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : "Error al obtener el recibo";
      const status = msg.includes("No autorizado")
        ? 403
        : msg.includes("no encontrado")
          ? 404
          : 500;
      return res.status(status).json({ error: msg });
    }
  }

  if (req.method === "DELETE") {
    try {
      // seguridad: debe pertenecer a mi agencia
      await ensureReceiptInAgency(id, authAgencyId);

      await prisma.receipt.delete({ where: { id_receipt: id } });
      return res.status(204).end();
    } catch (error: unknown) {
      const msg =
        error instanceof Error
          ? error.message
          : "No se pudo eliminar el recibo";
      const status = msg.includes("No autorizado")
        ? 403
        : msg.includes("no encontrado")
          ? 404
          : 500;
      return res.status(status).json({ error: msg });
    }
  }

  res.setHeader("Allow", ["GET", "DELETE"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
