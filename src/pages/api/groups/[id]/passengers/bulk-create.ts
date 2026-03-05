import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import {
  canWriteGroups,
  isLockedGroupStatus,
  parseDepartureWhereInput,
  parseGroupWhereInput,
  requireAuth,
  toDistinctPositiveInts,
} from "@/lib/groups/apiShared";
import { groupApiError } from "@/lib/groups/apiErrors";

type BulkCreateBody = {
  departureId?: unknown;
  clientIds?: unknown;
  assignToUserId?: unknown;
};

function pickParam(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return groupApiError(res, 405, "Método no permitido para esta ruta.", {
      code: "METHOD_NOT_ALLOWED",
      details: `Método recibido: ${req.method ?? "desconocido"}.`,
      solution: "Usá una solicitud POST para cargar pasajeros.",
    });
  }

  const auth = await requireAuth(req, res);
  if (!auth) return;
  if (!canWriteGroups(auth.role)) {
    return groupApiError(res, 403, "No tenés permisos para cargar pasajeros.", {
      code: "GROUP_PASSENGER_CREATE_FORBIDDEN",
      solution: "Solicitá permisos de edición de grupales a un administrador.",
    });
  }

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
    include: {
      departures: {
        orderBy: [{ departure_date: "asc" }, { id_travel_group_departure: "asc" }],
      },
    },
  });
  if (!group) {
    return groupApiError(res, 404, "No encontramos la grupal solicitada.", {
      code: "GROUP_NOT_FOUND",
      solution: "Revisá que exista y pertenezca a tu agencia.",
    });
  }
  if (isLockedGroupStatus(group.status)) {
    return groupApiError(
      res,
      409,
      "No se pueden cargar pasajeros en una grupal cerrada o cancelada.",
      {
        code: "GROUP_LOCKED",
        solution: "Cambiá el estado de la grupal antes de cargar pasajeros.",
      },
    );
  }

  const body = (req.body ?? {}) as BulkCreateBody;
  const clientIds = toDistinctPositiveInts(body.clientIds);
  if (clientIds.length === 0) {
    return groupApiError(res, 400, "No se enviaron clientes válidos.", {
      code: "CLIENT_IDS_INVALID",
      solution: "Ingresá uno o más IDs de clientes válidos.",
    });
  }

  let departure:
    | {
        id_travel_group_departure: number;
        name: string;
        departure_date: Date;
        return_date: Date | null;
        capacity_total: number | null;
        allow_overbooking: boolean | null;
        overbooking_limit: number | null;
        waitlist_enabled: boolean | null;
        waitlist_limit: number | null;
      }
    | null = null;

  if (body.departureId !== undefined && body.departureId !== null && body.departureId !== "") {
    const rawDepartureId = String(body.departureId);
    const departureWhere = parseDepartureWhereInput(rawDepartureId, auth.id_agency);
    if (!departureWhere) {
      return groupApiError(res, 404, "La salida indicada es inválida.", {
        code: "DEPARTURE_INVALID",
        solution: "Seleccioná una salida válida de esta grupal.",
      });
    }
    departure = await prisma.travelGroupDeparture.findFirst({
      where: {
        AND: [
          departureWhere,
          {
            id_agency: auth.id_agency,
            travel_group_id: group.id_travel_group,
          },
        ],
      },
      select: {
        id_travel_group_departure: true,
        name: true,
        departure_date: true,
        return_date: true,
        capacity_total: true,
        allow_overbooking: true,
        overbooking_limit: true,
        waitlist_enabled: true,
        waitlist_limit: true,
      },
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
  } else if (group.departures.length === 1) {
    const only = group.departures[0];
    departure = {
      id_travel_group_departure: only.id_travel_group_departure,
      name: only.name,
      departure_date: only.departure_date,
      return_date: only.return_date,
      capacity_total: only.capacity_total,
      allow_overbooking: only.allow_overbooking,
      overbooking_limit: only.overbooking_limit,
      waitlist_enabled: only.waitlist_enabled,
      waitlist_limit: only.waitlist_limit,
    };
  }

  const clients = await prisma.client.findMany({
    where: { id_agency: auth.id_agency, id_client: { in: clientIds } },
    select: {
      id_client: true,
      first_name: true,
      last_name: true,
    },
  });
  const clientsById = new Map(clients.map((c) => [c.id_client, c]));

  const existingByClient = await prisma.travelGroupPassenger.findMany({
    where: {
      id_agency: auth.id_agency,
      travel_group_id: group.id_travel_group,
      client_id: { in: clientIds },
    },
    select: { client_id: true },
  });
  const existingClientSet = new Set(
    existingByClient
      .map((item) => item.client_id)
      .filter((id): id is number => typeof id === "number" && id > 0),
  );

  const scopeWhere = departure
    ? {
        id_agency: auth.id_agency,
        travel_group_id: group.id_travel_group,
        travel_group_departure_id: departure.id_travel_group_departure,
      }
    : {
        id_agency: auth.id_agency,
        travel_group_id: group.id_travel_group,
      };

  const [confirmedCountInitial, waitlistCountInitial] = await Promise.all([
    prisma.travelGroupPassenger.count({
      where: {
        ...scopeWhere,
        status: { notIn: ["LISTA_ESPERA", "CANCELADO", "CANCELADA"] },
      },
    }),
    prisma.travelGroupPassenger.count({
      where: { ...scopeWhere, status: "LISTA_ESPERA" },
    }),
  ]);

  let confirmedCount = confirmedCountInitial;
  let waitlistCount = waitlistCountInitial;

  const capacityBase = departure?.capacity_total ?? group.capacity_total;
  const allowOverbooking =
    departure?.allow_overbooking ?? group.allow_overbooking;
  const overbookingLimit =
    departure?.overbooking_limit ?? group.overbooking_limit ?? 0;
  const waitlistEnabled = departure?.waitlist_enabled ?? group.waitlist_enabled;
  const waitlistLimit = departure?.waitlist_limit ?? group.waitlist_limit;

  const maxSellable =
    capacityBase == null
      ? Number.POSITIVE_INFINITY
      : capacityBase + (allowOverbooking ? overbookingLimit : 0);

  const toCreate = clientIds.map((clientId) => {
    const client = clientsById.get(clientId);
    if (!client) {
      return { kind: "skip" as const, reason: "CLIENTE_INVALIDO", clientId };
    }
    if (existingClientSet.has(clientId)) {
      return { kind: "skip" as const, reason: "DUPLICADO", clientId };
    }

    if (confirmedCount < maxSellable) {
      confirmedCount += 1;
      return {
        kind: "create" as const,
        client,
        passengerStatus: "CONFIRMADO",
        waitlist_position: null as number | null,
      };
    }

    if (waitlistEnabled) {
      if (waitlistLimit != null && waitlistCount >= waitlistLimit) {
        return { kind: "skip" as const, reason: "LISTA_ESPERA_LLENA", clientId };
      }
      waitlistCount += 1;
      return {
        kind: "create" as const,
        client,
        passengerStatus: "LISTA_ESPERA",
        waitlist_position: waitlistCount,
      };
    }

    return { kind: "skip" as const, reason: "SIN_CAPACIDAD", clientId };
  });

  const created: Array<{
    client_id: number;
    booking_id: number | null;
    passenger_id: number;
    status: string;
    waitlist_position: number | null;
  }> = [];
  const skipped: Array<{ client_id: number; reason: string }> = [];

  try {
    await prisma.$transaction(async (tx) => {
      for (const item of toCreate) {
        if (item.kind === "skip") {
          skipped.push({ client_id: item.clientId, reason: item.reason });
          continue;
        }

        const agencyPassengerId = await getNextAgencyCounter(
          tx,
          auth.id_agency,
          "travel_group_passenger",
        );
        const passenger = await tx.travelGroupPassenger.create({
          data: {
            agency_travel_group_passenger_id: agencyPassengerId,
            id_agency: auth.id_agency,
            travel_group_id: group.id_travel_group,
            travel_group_departure_id:
              departure?.id_travel_group_departure ?? null,
            booking_id: null,
            client_id: item.client.id_client,
            status: item.passengerStatus,
            waitlist_position: item.waitlist_position,
            metadata: {
              source: "bulk-create",
              created_by: auth.id_user,
            },
          },
          select: { id_travel_group_passenger: true },
        });

        created.push({
          client_id: item.client.id_client,
          booking_id: null,
          passenger_id: passenger.id_travel_group_passenger,
          status: item.passengerStatus,
          waitlist_position: item.waitlist_position,
        });
      }
    });

    return res.status(201).json({
      group_id: group.id_travel_group,
      departure_id: departure?.id_travel_group_departure ?? null,
      created_count: created.length,
      waitlist_count: created.filter((item) => item.status === "LISTA_ESPERA").length,
      confirmed_count: created.filter((item) => item.status === "CONFIRMADO").length,
      skipped_count: skipped.length,
      created,
      skipped,
    });
  } catch (error) {
    console.error("[groups][passengers][bulk-create]", error);
    return groupApiError(res, 500, "No pudimos crear los pasajeros.", {
      code: "GROUP_PASSENGER_CREATE_ERROR",
      solution: "Reintentá en unos segundos.",
    });
  }
}
