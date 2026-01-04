import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { jwtVerify, type JWTPayload } from "jose";

/* ===== auth helpers ===== */

type TokenPayload = JWTPayload & {
  id_user?: number;
  userId?: number;
  uid?: number;
  id_agency?: number;
  agencyId?: number;
  aid?: number;
  role?: string;
};

const JWT_SECRET = process.env.JWT_SECRET!;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

function normalizeRole(r?: string) {
  return (r ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/^leader$/, "lider");
}

async function getAuth(
  req: NextApiRequest,
): Promise<{ id_user: number; id_agency: number; role: string } | null> {
  try {
    const cookieTok = req.cookies?.token;
    let token = cookieTok && typeof cookieTok === "string" ? cookieTok : null;
    if (!token) {
      const auth = req.headers.authorization || "";
      if (auth.startsWith("Bearer ")) token = auth.slice(7);
    }
    if (!token) return null;

    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET),
    );
    const p = payload as TokenPayload;
    const id_user = Number(p.id_user ?? p.userId ?? p.uid) || 0;
    const id_agency = Number(p.id_agency ?? p.agencyId ?? p.aid) || 0;
    const role = normalizeRole(p.role);
    if (!id_user || !id_agency) return null;
    return { id_user, id_agency, role };
  } catch {
    return null;
  }
}

/* ===== utils ===== */

function asPct(n: unknown) {
  const x = Number(n);
  if (!Number.isFinite(x) || x < 0) throw new Error("Porcentaje inválido");
  return Math.round(x * 100) / 100;
}

type PutBody = {
  own_pct?: number | string;
  valid_from?: string; // YYYY-MM-DD (opcional)
  shares?: Array<{ beneficiary_user_id: number; percent: number | string }>;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const auth = await getAuth(req);
  if (!auth) return res.status(401).json({ error: "No autenticado" });

  const isManager = ["gerente", "desarrollador"].includes(auth.role);

  // validar id
  const idRaw = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const ruleId = Number(idRaw);
  if (!Number.isFinite(ruleId)) {
    return res.status(400).json({ error: "ID de regla inválido" });
  }

  // cargar la regla y validar agencia
  const rule = await prisma.commissionRuleSet.findUnique({
    where: { id_rule_set: ruleId },
    include: { shares: true },
  });
  if (!rule) return res.status(404).json({ error: "Regla no encontrada" });
  if (rule.id_agency !== auth.id_agency) {
    return res.status(403).json({ error: "No autorizado para esta regla" });
  }

  if (req.method === "GET") {
    // útil si querés ver una versión puntual
    return res.status(200).json(rule);
  }

  if (req.method === "DELETE") {
    if (!isManager) return res.status(403).json({ error: "No autorizado" });
    await prisma.commissionShare.deleteMany({ where: { rule_set_id: ruleId } });
    await prisma.commissionRuleSet.delete({ where: { id_rule_set: ruleId } });
    return res.status(204).end();
  }

  if (req.method === "PUT") {
    if (!isManager) return res.status(403).json({ error: "No autorizado" });

    const { own_pct, valid_from, shares }: PutBody = req.body ?? {};
    try {
      // normalizar
      const newOwnPct =
        typeof own_pct === "undefined" ? Number(rule.own_pct) : asPct(own_pct);
      const list = Array.isArray(shares)
        ? shares
        : rule.shares.map((s) => ({
            beneficiary_user_id: s.beneficiary_user_id,
            percent: Number(s.percent),
          }));
      const normalizedShares = list.map((s) => ({
        beneficiary_user_id: Number(s.beneficiary_user_id),
        percent: asPct(s.percent),
      }));
      const sumShares = normalizedShares.reduce((a, b) => a + b.percent, 0);
      if (newOwnPct + sumShares > 100.0001) {
        return res
          .status(400)
          .json({ error: "La suma de porcentajes no puede superar 100%" });
      }

      // validar Lideres de equipo (misma agencia)
      if (normalizedShares.length) {
        const ids = normalizedShares.map((s) => s.beneficiary_user_id);
        const ben = await prisma.user.findMany({
          where: { id_user: { in: ids } },
          select: { id_user: true, id_agency: true },
        });
        const allOk =
          ben.length === ids.length &&
          ben.every((b) => b.id_agency === auth.id_agency);
        if (!allOk)
          return res
            .status(400)
            .json({
              error: "Lideres de equipo fuera de la agencia o inexistentes",
            });
      }

      // update + reemplazo total de shares
      const updated = await prisma.commissionRuleSet.update({
        where: { id_rule_set: ruleId },
        data: {
          own_pct: new Prisma.Decimal(newOwnPct),
          valid_from:
            typeof valid_from === "string"
              ? new Date(`${valid_from}T00:00:00Z`)
              : rule.valid_from, // si no mandás, mantiene la anterior
          shares: {
            deleteMany: {},
            create: normalizedShares.map((s) => ({
              beneficiary_user_id: s.beneficiary_user_id,
              percent: new Prisma.Decimal(s.percent),
            })),
          },
        },
        include: { shares: true },
      });

      return res.status(200).json(updated);
    } catch (e) {
      console.error("[commissions/:id][PUT]", e);
      return res.status(500).json({ error: "Error al actualizar la regla" });
    }
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
