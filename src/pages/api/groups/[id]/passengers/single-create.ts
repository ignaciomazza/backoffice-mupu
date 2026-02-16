import type { NextApiRequest, NextApiResponse } from "next";
import bulkCreateHandler from "./bulk-create";

export default async function singleCreateHandler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  return bulkCreateHandler(req, res);
}
