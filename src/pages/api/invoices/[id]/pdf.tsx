// src/pages/api/invoices/[id]/pdf.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { PrismaClient, Prisma } from "@prisma/client";
import fs from "fs";
import path from "path";
import { renderToStream } from "@react-pdf/renderer";
import InvoiceDocument, {
  VoucherData,
} from "@/services/invoices/InvoiceDocument";
import { decodePublicId } from "@/lib/publicIds";
import { jwtVerify, type JWTPayload } from "jose";
import {
  canAccessBookingByRole,
  getBookingComponentGrants,
} from "@/lib/accessControl";
import { canAccessBookingComponent } from "@/utils/permissions";

/** ===== Tipos del payload guardado en la factura ===== */
interface PayloadAfip {
  voucherData: VoucherData;
  afipResponse?: {
    CAE: string;
    CAEFchVto: string;
  };
  qrBase64?: string;
  description21?: string[];
  description10_5?: string[];
  descriptionNonComputable?: string[];
  customItems?: Array<{
    description: string;
    taxCategory: "21" | "10_5" | "EXEMPT";
    amount?: number;
  }>;
  serviceDates?: { from: string; to: string }[];
}

/** ====== Tipo fuerte con relaciones incluidas ====== */
type InvoiceWithRelations = Prisma.InvoiceGetPayload<{
  include: {
    booking: {
      include: {
        titular: true;
        agency: true;
      };
    };
  };
}>;

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

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

function getTokenFromRequest(req: NextApiRequest): string | null {
  if (req.cookies?.token) return req.cookies.token;
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  const c = req.cookies || {};
  for (const k of [
    "session",
    "auth_token",
    "access_token",
    "next-auth.session-token",
  ]) {
    if (c[k]) return c[k]!;
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

/** ===== Helper: traer logo por URL pública (Spaces/S3) a base64 ===== */
async function fetchLogoFromUrl(
  url?: string | null,
): Promise<{ base64: string; mime: string } | null> {
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;

    let mime = r.headers.get("content-type") || "";
    const buf = Buffer.from(await r.arrayBuffer());

    // Inferencia simple si no viene content-type
    if (!mime) {
      const u = url.toLowerCase();
      if (u.endsWith(".jpg") || u.endsWith(".jpeg")) mime = "image/jpeg";
      else if (u.endsWith(".png")) mime = "image/png";
      else if (u.endsWith(".webp")) mime = "image/webp";
      else mime = "image/png";
    }
    return { base64: buf.toString("base64"), mime };
  } catch {
    return null;
  }
}

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const auth = await getUserFromAuth(req);
  if (!auth?.id_user || !auth.id_agency) {
    return res.status(401).end("No autenticado");
  }
  const bookingGrants = await getBookingComponentGrants(
    auth.id_agency,
    auth.id_user,
  );
  const canBilling = canAccessBookingComponent(
    auth.role,
    bookingGrants,
    "billing",
  );

  const rawId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!rawId) {
    return res.status(400).end("ID inválido");
  }
  const rawIdStr = String(rawId);
  const parsedId = Number(rawIdStr);
  const decoded =
    Number.isFinite(parsedId) && parsedId > 0
      ? null
      : decodePublicId(rawIdStr);
  if (decoded && decoded.t !== "invoice") {
    return res.status(400).end("ID inválido");
  }
  if (!decoded && (!Number.isFinite(parsedId) || parsedId <= 0)) {
    return res.status(400).end("ID inválido");
  }

  if (decoded && decoded.a !== auth.id_agency) {
    return res.status(403).end("Sin permisos");
  }

  // 1) Buscar factura con booking+agency (multi-agencia)
  let invoice: InvoiceWithRelations | null = null;

  try {
    invoice = await prisma.invoice.findFirst({
      where: decoded
        ? { id_agency: decoded.a, agency_invoice_id: decoded.i }
        : { id_invoice: parsedId, id_agency: auth.id_agency },
      include: {
        booking: {
          include: {
            titular: true,
            agency: true,
          },
        },
      },
    });
  } catch (dbErr) {
    console.error("💥 DB error al consultar invoice:", dbErr);
    return res.status(500).end("Error interno de base de datos");
  }

  if (!invoice) return res.status(404).end("Factura no encontrada");

  const canReadByRole = await canAccessBookingByRole(auth, {
    id_user: invoice.booking?.id_user ?? 0,
    id_agency: invoice.booking?.id_agency ?? 0,
  });
  if (!canBilling && !canReadByRole) {
    return res.status(403).end("Sin permisos");
  }
  if (!invoice.payloadAfip)
    return res.status(500).end("No hay datos para generar la factura");

  if (!invoice.booking || !invoice.booking.agency) {
    return res
      .status(400)
      .end("Faltan datos de booking/agencia para generar el PDF");
  }

  // 2) Logo multi-agencia: priorizar agency.logo_url (Spaces/S3)
  let logoBase64: string | undefined;
  let logoMime: string | undefined;

  try {
    const agency = invoice.booking.agency;

    // a) intentar descargar del URL público guardado en DB
    const fetched = await fetchLogoFromUrl(
      (agency as unknown as { logo_url?: string | null })?.logo_url,
    );
    if (fetched) {
      logoBase64 = fetched.base64;
      logoMime = fetched.mime;
    }

    // b) fallbacks locales opcionales (por si no hay logo_url o falla la descarga)
    if (!logoBase64) {
      const preferred: string[] = [];
      const slug = (agency as unknown as { slug?: string | null })?.slug || "";
      const logoFile = (agency as unknown as { logo_filename?: string | null })
        ?.logo_filename;

      if (logoFile) preferred.push(logoFile);
      if (slug) preferred.push(`logo_${slug}.png`);
      if (agency.id_agency) preferred.push(`logo_ag_${agency.id_agency}.png`);

      for (const fname of preferred) {
        const candidate = path.join(process.cwd(), "public", "agencies", fname);
        if (fs.existsSync(candidate)) {
          logoBase64 = fs.readFileSync(candidate).toString("base64");
          logoMime =
            candidate.toLowerCase().endsWith(".jpg") ||
            candidate.toLowerCase().endsWith(".jpeg")
              ? "image/jpeg"
              : "image/png";
          break;
        }
      }

      // c) último fallback a /public/logo.png
      if (!logoBase64) {
        const fallback = path.join(process.cwd(), "public", "logo.png");
        if (fs.existsSync(fallback)) {
          logoBase64 = fs.readFileSync(fallback).toString("base64");
          logoMime = "image/png";
        }
      }
    }
  } catch (logoErr) {
    console.error("⚠️ Error obteniendo logo:", logoErr);
  }

  // 3) Parsear payload
  const payload = invoice.payloadAfip as unknown as PayloadAfip;
  const {
    voucherData,
    qrBase64,
    description21,
    description10_5,
    descriptionNonComputable,
    customItems,
    serviceDates = [],
  } = payload;

  if (!voucherData) {
    return res.status(500).end("Datos de voucher incompletos");
  }

  // 4) Calcular período (desde/hasta) si viene
  const parseYmd = (s: string) => {
    const clean = s.includes("-") ? s.replace(/-/g, "") : s;
    return new Date(
      `${clean.substring(0, 4)}-${clean.substring(4, 6)}-${clean.substring(6, 8)}`,
    );
  };

  let depDate: string | undefined;
  let retDate: string | undefined;

  if (serviceDates.length) {
    try {
      const froms = serviceDates.map((sd) => parseYmd(sd.from));
      const tos = serviceDates.map((sd) => parseYmd(sd.to));
      const min = new Date(Math.min(...froms.map((d) => d.getTime())));
      const max = new Date(Math.max(...tos.map((d) => d.getTime())));
      depDate = min.toISOString().split("T")[0];
      retDate = max.toISOString().split("T")[0];
    } catch (dateErr) {
      console.error("⚠️ Error calculando período servicio:", dateErr);
    }
  }

  // 5) Enriquecer voucher con datos de agencia (multi-agencia)
  const ag = invoice.booking.agency;

  const enrichedVoucher: VoucherData & {
    emitterName: string;
    emitterLegalName: string;
    emitterTaxId?: string;
    emitterAddress?: string;
    recipient: string;
    departureDate?: string;
    returnDate?: string;
    description21?: string[];
    description10_5?: string[];
    descriptionNonComputable?: string[];
    customItems?: Array<{
      description: string;
      taxCategory: "21" | "10_5" | "EXEMPT";
      amount?: number;
    }>;
  } = {
    ...voucherData,
    emitterName: ag.name ?? "Agencia",
    emitterLegalName: ag.legal_name ?? ag.name ?? "Razón social",
    emitterTaxId: ag.tax_id ?? undefined,
    emitterAddress: ag.address ?? undefined,
    recipient: invoice.recipient,
    departureDate: depDate,
    returnDate: retDate,
    description21,
    description10_5,
    descriptionNonComputable,
    customItems,
  };

  // 6) Render y envío del PDF
  try {
    const stream = await renderToStream(
      <InvoiceDocument
        voucherData={enrichedVoucher}
        currency={invoice.currency}
        qrBase64={qrBase64}
        logoBase64={logoBase64}
        logoMime={logoMime}
      />,
    );

    res.setHeader("Content-Type", "application/pdf");
    const filenameId = invoice.agency_invoice_id ?? invoice.id_invoice;
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=factura_${filenameId}.pdf`,
    );
    stream.pipe(res);
  } catch (err) {
    console.error("💥 Error generando PDF factura:", err);
    res
      .status(500)
      .end(
        `Error al generar el PDF: ${(err as Error)?.message || "desconocido"}`,
      );
  }
}
