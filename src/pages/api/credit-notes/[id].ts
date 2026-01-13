// src/pages/api/credit-notes/[id].ts

import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { decodePublicId, encodePublicId } from "@/lib/publicIds";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // console.info(`[CreditNotes API] ${req.method} ${req.url}`);

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const rawId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!rawId) {
    return res.status(400).json({ success: false, message: "ID inválido" });
  }
  const rawIdStr = String(rawId);
  const parsedId = Number(rawIdStr);
  const decoded =
    Number.isFinite(parsedId) && parsedId > 0
      ? null
      : decodePublicId(rawIdStr);
  if (decoded && decoded.t !== "credit_note") {
    return res.status(400).json({ success: false, message: "ID inválido" });
  }
  if (!decoded && (!Number.isFinite(parsedId) || parsedId <= 0)) {
    return res.status(400).json({ success: false, message: "ID inválido" });
  }

  const creditNote = await prisma.creditNote.findFirst({
    where: decoded
      ? { id_agency: decoded.a, agency_credit_note_id: decoded.i }
      : { id_credit_note: parsedId },
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

  const public_id =
    creditNote.agency_credit_note_id != null
      ? encodePublicId({
          t: "credit_note",
          a: creditNote.id_agency,
          i: creditNote.agency_credit_note_id,
        })
      : null;

  return res
    .status(200)
    .json({ success: true, creditNote: { ...creditNote, public_id } });
}
