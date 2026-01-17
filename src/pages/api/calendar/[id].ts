// src/pages/api/calendar/notes/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { resolveAuth } from "@/lib/auth";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const noteId = Number(req.query.id);
  if (isNaN(noteId)) return res.status(400).json({ error: "ID inválido" });

  try {
    const auth = await resolveAuth(req);
    if (!auth?.id_agency) {
      return res.status(401).json({ error: "No autorizado" });
    }
    const { id_agency, role } = auth;
    if (!["gerente", "administrativo", "desarrollador"].includes(role)) {
      return res.status(403).json({ error: "Sin permisos" });
    }

    // Aseguramos que la nota pertenezca a la misma agencia (vía el creador)
    const owned = await prisma.calendarNote.findFirst({
      where: { id: noteId, creator: { id_agency } },
      select: { id: true },
    });
    if (!owned) {
      return res.status(403).json({ error: "Nota de otra agencia" });
    }

    if (req.method === "PUT") {
      const { title, content } = (req.body || {}) as {
        title?: string;
        content?: string;
      };
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

    if (req.method === "DELETE") {
      await prisma.calendarNote.delete({ where: { id: noteId } });
      return res.status(204).end();
    }

    res.setHeader("Allow", ["PUT", "DELETE"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    return res.status(400).json({ error: msg });
  }
}
