// src/pages/api/invoices/[id]/pdf.ts

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
  serviceDates?: { from: string; to: string }[];
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

  // 1) Fetch invoice with related booking, titular (client) and agency
  const invoice = await prisma.invoice.findUnique({
    where: { id_invoice: id },
    include: {
      booking: {
        include: {
          titular: true,
          agency: true,
        },
      },
    },
  });

  if (!invoice) {
    return res.status(404).end("Factura no encontrada");
  }
  if (!invoice.payloadAfip) {
    return res.status(500).end("No hay datos para generar la factura");
  }

  // 2) Load logo if exists
  let logoBase64: string | undefined;
  try {
    const logoPath = path.join(process.cwd(), "public", "logo.png");
    if (fs.existsSync(logoPath)) {
      logoBase64 = fs.readFileSync(logoPath).toString("base64");
    }
  } catch {
    // ignore
  }

  // 3) Cast payload
  const payload = invoice.payloadAfip as unknown as PayloadAfip;
  const {
    voucherData,
    qrBase64,
    description21,
    description10_5,
    descriptionNonComputable,
    serviceDates = [],
  } = payload;

  const parseYmd = (s: string) => {
    // acepta "YYYY-MM-DD" o "YYYYMMDD"
    const clean = s.includes("-") ? s.replace(/-/g, "") : s;
    return new Date(
      `${clean.substr(0, 4)}-${clean.substr(4, 2)}-${clean.substr(6, 2)}`,
    );
  };
  let depDate: string | undefined, retDate: string | undefined;
  if (serviceDates.length) {
    const froms = serviceDates.map((sd) => parseYmd(sd.from));
    const tos = serviceDates.map((sd) => parseYmd(sd.to));
    const min = new Date(Math.min(...froms.map((d) => d.getTime())));
    const max = new Date(Math.max(...tos.map((d) => d.getTime())));
    depDate = min.toISOString().split("T")[0]; // "YYYY-MM-DD"
    retDate = max.toISOString().split("T")[0];
  }

  // 4) Enrich voucherData with agency, client and booking info
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
  } = {
    ...voucherData,
    emitterName: invoice.booking.agency.name,
    emitterLegalName: invoice.booking.agency.legal_name,
    emitterTaxId: invoice.booking.agency.tax_id,
    emitterAddress: invoice.booking.agency.address ?? "",
    recipient: invoice.recipient,
    departureDate: depDate,
    returnDate: retDate,
    description21,
    description10_5,
    descriptionNonComputable,
  };

  // 5) Prepare props for PDF component
  const data = {
    invoiceNumber: invoice.invoice_number,
    issueDate: invoice.issue_date,
    currency: invoice.currency,
    qrBase64,
    logoBase64,
    voucherData: enrichedVoucher,
  };

  // 6) Render and stream PDF
  const stream = await renderToStream(<InvoiceDocument {...data} />);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=factura_${id}.pdf`,
  );
  stream.pipe(res);
}
