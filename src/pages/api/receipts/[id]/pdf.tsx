// // src/pages/api/receipts/[id]/pdf.ts
// import { NextApiRequest, NextApiResponse } from "next";
// import { PrismaClient } from "@prisma/client";
// import generateReceiptHtml from "@/services/pdf/generateReceiptPdf";
// import { generatePDF } from "@/lib/pdfGenerator";

// const prisma = new PrismaClient();

// export default async function handler(
//   req: NextApiRequest,
//   res: NextApiResponse,
// ) {
//   if (req.method !== "GET") {
//     res.setHeader("Allow", ["GET"]);
//     return res.status(405).end();
//   }
//   const id = parseInt(req.query.id as string, 10);
//   if (isNaN(id)) return res.status(400).end("ID inválido");

//   const receipt = await prisma.receipt.findUnique({
//     where: { id_receipt: id },
//     include: {
//       booking: {
//         include: {
//           titular: true,
//           agency: true,
//           services: true,
//           user: true,
//           clients: true,
//         },
//       },
//     },
//   });
//   if (!receipt) return res.status(404).end("Recibo no encontrado");

//   const html = generateReceiptHtml({
//     receiptNumber: receipt.receipt_number,
//     booking: receipt.booking,
//     concept: receipt.concept,
//     amount: receipt.amount,
//     amountString: receipt.amount_string,
//     currency: receipt.currency,
//   });

//   try {
//     const pdf = await generatePDF({ htmlContent: html });
//     res.setHeader("Content-Type", "application/pdf");
//     res.setHeader(
//       "Content-Disposition",
//       `attachment; filename=recibo_${id}.pdf`,
//     );
//     res.send(pdf);
//   } catch (e) {
//     console.error(e);
//     res.status(500).end("Error generando PDF");
//   }
// }


// src/pages/api/receipts/[id]/pdf.tsx
import type { NextApiRequest, NextApiResponse } from "next";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { renderToStream } from "@react-pdf/renderer";
import ReceiptDocument, { ReceiptHtmlData } from "@/services/receipts/ReceiptDocument";

const prisma = new PrismaClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

  // Construye el data object
  const data: ReceiptHtmlData = {
    receiptNumber: receipt.receipt_number,
    booking: {
      details: receipt.booking.details || "-",
      departure_date: receipt.booking.departure_date,
      return_date: receipt.booking.return_date,
      titular: {
        first_name: receipt.booking.titular.first_name,
        last_name: receipt.booking.titular.last_name,
        dni_number: receipt.booking.titular.dni_number || "-",
        address: receipt.booking.titular.address || "-",
        locality: receipt.booking.titular.locality || "-",
      },
      agency: {
        name: receipt.booking.agency.name,
        legal_name: receipt.booking.agency.legal_name,
        tax_id: receipt.booking.agency.tax_id,
        address: receipt.booking.agency.address || "-",
        logoBase64,
      },
    },
    concept: receipt.concept,
    amountString: receipt.amount_string,
    currency: receipt.currency,
  };

  // ¡Esto ahora es válido porque el archivo es .tsx!
  const stream = await renderToStream(<ReceiptDocument {...data} />);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=recibo_${id}.pdf`);
  stream.pipe(res);
}
