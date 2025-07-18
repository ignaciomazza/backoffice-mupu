// src/pages/api/credit-notes/[id].ts

import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // console.info(`[CreditNotes API] ${req.method} ${req.url}`);

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const id = parseInt(req.query.id as string, 10);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, message: "ID inválido" });
  }

  const creditNote = await prisma.creditNote.findUnique({
    where: { id_credit_note: id },
    include: {
      items: true,
      invoice: {
        include: {
          booking: {
            include: {
              titular: true,
              agency: true,
            },
          },
          client: {
            select: { first_name: true, last_name: true },
          },
        },
      },
    },
  });

  if (!creditNote) {
    return res
      .status(404)
      .json({ success: false, message: "Nota de crédito no encontrada" });
  }

  return res.status(200).json({ success: true, creditNote });
}
