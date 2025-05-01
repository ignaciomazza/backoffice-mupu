// src/pages/api/receipts/[id].ts
import { NextApiRequest, NextApiResponse } from "next";
import { PrismaClient } from "@prisma/client";
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
  });
  if (!receipt) return res.status(404).end("Recibo no encontrado");

  res.status(200).json({ receipt });
}
