// src/pages/api/calendar/notes.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { resolveAuth } from "@/lib/auth";
import { ensurePlanFeatureAccess } from "@/lib/planAccess.server";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
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

    const { id_user, role } = auth;

    if (!["gerente", "administrativo", "desarrollador"].includes(role)) {
      return res.status(403).json({ error: "Sin permisos para crear notas" });
    }

    if (req.method === "POST") {
      const { title, content, date } = (req.body || {}) as {
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
          creator: { connect: { id_user } }, // agencia queda asociada por el creador
        },
      });

      return res.status(201).json(note);
    }

    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    return res.status(400).json({ error: msg });
  }
}
