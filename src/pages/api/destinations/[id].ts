// src/pages/api/destinations/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { z } from "zod";
import { resolveAuth } from "@/lib/auth";

const normalizeAltNames = (arr?: string[]) =>
  Array.from(
    new Set((arr ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean)),
  );

const UpdateDestination = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  alt_names: z.array(z.string()).optional(),
  popularity: z.number().int().min(0).optional(),
  enabled: z.boolean().optional(),
  countryId: z.number().int().positive().optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const id = Number(req.query.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid id" });
  }
  const auth = await resolveAuth(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  const canWrite = ["desarrollador", "gerente", "administrativo"].includes(
    auth.role,
  );

  if (req.method === "GET") {
    const row = await prisma.destination.findUnique({
      where: { id_destination: id },
      include: { country: true },
    });
    return row
      ? res.status(200).json(row)
      : res.status(404).json({ error: "Not found" });
  }

  if (req.method === "PUT") {
    if (!canWrite) return res.status(403).json({ error: "Sin permisos" });
    try {
      const body = UpdateDestination.parse(req.body);
      const data = {
        ...("name" in body ? { name: body.name } : {}),
        ...("slug" in body ? { slug: body.slug } : {}),
        ...("alt_names" in body
          ? { alt_names: normalizeAltNames(body.alt_names) }
          : {}),
        ...("popularity" in body ? { popularity: body.popularity } : {}),
        ...("enabled" in body ? { enabled: body.enabled } : {}),
        ...("countryId" in body ? { country_id: body.countryId } : {}),
      };

      const row = await prisma.destination.update({
        where: { id_destination: id },
        data,
      });
      return res.status(200).json(row);
    } catch (e: unknown) {
      const msg =
        e instanceof z.ZodError
          ? e.issues.map((i) => i.message).join("; ")
          : e instanceof Error
            ? e.message
            : "Invalid payload";
      return res.status(400).json({ error: msg });
    }
  }

  if (req.method === "DELETE") {
    if (!canWrite) return res.status(403).json({ error: "Sin permisos" });
    try {
      await prisma.destination.delete({ where: { id_destination: id } });
      return res.status(204).end();
    } catch (e: unknown) {
      // ✅ sin any: detectamos error FK de Prisma
      let msg = "Error";
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        msg =
          e.code === "P2003"
            ? "No se puede eliminar: tiene destinos asociados"
            : e.message;
      } else if (e instanceof Error) {
        msg = e.message;
      }
      return res.status(409).json({ error: msg });
    }
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
