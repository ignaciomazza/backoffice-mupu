// src/pages/api/bookings/[id].ts
import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify } from "jose";
import type { JWTPayload } from "jose";

/* ================== Tipos ================== */
type DecodedUser = {
  id_user?: number;
  role?: string;
  id_agency?: number;
  email?: string;
};

type TokenPayload = JWTPayload & {
  id_user?: number;
  userId?: number;
  uid?: number;
  role?: string;
  id_agency?: number;
  agencyId?: number;
  aid?: number;
  email?: string;
};

/* ================== Constantes ================== */
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

/* ================== Helpers comunes ================== */
function getTokenFromRequest(req: NextApiRequest): string | null {
  if (req.cookies?.token) return req.cookies.token;
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  const c = req.cookies || {};
  for (const k of [
    "session",
    "auth_token",
    "access_token",
    "next-auth.session-token",
  ]) {
    if (c[k]) return c[k]!;
  }
  return null;
}

async function getUserFromAuth(
  req: NextApiRequest,
): Promise<DecodedUser | null> {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return null;
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET),
    );
    const p = payload as TokenPayload;

    const id_user = Number(p.id_user ?? p.userId ?? p.uid) || undefined;
    const id_agency = Number(p.id_agency ?? p.agencyId ?? p.aid) || undefined;
    const role = (p.role || "") as string | undefined;
    const email = p.email;

    // Completar por email si falta id_user
    if (!id_user && email) {
      const u = await prisma.user.findUnique({
        where: { email },
        select: { id_user: true, id_agency: true, role: true, email: true },
      });
      if (u)
        return {
          id_user: u.id_user,
          id_agency: u.id_agency,
          role: u.role,
          email: u.email,
        };
    }

    // Completar agencia si falta
    if (id_user && !id_agency) {
      const u = await prisma.user.findUnique({
        where: { id_user },
        select: { id_agency: true, role: true, email: true },
      });
      if (u)
        return {
          id_user,
          id_agency: u.id_agency,
          role: role ?? u.role,
          email: email ?? u.email ?? undefined,
        };
    }

    return { id_user, id_agency, role, email };
  } catch {
    return null;
  }
}

function toLocalDate(v: unknown): Date | undefined {
  if (typeof v !== "string" || !v) return undefined;
  const ymd = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd)
    return new Date(
      Number(ymd[1]),
      Number(ymd[2]) - 1,
      Number(ymd[3]),
      0,
      0,
      0,
      0,
    );
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

// equipos que lidera + ids de usuarios alcanzables
async function getLeaderScope(authUserId: number, authAgencyId?: number) {
  const teams = await prisma.salesTeam.findMany({
    where: {
      ...(authAgencyId ? { id_agency: authAgencyId } : {}),
      user_teams: { some: { user: { id_user: authUserId, role: "lider" } } },
    },
    include: { user_teams: { select: { id_user: true } } },
  });
  const teamIds = teams.map((t) => t.id_team);
  const userIds = new Set<number>([authUserId]);
  teams.forEach((t) => t.user_teams.forEach((ut) => userIds.add(ut.id_user)));
  return { teamIds, userIds: Array.from(userIds) };
}

/* ================== Handler ================== */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { id } = req.query;
  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: "N° de reserva inválido." });
  }
  const bookingId = Number(id);

  // auth
  const auth = await getUserFromAuth(req);
  const role = (auth?.role || "").toLowerCase();
  const authUserId = auth?.id_user;
  const authAgencyId = auth?.id_agency;

  if (!authUserId || !authAgencyId) {
    return res.status(401).json({ error: "No autenticado" });
  }

  // Traer la reserva para validar alcance/agencia
  const existing = await prisma.booking.findUnique({
    where: { id_booking: bookingId },
    include: { user: true },
  });
  if (!existing) {
    return res.status(404).json({ error: "Reserva no encontrada." });
  }
  if (existing.id_agency !== authAgencyId) {
    return res.status(403).json({ error: "No autorizado para esta agencia." });
  }

  // Reglas de lectura/alcance por rol
  if (req.method === "GET") {
    // vendedor: solo propias
    if (role === "vendedor" && existing.id_user !== authUserId) {
      return res.status(403).json({ error: "No autorizado." });
    }
    // líder: sólo reservas de su equipo
    if (role === "lider" && existing.id_user !== authUserId) {
      const scope = await getLeaderScope(authUserId, authAgencyId);
      if (!scope.userIds.includes(existing.id_user)) {
        return res.status(403).json({ error: "Fuera de tu equipo." });
      }
    }

    try {
      const booking = await prisma.booking.findUnique({
        where: { id_booking: bookingId },
        include: {
          titular: true,
          user: true,
          agency: true,
          clients: true,
          services: true,
          invoices: true,
          Receipt: true,
        },
      });
      return res.status(200).json(booking);
    } catch (error) {
      console.error(
        "Error al obtener la reserva:",
        error instanceof Error ? error.message : error,
      );
      return res.status(500).json({ error: "Error al obtener la reserva." });
    }
  }

  if (req.method === "PUT") {
    const {
      clientStatus,
      operatorStatus,
      status,
      details,
      invoice_type,
      invoice_observation,
      observation,
      titular_id,
      departure_date,
      return_date,
      pax_count,
      clients_ids,
      id_user, // opcional: reasignar creador
      creation_date, // opcional: setear fecha de creación
    } = req.body ?? {};

    // Validación mínima
    if (
      !clientStatus ||
      !operatorStatus ||
      !status ||
      !details ||
      !invoice_type ||
      !invoice_observation ||
      !titular_id ||
      !departure_date ||
      !return_date
    ) {
      return res.status(400).json({
        error: "Todos los campos obligatorios deben ser completados.",
      });
    }

    // vendedor: solo puede editar las propias
    if (role === "vendedor" && existing.id_user !== authUserId) {
      return res.status(403).json({ error: "No autorizado." });
    }

    // líder: solo su equipo
    if (role === "lider" && existing.id_user !== authUserId) {
      const scope = await getLeaderScope(authUserId, authAgencyId);
      if (!scope.userIds.includes(existing.id_user)) {
        return res.status(403).json({ error: "Fuera de tu equipo." });
      }
    }

    try {
      // Validaciones de acompañantes
      const companions: number[] = Array.isArray(clients_ids)
        ? clients_ids.map(Number)
        : [];
      if (companions.includes(Number(titular_id))) {
        return res.status(400).json({
          error: "El titular no puede estar en la lista de acompañantes.",
        });
      }
      const uniqueClients = new Set(companions);
      if (uniqueClients.size !== companions.length) {
        return res
          .status(400)
          .json({ error: "IDs duplicados en los acompañantes." });
      }

      // Verificar existencia de todos los IDs y datos del titular
      const allClientIds = [Number(titular_id), ...companions];
      const existingClients = await prisma.client.findMany({
        where: { id_client: { in: allClientIds }, id_agency: authAgencyId },
        select: {
          id_client: true,
          address: true,
          postal_code: true,
          locality: true,
        },
      });
      const okIds = new Set(existingClients.map((c) => c.id_client));
      const missingIds = allClientIds.filter((id: number) => !okIds.has(id));
      if (missingIds.length > 0) {
        return res
          .status(400)
          .json({ error: `IDs no válidos: ${missingIds.join(", ")}` });
      }
      const titularClient = existingClients.find(
        (c) => c.id_client === Number(titular_id),
      );
      if (
        !titularClient ||
        !titularClient.address ||
        !titularClient.postal_code ||
        !titularClient.locality
      ) {
        return res.status(400).json({
          error:
            "El cliente titular debe tener dirección, código postal y localidad.",
        });
      }

      // Fechas viaje
      const parsedDeparture = toLocalDate(departure_date);
      const parsedReturn = toLocalDate(return_date);
      if (!parsedDeparture || !parsedReturn) {
        return res.status(400).json({ error: "Fechas inválidas." });
      }

      // Permisos para reasignar creador
      const canAssignOthers = [
        "gerente",
        "administrativo",
        "desarrollador",
        "lider",
      ].includes(role);
      let usedUserId: number = existing.id_user; // default: mantener
      if (
        canAssignOthers &&
        typeof id_user === "number" &&
        Number.isFinite(id_user)
      ) {
        if (role === "lider" && id_user !== authUserId) {
          const scope = await getLeaderScope(authUserId, authAgencyId);
          if (!scope.userIds.includes(id_user)) {
            return res
              .status(403)
              .json({ error: "No podés asignar fuera de tu equipo." });
          }
        }
        // además, asegurar que el usuario pertenece a la misma agencia
        const targetUser = await prisma.user.findUnique({
          where: { id_user: Number(id_user) },
          select: { id_agency: true },
        });
        if (!targetUser || targetUser.id_agency !== authAgencyId) {
          return res
            .status(400)
            .json({ error: "Usuario asignado inválido para tu agencia." });
        }
        usedUserId = id_user;
      } else if (id_user != null && !canAssignOthers) {
        return res
          .status(403)
          .json({ error: "No autorizado para reasignar usuario." });
      }

      // Permisos para editar creation_date (NO líderes)
      const canEditCreationDate = [
        "gerente",
        "administrativo",
        "desarrollador",
      ].includes(role);
      let parsedCreationDate: Date | undefined = undefined;
      if (creation_date != null && creation_date !== "") {
        if (!canEditCreationDate) {
          return res.status(403).json({
            error:
              "No autorizado: solo administración/gerencia pueden editar la fecha de creación.",
          });
        }
        parsedCreationDate = toLocalDate(creation_date);
        if (!parsedCreationDate) {
          return res.status(400).json({ error: "creation_date inválida." });
        }
      }

      const booking = await prisma.booking.update({
        where: { id_booking: bookingId },
        data: {
          clientStatus,
          operatorStatus,
          status,
          details,
          invoice_type,
          invoice_observation,
          observation,
          departure_date: parsedDeparture,
          return_date: parsedReturn,
          pax_count: Number(pax_count ?? existing.pax_count ?? 1),
          ...(parsedCreationDate ? { creation_date: parsedCreationDate } : {}),
          titular: { connect: { id_client: Number(titular_id) } },
          user: { connect: { id_user: usedUserId } },
          // agency: NO se cambia por body; permanece la del token/existing
          clients: { set: companions.map((cid) => ({ id_client: cid })) },
        },
        include: {
          titular: true,
          user: true,
          agency: true,
          clients: true,
        },
      });

      return res.status(200).json(booking);
    } catch (error) {
      console.error(
        "Error actualizando la reserva:",
        error instanceof Error ? error.message : error,
      );
      return res.status(500).json({ error: "Error actualizando la reserva." });
    }
  }

  if (req.method === "DELETE") {
    // Solo administración/gerencia/desarrollo
    if (!["gerente", "administrativo", "desarrollador"].includes(role)) {
      return res.status(403).json({ error: "No autorizado para eliminar." });
    }
    try {
      await prisma.booking.delete({ where: { id_booking: bookingId } });
      return res.status(200).json({ message: "Reserva eliminada con éxito." });
    } catch (error) {
      console.error(
        "Error eliminando la reserva:",
        error instanceof Error ? error.message : error,
      );
      return res.status(500).json({ error: "Error eliminando la reserva." });
    }
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
