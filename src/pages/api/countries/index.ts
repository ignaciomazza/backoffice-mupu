// src/pages/api/countries/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { z } from "zod";

/* ================== Utils ================== */
const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

/* ================== Schemas ================== */
const CreateCountry = z.object({
  name: z.string().min(1),
  iso2: z.string().length(2),
  iso3: z.string().min(2).max(3).optional(),
  slug: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
});

/* ================== Handler ================== */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") {
    const q = String(req.query.q ?? "").trim();
    const take = Math.min(Number(req.query.take ?? 300), 1000);

    const includeDisabled = ["true", "1", "yes"].includes(
      String(req.query.includeDisabled ?? "").toLowerCase(),
    );

    const where: Prisma.CountryWhereInput = {};
    if (!includeDisabled) where.enabled = true;

    if (q) {
      const qUpper = q.toUpperCase();
      where.OR = [
        { name: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { iso2: { equals: qUpper } },
        { iso3: { equals: qUpper } },
        { slug: { contains: slugify(q) } },
      ];
    }

    const items = await prisma.country.findMany({
      where,
      orderBy: [{ name: "asc" }],
      take,
      select: {
        id_country: true,
        name: true,
        iso2: true,
        iso3: true,
        slug: true,
        enabled: true,
      },
    });

    return res.status(200).json({ items });
  }

  if (req.method === "POST") {
    try {
      const body = CreateCountry.parse(req.body);
      const data = {
        name: body.name,
        iso2: body.iso2.toUpperCase(),
        iso3: body.iso3?.toUpperCase(),
        slug: body.slug ?? slugify(body.name),
        enabled: body.enabled ?? true,
      };

      const row = await prisma.country.create({ data });
      return res.status(201).json(row);
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

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
