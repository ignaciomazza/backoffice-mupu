import { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
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
    const v = c[k];
    if (typeof v === "string" && v) return v;
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
      if (u) {
        return {
          id_user,
          id_agency: u.id_agency,
          role: role || u.role.toLowerCase(),
          email: email ?? u.email ?? undefined,
        };
      }
    }

    if (!id_user || !id_agency) return null;
    return { id_user, id_agency, role, email: email ?? undefined };
  } catch {
    return null;
  }
}

function hasFinanceAdminRights(role: string): boolean {
  const r = (role || "").toLowerCase();
  return r === "gerente" || r === "administrativo" || r === "desarrollador";
}

function safeNumber(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function toLocalDate(v?: string | null): Date | undefined {
  if (!v) return undefined;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m)
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

/**
 * Normaliza "1.234,56" / "1234,56" / "1,234.56" / "1234.56" a string decimal con punto.
 */
function normalizeDecimalInput(raw: unknown): string | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/\s+/g, "");

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      // "1.234,56"
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // "1,234.56"
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    s = s.replace(",", ".");
  }

  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return s;
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
  if (!hasFinanceAdminRights(auth.role)) {
    return res
      .status(403)
      .json({ error: "No autorizado para ajustar saldos." });
  }

  const idRaw = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const accountId = safeNumber(idRaw);
  if (!accountId)
    return res.status(400).json({ error: "ID de cuenta inválido." });

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const body = (req.body ?? {}) as {
      target_balance?: number | string;
      reason?: string;
      value_date?: string | null;
      reference?: string | null;
    };

    const normalized = normalizeDecimalInput(body.target_balance);
    if (!normalized) {
      return res.status(400).json({
        error: "target_balance es obligatorio y debe ser un número válido.",
      });
    }

    const reason = String(body.reason || "").trim();
    if (!reason) {
      return res.status(400).json({ error: "reason es obligatorio." });
    }

    const value_date = body.value_date
      ? toLocalDate(body.value_date)
      : undefined;
    if (body.value_date && !value_date) {
      return res.status(400).json({ error: "value_date inválida." });
    }

    const account = await prisma.creditAccount.findUnique({
      where: { id_credit_account: accountId },
      select: { id_credit_account: true, id_agency: true, currency: true },
    });

    if (!account)
      return res.status(404).json({ error: "Cuenta no encontrada." });
    if (account.id_agency !== auth.id_agency) {
      return res.status(403).json({ error: "No autorizado para esta cuenta." });
    }

    const result = await prisma.$transaction(async (tx) => {
      const fresh = await tx.creditAccount.findUnique({
        where: { id_credit_account: accountId },
        select: { balance: true, currency: true },
      });
      if (!fresh) throw new Error("Cuenta inexistente (TX).");

      const target = new Prisma.Decimal(normalized).toDecimalPlaces(2);
      const current = fresh.balance;
      const diff = target.minus(current);

      // Si no hay cambio, no generamos asiento
      if (diff.isZero()) {
        const accNow = await tx.creditAccount.findUnique({
          where: { id_credit_account: accountId },
          select: {
            id_credit_account: true,
            balance: true,
            currency: true,
            updated_at: true,
          },
        });
        return {
          changed: false,
          account: accNow,
          entry: null,
          previous_balance: current,
          target_balance: target,
          delta: diff,
        };
      }

      const doc_type = diff.greaterThanOrEqualTo(0)
        ? "adjust_up"
        : "adjust_down";
      const amountAbs = diff.abs().toDecimalPlaces(2);

      const agencyEntryId = await getNextAgencyCounter(
        tx,
        auth.id_agency,
        "credit_entry",
      );
      const entry = await tx.creditEntry.create({
        data: {
          id_agency: auth.id_agency,
          agency_credit_entry_id: agencyEntryId,
          account_id: accountId,
          created_by: auth.id_user,
          concept: `Ajuste manual: ${reason}`,
          amount: amountAbs, // SIEMPRE positivo
          currency: fresh.currency,
          doc_type,
          reference: body.reference
            ? String(body.reference).trim()
            : "MANUAL-ADJUST",
          value_date: value_date ?? null,
        },
      });

      // Setear saldo a target (no sumar/restar a ciegas)
      const updatedAccount = await tx.creditAccount.update({
        where: { id_credit_account: accountId },
        data: { balance: target },
        select: {
          id_credit_account: true,
          balance: true,
          currency: true,
          updated_at: true,
        },
      });

      return {
        changed: true,
        account: updatedAccount,
        entry,
        previous_balance: current,
        target_balance: target,
        delta: diff,
      };
    });

    return res.status(200).json(result);
  } catch (e) {
    console.error("[credit/account/:id/adjust][POST]", e);
    return res.status(500).json({ error: "Error al ajustar el saldo." });
  }
}
