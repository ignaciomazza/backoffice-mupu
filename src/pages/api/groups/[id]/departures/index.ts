import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import {
  canWriteGroups,
  getDeparturePublicId,
  isLockedGroupStatus,
  normalizeGroupStatus,
  parseGroupWhereInput,
  parseOptionalBoolean,
  parseOptionalDate,
  parseOptionalInt,
  parseOptionalString,
  requireAuth,
  toJsonInput,
} from "@/lib/groups/apiShared";
import { groupApiError } from "@/lib/groups/apiErrors";

function parseGroupIdParam(idParam: string | string[] | undefined): string | null {
  if (!idParam) return null;
  return Array.isArray(idParam) ? idParam[0] : idParam;
}

function getKnownErrorMetaString(
  error: Prisma.PrismaClientKnownRequestError,
  key: string,
): string {
  const meta = error.meta;
  if (!meta || typeof meta !== "object") return "";
  const value = (meta as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function isMissingBookingGroupColumnError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2022") return false;
  const column = getKnownErrorMetaString(error, "column").toLowerCase();
  return (
    column.includes("booking.travel_group_id") ||
    column.includes("booking.travel_group_departure_id")
  );
}

type DepartureCount = {
  passengers: number;
  inventories: number;
  bookings?: number;
};

type DepartureRow = {
  id_travel_group_departure: number;
  id_agency: number;
  agency_travel_group_departure_id: number | null;
  _count: DepartureCount;
} & Record<string, unknown>;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const rawGroupId = parseGroupIdParam(req.query.id);
  if (!rawGroupId) {
    return groupApiError(res, 400, "El identificador de la grupal es inválido.", {
      code: "GROUP_ID_INVALID",
      solution: "Volvé al listado e ingresá nuevamente a la grupal.",
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
    select: { id_travel_group: true, status: true },
  });
  if (!group) {
    return groupApiError(res, 404, "No encontramos la grupal solicitada.", {
      code: "GROUP_NOT_FOUND",
      solution: "Revisá que exista y pertenezca a tu agencia.",
    });
  }

  if (req.method === "GET") {
    try {
      const baseQuery = {
        where: {
          id_agency: auth.id_agency,
          travel_group_id: group.id_travel_group,
        },
        orderBy: [
          { departure_date: "asc" },
          { id_travel_group_departure: "asc" },
        ],
      } satisfies Omit<Prisma.TravelGroupDepartureFindManyArgs, "include">;

      let partialBookingLink = false;
      let rows: DepartureRow[] = [];

      try {
        rows = await prisma.travelGroupDeparture.findMany({
          ...baseQuery,
          include: {
            _count: {
              select: {
                bookings: true,
                passengers: true,
                inventories: true,
              },
            },
          },
        });
      } catch (error) {
        if (!isMissingBookingGroupColumnError(error)) {
          throw error;
        }
        partialBookingLink = true;
        rows = await prisma.travelGroupDeparture.findMany({
          ...baseQuery,
          include: {
            _count: {
              select: {
                passengers: true,
                inventories: true,
              },
            },
          },
        });
      }

      const items = rows.map((row) => ({
        ...row,
        _count: {
          passengers: row._count.passengers ?? 0,
          inventories: row._count.inventories ?? 0,
          bookings: row._count.bookings ?? 0,
        },
        public_id: getDeparturePublicId(row),
      }));

      if (!partialBookingLink) {
        return res.status(200).json(items);
      }

      return res.status(200).json({
        items,
        code: "GROUP_BOOKING_LINK_PARTIAL",
        warning:
          "Las salidas se listan sin conteo de reservas porque falta la migración de vinculación con Booking.",
        solution:
          "Aplicá la migración pendiente de reservas para habilitar ese conteo.",
      });
    } catch (error) {
      console.error("[groups][departures][GET]", error);
      return groupApiError(res, 500, "No pudimos listar las salidas de la grupal.", {
        code: "GROUP_DEPARTURE_LIST_ERROR",
        solution: "Reintentá en unos segundos.",
      });
    }
  }

  if (req.method === "POST") {
    if (!canWriteGroups(auth.role)) {
      return groupApiError(res, 403, "No tenés permisos para crear salidas.", {
        code: "GROUP_DEPARTURE_CREATE_FORBIDDEN",
        solution: "Solicitá permisos de edición de grupales a un administrador.",
      });
    }
    if (isLockedGroupStatus(group.status)) {
      return groupApiError(
        res,
        409,
        "No se pueden crear salidas en una grupal cerrada o cancelada.",
        {
          code: "GROUP_LOCKED",
          solution: "Cambiá el estado de la grupal antes de agregar salidas.",
        },
      );
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = parseOptionalString(body.name, 120);
    if (!name) {
      return groupApiError(res, 400, "El nombre de la salida es obligatorio.", {
        code: "GROUP_DEPARTURE_NAME_REQUIRED",
        solution: "Ingresá un nombre para la salida.",
      });
    }
    const code = parseOptionalString(body.code, 80);
    if (code === undefined) {
      return groupApiError(res, 400, "El código de la salida es inválido.", {
        code: "GROUP_DEPARTURE_CODE_INVALID",
        solution: "Usá un texto de hasta 80 caracteres o dejá el campo vacío.",
      });
    }
    const status = normalizeGroupStatus(body.status ?? "BORRADOR");
    if (!status) {
      return groupApiError(res, 400, "El estado de la salida es inválido.", {
        code: "GROUP_DEPARTURE_STATUS_INVALID",
        solution: "Elegí un estado válido para la salida.",
      });
    }

    const departureDate = parseOptionalDate(body.departure_date);
    if (!(departureDate instanceof Date)) {
      return groupApiError(res, 400, "La fecha de salida es obligatoria.", {
        code: "GROUP_DEPARTURE_DATE_REQUIRED",
        solution: "Ingresá una fecha válida con formato AAAA-MM-DD.",
      });
    }
    const returnDate = parseOptionalDate(body.return_date);
    if (returnDate === undefined) {
      return groupApiError(res, 400, "La fecha de regreso es inválida.", {
        code: "GROUP_DEPARTURE_RETURN_DATE_INVALID",
        solution: "Ingresá una fecha válida con formato AAAA-MM-DD o dejá el campo vacío.",
      });
    }
    if (
      returnDate instanceof Date &&
      returnDate.getTime() < departureDate.getTime()
    ) {
      return groupApiError(
        res,
        400,
        "La fecha de regreso no puede ser anterior a la fecha de salida.",
        {
          code: "GROUP_DEPARTURE_DATE_RANGE_INVALID",
          solution: "Corregí las fechas de la salida.",
        },
      );
    }
    const releaseDate = parseOptionalDate(body.release_date);
    if (releaseDate === undefined) {
      return groupApiError(res, 400, "La fecha de liberación es inválida.", {
        code: "GROUP_DEPARTURE_RELEASE_DATE_INVALID",
        solution: "Ingresá una fecha válida con formato AAAA-MM-DD o dejá el campo vacío.",
      });
    }

    const capacityTotal = parseOptionalInt(body.capacity_total);
    if (capacityTotal === undefined) {
      return groupApiError(res, 400, "El cupo total de la salida es inválido.", {
        code: "GROUP_DEPARTURE_CAPACITY_TOTAL_INVALID",
        solution: "Ingresá un número válido o dejá el campo vacío.",
      });
    }
    const allowOverbooking = parseOptionalBoolean(body.allow_overbooking);
    if (allowOverbooking === undefined) {
      return groupApiError(res, 400, "La opción de sobreventa es inválida.", {
        code: "GROUP_DEPARTURE_OVERBOOKING_FLAG_INVALID",
        solution: "Enviá un valor booleano: true o false.",
      });
    }
    const overbookingLimit = parseOptionalInt(body.overbooking_limit);
    if (overbookingLimit === undefined) {
      return groupApiError(res, 400, "El límite de sobreventa es inválido.", {
        code: "GROUP_DEPARTURE_OVERBOOKING_LIMIT_INVALID",
        solution: "Ingresá un número válido o dejá el campo vacío.",
      });
    }
    const waitlistEnabled = parseOptionalBoolean(body.waitlist_enabled);
    if (waitlistEnabled === undefined) {
      return groupApiError(res, 400, "La opción de lista de espera es inválida.", {
        code: "GROUP_DEPARTURE_WAITLIST_FLAG_INVALID",
        solution: "Enviá un valor booleano: true o false.",
      });
    }
    const waitlistLimit = parseOptionalInt(body.waitlist_limit);
    if (waitlistLimit === undefined) {
      return groupApiError(res, 400, "El límite de lista de espera es inválido.", {
        code: "GROUP_DEPARTURE_WAITLIST_LIMIT_INVALID",
        solution: "Ingresá un número válido o dejá el campo vacío.",
      });
    }
    const note = parseOptionalString(body.note, 1000);
    if (note === undefined) {
      return groupApiError(res, 400, "La nota de la salida es inválida.", {
        code: "GROUP_DEPARTURE_NOTE_INVALID",
        solution: "Usá una nota de hasta 1000 caracteres o dejá el campo vacío.",
      });
    }
    const priceList = toJsonInput(body.price_list);
    if (priceList === undefined && body.price_list !== undefined) {
      return groupApiError(res, 400, "La lista de precios es inválida.", {
        code: "GROUP_DEPARTURE_PRICE_LIST_INVALID",
        solution: "Enviá un objeto JSON válido en price_list.",
      });
    }

    try {
      const created = await prisma.$transaction(async (tx) => {
        const agencyTravelGroupDepartureId = await getNextAgencyCounter(
          tx,
          auth.id_agency,
          "travel_group_departure",
        );
        return tx.travelGroupDeparture.create({
          data: {
            agency_travel_group_departure_id: agencyTravelGroupDepartureId,
            id_agency: auth.id_agency,
            travel_group_id: group.id_travel_group,
            name,
            code,
            status,
            departure_date: departureDate,
            return_date: returnDate,
            release_date: releaseDate,
            capacity_total: capacityTotal,
            allow_overbooking: allowOverbooking,
            overbooking_limit: overbookingLimit,
            waitlist_enabled: waitlistEnabled,
            waitlist_limit: waitlistLimit,
            note,
            price_list: priceList == null ? Prisma.DbNull : priceList,
          },
          select: { id_travel_group_departure: true },
        });
      });

      let createdFull:
        | DepartureRow
        | null = null;
      let partialBookingLink = false;

      try {
        createdFull = await prisma.travelGroupDeparture.findUnique({
          where: { id_travel_group_departure: created.id_travel_group_departure },
          include: {
            _count: {
              select: {
                bookings: true,
                passengers: true,
                inventories: true,
              },
            },
          },
        });
      } catch (error) {
        if (!isMissingBookingGroupColumnError(error)) {
          throw error;
        }
        partialBookingLink = true;
        createdFull = await prisma.travelGroupDeparture.findUnique({
          where: { id_travel_group_departure: created.id_travel_group_departure },
          include: {
            _count: {
              select: {
                passengers: true,
                inventories: true,
              },
            },
          },
        });
      }

      if (!createdFull) {
        return groupApiError(res, 500, "No pudimos recuperar la salida creada.", {
          code: "GROUP_DEPARTURE_CREATE_FETCH_ERROR",
          solution: "Refrescá la pantalla y verificá si la salida quedó creada.",
        });
      }

      const payload = {
        ...createdFull,
        _count: {
          passengers: createdFull._count.passengers ?? 0,
          inventories: createdFull._count.inventories ?? 0,
          bookings: createdFull._count.bookings ?? 0,
        },
        public_id: getDeparturePublicId(createdFull),
      } as Record<string, unknown>;

      if (partialBookingLink) {
        payload.code = "GROUP_BOOKING_LINK_PARTIAL";
        payload.warning =
          "La salida se creó, pero el conteo de reservas todavía no está disponible en esta base.";
        payload.solution =
          "Aplicá la migración pendiente de reservas para habilitar ese conteo.";
      }

      return res.status(201).json(payload);
    } catch (error) {
      console.error("[groups][departures][POST]", error);
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return groupApiError(res, 409, "Hay un conflicto por datos duplicados en la salida.", {
          code: "GROUP_DEPARTURE_DUPLICATE",
          solution: "Revisá código y correlativos antes de guardar.",
        });
      }
      return groupApiError(res, 500, "No pudimos crear la salida.", {
        code: "GROUP_DEPARTURE_CREATE_ERROR",
        solution: "Reintentá en unos segundos.",
      });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return groupApiError(res, 405, "Método no permitido para esta ruta.", {
    code: "METHOD_NOT_ALLOWED",
    details: `Método recibido: ${req.method ?? "desconocido"}.`,
    solution: "Usá GET para listar o POST para crear salidas.",
  });
}
