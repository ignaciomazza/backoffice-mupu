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
  afipResponse?: {
    CAE: string;
    CAEFchVto: string;
  };
  qrBase64?: string;
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

  const id = Number(req.query.id);
  if (Number.isNaN(id)) {
    return res.status(400).end("ID inválido");
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
    return res.status(404).end("Nota de crédito no encontrada");
  }
  if (!creditNote.payloadAfip) {
    return res.status(500).end("No hay datos AFIP para generar la nota");
  }

  // 2) Cargar logo si existe
  let logoBase64: string | undefined;
  const logoPath = path.join(process.cwd(), "public", "logo.png");
  if (fs.existsSync(logoPath)) {
    logoBase64 = fs.readFileSync(logoPath).toString("base64");
  }

  // 3) Reconstruir el payload como en facturas
  const raw = creditNote.payloadAfip as unknown as VoucherData & {
    CAEFchVto?: string;
    qrBase64?: string;
  };

  const payload: PayloadAfip = {
    voucherData: {
      CbteTipo: raw.CbteTipo,
      PtoVta: raw.PtoVta,
      CbteDesde: raw.CbteDesde,
      CbteFch: raw.CbteFch,
      ImpTotal: raw.ImpTotal,
      ImpNeto: raw.ImpNeto,
      ImpIVA: raw.ImpIVA,
      CAE: raw.CAE,
      CAEFchVto: raw.CAEFchVto ?? "",
      DocNro: raw.DocNro,
      emitterName: "", // se llenará abajo
      emitterLegalName: "", // se llenará abajo
      emitterTaxId: "",
      emitterAddress: "",
      recipient: "",
    },
    afipResponse:
      raw.CAE && raw.CAEFchVto
        ? { CAE: raw.CAE, CAEFchVto: raw.CAEFchVto }
        : undefined,
    qrBase64: raw.qrBase64,
  };

  const { voucherData, qrBase64 } = payload;

  // 4) Enriquecer datos de emisor y receptor
  const { invoice } = creditNote;
  const { booking } = invoice;
  voucherData.emitterName = booking.agency.name;
  voucherData.emitterLegalName = booking.agency.legal_name;
  voucherData.emitterTaxId = booking.agency.tax_id ?? "";
  voucherData.emitterAddress = booking.agency.address ?? "";
  voucherData.recipient =
    invoice.recipient ||
    `${booking.titular.first_name} ${booking.titular.last_name}`;

  // 5) Preparar props para el PDF
  const data = {
    creditNumber: creditNote.credit_number,
    issueDate: creditNote.issue_date,
    currency: creditNote.currency,
    qrBase64,
    logoBase64,
    voucherData,
    items: creditNote.items,
  };

  // 6) Render y stream del PDF
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
