import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { groupApiError } from "@/lib/groups/apiErrors";
import {
  parseOptionalPositiveInt,
  requireGroupFinanceContext,
} from "@/lib/groups/financeShared";

function normalizeStatus(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const normalized = raw
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toUpperCase();
  if (!normalized) return null;
  if (["PENDIENTE", "PAGADA", "PAGO", "CANCELADA", "CANCELADO"].includes(normalized)) {
    if (normalized === "PAGO") return "PAGADA";
    if (normalized === "CANCELADO") return "CANCELADA";
    return normalized;
  }
  return null;
}

async function getTargetDue(
  agencyId: number,
  groupId: number,
  dueId: number,
) {
  const rows = await prisma.$queryRaw<
    Array<{ id_travel_group_operator_due: number; status: string }>
  >(Prisma.sql`
    SELECT "id_travel_group_operator_due", "status"
    FROM "TravelGroupOperatorDue"
    WHERE "id_travel_group_operator_due" = ${dueId}
      AND "id_agency" = ${agencyId}
      AND "travel_group_id" = ${groupId}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function handlePut(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await requireGroupFinanceContext(req, res, { write: true });
  if (!ctx) return;

  const dueId = parseOptionalPositiveInt(
    Array.isArray(req.query.dueId) ? req.query.dueId[0] : req.query.dueId,
  );
  if (!dueId) {
    return groupApiError(res, 400, "El identificador del vencimiento es inválido.", {
      code: "GROUP_FINANCE_DUE_ID_INVALID",
    });
  }

  const target = await getTargetDue(ctx.auth.id_agency, ctx.group.id_travel_group, dueId);
  if (!target) {
    return groupApiError(res, 404, "No encontramos ese vencimiento.", {
      code: "GROUP_FINANCE_DUE_NOT_FOUND",
    });
  }

  const body = req.body ?? {};
  const nextStatus = normalizeStatus((body as { status?: unknown }).status);
  if (!nextStatus) {
    return groupApiError(res, 400, "Estado inválido para el vencimiento.", {
      code: "GROUP_FINANCE_DUE_STATUS_INVALID",
    });
  }

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "TravelGroupOperatorDue"
    SET "status" = ${nextStatus},
        "updated_at" = NOW()
    WHERE "id_travel_group_operator_due" = ${dueId}
      AND "id_agency" = ${ctx.auth.id_agency}
      AND "travel_group_id" = ${ctx.group.id_travel_group}
  `);

  return res.status(200).json({ success: true });
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await requireGroupFinanceContext(req, res, { write: true });
  if (!ctx) return;

  const dueId = parseOptionalPositiveInt(
    Array.isArray(req.query.dueId) ? req.query.dueId[0] : req.query.dueId,
  );
  if (!dueId) {
    return groupApiError(res, 400, "El identificador del vencimiento es inválido.", {
      code: "GROUP_FINANCE_DUE_ID_INVALID",
    });
  }

  const target = await getTargetDue(ctx.auth.id_agency, ctx.group.id_travel_group, dueId);
  if (!target) {
    return groupApiError(res, 404, "No encontramos ese vencimiento.", {
      code: "GROUP_FINANCE_DUE_NOT_FOUND",
    });
  }

  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "TravelGroupOperatorDue"
    WHERE "id_travel_group_operator_due" = ${dueId}
      AND "id_agency" = ${ctx.auth.id_agency}
      AND "travel_group_id" = ${ctx.group.id_travel_group}
  `);

  return res.status(204).end();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "PUT") return handlePut(req, res);
  if (req.method === "DELETE") return handleDelete(req, res);
  res.setHeader("Allow", ["PUT", "DELETE"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}

