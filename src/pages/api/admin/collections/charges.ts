import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { resolveBillingAuth, isBillingAdminRole } from "@/lib/billingAuth";
import {
  endOfDayUtcFromDateKeyInBuenosAires,
  startOfDayUtcFromDateKeyInBuenosAires,
  toDateKeyInBuenosAires,
  todayDateKeyInBuenosAires,
} from "@/lib/buenosAiresDate";

type Range = {
  from: Date;
  to: Date;
  fromKey: string;
  toKey: string;
};

function parseRange(req: NextApiRequest): Range | null {
  const toKey =
    typeof req.query.to === "string" && req.query.to.trim()
      ? req.query.to.trim()
      : todayDateKeyInBuenosAires(new Date());

  const fromKey =
    typeof req.query.from === "string" && req.query.from.trim()
      ? req.query.from.trim()
      : (() => {
          const d = startOfDayUtcFromDateKeyInBuenosAires(toKey);
          if (!d) return "";
          const from = new Date(d);
          from.setUTCDate(from.getUTCDate() - 60);
          return toDateKeyInBuenosAires(from) || "";
        })();

  const from = startOfDayUtcFromDateKeyInBuenosAires(fromKey);
  const to = endOfDayUtcFromDateKeyInBuenosAires(toKey);
  if (!from || !to) return null;

  return { from, to, fromKey, toKey };
}

function dec(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const auth = await resolveBillingAuth(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  if (!isBillingAdminRole(auth.role)) {
    return res.status(403).json({ error: "Sin permisos" });
  }

  const range = parseRange(req);
  if (!range) {
    return res.status(400).json({ error: "Rango inválido (from/to YYYY-MM-DD)" });
  }

  const statusFilter =
    typeof req.query.status === "string" && req.query.status.trim()
      ? req.query.status.trim().toUpperCase()
      : null;

  const items = await prisma.agencyBillingCharge.findMany({
    where: {
      due_date: {
        gte: range.from,
        lte: range.to,
      },
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    include: {
      selectedMethod: {
        select: {
          id_payment_method: true,
          method_type: true,
          status: true,
        },
      },
      subscription: {
        select: {
          id_subscription: true,
          id_agency: true,
        },
      },
      cycle: {
        select: {
          id_cycle: true,
          anchor_date: true,
          status: true,
          total_ars: true,
        },
      },
      attempts: {
        select: {
          id_attempt: true,
          attempt_no: true,
          status: true,
          channel: true,
          scheduled_for: true,
        },
        orderBy: [{ attempt_no: "asc" }],
      },
      fiscalDocuments: {
        select: {
          id_fiscal_document: true,
          document_type: true,
          status: true,
          afip_number: true,
          afip_cae: true,
          issued_at: true,
          error_message: true,
          retry_count: true,
        },
        orderBy: [{ updated_at: "desc" }, { id_fiscal_document: "desc" }],
        take: 1,
      },
    },
    orderBy: [{ due_date: "desc" }, { id_charge: "desc" }],
    take: 300,
  });

  return res.status(200).json({
    range: {
      from: range.fromKey,
      to: range.toKey,
    },
    status: statusFilter,
    items: items.map((item) => ({
      id_charge: item.id_charge,
      id_agency: item.id_agency,
      agency_billing_charge_id: item.agency_billing_charge_id,
      subscription_id: item.subscription_id,
      cycle_id: item.cycle_id,
      due_date: item.due_date,
      status: item.status,
      charge_kind: item.charge_kind,
      label: item.label,
      total_usd: dec(item.total_usd),
      amount_ars_due: dec(item.amount_ars_due),
      amount_ars_paid: dec(item.amount_ars_paid),
      paid_reference: item.paid_reference,
      reconciliation_status: item.reconciliation_status,
      selected_method: item.selectedMethod,
      cycle: item.cycle
        ? {
            id_cycle: item.cycle.id_cycle,
            anchor_date: item.cycle.anchor_date,
            status: item.cycle.status,
            total_ars: dec(item.cycle.total_ars),
          }
        : null,
      attempts: item.attempts,
      fiscal_document: item.fiscalDocuments[0]
        ? {
            id_fiscal_document: item.fiscalDocuments[0].id_fiscal_document,
            document_type: item.fiscalDocuments[0].document_type,
            status: item.fiscalDocuments[0].status,
            afip_number: item.fiscalDocuments[0].afip_number,
            afip_cae: item.fiscalDocuments[0].afip_cae,
            issued_at: item.fiscalDocuments[0].issued_at,
            error_message: item.fiscalDocuments[0].error_message,
            retry_count: item.fiscalDocuments[0].retry_count,
          }
        : null,
    })),
  });
}
