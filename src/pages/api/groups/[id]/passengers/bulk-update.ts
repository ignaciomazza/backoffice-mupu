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
  toJsonInput,
  toDistinctPositiveInts,
} from "@/lib/groups/apiShared";
import { groupApiError } from "@/lib/groups/apiErrors";

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

type BulkUpdateBody = {
  passengerIds?: unknown;
  status?: unknown;
  departureId?: unknown;
  clearDeparture?: unknown;
  note?: unknown;
  metadata?: unknown;
};

const LEGACY_GROUP_BOOKING_UNIQUE_INDEX =
  "TravelGroupPassenger_travel_group_id_booking_id_key";
const SHARED_BOOKING_CONTEXT_ERROR = "GROUP_SHARED_BOOKING_CONTEXT_ERROR";

function pickParam(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] : value;
}

function normalizePassengerStatus(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toUpperCase();
  if (!s) return null;
  if (["PENDIENTE", "CONFIRMADO", "LISTA_ESPERA", "CANCELADO", "CANCELADA"].includes(s)) {
    return s === "CANCELADA" ? "CANCELADO" : s;
  }
  return null;
}

const NON_CONFIRMED_PASSENGER_STATUSES = new Set([
  "LISTA_ESPERA",
  "CANCELADO",
  "CANCELADA",
]);

function isConfirmedPassengerStatus(value: unknown): boolean {
  const normalized =
    normalizePassengerStatus(value) ??
    (typeof value === "string" ? value.trim().toUpperCase() : "");
  if (!normalized) return false;
  return !NON_CONFIRMED_PASSENGER_STATUSES.has(normalized);
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
  groupName: string;
  departureId: number | null;
  departureDate: Date;
  returnDate: Date;
  departureName: string | null;
  userId: number;
  titularClientId: number;
  matchTitularClientId?: number | null;
};

async function ensureGroupBookingContext({
  tx,
  agencyId,
  groupId,
  groupName,
  departureId,
  departureDate,
  returnDate,
  departureName,
  userId,
  titularClientId,
  matchTitularClientId,
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
      clientStatus: "Pendiente",
      operatorStatus: "Pendiente",
      status: "Abierta",
      details: `Grupal ${groupName} · ${departureName || "Sin salida"}`.slice(0, 300),
      invoice_type: "B",
      invoice_observation: null,
      observation: "Reserva de contexto creada al normalizar pasajeros de grupal.",
      id_user: userId,
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
      solution: "Usá una solicitud POST para actualizar pasajeros.",
    });
  }

  const auth = await requireAuth(req, res);
  if (!auth) return;
  if (!canWriteGroups(auth.role)) {
    return groupApiError(res, 403, "No tenés permisos para editar pasajeros.", {
      code: "GROUP_PASSENGER_UPDATE_FORBIDDEN",
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
    select: {
      id_travel_group: true,
      name: true,
      status: true,
      start_date: true,
      end_date: true,
      capacity_total: true,
      allow_overbooking: true,
      overbooking_limit: true,
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
      "No se pueden editar pasajeros en grupales cerradas o canceladas.",
      {
        code: "GROUP_LOCKED",
        solution: "Cambiá el estado de la grupal antes de editar pasajeros.",
      },
    );
  }

  const body = (req.body ?? {}) as BulkUpdateBody;
  const passengerIds = toDistinctPositiveInts(body.passengerIds);
  if (passengerIds.length === 0) {
    return groupApiError(res, 400, "No se enviaron pasajeros válidos.", {
      code: "GROUP_PASSENGER_IDS_INVALID",
      solution: "Seleccioná al menos un pasajero y volvé a intentar.",
    });
  }

  const passengers = await prisma.travelGroupPassenger.findMany({
    where: {
      id_agency: auth.id_agency,
      travel_group_id: group.id_travel_group,
      id_travel_group_passenger: { in: passengerIds },
    },
    select: {
      id_travel_group_passenger: true,
      booking_id: true,
      client_id: true,
      status: true,
      travel_group_departure_id: true,
      metadata: true,
    },
    orderBy: { id_travel_group_passenger: "asc" },
  });
  if (passengers.length !== passengerIds.length) {
    return groupApiError(
      res,
      404,
      "Alguno de los pasajeros seleccionados no pertenece a la grupal.",
      {
        code: "GROUP_PASSENGER_NOT_FOUND",
        solution: "Refrescá la lista y volvé a seleccionar los pasajeros.",
      },
    );
  }

  const nextStatus =
    body.status !== undefined ? normalizePassengerStatus(body.status) : null;
  if (body.status !== undefined && !nextStatus) {
    return groupApiError(res, 400, "El estado de pasajero no es válido.", {
      code: "GROUP_PASSENGER_STATUS_INVALID",
      solution: "Usá uno de estos estados: Pendiente, Confirmado, Lista de espera o Cancelado.",
    });
  }

  const clearDeparture = body.clearDeparture === true;
  let departure:
    | {
        id_travel_group_departure: number;
        departure_date: Date;
        return_date: Date | null;
      }
    | null
    | undefined = undefined;

  if (body.departureId !== undefined && body.departureId !== null && body.departureId !== "") {
    const departureWhere = parseDepartureWhereInput(
      String(body.departureId),
      auth.id_agency,
    );
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
  } else if (clearDeparture) {
    departure = null;
  }

  const note = parseOptionalString(body.note, 1000);
  if (note === undefined) {
    return groupApiError(res, 400, "La nota enviada es inválida.", {
      code: "GROUP_PASSENGER_NOTE_INVALID",
      solution: "Ingresá una nota de hasta 1000 caracteres o dejala vacía.",
    });
  }
  const metadataInput =
    body.metadata !== undefined ? toJsonInput(body.metadata) : undefined;
  if (metadataInput === undefined && body.metadata !== undefined) {
    return groupApiError(res, 400, "Los datos adicionales son inválidos.", {
      code: "GROUP_PASSENGER_METADATA_INVALID",
      solution: "Enviá un objeto JSON válido en metadata.",
    });
  }

  const projectedByScope = new Map<
    string,
    { departureId: number | null; addCount: number }
  >();
  for (const passenger of passengers) {
    const targetStatus = nextStatus ?? passenger.status;
    if (!isConfirmedPassengerStatus(targetStatus)) continue;

    const targetDepartureId =
      departure !== undefined
        ? departure?.id_travel_group_departure ?? null
        : passenger.travel_group_departure_id ?? null;
    const scopeKey = targetDepartureId == null ? "group" : `departure:${targetDepartureId}`;
    const current = projectedByScope.get(scopeKey);
    if (current) {
      current.addCount += 1;
    } else {
      projectedByScope.set(scopeKey, {
        departureId: targetDepartureId,
        addCount: 1,
      });
    }
  }

  if (projectedByScope.size > 0) {
    const departureIds = Array.from(
      new Set(
        Array.from(projectedByScope.values())
          .map((item) => item.departureId)
          .filter((id): id is number => typeof id === "number"),
      ),
    );

    const departureConfigs =
      departureIds.length > 0
        ? await prisma.travelGroupDeparture.findMany({
            where: {
              id_agency: auth.id_agency,
              travel_group_id: group.id_travel_group,
              id_travel_group_departure: { in: departureIds },
            },
            select: {
              id_travel_group_departure: true,
              name: true,
              capacity_total: true,
              allow_overbooking: true,
              overbooking_limit: true,
            },
          })
        : [];

    if (departureConfigs.length !== departureIds.length) {
      return groupApiError(
        res,
        404,
        "No se pudo validar capacidad porque alguna salida ya no existe.",
        {
          code: "DEPARTURE_NOT_FOUND",
          solution: "Refrescá la pantalla y volvé a intentar.",
        },
      );
    }

    const departureById = new Map(
      departureConfigs.map((item) => [item.id_travel_group_departure, item]),
    );

    const scopeChecks = await Promise.all(
      Array.from(projectedByScope.entries()).map(async ([scopeKey, scope]) => {
        const baseCount = await prisma.travelGroupPassenger.count({
          where: {
            id_agency: auth.id_agency,
            travel_group_id: group.id_travel_group,
            id_travel_group_passenger: { notIn: passengerIds },
            status: { notIn: ["LISTA_ESPERA", "CANCELADO", "CANCELADA"] },
            ...(scope.departureId == null
              ? {}
              : { travel_group_departure_id: scope.departureId }),
          },
        });

        return { scopeKey, scope, baseCount };
      }),
    );

    for (const check of scopeChecks) {
      const dep = check.scope.departureId
        ? departureById.get(check.scope.departureId)
        : null;

      const capacityBase = dep?.capacity_total ?? group.capacity_total;
      const allowOverbooking = dep?.allow_overbooking ?? group.allow_overbooking;
      const overbookingLimit = dep?.overbooking_limit ?? group.overbooking_limit ?? 0;
      const maxSellable =
        capacityBase == null
          ? Number.POSITIVE_INFINITY
          : capacityBase + (allowOverbooking ? overbookingLimit : 0);
      const projectedConfirmed = check.baseCount + check.scope.addCount;

      if (projectedConfirmed > maxSellable) {
        const scopeLabel = dep ? `salida ${dep.name}` : "grupal (sin salida)";
        return groupApiError(
          res,
          409,
          `Sin capacidad para ${scopeLabel}. Confirmados proyectados: ${projectedConfirmed}, máximo permitido: ${maxSellable}.`,
          {
            code: "GROUP_CAPACITY_EXCEEDED",
            solution:
              "Reducí la cantidad de pasajeros seleccionados o habilitá más cupo/sobreventa.",
          },
        );
      }
    }
  }

  const departureSeeds = await prisma.travelGroupDeparture.findMany({
    where: {
      id_agency: auth.id_agency,
      travel_group_id: group.id_travel_group,
    },
    select: {
      id_travel_group_departure: true,
      name: true,
      departure_date: true,
      return_date: true,
    },
  });
  const departureSeedById = new Map(
    departureSeeds.map((item) => [item.id_travel_group_departure, item]),
  );

  const resolveContextDates = (targetDepartureId: number | null) => {
    if (
      targetDepartureId != null &&
      Number.isFinite(targetDepartureId) &&
      departureSeedById.has(targetDepartureId)
    ) {
      const seed = departureSeedById.get(targetDepartureId)!;
      return {
        departureDate: seed.departure_date,
        returnDate:
          seed.return_date ??
          seed.departure_date ??
          group.start_date ??
          new Date(),
        departureName: seed.name ?? null,
      };
    }
    return {
      departureDate: group.start_date ?? new Date(),
      returnDate:
        group.end_date ??
        group.start_date ??
        new Date(),
      departureName: null as string | null,
    };
  };

  try {
    const waitlistBase =
      nextStatus === "LISTA_ESPERA"
        ? await prisma.travelGroupPassenger.aggregate({
            where: {
              id_agency: auth.id_agency,
              travel_group_id: group.id_travel_group,
              status: "LISTA_ESPERA",
              id_travel_group_passenger: { notIn: passengerIds },
            },
            _max: { waitlist_position: true },
          })
        : { _max: { waitlist_position: null as number | null } };

    let waitlistPos = (waitlistBase._max.waitlist_position ?? 0) + 1;

    const updatedAtIso = new Date().toISOString();

    await prisma.$transaction(async (tx) => {
      await dropLegacyPassengerBookingUniqueIndex(tx);

      const contextBookingCache = new Map<string, number>();
      const touchedBookingIds = new Set<number>();

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

      for (const passenger of passengers) {
        const data: Prisma.TravelGroupPassengerUncheckedUpdateInput = {};
        const targetDepartureId =
          departure !== undefined
            ? departure?.id_travel_group_departure ?? null
            : passenger.travel_group_departure_id ?? null;

        if (nextStatus) {
          data.status = nextStatus;
          if (nextStatus === "LISTA_ESPERA") {
            data.waitlist_position = waitlistPos;
            waitlistPos += 1;
          } else {
            data.waitlist_position = null;
          }
        }

        if (departure !== undefined) {
          data.travel_group_departure_id = targetDepartureId;
        }

        let targetBookingId =
          typeof passenger.booking_id === "number" && passenger.booking_id > 0
            ? passenger.booking_id
            : null;

        if (
          typeof passenger.client_id === "number" &&
          passenger.client_id > 0
        ) {
          const scopeKey =
            targetDepartureId == null ? "group" : `departure:${targetDepartureId}`;
          const cachedBookingId = contextBookingCache.get(scopeKey);
          if (cachedBookingId) {
            targetBookingId = cachedBookingId;
          } else {
            const contextDates = resolveContextDates(targetDepartureId);
            const resolvedBookingId = await ensureGroupBookingContext({
              tx,
              agencyId: auth.id_agency,
              groupId: group.id_travel_group,
              groupName: group.name,
              departureId: targetDepartureId,
              departureDate: contextDates.departureDate,
              returnDate: contextDates.returnDate,
              departureName: contextDates.departureName,
              userId: auth.id_user,
              titularClientId: passenger.client_id,
              matchTitularClientId: null,
            });
            contextBookingCache.set(scopeKey, resolvedBookingId);
            targetBookingId = resolvedBookingId;
          }
        }

        if (
          targetBookingId &&
          typeof passenger.client_id === "number" &&
          passenger.client_id > 0
        ) {
          await ensureClientLinkedToBooking(targetBookingId, passenger.client_id);
        }

        if (targetBookingId !== passenger.booking_id) {
          data.booking_id = targetBookingId;
        }

        if (note !== undefined || metadataInput !== undefined) {
          const merged =
            passenger.metadata &&
            typeof passenger.metadata === "object" &&
            !Array.isArray(passenger.metadata)
              ? ({
                  ...(passenger.metadata as Prisma.JsonObject),
                } as Record<string, Prisma.InputJsonValue>)
              : ({} as Record<string, Prisma.InputJsonValue>);

          merged.updated_by = auth.id_user;
          merged.updated_at = updatedAtIso;

          if (note !== undefined) {
            if (note === null) {
              delete merged.note;
            } else {
              merged.note = note;
            }
          }

          if (metadataInput !== undefined) {
            if (metadataInput === null) {
              delete merged.payload;
            } else {
              merged.payload = metadataInput;
            }
          }

          data.metadata = merged as Prisma.InputJsonObject;
        }

        const finalBookingId = targetBookingId;

        try {
          await tx.travelGroupPassenger.update({
            where: {
              id_travel_group_passenger: passenger.id_travel_group_passenger,
            },
            data,
          });
        } catch (error) {
          if (
            !isPassengerBookingUniqueConstraintError(error) ||
            typeof passenger.client_id !== "number" ||
            passenger.client_id <= 0
          ) {
            throw error;
          }
          throw new Error(SHARED_BOOKING_CONTEXT_ERROR);
        }

        if (typeof passenger.booking_id === "number" && passenger.booking_id > 0) {
          touchedBookingIds.add(passenger.booking_id);
        }
        if (finalBookingId) {
          touchedBookingIds.add(finalBookingId);
        }
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
          data: { pax_count: Math.max(paxCount, 0) },
        });
      }
    });

    return res.status(200).json({
      ok: true,
      updated_count: passengers.length,
      applied: {
        status: nextStatus ?? null,
        departure_id:
          departure === undefined
            ? undefined
            : departure?.id_travel_group_departure ?? null,
        note: note ?? null,
      },
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
    console.error("[groups][passengers][bulk-update]", error);
    return groupApiError(res, 500, "No pudimos actualizar los pasajeros.", {
      code: "GROUP_PASSENGER_UPDATE_ERROR",
      solution: "Reintentá en unos segundos.",
    });
  }
}
