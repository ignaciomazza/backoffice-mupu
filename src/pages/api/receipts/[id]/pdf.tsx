// src/pages/api/receipts/[id]/pdf.tsx
import type { NextApiRequest, NextApiResponse } from "next";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { renderToStream } from "@react-pdf/renderer";
import ReceiptDocument, {
  ReceiptPdfData,
} from "@/services/receipts/ReceiptDocument";

/** Subtipo con extras opcionales que guardás en Agency */
type AgencyExtras = {
  id_agency?: number | null;
  logo_url?: string | null;
  slug?: string | null;
  logo_filename?: string | null;
};

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

    // inferencia simple de MIME si no viene en header
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

  const id = parseInt(req.query.id as string, 10);
  if (Number.isNaN(id)) return res.status(400).end("ID inválido");

  // 1) Traer recibo + booking + agency + titular + services + clients
  const receipt = await prisma.receipt.findUnique({
    where: { id_receipt: id },
    include: {
      booking: {
        include: {
          titular: true,
          agency: true,
          services: true,
          clients: true,
        },
      },
    },
  });
  if (!receipt) return res.status(404).end("Recibo no encontrado");

  // 2) Logo multi-agencia
  let logoBase64: string | undefined;
  let logoMime: string | undefined;

  try {
    const agency = receipt.booking?.agency as typeof receipt.booking.agency &
      AgencyExtras;

    // a) probar descargar desde logo_url (Spaces/S3)
    const fetched = await fetchLogoFromUrl(agency?.logo_url);
    if (fetched) {
      logoBase64 = fetched.base64;
      logoMime = fetched.mime;
    }

    // b) fallbacks locales opcionales
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
    // no cortamos si falla el logo
    // eslint-disable-next-line no-console
    console.error("⚠️ Error obteniendo logo de agencia:", e);
  }

  // 3) Filtrar servicios seleccionados en el recibo
  const selectedServices = receipt.booking.services.filter((s) =>
    receipt.serviceIds.includes(s.id_service),
  );

  // 4) Determinar destinatarios: si hay clientIds, usar esos; si no, el titular
  const rawClients = await prisma.client.findMany({
    where: { id_client: { in: receipt.clientIds } },
  });
  const recipientsArr = rawClients.length
    ? rawClients
    : [receipt.booking.titular];

  // 5) Armar datos para el PDF (incluye recipients y logoMime)
  const data: ReceiptPdfData = {
    receiptNumber: receipt.receipt_number,
    issueDate: receipt.issue_date ?? new Date(),
    concept: receipt.concept,
    amount: receipt.amount,
    amountString: receipt.amount_string,
    currency: receipt.currency, // descripción/metodo
    amount_currency: receipt.amount_currency, // ISO para formatear amount
    services: selectedServices.map((s) => ({
      id: s.id_service,
      description: s.description ?? `Servicio ${s.id_service}`,
      salePrice: s.sale_price,
      cardInterest: s.card_interest ?? 0,
      currency: s.currency,
    })),
    booking: {
      details: receipt.booking.details ?? "-",
      departureDate: receipt.booking.departure_date,
      returnDate: receipt.booking.return_date,
      titular: {
        firstName: receipt.booking.titular.first_name,
        lastName: receipt.booking.titular.last_name,
        dni: receipt.booking.titular.dni_number ?? "-",
        address: receipt.booking.titular.address ?? "-",
        locality: receipt.booking.titular.locality ?? "-",
      },
      agency: {
        name: receipt.booking.agency.name,
        legalName: receipt.booking.agency.legal_name,
        taxId: receipt.booking.agency.tax_id,
        address: receipt.booking.agency.address ?? "-",
        logoBase64,
        logoMime,
      },
    },
    recipients: recipientsArr.map((c) => ({
      firstName: c.first_name,
      lastName: c.last_name,
      dni: c.dni_number ?? "-",
      address: c.address ?? "-",
      locality: c.locality ?? "-",
    })),
  };

  // 6) Render y envío
  const stream = await renderToStream(<ReceiptDocument {...data} />);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=recibo_${id}.pdf`);
  stream.pipe(res);
}
