// src/lib/prisma.ts

import { PrismaClient, Prisma } from "@prisma/client";

// Extend the global object to include a PrismaClient instance
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const applyPoolParams = (url: string) => {
  try {
    const parsed = new URL(url);
    const explicitLimit = Number(process.env.PRISMA_POOL_LIMIT);
    const explicitTimeout = Number(process.env.PRISMA_POOL_TIMEOUT);

    // No tocamos el pool por defecto: respetamos DATABASE_URL/DIRECT_URL.
    // Solo aplicamos override si se configuró explícitamente por env.
    if (Number.isFinite(explicitLimit) && explicitLimit > 0) {
      parsed.searchParams.set("connection_limit", String(Math.trunc(explicitLimit)));
    }
    if (Number.isFinite(explicitTimeout) && explicitTimeout > 0) {
      parsed.searchParams.set("pool_timeout", String(Math.trunc(explicitTimeout)));
    }

    return parsed.toString();
  } catch {
    return url;
  }
};

// Por defecto en dev usamos DATABASE_URL (pool), que es más estable para tráfico web.
// Nota DigitalOcean: el path del pool (ej: /ofistur-app) puede ser el NOMBRE del pool y
// NO necesariamente el nombre real de la base de datos backend.
//
// Si necesitás forzar runtime con DIRECT_URL para debug puntual, activá:
// PRISMA_USE_DIRECT_IN_DEV=true
const useDirectInDev = process.env.PRISMA_USE_DIRECT_IN_DEV === "true";
const baseUrl =
  process.env.NODE_ENV !== "production" &&
  useDirectInDev &&
  process.env.DIRECT_URL
    ? process.env.DIRECT_URL
    : process.env.DATABASE_URL;
const shouldPatchPool =
  !!process.env.PRISMA_POOL_LIMIT || !!process.env.PRISMA_POOL_TIMEOUT;
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
