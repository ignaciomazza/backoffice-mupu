import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import {
  canWriteGroups,
  parseGroupWhereInput,
  parsePositiveInt,
  requireAuth,
} from "@/lib/groups/apiShared";
import { groupApiError } from "@/lib/groups/apiErrors";
import prisma from "@/lib/prisma";

export type GroupFinanceContext = {
  auth: Awaited<ReturnType<typeof requireAuth>> extends infer T
    ? T extends null
      ? never
      : T
    : never;
  group: {
    id_travel_group: number;
    id_agency: number;
    status: string;
    name: string;
  };
};

export async function requireGroupFinanceContext(
  req: NextApiRequest,
  res: NextApiResponse,
  opts: { write?: boolean } = {},
): Promise<GroupFinanceContext | null> {
  const auth = await requireAuth(req, res);
  if (!auth) return null;
  if (opts.write && !canWriteGroups(auth.role)) {
    groupApiError(
      res,
      403,
      "No tenés permisos para editar finanzas de la grupal.",
      {
        code: "GROUP_FINANCE_FORBIDDEN",
        solution: "Solicitá permisos de edición de grupales.",
      },
    );
    return null;
  }

  const rawGroupId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!rawGroupId) {
    groupApiError(res, 400, "El identificador de la grupal es inválido.", {
      code: "GROUP_ID_INVALID",
      solution: "Abrí nuevamente la grupal desde el listado.",
    });
    return null;
  }

  const groupWhere = parseGroupWhereInput(String(rawGroupId), auth.id_agency);
  if (!groupWhere) {
    groupApiError(res, 404, "No encontramos la grupal solicitada.", {
      code: "GROUP_NOT_FOUND",
      solution: "Verificá que pertenezca a tu agencia.",
    });
    return null;
  }

  const group = await prisma.travelGroup.findFirst({
    where: groupWhere,
    select: {
      id_travel_group: true,
      id_agency: true,
      status: true,
      name: true,
    },
  });
  if (!group) {
    groupApiError(res, 404, "No encontramos la grupal solicitada.", {
      code: "GROUP_NOT_FOUND",
      solution: "Verificá que pertenezca a tu agencia.",
    });
    return null;
  }

  return { auth, group };
}

export type ScopeFilter = {
  departureId: number | null | undefined;
  key: string | undefined;
};

export function parseScopeFilter(rawScope: unknown): ScopeFilter | null {
  if (rawScope === undefined || rawScope === null || rawScope === "") {
    return { departureId: undefined, key: undefined };
  }
  const scope = String(rawScope).trim();
  if (!scope) return { departureId: undefined, key: undefined };
  if (scope === "group") return { departureId: null, key: "group" };
  const departureMatch = scope.match(/^departure:(\d+)$/);
  if (departureMatch) {
    const parsed = Number(departureMatch[1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return { departureId: parsed, key: scope };
    }
    return null;
  }
  const numeric = parsePositiveInt(scope);
  if (numeric) return { departureId: numeric, key: `departure:${numeric}` };
  return null;
}

export function parseOptionalPositiveInt(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  return parsePositiveInt(raw);
}

export function normalizeCurrencyCode(raw: unknown): string {
  const base = String(raw || "ARS")
    .trim()
    .toUpperCase();
  if (!base) return "ARS";
  if (["$", "AR$", "PES"].includes(base)) return "ARS";
  if (["U$S", "US$", "USD$"].includes(base)) return "USD";
  return base;
}

export function parseDateInput(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const clean = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const d = new Date(`${clean}T00:00:00.000Z`);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  const parsed = new Date(clean);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function toDecimal(value: number | string): Prisma.Decimal {
  const parsed =
    typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return new Prisma.Decimal(Number.isFinite(parsed) ? parsed : 0);
}

export function toAmountNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value instanceof Prisma.Decimal) return value.toNumber();
  return 0;
}

export function isoDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function deriveClientPaymentStatus(
  persistedStatus: string,
  dueDate: Date,
): {
  derivedStatus: "PENDIENTE" | "PAGADA" | "CANCELADA" | "VENCIDA";
  isOverdue: boolean;
} {
  const normalized = String(persistedStatus || "")
    .trim()
    .toUpperCase();
  if (normalized === "PAGADA") {
    return { derivedStatus: "PAGADA", isOverdue: false };
  }
  if (normalized === "CANCELADA") {
    return { derivedStatus: "CANCELADA", isOverdue: false };
  }
  const overdue = isoDateKey(dueDate) < isoDateKey(new Date());
  return {
    derivedStatus: overdue ? "VENCIDA" : "PENDIENTE",
    isOverdue: overdue,
  };
}

export function isMissingGroupFinanceTableError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2010") return false;

  const meta = error.meta as { code?: unknown; message?: unknown } | undefined;
  const queryCode =
    typeof meta?.code === "string" ? meta.code.toUpperCase() : "";
  if (queryCode === "42P01") return true;

  const message = `${meta?.message ?? ""} ${error.message ?? ""}`.toLowerCase();
  return message.includes("relation") && message.includes("does not exist");
}
