// src/pages/api/invoices/index.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { listInvoices, createInvoices } from "@/services/invoices";

const querySchema = z.object({
  bookingId: z
    .string()
    .regex(/^\d+$/, "bookingId debe ser un número")
    .transform((s) => Number(s)),
});

const bodySchema = z.object({
  bookingId: z
    .union([z.string(), z.number()])
    .transform((v) => Number(v))
    .refine((n) => Number.isInteger(n) && n > 0, "bookingId inválido"),
  services: z
    .array(z.union([z.string(), z.number()]).transform((v) => Number(v)))
    .min(1, "Debe haber al menos un servicio"),
  clientIds: z
    .array(z.union([z.string(), z.number()]).transform((v) => Number(v)))
    .min(1, "Debe haber al menos un cliente"),
  tipoFactura: z
    .union([z.string(), z.number()])
    .transform((v) => Number(v))
    .refine((n) => n === 1 || n === 6, "tipoFactura debe ser 1 o 6"),
  exchangeRate: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v == null ? undefined : Number(v)))
    .refine((n) => n == null || (typeof n === "number" && n > 0), {
      message: "exchangeRate debe ser un número positivo",
    }),
  description21: z.array(z.string()).optional(),
  description10_5: z.array(z.string()).optional(),
  descriptionNonComputable: z.array(z.string()).optional(),
  invoiceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)")
    .refine((s) => {
      const d = new Date(s + "T00:00:00");
      if (Number.isNaN(d.getTime())) return false;
      // calculamos diferencia en días respecto a hoy:
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
      return diff >= -5 && diff <= 5;
    }, "La fecha de factura debe estar dentro de los 5 días anteriores o posteriores a hoy"),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  console.info(`[Invoices API] ${req.method} ${req.url}`);

  if (req.method === "GET") {
    const { from, to } = req.query;

    // Filtrado por rango de fechas
    if (from && to) {
      const fromDate = new Date(from as string);
      const toDate = new Date(to as string);
      const invoices = await prisma.invoice.findMany({
        where: {
          issue_date: {
            gte: fromDate,
            lte: toDate,
          },
        },
        include: {
          booking: { include: { titular: true } },
          client: { select: { first_name: true, last_name: true } },
        },
      });
      return res.status(200).json({ success: true, invoices });
    }

    // Filtrado por bookingId
    const parsedQ = querySchema.safeParse(req.query);
    if (!parsedQ.success) {
      return res.status(400).json({
        success: false,
        message: parsedQ.error.errors.map((e) => e.message).join(", "),
      });
    }
    const bookingId = parsedQ.data.bookingId;
    const invoices = await listInvoices(bookingId);
    return res.status(200).json({ success: true, invoices });
  }

  if (req.method === "POST") {
    const parsedB = bodySchema.safeParse(req.body);
    if (!parsedB.success) {
      return res.status(400).json({
        success: false,
        message: parsedB.error.errors.map((e) => e.message).join(", "),
      });
    }

    const result = await createInvoices(parsedB.data);
    if (!result.success) {
      return res.status(400).json({ success: false, message: result.message });
    }
    return res.status(201).json({ success: true, invoices: result.invoices });
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res
    .status(405)
    .json({ success: false, message: "Método no permitido" });
}
