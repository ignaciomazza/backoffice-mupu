import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  canWriteGroups,
  isLockedGroupStatus,
  parseGroupWhereInput,
  parsePositiveInt,
  requireAuth,
} from "@/lib/groups/apiShared";
import { groupApiError } from "@/lib/groups/apiErrors";

function pickParam(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] : value;
}

function normalizeStatus(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toUpperCase();
}

function isMissingTableError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  return error.code === "P2021" || error.code === "P2022";
}

async function tableExists(tableName: string): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>(
      Prisma.sql`SELECT to_regclass(${`public."${tableName}"`}) IS NOT NULL AS "exists"`,
    );
    return rows[0]?.exists === true;
  } catch {
    return false;
  }
}

async function safeFinanceCount(
  tableName: string,
  countFn: () => Promise<number>,
): Promise<number> {
  const exists = await tableExists(tableName);
  if (!exists) return 0;
  try {
    return await countFn();
  } catch (error) {
    if (isMissingTableError(error)) return 0;
    throw error;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", ["DELETE"]);
    return groupApiError(res, 405, "Método no permitido para esta ruta.", {
      code: "METHOD_NOT_ALLOWED",
      details: `Método recibido: ${req.method ?? "desconocido"}.`,
      solution: "Usá DELETE para eliminar un pasajero de la grupal.",
    });
  }

  const auth = await requireAuth(req, res);
  if (!auth) return;
  if (!canWriteGroups(auth.role)) {
    return groupApiError(res, 403, "No tenés permisos para eliminar pasajeros.", {
      code: "GROUP_PASSENGER_DELETE_FORBIDDEN",
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
    select: { id_travel_group: true, status: true },
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
      "No se pueden eliminar pasajeros en grupales cerradas o canceladas.",
      {
        code: "GROUP_LOCKED",
        solution: "Cambiá el estado de la grupal antes de continuar.",
      },
    );
  }

  const passengerIdRaw = pickParam(req.query.passengerId);
  const passengerId = parsePositiveInt(passengerIdRaw);
  if (!passengerId) {
    return groupApiError(res, 400, "El identificador del pasajero es inválido.", {
      code: "GROUP_PASSENGER_ID_INVALID",
      solution: "Refrescá la pantalla y volvé a intentarlo.",
    });
  }

  const passenger = await prisma.travelGroupPassenger.findFirst({
    where: {
      id_travel_group_passenger: passengerId,
      id_agency: auth.id_agency,
      travel_group_id: group.id_travel_group,
    },
    select: {
      id_travel_group_passenger: true,
      booking_id: true,
      status: true,
      waitlist_position: true,
    },
  });
  if (!passenger) {
    return groupApiError(res, 404, "No encontramos ese pasajero en la grupal.", {
      code: "GROUP_PASSENGER_NOT_FOUND",
      solution: "Refrescá la lista y volvé a intentar.",
    });
  }

  const [
    clientPaymentsCount,
    receiptsCount,
    invoicesCount,
    operatorDuesCount,
    operatorPaymentsCount,
  ] = await Promise.all([
    safeFinanceCount("TravelGroupClientPayment", () =>
      prisma.travelGroupClientPayment.count({
        where: {
          id_agency: auth.id_agency,
          travel_group_id: group.id_travel_group,
          travel_group_passenger_id: passenger.id_travel_group_passenger,
        },
      }),
    ),
    safeFinanceCount("TravelGroupReceipt", () =>
      prisma.travelGroupReceipt.count({
        where: {
          id_agency: auth.id_agency,
          travel_group_id: group.id_travel_group,
          travel_group_passenger_id: passenger.id_travel_group_passenger,
        },
      }),
    ),
    safeFinanceCount("TravelGroupInvoice", () =>
      prisma.travelGroupInvoice.count({
        where: {
          id_agency: auth.id_agency,
          travel_group_id: group.id_travel_group,
          travel_group_passenger_id: passenger.id_travel_group_passenger,
        },
      }),
    ),
    safeFinanceCount("TravelGroupOperatorDue", () =>
      prisma.travelGroupOperatorDue.count({
        where: {
          id_agency: auth.id_agency,
          travel_group_id: group.id_travel_group,
          travel_group_passenger_id: passenger.id_travel_group_passenger,
        },
      }),
    ),
    safeFinanceCount("TravelGroupOperatorPayment", () =>
      prisma.travelGroupOperatorPayment.count({
        where: {
          id_agency: auth.id_agency,
          travel_group_id: group.id_travel_group,
          travel_group_passenger_id: passenger.id_travel_group_passenger,
        },
      }),
    ),
  ]);

  const linkedFinanceCount =
    clientPaymentsCount +
    receiptsCount +
    invoicesCount +
    operatorDuesCount +
    operatorPaymentsCount;
  if (linkedFinanceCount > 0) {
    return groupApiError(
      res,
      409,
      "No podés eliminar un pasajero con movimientos financieros asociados.",
      {
        code: "GROUP_PASSENGER_DELETE_BLOCKED",
        solution:
          "Eliminá o reasigná primero cuotas, recibos, facturas, vencimientos y pagos del pasajero.",
      },
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.travelGroupPassenger.delete({
        where: {
          id_travel_group_passenger: passenger.id_travel_group_passenger,
        },
      });

      const bookingId =
        typeof passenger.booking_id === "number" && passenger.booking_id > 0
          ? passenger.booking_id
          : null;
      if (bookingId) {
        const paxCount = await tx.travelGroupPassenger.count({
          where: {
            id_agency: auth.id_agency,
            travel_group_id: group.id_travel_group,
            booking_id: bookingId,
          },
        });
        await tx.booking.updateMany({
          where: {
            id_booking: bookingId,
            id_agency: auth.id_agency,
          },
          data: {
            pax_count: Math.max(paxCount, 0),
          },
        });
      }

      const normalizedStatus = normalizeStatus(passenger.status);
      if (
        normalizedStatus === "LISTA_ESPERA" &&
        typeof passenger.waitlist_position === "number" &&
        passenger.waitlist_position > 0
      ) {
        await tx.travelGroupPassenger.updateMany({
          where: {
            id_agency: auth.id_agency,
            travel_group_id: group.id_travel_group,
            status: "LISTA_ESPERA",
            waitlist_position: {
              gt: passenger.waitlist_position,
            },
          },
          data: {
            waitlist_position: {
              decrement: 1,
            },
          },
        });
      }
    });

    return res.status(200).json({
      ok: true,
      deleted_passenger_id: passenger.id_travel_group_passenger,
    });
  } catch (error) {
    console.error("[groups][passengers][DELETE]", error);
    return groupApiError(res, 500, "No pudimos eliminar el pasajero.", {
      code: "GROUP_PASSENGER_DELETE_ERROR",
      solution: "Reintentá en unos segundos.",
    });
  }
}
