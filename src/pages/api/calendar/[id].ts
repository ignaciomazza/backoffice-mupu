// src/pages/api/calendar/notes/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";

type MyJWTPayload = JWTPayload & { userId?: number; id_user?: number };

async function resolveUserFromRequest(
  req: NextApiRequest,
): Promise<{ id_user: number; id_agency: number; role: string }> {
  const h = req.headers["x-user-id"];
  const uidFromHeader =
    typeof h === "string"
      ? parseInt(h, 10)
      : Array.isArray(h)
        ? parseInt(h[0] ?? "", 10)
        : NaN;
  let uid: number | null =
    Number.isFinite(uidFromHeader) && uidFromHeader > 0 ? uidFromHeader : null;

  if (!uid) {
    let token: string | null = null;
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) token = auth.slice(7);
    if (!token) {
      const cookieToken = req.cookies?.token;
      if (typeof cookieToken === "string" && cookieToken.length > 0) {
        token = cookieToken;
      }
    }
    if (!token) throw new Error("No autorizado");
    const secret = process.env.JWT_SECRET || "tu_secreto_seguro";
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
    );
    const p = payload as MyJWTPayload;
    uid = Number(p.userId ?? p.id_user ?? 0) || null;
  }

  if (!uid) throw new Error("No autorizado");

  const user = await prisma.user.findUnique({
    where: { id_user: uid },
    select: { id_user: true, id_agency: true, role: true },
  });
  if (!user?.id_agency)
    throw new Error("El usuario no tiene agencia asociada.");
  return { id_user: user.id_user, id_agency: user.id_agency, role: user.role };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const noteId = Number(req.query.id);
  if (isNaN(noteId)) return res.status(400).json({ error: "ID inválido" });

  try {
    const { id_agency, role } = await resolveUserFromRequest(req);
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
