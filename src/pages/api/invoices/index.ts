// src/pages/api/invoices/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { listInvoices, createInvoices } from "@/services/invoices";
import { jwtVerify, type JWTPayload } from "jose";

/* ================= JWT SECRET (igual que bookings) ================= */
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

/* ================= Tipos ================= */
type TokenPayload = JWTPayload & {
  id_user?: number;
  userId?: number;
  uid?: number;
  role?: string;
  id_agency?: number;
  agencyId?: number;
  aid?: number;
  email?: string;
};

type DecodedUser = {
  id_user?: number;
  id_agency?: number;
  role?: string;
  email?: string;
};

/* ================= Helpers de auth (copiados del patrón OK) ================= */
function getTokenFromRequest(req: NextApiRequest): string | null {
  // 1) cookie "token" (más robusto en prod)
  if (req.cookies?.token) return req.cookies.token;

  // 2) Authorization: Bearer
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);

  // 3) otros posibles nombres de cookie
  const c = req.cookies || {};
  for (const k of [
    "session",
    "auth_token",
    "access_token",
    "next-auth.session-token",
  ]) {
    const v = c[k];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

async function getUserFromAuth(
  req: NextApiRequest,
): Promise<DecodedUser | null> {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return null;

    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET),
    );
    const p = payload as TokenPayload;

    const id_user = Number(p.id_user ?? p.userId ?? p.uid) || undefined;
    const id_agency = Number(p.id_agency ?? p.agencyId ?? p.aid) || undefined;
    const role = p.role;
    const email = p.email;

    // completar por email si falta id_user
    if (!id_user && email) {
      const u = await prisma.user.findUnique({
        where: { email },
        select: { id_user: true, id_agency: true, role: true, email: true },
      });
      if (u)
        return {
          id_user: u.id_user,
          id_agency: u.id_agency,
          role: u.role,
          email: u.email,
        };
    }

    // completar agency si falta
    if (id_user && !id_agency) {
      const u = await prisma.user.findUnique({
        where: { id_user },
        select: { id_agency: true, role: true, email: true },
      });
      if (u)
        return {
          id_user,
          id_agency: u.id_agency,
          role: role ?? u.role,
          email: email ?? u.email ?? undefined,
        };
    }

    return { id_user, id_agency, role, email };
  } catch {
    return null;
  }
}

/* ================= Utils ================= */
const first = (v?: string | string[]) =>
  Array.isArray(v) ? v[0] : (v ?? undefined);

// bookingId puede venir como "145" o ["145"]
const querySchema = z.object({
  bookingId: z.preprocess(
    (v) => (Array.isArray(v) ? v[0] : v),
    z.coerce.number().int().positive("bookingId debe ser un número positivo"),
  ),
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

/* ================= Handler ================= */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  /* ---------- GET ---------- */
  if (req.method === "GET") {
    try {
      const auth = await getUserFromAuth(req);
      if (!auth?.id_user || !auth.id_agency) {
        return res
          .status(401)
          .json({ success: false, message: "No autenticado" });
      }

      // rango de fechas opcional
      const fromStr = first(req.query.from as string | string[] | undefined);
      const toStr = first(req.query.to as string | string[] | undefined);

      if (fromStr && toStr) {
        const fromInt = parseInt(fromStr.replace(/-/g, ""), 10);
        const toInt = parseInt(toStr.replace(/-/g, ""), 10);

        const invoices = await prisma.invoice.findMany({
          where: {
            AND: [
              {
                payloadAfip: { path: ["voucherData", "CbteFch"], gte: fromInt },
              },
              { payloadAfip: { path: ["voucherData", "CbteFch"], lte: toInt } },
              { booking: { id_agency: auth.id_agency } }, // 🔒 multi-agencia
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

      // por bookingId
      const parsedQ = querySchema.safeParse({ bookingId: req.query.bookingId });
      if (!parsedQ.success) {
        return res.status(400).json({
          success: false,
          message: parsedQ.error.errors.map((e) => e.message).join(", "),
        });
      }
      const bookingId = parsedQ.data.bookingId; // number

      // valida que la reserva sea de la agencia del usuario
      const booking = await prisma.booking.findFirst({
        where: { id_booking: bookingId, id_agency: auth.id_agency },
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
      console.error("[invoices][GET]", msg);
      return res.status(500).json({ success: false, message: msg });
    }
  }

  /* ---------- POST ---------- */
  if (req.method === "POST") {
    const parsedB = bodySchema.safeParse(req.body);
    if (!parsedB.success) {
      return res.status(400).json({
        success: false,
        message: parsedB.error.errors.map((e) => e.message).join(", "),
      });
    }

    try {
      // createInvoices ya resuelve agencia por el req (mismo token/cookie)
      const result = await createInvoices(req, parsedB.data);
      if (!result.success) {
        return res
          .status(400)
          .json({ success: false, message: result.message });
      }
      return res.status(201).json({ success: true, invoices: result.invoices });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error interno";
      console.error("[invoices][POST]", msg);
      return res.status(500).json({ success: false, message: msg });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res
    .status(405)
    .json({ success: false, message: "Método no permitido" });
}
