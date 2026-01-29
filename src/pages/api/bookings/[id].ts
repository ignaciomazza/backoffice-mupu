// src/pages/api/bookings/[id].ts
import { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { decodePublicId, encodePublicId } from "@/lib/publicIds";
import { jwtVerify } from "jose";
import type { JWTPayload } from "jose";
import { getBookingComponentGrants } from "@/lib/accessControl";
import { canAccessBookingComponent } from "@/utils/permissions";

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
  // 1) cookie "token"
  if (req.cookies?.token) return req.cookies.token;

  // 2) Authorization: Bearer
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);

  // 3) otros posibles nombres de cookie
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

async function isSimpleCompanionsEnabled(id_agency: number) {
  const cfg = await prisma.clientConfig.findUnique({
    where: { id_agency },
    select: { use_simple_companions: true },
  });
  return Boolean(cfg?.use_simple_companions);
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

function normalizeSaleTotals(
  input: unknown,
): Record<string, number> | null {
  if (input == null) return null;
  if (typeof input !== "object" || Array.isArray(input)) return null;
  const obj = input as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [keyRaw, val] of Object.entries(obj)) {
    const key = String(keyRaw || "").toUpperCase().trim();
    if (!key) continue;
    const n =
      typeof val === "number"
        ? val
        : Number(String(val).replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return null;
    out[key] = n;
  }
  return out;
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
  const rawId = String(id);
  const bookingId = Number(rawId);
  const decoded =
    Number.isFinite(bookingId) && bookingId > 0
      ? null
      : decodePublicId(rawId);
  if (decoded && decoded.t !== "booking") {
    return res.status(400).json({ error: "N° de reserva inválido." });
  }

  // auth
  const auth = await getUserFromAuth(req);
  const roleFromCookie = (req.cookies?.role || "").toLowerCase();
  const role = (auth?.role || roleFromCookie || "").toLowerCase();
  const authUserId = auth?.id_user;
  const authAgencyId = auth?.id_agency;

  if (!authUserId || !authAgencyId) {
    return res.status(401).json({ error: "No autenticado" });
  }

  // Traer la reserva para validar alcance/agencia
  if (decoded && decoded.a !== authAgencyId) {
    return res.status(404).json({ error: "Reserva no encontrada." });
  }

  const existing = await prisma.booking.findFirst({
    where: decoded
      ? { id_agency: authAgencyId, agency_booking_id: decoded.i }
      : { id_booking: bookingId },
    include: {
      user: true,
      simple_companions: { select: { id_companion: true } },
    },
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
        where: { id_booking: existing.id_booking },
        include: {
          titular: true,
          user: true,
          agency: true,
          clients: true,
          simple_companions: { include: { category: true } },
          services: { include: { operator: true } },
          invoices: true,
          Receipt: true,
        },
      });
      const public_id =
        booking?.agency_booking_id != null
          ? encodePublicId({
              t: "booking",
              a: booking.id_agency,
              i: booking.agency_booking_id,
            })
          : null;
      return res.status(200).json(
        booking
          ? {
              ...booking,
              public_id,
            }
          : booking,
      );
    } catch (error) {
      console.error(
        "[bookings][GET by id] Error:",
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
      sale_totals,
      // pax_count (se recalcula abajo, no se usa del body)
      clients_ids,
      simple_companions,
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
      !titular_id ||
      !departure_date ||
      !return_date
    ) {
      return res.status(400).json({
        error: "Todos los campos obligatorios deben ser completados.",
      });
    }

    let normalizedSaleTotals:
      | Record<string, number>
      | null
      | undefined = undefined;
    if (sale_totals !== undefined) {
      if (sale_totals === null) {
        normalizedSaleTotals = null;
      } else {
        const normalized = normalizeSaleTotals(sale_totals);
        if (normalized == null) {
          return res.status(400).json({
            error: "sale_totals inválido (espera objeto {MONEDA: monto})",
          });
        }
        normalizedSaleTotals = normalized;
      }
    }
    const saleTotalsValue =
      normalizedSaleTotals === null ? Prisma.DbNull : normalizedSaleTotals;

    const bookingGrants = await getBookingComponentGrants(
      authAgencyId,
      authUserId,
    );
    const canEditStatus = canAccessBookingComponent(
      role,
      bookingGrants,
      "booking_status",
    );
    const nextStatus = String(status ?? "").trim();
    const currentStatus = String(existing.status ?? "").trim();
    if (!canEditStatus && nextStatus !== currentStatus) {
      return res
        .status(403)
        .json({ error: "Sin permisos para modificar el estado." });
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
      // ===== Acompañantes: sanitizar placeholders, evitar duplicados y conflicto con titular
      const companions: number[] = Array.isArray(clients_ids)
        ? clients_ids.map(Number).filter((id) => Number.isFinite(id) && id > 0)
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

      // Verificar existencia de todos los IDs en la misma agencia
      const allClientIds = [Number(titular_id), ...companions];
      const existingClients = await prisma.client.findMany({
        where: { id_client: { in: allClientIds }, id_agency: authAgencyId },
        select: { id_client: true },
      });
      const okIds = new Set(existingClients.map((c) => c.id_client));
      const missingIds = allClientIds.filter((id: number) => !okIds.has(id));
      if (missingIds.length > 0) {
        return res
          .status(400)
          .json({ error: `IDs no válidos: ${missingIds.join(", ")}` });
      }

      const allowSimpleCompanions = await isSimpleCompanionsEnabled(authAgencyId);
      const shouldUpdateSimpleCompanions =
        allowSimpleCompanions && simple_companions !== undefined;
      const currentSimpleCount = Array.isArray(existing.simple_companions)
        ? existing.simple_companions.length
        : 0;

      const simpleCompanionsRaw = shouldUpdateSimpleCompanions
        ? Array.isArray(simple_companions)
          ? simple_companions
          : []
        : [];
      const simpleCompanions = simpleCompanionsRaw
        .map((c) => {
          if (!c || typeof c !== "object") return null;
          const rec = c as Record<string, unknown>;
          const category_id =
            rec.category_id == null ? null : Number(rec.category_id);
          const age = rec.age == null ? null : Number(rec.age);
          const notes =
            typeof rec.notes === "string" && rec.notes.trim()
              ? rec.notes.trim()
              : null;
          const safeCategory =
            category_id != null && Number.isFinite(category_id) && category_id > 0
              ? Math.floor(category_id)
              : null;
          const safeAge =
            age != null && Number.isFinite(age) && age >= 0
              ? Math.floor(age)
              : null;
          if (safeCategory == null && safeAge == null && !notes) return null;
          return {
            category_id: safeCategory,
            age: safeAge,
            notes,
          };
        })
        .filter(Boolean) as Array<{
        category_id: number | null;
        age: number | null;
        notes: string | null;
      }>;

      if (shouldUpdateSimpleCompanions && simpleCompanions.length > 0) {
        const categoryIds = Array.from(
          new Set(
            simpleCompanions
              .map((c) => c.category_id)
              .filter((id): id is number => typeof id === "number"),
          ),
        );
        if (categoryIds.length > 0) {
          const cats = await prisma.passengerCategory.findMany({
            where: { id_category: { in: categoryIds }, id_agency: authAgencyId },
            select: { id_category: true },
          });
          const ok = new Set(cats.map((c) => c.id_category));
          const bad = categoryIds.filter((id) => !ok.has(id));
          if (bad.length) {
            return res.status(400).json({
              error: `Hay categorías inválidas para tu agencia: ${bad.join(", ")}`,
            });
          }
        }
      }

      // Fechas viaje
      const parsedDeparture = toLocalDate(departure_date);
      const parsedReturn = toLocalDate(return_date);
      if (!parsedDeparture || !parsedReturn) {
        return res.status(400).json({ error: "Fechas inválidas." });
      }

      // ===== Reasignación de creador
      const canAssignOthers = [
        "gerente",
        "administrativo",
        "desarrollador",
        "lider",
      ].includes(role);

      let usedUserId: number = existing.id_user; // default: mantener

      if (typeof id_user === "number" && Number.isFinite(id_user)) {
        if (canAssignOthers) {
          if (role === "lider" && id_user !== authUserId) {
            const scope = await getLeaderScope(authUserId, authAgencyId);
            if (!scope.userIds.includes(id_user)) {
              return res
                .status(403)
                .json({ error: "No podés asignar fuera de tu equipo." });
            }
          }
          // asegurar que el usuario pertenece a la misma agencia
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
        } else {
          // Sin permiso: si es igual al actual lo ignoramos; si es distinto => está intentando reasignar
          if (id_user !== existing.id_user) {
            return res
              .status(403)
              .json({ error: "No autorizado para reasignar usuario." });
          }
        }
      }
      // Si id_user viene vacío/undefined y no hay permiso, simplemente se mantiene el existente

      // ===== Edición de creation_date
      const canEditCreationDate = [
        "gerente",
        "administrativo",
        "desarrollador",
      ].includes(role);

      let parsedCreationDate: Date | undefined = undefined;
      if (creation_date != null && creation_date !== "") {
        if (canEditCreationDate) {
          parsedCreationDate = toLocalDate(creation_date);
          if (!parsedCreationDate) {
            return res.status(400).json({ error: "creation_date inválida." });
          }
        }
        // Si NO tiene permiso, ignoramos silenciosamente creation_date (no 403)
      }

      // pax_count consistente con acompañantes saneados + simples
      const nextSimpleCount = shouldUpdateSimpleCompanions
        ? simpleCompanions.length
        : currentSimpleCount;
      const nextPax = 1 + companions.length + nextSimpleCount;

      const booking = await prisma.$transaction(async (tx) => {
        if (shouldUpdateSimpleCompanions) {
          await tx.bookingCompanion.deleteMany({
            where: { booking_id: existing.id_booking },
          });
          if (simpleCompanions.length > 0) {
            await tx.bookingCompanion.createMany({
              data: simpleCompanions.map((c) => ({
                booking_id: existing.id_booking,
                category_id: c.category_id,
                age: c.age,
                notes: c.notes,
              })),
            });
          }
        }

        return tx.booking.update({
          where: { id_booking: existing.id_booking },
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
            pax_count: nextPax,
            ...(parsedCreationDate ? { creation_date: parsedCreationDate } : {}),
            ...(normalizedSaleTotals !== undefined
              ? { sale_totals: saleTotalsValue }
              : {}),
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
            simple_companions: { include: { category: true } },
          },
        });
      });

      return res.status(200).json(booking);
    } catch (error) {
      console.error(
        "[bookings][PUT by id] Error:",
        error instanceof Error ? error.message : error,
      );
      return res.status(500).json({ error: "Error actualizando la reserva." });
    }
  }

  if (req.method === "DELETE") {
    // Permisos:
    // - Admin/Gerencia/Dev: siempre pueden eliminar
    // - Líder: si la reserva pertenece a alguien dentro de su equipo
    // - Vendedor: sólo si la reserva es suya
    if (["gerente", "administrativo", "desarrollador"].includes(role)) {
      // ok
    } else if (role === "lider") {
      const scope = await getLeaderScope(authUserId, authAgencyId);
      if (!scope.userIds.includes(existing.id_user)) {
        return res.status(403).json({ error: "Fuera de tu equipo." });
      }
    } else if (role === "vendedor") {
      if (existing.id_user !== authUserId) {
        return res
          .status(403)
          .json({ error: "Sólo podés eliminar tus propias reservas." });
      }
    } else {
      return res.status(403).json({ error: "No autorizado para eliminar." });
    }

    try {
      await prisma.booking.delete({ where: { id_booking: existing.id_booking } });
      return res.status(200).json({ message: "Reserva eliminada con éxito." });
    } catch (error) {
      console.error(
        "[bookings][DELETE by id] Error:",
        error instanceof Error ? error.message : error,
      );
      return res.status(500).json({ error: "Error eliminando la reserva." });
    }
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
