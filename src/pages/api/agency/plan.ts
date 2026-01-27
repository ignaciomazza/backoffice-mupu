import type { NextApiRequest, NextApiResponse } from "next";
import { resolveAuth } from "@/lib/auth";
import { resolveAgencyPlanInfo } from "@/lib/planAccess.server";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const auth = await resolveAuth(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const info = await resolveAgencyPlanInfo(auth.id_agency);
  return res.status(200).json({
    has_plan: info.hasPlan,
    plan_key: info.planKey,
  });
}
