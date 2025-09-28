// src/pages/api/destinations/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { z } from "zod";

/* ============== Utils & Schema ============== */
const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

const normalizeAltNames = (arr?: string[]) =>
  Array.from(
    new Set((arr ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean)),
  );

const CreateDestination = z.object({
  name: z.string().min(1),
  countryId: z.number().int().positive(),
  slug: z.string().min(1).optional(),
  alt_names: z.array(z.string()).optional(),
  popularity: z.number().int().min(0).optional(),
  enabled: z.boolean().optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") {
    const q = String(req.query.q ?? "").trim();
    const iso = String(req.query.countryIso2 ?? "").toUpperCase();
    const countryId = Number(req.query.countryId ?? "");
    const take = Math.min(Number(req.query.take ?? 20), 200);

    const includeDisabled = ["true", "1", "yes"].includes(
      String(req.query.includeDisabled ?? "").toLowerCase(),
    );

    const norm = q ? slugify(q) : "";
    const tokens = q ? norm.split("-").filter(Boolean) : [];

    const where: Prisma.DestinationWhereInput = {};
    if (!includeDisabled) where.enabled = true;
    if (iso) where.country = { iso2: iso };
    if (Number.isFinite(countryId) && countryId > 0)
      where.country_id = countryId;
    if (q) {
      const or: Prisma.DestinationWhereInput[] = [
        { name: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { slug: { contains: norm } },
      ];
      for (const t of tokens) or.push({ alt_names: { has: t } });
      where.OR = or;
    }

    const items = await prisma.destination.findMany({
      where,
      orderBy: [{ popularity: "desc" }, { name: "asc" }],
      take,
      include: {
        country: { select: { id_country: true, name: true, iso2: true } },
      },
    });

    return res.status(200).json({ items });
  }

  if (req.method === "POST") {
    try {
      const body = CreateDestination.parse(req.body);
      const slug = body.slug ?? slugify(body.name);

      const row = await prisma.destination.create({
        data: {
          name: body.name,
          slug,
          alt_names: normalizeAltNames(body.alt_names),
          popularity: body.popularity ?? 0,
          enabled: body.enabled ?? true,
          country_id: body.countryId,
        },
      });

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
