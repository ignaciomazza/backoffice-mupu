// src/pages/api/credit/account/[id].ts
import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify } from "jose";
import type { JWTPayload } from "jose";
import { getFinanceSectionGrants } from "@/lib/accessControl";
import { canAccessFinanceSection } from "@/utils/permissions";
import { ensurePlanFeatureAccess } from "@/lib/planAccess.server";

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
type DecodedAuth = {
  id_user: number;
  id_agency: number;
  role: string;
  email?: string;
};

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
): Promise<DecodedAuth | null> {
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
    const role = String(p.role || "").toLowerCase();
    const email = p.email;

    if (id_user && !id_agency) {
      const u = await prisma.user.findUnique({
        where: { id_user },
        select: { id_agency: true, role: true, email: true },
      });
      if (u)
        return {
          id_user,
          id_agency: u.id_agency,
          role: role || u.role.toLowerCase(),
          email: email ?? u.email ?? undefined,
        };
    }
    if (!id_user || !id_agency) return null;
    return { id_user, id_agency, role, email: email ?? undefined };
  } catch {
    return null;
  }
}

function safeNumber(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const auth = await getUserFromAuth(req);
  if (!auth?.id_user || !auth.id_agency) {
    return res.status(401).json({ error: "No autenticado o token inválido." });
  }

  const planAccess = await ensurePlanFeatureAccess(
    auth.id_agency,
    "credits",
  );
  if (!planAccess.allowed) {
    return res.status(403).json({ error: "Plan insuficiente" });
  }

  const financeGrants = await getFinanceSectionGrants(
    auth.id_agency,
    auth.id_user,
  );
  const canCredits = canAccessFinanceSection(
    auth.role,
    financeGrants,
    "credits",
  );
  if (!canCredits) {
    return res.status(403).json({ error: "Sin permisos" });
  }

  const idRaw = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const accountId = safeNumber(idRaw);
  if (accountId == null)
    return res.status(400).json({ error: "ID de cuenta inválido." });

  const account = await prisma.creditAccount.findUnique({
    where: { id_credit_account: accountId },
    include: {
      client: {
        select: { id_client: true, first_name: true, last_name: true },
      },
      operator: { select: { id_operator: true, name: true } },
    },
  });

  if (!account) return res.status(404).json({ error: "Cuenta no encontrada." });
  if (account.id_agency !== auth.id_agency)
    return res.status(403).json({ error: "No autorizado para esta cuenta." });

  if (req.method === "GET") {
    try {
      const recent = await prisma.creditEntry.findMany({
        where: { account_id: accountId, id_agency: auth.id_agency },
        orderBy: [{ created_at: "desc" }, { id_entry: "desc" }],
        take: 20,
        select: {
          id_entry: true,
          created_at: true,
          amount: true,
          currency: true,
          concept: true,
          doc_type: true,
          booking_id: true,
          receipt_id: true,
          investment_id: true,
          operator_due_id: true,

          // NUEVO:
          created_by: true,
          createdBy: {
            select: { first_name: true, last_name: true, email: true },
          },
        },
      });

      return res.status(200).json({ ...account, recentEntries: recent });
    } catch (e) {
      console.error("[credit/account/:id][GET]", e);
      return res.status(500).json({ error: "Error al obtener la cuenta." });
    }
  }

  if (req.method === "PUT") {
    try {
      const enabled =
        typeof req.body?.enabled === "boolean"
          ? Boolean(req.body.enabled)
          : undefined;

      if (enabled == null)
        return res.status(400).json({ error: "Nada para actualizar." });

      const updated = await prisma.creditAccount.update({
        where: { id_credit_account: accountId },
        data: { enabled },
      });

      return res.status(200).json(updated);
    } catch (e) {
      console.error("[credit/account/:id][PUT]", e);
      return res.status(500).json({ error: "Error al actualizar la cuenta." });
    }
  }

  if (req.method === "DELETE") {
    try {
      const count = await prisma.creditEntry.count({
        where: { account_id: accountId },
      });
      if (count > 0) {
        return res.status(409).json({
          error: "No se puede eliminar: la cuenta tiene movimientos.",
        });
      }
      await prisma.creditAccount.delete({
        where: { id_credit_account: accountId },
      });
      return res.status(200).json({ message: "Cuenta eliminada con éxito." });
    } catch (e) {
      console.error("[credit/account/:id][DELETE]", e);
      return res.status(500).json({ error: "Error al eliminar la cuenta." });
    }
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
