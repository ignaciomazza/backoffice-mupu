type PrismaKnownRequestError = {
  code?: string;
  meta?: { column?: string };
  message?: string;
};

export function isMissingColumnError(
  error: unknown,
  column: string,
): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as PrismaKnownRequestError;
  if (err.code !== "P2022") return false;
  if (err.meta?.column) return err.meta.column === column;
  if (typeof err.message !== "string") return false;
  return err.message.includes(`\`${column}\``);
}
