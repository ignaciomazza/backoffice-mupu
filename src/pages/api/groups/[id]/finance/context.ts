import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { groupApiError } from "@/lib/groups/apiErrors";
import {
  parseOptionalPositiveInt,
  parseScopeFilter,
  requireGroupFinanceContext,
} from "@/lib/groups/financeShared";

function pickQueryValue(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

async function findBookingIdsForScope(args: {
  agencyId: number;
  groupId: number;
  departureId: number | null | undefined;
}): Promise<number[]> {
  const rows = await prisma.travelGroupPassenger.findMany({
    where: {
      id_agency: args.agencyId,
      travel_group_id: args.groupId,
      booking_id: { not: null },
      ...(args.departureId === null
        ? { travel_group_departure_id: null }
        : typeof args.departureId === "number"
          ? { travel_group_departure_id: args.departureId }
          : {}),
    },
    select: {
      booking_id: true,
    },
  });

  return Array.from(
    new Set(
      rows
        .map((row) => Number(row.booking_id || 0))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  ).sort((a, b) => a - b);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const ctx = await requireGroupFinanceContext(req, res);
  if (!ctx) return;

  const rawBookingId = pickQueryValue(req.query.bookingId);
  const rawPassengerId = pickQueryValue(req.query.passengerId);
  const rawScope = pickQueryValue(req.query.scope);

  const bookingId = parseOptionalPositiveInt(rawBookingId);
  const passengerId = parseOptionalPositiveInt(rawPassengerId);
  const scope = parseScopeFilter(rawScope);

  if (rawBookingId && !bookingId) {
    return groupApiError(res, 400, "El identificador de reserva es inválido.", {
      code: "GROUP_FINANCE_CONTEXT_BOOKING_ID_INVALID",
    });
  }
  if (rawPassengerId && !passengerId) {
    return groupApiError(res, 400, "El identificador del pasajero es inválido.", {
      code: "GROUP_FINANCE_CONTEXT_PASSENGER_ID_INVALID",
    });
  }
  if (rawScope && !scope) {
    return groupApiError(res, 400, "El scope financiero es inválido.", {
      code: "GROUP_FINANCE_SCOPE_INVALID",
      solution: "Usá `group` o `departure:{id}`.",
    });
  }

  let bookingIds: number[] = [];

  if (bookingId) {
    bookingIds = [bookingId];
  } else if (passengerId) {
    const passenger = await prisma.travelGroupPassenger.findFirst({
      where: {
        id_agency: ctx.auth.id_agency,
        travel_group_id: ctx.group.id_travel_group,
        id_travel_group_passenger: passengerId,
      },
      select: {
        booking_id: true,
      },
    });
    if (!passenger) {
      return groupApiError(res, 404, "No encontramos ese pasajero en la grupal.", {
        code: "GROUP_FINANCE_CONTEXT_PASSENGER_NOT_FOUND",
      });
    }
    const passengerBookingId = Number(passenger.booking_id || 0);
    bookingIds =
      Number.isFinite(passengerBookingId) && passengerBookingId > 0
        ? [passengerBookingId]
        : [];
  } else {
    bookingIds = await findBookingIdsForScope({
      agencyId: ctx.auth.id_agency,
      groupId: ctx.group.id_travel_group,
      departureId: scope?.departureId,
    });
  }

  if (bookingIds.length === 0) {
    return groupApiError(
      res,
      404,
      "No encontramos una reserva asociada al contexto financiero de la grupal.",
      {
        code: "GROUP_FINANCE_CONTEXT_BOOKING_NOT_FOUND",
      },
    );
  }

  const booking = await prisma.booking.findFirst({
    where: {
      id_booking: { in: bookingIds },
      id_agency: ctx.auth.id_agency,
      travel_group_id: ctx.group.id_travel_group,
    },
    orderBy: {
      id_booking: "asc",
    },
    include: {
      titular: true,
      user: true,
      agency: true,
      clients: true,
      simple_companions: { include: { category: true } },
      services: { include: { operator: true } },
      invoices: true,
      Receipt: true,
    },
  });

  if (!booking) {
    return groupApiError(
      res,
      404,
      "No encontramos la reserva asociada al contexto de la grupal.",
      {
        code: "GROUP_FINANCE_CONTEXT_BOOKING_NOT_FOUND",
      },
    );
  }

  return res.status(200).json({
    success: true,
    booking,
    scope: scope?.key ?? undefined,
    bookingIds,
  });
}
