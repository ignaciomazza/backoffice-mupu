import type { NextApiRequest, NextApiResponse } from "next";
import { requireGroupFinanceContext } from "@/lib/groups/financeShared";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await requireGroupFinanceContext(req, res);
  if (!ctx) return;
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
  return res.status(200).json({
    success: true,
    creditNotes: [],
  });
}

