import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  canTransitionStatus,
  canWriteGroups,
  getDeparturePublicId,
  getGroupPublicId,
  isLockedGroupStatus,
  normalizeCapacityMode,
  normalizeGroupStatus,
  normalizeGroupType,
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

function withPublicIds(group: {
  id_agency: number;
  agency_travel_group_id: number | null;
  departures: Array<{
    id_agency: number;
    agency_travel_group_departure_id: number | null;
  }>;
} & Record<string, unknown>) {
  return {
    ...group,
    public_id: getGroupPublicId(group),
    departures: group.departures.map((dep) => ({
      ...dep,
      public_id: getDeparturePublicId(dep),
    })),
  };
}

type GroupCount = {
  passengers: number;
  departures: number;
  inventories: number;
  bookings?: number;
};

type GroupWithCountsAndDepartures = {
  id_travel_group: number;
  id_agency: number;
  agency_travel_group_id: number | null;
  status: string;
  start_date: Date | null;
  end_date: Date | null;
  _count: GroupCount;
  departures: Array<
    {
      id_agency: number;
      agency_travel_group_departure_id: number | null;
    } & Record<string, unknown>
  >;
} & Record<string, unknown>;

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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const rawId = parseGroupIdParam(req.query.id);
  if (!rawId) {
    return groupApiError(res, 400, "El identificador de la grupal es inválido.", {
      code: "GROUP_ID_INVALID",
      solution: "Volvé al listado de grupales e ingresá nuevamente.",
    });
  }

  const where = parseGroupWhereInput(rawId, auth.id_agency);
  if (!where) {
    return groupApiError(res, 404, "No encontramos la grupal solicitada.", {
      code: "GROUP_NOT_FOUND",
      solution: "Revisá que la grupal exista y pertenezca a tu agencia.",
    });
  }

  let bookingLinkPartial = false;
  let current: GroupWithCountsAndDepartures | null = null;

  try {
    current = await prisma.travelGroup.findFirst({
      where,
      include: {
        _count: {
          select: {
            passengers: true,
            bookings: true,
            departures: true,
            inventories: true,
          },
        },
        departures: {
          orderBy: [
            { departure_date: "asc" },
            { id_travel_group_departure: "asc" },
          ],
        },
      },
    });
  } catch (error) {
    if (!isMissingBookingGroupColumnError(error)) {
      throw error;
    }
    bookingLinkPartial = true;
    current = await prisma.travelGroup.findFirst({
      where,
      include: {
        _count: {
          select: {
            passengers: true,
            departures: true,
            inventories: true,
          },
        },
        departures: {
          orderBy: [
            { departure_date: "asc" },
            { id_travel_group_departure: "asc" },
          ],
        },
      },
    });
  }

  if (!current) {
    return groupApiError(res, 404, "No encontramos la grupal solicitada.", {
      code: "GROUP_NOT_FOUND",
      solution: "Revisá que la grupal exista y pertenezca a tu agencia.",
    });
  }

  if (req.method === "GET") {
    const payload = withPublicIds({
      ...current,
      _count: {
        passengers: current._count.passengers ?? 0,
        departures: current._count.departures ?? 0,
        inventories: current._count.inventories ?? 0,
        bookings: current._count.bookings ?? 0,
      },
    });
    if (!bookingLinkPartial) {
      return res.status(200).json(payload);
    }
    return res.status(200).json({
      ...payload,
      code: "GROUP_BOOKING_LINK_PARTIAL",
      warning:
        "La vinculación automática con reservas todavía no está disponible en esta base.",
      solution:
        "Podés operar la grupal; para ver reservas vinculadas aplicá la migración pendiente de reservas.",
    });
  }

  if (req.method === "PATCH") {
    if (!canWriteGroups(auth.role)) {
      return groupApiError(res, 403, "No tenés permisos para editar grupales.", {
        code: "GROUP_UPDATE_FORBIDDEN",
        solution: "Solicitá permisos de edición a un administrador.",
      });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch: Prisma.TravelGroupUpdateInput = {};

    const nextStatus =
      body.status !== undefined ? normalizeGroupStatus(body.status) : null;
    if (body.status !== undefined && !nextStatus) {
      return groupApiError(res, 400, "El estado indicado es inválido.", {
        code: "GROUP_STATUS_INVALID",
        solution: "Elegí un estado válido para la grupal.",
      });
    }
    if (nextStatus && !canTransitionStatus(current.status, nextStatus)) {
      return groupApiError(
        res,
        409,
        `No se puede cambiar el estado de ${current.status} a ${nextStatus}.`,
        {
          code: "GROUP_STATUS_TRANSITION_INVALID",
          solution: "Revisá el flujo de estados permitido para la grupal.",
        },
      );
    }
    if (nextStatus) patch.status = nextStatus;

    const locked = isLockedGroupStatus(current.status);
    const allowedInLockedStatus = new Set(["note", "status"]);
    if (locked) {
      const attempted = Object.keys(body).filter(
        (key) => !allowedInLockedStatus.has(key),
      );
      if (attempted.length > 0) {
        return groupApiError(
          res,
          409,
          "La grupal está cerrada o cancelada. Solo se permite actualizar notas internas.",
          {
            code: "GROUP_LOCKED",
            solution: "Reabrí la grupal para editar otros campos.",
          },
        );
      }
    }

    if (body.name !== undefined) {
      const name = parseOptionalString(body.name, 120);
      if (!name) {
        return groupApiError(res, 400, "El nombre de la grupal es inválido.", {
          code: "GROUP_NAME_INVALID",
          solution: "Ingresá un nombre de hasta 120 caracteres.",
        });
      }
      patch.name = name;
    }

    if (body.type !== undefined) {
      const type = normalizeGroupType(body.type);
      if (!type) {
        return groupApiError(res, 400, "El tipo de grupal es inválido.", {
          code: "GROUP_TYPE_INVALID",
          solution: "Elegí Agencia, Estudiantil o Precomprado.",
        });
      }
      patch.type = type;
    }

    if (body.capacity_mode !== undefined) {
      const capacityMode = normalizeCapacityMode(body.capacity_mode);
      if (!capacityMode) {
        return groupApiError(res, 400, "El modo de cupo es inválido.", {
          code: "GROUP_CAPACITY_MODE_INVALID",
          solution: "Elegí cupo total o cupo por servicio.",
        });
      }
      patch.capacity_mode = capacityMode;
    }

    if (body.code !== undefined) {
      const code = parseOptionalString(body.code, 80);
      if (code === undefined) {
        return groupApiError(res, 400, "El código de la grupal es inválido.", {
          code: "GROUP_CODE_INVALID",
          solution: "Usá un texto de hasta 80 caracteres o dejá el campo vacío.",
        });
      }
      patch.code = code;
    }
    if (body.description !== undefined) {
      const description = parseOptionalString(body.description, 1000);
      if (description === undefined) {
        return groupApiError(res, 400, "La descripción es inválida.", {
          code: "GROUP_DESCRIPTION_INVALID",
          solution: "Usá una descripción de hasta 1000 caracteres o dejá el campo vacío.",
        });
      }
      patch.description = description;
    }
    if (body.note !== undefined) {
      const note = parseOptionalString(body.note, 1000);
      if (note === undefined) {
        return groupApiError(res, 400, "La nota interna es inválida.", {
          code: "GROUP_NOTE_INVALID",
          solution: "Usá una nota de hasta 1000 caracteres o dejá el campo vacío.",
        });
      }
      patch.note = note;
    }
    if (body.currency !== undefined) {
      const currency = parseOptionalString(body.currency, 12);
      if (currency === undefined) {
        return groupApiError(res, 400, "La moneda es inválida.", {
          code: "GROUP_CURRENCY_INVALID",
          solution: "Ingresá una moneda válida (ejemplo: ARS, USD) o dejá el campo vacío.",
        });
      }
      patch.currency = currency;
    }
    if (body.sale_mode !== undefined) {
      const saleMode = parseOptionalString(body.sale_mode, 50);
      if (saleMode === undefined) {
        return groupApiError(res, 400, "El modo de venta es inválido.", {
          code: "GROUP_SALE_MODE_INVALID",
          solution: "Usá un texto de hasta 50 caracteres o dejá el campo vacío.",
        });
      }
      patch.sale_mode = saleMode;
    }

    const startDate =
      body.start_date !== undefined
        ? parseOptionalDate(body.start_date)
        : undefined;
    if (startDate === undefined && body.start_date !== undefined) {
      return groupApiError(res, 400, "La fecha de inicio es inválida.", {
        code: "GROUP_START_DATE_INVALID",
        solution: "Ingresá una fecha válida con formato AAAA-MM-DD.",
      });
    }
    const endDate =
      body.end_date !== undefined ? parseOptionalDate(body.end_date) : undefined;
    if (endDate === undefined && body.end_date !== undefined) {
      return groupApiError(res, 400, "La fecha de fin es inválida.", {
        code: "GROUP_END_DATE_INVALID",
        solution: "Ingresá una fecha válida con formato AAAA-MM-DD.",
      });
    }

    const effectiveStart =
      startDate === undefined ? current.start_date : startDate;
    const effectiveEnd = endDate === undefined ? current.end_date : endDate;
    if (
      effectiveStart instanceof Date &&
      effectiveEnd instanceof Date &&
      effectiveEnd.getTime() < effectiveStart.getTime()
    ) {
      return groupApiError(
        res,
        400,
        "La fecha de fin no puede ser anterior a la fecha de inicio.",
        {
          code: "GROUP_DATE_RANGE_INVALID",
          solution: "Corregí el rango de fechas antes de guardar.",
        },
      );
    }
    if (startDate !== undefined) patch.start_date = startDate;
    if (endDate !== undefined) patch.end_date = endDate;

    if (body.capacity_total !== undefined) {
      const capacityTotal = parseOptionalInt(body.capacity_total);
      if (capacityTotal === undefined) {
        return groupApiError(res, 400, "El cupo total es inválido.", {
          code: "GROUP_CAPACITY_TOTAL_INVALID",
          solution: "Ingresá un número válido o dejá el campo vacío.",
        });
      }
      if (
        capacityTotal !== null &&
        capacityTotal < Number(current._count.passengers || 0)
      ) {
        return groupApiError(
          res,
          400,
          "El cupo total no puede ser menor a la cantidad de pasajeros cargados.",
          {
            code: "GROUP_CAPACITY_TOTAL_TOO_LOW",
            solution: "Aumentá el cupo o reducí pasajeros antes de guardar.",
          },
        );
      }
      patch.capacity_total = capacityTotal;
    }

    if (body.allow_overbooking !== undefined) {
      const value = parseOptionalBoolean(body.allow_overbooking);
      if (value === undefined || value === null) {
        return groupApiError(res, 400, "La opción de sobreventa es inválida.", {
          code: "GROUP_OVERBOOKING_FLAG_INVALID",
          solution: "Enviá un valor booleano: true o false.",
        });
      }
      patch.allow_overbooking = value;
    }
    if (body.waitlist_enabled !== undefined) {
      const value = parseOptionalBoolean(body.waitlist_enabled);
      if (value === undefined || value === null) {
        return groupApiError(res, 400, "La opción de lista de espera es inválida.", {
          code: "GROUP_WAITLIST_FLAG_INVALID",
          solution: "Enviá un valor booleano: true o false.",
        });
      }
      patch.waitlist_enabled = value;
    }
    if (body.overbooking_limit !== undefined) {
      const value = parseOptionalInt(body.overbooking_limit);
      if (value === undefined) {
        return groupApiError(res, 400, "El límite de sobreventa es inválido.", {
          code: "GROUP_OVERBOOKING_LIMIT_INVALID",
          solution: "Ingresá un número válido o dejá el campo vacío.",
        });
      }
      patch.overbooking_limit = value;
    }
    if (body.waitlist_limit !== undefined) {
      const value = parseOptionalInt(body.waitlist_limit);
      if (value === undefined) {
        return groupApiError(res, 400, "El límite de lista de espera es inválido.", {
          code: "GROUP_WAITLIST_LIMIT_INVALID",
          solution: "Ingresá un número válido o dejá el campo vacío.",
        });
      }
      patch.waitlist_limit = value;
    }

    if (body.custom_fields !== undefined) {
      const customFields = toJsonInput(body.custom_fields);
      if (customFields === undefined && body.custom_fields !== undefined) {
        return groupApiError(res, 400, "Los campos personalizados son inválidos.", {
          code: "GROUP_CUSTOM_FIELDS_INVALID",
          solution: "Enviá un objeto JSON válido en custom_fields.",
        });
      }
      patch.custom_fields = customFields === null ? Prisma.DbNull : customFields;
    }

    if (Object.keys(patch).length === 0) {
      return groupApiError(res, 400, "No se detectaron cambios para aplicar.", {
        code: "GROUP_NO_CHANGES",
        solution: "Modificá al menos un campo antes de guardar.",
      });
    }

    try {
      let updated: GroupWithCountsAndDepartures | null = null;
      let updateBookingLinkPartial = false;

      try {
        updated = await prisma.travelGroup.update({
          where: { id_travel_group: current.id_travel_group },
          data: patch,
          include: {
            _count: {
              select: {
                passengers: true,
                bookings: true,
                departures: true,
                inventories: true,
              },
            },
            departures: {
              orderBy: [
                { departure_date: "asc" },
                { id_travel_group_departure: "asc" },
              ],
            },
          },
        });
      } catch (error) {
        if (!isMissingBookingGroupColumnError(error)) {
          throw error;
        }
        updateBookingLinkPartial = true;
        updated = await prisma.travelGroup.update({
          where: { id_travel_group: current.id_travel_group },
          data: patch,
          include: {
            _count: {
              select: {
                passengers: true,
                departures: true,
                inventories: true,
              },
            },
            departures: {
              orderBy: [
                { departure_date: "asc" },
                { id_travel_group_departure: "asc" },
              ],
            },
          },
        });
      }

      if (!updated) {
        return groupApiError(res, 500, "No pudimos recuperar la grupal actualizada.", {
          code: "GROUP_UPDATE_FETCH_ERROR",
          solution: "Refrescá la pantalla y verificá el estado de la grupal.",
        });
      }

      const payload = withPublicIds({
        ...updated,
        _count: {
          passengers: updated._count.passengers ?? 0,
          departures: updated._count.departures ?? 0,
          inventories: updated._count.inventories ?? 0,
          bookings: updated._count.bookings ?? 0,
        },
      });

      if (!updateBookingLinkPartial) {
        return res.status(200).json(payload);
      }
      return res.status(200).json({
        ...payload,
        code: "GROUP_BOOKING_LINK_PARTIAL",
        warning:
          "La grupal se actualizó, pero la vinculación con reservas todavía no está disponible.",
        solution:
          "Aplicá la migración pendiente de reservas para habilitar esa vinculación.",
      });
    } catch (error) {
      console.error("[groups][PATCH]", error);
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return groupApiError(res, 409, "Hay un conflicto por datos duplicados.", {
          code: "GROUP_DUPLICATE",
          solution: "Revisá código y correlativos antes de volver a intentar.",
        });
      }
      return groupApiError(res, 500, "No pudimos actualizar la grupal.", {
        code: "GROUP_UPDATE_ERROR",
        solution: "Verificá los datos y volvé a intentar.",
      });
    }
  }

  if (req.method === "DELETE") {
    if (!canWriteGroups(auth.role)) {
      return groupApiError(res, 403, "No tenés permisos para eliminar grupales.", {
        code: "GROUP_DELETE_FORBIDDEN",
        solution: "Solicitá permisos de edición a un administrador.",
      });
    }

    if (current.status !== "BORRADOR") {
      return groupApiError(res, 409, "Solo se puede eliminar una grupal en estado borrador.", {
        code: "GROUP_DELETE_STATUS_INVALID",
        solution: "Volvé la grupal a borrador antes de eliminarla.",
      });
    }

    const hasAssociations =
      (current._count.bookings ?? 0) > 0 ||
      current._count.passengers > 0 ||
      current._count.inventories > 0;
    if (hasAssociations) {
      return groupApiError(
        res,
        409,
        "No se puede eliminar la grupal porque tiene pasajeros, reservas o inventario asociado.",
        {
          code: "GROUP_DELETE_HAS_ASSOCIATIONS",
          solution: "Quitá las asociaciones antes de intentar eliminarla.",
        },
      );
    }

    try {
      await prisma.travelGroup.delete({
        where: { id_travel_group: current.id_travel_group },
      });
      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error("[groups][DELETE]", error);
      return groupApiError(res, 500, "No pudimos eliminar la grupal.", {
        code: "GROUP_DELETE_ERROR",
        solution: "Intentá nuevamente o cerrá vínculos asociados antes de eliminar.",
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
