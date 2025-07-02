// src/pages/api/credit-notes/[id]/pdf.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { renderToStream } from "@react-pdf/renderer";
import CreditNoteDocument, {
  VoucherData,
} from "@/services/cedit-notes/CreditNoteDocument";

interface PayloadAfip {
  voucherData: VoucherData;
  afipResponse?: { CAE: string; CAEFchVto: string };
  qrBase64?: string;
  serviceDates?: Array<{ id_service: number; from: string; to: string }>;
}

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const id = Number(req.query.id);
  if (Number.isNaN(id)) {
    res.status(400).end("ID inválido");
    return;
  }

  // 1) Obtener nota de crédito con sus relaciones
  const creditNote = await prisma.creditNote.findUnique({
    where: { id_credit_note: id },
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

  if (!creditNote) {
    res.status(404).end("Nota de crédito no encontrada");
    return;
  }
  if (!creditNote.payloadAfip) {
    res.status(500).end("No hay datos AFIP para generar la nota");
    return;
  }

  // 2) Cargar logo si existe
  let logoBase64: string | undefined;
  try {
    const logoPath = path.join(process.cwd(), "public", "logo.png");
    if (fs.existsSync(logoPath)) {
      logoBase64 = fs.readFileSync(logoPath).toString("base64");
    }
  } catch {
    // ignore
  }

  // 3) Castear primero a unknown, luego a PayloadAfip
  const payloadAfip = creditNote.payloadAfip as unknown as PayloadAfip;
  const { voucherData, qrBase64, serviceDates = [] } = payloadAfip;

  // 4) Calcular período desde/hasta
  const parseYmd = (s: string) => {
    const clean = s.includes("-") ? s.replace(/-/g, "") : s;
    return new Date(
      `${clean.slice(0, 4)}-${clean.slice(4, 2)}-${clean.slice(6, 2)}`,
    );
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

  // 5) Inyectar las fechas en voucherData
  if (depDate) voucherData.departureDate = depDate;
  if (retDate) voucherData.returnDate = retDate;

  // 6) Enriquecer datos de emisor y receptor
  const { invoice } = creditNote;
  const { booking } = invoice;
  voucherData.emitterName = booking.agency.name;
  voucherData.emitterLegalName = booking.agency.legal_name;
  voucherData.emitterTaxId = booking.agency.tax_id ?? "";
  voucherData.emitterAddress = booking.agency.address ?? "";
  voucherData.recipient =
    invoice.recipient ||
    `${booking.titular.first_name} ${booking.titular.last_name}`;

  // 7) Preparar props para el PDF
  const data = {
    creditNumber: creditNote.credit_number,
    issueDate: creditNote.issue_date,
    currency: creditNote.currency,
    qrBase64,
    logoBase64,
    voucherData,
    items: creditNote.items,
  };

  // 8) Render y stream del PDF
  try {
    const stream = await renderToStream(<CreditNoteDocument {...data} />);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=nota_credito_${creditNote.credit_number}.pdf`,
    );
    stream.pipe(res);
  } catch (err) {
    console.error("Error generando PDF nota de crédito:", err);
    res.status(500).end("Error al generar el PDF");
  }
}
