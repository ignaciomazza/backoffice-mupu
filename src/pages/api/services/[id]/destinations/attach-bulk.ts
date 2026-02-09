// src/pages/api/services/[id]/destinations/attach-bulk.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { z } from "zod";
import { resolveAuth } from "@/lib/auth";
import { canAccessBookingByRole } from "@/lib/accessControl";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

const ItemRef = z
  .object({
    destinationId: z.number().int().positive().optional(),
    countryIso2: z.string().length(2).optional(),
    slug: z.string().min(1).optional(), // requerido si viene countryIso2
  })
  .refine((v) => v.destinationId != null || (v.countryIso2 && v.slug), {
    message: "Debes enviar destinationId o (countryIso2 + slug)",
  });

const Body = z.object({
  replace: z.boolean().default(false),
  items: z.array(ItemRef).min(1).max(50),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const serviceId = Number(req.query.id ?? "");
  if (!Number.isFinite(serviceId) || serviceId <= 0) {
    return res.status(400).json({ error: "serviceId inválido" });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const auth = await resolveAuth(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const { replace, items } = Body.parse(req.body);

    // valida servicio
    const service = await prisma.service.findFirst({
      where: { id_service: serviceId, id_agency: auth.id_agency },
      select: { id_service: true, booking: { select: { id_user: true } } },
    });
    if (!service)
      return res.status(404).json({ error: "Servicio no encontrado" });
    const allowed = await canAccessBookingByRole(auth, {
      id_user: service.booking.id_user,
      id_agency: auth.id_agency,
    });
    if (!allowed) return res.status(403).json({ error: "No autorizado." });
    const userId = auth.id_user;

    // 1) resolver países
    const isoSet = new Set(
      items
        .filter((i) => !i.destinationId && i.countryIso2)
        .map((i) => i.countryIso2!.toUpperCase()),
    );
    const countries = isoSet.size
      ? await prisma.country.findMany({
          where: { iso2: { in: Array.from(isoSet) } },
          select: { id_country: true, iso2: true },
        })
      : [];
    const byIso = new Map(countries.map((c) => [c.iso2, c.id_country]));

    // 2) construir OR de destinos por (country_id, slug) y colectar ids directos
    type Pair = { country_id: number; slug: string };
    const pairs: Pair[] = [];
    const directIds: number[] = [];

    for (const it of items) {
      if (it.destinationId) {
        directIds.push(it.destinationId);
      } else if (it.countryIso2 && it.slug) {
        const country_id = byIso.get(it.countryIso2.toUpperCase());
        if (!country_id) {
          return res
            .status(400)
            .json({ error: `País ${it.countryIso2} no encontrado` });
        }
        pairs.push({ country_id, slug: it.slug });
      }
    }

    // buscar destinos por pares (OR)
    const or: Prisma.DestinationWhereInput[] = pairs.map((p) => ({
      country_id: p.country_id,
      slug: p.slug,
    }));

    let byPairId = new Map<string, number>();
    if (or.length) {
      const found = await prisma.destination.findMany({
        where: { OR: or },
        select: { id_destination: true, country_id: true, slug: true },
      });
      byPairId = new Map(
        found.map((d) => [`${d.country_id}:${d.slug}`, d.id_destination]),
      );
    }

    // juntar todos los IDs de destino
    const destIds = new Set<number>(directIds);
    for (const p of pairs) {
      const id = byPairId.get(`${p.country_id}:${p.slug}`);
      if (!id) {
        return res.status(400).json({
          error: `Destino no encontrado para country_id=${p.country_id}, slug="${p.slug}"`,
        });
      }
      destIds.add(id);
    }
    if (destIds.size === 0) {
      return res
        .status(400)
        .json({ error: "No hay destinos válidos para adjuntar" });
    }

    // 3) transacción: opcionalmente limpiar y luego createMany(skipDuplicates)
    await prisma.$transaction(async (tx) => {
      if (replace) {
        await tx.serviceDestination.deleteMany({
          where: { service_id: serviceId },
        });
      }

      await tx.serviceDestination.createMany({
        data: Array.from(destIds).map((destination_id) => ({
          service_id: serviceId,
          destination_id,
          added_by: userId ?? null,
        })),
        skipDuplicates: true,
      });
    });

    // 4) devolver lista actualizada
    const attached = await prisma.serviceDestination.findMany({
      where: { service_id: serviceId },
      orderBy: { added_at: "asc" },
      include: {
        destination: {
          select: {
            id_destination: true,
            name: true,
            slug: true,
            country: { select: { id_country: true, name: true, iso2: true } },
          },
        },
      },
    });

    return res.status(200).json({
      serviceId,
      count: attached.length,
      items: attached.map((x) => ({
        destinationId: x.destination_id,
        name: x.destination.name,
        slug: x.destination.slug,
        country: x.destination.country,
        added_at: x.added_at,
      })),
    });
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
