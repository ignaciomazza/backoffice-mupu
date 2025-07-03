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
  console.log("📥 Petición a /api/invoices/[id]/pdf", {
    method: req.method,
    query: req.query,
  });

  if (req.method !== "GET") {
    console.log("⚠️ Método no permitido:", req.method);
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const id = parseInt(req.query.id as string, 10);
  if (isNaN(id)) {
    console.log("❌ ID inválido recibido:", req.query.id);
    return res.status(400).end("ID inválido");
  }

  let invoice;
  try {
    invoice = await prisma.invoice.findUnique({
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
    console.log(
      "🔍 Resultado consulta invoice:",
      invoice ? "Encontrada" : "No encontrada",
    );
  } catch (dbErr) {
    console.error("💥 Error al consultar factura en DB:", dbErr);
    return res.status(500).end("Error interno de base de datos");
  }

  if (!invoice) {
    return res.status(404).end("Factura no encontrada");
  }
  if (!invoice.payloadAfip) {
    console.log("🚫 No hay payload AFIP para factura:", id);
    return res.status(500).end("No hay datos para generar la factura");
  }

  // 2) Load logo
  let logoBase64: string | undefined;
  try {
    const logoPath = path.join(process.cwd(), "public", "logo.png");
    console.log("🔎 Buscando logo en:", logoPath);
    if (fs.existsSync(logoPath)) {
      logoBase64 = fs.readFileSync(logoPath).toString("base64");
      console.log("✅ Logo cargado");
    } else {
      console.log("ℹ️ Logo no encontrado");
    }
  } catch (logoErr) {
    console.error("⚠️ Error leyendo logo:", logoErr);
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

  if (!voucherData) {
    console.log("❌ voucherData ausente o inválido en payload:", payload);
    return res.status(500).end("Datos de voucher incompletos");
  }

  // 4) Calcular fechas
  const parseYmd = (s: string) => {
    const clean = s.includes("-") ? s.replace(/-/g, "") : s;
    return new Date(
      `${clean.substr(0, 4)}-${clean.substr(4, 2)}-${clean.substr(6, 2)}`,
    );
  };
  let depDate: string | undefined, retDate: string | undefined;
  if (serviceDates.length) {
    try {
      console.log("📅 serviceDates:", serviceDates);
      const froms = serviceDates.map((sd) => parseYmd(sd.from));
      const tos = serviceDates.map((sd) => parseYmd(sd.to));
      const min = new Date(Math.min(...froms.map((d) => d.getTime())));
      const max = new Date(Math.max(...tos.map((d) => d.getTime())));
      depDate = min.toISOString().split("T")[0];
      retDate = max.toISOString().split("T")[0];
      console.log("↔️ Fechas calculadas:", { depDate, retDate });
    } catch (dateErr) {
      console.error("⚠️ Error calculando fechas:", dateErr);
    }
  }

  // 5) Enriquecer voucherData
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
  console.log("🏷️ Datos enriquecidos de voucher:", {
    emitter: enrichedVoucher.emitterName,
    recipient: enrichedVoucher.recipient,
  });

  // 6) Render y enviar PDF
  try {
    console.log("📄 Generando PDF factura:", invoice.invoice_number);
    const stream = await renderToStream(
      <InvoiceDocument
        {...{
          invoiceNumber: invoice.invoice_number,
          issueDate: invoice.issue_date,
          currency: invoice.currency,
          qrBase64,
          logoBase64,
          voucherData: enrichedVoucher,
        }}
      />,
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=factura_${id}.pdf`,
    );
    stream.pipe(res);
    console.log("✅ PDF factura enviado");
  } catch (err) {
    console.error("💥 Error generando PDF factura:", err);
    res
      .status(500)
      .end(
        `Error al generar el PDF: ${(err as Error).message || "desconocido"}`,
      );
  }
}
