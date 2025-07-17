// src/pages/api/credit-notes/index.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { listCreditNotes, createCreditNote } from "@/services/creditNotes";
import type { CreditNoteWithItems } from "@/services/creditNotes";

const querySchema = z.object({
  invoiceId: z
    .string()
    .regex(/^\d+$/, "invoiceId debe ser un número")
    .transform((s) => Number(s)),
});

const bodySchema = z.object({
  invoiceId: z
    .union([z.string(), z.number()])
    .transform((v) => Number(v))
    .refine((n) => Number.isInteger(n) && n > 0, "invoiceId inválido"),
  tipoNota: z
    .union([z.string(), z.number()])
    .transform((v) => Number(v))
    .refine((n) => n === 3 || n === 8, "tipoNota debe ser 3 o 8"),
  exchangeRate: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v == null ? undefined : Number(v)))
    .refine((n) => n == null || (typeof n === "number" && n > 0), {
      message: "exchangeRate debe ser un número positivo",
    }),
  invoiceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)")
    .optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  console.info(`[CreditNotes API] ${req.method} ${req.url}`);

  if (req.method === "GET") {
    const { from, to } = req.query;
    // --- filtro por rango de fechas ---
    if (typeof from === "string" && typeof to === "string") {
      const fromInt = parseInt(from.replace(/-/g, ""), 10);
      const toInt = parseInt(to.replace(/-/g, ""), 10);

      const creditNotes = await prisma.creditNote.findMany({
        where: {
          payloadAfip: {
            path: ["CbteFch"], // aquí va directamente CbteFch
            gte: fromInt,
            lte: toInt,
          },
        },
        include: {
          items: true,
          invoice: {
            include: {
              booking: { include: { titular: true } },
            },
          },
        },
      });

      return res.status(200).json({ success: true, creditNotes });
    }

    // --- búsqueda por invoiceId ---
    const parsedQ = querySchema.safeParse(req.query);
    if (!parsedQ.success) {
      return res.status(400).json({
        success: false,
        message: parsedQ.error.errors.map((e) => e.message).join(", "),
      });
    }
    const invoiceId = parsedQ.data.invoiceId;
    const creditNotes: CreditNoteWithItems[] = await listCreditNotes(invoiceId);
    return res.status(200).json({ success: true, creditNotes });
  }

  if (req.method === "POST") {
    const parsedB = bodySchema.safeParse(req.body);
    if (!parsedB.success) {
      return res.status(400).json({
        success: false,
        message: parsedB.error.errors.map((e) => e.message).join(", "),
      });
    }
    const { invoiceId, tipoNota, exchangeRate, invoiceDate } = parsedB.data;
    const result = await createCreditNote({
      invoiceId,
      tipoNota: tipoNota as 3 | 8,
      exchangeRate,
      invoiceDate,
    });
    if (!result.success) {
      return res.status(400).json({ success: false, message: result.message });
    }
    return res.status(201).json({
      success: true,
      creditNote: result.creditNote,
      items: result.items,
    });
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res
    .status(405)
    .json({ success: false, message: "Método no permitido" });
}
