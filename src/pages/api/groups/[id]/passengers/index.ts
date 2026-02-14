import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import {
  parseDepartureWhereInput,
  getDeparturePublicId,
  parseGroupWhereInput,
  requireAuth,
} from "@/lib/groups/apiShared";
import { groupApiError } from "@/lib/groups/apiErrors";

function pickParam(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return groupApiError(res, 405, "Método no permitido para esta ruta.", {
      code: "METHOD_NOT_ALLOWED",
      details: `Método recibido: ${req.method ?? "desconocido"}.`,
      solution: "Usá una solicitud GET para consultar pasajeros.",
    });
  }

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const rawGroupId = pickParam(req.query.id);
  if (!rawGroupId) {
    return groupApiError(res, 400, "El identificador de la grupal es inválido.", {
      code: "GROUP_ID_INVALID",
      solution: "Volvé al listado de grupales y abrila nuevamente.",
    });
  }

  const groupWhere = parseGroupWhereInput(rawGroupId, auth.id_agency);
  if (!groupWhere) {
    return groupApiError(res, 404, "No encontramos la grupal solicitada.", {
      code: "GROUP_NOT_FOUND",
      solution: "Revisá que exista y pertenezca a tu agencia.",
    });
  }

  const group = await prisma.travelGroup.findFirst({
    where: groupWhere,
    select: {
      id_travel_group: true,
      name: true,
      status: true,
    },
  });
  if (!group) {
    return groupApiError(res, 404, "No encontramos la grupal solicitada.", {
      code: "GROUP_NOT_FOUND",
      solution: "Revisá que exista y pertenezca a tu agencia.",
    });
  }

  const departureFilterRaw = pickParam(req.query.departureId);
  let departureFilterId: number | null = null;

  if (departureFilterRaw) {
    const departureWhere = parseDepartureWhereInput(
      departureFilterRaw,
      auth.id_agency,
    );
    if (!departureWhere) {
      return groupApiError(res, 404, "La salida indicada es inválida.", {
        code: "DEPARTURE_INVALID",
        solution: "Seleccioná una salida válida de esta grupal.",
      });
    }

    const departure = await prisma.travelGroupDeparture.findFirst({
      where: {
        AND: [
          departureWhere,
          {
            id_agency: auth.id_agency,
            travel_group_id: group.id_travel_group,
          },
        ],
      },
      select: { id_travel_group_departure: true },
    });
    if (!departure) {
      return groupApiError(
        res,
        404,
        "No encontramos esa salida dentro de la grupal.",
        {
          code: "DEPARTURE_NOT_FOUND",
          solution: "Refrescá la pantalla y elegí una salida existente.",
        },
      );
    }

    departureFilterId = departure.id_travel_group_departure;
  }

  try {
    const passengers = await prisma.travelGroupPassenger.findMany({
      where: {
        id_agency: auth.id_agency,
        travel_group_id: group.id_travel_group,
        ...(departureFilterId
          ? { travel_group_departure_id: departureFilterId }
          : {}),
      },
      include: {
        client: {
          select: {
            id_client: true,
            agency_client_id: true,
            first_name: true,
            last_name: true,
            dni_number: true,
            passport_number: true,
            phone: true,
            email: true,
          },
        },
        booking: {
          select: {
            id_booking: true,
            agency_booking_id: true,
            status: true,
            clientStatus: true,
            operatorStatus: true,
            details: true,
            departure_date: true,
            return_date: true,
          },
        },
        travelGroupDeparture: {
          select: {
            id_travel_group_departure: true,
            agency_travel_group_departure_id: true,
            id_agency: true,
            name: true,
            status: true,
            departure_date: true,
            return_date: true,
            capacity_total: true,
          },
        },
      },
      orderBy: [
        { waitlist_position: "asc" },
        { created_at: "asc" },
        { id_travel_group_passenger: "asc" },
      ],
    });

    const bookingIds = Array.from(
      new Set(
        passengers
          .map((item) => item.booking_id)
          .filter((id): id is number => typeof id === "number" && id > 0),
      ),
    );

    const pendingAgg =
      bookingIds.length > 0
        ? await prisma.clientPayment.groupBy({
            by: ["booking_id", "client_id"],
            where: {
              id_agency: auth.id_agency,
              booking_id: { in: bookingIds },
              status: "PENDIENTE",
            },
            _sum: { amount: true },
            _count: { _all: true },
          })
        : [];

    const pendingByPassengerKey = new Map<string, { amount: string; count: number }>();
    for (const row of pendingAgg) {
      pendingByPassengerKey.set(`${row.booking_id}:${row.client_id}`, {
        amount: row._sum.amount?.toString() ?? "0",
        count: row._count._all ?? 0,
      });
    }

    return res.status(200).json({
      group,
      items: passengers.map((item) => ({
        ...item,
        departure_public_id: item.travelGroupDeparture
          ? getDeparturePublicId(item.travelGroupDeparture)
          : null,
        pending_payment:
          item.booking_id && item.client_id
            ? pendingByPassengerKey.get(`${item.booking_id}:${item.client_id}`) ?? {
                amount: "0",
                count: 0,
              }
            : { amount: "0", count: 0 },
      })),
    });
  } catch (error) {
    console.error("[groups][passengers][GET]", error);
    return groupApiError(res, 500, "No pudimos listar los pasajeros de la grupal.", {
      code: "GROUP_PASSENGER_LIST_ERROR",
      solution: "Reintentá en unos segundos.",
    });
  }
}
