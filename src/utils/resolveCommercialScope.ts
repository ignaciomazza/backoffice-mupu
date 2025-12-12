// src/utils/resolveCommercialScope.ts
import type { JWTPayload } from "jose";

export type TokenPayload = JWTPayload & {
  id_user?: number;
  userId?: number;
  uid?: number;

  id_agency?: number;
  agencyId?: number;
  aid?: number;

  role?: string;
  is_agency_owner?: boolean;
  is_team_leader?: boolean;
};

export type CommercialScopeMode = "own" | "team" | "all";

export interface CommercialScope {
  userId: number;
  agencyId?: number;
  mode: CommercialScopeMode;
}

function toNum(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function resolveCommercialScopeFromToken(
  payload: TokenPayload,
): CommercialScope {
  const userId = toNum(payload.id_user ?? payload.userId ?? payload.uid);
  if (!userId) {
    throw new Error(
      "Token sin id_user/userId/uid: no se puede resolver alcance",
    );
  }

  const agencyId = toNum(payload.id_agency ?? payload.agencyId ?? payload.aid);

  const rawRole = (payload.role ?? "").toString().toLowerCase().trim();
  const isOwner = Boolean(payload.is_agency_owner);

  const managerRoles = [
    "administrativo",
    "gerente",
    "marketing",
    "desarrollador",
  ];
  const isManagerRole = managerRoles.includes(rawRole);

  const isLeaderRole = rawRole === "lider";
  const isLeader = Boolean(payload.is_team_leader) || isLeaderRole;

  const isManager = isOwner || isManagerRole;

  let mode: CommercialScopeMode = "own";
  if (isManager) mode = "all";
  else if (isLeader) mode = "team";

  return { userId, agencyId, mode };
}
