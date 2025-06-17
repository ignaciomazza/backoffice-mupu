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
    // 1) equipos
    const teams = await prisma.salesTeam.findMany({
      include: { user_teams: { include: { user: true } } },
    });
    const teamMap = new Map<
      number,
      { name: string; members: number[]; leaders: number[] }
    >();
    teams.forEach((team) => {
      const members = team.user_teams.map((ut) => ut.user.id_user);
      const leaders = team.user_teams
        .filter((ut) =>
          ["lider", "gerente"].includes(ut.user.role.toLowerCase()),
        )
        .map((ut) => ut.user.id_user);
      teamMap.set(team.id_team, { name: team.name, members, leaders });
    });

    // 2) servicios
    const services = await prisma.service.findMany({
      where: { created_at: { gte: fromDate, lte: toDate } },
      include: { booking: { include: { user: true } } },
    });

    // 3) totales y detalles
    const totals = {
      sellerComm: { ARS: 0, USD: 0 },
      leaderComm: { ARS: 0, USD: 0 },
      agencyShare: { ARS: 0, USD: 0 },
    };
    const itemsMap = new Map<string, EarningItem>();

    services.forEach((svc) => {
      const fee = svc.sale_price * 0.024; // 2.4% del total de venta
      const dbCommission = svc.totalCommissionWithoutVAT ?? 0;
      let commissionBase = dbCommission - fee;
      if (commissionBase < 0) commissionBase = 0;

      const cur = svc.currency as "ARS" | "USD";
      const sellerId = svc.booking.user.id_user;
      const sellerName = `${svc.booking.user.first_name} ${svc.booking.user.last_name}`;
      const sellerRole = svc.booking.user.role.toLowerCase();

      // líder/gerente
      if (["lider", "gerente"].includes(sellerRole)) {
        const isLeaderInAny = Array.from(teamMap.values()).some((t) =>
          t.leaders.includes(sellerId),
        );
        let sellerComm: number;
        const leaderComm = 0;
        let agencyShare: number;
        if (!isLeaderInAny && sellerRole === "gerente") {
          sellerComm = 0;
          agencyShare = commissionBase;
        } else {
          sellerComm = commissionBase * 0.3;
          agencyShare = commissionBase - sellerComm;
        }
        totals.sellerComm[cur] += sellerComm;
        totals.leaderComm[cur] += leaderComm;
        totals.agencyShare[cur] += agencyShare;

        const key = `${cur}-0-${sellerId}`;
        const e = itemsMap.get(key);
        if (e) {
          e.totalSellerComm += sellerComm;
          e.totalAgencyShare += agencyShare;
        } else {
          itemsMap.set(key, {
            currency: cur,
            userId: sellerId,
            userName: sellerName,
            teamId: 0,
            teamName: "Sin equipo",
            totalSellerComm: sellerComm,
            totalLeaderComm: leaderComm,
            totalAgencyShare: agencyShare,
          });
        }
        return;
      }

      // vendedor puro
      let totalLeaders = 0;
      teamMap.forEach((t) => {
        if (t.members.includes(sellerId)) totalLeaders += t.leaders.length;
      });
      const sellerComm = commissionBase * 0.3;
      let leaderComm = commissionBase * 0.1;
      let agencyShare = commissionBase - sellerComm - leaderComm;
      if (totalLeaders === 0) {
        leaderComm = 0;
        agencyShare = commissionBase - sellerComm;
      }
      totals.sellerComm[cur] += sellerComm;
      totals.leaderComm[cur] += leaderComm;
      totals.agencyShare[cur] += agencyShare;

      let assigned = false;
      teamMap.forEach((t, teamId) => {
        if (!t.members.includes(sellerId)) return;
        assigned = true;
        const key = `${cur}-${teamId}-${sellerId}`;
        const e = itemsMap.get(key);
        if (e) {
          e.totalSellerComm += sellerComm;
          e.totalLeaderComm += leaderComm;
          e.totalAgencyShare += agencyShare;
        } else {
          itemsMap.set(key, {
            currency: cur,
            userId: sellerId,
            userName: sellerName,
            teamId,
            teamName: t.name,
            totalSellerComm: sellerComm,
            totalLeaderComm: leaderComm,
            totalAgencyShare: agencyShare,
          });
        }
      });
      if (!assigned) {
        const key = `${cur}-0-${sellerId}`;
        const e = itemsMap.get(key);
        if (e) {
          e.totalSellerComm += sellerComm;
          e.totalLeaderComm += leaderComm;
          e.totalAgencyShare += agencyShare;
        } else {
          itemsMap.set(key, {
            currency: cur,
            userId: sellerId,
            userName: sellerName,
            teamId: 0,
            teamName: "Sin equipo",
            totalSellerComm: sellerComm,
            totalLeaderComm: leaderComm,
            totalAgencyShare: agencyShare,
          });
        }
      }
    });

    return res.status(200).json({
      totals,
      items: Array.from(itemsMap.values()),
    });
  } catch (err: unknown) {
    console.error("Error en earnings API:", err);
    const message =
      err instanceof Error
        ? err.message
        : "Error obteniendo datos de ganancias";
    return res.status(500).json({ error: message });
  }
}
