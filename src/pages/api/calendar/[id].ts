// src/pages/api/calendar/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { resolveAuth } from "@/lib/auth";
import { ensurePlanFeatureAccess } from "@/lib/planAccess.server";
import {
  canManageResourceSectionByUser,
  resolveCalendarVisibilityByUser,
} from "@/lib/resourceAccess";

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
    const planAccess = await ensurePlanFeatureAccess(
      auth.id_agency,
      "calendar",
    );
    if (!planAccess.allowed) {
      return res.status(403).json({ error: "Plan insuficiente" });
    }
    const { id_agency, id_user, role } = auth;
    const canManage = await canManageResourceSectionByUser({
      id_agency,
      id_user,
      role,
      key: "calendar",
    });
    if (!canManage) {
      return res.status(403).json({ error: "Sin permisos" });
    }
    const calendarVisibility = await resolveCalendarVisibilityByUser({
      id_agency,
      id_user,
      role,
    });

    // Aseguramos que la nota pertenezca a la misma agencia (vía el creador)
    const owned = await prisma.calendarNote.findFirst({
      where:
        calendarVisibility === "own"
          ? { id: noteId, creator: { id_agency, id_user } }
          : { id: noteId, creator: { id_agency } },
      select: { id: true },
    });
    if (!owned) {
      return res.status(403).json({ error: "Nota fuera de alcance" });
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
