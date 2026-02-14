import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  getNextAgencyCounter,
  type AgencyCounterKey,
} from "@/lib/agencyCounters";
import {
  canWriteGroups,
  getDeparturePublicId,
  getGroupPublicId,
  normalizeCapacityMode,
  normalizeGroupStatus,
  normalizeGroupType,
  parseOptionalBoolean,
  parseOptionalDate,
  parseOptionalInt,
  parseOptionalString,
  parsePositiveInt,
  requireAuth,
  toJsonInput,
} from "@/lib/groups/apiShared";
import { groupApiError } from "@/lib/groups/apiErrors";

type TravelGroupCreateDepartureInput = {
  name: string;
  code?: string | null;
  status: string;
  departure_date: Date;
  return_date?: Date | null;
  release_date?: Date | null;
  capacity_total?: number | null;
  allow_overbooking?: boolean | null;
  overbooking_limit?: number | null;
  waitlist_enabled?: boolean | null;
  waitlist_limit?: number | null;
  price_list?: Prisma.InputJsonValue | null;
  note?: string | null;
};

type GroupCount = {
  departures: number;
  passengers: number;
  inventories: number;
  bookings?: number;
};

type GroupListRow = {
  id_travel_group: number;
  id_agency: number;
  agency_travel_group_id: number | null;
  _count: GroupCount;
} & Record<string, unknown>;

type GroupCreateResponseRow = GroupListRow & {
  departures: Array<
    {
      id_agency: number;
      agency_travel_group_departure_id: number | null;
    } & Record<string, unknown>
  >;
};

function getKnownErrorMetaString(
  error: Prisma.PrismaClientKnownRequestError,
  key: string,
): string {
  const meta = error.meta;
  if (!meta || typeof meta !== "object") return "";
  const value = (meta as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function isGroupSchemaUnavailableError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2021") {
    const table = getKnownErrorMetaString(error, "table");
    return /travelgroup/i.test(table);
  }
  if (error.code === "P2022") {
    const column = getKnownErrorMetaString(error, "column").toLowerCase();
    if (
      column.includes("booking.travel_group_id") ||
      column.includes("booking.travel_group_departure_id")
    ) {
      return false;
    }
    return /travel_group|travelgroup/i.test(column);
  }
  return false;
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

function isAgencyCounterAgencyFkError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2003") return false;
  const fieldName = getKnownErrorMetaString(error, "field_name").toLowerCase();
  return fieldName.includes("agencycounter_id_agency_fkey");
}

async function getNextAgencyCounterSafe(
  tx: Prisma.TransactionClient,
  idAgency: number,
  key: AgencyCounterKey,
): Promise<number | null> {
  try {
    return await getNextAgencyCounter(tx, idAgency, key);
  } catch (error) {
    if (isAgencyCounterAgencyFkError(error)) {
      console.warn(
        "[groups] No se pudo usar correlativo de agencia; se guarda sin correlativo público.",
      );
      return null;
    }
    throw error;
  }
}

function hasOwn(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function parseDepartureCreate(
  raw: unknown,
  index: number,
): { value?: TravelGroupCreateDepartureInput; error?: string } {
  if (!raw || typeof raw !== "object") {
    return { error: `Salida #${index + 1}: formato inválido.` };
  }

  const record = raw as Record<string, unknown>;
  const name =
    parseOptionalString(record.name, 120) ??
    parseOptionalString(record.label, 120);
  if (!name) {
    return { error: `Salida #${index + 1}: el nombre es obligatorio.` };
  }

  const departureDate = parseOptionalDate(record.departure_date);
  if (!(departureDate instanceof Date)) {
    return {
      error: `Salida #${index + 1}: la fecha de salida es obligatoria y debe ser válida.`,
    };
  }

  const hasReturnDate = hasOwn(record, "return_date");
  const returnDate = hasReturnDate
    ? parseOptionalDate(record.return_date)
    : null;
  if (hasReturnDate && returnDate === undefined) {
    return { error: `Salida #${index + 1}: la fecha de regreso es inválida.` };
  }
  if (
    returnDate instanceof Date &&
    returnDate.getTime() < departureDate.getTime()
  ) {
    return {
      error: `Salida #${index + 1}: la fecha de regreso no puede ser anterior a la de salida.`,
    };
  }

  const hasReleaseDate = hasOwn(record, "release_date");
  const releaseDate = hasReleaseDate
    ? parseOptionalDate(record.release_date)
    : null;
  if (hasReleaseDate && releaseDate === undefined) {
    return { error: `Salida #${index + 1}: la fecha de liberación es inválida.` };
  }

  const status = normalizeGroupStatus(record.status ?? "BORRADOR");
  if (!status) {
    return { error: `Salida #${index + 1}: el estado es inválido.` };
  }

  const hasCapacityTotal = hasOwn(record, "capacity_total");
  const capacityTotal = hasCapacityTotal
    ? parseOptionalInt(record.capacity_total)
    : null;
  if (hasCapacityTotal && capacityTotal === undefined) {
    return { error: `Salida #${index + 1}: el cupo total es inválido.` };
  }

  const hasAllowOverbooking = hasOwn(record, "allow_overbooking");
  const allowOverbooking = hasAllowOverbooking
    ? parseOptionalBoolean(record.allow_overbooking)
    : false;
  if (hasAllowOverbooking && allowOverbooking === undefined) {
    return { error: `Salida #${index + 1}: la sobreventa es inválida.` };
  }

  const hasOverbookingLimit = hasOwn(record, "overbooking_limit");
  const overbookingLimit = hasOverbookingLimit
    ? parseOptionalInt(record.overbooking_limit)
    : null;
  if (hasOverbookingLimit && overbookingLimit === undefined) {
    return { error: `Salida #${index + 1}: el límite de sobreventa es inválido.` };
  }

  const hasWaitlistEnabled = hasOwn(record, "waitlist_enabled");
  const waitlistEnabled = hasWaitlistEnabled
    ? parseOptionalBoolean(record.waitlist_enabled)
    : false;
  if (hasWaitlistEnabled && waitlistEnabled === undefined) {
    return { error: `Salida #${index + 1}: la lista de espera es inválida.` };
  }

  const hasWaitlistLimit = hasOwn(record, "waitlist_limit");
  const waitlistLimit = hasWaitlistLimit
    ? parseOptionalInt(record.waitlist_limit)
    : null;
  if (hasWaitlistLimit && waitlistLimit === undefined) {
    return { error: `Salida #${index + 1}: el límite de lista de espera es inválido.` };
  }

  const hasCode = hasOwn(record, "code");
  const code = hasCode ? parseOptionalString(record.code, 80) : null;
  if (hasCode && code === undefined) {
    return { error: `Salida #${index + 1}: el código es inválido.` };
  }

  const hasNote = hasOwn(record, "note");
  const note = hasNote ? parseOptionalString(record.note, 1000) : null;
  if (hasNote && note === undefined) {
    return { error: `Salida #${index + 1}: la nota es inválida.` };
  }

  const hasPriceList = hasOwn(record, "price_list");
  const priceList = hasPriceList ? toJsonInput(record.price_list) : null;
  if (hasPriceList && priceList === undefined) {
    return { error: `Salida #${index + 1}: la lista de precios es inválida.` };
  }

  return {
    value: {
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
      price_list: priceList ?? null,
      note,
    },
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  if (req.method === "GET") {
    try {
      const takeRaw = parsePositiveInt(req.query.take);
      const take = Math.min(Math.max(takeRaw ?? 20, 1), 100);
      const cursor = parsePositiveInt(req.query.cursor);
      const q =
        typeof req.query.q === "string" && req.query.q.trim()
          ? req.query.q.trim()
          : null;
      const type = normalizeGroupType(req.query.type);
      const status = normalizeGroupStatus(req.query.status);

      const where: Prisma.TravelGroupWhereInput = {
        id_agency: auth.id_agency,
      };
      if (type) where.type = type;
      if (status) where.status = status;
      if (q) {
        where.OR = [
          { name: { contains: q, mode: "insensitive" } },
          { code: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ];
      }

      const baseQuery = {
        where,
        orderBy: [{ created_at: "desc" }, { id_travel_group: "desc" }],
        take: take + 1,
        ...(cursor
          ? { cursor: { id_travel_group: cursor }, skip: 1 }
          : {}),
      } satisfies Omit<Prisma.TravelGroupFindManyArgs, "include">;

      let bookingLinkPartial = false;
      let rows: GroupListRow[] = [];

      try {
        rows = await prisma.travelGroup.findMany({
          ...baseQuery,
          include: {
            _count: {
              select: {
                departures: true,
                passengers: true,
                bookings: true,
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
        console.warn(
          "[groups][GET] Vínculo de reservas con grupales no disponible; se lista sin conteo de reservas.",
        );
        rows = await prisma.travelGroup.findMany({
          ...baseQuery,
          include: {
            _count: {
              select: {
                departures: true,
                passengers: true,
                inventories: true,
              },
            },
          },
        });
      }

      const hasMore = rows.length > take;
      const slice = hasMore ? rows.slice(0, take) : rows;
      const response = {
        items: slice.map((item) => ({
          ...item,
          _count: {
            departures: item._count.departures ?? 0,
            passengers: item._count.passengers ?? 0,
            inventories: item._count.inventories ?? 0,
            bookings: item._count.bookings ?? 0,
          },
          public_id: getGroupPublicId(item),
        })),
        next_cursor: hasMore ? slice[slice.length - 1].id_travel_group : null,
      } as Record<string, unknown>;

      if (bookingLinkPartial) {
        response.code = "GROUP_BOOKING_LINK_PARTIAL";
        response.warning =
          "La vinculación automática con reservas todavía no está disponible en esta base.";
        response.solution =
          "Podés crear y gestionar grupales. Para vincular reservas, aplicá la migración pendiente de reservas.";
      }

      return res.status(200).json(response);
    } catch (error) {
      if (isGroupSchemaUnavailableError(error)) {
        return res.status(200).json({
          items: [],
          next_cursor: null,
          warning:
            "La estructura de grupales todavía no está disponible en esta base.",
          code: "GROUP_SCHEMA_UNAVAILABLE",
          solution:
            "Aplicá las migraciones pendientes sobre la base usada por la app (DATABASE_URL) y refrescá la pantalla.",
        });
      }
      console.error("[groups][GET]", error);
      return groupApiError(res, 500, "No pudimos listar las grupales.", {
        code: "GROUP_LIST_ERROR",
        solution: "Reintentá en unos segundos. Si persiste, contactá a soporte.",
      });
    }
  }

  if (req.method === "POST") {
    if (!canWriteGroups(auth.role)) {
      return groupApiError(res, 403, "No tenés permisos para crear grupales.", {
        code: "GROUP_CREATE_FORBIDDEN",
        solution: "Solicitá permisos de edición de grupales a un administrador.",
      });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = parseOptionalString(body.name, 120);
    if (!name) {
      return groupApiError(res, 400, "El nombre de la grupal es obligatorio.", {
        code: "GROUP_NAME_REQUIRED",
        solution: "Ingresá un nombre antes de crear la grupal.",
      });
    }

    const type = normalizeGroupType(body.type);
    if (!type) {
      return groupApiError(res, 400, "El tipo de grupal es inválido.", {
        code: "GROUP_TYPE_INVALID",
        solution: "Elegí un tipo válido: Agencia, Estudiantil o Precomprado.",
      });
    }

    const status = normalizeGroupStatus(body.status ?? "BORRADOR");
    if (!status) {
      return groupApiError(res, 400, "El estado inicial es inválido.", {
        code: "GROUP_STATUS_INVALID",
        solution: "Elegí un estado válido para crear la grupal.",
      });
    }

    const code = parseOptionalString(body.code, 80);
    if (hasOwn(body, "code") && code === undefined) {
      return groupApiError(res, 400, "El código de la grupal es inválido.", {
        code: "GROUP_CODE_INVALID",
        solution: "Usá un código de hasta 80 caracteres o dejalo vacío.",
      });
    }
    const description = parseOptionalString(body.description, 1000);
    if (hasOwn(body, "description") && description === undefined) {
      return groupApiError(res, 400, "La descripción es inválida.", {
        code: "GROUP_DESCRIPTION_INVALID",
        solution: "Usá una descripción de hasta 1000 caracteres o dejala vacía.",
      });
    }
    const note = parseOptionalString(body.note, 1000);
    if (hasOwn(body, "note") && note === undefined) {
      return groupApiError(res, 400, "La nota interna es inválida.", {
        code: "GROUP_NOTE_INVALID",
        solution: "Usá una nota de hasta 1000 caracteres o dejala vacía.",
      });
    }
    const currency = parseOptionalString(body.currency, 12);
    if (hasOwn(body, "currency") && currency === undefined) {
      return groupApiError(res, 400, "La moneda es inválida.", {
        code: "GROUP_CURRENCY_INVALID",
        solution: "Ingresá una moneda válida (ejemplo: ARS, USD) o dejala vacía.",
      });
    }
    const saleMode = parseOptionalString(body.sale_mode, 50);
    if (hasOwn(body, "sale_mode") && saleMode === undefined) {
      return groupApiError(res, 400, "El modo de venta es inválido.", {
        code: "GROUP_SALE_MODE_INVALID",
        solution: "Usá un texto de hasta 50 caracteres o dejalo vacío.",
      });
    }

    const startDate = parseOptionalDate(body.start_date);
    if (hasOwn(body, "start_date") && startDate === undefined) {
      return groupApiError(res, 400, "La fecha de inicio es inválida.", {
        code: "GROUP_START_DATE_INVALID",
        solution: "Ingresá una fecha válida con formato AAAA-MM-DD o dejala vacía.",
      });
    }
    const endDate = parseOptionalDate(body.end_date);
    if (hasOwn(body, "end_date") && endDate === undefined) {
      return groupApiError(res, 400, "La fecha de fin es inválida.", {
        code: "GROUP_END_DATE_INVALID",
        solution: "Ingresá una fecha válida con formato AAAA-MM-DD o dejala vacía.",
      });
    }
    if (
      startDate instanceof Date &&
      endDate instanceof Date &&
      endDate.getTime() < startDate.getTime()
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

    const capacityMode = normalizeCapacityMode(body.capacity_mode ?? "TOTAL");
    if (!capacityMode) {
      return groupApiError(res, 400, "El modo de cupo es inválido.", {
        code: "GROUP_CAPACITY_MODE_INVALID",
        solution: "Elegí cupo total o cupo por servicio.",
      });
    }

    const capacityTotal = parseOptionalInt(body.capacity_total);
    if (hasOwn(body, "capacity_total") && capacityTotal === undefined) {
      return groupApiError(res, 400, "El cupo total es inválido.", {
        code: "GROUP_CAPACITY_TOTAL_INVALID",
        solution: "Ingresá un número válido o dejalo vacío.",
      });
    }

    const allowOverbooking = parseOptionalBoolean(body.allow_overbooking);
    if (hasOwn(body, "allow_overbooking") && allowOverbooking === undefined) {
      return groupApiError(res, 400, "La opción de sobreventa es inválida.", {
        code: "GROUP_OVERBOOKING_FLAG_INVALID",
        solution: "Enviá un valor booleano: true o false.",
      });
    }
    const overbookingLimit = parseOptionalInt(body.overbooking_limit);
    if (hasOwn(body, "overbooking_limit") && overbookingLimit === undefined) {
      return groupApiError(res, 400, "El límite de sobreventa es inválido.", {
        code: "GROUP_OVERBOOKING_LIMIT_INVALID",
        solution: "Ingresá un número válido o dejalo vacío.",
      });
    }
    const waitlistEnabled = parseOptionalBoolean(body.waitlist_enabled);
    if (hasOwn(body, "waitlist_enabled") && waitlistEnabled === undefined) {
      return groupApiError(res, 400, "La opción de lista de espera es inválida.", {
        code: "GROUP_WAITLIST_FLAG_INVALID",
        solution: "Enviá un valor booleano: true o false.",
      });
    }
    const waitlistLimit = parseOptionalInt(body.waitlist_limit);
    if (hasOwn(body, "waitlist_limit") && waitlistLimit === undefined) {
      return groupApiError(res, 400, "El límite de lista de espera es inválido.", {
        code: "GROUP_WAITLIST_LIMIT_INVALID",
        solution: "Ingresá un número válido o dejalo vacío.",
      });
    }

    const customFields = toJsonInput(body.custom_fields);
    if (customFields === undefined && body.custom_fields !== undefined) {
      return groupApiError(res, 400, "Los campos personalizados son inválidos.", {
        code: "GROUP_CUSTOM_FIELDS_INVALID",
        solution: "Enviá un objeto JSON válido en custom_fields.",
      });
    }

    const departuresRaw = Array.isArray(body.departures) ? body.departures : [];
    const departures: TravelGroupCreateDepartureInput[] = [];
    for (let i = 0; i < departuresRaw.length; i += 1) {
      const parsed = parseDepartureCreate(departuresRaw[i], i);
      if (parsed.error || !parsed.value) {
        return groupApiError(res, 400, parsed.error ?? "La salida es inválida.", {
          code: "GROUP_DEPARTURE_INVALID",
          solution: "Corregí los datos de la salida y volvé a intentar.",
        });
      }
      departures.push(parsed.value);
    }

    try {
      const createdGroup = await prisma.$transaction(async (tx) => {
        const agencyTravelGroupId = await getNextAgencyCounterSafe(
          tx,
          auth.id_agency,
          "travel_group",
        );

        const group = await tx.travelGroup.create({
          data: {
            agency_travel_group_id: agencyTravelGroupId,
            id_agency: auth.id_agency,
            id_user: auth.id_user,
            name,
            code,
            type,
            status,
            description,
            note,
            start_date: startDate,
            end_date: endDate,
            currency,
            capacity_mode: capacityMode,
            capacity_total: capacityTotal,
            allow_overbooking: allowOverbooking ?? false,
            overbooking_limit: overbookingLimit,
            waitlist_enabled: waitlistEnabled ?? false,
            waitlist_limit: waitlistLimit,
            sale_mode: saleMode,
            custom_fields:
              customFields == null ? Prisma.DbNull : customFields,
          },
          select: { id_travel_group: true },
        });

        for (const departure of departures) {
          const agencyTravelGroupDepartureId = await getNextAgencyCounterSafe(
            tx,
            auth.id_agency,
            "travel_group_departure",
          );
          await tx.travelGroupDeparture.create({
            data: {
              agency_travel_group_departure_id: agencyTravelGroupDepartureId,
              id_agency: auth.id_agency,
              travel_group_id: group.id_travel_group,
              ...departure,
              price_list:
                departure.price_list == null
                  ? Prisma.DbNull
                  : departure.price_list,
            },
          });
        }

        return group.id_travel_group;
      });

      let bookingLinkPartial = false;
      let full: GroupCreateResponseRow | null = null;

      try {
        full = await prisma.travelGroup.findUnique({
          where: { id_travel_group: createdGroup },
          include: {
            departures: {
              orderBy: [
                { departure_date: "asc" },
                { id_travel_group_departure: "asc" },
              ],
            },
            _count: {
              select: {
                departures: true,
                passengers: true,
                bookings: true,
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
        console.warn(
          "[groups][POST] Grupal creada sin conteo de reservas por migración parcial de Booking.",
        );
        full = await prisma.travelGroup.findUnique({
          where: { id_travel_group: createdGroup },
          include: {
            departures: {
              orderBy: [
                { departure_date: "asc" },
                { id_travel_group_departure: "asc" },
              ],
            },
            _count: {
              select: {
                departures: true,
                passengers: true,
                inventories: true,
              },
            },
          },
        });
      }

      if (!full) {
        return groupApiError(res, 500, "No pudimos recuperar la grupal creada.", {
          code: "GROUP_CREATE_FETCH_ERROR",
          solution: "Refrescá la pantalla y verificá si la grupal se creó correctamente.",
        });
      }

      const response = {
        ...full,
        _count: {
          departures: full._count.departures ?? 0,
          passengers: full._count.passengers ?? 0,
          inventories: full._count.inventories ?? 0,
          bookings: full._count.bookings ?? 0,
        },
        public_id: getGroupPublicId(full),
        departures: full.departures.map((dep) => ({
          ...dep,
          public_id: getDeparturePublicId(dep),
        })),
      } as Record<string, unknown>;
      if (bookingLinkPartial) {
        response.code = "GROUP_BOOKING_LINK_PARTIAL";
        response.warning =
          "La grupal se creó, pero todavía no está habilitada la vinculación automática con reservas.";
        response.solution =
          "Aplicá la migración pendiente de reservas para habilitar ese vínculo.";
      }

      return res.status(201).json(response);
    } catch (error) {
      if (isGroupSchemaUnavailableError(error)) {
        return groupApiError(
          res,
          503,
          "La base de datos todavía no tiene habilitada la estructura de grupales.",
          {
            code: "GROUP_SCHEMA_UNAVAILABLE",
            solution:
              "Aplicá las migraciones pendientes sobre DATABASE_URL y volvé a intentar.",
          },
        );
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      ) {
        const fieldName = getKnownErrorMetaString(error, "field_name").toLowerCase();
        if (fieldName.includes("agencycounter_id_agency_fkey")) {
          return groupApiError(
            res,
            400,
            "No pudimos asociar la grupal a tu agencia actual.",
            {
              code: "GROUP_AGENCY_CONTEXT_INVALID",
              solution:
                "Cerrá sesión y volvé a ingresar para actualizar tu contexto de agencia.",
            },
          );
        }
        if (fieldName.includes("travelgroup_id_agency_fkey")) {
          return groupApiError(
            res,
            400,
            "No pudimos validar la agencia de la grupal.",
            {
              code: "GROUP_AGENCY_NOT_FOUND",
              solution:
                "Cerrá sesión, volvé a ingresar y verificá que tu usuario esté asociado a una agencia activa.",
            },
          );
        }
      }
      console.error("[groups][POST]", error);
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return groupApiError(res, 409, "Ya existe una grupal con ese código o correlativo.", {
          code: "GROUP_DUPLICATE",
          solution: "Usá un código distinto y volvé a intentar.",
        });
      }
      return groupApiError(res, 500, "No pudimos crear la grupal.", {
        code: "GROUP_CREATE_ERROR",
        solution: "Verificá los datos y volvé a intentar.",
      });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return groupApiError(res, 405, "Método no permitido para esta ruta.", {
    code: "METHOD_NOT_ALLOWED",
    details: `Método recibido: ${req.method ?? "desconocido"}.`,
    solution: "Usá GET para listar o POST para crear grupales.",
  });
}
