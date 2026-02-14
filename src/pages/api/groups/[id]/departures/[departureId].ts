import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  canTransitionStatus,
  canWriteGroups,
  getDeparturePublicId,
  isLockedGroupStatus,
  normalizeGroupStatus,
  parseDepartureWhereInput,
  parseGroupWhereInput,
  parseOptionalBoolean,
  parseOptionalDate,
  parseOptionalInt,
  parseOptionalString,
  requireAuth,
  toJsonInput,
} from "@/lib/groups/apiShared";
import { groupApiError } from "@/lib/groups/apiErrors";

function pickParam(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] : value;
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
  status: string;
  departure_date: Date;
  return_date: Date | null;
  _count: DepartureCount;
} & Record<string, unknown>;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const rawGroupId = pickParam(req.query.id);
  const rawDepartureId = pickParam(req.query.departureId);
  if (!rawGroupId || !rawDepartureId) {
    return groupApiError(res, 400, "Los identificadores enviados son inválidos.", {
      code: "GROUP_OR_DEPARTURE_ID_INVALID",
      solution: "Volvé a abrir la grupal y seleccioná la salida nuevamente.",
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

  const departureWhere = parseDepartureWhereInput(rawDepartureId, auth.id_agency);
  if (!departureWhere) {
    return groupApiError(res, 404, "No encontramos la salida solicitada.", {
      code: "DEPARTURE_NOT_FOUND",
      solution: "Verificá la salida seleccionada y volvé a intentar.",
    });
  }
  let bookingLinkPartial = false;
  let departure: DepartureRow | null = null;

  try {
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
    bookingLinkPartial = true;
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
  if (!departure) {
    return groupApiError(res, 404, "No encontramos la salida solicitada.", {
      code: "DEPARTURE_NOT_FOUND",
      solution: "Verificá la salida seleccionada y volvé a intentar.",
    });
  }

  if (req.method === "GET") {
    const payload = {
      ...departure,
      _count: {
        passengers: departure._count.passengers ?? 0,
        inventories: departure._count.inventories ?? 0,
        bookings: departure._count.bookings ?? 0,
      },
      public_id: getDeparturePublicId(departure),
    } as Record<string, unknown>;
    if (!bookingLinkPartial) {
      return res.status(200).json(payload);
    }
    return res.status(200).json({
      ...payload,
      code: "GROUP_BOOKING_LINK_PARTIAL",
      warning:
        "La salida está disponible, pero la vinculación con reservas todavía no está habilitada.",
      solution:
        "Aplicá la migración pendiente de reservas para habilitar esa vinculación.",
    });
  }

  if (req.method === "PATCH") {
    if (!canWriteGroups(auth.role)) {
      return groupApiError(res, 403, "No tenés permisos para editar salidas.", {
        code: "GROUP_DEPARTURE_UPDATE_FORBIDDEN",
        solution: "Solicitá permisos de edición de grupales a un administrador.",
      });
    }

    const locked = isLockedGroupStatus(group.status);
    if (locked) {
      return groupApiError(
        res,
        409,
        "La grupal está cerrada o cancelada. No se permiten cambios en salidas.",
        {
          code: "GROUP_LOCKED",
          solution: "Cambiá el estado de la grupal para poder editar salidas.",
        },
      );
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch: Prisma.TravelGroupDepartureUpdateInput = {};

    if (body.name !== undefined) {
      const value = parseOptionalString(body.name, 120);
      if (!value) {
        return groupApiError(res, 400, "El nombre de la salida es inválido.", {
          code: "GROUP_DEPARTURE_NAME_INVALID",
          solution: "Ingresá un nombre de hasta 120 caracteres.",
        });
      }
      patch.name = value;
    }
    if (body.code !== undefined) {
      const value = parseOptionalString(body.code, 80);
      if (value === undefined) {
        return groupApiError(res, 400, "El código de la salida es inválido.", {
          code: "GROUP_DEPARTURE_CODE_INVALID",
          solution: "Usá un texto de hasta 80 caracteres o dejá el campo vacío.",
        });
      }
      patch.code = value;
    }
    if (body.note !== undefined) {
      const value = parseOptionalString(body.note, 1000);
      if (value === undefined) {
        return groupApiError(res, 400, "La nota de la salida es inválida.", {
          code: "GROUP_DEPARTURE_NOTE_INVALID",
          solution: "Usá una nota de hasta 1000 caracteres o dejá el campo vacío.",
        });
      }
      patch.note = value;
    }

    if (body.status !== undefined) {
      const value = normalizeGroupStatus(body.status);
      if (!value) {
        return groupApiError(res, 400, "El estado de la salida es inválido.", {
          code: "GROUP_DEPARTURE_STATUS_INVALID",
          solution: "Elegí un estado válido para la salida.",
        });
      }
      if (!canTransitionStatus(departure.status, value)) {
        return groupApiError(
          res,
          409,
          `No se puede cambiar el estado de ${departure.status} a ${value}.`,
          {
            code: "GROUP_DEPARTURE_STATUS_TRANSITION_INVALID",
            solution: "Revisá el flujo de estados permitido para la salida.",
          },
        );
      }
      patch.status = value;
    }

    const departureDate =
      body.departure_date !== undefined
        ? parseOptionalDate(body.departure_date)
        : undefined;
    if (departureDate === undefined && body.departure_date !== undefined) {
      return groupApiError(res, 400, "La fecha de salida es inválida.", {
        code: "GROUP_DEPARTURE_DATE_INVALID",
        solution: "Ingresá una fecha válida con formato AAAA-MM-DD.",
      });
    }
    if (departureDate === null) {
      return groupApiError(res, 400, "La fecha de salida no admite valor nulo.", {
        code: "GROUP_DEPARTURE_DATE_NULL",
        solution: "Ingresá una fecha válida para la salida.",
      });
    }
    const returnDate =
      body.return_date !== undefined ? parseOptionalDate(body.return_date) : undefined;
    if (returnDate === undefined && body.return_date !== undefined) {
      return groupApiError(res, 400, "La fecha de regreso es inválida.", {
        code: "GROUP_DEPARTURE_RETURN_DATE_INVALID",
        solution: "Ingresá una fecha válida con formato AAAA-MM-DD o dejá el campo vacío.",
      });
    }
    const releaseDate =
      body.release_date !== undefined
        ? parseOptionalDate(body.release_date)
        : undefined;
    if (releaseDate === undefined && body.release_date !== undefined) {
      return groupApiError(res, 400, "La fecha de liberación es inválida.", {
        code: "GROUP_DEPARTURE_RELEASE_DATE_INVALID",
        solution: "Ingresá una fecha válida con formato AAAA-MM-DD o dejá el campo vacío.",
      });
    }

    const effectiveDepartureDate =
      departureDate === undefined ? departure.departure_date : departureDate;
    const effectiveReturnDate =
      returnDate === undefined ? departure.return_date : returnDate;
    if (
      effectiveDepartureDate instanceof Date &&
      effectiveReturnDate instanceof Date &&
      effectiveReturnDate.getTime() < effectiveDepartureDate.getTime()
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
    if (departureDate !== undefined) patch.departure_date = departureDate;
    if (returnDate !== undefined) patch.return_date = returnDate;
    if (releaseDate !== undefined) patch.release_date = releaseDate;

    if (body.capacity_total !== undefined) {
      const value = parseOptionalInt(body.capacity_total);
      if (value === undefined) {
        return groupApiError(res, 400, "El cupo total de la salida es inválido.", {
          code: "GROUP_DEPARTURE_CAPACITY_TOTAL_INVALID",
          solution: "Ingresá un número válido o dejá el campo vacío.",
        });
      }
      const occupied = Math.max(
        departure._count.passengers ?? 0,
        departure._count.bookings ?? 0,
      );
      if (value !== null && value < occupied) {
        return groupApiError(
          res,
          400,
          "El cupo total no puede ser menor a pasajeros o reservas ya asociadas.",
          {
            code: "GROUP_DEPARTURE_CAPACITY_TOTAL_TOO_LOW",
            solution: "Aumentá el cupo o reducí asociaciones antes de guardar.",
          },
        );
      }
      patch.capacity_total = value;
    }

    if (body.allow_overbooking !== undefined) {
      const value = parseOptionalBoolean(body.allow_overbooking);
      if (value === undefined) {
        return groupApiError(res, 400, "La opción de sobreventa es inválida.", {
          code: "GROUP_DEPARTURE_OVERBOOKING_FLAG_INVALID",
          solution: "Enviá un valor booleano: true o false.",
        });
      }
      patch.allow_overbooking = value;
    }
    if (body.overbooking_limit !== undefined) {
      const value = parseOptionalInt(body.overbooking_limit);
      if (value === undefined) {
        return groupApiError(res, 400, "El límite de sobreventa es inválido.", {
          code: "GROUP_DEPARTURE_OVERBOOKING_LIMIT_INVALID",
          solution: "Ingresá un número válido o dejá el campo vacío.",
        });
      }
      patch.overbooking_limit = value;
    }
    if (body.waitlist_enabled !== undefined) {
      const value = parseOptionalBoolean(body.waitlist_enabled);
      if (value === undefined) {
        return groupApiError(res, 400, "La opción de lista de espera es inválida.", {
          code: "GROUP_DEPARTURE_WAITLIST_FLAG_INVALID",
          solution: "Enviá un valor booleano: true o false.",
        });
      }
      patch.waitlist_enabled = value;
    }
    if (body.waitlist_limit !== undefined) {
      const value = parseOptionalInt(body.waitlist_limit);
      if (value === undefined) {
        return groupApiError(res, 400, "El límite de lista de espera es inválido.", {
          code: "GROUP_DEPARTURE_WAITLIST_LIMIT_INVALID",
          solution: "Ingresá un número válido o dejá el campo vacío.",
        });
      }
      patch.waitlist_limit = value;
    }
    if (body.price_list !== undefined) {
      const value = toJsonInput(body.price_list);
      if (value === undefined) {
        return groupApiError(res, 400, "La lista de precios es inválida.", {
          code: "GROUP_DEPARTURE_PRICE_LIST_INVALID",
          solution: "Enviá un objeto JSON válido en price_list.",
        });
      }
      patch.price_list = value == null ? Prisma.DbNull : value;
    }

    if (Object.keys(patch).length === 0) {
      return groupApiError(res, 400, "No se detectaron cambios para aplicar.", {
        code: "GROUP_DEPARTURE_NO_CHANGES",
        solution: "Modificá al menos un campo antes de guardar.",
      });
    }

    try {
      let updated:
        | DepartureRow
        | null = null;
      let updateBookingLinkPartial = false;

      try {
        updated = await prisma.travelGroupDeparture.update({
          where: { id_travel_group_departure: departure.id_travel_group_departure },
          data: patch,
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
        updateBookingLinkPartial = true;
        updated = await prisma.travelGroupDeparture.update({
          where: { id_travel_group_departure: departure.id_travel_group_departure },
          data: patch,
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

      if (!updated) {
        return groupApiError(res, 500, "No pudimos recuperar la salida actualizada.", {
          code: "GROUP_DEPARTURE_UPDATE_FETCH_ERROR",
          solution: "Refrescá la pantalla y verificá el estado de la salida.",
        });
      }

      const payload = {
        ...updated,
        _count: {
          passengers: updated._count.passengers ?? 0,
          inventories: updated._count.inventories ?? 0,
          bookings: updated._count.bookings ?? 0,
        },
        public_id: getDeparturePublicId(updated),
      } as Record<string, unknown>;
      if (!updateBookingLinkPartial) {
        return res.status(200).json(payload);
      }
      return res.status(200).json({
        ...payload,
        code: "GROUP_BOOKING_LINK_PARTIAL",
        warning:
          "La salida se actualizó, pero el vínculo con reservas todavía no está habilitado.",
        solution:
          "Aplicá la migración pendiente de reservas para habilitar ese vínculo.",
      });
    } catch (error) {
      console.error("[groups][departures][PATCH]", error);
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return groupApiError(res, 409, "Hay un conflicto por datos duplicados en la salida.", {
          code: "GROUP_DEPARTURE_DUPLICATE",
          solution: "Revisá código y correlativos antes de guardar.",
        });
      }
      return groupApiError(res, 500, "No pudimos actualizar la salida.", {
        code: "GROUP_DEPARTURE_UPDATE_ERROR",
        solution: "Reintentá en unos segundos.",
      });
    }
  }

  if (req.method === "DELETE") {
    if (!canWriteGroups(auth.role)) {
      return groupApiError(res, 403, "No tenés permisos para eliminar salidas.", {
        code: "GROUP_DEPARTURE_DELETE_FORBIDDEN",
        solution: "Solicitá permisos de edición de grupales a un administrador.",
      });
    }

    if (isLockedGroupStatus(group.status)) {
      return groupApiError(
        res,
        409,
        "La grupal está cerrada o cancelada. No se permiten bajas de salidas.",
        {
          code: "GROUP_LOCKED",
          solution: "Cambiá el estado de la grupal para poder eliminar salidas.",
        },
      );
    }

    if (departure.status !== "BORRADOR") {
      return groupApiError(res, 409, "Solo se puede eliminar una salida en estado borrador.", {
        code: "GROUP_DEPARTURE_DELETE_STATUS_INVALID",
        solution: "Volvé la salida a borrador antes de eliminarla.",
      });
    }

    if (
      (departure._count.bookings ?? 0) > 0 ||
      departure._count.passengers > 0 ||
      departure._count.inventories > 0
    ) {
      return groupApiError(
        res,
        409,
        "No se puede eliminar la salida porque tiene datos asociados.",
        {
          code: "GROUP_DEPARTURE_DELETE_HAS_ASSOCIATIONS",
          solution: "Quitá reservas, pasajeros e inventarios asociados antes de eliminar.",
        },
      );
    }

    try {
      await prisma.travelGroupDeparture.delete({
        where: { id_travel_group_departure: departure.id_travel_group_departure },
      });
      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error("[groups][departures][DELETE]", error);
      return groupApiError(res, 500, "No pudimos eliminar la salida.", {
        code: "GROUP_DEPARTURE_DELETE_ERROR",
        solution: "Reintentá en unos segundos.",
      });
    }
  }

  res.setHeader("Allow", ["GET", "PATCH", "DELETE"]);
  return groupApiError(res, 405, "Método no permitido para esta ruta.", {
    code: "METHOD_NOT_ALLOWED",
    details: `Método recibido: ${req.method ?? "desconocido"}.`,
    solution: "Usá GET para consultar, PATCH para editar o DELETE para eliminar.",
  });
}
