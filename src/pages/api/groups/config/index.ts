import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import {
  canManageGroupConfig,
  normalizeCapacityMode,
  parseOptionalBoolean,
  requireAuth,
  toDistinctStringArray,
} from "@/lib/groups/apiShared";
import { groupApiError } from "@/lib/groups/apiErrors";

const CAPACITY_OPTIONS = ["TOTAL", "SERVICIO", "OVERBOOKING", "WAITLIST"] as const;

function normalizeCapacityOptions(value: unknown): string[] | null {
  const raw = toDistinctStringArray(value, 10, 40);
  if (!raw) return null;
  const normalized = raw.map((item) => item.trim().toUpperCase());
  if (normalized.some((item) => !CAPACITY_OPTIONS.includes(item as (typeof CAPACITY_OPTIONS)[number]))) {
    return null;
  }
  return normalized;
}

const DEFAULT_CONFIG = {
  required_fields_agencia: [] as string[],
  required_fields_estudiantil: [] as string[],
  required_fields_precomprado: [] as string[],
  capacity_options: [...CAPACITY_OPTIONS] as string[],
  default_capacity_mode: "TOTAL",
  default_allow_overbooking: false,
  default_waitlist_enabled: false,
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  if (req.method === "GET") {
    try {
      const config = await prisma.travelGroupConfig.findUnique({
        where: { id_agency: auth.id_agency },
      });

      return res.status(200).json({
        ...(config ?? DEFAULT_CONFIG),
        exists: Boolean(config),
      });
    } catch (error) {
      console.error("[groups][config][GET]", error);
      return groupApiError(
        res,
        500,
        "No pudimos cargar la configuración de grupales.",
        {
          code: "GROUP_CONFIG_LOAD_ERROR",
          solution: "Reintentá en unos segundos.",
        },
      );
    }
  }

  if (req.method === "PATCH") {
    if (!canManageGroupConfig(auth.role)) {
      return groupApiError(res, 403, "No tenés permisos para editar esta configuración.", {
        code: "GROUP_CONFIG_UPDATE_FORBIDDEN",
        solution: "Solicitá permisos de configuración a un administrador.",
      });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};

    if (body.required_fields_agencia !== undefined) {
      const parsed = toDistinctStringArray(body.required_fields_agencia, 120, 100);
      if (!parsed) {
        return groupApiError(
          res,
          400,
          "La lista de campos obligatorios para grupales de agencia es inválida.",
          {
            code: "GROUP_CONFIG_REQUIRED_FIELDS_AGENCY_INVALID",
            solution: "Enviá una lista de textos (máximo 120 campos).",
          },
        );
      }
      patch.required_fields_agencia = parsed;
    }
    if (body.required_fields_estudiantil !== undefined) {
      const parsed = toDistinctStringArray(body.required_fields_estudiantil, 120, 100);
      if (!parsed) {
        return groupApiError(
          res,
          400,
          "La lista de campos obligatorios para estudiantiles es inválida.",
          {
            code: "GROUP_CONFIG_REQUIRED_FIELDS_STUDENT_INVALID",
            solution: "Enviá una lista de textos (máximo 120 campos).",
          },
        );
      }
      patch.required_fields_estudiantil = parsed;
    }
    if (body.required_fields_precomprado !== undefined) {
      const parsed = toDistinctStringArray(body.required_fields_precomprado, 120, 100);
      if (!parsed) {
        return groupApiError(
          res,
          400,
          "La lista de campos obligatorios para precomprados es inválida.",
          {
            code: "GROUP_CONFIG_REQUIRED_FIELDS_PREBUY_INVALID",
            solution: "Enviá una lista de textos (máximo 120 campos).",
          },
        );
      }
      patch.required_fields_precomprado = parsed;
    }
    if (body.capacity_options !== undefined) {
      const parsed = normalizeCapacityOptions(body.capacity_options);
      if (!parsed || parsed.length === 0) {
        return groupApiError(res, 400, "Las opciones de cupo configuradas son inválidas.", {
          code: "GROUP_CONFIG_CAPACITY_OPTIONS_INVALID",
          solution: "Habilitá al menos una opción entre cupo total, por servicio, sobreventa o lista de espera.",
        });
      }
      patch.capacity_options = parsed;
    }
    if (body.default_capacity_mode !== undefined) {
      const parsed = normalizeCapacityMode(body.default_capacity_mode);
      if (!parsed) {
        return groupApiError(res, 400, "El modo de cupo por defecto es inválido.", {
          code: "GROUP_CONFIG_DEFAULT_CAPACITY_MODE_INVALID",
          solution: "Usá un modo válido: cupo total o por servicio.",
        });
      }
      patch.default_capacity_mode = parsed;
    }
    if (body.default_allow_overbooking !== undefined) {
      const parsed = parseOptionalBoolean(body.default_allow_overbooking);
      if (parsed === undefined || parsed === null) {
        return groupApiError(res, 400, "El valor de sobreventa por defecto es inválido.", {
          code: "GROUP_CONFIG_DEFAULT_OVERBOOKING_INVALID",
          solution: "Enviá un valor booleano: true o false.",
        });
      }
      patch.default_allow_overbooking = parsed;
    }
    if (body.default_waitlist_enabled !== undefined) {
      const parsed = parseOptionalBoolean(body.default_waitlist_enabled);
      if (parsed === undefined || parsed === null) {
        return groupApiError(res, 400, "El valor de lista de espera por defecto es inválido.", {
          code: "GROUP_CONFIG_DEFAULT_WAITLIST_INVALID",
          solution: "Enviá un valor booleano: true o false.",
        });
      }
      patch.default_waitlist_enabled = parsed;
    }

    if (Object.keys(patch).length === 0) {
      return groupApiError(res, 400, "No se detectaron cambios para guardar.", {
        code: "GROUP_CONFIG_NO_CHANGES",
        solution: "Modificá al menos un campo antes de guardar.",
      });
    }

    try {
      const current = await prisma.travelGroupConfig.findUnique({
        where: { id_agency: auth.id_agency },
        select: {
          capacity_options: true,
          default_capacity_mode: true,
        },
      });

      const effectiveCapacityOptions = Array.isArray(patch.capacity_options)
        ? (patch.capacity_options as string[])
        : current?.capacity_options ?? DEFAULT_CONFIG.capacity_options;
      const effectiveDefaultCapacityMode =
        typeof patch.default_capacity_mode === "string"
          ? patch.default_capacity_mode
          : current?.default_capacity_mode ?? DEFAULT_CONFIG.default_capacity_mode;

      if (!effectiveCapacityOptions.includes(effectiveDefaultCapacityMode)) {
        return groupApiError(
          res,
          400,
          "El modo de cupo por defecto debe estar habilitado en las opciones de cupo.",
          {
            code: "GROUP_CONFIG_CAPACITY_INCONSISTENT",
            solution: "Activá ese modo de cupo o elegí otro como predeterminado.",
          },
        );
      }

      const saved = await prisma.travelGroupConfig.upsert({
        where: { id_agency: auth.id_agency },
        create: {
          id_agency: auth.id_agency,
          ...DEFAULT_CONFIG,
          ...patch,
        },
        update: patch,
      });
      return res.status(200).json(saved);
    } catch (error) {
      console.error("[groups][config][PATCH]", error);
      return groupApiError(res, 500, "No pudimos guardar la configuración.", {
        code: "GROUP_CONFIG_UPDATE_ERROR",
        solution: "Revisá los datos y volvé a intentar.",
      });
    }
  }

  res.setHeader("Allow", ["GET", "PATCH"]);
  return groupApiError(res, 405, "Método no permitido para esta ruta.", {
    code: "METHOD_NOT_ALLOWED",
    details: `Método recibido: ${req.method ?? "desconocido"}.`,
    solution: "Usá GET para consultar o PATCH para guardar configuración.",
  });
}
