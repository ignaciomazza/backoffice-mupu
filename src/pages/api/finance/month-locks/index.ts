import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { resolveAuth } from "@/lib/auth";
import { ensurePlanFeatureAccess } from "@/lib/planAccess.server";
import { getFinanceSectionGrants } from "@/lib/accessControl";
import { canAccessFinanceSection } from "@/utils/permissions";
import { normalizeYearMonth } from "@/lib/financeLocks";

function hasFinanceAdminRights(role: string): boolean {
  const normalized = String(role || "").trim().toLowerCase();
  return (
    normalized === "gerente" ||
    normalized === "administrativo" ||
    normalized === "desarrollador"
  );
}

const writeSchema = z.object({
  year: z.coerce.number().int(),
  month: z.coerce.number().int(),
  action: z.enum(["lock", "unlock"]),
  reason: z.string().trim().max(1000).optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");

  const auth = await resolveAuth(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const planAccess = await ensurePlanFeatureAccess(auth.id_agency, "cashbox");
  if (!planAccess.allowed) {
    return res.status(403).json({ error: "Plan insuficiente" });
  }

  const grants = await getFinanceSectionGrants(auth.id_agency, auth.id_user);
  const canTransfers = canAccessFinanceSection(
    auth.role,
    grants,
    "account_transfers",
  );
  if (!canTransfers) {
    return res.status(403).json({ error: "Sin permisos" });
  }

  if (req.method === "GET") {
    const yearRaw = Number(
      Array.isArray(req.query.year) ? req.query.year[0] : req.query.year,
    );
    const monthRaw = Number(
      Array.isArray(req.query.month) ? req.query.month[0] : req.query.month,
    );
    const hasMonthFilter =
      Number.isFinite(yearRaw) &&
      Number.isFinite(monthRaw) &&
      monthRaw >= 1 &&
      monthRaw <= 12;

    if (hasMonthFilter) {
      let ym: { year: number; month: number };
      try {
        ym = normalizeYearMonth(yearRaw, monthRaw);
      } catch (e) {
        return res.status(400).json({
          error: e instanceof Error ? e.message : "Período inválido.",
        });
      }
      const [lock, events] = await Promise.all([
        prisma.financeMonthLock.findUnique({
          where: {
            id_agency_year_month: {
              id_agency: auth.id_agency,
              year: ym.year,
              month: ym.month,
            },
          },
        }),
        prisma.financeMonthLockEvent.findMany({
          where: {
            id_agency: auth.id_agency,
            year: ym.year,
            month: ym.month,
          },
          orderBy: [{ acted_at: "desc" }, { id_event: "desc" }],
          take: 100,
        }),
      ]);

      return res.status(200).json({
        lock:
          lock ??
          ({
            id_agency: auth.id_agency,
            year: ym.year,
            month: ym.month,
            is_locked: false,
          } as const),
        events,
      });
    }

    const [locks, events] = await Promise.all([
      prisma.financeMonthLock.findMany({
        where: { id_agency: auth.id_agency },
        orderBy: [{ year: "desc" }, { month: "desc" }],
        take: 48,
      }),
      prisma.financeMonthLockEvent.findMany({
        where: { id_agency: auth.id_agency },
        orderBy: [{ acted_at: "desc" }, { id_event: "desc" }],
        take: 200,
      }),
    ]);

    return res.status(200).json({ locks, events });
  }

  if (req.method === "POST") {
    if (!hasFinanceAdminRights(auth.role)) {
      return res
        .status(403)
        .json({ error: "No autorizado para bloquear/desbloquear meses." });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const parsed = writeSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }

    const data = parsed.data;
    let ym: { year: number; month: number };
    try {
      ym = normalizeYearMonth(data.year, data.month);
    } catch (e) {
      return res.status(400).json({
        error: e instanceof Error ? e.message : "Período inválido.",
      });
    }
    const reason = data.reason?.trim() || null;
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const updatedLock = await tx.financeMonthLock.upsert({
        where: {
          id_agency_year_month: {
            id_agency: auth.id_agency,
            year: ym.year,
            month: ym.month,
          },
        },
        create: {
          id_agency: auth.id_agency,
          year: ym.year,
          month: ym.month,
          is_locked: data.action === "lock",
          reason,
          ...(data.action === "lock"
            ? { locked_by: auth.id_user, locked_at: now }
            : { unlocked_by: auth.id_user, unlocked_at: now }),
        },
        update: {
          is_locked: data.action === "lock",
          reason,
          ...(data.action === "lock"
            ? { locked_by: auth.id_user, locked_at: now }
            : { unlocked_by: auth.id_user, unlocked_at: now }),
        },
      });

      await tx.financeMonthLockEvent.create({
        data: {
          id_agency: auth.id_agency,
          year: ym.year,
          month: ym.month,
          action: data.action,
          reason,
          acted_by: auth.id_user,
          acted_at: now,
        },
      });

      const events = await tx.financeMonthLockEvent.findMany({
        where: {
          id_agency: auth.id_agency,
          year: ym.year,
          month: ym.month,
        },
        orderBy: [{ acted_at: "desc" }, { id_event: "desc" }],
        take: 100,
      });

      return { lock: updatedLock, events };
    });

    return res.status(200).json(result);
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}
