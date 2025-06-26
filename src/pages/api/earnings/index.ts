import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

interface EarningItem {
  currency: "ARS" | "USD";
  userId: number;
  userName: string;
  teamId: number;
  teamName: string;
  totalSellerComm: number;
  totalLeaderComm: number;
  totalAgencyShare: number;
}

interface EarningsResponse {
  totals: {
    sellerComm: Record<"ARS" | "USD", number>;
    leaderComm: Record<"ARS" | "USD", number>;
    agencyShare: Record<"ARS" | "USD", number>;
  };
  items: EarningItem[];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<EarningsResponse | { error: string }>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { from, to } = req.query;
  if (typeof from !== "string" || typeof to !== "string") {
    return res.status(400).json({ error: "Parámetros from y to requeridos" });
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

  try {
    // 1) Construir mapas de equipos y usuarios
    const teams = await prisma.salesTeam.findMany({
      include: { user_teams: { include: { user: true } } },
    });

    const teamMap = new Map<
      number,
      { name: string; members: number[]; leaders: number[] }
    >();
    const userToMemberTeams = new Map<number, number[]>();
    const userToLeaderTeams = new Map<number, number[]>();

    teams.forEach(({ id_team: teamId, name, user_teams }) => {
      const members: number[] = [];
      const leaders: number[] = [];

      user_teams.forEach(({ user }) => {
        const uid = user.id_user;
        members.push(uid);
        userToMemberTeams.set(uid, [
          ...(userToMemberTeams.get(uid) || []),
          teamId,
        ]);

        if (["lider", "gerente"].includes(user.role.toLowerCase())) {
          leaders.push(uid);
          userToLeaderTeams.set(uid, [
            ...(userToLeaderTeams.get(uid) || []),
            teamId,
          ]);
        }
      });

      teamMap.set(teamId, { name, members, leaders });
    });

    // 2) Traer servicios
    const services = await prisma.service.findMany({
      where: { created_at: { gte: fromDate, lte: toDate } },
      include: { booking: { include: { user: true } } },
    });

    // 3) Inicializar totales y detalles
    const totals: EarningsResponse["totals"] = {
      sellerComm: { ARS: 0, USD: 0 },
      leaderComm: { ARS: 0, USD: 0 },
      agencyShare: { ARS: 0, USD: 0 },
    };
    const itemsMap = new Map<string, EarningItem>();

    // Helper para agregar o actualizar entries
    function addEarningEntry(
      currency: "ARS" | "USD",
      teamId: number,
      userId: number,
      userName: string,
      sellerComm: number,
      leaderComm: number,
      agencyShare: number,
    ) {
      totals.sellerComm[currency] += sellerComm;
      totals.leaderComm[currency] += leaderComm;
      totals.agencyShare[currency] += agencyShare;

      const key = `${currency}-${teamId}-${userId}`;
      const existing = itemsMap.get(key);
      if (existing) {
        existing.totalSellerComm += sellerComm;
        existing.totalLeaderComm += leaderComm;
        existing.totalAgencyShare += agencyShare;
      } else {
        const teamName = teamMap.get(teamId)?.name || "Sin equipo";
        itemsMap.set(key, {
          currency,
          userId,
          userName,
          teamId,
          teamName,
          totalSellerComm: sellerComm,
          totalLeaderComm: leaderComm,
          totalAgencyShare: agencyShare,
        });
      }
    }

    // 4) Procesar cada servicio
    for (const svc of services) {
      const fee = svc.sale_price * 0.024;
      const dbCommission = svc.totalCommissionWithoutVAT ?? 0;
      const commissionBase = Math.max(dbCommission - fee, 0);

      const cur = svc.currency as "ARS" | "USD";
      const {
        booking: { user },
      } = svc;
      const { id_user: sellerId, first_name, last_name, role } = user;
      const sellerName = `${first_name} ${last_name}`;
      const lowerRole = role.toLowerCase();

      const memberTeams = userToMemberTeams.get(sellerId) || [];
      const leaderTeams = userToLeaderTeams.get(sellerId) || [];

      let sellerComm = 0;
      let leaderComm = 0;
      let agencyShare = 0;
      let targetTeams: number[] = [];

      if (["lider", "gerente"].includes(lowerRole)) {
        // líder o gerente
        if (lowerRole === "gerente" && leaderTeams.length === 0) {
          sellerComm = 0;
          agencyShare = commissionBase;
        } else {
          sellerComm = commissionBase * 0.3;
          agencyShare = commissionBase - sellerComm;
        }
        targetTeams = leaderTeams.length ? leaderTeams : [0];
      } else {
        // vendedor
        sellerComm = commissionBase * 0.3;
        leaderComm = commissionBase * 0.1;
        agencyShare = commissionBase - sellerComm - leaderComm;

        const totalLeaders = memberTeams.reduce(
          (sum, t) => sum + (teamMap.get(t)?.leaders.length || 0),
          0,
        );
        if (totalLeaders === 0) {
          leaderComm = 0;
          agencyShare = commissionBase - sellerComm;
        }
        targetTeams = memberTeams.length ? memberTeams : [0];
      }

      targetTeams.forEach((teamId) =>
        addEarningEntry(
          cur,
          teamId,
          sellerId,
          sellerName,
          sellerComm,
          leaderComm,
          agencyShare,
        ),
      );
    }

    return res.status(200).json({
      totals,
      items: Array.from(itemsMap.values()),
    });
  } catch (err: unknown) {
    console.error("Error en earnings API:", err);
    const message =
      err instanceof Error ? err.message : "Error obteniendo datos";
    return res.status(500).json({ error: message });
  }
}
