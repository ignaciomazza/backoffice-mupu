import type { NextApiResponse } from "next";

export type GroupApiErrorBody = {
  error: string;
  code?: string;
  details?: string;
  solution?: string;
};

type ErrorMeta = Omit<GroupApiErrorBody, "error">;

export function groupApiError(
  res: NextApiResponse,
  status: number,
  error: string,
  meta: ErrorMeta = {},
) {
  return res.status(status).json({
    error,
    ...meta,
  } satisfies GroupApiErrorBody);
}
