import prisma from "@/lib/prisma";

type CacheEntry = {
  value: boolean;
  expiresAt: number;
};

const CACHE_TTL_MS = 60_000;
const NEGATIVE_CACHE_TTL_MS = 5_000;
const cache = new Map<string, CacheEntry>();

export async function hasSchemaColumn(
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const key = `${tableName}.${columnName}`.toLowerCase();
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_class c
        ON c.oid = a.attrelid
      JOIN pg_catalog.pg_namespace n
        ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND a.attnum > 0
        AND NOT a.attisdropped
        AND lower(c.relname) = lower(${tableName})
        AND lower(a.attname) = lower(${columnName})
    ) AS "exists"
  `;

  const value = !!rows[0]?.exists;
  cache.set(key, {
    value,
    expiresAt: now + (value ? CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS),
  });
  return value;
}
