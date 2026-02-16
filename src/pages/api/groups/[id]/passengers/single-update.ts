import type { NextApiRequest, NextApiResponse } from "next";
import bulkUpdateHandler from "./bulk-update";

export default async function singleUpdateHandler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  return bulkUpdateHandler(req, res);
}
