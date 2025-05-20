// src/pages/api/invoices/[id]/pdf.tsx

import React from "react";
import type { NextApiRequest, NextApiResponse } from "next";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { renderToStream } from "@react-pdf/renderer";
import InvoiceDocument, {
  VoucherData,
} from "@/services/invoices/InvoiceDocument";

interface PayloadAfip {
  voucherData: VoucherData;
  afipResponse: {
    CAE: string;
    CAEFchVto: string;
  };
  qrBase64: string;
  description21?: string[];
  description10_5?: string[];
  descriptionNonComputable?: string[];
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
  if (isNaN(id)) {
    return res.status(400).end("ID inválido");
  }

  // Fetch invoice and related booking/titular/agency
  const invoice = await prisma.invoice.findUnique({
    where: { id_invoice: id },
    include: { booking: { include: { titular: true, agency: true } } },
  });
  if (!invoice) {
    return res.status(404).end("Factura no encontrada");
  }
  if (!invoice.payloadAfip) {
    return res.status(500).end("No hay datos para generar la factura");
  }

  // Load logo if exists
  let logoBase64: string | undefined;
  try {
    const logoPath = path.join(process.cwd(), "public", "logo.png");
    if (fs.existsSync(logoPath)) {
      logoBase64 = fs.readFileSync(logoPath).toString("base64");
    }
  } catch {
    // ignore
  }

  // Cast payload to our interface
  const payload = invoice.payloadAfip as unknown as PayloadAfip;
  const { voucherData, qrBase64 } = payload;

  // Prepare props for PDF component
  const data = {
    invoiceNumber: invoice.invoice_number,
    issueDate: invoice.issue_date,
    voucherData,
    qrBase64,
    currency: invoice.currency,
    logoBase64,
  };

  // Render and stream PDF back to client
  const stream = await renderToStream(<InvoiceDocument {...data} />);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=factura_${id}.pdf`,
  );
  stream.pipe(res);
}
