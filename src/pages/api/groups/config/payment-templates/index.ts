import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import {
  canManageGroupConfig,
  normalizeGroupTemplateTarget,
  parseOptionalBoolean,
  parseOptionalString,
  requireAuth,
  toDistinctPositiveInts,
  toJsonInput,
} from "@/lib/groups/apiShared";
import { parseTemplateInstallments } from "@/lib/groups/paymentTemplatesShared";
import { groupApiError } from "@/lib/groups/apiErrors";

function pickBool(value: unknown, fallback: boolean): boolean {
  const parsed = parseOptionalBoolean(value);
  if (parsed === undefined || parsed === null) return fallback;
  return parsed;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  if (req.method === "GET") {
    try {
      const target = normalizeGroupTemplateTarget(req.query.target_type);
      const onlyActive = pickBool(req.query.only_active, true);

      const rows = await prisma.travelGroupPaymentTemplate.findMany({
        where: {
          id_agency: auth.id_agency,
          ...(target ? { OR: [{ target_type: target }, { target_type: null }] } : {}),
          ...(onlyActive ? { is_active: true } : {}),
        },
        orderBy: [{ is_preloaded: "desc" }, { name: "asc" }],
        select: {
          id_travel_group_payment_template: true,
          agency_travel_group_payment_template_id: true,
          name: true,
          description: true,
          target_type: true,
          payment_mode: true,
          is_active: true,
          is_preloaded: true,
          assigned_user_ids: true,
          installments: true,
          metadata: true,
          created_at: true,
          updated_at: true,
          createdBy: {
            select: {
              id_user: true,
              first_name: true,
              last_name: true,
            },
          },
        },
      });

      return res.status(200).json({ items: rows });
    } catch (error) {
      console.error("[groups][config][payment-templates][GET]", error);
      return groupApiError(res, 500, "No pudimos listar las plantillas de pago.", {
        code: "GROUP_TEMPLATE_LIST_ERROR",
        solution: "Reintentá en unos segundos.",
      });
    }
  }

  if (req.method === "POST") {
    if (!canManageGroupConfig(auth.role)) {
      return groupApiError(res, 403, "No tenés permisos para crear plantillas.", {
        code: "GROUP_TEMPLATE_CREATE_FORBIDDEN",
        solution: "Solicitá permisos de configuración a un administrador.",
      });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = parseOptionalString(body.name, 120);
    if (!name) {
      return groupApiError(res, 400, "El nombre de la plantilla es obligatorio.", {
        code: "GROUP_TEMPLATE_NAME_REQUIRED",
        solution: "Ingresá un nombre corto y descriptivo.",
      });
    }

    const description = parseOptionalString(body.description, 400);
    if (description === undefined) {
      return groupApiError(res, 400, "La descripción de la plantilla es inválida.", {
        code: "GROUP_TEMPLATE_DESCRIPTION_INVALID",
        solution: "Usá hasta 400 caracteres o dejá el campo vacío.",
      });
    }

    const paymentMode = parseOptionalString(body.payment_mode, 60);
    if (paymentMode === undefined) {
      return groupApiError(res, 400, "El modo de pago es inválido.", {
        code: "GROUP_TEMPLATE_PAYMENT_MODE_INVALID",
        solution: "Usá un texto de hasta 60 caracteres.",
      });
    }

    const targetType = normalizeGroupTemplateTarget(body.target_type);
    if (body.target_type !== undefined && body.target_type !== null && body.target_type !== "" && !targetType) {
      return groupApiError(res, 400, "El tipo de grupal de destino es inválido.", {
        code: "GROUP_TEMPLATE_TARGET_TYPE_INVALID",
        solution: "Elegí Agencia, Estudiantil, Precomprado o dejalo vacío para todos.",
      });
    }

    const installments = parseTemplateInstallments(body.installments);
    if (!installments) {
      return groupApiError(res, 400, "Las cuotas de la plantilla son inválidas.", {
        code: "GROUP_TEMPLATE_INSTALLMENTS_INVALID",
        solution: "Revisá días desde la fecha base, monto y moneda en cada cuota.",
      });
    }

    const isActive = pickBool(body.is_active, true);
    const assignedUserIds = toDistinctPositiveInts(body.assigned_user_ids);
    if (body.assigned_user_ids !== undefined && !Array.isArray(body.assigned_user_ids)) {
      return groupApiError(res, 400, "La lista de usuarios asignados es inválida.", {
        code: "GROUP_TEMPLATE_ASSIGNED_USERS_INVALID",
        solution: "Enviá una lista de IDs de usuarios o dejá el campo vacío.",
      });
    }

    if (assignedUserIds.length > 0) {
      const users = await prisma.user.findMany({
        where: { id_agency: auth.id_agency, id_user: { in: assignedUserIds } },
        select: { id_user: true },
      });
      if (users.length !== assignedUserIds.length) {
        return groupApiError(res, 400, "Hay usuarios asignados que no existen.", {
          code: "GROUP_TEMPLATE_ASSIGNED_USERS_NOT_FOUND",
          solution: "Revisá los IDs de usuarios y volvé a intentar.",
        });
      }
    }

    const metadata = toJsonInput(body.metadata);
    if (metadata === undefined && body.metadata !== undefined) {
      return groupApiError(res, 400, "Los datos adicionales son inválidos.", {
        code: "GROUP_TEMPLATE_METADATA_INVALID",
        solution: "Enviá un objeto JSON válido en metadata.",
      });
    }

    try {
      const created = await prisma.$transaction(async (tx) => {
        const agencyTemplateId = await getNextAgencyCounter(
          tx,
          auth.id_agency,
          "travel_group_payment_template",
        );

        return tx.travelGroupPaymentTemplate.create({
          data: {
            agency_travel_group_payment_template_id: agencyTemplateId,
            id_agency: auth.id_agency,
            created_by: auth.id_user,
            name,
            description,
            target_type: targetType,
            payment_mode: paymentMode,
            is_active: isActive,
            is_preloaded: false,
            assigned_user_ids: assignedUserIds,
            installments: installments as unknown as Prisma.InputJsonValue,
            metadata: metadata == null ? Prisma.DbNull : metadata,
          },
          select: {
            id_travel_group_payment_template: true,
            agency_travel_group_payment_template_id: true,
            name: true,
            description: true,
            target_type: true,
            payment_mode: true,
            is_active: true,
            is_preloaded: true,
            assigned_user_ids: true,
            installments: true,
            metadata: true,
            created_at: true,
            updated_at: true,
          },
        });
      });

      return res.status(201).json(created);
    } catch (error) {
      console.error("[groups][config][payment-templates][POST]", error);
      return groupApiError(res, 500, "No pudimos crear la plantilla de pago.", {
        code: "GROUP_TEMPLATE_CREATE_ERROR",
        solution: "Revisá los datos y volvé a intentar.",
      });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return groupApiError(res, 405, "Método no permitido para esta ruta.", {
    code: "METHOD_NOT_ALLOWED",
    details: `Método recibido: ${req.method ?? "desconocido"}.`,
    solution: "Usá GET para listar o POST para crear plantillas.",
  });
}
