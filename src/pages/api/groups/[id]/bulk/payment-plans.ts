import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import {
  canManageGroupConfig,
  canWriteGroups,
  isLockedGroupStatus,
  parseGroupWhereInput,
  parsePositiveInt,
  requireAuth,
  toDistinctPositiveInts,
} from "@/lib/groups/apiShared";
import { parseTemplateInstallments } from "@/lib/groups/paymentTemplatesShared";
import { groupApiError } from "@/lib/groups/apiErrors";

type InstallmentInput = {
  due_date?: unknown;
  amount?: unknown;
  currency?: unknown;
  service_id?: unknown;
};

type Body = {
  passengerIds?: unknown;
  installments?: unknown;
  replacePending?: unknown;
  templateId?: unknown;
  template_base_date?: unknown;
};

function pickParam(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] : value;
}

function parseDueDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ymd = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    return new Date(
      Number(ymd[1]),
      Number(ymd[2]) - 1,
      Number(ymd[3]),
      0,
      0,
      0,
      0,
    );
  }
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function parseInstallments(raw: unknown): Array<{
  due_date: Date;
  amount: Prisma.Decimal;
  currency: string;
  service_id?: number;
}> | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const output: Array<{
    due_date: Date;
    amount: Prisma.Decimal;
    currency: string;
    service_id?: number;
  }> = [];

  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i] as InstallmentInput;
    const dueDate = parseDueDate(item?.due_date);
    if (!dueDate) return null;

    const amountNum =
      typeof item?.amount === "number"
        ? item.amount
        : Number(String(item?.amount ?? "").replace(",", "."));
    if (!Number.isFinite(amountNum) || amountNum <= 0) return null;

    const currency =
      typeof item?.currency === "string" ? item.currency.trim().toUpperCase() : "";
    if (!currency) return null;

    const serviceIdRaw = Number(item?.service_id);
    const serviceId =
      Number.isFinite(serviceIdRaw) && serviceIdRaw > 0
        ? Math.trunc(serviceIdRaw)
        : undefined;

    output.push({
      due_date: dueDate,
      amount: new Prisma.Decimal(amountNum).toDecimalPlaces(2),
      currency,
      ...(serviceId ? { service_id: serviceId } : {}),
    });
  }

  return output;
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
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
      solution: "Usá una solicitud POST para crear planes de pago en lote.",
    });
  }

  const auth = await requireAuth(req, res);
  if (!auth) return;
  if (!canWriteGroups(auth.role)) {
    return groupApiError(res, 403, "No tenés permisos para crear planes de pago en lote.", {
      code: "GROUP_PAYMENT_PLAN_FORBIDDEN",
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
    select: { id_travel_group: true, status: true, type: true, start_date: true },
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
      "No se pueden crear planes en grupales cerradas o canceladas.",
      {
        code: "GROUP_LOCKED",
        solution: "Cambiá el estado de la grupal antes de crear planes masivos.",
      },
    );
  }

  const body = (req.body ?? {}) as Body;
  const passengerIds = toDistinctPositiveInts(body.passengerIds);
  if (passengerIds.length === 0) {
    return groupApiError(res, 400, "No se enviaron pasajeros válidos.", {
      code: "GROUP_PASSENGER_IDS_INVALID",
      solution: "Seleccioná al menos un pasajero y volvé a intentar.",
    });
  }

  const templateId = parsePositiveInt(body.templateId);
  let installments = parseInstallments(body.installments);

  if (installments && templateId) {
    return groupApiError(
      res,
      400,
      "No se pueden usar cuotas manuales y plantilla al mismo tiempo.",
      {
        code: "GROUP_PAYMENT_PLAN_SOURCE_CONFLICT",
        solution: "Elegí una sola opción: cuotas manuales o plantilla.",
      },
    );
  }

  if (!installments && templateId) {
    const template = await prisma.travelGroupPaymentTemplate.findFirst({
      where: {
        id_travel_group_payment_template: templateId,
        id_agency: auth.id_agency,
        is_active: true,
      },
      select: {
        id_travel_group_payment_template: true,
        target_type: true,
        assigned_user_ids: true,
        installments: true,
      },
    });
    if (!template) {
      return groupApiError(res, 404, "No encontramos la plantilla de pago.", {
        code: "GROUP_PAYMENT_TEMPLATE_NOT_FOUND",
        solution: "Verificá la plantilla seleccionada o refrescá la pantalla.",
      });
    }

    if (template.target_type && template.target_type !== group.type) {
      return groupApiError(
        res,
        400,
        "La plantilla seleccionada no aplica al tipo de esta grupal.",
        {
          code: "GROUP_PAYMENT_TEMPLATE_TYPE_MISMATCH",
          solution: "Elegí una plantilla para este tipo de grupal o dejá cuotas manuales.",
        },
      );
    }

    const assignedUsers = template.assigned_user_ids ?? [];
    if (
      assignedUsers.length > 0 &&
      !assignedUsers.includes(auth.id_user) &&
      !canManageGroupConfig(auth.role)
    ) {
      return groupApiError(
        res,
        403,
        "No tenés permisos para usar esta plantilla de pago.",
        {
          code: "GROUP_PAYMENT_TEMPLATE_FORBIDDEN",
          solution: "Solicitá acceso a esta plantilla o elegí otra disponible.",
        },
      );
    }

    const templateRows = parseTemplateInstallments(template.installments);
    if (!templateRows) {
      return groupApiError(res, 400, "La plantilla tiene cuotas inválidas.", {
        code: "GROUP_PAYMENT_TEMPLATE_INSTALLMENTS_INVALID",
        solution: "Revisá la configuración de cuotas de esa plantilla.",
      });
    }

    const baseDateRaw = body.template_base_date;
    const baseDate = parseDueDate(baseDateRaw);
    if (baseDateRaw !== undefined && !baseDate) {
      return groupApiError(res, 400, "La fecha base de la plantilla es inválida.", {
        code: "GROUP_TEMPLATE_BASE_DATE_INVALID",
        solution: "Ingresá una fecha válida con formato AAAA-MM-DD.",
      });
    }
    const effectiveBaseDate = baseDate ?? group.start_date ?? new Date();

    installments = templateRows.map((row) => ({
      due_date: addDays(effectiveBaseDate, row.due_in_days),
      amount: new Prisma.Decimal(row.amount).toDecimalPlaces(2),
      currency: row.currency,
    }));
  }

  if (!installments) {
    return groupApiError(
      res,
      400,
      "No se enviaron cuotas válidas para generar el plan de pago.",
      {
        code: "GROUP_PAYMENT_PLAN_INVALID",
        solution:
          "Completá cuotas manuales válidas o elegí una plantilla con cuotas configuradas.",
      },
    );
  }

  const replacePending = body.replacePending === true;

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
    },
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

  const validTargets = passengers.filter(
    (p): p is { id_travel_group_passenger: number; booking_id: number; client_id: number } =>
      typeof p.booking_id === "number" &&
      p.booking_id > 0 &&
      typeof p.client_id === "number" &&
      p.client_id > 0,
  );
  if (validTargets.length === 0) {
    return groupApiError(
      res,
      400,
      "Los pasajeros seleccionados no tienen reservas o clientes vinculados.",
      {
        code: "GROUP_PASSENGER_TARGET_INVALID",
        solution: "Revisá que cada pasajero tenga reserva y cliente asignados.",
      },
    );
  }

  const bookingIds = Array.from(new Set(validTargets.map((t) => t.booking_id)));
  const bookings = await prisma.booking.findMany({
    where: {
      id_booking: { in: bookingIds },
      id_agency: auth.id_agency,
      travel_group_id: group.id_travel_group,
    },
    select: { id_booking: true },
  });
  if (bookings.length !== bookingIds.length) {
    return groupApiError(
      res,
      400,
      "Algunas reservas vinculadas no son válidas para esta grupal.",
      {
        code: "GROUP_BOOKING_SCOPE_INVALID",
        solution: "Refrescá la pantalla y revisá las reservas de los pasajeros seleccionados.",
      },
    );
  }

  const requestedServiceIds = Array.from(
    new Set(
      installments
        .map((item) => item.service_id)
        .filter((id): id is number => typeof id === "number"),
    ),
  );
  if (requestedServiceIds.length > 0) {
    const services = await prisma.service.findMany({
      where: {
        id_agency: auth.id_agency,
        id_service: { in: requestedServiceIds },
        booking_id: { in: bookingIds },
      },
      select: { id_service: true },
    });
    const serviceSet = new Set(services.map((s) => s.id_service));
    const invalid = requestedServiceIds.filter((id) => !serviceSet.has(id));
    if (invalid.length > 0) {
      return groupApiError(
        res,
        400,
        `Hay servicios inválidos para esta grupal: ${invalid.join(", ")}`,
        {
          code: "GROUP_SERVICE_SCOPE_INVALID",
          solution: "Verificá los servicios vinculados a las reservas seleccionadas.",
        },
      );
    }
  }

  let createdCount = 0;
  let cancelledCount = 0;

  try {
    await prisma.$transaction(async (tx) => {
      for (const passenger of validTargets) {
        if (replacePending) {
          const pending = await tx.clientPayment.findMany({
            where: {
              id_agency: auth.id_agency,
              booking_id: passenger.booking_id,
              client_id: passenger.client_id,
              status: "PENDIENTE",
            },
            select: { id_payment: true, status: true },
          });

          if (pending.length > 0) {
            await tx.clientPayment.updateMany({
              where: {
                id_payment: { in: pending.map((item) => item.id_payment) },
                id_agency: auth.id_agency,
              },
              data: {
                status: "CANCELADA",
                status_reason: "Reemplazada por plan masivo de grupal",
              },
            });
            cancelledCount += pending.length;

            for (const item of pending) {
              await tx.clientPaymentAudit.create({
                data: {
                  client_payment_id: item.id_payment,
                  id_agency: auth.id_agency,
                  action: "STATUS_CHANGED",
                  from_status: item.status,
                  to_status: "CANCELADA",
                  reason: "Reemplazada por plan masivo",
                  changed_by: auth.id_user,
                },
              });
            }
          }
        }

        for (const installment of installments) {
          const agencyPaymentId = await getNextAgencyCounter(
            tx,
            auth.id_agency,
            "client_payment",
          );
          const created = await tx.clientPayment.create({
            data: {
              agency_client_payment_id: agencyPaymentId,
              id_agency: auth.id_agency,
              booking_id: passenger.booking_id,
              client_id: passenger.client_id,
              service_id: installment.service_id ?? null,
              amount: installment.amount,
              currency: installment.currency,
              due_date: installment.due_date,
              status: "PENDIENTE",
            },
            select: { id_payment: true },
          });

          await tx.clientPaymentAudit.create({
            data: {
              client_payment_id: created.id_payment,
              id_agency: auth.id_agency,
              action: "CREATED",
              from_status: null,
              to_status: "PENDIENTE",
              reason: "Plan masivo de grupal",
              changed_by: auth.id_user,
              data: {
                group_id: group.id_travel_group,
                passenger_id: passenger.id_travel_group_passenger,
              },
            },
          });
          createdCount += 1;
        }
      }
    });

    return res.status(201).json({
      ok: true,
      created_count: createdCount,
      cancelled_pending_count: cancelledCount,
      passengers_count: validTargets.length,
      installments_per_passenger: installments.length,
      template_id: templateId ?? null,
    });
  } catch (error) {
    console.error("[groups][bulk][payment-plans]", error);
    return groupApiError(res, 500, "No pudimos crear los planes de pago en lote.", {
      code: "GROUP_PAYMENT_PLAN_ERROR",
      solution: "Reintentá en unos segundos.",
    });
  }
}
