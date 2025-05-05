// src/pages/api/receipts/[id]/pdf.ts
import { NextApiRequest, NextApiResponse } from "next";
import { PrismaClient } from "@prisma/client";
import generateReceiptHtml from "@/services/pdf/generateReceiptPdf";
import { generatePDF } from "@/lib/pdfGenerator";

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end();
  }
  const id = parseInt(req.query.id as string, 10);
  if (isNaN(id)) return res.status(400).end("ID inválido");

  const receipt = await prisma.receipt.findUnique({
    where: { id_receipt: id },
    include: {
      booking: {
        include: {
          titular: true,
          agency: true,
          services: true,
          user: true,
          clients: true,
        },
      },
    },
  });
  if (!receipt) return res.status(404).end("Recibo no encontrado");


  const html = generateReceiptHtml({
    receiptNumber: receipt.receipt_number,
    booking: receipt.booking,
    concept: receipt.concept,
    amount: receipt.amount,
    amountString: receipt.amount_string,
    currency: receipt.currency,
  });

  try {
    const pdf = await generatePDF({ htmlContent: html });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=recibo_${id}.pdf`,
    );
    res.send(pdf);
  } catch (e) {
    console.error(e);
    res.status(500).end("Error generando PDF");
  }
}
