// src/pages/api/commissions/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import { Prisma } from "@prisma/client"; // 👈 importa Prisma para usar Decimal
import { jwtVerify, type JWTPayload } from "jose";
import { parseDateInputInBuenosAires } from "@/lib/buenosAiresDate";

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

async function getAuth(req: NextApiRequest): Promise<{
  id_user: number;
  id_agency: number;
  role: string;
} | null> {
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

function asPct(n: unknown) {
  const x = Number(n);
  if (!Number.isFinite(x) || x < 0) throw new Error("Porcentaje inválido");
  return Math.round(x * 100) / 100;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const auth = await getAuth(req);
  if (!auth) return res.status(401).json({ error: "No autenticado" });

  const isManager = ["gerente", "desarrollador"].includes(auth.role);

  // GET /api/commissions?userId?effective=1
  if (req.method === "GET") {
    const userId =
      typeof req.query.userId === "string" ? Number(req.query.userId) : null;
    const effective =
      req.query.effective === "1" || req.query.effective === "true";

    if (userId) {
      // Versiones del usuario (solo su agencia)
      const sets = await prisma.commissionRuleSet.findMany({
        where: { id_agency: auth.id_agency, owner_user_id: userId },
        include: { shares: true },
        orderBy: { valid_from: "desc" },
      });
      return res.status(200).json(sets);
    }

    // Efectivas por usuario (una por dueño) — toma la última versión por valid_from
    if (effective) {
      const latestByOwner = await prisma.commissionRuleSet.groupBy({
        by: ["owner_user_id"],
        where: { id_agency: auth.id_agency },
        _max: { valid_from: true },
      });

      const pairs = latestByOwner.map((p) => ({
        owner_user_id: p.owner_user_id,
        valid_from: p._max.valid_from!,
      }));

      const effectiveSets = await prisma.commissionRuleSet.findMany({
        where: {
          id_agency: auth.id_agency,
          OR: pairs.map((p) => ({
            owner_user_id: p.owner_user_id,
            valid_from: p.valid_from,
          })),
        },
        include: { shares: true },
        orderBy: [{ owner_user_id: "asc" }, { valid_from: "desc" }],
      });

      return res.status(200).json(effectiveSets);
    }

    // Todas las reglas de la agencia
    const sets = await prisma.commissionRuleSet.findMany({
      where: { id_agency: auth.id_agency },
      include: { shares: true },
      orderBy: [{ owner_user_id: "asc" }, { valid_from: "desc" }],
    });
    return res.status(200).json(sets);
  }

  // POST /api/commissions  (solo gerente/desarrollador)
  if (req.method === "POST") {
    if (!isManager) return res.status(403).json({ error: "No autorizado" });

    const { owner_user_id, own_pct, valid_from, shares } = (req.body ?? {}) as {
      owner_user_id?: number;
      own_pct?: number | string;
      valid_from?: string; // opcional
      shares?: Array<{ beneficiary_user_id: number; percent: number | string }>;
    };

    try {
      if (!owner_user_id || !Number.isFinite(owner_user_id)) {
        return res.status(400).json({ error: "owner_user_id requerido" });
      }

      // validar que owner pertenezca a la agencia
      const owner = await prisma.user.findUnique({
        where: { id_user: owner_user_id },
        select: { id_agency: true },
      });
      if (!owner || owner.id_agency !== auth.id_agency) {
        return res.status(400).json({ error: "Usuario fuera de la agencia" });
      }

      const own = asPct(own_pct ?? 100);
      const shareList = Array.isArray(shares) ? shares : [];
      const normalizedShares = shareList.map((s) => ({
        beneficiary_user_id: Number(s.beneficiary_user_id),
        percent: asPct(s.percent),
      }));

      // validar Lideres de equipo en la misma agencia
      if (normalizedShares.length) {
        const ids = normalizedShares.map((s) => s.beneficiary_user_id);
        const ben = await prisma.user.findMany({
          where: { id_user: { in: ids } },
          select: { id_user: true, id_agency: true },
        });
        const allOk =
          ben.length === ids.length &&
          ben.every((b) => b.id_agency === auth.id_agency);
        if (!allOk) {
          return res
            .status(400)
            .json({
              error: "Lideres de equipo fuera de la agencia o inexistentes",
            });
        }
      }

      const sumShares = normalizedShares.reduce(
        (a, b) => a + Number(b.percent),
        0,
      );
      if (own + sumShares > 100.0001) {
        return res
          .status(400)
          .json({ error: "La suma de porcentajes no puede superar 100%" });
      }

      const parsedValidFromRaw =
        typeof valid_from === "string"
          ? parseDateInputInBuenosAires(valid_from)
          : undefined;
      if (typeof valid_from === "string" && !parsedValidFromRaw) {
        return res.status(400).json({ error: "valid_from inválida" });
      }
      const parsedValidFrom = parsedValidFromRaw ?? undefined;

      const created = await prisma.$transaction(async (tx) => {
        const agencyRuleSetId = await getNextAgencyCounter(
          tx,
          auth.id_agency,
          "commission_rule_set",
        );
        return tx.commissionRuleSet.create({
          data: {
            id_agency: auth.id_agency,
            agency_commission_rule_set_id: agencyRuleSetId,
            owner_user_id,
            own_pct: new Prisma.Decimal(own), // 👈 usar Prisma.Decimal
            valid_from: parsedValidFrom,
            shares: {
              create: normalizedShares.map((s) => ({
                beneficiary_user_id: s.beneficiary_user_id,
                percent: new Prisma.Decimal(s.percent), // 👈 usar Prisma.Decimal
              })),
            },
          },
          include: { shares: true },
        });
      });

      return res.status(201).json(created);
    } catch (error: unknown) {
      // 👇 sin `any` para cumplir eslint
      console.error("[commissions][POST]", error);
      return res.status(500).json({ error: "Error al crear la regla" });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
