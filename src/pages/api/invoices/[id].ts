// src/pages/api/invoices/[id].ts

import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

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
    return res.status(400).json({ success: false, message: "ID inválido" });
  }

  // Traigo la factura con sus datos de booking (titular y agency)
  // y el campo payloadAfip (escalar JSON) se incluye automáticamente
  const invoice = await prisma.invoice.findUnique({
    where: { id_invoice: id },
    include: {
      booking: {
        include: { titular: true, agency: true },
      },
    },
  });

  if (!invoice) {
    return res
      .status(404)
      .json({ success: false, message: "Factura no encontrada" });
  }

  // Ya tienes invoice.payloadAfip aquí como JSON
  return res.status(200).json({ success: true, invoice });
}
