// src/pages/api/invoices/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
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
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  console.info(`[Invoices API] ${req.method} ${req.url}`);

  if (req.method === "GET") {
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
