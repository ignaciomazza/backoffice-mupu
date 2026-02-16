import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { groupApiError } from "@/lib/groups/apiErrors";
import {
  parseOptionalPositiveInt,
  requireGroupFinanceContext,
} from "@/lib/groups/financeShared";

async function handleDelete(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await requireGroupFinanceContext(req, res, { write: true });
  if (!ctx) return;

  const paymentId = parseOptionalPositiveInt(
    Array.isArray(req.query.paymentId) ? req.query.paymentId[0] : req.query.paymentId,
  );
  if (!paymentId) {
    return groupApiError(res, 400, "El identificador del pago es inválido.", {
      code: "GROUP_FINANCE_PAYMENT_ID_INVALID",
    });
  }

  const rows = await prisma.$queryRaw<
    Array<{ id_travel_group_client_payment: number; status: string }>
  >(Prisma.sql`
    SELECT "id_travel_group_client_payment", "status"
    FROM "TravelGroupClientPayment"
    WHERE "id_travel_group_client_payment" = ${paymentId}
      AND "id_agency" = ${ctx.auth.id_agency}
      AND "travel_group_id" = ${ctx.group.id_travel_group}
    LIMIT 1
  `);
  const payment = rows[0];
  if (!payment) {
    return groupApiError(res, 404, "No encontramos ese pago de grupal.", {
      code: "GROUP_FINANCE_PAYMENT_NOT_FOUND",
    });
  }

  const status = String(payment.status || "")
    .trim()
    .toUpperCase();
  if (status === "PAGADA") {
    return groupApiError(res, 409, "No podés eliminar un pago ya marcado como pagado.", {
      code: "GROUP_FINANCE_PAYMENT_LOCKED",
      solution: "Primero revertí el estado del pago.",
    });
  }

  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "TravelGroupClientPayment"
    WHERE "id_travel_group_client_payment" = ${paymentId}
      AND "id_agency" = ${ctx.auth.id_agency}
      AND "travel_group_id" = ${ctx.group.id_travel_group}
  `);

  return res.status(204).end();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "DELETE") return handleDelete(req, res);
  res.setHeader("Allow", ["DELETE"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}

