import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  canManageGroupConfig,
  normalizeGroupTemplateTarget,
  parseOptionalBoolean,
  parseOptionalString,
  parsePositiveInt,
  requireAuth,
  toDistinctPositiveInts,
  toJsonInput,
} from "@/lib/groups/apiShared";
import { parseTemplateInstallments } from "@/lib/groups/paymentTemplatesShared";
import { groupApiError } from "@/lib/groups/apiErrors";

function pickParam(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const rawTemplateId = pickParam(req.query.templateId);
  const templateId = parsePositiveInt(rawTemplateId);
  if (!templateId) {
    return groupApiError(res, 400, "El identificador de plantilla es inválido.", {
      code: "GROUP_TEMPLATE_ID_INVALID",
      solution: "Refrescá la pantalla y elegí una plantilla válida.",
    });
  }

  const template = await prisma.travelGroupPaymentTemplate.findFirst({
    where: {
      id_travel_group_payment_template: templateId,
      id_agency: auth.id_agency,
    },
  });
  if (!template) {
    return groupApiError(res, 404, "No encontramos la plantilla solicitada.", {
      code: "GROUP_TEMPLATE_NOT_FOUND",
      solution: "Refrescá la pantalla y volvé a intentar.",
    });
  }

  if (req.method === "GET") {
    return res.status(200).json(template);
  }

  if (req.method === "PATCH") {
    if (!canManageGroupConfig(auth.role)) {
      return groupApiError(res, 403, "No tenés permisos para editar plantillas.", {
        code: "GROUP_TEMPLATE_UPDATE_FORBIDDEN",
        solution: "Solicitá permisos de configuración a un administrador.",
      });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch: Prisma.TravelGroupPaymentTemplateUncheckedUpdateInput = {};

    if (body.name !== undefined) {
      const name = parseOptionalString(body.name, 120);
      if (!name) {
        return groupApiError(res, 400, "El nombre de la plantilla es inválido.", {
          code: "GROUP_TEMPLATE_NAME_INVALID",
          solution: "Ingresá un nombre de hasta 120 caracteres.",
        });
      }
      patch.name = name;
    }
    if (body.description !== undefined) {
      const description = parseOptionalString(body.description, 400);
      if (description === undefined) {
        return groupApiError(res, 400, "La descripción de la plantilla es inválida.", {
          code: "GROUP_TEMPLATE_DESCRIPTION_INVALID",
          solution: "Usá hasta 400 caracteres o dejá el campo vacío.",
        });
      }
      patch.description = description;
    }
    if (body.payment_mode !== undefined) {
      const paymentMode = parseOptionalString(body.payment_mode, 60);
      if (paymentMode === undefined) {
        return groupApiError(res, 400, "El modo de pago es inválido.", {
          code: "GROUP_TEMPLATE_PAYMENT_MODE_INVALID",
          solution: "Usá un texto de hasta 60 caracteres.",
        });
      }
      patch.payment_mode = paymentMode;
    }
    if (body.target_type !== undefined) {
      const raw = body.target_type;
      const targetType = normalizeGroupTemplateTarget(raw);
      if (raw !== null && raw !== "" && !targetType) {
        return groupApiError(res, 400, "El tipo de grupal de destino es inválido.", {
          code: "GROUP_TEMPLATE_TARGET_TYPE_INVALID",
          solution: "Elegí Agencia, Estudiantil, Precomprado o dejalo vacío para todos.",
        });
      }
      patch.target_type = targetType;
    }
    if (body.is_active !== undefined) {
      const isActive = parseOptionalBoolean(body.is_active);
      if (isActive === undefined || isActive === null) {
        return groupApiError(res, 400, "El estado activo/inactivo es inválido.", {
          code: "GROUP_TEMPLATE_ACTIVE_FLAG_INVALID",
          solution: "Enviá un valor booleano: true o false.",
        });
      }
      patch.is_active = isActive;
    }
    if (body.assigned_user_ids !== undefined) {
      if (!Array.isArray(body.assigned_user_ids)) {
        return groupApiError(res, 400, "La lista de usuarios asignados es inválida.", {
          code: "GROUP_TEMPLATE_ASSIGNED_USERS_INVALID",
          solution: "Enviá una lista de IDs de usuarios o dejá el campo vacío.",
        });
      }
      const assignedUserIds = toDistinctPositiveInts(body.assigned_user_ids);
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
      patch.assigned_user_ids = assignedUserIds;
    }
    if (body.installments !== undefined) {
      const installments = parseTemplateInstallments(body.installments);
      if (!installments) {
        return groupApiError(res, 400, "Las cuotas de la plantilla son inválidas.", {
          code: "GROUP_TEMPLATE_INSTALLMENTS_INVALID",
          solution: "Revisá días desde la fecha base, monto y moneda en cada cuota.",
        });
      }
      patch.installments = installments as unknown as Prisma.InputJsonValue;
    }
    if (body.metadata !== undefined) {
      const metadata = toJsonInput(body.metadata);
      if (metadata === undefined) {
        return groupApiError(res, 400, "Los datos adicionales son inválidos.", {
          code: "GROUP_TEMPLATE_METADATA_INVALID",
          solution: "Enviá un objeto JSON válido en metadata.",
        });
      }
      patch.metadata = metadata == null ? Prisma.DbNull : metadata;
    }

    if (Object.keys(patch).length === 0) {
      return groupApiError(res, 400, "No se detectaron cambios para guardar.", {
        code: "GROUP_TEMPLATE_NO_CHANGES",
        solution: "Modificá al menos un campo antes de guardar.",
      });
    }

    try {
      const updated = await prisma.travelGroupPaymentTemplate.update({
        where: { id_travel_group_payment_template: template.id_travel_group_payment_template },
        data: patch,
      });
      return res.status(200).json(updated);
    } catch (error) {
      console.error("[groups][config][payment-templates][PATCH]", error);
      return groupApiError(res, 500, "No pudimos actualizar la plantilla.", {
        code: "GROUP_TEMPLATE_UPDATE_ERROR",
        solution: "Revisá los datos y volvé a intentar.",
      });
    }
  }

  if (req.method === "DELETE") {
    if (!canManageGroupConfig(auth.role)) {
      return groupApiError(res, 403, "No tenés permisos para eliminar plantillas.", {
        code: "GROUP_TEMPLATE_DELETE_FORBIDDEN",
        solution: "Solicitá permisos de configuración a un administrador.",
      });
    }

    try {
      await prisma.travelGroupPaymentTemplate.delete({
        where: { id_travel_group_payment_template: template.id_travel_group_payment_template },
      });
      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error("[groups][config][payment-templates][DELETE]", error);
      return groupApiError(res, 500, "No pudimos eliminar la plantilla.", {
        code: "GROUP_TEMPLATE_DELETE_ERROR",
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
