// src/pages/api/destinations/bulk/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { z } from "zod";
import { resolveAuth } from "@/lib/auth";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

const normalizeAltNames = (arr?: string[]) =>
  Array.from(
    new Set((arr ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean)),
  );

const DestinationItem = z.object({
  name: z.string().min(1),
  countryIso2: z.string().length(2).optional(),
  countryId: z.number().int().positive().optional(),
  slug: z.string().min(1).optional(),
  alt_names: z.array(z.string()).optional(),
  popularity: z.number().int().min(0).optional(),
  enabled: z.boolean().optional(),
});

const Body = z.object({
  upsert: z.boolean().default(true),
  items: z.array(DestinationItem).min(1).max(2000),
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
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const auth = await resolveAuth(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });
    const canWrite = ["desarrollador", "gerente", "administrativo"].includes(
      auth.role,
    );
    if (!canWrite) return res.status(403).json({ error: "Sin permisos" });

    const { upsert, items } = Body.parse(req.body);

    // Resolver países por iso2 en un solo query
    const isoSet = new Set(
      items
        .map((i) => i.countryIso2?.toUpperCase())
        .filter(Boolean) as string[],
    );
    const countries = isoSet.size
      ? await prisma.country.findMany({
          where: { iso2: { in: Array.from(isoSet) } },
          select: { id_country: true, iso2: true },
        })
      : [];
    const byIso = new Map(countries.map((c) => [c.iso2, c.id_country]));

    const userId = auth.id_user;

    // ✅ INTERACTIVE transaction (acepta { timeout })
    const ids = await prisma.$transaction(
      async (tx) => {
        const createdIds: number[] = [];
        for (let idx = 0; idx < items.length; idx++) {
          const it = items[idx];

          const country_id =
            it.countryId ??
            (it.countryIso2
              ? byIso.get(it.countryIso2.toUpperCase())
              : undefined);

          if (!country_id) {
            throw new Error(
              `Item ${idx}: countryId/countryIso2 inválido o no encontrado`,
            );
          }

          const slug = it.slug ?? slugify(it.name);
          const data: Prisma.DestinationUncheckedCreateInput = {
            name: it.name,
            slug,
            alt_names: normalizeAltNames(it.alt_names),
            popularity: it.popularity ?? 0,
            enabled: it.enabled ?? true,
            country_id,
            created_by: userId ?? undefined,
          };

          const r = upsert
            ? await tx.destination.upsert({
                where: { country_id_slug: { country_id, slug } },
                create: data,
                update: data,
              })
            : await tx.destination.create({ data });

          createdIds.push(r.id_destination);
        }
        return createdIds;
      },
      { timeout: 60_000 },
    );

    return res.status(200).json({ count: ids.length });
  } catch (e: unknown) {
    const msg =
      e instanceof z.ZodError
        ? e.issues.map((i) => i.message).join("; ")
        : e instanceof Error
          ? e.message
          : "Unknown error";
    return res.status(400).json({ error: msg });
  }
}
