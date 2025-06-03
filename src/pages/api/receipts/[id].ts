// src/pages/api/receipts/[id].ts
import { NextApiRequest, NextApiResponse } from "next";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const id = parseInt(req.query.id as string, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: "ID inválido" });
  }

  if (req.method === "GET") {
    const receipt = await prisma.receipt.findUnique({
      where: { id_receipt: id },
    });
    if (!receipt)
      return res.status(404).json({ error: "Recibo no encontrado" });
    return res.status(200).json({ receipt });
  }

  if (req.method === "DELETE") {
    try {
      await prisma.receipt.delete({ where: { id_receipt: id } });
      return res.status(204).end();
    } catch {
      return res.status(500).json({ error: "No se pudo eliminar el recibo" });
    }
  }

  res.setHeader("Allow", ["GET", "DELETE"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
