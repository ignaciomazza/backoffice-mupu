// src/lib/prisma.ts

import { PrismaClient, Prisma } from "@prisma/client";

// Extend the global object to include a PrismaClient instance
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const DEFAULT_POOL_LIMIT = 5;
const DEFAULT_POOL_TIMEOUT = 30;

const applyPoolParams = (url: string) => {
  try {
    const parsed = new URL(url);
    const rawLimit = Number(parsed.searchParams.get("connection_limit"));
    const rawTimeout = Number(parsed.searchParams.get("pool_timeout"));
    const minLimit = Number(process.env.PRISMA_POOL_LIMIT) || DEFAULT_POOL_LIMIT;
    const minTimeout =
      Number(process.env.PRISMA_POOL_TIMEOUT) || DEFAULT_POOL_TIMEOUT;

    if (!Number.isFinite(rawLimit) || rawLimit < minLimit) {
      parsed.searchParams.set("connection_limit", String(minLimit));
    }
    if (!Number.isFinite(rawTimeout) || rawTimeout < minTimeout) {
      parsed.searchParams.set("pool_timeout", String(minTimeout));
    }

    return parsed.toString();
  } catch {
    return url;
  }
};

const baseUrl = process.env.DATABASE_URL;
const shouldPatchPool =
  process.env.NODE_ENV !== "production" ||
  !!process.env.PRISMA_POOL_LIMIT ||
  !!process.env.PRISMA_POOL_TIMEOUT;
const prismaUrl =
  baseUrl && shouldPatchPool ? applyPoolParams(baseUrl) : baseUrl;

// Use the existing instance if it exists, otherwise create a new one.
const prisma =
  global.prisma ??
  new PrismaClient(
    prismaUrl ? { datasources: { db: { url: prismaUrl } } } : undefined,
  );

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

export default prisma;
export { Prisma };
