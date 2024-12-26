// src/lib/prisma.ts

import { PrismaClient, Prisma } from "@prisma/client";

// Añadimos un chequeo en el entorno de desarrollo para evitar múltiples instancias de Prisma
let prisma: PrismaClient;

if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient();
} else {
  if (!(global as any).prisma) {
    (global as any).prisma = new PrismaClient();
  }
  prisma = (global as any).prisma;
}

export default prisma;
export { Prisma };
