// src/pages/api/calendar/notes/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import jwt, { JwtPayload } from "jsonwebtoken";

type SessionPayload = JwtPayload & { id_user: number; role: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const {
    query: { id },
    method,
  } = req;
  const noteId = Number(id);
  if (isNaN(noteId)) return res.status(400).json({ error: "ID inválido" });

  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer "))
    return res.status(401).json({ error: "No autorizado" });
  let payload: SessionPayload;
  try {
    payload = jwt.verify(
      auth.slice(7),
      process.env.JWT_SECRET!,
    ) as SessionPayload;
  } catch {
    return res.status(401).json({ error: "Token inválido" });
  }

  if (!["gerente", "administrativo", "desarrollador"].includes(payload.role)) {
    return res.status(403).json({ error: "Sin permisos" });
  }

  if (method === "PUT") {
    const { title, content } = req.body as { title?: string; content?: string };
    if (!title?.trim())
      return res.status(400).json({ error: "Título obligatorio" });
    const updated = await prisma.calendarNote.update({
      where: { id: noteId },
      data: {
        title: title.trim(),
        content: content?.trim() ?? "",
      },
    });
    return res.status(200).json(updated);
  }

  if (method === "DELETE") {
    await prisma.calendarNote.delete({ where: { id: noteId } });
    return res.status(204).end();
  }

  res.setHeader("Allow", ["PUT", "DELETE"]);
  return res.status(405).end(`Method ${method} Not Allowed`);
}
