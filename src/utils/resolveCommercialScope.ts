// src/utils/resolveCommercialScope.ts
import type { JWTPayload } from "jose";

export type TokenPayload = JWTPayload & {
  id_user?: number;
  id_agency?: number;
  role?: string;
  is_agency_owner?: boolean;
  is_team_leader?: boolean;
  // Si en tu token viajan otros flags (is_manager, scopes, etc.) los podés agregar acá
};

export type CommercialScopeMode = "own" | "team" | "all";

export interface CommercialScope {
  userId: number;
  agencyId?: number;
  mode: CommercialScopeMode;
}

/**
 * A partir del payload del token resolvemos el "modo de vista" comercial:
 *
 * - own  → vendedor común (ve solo lo suyo)
 * - team → líder de equipo (lo suyo + equipo)
 * - all  → gerencia / marketing / dev / dueño (ve todo)
 *
 * OJO: ajustá las condiciones de rol/flags a cómo vos armás el token en tu backend.
 */
export function resolveCommercialScopeFromToken(
  payload: TokenPayload,
): CommercialScope {
  if (!payload.id_user) {
    throw new Error(
      "Token sin id_user: no se puede resolver el alcance comercial",
    );
  }

  const userId = payload.id_user;
  const agencyId = payload.id_agency;

  const rawRole = (payload.role ?? "").toString().toLowerCase().trim();
  const isOwner = Boolean(payload.is_agency_owner);

  // roles que ven TODO
  const managerRoles = [
    "administrativo",
    "gerente",
    "marketing",
    "desarrollador",
  ];
  const isManagerRole = managerRoles.includes(rawRole);

  // roles / flags que actúan como líder de equipo
  const isLeaderRole = rawRole === "lider";
  const isLeader = Boolean(payload.is_team_leader) || isLeaderRole;

  const isManager = isOwner || isManagerRole;

  let mode: CommercialScopeMode = "own";
  if (isManager) {
    mode = "all";
  } else if (isLeader) {
    mode = "team";
  }

  return {
    userId,
    agencyId,
    mode,
  };
}
