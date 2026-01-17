// src/pages/api/services/index.ts
import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import { Prisma } from "@prisma/client";
import { resolveAuth } from "@/lib/auth";

type BookingAccessContext = {
  id_user: number;
  id_agency: number;
  role: string;
};

const ADMIN_ROLES = new Set(["gerente", "administrativo", "desarrollador"]);

async function getLeaderScope(authUserId: number, authAgencyId: number) {
  const teams = await prisma.salesTeam.findMany({
    where: {
      id_agency: authAgencyId,
      user_teams: { some: { user: { id_user: authUserId, role: "lider" } } },
    },
    include: { user_teams: { select: { id_user: true } } },
  });
  const userIds = new Set<number>([authUserId]);
  teams.forEach((t) => t.user_teams.forEach((ut) => userIds.add(ut.id_user)));
  return { userIds: Array.from(userIds) };
}

async function canAccessBooking(
  auth: BookingAccessContext,
  ownerId: number,
): Promise<boolean> {
  if (ADMIN_ROLES.has(auth.role)) return true;
  if (auth.role === "vendedor") return ownerId === auth.id_user;
  if (auth.role === "lider") {
    const scope = await getLeaderScope(auth.id_user, auth.id_agency);
    return scope.userIds.includes(ownerId);
  }
  return false;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") {
    const { bookingId } = req.query;

    if (!bookingId || Array.isArray(bookingId)) {
      return res.status(400).json({ error: "N° de reserva inválido" });
    }

    try {
      const auth = await resolveAuth(req);
      if (!auth) return res.status(401).json({ error: "Unauthorized" });

      const booking = await prisma.booking.findUnique({
        where: { id_booking: Number(bookingId) },
        select: { id_booking: true, id_agency: true, id_user: true },
      });
      if (!booking || booking.id_agency !== auth.id_agency) {
        return res.status(404).json({ error: "Reserva no encontrada." });
      }
      const allowed = await canAccessBooking(auth, booking.id_user);
      if (!allowed) {
        return res.status(403).json({ error: "No autorizado." });
      }

      const services = await prisma.service.findMany({
        where: { booking_id: Number(bookingId), id_agency: auth.id_agency },
        orderBy: { id_service: "asc" }, // opcional, para que siempre vengan ordenados
        include: { booking: true, operator: true },
      });

      return res.status(200).json({ services, total: services.length });
    } catch (error) {
      console.error("Error al obtener servicios:", error);
      return res.status(500).json({ error: "Error al obtener servicios." });
    }
  } else if (req.method === "POST") {
    // 👇 tu código POST queda igual
    const auth = await resolveAuth(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const {
      type,
      description,
      sale_price,
      cost_price,
      destination,
      reference,
      tax_21,
      tax_105,
      exempt,
      other_taxes,
      currency,
      departure_date,
      return_date,
      id_operator,
      booking_id,
      nonComputable,
      taxableBase21,
      taxableBase10_5,
      commissionExempt,
      commission21,
      commission10_5,
      vatOnCommission21,
      vatOnCommission10_5,
      totalCommissionWithoutVAT,
      impIVA,
      card_interest,
      card_interest_21,
      taxableCardInterest,
      vatOnCardInterest,
      transfer_fee_pct,
      transfer_fee_amount,
      extra_costs_amount,
      extra_taxes_amount,
      extra_adjustments,
    } = req.body;

    if (
      !type ||
      sale_price === undefined ||
      cost_price === undefined ||
      !id_operator ||
      !booking_id
    ) {
      return res.status(400).json({
        error:
          "Faltan campos obligatorios: tipo, precios, moneda o N° de reserva.",
      });
    }

    const parsedDepartureDate = new Date(departure_date);
    const parsedReturnDate = new Date(return_date);

    const bookingExists = await prisma.booking.findUnique({
      where: { id_booking: Number(booking_id) },
      select: { id_booking: true, id_agency: true, id_user: true },
    });
    if (!bookingExists || bookingExists.id_agency !== auth.id_agency) {
      return res.status(404).json({ error: "Reserva no encontrada." });
    }
    const canAccess = await canAccessBooking(auth, bookingExists.id_user);
    if (!canAccess) {
      return res.status(403).json({ error: "No autorizado." });
    }

    const operatorExists = await prisma.operator.findUnique({
      where: { id_operator: Number(id_operator) },
      select: { id_operator: true, id_agency: true },
    });
    if (!operatorExists || operatorExists.id_agency !== auth.id_agency) {
      return res.status(404).json({ error: "Operador no encontrado." });
    }

    try {
      const service = await prisma.$transaction(async (tx) => {
        const agencyServiceId = await getNextAgencyCounter(
          tx,
          bookingExists.id_agency,
          "service",
        );

        return tx.service.create({
          data: {
            agency_service_id: agencyServiceId,
            type,
            description: description || null,
            sale_price,
            cost_price,
            destination: destination || "",
            reference: reference || "",
            tax_21: tax_21 || null,
            tax_105: tax_105 || null,
            exempt: exempt || null,
            other_taxes: other_taxes || null,
            currency,
            departure_date: parsedDepartureDate,
            return_date: parsedReturnDate,
            booking: { connect: { id_booking: Number(booking_id) } },
            agency: { connect: { id_agency: bookingExists.id_agency } },
            operator: { connect: { id_operator: Number(id_operator) } },
            nonComputable: nonComputable || null,
            taxableBase21: taxableBase21 || null,
            taxableBase10_5: taxableBase10_5 || null,
            commissionExempt: commissionExempt || null,
            commission21: commission21 || null,
            commission10_5: commission10_5 || null,
            vatOnCommission21: vatOnCommission21 || null,
            vatOnCommission10_5: vatOnCommission10_5 || null,
            totalCommissionWithoutVAT: totalCommissionWithoutVAT || null,
            impIVA: impIVA || null,
            card_interest: card_interest || null,
            card_interest_21: card_interest_21 || null,
            taxableCardInterest: taxableCardInterest || null,
            vatOnCardInterest: vatOnCardInterest || null,
            transfer_fee_pct: transfer_fee_pct ?? null,
            transfer_fee_amount: transfer_fee_amount ?? null,
            extra_costs_amount: extra_costs_amount ?? null,
            extra_taxes_amount: extra_taxes_amount ?? null,
            extra_adjustments: extra_adjustments ?? null,
          },
          include: { booking: true, operator: true },
        });
      });

      return res.status(201).json(service);
    } catch (error) {
      console.error("Error al crear servicio:", error);
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          return res.status(400).json({
            error: "Datos duplicados detectados en la base de datos.",
          });
        }
      }
      return res.status(500).json({ error: "Error al crear servicio." });
    }
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Método ${req.method} no permitido.`);
  }
}
