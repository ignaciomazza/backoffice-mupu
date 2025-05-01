// src/pages/api/invoices/[id].ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { generatePDF } from "@/lib/pdfGenerator";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { id } = req.query;

  if (req.method === "GET") {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id_invoice: parseInt(id as string) },
      });

      if (!invoice) {
        return res
          .status(404)
          .json({ success: false, message: "Factura no encontrada" });
      }

      // Se usa el campo facturaHtml, ya que es donde se almacena el contenido de la factura.
      if (!invoice.facturaHtml) {
        throw new Error("El contenido de la factura no está disponible.");
      }

      if (req.headers.accept === "application/pdf") {
        const pdf = await generatePDF({
          htmlContent: invoice.facturaHtml,
        });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=factura_${invoice.id_invoice}.pdf`,
        );
        res.send(pdf);
      } else {
        res.status(200).json({ success: true, invoice });
      }
    } catch (error) {
      console.error("Error obteniendo factura:", error);
      res.status(500).json({
        success: false,
        message: "Error al obtener la factura",
      });
    }
  } else {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
