// src/pages/api/receipts/[id]/pdf.tsx
import type { NextApiRequest, NextApiResponse } from "next";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { renderToStream } from "@react-pdf/renderer";
import ReceiptDocument, {
  ReceiptPdfData,
} from "@/services/receipts/ReceiptDocument";

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
  if (isNaN(id)) return res.status(400).end("ID inválido");

  const receipt = await prisma.receipt.findUnique({
    where: { id_receipt: id },
    include: {
      booking: { include: { titular: true, agency: true, services: true } },
    },
  });
  if (!receipt) return res.status(404).end("Recibo no encontrado");

  // Carga logo
  const logoPath = path.join(process.cwd(), "public", "logo.png");
  let logoBase64: string | undefined;
  if (fs.existsSync(logoPath)) {
    logoBase64 = fs.readFileSync(logoPath).toString("base64");
  }

  // Sólo los servicios seleccionados
  const selectedServices = receipt.booking.services.filter((s) =>
    receipt.serviceIds.includes(s.id_service),
  );

  const data: ReceiptPdfData = {
    receiptNumber: receipt.receipt_number,
    issueDate: receipt.issue_date ?? new Date(),
    concept: receipt.concept,
    amount: receipt.amount,
    amountString: receipt.amount_string,
    currency: receipt.currency,
    amount_currency: receipt.amount_currency,
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
      },
    },
  };

  const stream = await renderToStream(<ReceiptDocument {...data} />);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=recibo_${id}.pdf`);
  stream.pipe(res);
}
