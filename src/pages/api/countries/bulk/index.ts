// src/pages/api/countries/bulk/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { resolveAuth } from "@/lib/auth";

const CountryItem = z.object({
  name: z.string().min(1),
  iso2: z.string().length(2),
  iso3: z.string().min(2).max(3).optional(),
  slug: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
});

const Body = z.object({
  upsert: z.boolean().default(true),
  items: z.array(CountryItem).min(1).max(1000),
});

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const auth = await resolveAuth(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });
    const canWrite = ["desarrollador", "gerente", "administrativo"].includes(
      auth.role,
    );
    if (!canWrite) return res.status(403).json({ error: "Sin permisos" });

    const { upsert, items } = Body.parse(req.body);

    const rows = await prisma.$transaction(
      async (tx) => {
        const out: unknown[] = [];
        for (const it of items) {
          const iso2 = it.iso2.toUpperCase();
          const slug = it.slug ?? slugify(it.name);
          const data = {
            name: it.name,
            iso2,
            iso3: it.iso3,
            slug,
            enabled: it.enabled ?? true,
          };
          const row = upsert
            ? await tx.country.upsert({
                where: { iso2 },
                create: data,
                update: data,
              })
            : await tx.country.create({ data });
          out.push(row);
        }
        return out;
      },
      { maxWait: 5_000, timeout: 30_000 },
    );

    return res
      .status(200)
      .json({ created: rows.length, updated: 0, skipped: 0, items: rows });
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
