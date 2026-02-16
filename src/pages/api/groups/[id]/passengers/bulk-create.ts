import type { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import {
  canWriteGroups,
  isLockedGroupStatus,
  parseDepartureWhereInput,
  parseGroupWhereInput,
  parseOptionalString,
  requireAuth,
  toDistinctPositiveInts,
} from "@/lib/groups/apiShared";
import { groupApiError } from "@/lib/groups/apiErrors";

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

type BulkCreateBody = {
  departureId?: unknown;
  clientIds?: unknown;
  assignToUserId?: unknown;
  bookingDefaults?: {
    status?: unknown;
    clientStatus?: unknown;
    operatorStatus?: unknown;
    invoice_type?: unknown;
    details_prefix?: unknown;
  };
};

const LEGACY_GROUP_BOOKING_UNIQUE_INDEX =
  "TravelGroupPassenger_travel_group_id_booking_id_key";
const SHARED_BOOKING_CONTEXT_ERROR = "GROUP_SHARED_BOOKING_CONTEXT_ERROR";

function pickParam(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] : value;
}

function toDateOrNow(
  departureDate?: Date | null,
  groupDate?: Date | null,
): Date {
  return departureDate ?? groupDate ?? new Date();
}

function isPassengerBookingUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;
  const rawTarget = (error.meta as { target?: unknown } | undefined)?.target;
  const fields = Array.isArray(rawTarget)
    ? rawTarget.map((item) => String(item))
    : typeof rawTarget === "string"
      ? [rawTarget]
      : [];
  if (fields.includes("travel_group_id") && fields.includes("booking_id")) {
    return true;
  }
  const targetAsString = fields.join(" ").toLowerCase();
  if (
    targetAsString.includes("travel_group_id") &&
    targetAsString.includes("booking_id")
  ) {
    return true;
  }
  const message = String(error.message || "").toLowerCase();
  return (
    message.includes("travel_group_id") && message.includes("booking_id")
  );
}

async function dropLegacyPassengerBookingUniqueIndex(tx: TxClient) {
  try {
    await tx.$executeRawUnsafe(
      `DROP INDEX IF EXISTS "${LEGACY_GROUP_BOOKING_UNIQUE_INDEX}"`,
    );
  } catch {
    throw new Error(SHARED_BOOKING_CONTEXT_ERROR);
  }
}

type EnsureGroupBookingContextArgs = {
  tx: TxClient;
  agencyId: number;
  groupId: number;
  departureId: number | null;
  departureDate: Date;
  returnDate: Date;
  detailsPrefix: string;
  bookingStatus: string;
  bookingClientStatus: string;
  bookingOperatorStatus: string;
  bookingInvoiceType: string;
  assignToUserId: number;
  titularClientId: number;
  matchTitularClientId?: number | null;
  departureName: string | null;
};

async function ensureGroupBookingContext({
  tx,
  agencyId,
  groupId,
  departureId,
  departureDate,
  returnDate,
  detailsPrefix,
  bookingStatus,
  bookingClientStatus,
  bookingOperatorStatus,
  bookingInvoiceType,
  assignToUserId,
  titularClientId,
  matchTitularClientId,
  departureName,
}: EnsureGroupBookingContextArgs): Promise<number> {
  const bookingWhere: Prisma.BookingWhereInput = {
    id_agency: agencyId,
    travel_group_id: groupId,
    travel_group_departure_id: departureId,
  };
  if (
    typeof matchTitularClientId === "number" &&
    Number.isFinite(matchTitularClientId) &&
    matchTitularClientId > 0
  ) {
    bookingWhere.titular_id = matchTitularClientId;
  }

  const existing = await tx.booking.findFirst({
    where: bookingWhere,
    orderBy: [{ creation_date: "asc" }, { id_booking: "asc" }],
    select: { id_booking: true },
  });
  if (existing?.id_booking) return existing.id_booking;

  const agencyBookingId = await getNextAgencyCounter(tx, agencyId, "booking");
  const created = await tx.booking.create({
    data: {
      agency_booking_id: agencyBookingId,
      clientStatus: bookingClientStatus,
      operatorStatus: bookingOperatorStatus,
      status: bookingStatus,
      details: `${detailsPrefix} · ${departureName || "Sin salida"}`.slice(0, 300),
      invoice_type: bookingInvoiceType,
      invoice_observation: null,
      observation: "Reserva de contexto creada para grupal/salida.",
      id_user: assignToUserId,
      id_agency: agencyId,
      titular_id: titularClientId,
      departure_date: departureDate,
      return_date: returnDate,
      pax_count: 1,
      travel_group_id: groupId,
      travel_group_departure_id: departureId,
    },
    select: { id_booking: true },
  });
  return created.id_booking;
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

  const canAssignOtherUser = ["desarrollador", "gerente", "administrativo", "lider"].includes(
    String(auth.role || "").toLowerCase(),
  );
  let assignToUserId = auth.id_user;
  if (canAssignOtherUser && body.assignToUserId != null) {
    const parsed = Number(body.assignToUserId);
    if (Number.isFinite(parsed) && parsed > 0) {
      const user = await prisma.user.findFirst({
        where: { id_user: Math.trunc(parsed), id_agency: auth.id_agency },
        select: { id_user: true },
      });
      if (!user) {
        return groupApiError(
          res,
          400,
          "El usuario asignado no es válido para esta agencia.",
          {
            code: "ASSIGN_USER_INVALID",
            solution: "Seleccioná un usuario existente de la misma agencia.",
          },
        );
      }
      assignToUserId = user.id_user;
    }
  }

  const bookingStatus =
    parseOptionalString(body.bookingDefaults?.status, 40) ?? "Abierta";
  const bookingClientStatus =
    parseOptionalString(body.bookingDefaults?.clientStatus, 40) ?? "Pendiente";
  const bookingOperatorStatus =
    parseOptionalString(body.bookingDefaults?.operatorStatus, 40) ?? "Pendiente";
  const bookingInvoiceType =
    parseOptionalString(body.bookingDefaults?.invoice_type, 10) ?? "B";
  const detailsPrefix =
    parseOptionalString(body.bookingDefaults?.details_prefix, 120) ??
    `Grupal ${group.name}`;

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

  const departureDate = toDateOrNow(departure?.departure_date, group.start_date);
  const returnDate = toDateOrNow(departure?.return_date, group.end_date);

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
    booking_id: number;
    passenger_id: number;
    status: string;
    waitlist_position: number | null;
  }> = [];
  const skipped: Array<{ client_id: number; reason: string }> = [];

  try {
    await prisma.$transaction(async (tx) => {
      await dropLegacyPassengerBookingUniqueIndex(tx);

      const touchedBookingIds = new Set<number>();
      let sharedContextBookingId: number | null = null;

      const ensureClientLinkedToBooking = async (
        bookingId: number,
        clientId: number,
      ) => {
        const alreadyLinked = await tx.booking.findFirst({
          where: {
            id_booking: bookingId,
            OR: [
              { titular_id: clientId },
              { clients: { some: { id_client: clientId } } },
            ],
          },
          select: { id_booking: true },
        });
        if (alreadyLinked) return;
        await tx.booking.update({
          where: { id_booking: bookingId },
          data: {
            clients: {
              connect: { id_client: clientId },
            },
          },
        });
      };

      for (const item of toCreate) {
        if (item.kind === "skip") {
          skipped.push({ client_id: item.clientId, reason: item.reason });
          continue;
        }

        if (!sharedContextBookingId) {
          sharedContextBookingId = await ensureGroupBookingContext({
            tx,
            agencyId: auth.id_agency,
            groupId: group.id_travel_group,
            departureId: departure?.id_travel_group_departure ?? null,
            departureDate,
            returnDate,
            detailsPrefix,
            bookingStatus,
            bookingClientStatus,
            bookingOperatorStatus,
            bookingInvoiceType,
            assignToUserId,
            titularClientId: item.client.id_client,
            matchTitularClientId: null,
            departureName: departure?.name ?? null,
          });
        }
        if (!sharedContextBookingId) {
          throw new Error("No pudimos resolver la reserva técnica de contexto.");
        }
        const contextBookingId = sharedContextBookingId;

        await ensureClientLinkedToBooking(contextBookingId, item.client.id_client);

        const createPassengerForBooking = async (bookingId: number) => {
          const agencyPassengerId = await getNextAgencyCounter(
            tx,
            auth.id_agency,
            "travel_group_passenger",
          );
          return tx.travelGroupPassenger.create({
            data: {
              agency_travel_group_passenger_id: agencyPassengerId,
              id_agency: auth.id_agency,
              travel_group_id: group.id_travel_group,
              travel_group_departure_id:
                departure?.id_travel_group_departure ?? null,
              booking_id: bookingId,
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
        };

        let passenger;
        try {
          passenger = await createPassengerForBooking(contextBookingId);
        } catch (error) {
          if (!isPassengerBookingUniqueConstraintError(error)) {
            throw error;
          }
          throw new Error(SHARED_BOOKING_CONTEXT_ERROR);
        }

        created.push({
          client_id: item.client.id_client,
          booking_id: contextBookingId,
          passenger_id: passenger.id_travel_group_passenger,
          status: item.passengerStatus,
          waitlist_position: item.waitlist_position,
        });
        touchedBookingIds.add(contextBookingId);
      }

      for (const bookingId of touchedBookingIds) {
        const paxCount = await tx.travelGroupPassenger.count({
          where: {
            id_agency: auth.id_agency,
            travel_group_id: group.id_travel_group,
            booking_id: bookingId,
          },
        });
        await tx.booking.update({
          where: { id_booking: bookingId },
          data: { pax_count: Math.max(paxCount, 1) },
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
    if (
      error instanceof Error &&
      error.message.includes(SHARED_BOOKING_CONTEXT_ERROR)
    ) {
      return groupApiError(
        res,
        409,
        "Detectamos una restricción legada que impide compartir contexto por salida. Ejecutá la migración que elimina el índice único de pasajeros por reserva y reintentá.",
        {
          code: "GROUP_SHARED_BOOKING_CONTEXT_BLOCKED",
          solution:
            "Aplicá la migración `20260622150000_allow_shared_group_booking_context` en la misma base donde corre la API.",
        },
      );
    }
    console.error("[groups][passengers][bulk-create]", error);
    return groupApiError(res, 500, "No pudimos crear los pasajeros.", {
      code: "GROUP_PASSENGER_CREATE_ERROR",
      solution: "Reintentá en unos segundos.",
    });
  }
}
