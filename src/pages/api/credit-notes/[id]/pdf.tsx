// src/pages/api/credit-notes/[id]/pdf.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { renderToStream } from "@react-pdf/renderer";
import CreditNoteDocument, {
  VoucherData,
} from "@/services/credit-notes/CreditNoteDocument";

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  console.log("📥 Nueva petición a /api/credit-notes/[id]/pdf", {
    method: req.method,
    query: req.query,
  });

  if (req.method !== "GET") {
    console.log("⚠️ Método no permitido:", req.method);
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const id = Number(req.query.id);
  if (Number.isNaN(id)) {
    console.log("❌ ID inválido recibido:", req.query.id);
    res.status(400).end("ID inválido");
    return;
  }

  // 1) Obtener nota de crédito con sus relaciones
  let creditNote;
  try {
    creditNote = await prisma.creditNote.findUnique({
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
  } catch (dbErr) {
    console.error("💥 Error al consultar Prisma para id", id, dbErr);
    res.status(500).end("Error interno de base de datos");
    return;
  }

  if (!creditNote) {
    console.log("🔍 Nota de crédito no encontrada para id:", id);
    res.status(404).end("Nota de crédito no encontrada");
    return;
  }
  if (!creditNote.payloadAfip) {
    console.log("🚫 No hay payload AFIP para nota de crédito:", id);
    res.status(500).end("No hay datos AFIP para generar la nota");
    return;
  }

  // 2) Cargar logo si existe
  let logoBase64: string | undefined;
  try {
    const logoPath = path.join(process.cwd(), "public", "logo.png");
    console.log("🔎 Buscando logo en:", logoPath);
    if (fs.existsSync(logoPath)) {
      logoBase64 = fs.readFileSync(logoPath).toString("base64");
      console.log("✅ Logo cargado correctamente");
    } else {
      console.log("ℹ️ Logo no encontrado, se usará sin logo");
    }
  } catch (logoErr) {
    console.error("⚠️ Error leyendo logo:", logoErr);
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

  if (!voucherData.CAE) {
    console.error("🚫 voucherData inválido:", voucherData);
    return res.status(500).end("Datos del voucher incompletos");
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

  // 5) Inyectar las fechas en voucherData
  if (depDate) voucherData.departureDate = depDate;
  if (retDate) voucherData.returnDate = retDate;

  // 6) Enriquecer datos de emisor y receptor
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
    console.log("🏷️ Datos de emisor y receptor inyectados:", {
      emitter: voucherData.emitterName,
      recipient: voucherData.recipient,
    });
  } catch (injectErr) {
    console.error("⚠️ Error inyectando datos de emisor/receptor:", injectErr);
  }

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
    console.log("📄 Generando PDF para nota:", data.creditNumber);
    const stream = await renderToStream(<CreditNoteDocument {...data} />);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=nota_credito_${data.creditNumber}.pdf`,
    );
    stream.pipe(res);
    console.log("✅ PDF enviado correctamente");
  } catch (err) {
    console.error("💥 Error generando PDF nota de crédito:", err);
    res
      .status(500)
      .end(
        `Error al generar el PDF: ${(err as Error).message || "desconocido"}`,
      );
  }
}
