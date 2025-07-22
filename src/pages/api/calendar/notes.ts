// src/pages/api/calendar/notes.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import jwt, { JwtPayload } from "jsonwebtoken";

type SessionPayload = JwtPayload & {
  userId: number;
  role: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No autorizado" });
  }
  const token = auth.slice(7);

  let payload: SessionPayload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET!) as SessionPayload;
  } catch {
    return res.status(401).json({ error: "Token inválido" });
  }

  if (!["gerente", "administrativo", "desarrollador"].includes(payload.role)) {
    return res.status(403).json({ error: "Sin permisos para crear notas" });
  }

  if (req.method === "POST") {
    const { title, content, date } = req.body as {
      title?: string;
      content?: string;
      date?: string;
    };

    if (!title?.trim() || !date) {
      return res.status(400).json({ error: "Faltan datos obligatorios" });
    }

    const note = await prisma.calendarNote.create({
      data: {
        title: title.trim(),
        content: content?.trim() ?? "",
        date: new Date(date),
        creator: {
          connect: { id_user: payload.userId },
        },
      },
    });

    return res.status(201).json(note);
  }

  res.setHeader("Allow", ["POST"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
