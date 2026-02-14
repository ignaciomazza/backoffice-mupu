// src/pages/api/clients/[id].ts
import { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { isMissingColumnError } from "@/lib/prismaErrors";
import { jwtVerify } from "jose";
import type { JWTPayload } from "jose";
import {
  DEFAULT_CLIENT_PROFILE_KEY,
  DOCUMENT_ANY_KEY,
  normalizeClientProfiles,
  resolveClientProfile,
  DOC_REQUIRED_FIELDS,
} from "@/utils/clientConfig";
import {
  buildClientDuplicateResponse,
  findClientDuplicate,
} from "@/utils/clientDuplicate";

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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

const userSelectSafe = {
  id_user: true,
  first_name: true,
  last_name: true,
  role: true,
  id_agency: true,
  email: true,
} as const;

const duplicateSelectSafe = {
  id_client: true,
  agency_client_id: true,
  first_name: true,
  last_name: true,
  birth_date: true,
  dni_number: true,
  passport_number: true,
  tax_id: true,
} as const;

const clientSelectSafe = {
  id_client: true,
  agency_client_id: true,
  profile_key: true,
  first_name: true,
  last_name: true,
  phone: true,
  address: true,
  postal_code: true,
  locality: true,
  company_name: true,
  tax_id: true,
  commercial_address: true,
  dni_number: true,
  passport_number: true,
  birth_date: true,
  nationality: true,
  gender: true,
  category_id: true,
  email: true,
  custom_fields: true,
  registration_date: true,
  id_agency: true,
  id_user: true,
  user: { select: userSelectSafe },
} as const satisfies Prisma.ClientSelect;

const clientLegacySelectSafe = {
  id_client: true,
  agency_client_id: true,
  first_name: true,
  last_name: true,
  phone: true,
  address: true,
  postal_code: true,
  locality: true,
  company_name: true,
  tax_id: true,
  commercial_address: true,
  dni_number: true,
  passport_number: true,
  birth_date: true,
  nationality: true,
  gender: true,
  category_id: true,
  email: true,
  custom_fields: true,
  registration_date: true,
  id_agency: true,
  id_user: true,
  user: { select: userSelectSafe },
} as const satisfies Prisma.ClientSelect;

type ClientLegacyRowSafe = Prisma.ClientGetPayload<{
  select: typeof clientLegacySelectSafe;
}>;
type ClientRowCompat = ClientLegacyRowSafe & { profile_key?: string | null };

function withDefaultProfileKey<T extends Record<string, unknown>>(row: T) {
  return {
    ...row,
    profile_key:
      typeof row.profile_key === "string" && row.profile_key.trim()
        ? row.profile_key
        : DEFAULT_CLIENT_PROFILE_KEY,
  };
}

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
    return res.status(400).json({ error: "N° de pax inválido" });
  }

  // GET /api/clients/:id
  if (req.method === "GET") {
    try {
      let client: ClientRowCompat | null = null;
      try {
        client = await prisma.client.findUnique({
          where: { id_client: clientId },
          select: clientSelectSafe,
        });
      } catch (error) {
        if (!isMissingColumnError(error, "Client.profile_key")) {
          throw error;
        }
        const legacyClient = await prisma.client.findUnique({
          where: { id_client: clientId },
          select: clientLegacySelectSafe,
        });
        client = legacyClient
          ? withDefaultProfileKey(legacyClient)
          : null;
      }

      if (!client)
        return res.status(404).json({ error: "Pax no encontrado" });
      if (client.id_agency !== auth.id_agency) {
        return res
          .status(403)
          .json({ error: "No autorizado para este pax" });
      }
      const canAccess = await canAccessClient(auth, client.id_user);
      if (!canAccess) {
        return res
          .status(403)
          .json({ error: "No autorizado para este pax" });
      }

      return res.status(200).json(client);
    } catch (e) {
      if (
        isMissingColumnError(e, "Client.profile_key") ||
        isMissingColumnError(e, "ClientConfig.profiles")
      ) {
        return res.status(500).json({
          error:
            "Falta la migración de Tipos de Pax en base de datos. Ejecutá `npx prisma migrate deploy`.",
        });
      }
      console.error("[clients/:id][GET]", e);
      return res.status(500).json({ error: "Error fetching client" });
    }
  }

  // PUT /api/clients/:id
  if (req.method === "PUT") {
    try {
      let existing:
        | {
            id_client: number;
            id_agency: number;
            id_user: number;
            profile_key?: string | null;
            custom_fields: Prisma.JsonValue | null;
          }
        | null = null;
      try {
        existing = await prisma.client.findUnique({
          where: { id_client: clientId },
          select: {
            id_client: true,
            id_agency: true,
            id_user: true,
            profile_key: true,
            custom_fields: true,
          },
        });
      } catch (error) {
        if (!isMissingColumnError(error, "Client.profile_key")) {
          throw error;
        }
        existing = await prisma.client.findUnique({
          where: { id_client: clientId },
          select: {
            id_client: true,
            id_agency: true,
            id_user: true,
            custom_fields: true,
          },
        });
      }
      if (!existing) {
        return res.status(404).json({ error: "Pax no encontrado" });
      }
      if (existing.id_agency !== auth.id_agency) {
        return res
          .status(403)
          .json({ error: "No autorizado para este pax" });
      }
      const canAccess = await canAccessClient(auth, existing.id_user);
      if (!canAccess) {
        return res
          .status(403)
          .json({ error: "No autorizado para este pax" });
      }

      const c = req.body ?? {};

      let config:
        | {
            required_fields: Prisma.JsonValue | null;
            hidden_fields: Prisma.JsonValue | null;
            custom_fields: Prisma.JsonValue | null;
            profiles?: Prisma.JsonValue | null;
          }
        | null = null;
      try {
        config = await prisma.clientConfig.findFirst({
          where: { id_agency: auth.id_agency },
          select: {
            required_fields: true,
            hidden_fields: true,
            custom_fields: true,
            profiles: true,
          },
        });
      } catch (error) {
        if (!isMissingColumnError(error, "ClientConfig.profiles")) {
          throw error;
        }
        config = await prisma.clientConfig.findFirst({
          where: { id_agency: auth.id_agency },
          select: {
            required_fields: true,
            hidden_fields: true,
            custom_fields: true,
          },
        });
      }
      const profiles = normalizeClientProfiles(config?.profiles, {
        required_fields: config?.required_fields,
        hidden_fields: config?.hidden_fields,
        custom_fields: config?.custom_fields,
      });
      const requestedProfileKey = String(c.profile_key ?? "")
        .trim()
        .toLowerCase();
      if (requestedProfileKey && !profiles.some((p) => p.key === requestedProfileKey)) {
        return res.status(400).json({ error: "Tipo de pax inválido." });
      }
      const selectedProfile = resolveClientProfile(
        profiles,
        requestedProfileKey || existing.profile_key || DEFAULT_CLIENT_PROFILE_KEY,
      );
      const requiredFields = selectedProfile.required_fields;
      const customFields = selectedProfile.custom_fields;
      const requiredCustomKeys = customFields
        .filter((f) => f.required)
        .map((f) => f.key);

      const isFilled = (val: unknown) =>
        String(val ?? "")
          .trim()
          .length > 0;

      // Validaciones requeridas
      for (const f of requiredFields) {
        if (f === DOCUMENT_ANY_KEY) continue;
        if (!isFilled((c as Record<string, unknown>)[f])) {
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

      const docRequired =
        requiredFields.includes(DOCUMENT_ANY_KEY) ||
        requiredFields.some((field) => DOC_REQUIRED_FIELDS.includes(field));
      if (docRequired && !dni && !pass && !taxId) {
        return res.status(400).json({
          error:
            "El DNI, el Pasaporte o el CUIT/RUT son obligatorios. Debes cargar al menos uno",
        });
      }

      const birthRaw = String(c.birth_date ?? "").trim();
      const birth = birthRaw ? toLocalDate(birthRaw) : undefined;
      if (birthRaw && !birth) {
        return res.status(400).json({ error: "Fecha de nacimiento inválida" });
      }
      if (requiredFields.includes("birth_date") && !birth) {
        return res
          .status(400)
          .json({ error: "El campo birth_date es obligatorio." });
      }

      const hasCategory = Object.prototype.hasOwnProperty.call(
        c as Record<string, unknown>,
        "category_id",
      );
      let nextCategoryId: number | null | undefined = undefined;
      if (hasCategory) {
        const rawCategory = (c as Record<string, unknown>).category_id;
        if (rawCategory == null || rawCategory === "") {
          nextCategoryId = null;
        } else {
          const parsed = Number(rawCategory);
          if (!Number.isFinite(parsed) || parsed <= 0) {
            return res.status(400).json({ error: "category_id inválido." });
          }
          const exists = await prisma.passengerCategory.findFirst({
            where: { id_category: parsed, id_agency: auth.id_agency },
            select: { id_category: true },
          });
          if (!exists) {
            return res
              .status(400)
              .json({ error: "Categoría inválida para tu agencia." });
          }
          nextCategoryId = Math.floor(parsed);
        }
      }

      const hasCustomPayload = isRecord(c.custom_fields);
      const customPayload = hasCustomPayload
        ? (c.custom_fields as Record<string, unknown>)
        : {};
      const allowedCustomKeys = new Set(customFields.map((f) => f.key));
      const sanitizedCustom = Object.fromEntries(
        Object.entries(customPayload)
          .filter(([key]) => allowedCustomKeys.has(key))
          .map(([key, value]) => [key, String(value ?? "").trim()])
          .filter(([, value]) => value.length > 0),
      );
      const existingCustom = isRecord(existing.custom_fields)
        ? (existing.custom_fields as Record<string, unknown>)
        : {};
      const filteredExistingCustom = Object.fromEntries(
        Object.entries(existingCustom)
          .filter(([key]) => allowedCustomKeys.has(key))
          .map(([key, value]) => [key, String(value ?? "").trim()])
          .filter(([, value]) => value.length > 0),
      );
      const mergedCustom = hasCustomPayload
        ? { ...filteredExistingCustom, ...sanitizedCustom }
        : filteredExistingCustom;
      const hasProfileChange =
        selectedProfile.key !==
        (existing.profile_key || DEFAULT_CLIENT_PROFILE_KEY);

      for (const key of requiredCustomKeys) {
        if (!isFilled((mergedCustom as Record<string, unknown>)[key])) {
          return res.status(400).json({
            error: `El campo personalizado ${key} es obligatorio.`,
          });
        }
      }

      // Si quieren reasignar el pax a otro usuario, controlar permisos
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
              .json({ error: "No autorizado para reasignar pasajeros." });
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

      // Chequeo de duplicados (en la misma agencia), excluyendo este pax
      const duplicateCandidates = await prisma.client.findMany({
        where: {
          id_client: { not: clientId },
          id_agency: auth.id_agency,
        },
        select: duplicateSelectSafe,
        orderBy: { id_client: "desc" },
      });
      const duplicate = findClientDuplicate(duplicateCandidates, {
        first_name,
        last_name,
        birth_date: birth ?? null,
        dni_number: dni,
        passport_number: pass,
        tax_id: taxId,
      });
      if (duplicate) {
        return res.status(409).json(buildClientDuplicateResponse(duplicate));
      }

      const updateDataBase = {
        first_name,
        last_name,
        phone: String(c.phone ?? "").trim(),
        address: c.address || null,
        postal_code: c.postal_code || null,
        locality: c.locality || null,
        company_name: c.company_name || null,
        tax_id: taxId,
        commercial_address: c.commercial_address || null,
        dni_number: dni,
        passport_number: pass,
        birth_date: birth as Date,
        nationality: String(c.nationality ?? "").trim(),
        gender: String(c.gender ?? "").trim(),
        email: (String(c.email ?? "").trim() || null) as string | null,
        id_user: newOwnerId,
        ...(hasCategory ? { category_id: nextCategoryId ?? null } : {}),
        ...(hasCustomPayload || hasProfileChange
          ? {
              custom_fields:
                Object.keys(mergedCustom).length > 0 ? mergedCustom : Prisma.DbNull,
            }
          : {}),
      };

      let updated: ClientRowCompat;
      try {
        updated = await prisma.client.update({
          where: { id_client: clientId },
          data: {
            ...updateDataBase,
            profile_key: selectedProfile.key,
          },
          select: clientSelectSafe,
        });
      } catch (error) {
        if (!isMissingColumnError(error, "Client.profile_key")) {
          throw error;
        }
        updated = await prisma.client.update({
          where: { id_client: clientId },
          data: updateDataBase,
          select: clientLegacySelectSafe,
        });
        updated = withDefaultProfileKey(updated);
      }

      return res.status(200).json(updated);
    } catch (e: unknown) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const targetRaw = (
          e.meta as { target?: string[] | string } | undefined
        )?.target;
        const target = Array.isArray(targetRaw)
          ? targetRaw.join(",")
          : String(targetRaw ?? "");
        if (target.includes("agency_client_id")) {
          return res.status(409).json({
            error:
              "No se pudo guardar el pax por un conflicto con el numero interno. Reintenta.",
            code: "CLIENT_NUMBER_CONFLICT",
          });
        }
        return res.status(409).json({
          error: "No se pudo guardar el pax por un dato unico duplicado.",
          code: "CLIENT_UNIQUE_CONFLICT",
        });
      }
      if (
        isMissingColumnError(e, "Client.profile_key") ||
        isMissingColumnError(e, "ClientConfig.profiles")
      ) {
        return res.status(500).json({
          error:
            "Falta la migración de Tipos de Pax en base de datos. Ejecutá `npx prisma migrate deploy`.",
        });
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
        return res.status(404).json({ error: "Pax no encontrado" });
      }
      if (client.id_agency !== auth.id_agency) {
        return res
          .status(403)
          .json({ error: "No autorizado para este pax" });
      }
      const canAccess = await canAccessClient(auth, client.id_user);
      if (!canAccess) {
        return res
          .status(403)
          .json({ error: "No autorizado para este pax" });
      }
      if (
        client.bookings.length > 0 ||
        client.titular_bookings.length > 0 ||
        client.invoices.length > 0
      ) {
        return res.status(409).json({
          error: "No se puede eliminar: el pax tiene movimientos.",
        });
      }

      await prisma.client.delete({ where: { id_client: clientId } });
      return res.status(200).json({ message: "Pax eliminado con éxito" });
    } catch (e) {
      console.error("[clients/:id][DELETE]", e);
      return res.status(500).json({ error: "Error deleting client" });
    }
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
