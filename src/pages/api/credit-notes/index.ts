// src/pages/api/credit-notes/index.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { listCreditNotes, createCreditNote } from "@/services/creditNotes";
import type { CreditNoteWithItems } from "@/services/creditNotes";
import { jwtVerify, type JWTPayload } from "jose";

/** ----------------- helpers multi-agencia ----------------- */
type MyJWTPayload = JWTPayload & { userId?: number; id_user?: number };

async function resolveUserIdFromRequest(
  req: NextApiRequest,
): Promise<number | null> {
  // 1) Header inyectado por middleware
  const h = req.headers["x-user-id"];
  const uidFromHeader =
    typeof h === "string"
      ? parseInt(h, 10)
      : Array.isArray(h)
        ? parseInt(h[0] ?? "", 10)
        : NaN;
  if (Number.isFinite(uidFromHeader) && uidFromHeader > 0) return uidFromHeader;

  // 2) Authorization: Bearer <token>
  let token: string | null = null;
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) token = auth.slice(7);

  // 3) Cookie "token"
  if (!token) {
    const cookieToken = req.cookies?.token;
    if (typeof cookieToken === "string" && cookieToken.length > 0)
      token = cookieToken;
  }

  if (!token) return null;

  try {
    const secret = process.env.JWT_SECRET || "tu_secreto_seguro";
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
    );
    const p = payload as MyJWTPayload;
    const uid = Number(p.userId ?? p.id_user ?? 0) || 0;
    return uid > 0 ? uid : null;
  } catch {
    return null;
  }
}

async function requireAgencyId(req: NextApiRequest): Promise<number> {
  const uid = await resolveUserIdFromRequest(req);
  if (!uid)
    throw new Error("No se pudo resolver el usuario (x-user-id o token).");

  const u = await prisma.user.findUnique({
    where: { id_user: uid },
    select: { id_agency: true },
  });

  const agencyId = u?.id_agency ?? 0;
  if (!agencyId) throw new Error("El usuario no tiene agencia asociada.");
  return agencyId;
}
/** --------------------------------------------------------- */

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
  // console.info(`[CreditNotes API] ${req.method} ${req.url}`);

  if (req.method === "GET") {
    try {
      const agencyId = await requireAgencyId(req);
      const { from, to } = req.query;

      // --- filtro por rango de fechas ---
      if (typeof from === "string" && typeof to === "string") {
        const fromInt = parseInt(from.replace(/-/g, ""), 10);
        const toInt = parseInt(to.replace(/-/g, ""), 10);

        const creditNotes = await prisma.creditNote.findMany({
          where: {
            AND: [
              {
                payloadAfip: {
                  path: ["CbteFch"], // CbteFch almacenado plano (AAAAMMDD numérico)
                  gte: fromInt,
                  lte: toInt,
                },
              },
              // 🔒 Solo notas de crédito de facturas cuya reserva pertenece a la agencia del usuario
              { invoice: { booking: { id_agency: agencyId } } },
            ],
          },
          include: {
            items: true,
            invoice: {
              include: {
                booking: { include: { titular: true } },
                client: {
                  select: {
                    address: true,
                    locality: true,
                    postal_code: true,
                  },
                },
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

      // Validar que la factura pertenezca a la agencia del usuario
      const belongs = await prisma.invoice.findFirst({
        where: { id_invoice: invoiceId, booking: { id_agency: agencyId } },
        select: { id_invoice: true },
      });
      if (!belongs) {
        return res
          .status(403)
          .json({
            success: false,
            message: "La factura no pertenece a tu agencia.",
          });
      }

      const creditNotes: CreditNoteWithItems[] =
        await listCreditNotes(invoiceId);
      return res.status(200).json({ success: true, creditNotes });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error interno";
      return res.status(400).json({ success: false, message: msg });
    }
  }

  if (req.method === "POST") {
    const parsedB = bodySchema.safeParse(req.body);
    if (!parsedB.success) {
      return res.status(400).json({
        success: false,
        message: parsedB.error.errors.map((e) => e.message).join(", "),
      });
    }

    try {
      const agencyId = await requireAgencyId(req);

      // Seguridad: la NC solo se puede crear sobre una factura de la misma agencia
      const invoiceOk = await prisma.invoice.findFirst({
        where: {
          id_invoice: parsedB.data.invoiceId,
          booking: { id_agency: agencyId },
        },
        select: { id_invoice: true },
      });
      if (!invoiceOk) {
        return res
          .status(403)
          .json({
            success: false,
            message: "La factura no pertenece a tu agencia.",
          });
      }

      const { invoiceId, tipoNota, exchangeRate, invoiceDate } = parsedB.data;

      // Pasamos el `req` al servicio para que inicialice AFIP con la agencia correcta
      const result = await createCreditNote(req, {
        invoiceId,
        tipoNota: tipoNota as 3 | 8,
        exchangeRate,
        invoiceDate,
      });

      if (!result.success) {
        return res
          .status(400)
          .json({ success: false, message: result.message });
      }
      return res.status(201).json({
        success: true,
        creditNote: result.creditNote,
        items: result.items,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error interno";
      return res.status(400).json({ success: false, message: msg });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res
    .status(405)
    .json({ success: false, message: "Método no permitido" });
}
