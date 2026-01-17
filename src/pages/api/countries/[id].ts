// src/pages/api/countries/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { z } from "zod";
import { resolveAuth } from "@/lib/auth";

const UpdateCountry = z.object({
  name: z.string().min(1).optional(),
  iso2: z.string().length(2).optional(),
  iso3: z.string().min(2).max(3).optional(),
  slug: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
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
    const row = await prisma.country.findUnique({ where: { id_country: id } });
    return row
      ? res.status(200).json(row)
      : res.status(404).json({ error: "Not found" });
  }

  if (req.method === "PUT") {
    if (!canWrite) return res.status(403).json({ error: "Sin permisos" });
    try {
      const body = UpdateCountry.parse(req.body);
      const row = await prisma.country.update({
        where: { id_country: id },
        data: {
          ...("name" in body ? { name: body.name } : {}),
          ...("iso2" in body ? { iso2: body.iso2?.toUpperCase() } : {}),
          ...("iso3" in body ? { iso3: body.iso3?.toUpperCase() } : {}),
          ...("slug" in body ? { slug: body.slug } : {}),
          ...("enabled" in body ? { enabled: body.enabled } : {}),
        },
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
      await prisma.country.delete({ where: { id_country: id } });
      return res.status(204).end();
    } catch (e: unknown) {
      // ✅ sin any: detectamos error FK de Prisma
      let msg = "Error";
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        msg =
          e.code === "P2003"
            ? "No se puede eliminar: está referenciado por servicios"
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
