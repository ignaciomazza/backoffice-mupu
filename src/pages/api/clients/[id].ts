// src/pages/api/clients/[id].ts
import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify } from "jose";
import type { JWTPayload } from "jose";

// ==== Tipos auxiliares ====
type TokenPayload = JWTPayload & {
  id_user?: number;
  userId?: number;
  uid?: number;
  id_agency?: number;
  agencyId?: number;
  aid?: number;
  role?: string;
  email?: string;
};

type DecodedAuth = {
  id_user: number;
  id_agency: number;
  role: string; // en minúscula
  email?: string;
};

// ==== JWT Secret (mismo criterio que en /api/clients/index.ts) ====
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

// ==== Helpers comunes ====
function getTokenFromRequest(req: NextApiRequest): string | null {
  // 1) Cookie "token" (más confiable tras proxies)
  if (req.cookies?.token) return req.cookies.token;

  // 2) Authorization: Bearer
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);

  // 3) Otros nombres posibles de cookie
  const c = req.cookies || {};
  for (const k of [
    "session",
    "auth_token",
    "access_token",
    "next-auth.session-token",
  ]) {
    const v = c[k];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

async function getUserFromAuth(
  req: NextApiRequest,
): Promise<DecodedAuth | null> {
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
    const role = String(p.role || "").toLowerCase();
    const email = p.email;

    // Completar agencia si falta
    if (id_user && !id_agency) {
      const u = await prisma.user.findUnique({
        where: { id_user },
        select: { id_agency: true, role: true, email: true },
      });
      if (u) {
        return {
          id_user,
          id_agency: u.id_agency,
          role: role || u.role.toLowerCase(),
          email: email ?? u.email ?? undefined,
        };
      }
    }

    // Buscar por email si falta id_user
    if (!id_user && email) {
      const u = await prisma.user.findUnique({
        where: { email },
        select: { id_user: true, id_agency: true, role: true },
      });
      if (u) {
        return {
          id_user: u.id_user,
          id_agency: u.id_agency,
          role: u.role.toLowerCase(),
          email,
        };
      }
    }

    if (!id_user || !id_agency) return null;

    return { id_user, id_agency, role, email: email ?? undefined };
  } catch {
    return null;
  }
}

function toLocalDate(v?: string) {
  if (!v) return undefined;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m)
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

const userSelectSafe = {
  id_user: true,
  first_name: true,
  last_name: true,
  role: true,
  id_agency: true,
  email: true,
} as const;

type VisibilityMode = "all" | "team" | "own";

function normalizeVisibilityMode(v: unknown): VisibilityMode {
  return v === "team" || v === "own" || v === "all" ? v : "all";
}

async function getVisibilityMode(authAgencyId: number): Promise<VisibilityMode> {
  const cfg = await prisma.clientConfig.findFirst({
    where: { id_agency: authAgencyId },
    select: { visibility_mode: true },
  });
  return normalizeVisibilityMode(cfg?.visibility_mode);
}

async function getTeamScope(authUserId: number, authAgencyId: number) {
  const teams = await prisma.salesTeam.findMany({
    where: {
      id_agency: authAgencyId,
      user_teams: { some: { id_user: authUserId } },
    },
    include: { user_teams: { select: { id_user: true } } },
  });
  const userIds = new Set<number>([authUserId]);
  teams.forEach((t) => t.user_teams.forEach((ut) => userIds.add(ut.id_user)));
  return { userIds: Array.from(userIds) };
}

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

async function canAccessClient(
  auth: DecodedAuth,
  clientOwnerId: number,
): Promise<boolean> {
  const roleNorm = (auth.role || "").toLowerCase();
  if (["gerente", "desarrollador"].includes(roleNorm)) return true;
  if (roleNorm === "lider") {
    const scope = await getLeaderScope(auth.id_user, auth.id_agency);
    return scope.userIds.includes(clientOwnerId);
  }
  if (roleNorm !== "vendedor") return true;

  const mode = await getVisibilityMode(auth.id_agency);
  if (mode === "all") return true;
  if (mode === "own") return clientOwnerId === auth.id_user;

  const scope = await getTeamScope(auth.id_user, auth.id_agency);
  return scope.userIds.includes(clientOwnerId);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const auth = await getUserFromAuth(req);
  if (!auth?.id_user || !auth.id_agency) {
    return res.status(401).json({ error: "No autenticado o token inválido." });
  }

  const clientIdRaw = Array.isArray(req.query.id)
    ? req.query.id[0]
    : req.query.id;
  const clientId = Number(clientIdRaw);
  if (!Number.isFinite(clientId)) {
    return res.status(400).json({ error: "N° de cliente inválido" });
  }

  // GET /api/clients/:id
  if (req.method === "GET") {
    try {
      const client = await prisma.client.findUnique({
        where: { id_client: clientId },
        include: { user: { select: userSelectSafe } },
      });

      if (!client)
        return res.status(404).json({ error: "Cliente no encontrado" });
      if (client.id_agency !== auth.id_agency) {
        return res
          .status(403)
          .json({ error: "No autorizado para este cliente" });
      }
      const canAccess = await canAccessClient(auth, client.id_user);
      if (!canAccess) {
        return res
          .status(403)
          .json({ error: "No autorizado para este cliente" });
      }

      return res.status(200).json(client);
    } catch (e) {
      console.error("[clients/:id][GET]", e);
      return res.status(500).json({ error: "Error fetching client" });
    }
  }

  // PUT /api/clients/:id
  if (req.method === "PUT") {
    try {
      const existing = await prisma.client.findUnique({
        where: { id_client: clientId },
        select: { id_client: true, id_agency: true, id_user: true },
      });
      if (!existing) {
        return res.status(404).json({ error: "Cliente no encontrado" });
      }
      if (existing.id_agency !== auth.id_agency) {
        return res
          .status(403)
          .json({ error: "No autorizado para este cliente" });
      }
      const canAccess = await canAccessClient(auth, existing.id_user);
      if (!canAccess) {
        return res
          .status(403)
          .json({ error: "No autorizado para este cliente" });
      }

      const c = req.body ?? {};
      // Validaciones requeridas
      for (const f of [
        "first_name",
        "last_name",
        "phone",
        "birth_date",
        "nationality",
        "gender",
      ]) {
        if (!c[f]) {
          return res
            .status(400)
            .json({ error: `El campo ${f} es obligatorio.` });
        }
      }

      const first_name = String(c.first_name ?? "").trim();
      const last_name = String(c.last_name ?? "").trim();
      const dni = (String(c.dni_number ?? "").trim() || null) as string | null;
      const pass = (String(c.passport_number ?? "").trim() || null) as
        | string
        | null;
      const taxId = (String(c.tax_id ?? "").trim() || null) as string | null;

      if (!dni && !pass) {
        return res.status(400).json({
          error:
            "El DNI y el Pasaporte son obligatorios. Debes cargar al menos uno",
        });
      }

      const birth = toLocalDate(String(c.birth_date ?? ""));
      if (!birth) {
        return res.status(400).json({ error: "Fecha de nacimiento inválida" });
      }

      // Si quieren reasignar el cliente a otro usuario, controlar permisos
      let newOwnerId: number = existing.id_user;
      if (c.id_user != null) {
        const candidate = Number(c.id_user);
        if (!Number.isFinite(candidate)) {
          return res.status(400).json({ error: "id_user inválido" });
        }
        if (candidate !== existing.id_user) {
          const role = (auth.role || "").toLowerCase();
          const canAssignOthers = [
            "gerente",
            "administrativo",
            "desarrollador",
            "lider",
          ].includes(role);

          if (!canAssignOthers) {
            return res
              .status(403)
              .json({ error: "No autorizado para reasignar clientes." });
          }

          if (role === "lider") {
            // Validar que el nuevo usuario pertenezca a un equipo liderado por auth.id_user
            const teams = await prisma.salesTeam.findMany({
              where: { id_agency: auth.id_agency },
              include: {
                user_teams: {
                  select: { id_user: true, user: { select: { role: true } } },
                },
              },
            });
            const myTeams = teams.filter((t) =>
              t.user_teams.some(
                (ut) => ut.id_user === auth.id_user && ut.user.role === "lider",
              ),
            );
            const allowedIds = new Set<number>();
            myTeams.forEach((t) =>
              t.user_teams.forEach((ut) => allowedIds.add(ut.id_user)),
            );
            if (!allowedIds.has(candidate)) {
              return res.status(403).json({
                error:
                  "No autorizado: el usuario asignado no pertenece a tus equipos.",
              });
            }
          }

          newOwnerId = candidate;
        }
      }

      // Chequeo de duplicados (en la misma agencia), excluyendo este cliente
      const duplicate = await prisma.client.findFirst({
        where: {
          id_client: { not: clientId },
          id_agency: auth.id_agency,
          OR: [
            ...(dni ? [{ dni_number: dni }] : []),
            ...(pass ? [{ passport_number: pass }] : []),
            ...(taxId ? [{ tax_id: taxId }] : []),
            {
              first_name,
              last_name,
              birth_date: birth,
            },
          ],
        },
        select: { id_client: true },
      });
      if (duplicate) {
        return res
          .status(409)
          .json({ error: "Esa información ya pertenece a un cliente." });
      }

      const updated = await prisma.client.update({
        where: { id_client: clientId },
        data: {
          first_name,
          last_name,
          phone: c.phone,
          address: c.address || null,
          postal_code: c.postal_code || null,
          locality: c.locality || null,
          company_name: c.company_name || null,
          tax_id: taxId,
          commercial_address: c.commercial_address || null,
          dni_number: dni,
          passport_number: pass,
          birth_date: birth,
          nationality: c.nationality,
          gender: c.gender,
          email: (String(c.email ?? "").trim() || null) as string | null,
          id_user: newOwnerId,
        },
        include: { user: { select: userSelectSafe } },
      });

      return res.status(200).json(updated);
    } catch (e: unknown) {
      if (typeof e === "object" && e !== null && "code" in e) {
        const err = e as { code?: string };
        if (err.code === "P2002") {
          return res.status(409).json({ error: "Datos duplicados detectados" });
        }
      }
      console.error("[clients/:id][PUT]", e);
      return res.status(500).json({ error: "Error updating client" });
    }
  }

  // DELETE /api/clients/:id
  if (req.method === "DELETE") {
    try {
      const client = await prisma.client.findUnique({
        where: { id_client: clientId },
        select: {
          id_client: true,
          id_agency: true,
          id_user: true,
          bookings: { select: { id_booking: true }, take: 1 },
          titular_bookings: { select: { id_booking: true }, take: 1 },
          invoices: { select: { id_invoice: true }, take: 1 },
        },
      });
      if (!client) {
        return res.status(404).json({ error: "Cliente no encontrado" });
      }
      if (client.id_agency !== auth.id_agency) {
        return res
          .status(403)
          .json({ error: "No autorizado para este cliente" });
      }
      const canAccess = await canAccessClient(auth, client.id_user);
      if (!canAccess) {
        return res
          .status(403)
          .json({ error: "No autorizado para este cliente" });
      }
      if (
        client.bookings.length > 0 ||
        client.titular_bookings.length > 0 ||
        client.invoices.length > 0
      ) {
        return res.status(409).json({
          error: "No se puede eliminar: el cliente tiene movimientos.",
        });
      }

      await prisma.client.delete({ where: { id_client: clientId } });
      return res.status(200).json({ message: "Cliente eliminado con éxito" });
    } catch (e) {
      console.error("[clients/:id][DELETE]", e);
      return res.status(500).json({ error: "Error deleting client" });
    }
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
