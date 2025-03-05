// src/lib/prisma.ts

import { PrismaClient, Prisma } from "@prisma/client";

// Extend the global object to include a PrismaClient instance
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Use the existing instance if it exists, otherwise create a new one.
const prisma = global.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

export default prisma;
export { Prisma };
