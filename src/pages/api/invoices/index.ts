import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { listInvoices, createInvoices } from "@/services/invoices";
import { jwtVerify, type JWTPayload } from "jose";

/** ------- helpers mínimos para multi-agencia ------- */
type MyJWTPayload = JWTPayload & { userId?: number; id_user?: number };

async function resolveUserIdFromRequest(
  req: NextApiRequest,
): Promise<number | null> {
  // 1) Header inyectado por middleware (más barato si existe)
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
/** ----------------------------------------------- */

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
  // console.info(`[Invoices API] ${req.method} ${req.url}`);

  if (req.method === "GET") {
    try {
      const agencyId = await requireAgencyId(req);
      const { from, to } = req.query;

      if (from && to) {
        const fromInt = parseInt((from as string).replace(/-/g, ""), 10);
        const toInt = parseInt((to as string).replace(/-/g, ""), 10);

        const invoices = await prisma.invoice.findMany({
          where: {
            AND: [
              {
                payloadAfip: { path: ["voucherData", "CbteFch"], gte: fromInt },
              },
              { payloadAfip: { path: ["voucherData", "CbteFch"], lte: toInt } },
              // 🔒 filtro multi-agencia
              { booking: { id_agency: agencyId } },
            ],
          },
          include: {
            booking: { include: { titular: true } },
            client: {
              select: {
                first_name: true,
                last_name: true,
                address: true,
                locality: true,
                postal_code: true,
              },
            },
          },
        });

        return res.status(200).json({ success: true, invoices });
      }

      // --- búsqueda por bookingId ---
      const parsedQ = querySchema.safeParse(req.query);
      if (!parsedQ.success) {
        return res.status(400).json({
          success: false,
          message: parsedQ.error.errors.map((e) => e.message).join(", "),
        });
      }

      const agencyId2 = await requireAgencyId(req);
      const bookingId = parsedQ.data.bookingId;

      // Validamos que la reserva pertenezca a la misma agencia
      const booking = await prisma.booking.findFirst({
        where: { id_booking: bookingId, id_agency: agencyId2 },
        select: { id_booking: true },
      });
      if (!booking) {
        return res
          .status(403)
          .json({
            success: false,
            message: "Reserva no pertenece a tu agencia.",
          });
      }

      const invoices = await listInvoices(bookingId);
      return res.status(200).json({ success: true, invoices });
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
      // createInvoices ya usa AFIP por agencia del usuario vía req
      const result = await createInvoices(req, parsedB.data);
      if (!result.success) {
        return res
          .status(400)
          .json({ success: false, message: result.message });
      }
      return res.status(201).json({ success: true, invoices: result.invoices });
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
