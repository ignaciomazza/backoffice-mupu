import type { NextApiRequest, NextApiResponse } from "next";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { renderToStream } from "@react-pdf/renderer";
import ReceiptDocument, {
  ReceiptPdfData,
} from "@/services/receipts/ReceiptDocument";

type AgencyExtras = {
  id_agency?: number | null;
  logo_url?: string | null;
  slug?: string | null;
  logo_filename?: string | null;
};

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

  // 1) Recibo + (booking | agencia) + clientes
  const receipt = await prisma.receipt.findUnique({
    where: { id_receipt: id },
    include: {
      booking: {
        include: { titular: true, agency: true, services: true, clients: true },
      },
      agency: true, // para recibos sin booking
    },
  });
  if (!receipt) return res.status(404).end("Recibo no encontrado");

  // 2) Logo multi-agencia
  let logoBase64: string | undefined;
  let logoMime: string | undefined;

  try {
    const agency = (receipt.booking?.agency ??
      receipt.agency) as typeof receipt.agency & AgencyExtras;
    const fetched = await fetchLogoFromUrl(agency?.logo_url);
    if (fetched) {
      logoBase64 = fetched.base64;
      logoMime = fetched.mime;
    }
    if (!logoBase64) {
      const preferred: string[] = [];
      const slug = (agency as AgencyExtras)?.slug ?? undefined;
      const logoFile = (agency as AgencyExtras)?.logo_filename ?? undefined;
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
      if (!logoBase64) {
        const fallback = path.join(process.cwd(), "public", "logo.png");
        if (fs.existsSync(fallback)) {
          logoBase64 = fs.readFileSync(fallback).toString("base64");
          logoMime = "image/png";
        }
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("⚠️ Error obteniendo logo de agencia:", e);
  }

  // 3) Servicios seleccionados (si hay booking)
  const bookingServices = receipt.booking?.services ?? [];
  const selectedServices = bookingServices.filter((s) =>
    (receipt.serviceIds ?? []).includes(s.id_service),
  );

  // 4) Destinatarios: clientIds => buscar; si no, titular (si hay booking); si no, vacío
  const rawClients = receipt.clientIds.length
    ? await prisma.client.findMany({
        where: { id_client: { in: receipt.clientIds } },
      })
    : [];
  const recipientsArr = rawClients.length
    ? rawClients
    : receipt.booking
      ? [receipt.booking.titular]
      : [];

  // 5) Armar datos para el PDF
  const ag = (receipt.booking?.agency ?? receipt.agency)!;
  const data: ReceiptPdfData = {
    receiptNumber: receipt.receipt_number,
    issueDate: receipt.issue_date ?? new Date(),
    concept: receipt.concept,
    amount: receipt.amount,
    amountString: receipt.amount_string,
    // etiqueta visible: texto libre si existe, si no ISO
    currency: receipt.currency || receipt.amount_currency,
    // ISO para formatear montos
    amount_currency: receipt.amount_currency,
    services: selectedServices.map((s) => ({
      id: s.id_service,
      description: s.description ?? `Servicio ${s.id_service}`,
      salePrice: s.sale_price,
      cardInterest: s.card_interest ?? 0,
      currency: s.currency,
    })),
    booking: {
      details: receipt.booking?.details ?? "-",
      // Nunca null: si no hay booking, uso la fecha del recibo; si falta return, uso departure
      departureDate:
        receipt.booking?.departure_date ?? receipt.issue_date ?? new Date(),
      returnDate:
        receipt.booking?.return_date ??
        receipt.booking?.departure_date ??
        receipt.issue_date ??
        new Date(),
      titular: receipt.booking
        ? {
            firstName: receipt.booking.titular.first_name,
            lastName: receipt.booking.titular.last_name,
            dni: receipt.booking.titular.dni_number ?? "-",
            address: receipt.booking.titular.address ?? "-",
            locality: receipt.booking.titular.locality ?? "-",
          }
        : {
            firstName: "-",
            lastName: "-",
            dni: "-",
            address: "-",
            locality: "-",
          },
      agency: {
        name: ag.name,
        legalName: ag.legal_name,
        taxId: ag.tax_id,
        address: ag.address ?? "-",
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

  // 6) Render
  const stream = await renderToStream(<ReceiptDocument {...data} />);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=recibo_${id}.pdf`);
  stream.pipe(res);
}
