// src/pages/api/finance/_utils.ts
import type { NextApiRequest } from "next";
import { getAuth } from "./_auth";

export function parseAgencyId(
  raw: string | string[] | undefined,
): number | null {
  if (typeof raw === "undefined") return null;
  const str = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(str);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseIdParam(
  raw: string | string[] | undefined,
): number | null {
  if (typeof raw === "undefined") return null;
  const str = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(str);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function requireMethod(req: NextApiRequest, allowed: string[]) {
  if (!allowed.includes(req.method ?? "")) {
    const err = new Error("Method Not Allowed");
    (err as { status?: number }).status = 405;
    throw err;
  }
}

export async function resolveAgencyId(
  req: NextApiRequest,
): Promise<number | null> {
  const q = req.query as Record<string, unknown>;
  const q1 = parseAgencyId(q["id_agency"] as string | string[] | undefined);
  if (q1) return q1;
  const q2 = parseAgencyId(q["agencyId"] as string | string[] | undefined);
  if (q2) return q2;
  const auth = await getAuth(req);
  return auth.agencyId ?? null;
}
