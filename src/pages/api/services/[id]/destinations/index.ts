// src/pages/api/services/[id]/destinations/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { resolveAuth } from "@/lib/auth";

type BookingAccessContext = {
  id_user: number;
  id_agency: number;
  role: string;
};

const ADMIN_ROLES = new Set(["gerente", "administrativo", "desarrollador"]);

async function getLeaderScope(authUserId: number, authAgencyId: number) {
  const teams = await prisma.salesTeam.findMany({
    where: {
      id_agency: authAgencyId,
      user_teams: { some: { user: { id_user: authUserId, role: "lider" } } },
    },
    include: { user_teams: { select: { id_user: true } } },
  });
  const userIds = new Set<number>([authUserId]);
  teams.forEach((t) => t.user_teams.forEach((ut) => userIds.add(ut.id_user)));
  return { userIds: Array.from(userIds) };
}

async function canAccessBooking(
  auth: BookingAccessContext,
  ownerId: number,
): Promise<boolean> {
  if (ADMIN_ROLES.has(auth.role)) return true;
  if (auth.role === "vendedor") return ownerId === auth.id_user;
  if (auth.role === "lider") {
    const scope = await getLeaderScope(auth.id_user, auth.id_agency);
    return scope.userIds.includes(ownerId);
  }
  return false;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const id = Number(req.query.id ?? "");
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: "serviceId inválido" });
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const auth = await resolveAuth(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const exists = await prisma.service.findFirst({
    where: { id_service: id, id_agency: auth.id_agency },
    select: { id_service: true, booking: { select: { id_user: true } } },
  });
  if (!exists) return res.status(404).json({ error: "Servicio no encontrado" });
  const allowed = await canAccessBooking(auth, exists.booking.id_user);
  if (!allowed) return res.status(403).json({ error: "No autorizado." });

  const items = await prisma.serviceDestination.findMany({
    where: { service_id: id },
    orderBy: { added_at: "asc" }, // si luego agregamos `position`, cambiamos aquí
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
    serviceId: id,
    count: items.length,
    items: items.map((x) => ({
      destinationId: x.destination_id,
      name: x.destination.name,
      slug: x.destination.slug,
      country: x.destination.country,
      added_at: x.added_at,
    })),
  });
}
