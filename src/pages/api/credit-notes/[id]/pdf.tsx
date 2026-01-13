import type { NextApiRequest, NextApiResponse } from "next";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { renderToStream } from "@react-pdf/renderer";
import CreditNoteDocument, {
  VoucherData,
} from "@/services/credit-notes/CreditNoteDocument";
import { decodePublicId } from "@/lib/publicIds";

/** ===== Helper: traer logo por URL pública (Spaces/S3) a base64 + MIME ===== */
async function fetchLogoFromUrl(
  url?: string | null,
): Promise<{ base64: string; mime: string } | null> {
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;

    let mime = r.headers.get("content-type") || "";
    const buf = Buffer.from(await r.arrayBuffer());

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

/** Campos “de marca” que pueden o no existir en tu Agency */
type AgencyBranding = {
  id_agency?: number | null;
  slug?: string | null;
  logo_url?: string | null;
  logo_filename?: string | null;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const rawId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!rawId) {
    res.status(400).end("ID inválido");
    return;
  }
  const rawIdStr = String(rawId);
  const parsedId = Number(rawIdStr);
  const decoded =
    Number.isFinite(parsedId) && parsedId > 0
      ? null
      : decodePublicId(rawIdStr);
  if (decoded && decoded.t !== "credit_note") {
    res.status(400).end("ID inválido");
    return;
  }
  if (!decoded && (!Number.isFinite(parsedId) || parsedId <= 0)) {
    res.status(400).end("ID inválido");
    return;
  }

  // 1) Obtener nota de crédito con sus relaciones
  let creditNote;
  try {
    creditNote = await prisma.creditNote.findFirst({
      where: decoded
        ? { id_agency: decoded.a, agency_credit_note_id: decoded.i }
        : { id_credit_note: parsedId },
      include: {
        invoice: {
          include: {
            booking: {
              include: { titular: true, agency: true },
            },
          },
        },
        items: true,
      },
    });
  } catch (dbErr) {
    console.error("💥 Error al consultar Prisma para id", rawIdStr, dbErr);
    res.status(500).end("Error interno de base de datos");
    return;
  }

  if (!creditNote) {
    res.status(404).end("Nota de crédito no encontrada");
    return;
  }
  if (!creditNote.payloadAfip) {
    res.status(500).end("No hay datos AFIP para generar la nota");
    return;
  }

  // 2) Logo multi-agencia (URL pública con fallback a /public)
  let logoBase64: string | undefined;
  let logoMime: string | undefined;
  try {
    const agency = creditNote.invoice?.booking?.agency as unknown as
      | AgencyBranding
      | undefined;

    // a) intentar S3/Spaces
    const fetched = await fetchLogoFromUrl(agency?.logo_url ?? null);
    if (fetched) {
      logoBase64 = fetched.base64;
      logoMime = fetched.mime;
    }

    // b) fallbacks locales: /public/agencies/*
    if (!logoBase64) {
      const preferred: string[] = [];
      const slug = agency?.slug ?? undefined;
      const logoFile = agency?.logo_filename ?? undefined;

      if (logoFile) preferred.push(logoFile);
      if (slug) preferred.push(`logo_${slug}.png`);
      if (agency?.id_agency) preferred.push(`logo_ag_${agency.id_agency}.png`);

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

      // c) último fallback global
      if (!logoBase64) {
        const fallback = path.join(process.cwd(), "public", "logo.png");
        if (fs.existsSync(fallback)) {
          logoBase64 = fs.readFileSync(fallback).toString("base64");
          logoMime = "image/png";
        }
      }
    }
  } catch (e) {
    console.error("⚠️ Error obteniendo logo:", e);
  }

  // 3) Adaptarse a payload “flat” o anidado
  type Wrapped = {
    voucherData: VoucherData;
    qrBase64?: string;
    serviceDates?: Array<{ id_service: number; from: string; to: string }>;
  };
  const raw = creditNote.payloadAfip as unknown as VoucherData | Wrapped;
  const voucherData: VoucherData = "voucherData" in raw ? raw.voucherData : raw;
  const qrBase64 = "qrBase64" in raw ? raw.qrBase64 : undefined;
  const serviceDates =
    "serviceDates" in raw && raw.serviceDates ? raw.serviceDates : [];

  if (!voucherData?.CAE) {
    console.error("🚫 voucherData inválido:", voucherData);
    res.status(500).end("Datos del voucher incompletos");
    return;
  }

  // 4) Calcular período desde/hasta
  const parseYmd = (s: string) => {
    const clean = s.includes("-") ? s.replace(/-/g, "") : s;
    const YYYY = clean.slice(0, 4);
    const MM = clean.slice(4, 6);
    const DD = clean.slice(6, 8);
    return new Date(`${YYYY}-${MM}-${DD}`);
  };

  let depDate: string | undefined;
  let retDate: string | undefined;
  if (serviceDates.length) {
    const fromDates = serviceDates.map((sd) => parseYmd(sd.from));
    const toDates = serviceDates.map((sd) => parseYmd(sd.to));
    const min = new Date(Math.min(...fromDates.map((d) => d.getTime())));
    const max = new Date(Math.max(...toDates.map((d) => d.getTime())));
    depDate = min.toISOString().split("T")[0];
    retDate = max.toISOString().split("T")[0];
  }

  if (depDate) voucherData.departureDate = depDate;
  if (retDate) voucherData.returnDate = retDate;

  // 5) Enriquecer emisor/receptor
  try {
    const { invoice } = creditNote;
    const { booking } = invoice;
    voucherData.emitterName = booking.agency.name;
    voucherData.emitterLegalName = booking.agency.legal_name;
    voucherData.emitterTaxId = booking.agency.tax_id ?? "";
    voucherData.emitterAddress = booking.agency.address ?? "";
    voucherData.recipient =
      invoice.recipient ||
      `${booking.titular.first_name} ${booking.titular.last_name}`;
  } catch (injectErr) {
    console.error("⚠️ Error inyectando emisor/receptor:", injectErr);
  }

  // 6) Render
  const data = {
    creditNumber: creditNote.credit_number,
    issueDate: creditNote.issue_date,
    currency: creditNote.currency,
    qrBase64,
    logoBase64,
    logoMime,
    voucherData,
    items: creditNote.items,
  };

  try {
    const stream = await renderToStream(<CreditNoteDocument {...data} />);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=nota_credito_${data.creditNumber}.pdf`,
    );
    stream.pipe(res);
  } catch (err) {
    console.error("💥 Error generando PDF nota de crédito:", err);
    res
      .status(500)
      .end(
        `Error al generar el PDF: ${(err as Error).message || "desconocido"}`,
      );
  }
}
