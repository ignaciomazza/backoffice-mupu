import type { NextApiRequest } from "next";
import { resolveAuth } from "@/lib/auth";
import { normalizeRole } from "@/utils/permissions";

const ADMIN_ROLES = new Set(["desarrollador", "gerente"]);
const AGENCY_ROLES = new Set(["desarrollador", "gerente", "administrativo"]);

export async function resolveBillingAuth(req: NextApiRequest) {
  const auth = await resolveAuth(req);
  if (!auth) return null;
  return {
    ...auth,
    role: normalizeRole(auth.role),
  };
}

export function isBillingAdminRole(role?: string | null): boolean {
  return ADMIN_ROLES.has(normalizeRole(role));
}

export function isAgencyBillingRole(role?: string | null): boolean {
  return AGENCY_ROLES.has(normalizeRole(role));
}

export function requestIp(req: NextApiRequest): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (Array.isArray(forwarded) && forwarded[0]) return forwarded[0].split(",")[0]?.trim() || null;
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim() || null;
  return req.socket?.remoteAddress || null;
}
