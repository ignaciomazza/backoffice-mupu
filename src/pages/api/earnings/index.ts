// src/pages/api/earnings/index.ts

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
  debt: number;
  bookingIds: number[];
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

    // 2) Traer servicios con booking.user
    const services = await prisma.service.findMany({
      where: { created_at: { gte: fromDate, lte: toDate } },
      include: { booking: { include: { user: true } } },
    });

    // 2.1) Map de booking → dueño
    const bookingOwners = new Map<
      number,
      { userId: number; userName: string }
    >();
    services.forEach((svc) => {
      const bid = svc.booking.id_booking;
      if (!bookingOwners.has(bid)) {
        bookingOwners.set(bid, {
          userId: svc.booking.user.id_user,
          userName: `${svc.booking.user.first_name} ${svc.booking.user.last_name}`,
        });
      }
    });

    // 3) Venta total por reserva y moneda
    const saleTotalsByBooking = new Map<number, { ARS: number; USD: number }>();
    services.forEach((svc) => {
      const bid = svc.booking.id_booking;
      const cur = svc.currency as "ARS" | "USD";
      const prev = saleTotalsByBooking.get(bid) || { ARS: 0, USD: 0 };
      prev[cur] += svc.sale_price;
      saleTotalsByBooking.set(bid, prev);
    });

    // Debug: mostrar totales de venta
    console.debug(
      "saleTotalsByBooking:",
      Array.from(saleTotalsByBooking.entries()).map(([bid, totals]) => ({
        bookingId: bid,
        owner: bookingOwners.get(bid),
        totals,
      })),
    );

    // 4) Recibos sin filtrar por fecha
    const allReceipts = await prisma.receipt.findMany({
      where: {
        bookingId_booking: { in: Array.from(saleTotalsByBooking.keys()) },
      },
      select: { bookingId_booking: true, amount: true, amount_currency: true },
    });
    const receiptsMap = new Map<number, { ARS: number; USD: number }>();
    allReceipts.forEach(
      ({ bookingId_booking: bid, amount, amount_currency }) => {
        const cur = amount_currency as "ARS" | "USD";
        const prev = receiptsMap.get(bid) || { ARS: 0, USD: 0 };
        prev[cur] += amount;
        receiptsMap.set(bid, prev);
      },
    );

    // Debug: mostrar recibos acumulados
    console.debug(
      "receiptsMap:",
      Array.from(receiptsMap.entries()).map(([bid, sums]) => ({
        bookingId: bid,
        owner: bookingOwners.get(bid),
        sums,
      })),
    );

    // 5) Validar bookings ≥40% pagado en su propia moneda
    const validBookingCurrency = new Set<string>();
    saleTotalsByBooking.forEach((totals, bid) => {
      const paid = receiptsMap.get(bid) || { ARS: 0, USD: 0 };
      (["ARS", "USD"] as const).forEach((cur) => {
        if (totals[cur] > 0 && paid[cur] / totals[cur] >= 0.4) {
          validBookingCurrency.add(`${bid}-${cur}`);
        }
      });
    });

    // Debug: mostrar reservas válidas por moneda
    console.debug(
      "validBookingCurrency:",
      Array.from(validBookingCurrency).map((key) => {
        const [bidStr, cur] = key.split("-");
        return {
          bookingId: Number(bidStr),
          currency: cur,
          owner: bookingOwners.get(Number(bidStr)),
        };
      }),
    );

    // 6) Calcular deuda por reserva
    const debtByBooking = new Map<number, { ARS: number; USD: number }>();
    saleTotalsByBooking.forEach((totals, bid) => {
      const paid = receiptsMap.get(bid) || { ARS: 0, USD: 0 };
      debtByBooking.set(bid, {
        ARS: totals.ARS - paid.ARS,
        USD: totals.USD - paid.USD,
      });
    });

    // Debug: mostrar deuda por reserva
    console.debug(
      "debtByBooking:",
      Array.from(debtByBooking.entries()).map(([bid, debt]) => ({
        bookingId: bid,
        owner: bookingOwners.get(bid),
        debt,
      })),
    );

    // 7) Filtrar servicios válidos
    const filteredServices = services.filter((svc) =>
      validBookingCurrency.has(`${svc.booking.id_booking}-${svc.currency}`),
    );

    // 8) Procesar comisiones y agrupar
    const totals = {
      sellerComm: { ARS: 0, USD: 0 },
      leaderComm: { ARS: 0, USD: 0 },
      agencyShare: { ARS: 0, USD: 0 },
    };
    const itemsMap = new Map<string, EarningItem>();

    function addEarningEntry(
      currency: "ARS" | "USD",
      teamId: number,
      userId: number,
      userName: string,
      sellerComm: number,
      leaderComm: number,
      agencyShare: number,
      debt: number,
      bid: number,
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
        if (!existing.bookingIds.includes(bid)) {
          existing.debt = Math.max(0, existing.debt + debt);
          existing.bookingIds.push(bid);
        }
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
          debt: Math.max(0, debt),
          bookingIds: [bid],
        });
      }
    }

    for (const svc of filteredServices) {
      const fee = svc.sale_price * 0.024;
      const dbCommission = svc.totalCommissionWithoutVAT ?? 0;
      const commissionBase = Math.max(dbCommission - fee, 0);

      const cur = svc.currency as "ARS" | "USD";
      const { user } = svc.booking;
      const sellerId = user.id_user;
      const sellerName = `${user.first_name} ${user.last_name}`;
      const lowerRole = user.role.toLowerCase();

      const memberTeams = userToMemberTeams.get(sellerId) || [];
      const leaderTeams = userToLeaderTeams.get(sellerId) || [];

      let sellerComm = 0;
      let leaderComm = 0;
      let agencyShareAmt = 0;
      let targetTeams: number[] = [];

      if (["lider", "gerente"].includes(lowerRole)) {
        if (lowerRole === "gerente" && leaderTeams.length === 0) {
          sellerComm = 0;
          agencyShareAmt = commissionBase;
        } else {
          sellerComm = commissionBase * 0.3;
          agencyShareAmt = commissionBase - sellerComm;
        }
        targetTeams = leaderTeams.length ? leaderTeams : [0];
      } else {
        sellerComm = commissionBase * 0.3;
        leaderComm = commissionBase * 0.1;
        agencyShareAmt = commissionBase - sellerComm - leaderComm;

        const totalLeaders = memberTeams.reduce(
          (sum, t) => sum + (teamMap.get(t)?.leaders.length || 0),
          0,
        );
        if (totalLeaders === 0) {
          leaderComm = 0;
          agencyShareAmt = commissionBase - sellerComm;
        }
        targetTeams = memberTeams.length ? memberTeams : [0];
      }

      const bid = svc.booking.id_booking;
      const bookingDebt = debtByBooking.get(bid)![cur];

      targetTeams.forEach((teamId) =>
        addEarningEntry(
          cur,
          teamId,
          sellerId,
          sellerName,
          sellerComm,
          leaderComm,
          agencyShareAmt,
          bookingDebt,
          bid,
        ),
      );
    }

    return res
      .status(200)
      .json({ totals, items: Array.from(itemsMap.values()) });
  } catch (err: unknown) {
    console.error("Error en earnings API:", err);
    const message =
      err instanceof Error ? err.message : "Error obteniendo datos";
    return res.status(500).json({ error: message });
  }
}
