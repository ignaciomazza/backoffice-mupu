// src/pages/api/calendar/notes.ts
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
  try {
    const { id_user, role } = await resolveUserFromRequest(req);

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
