// src/pages/api/qr-signup/index.ts

import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import bcrypt from "bcrypt";
import { z } from "zod";

/* =========================================================
 * Zod schemas (mismo formato que /api/leads)
 * ========================================================= */

const trimToUndef = z
  .string()
  .transform((s) => s.trim())
  .transform((s) => (s.length ? s : undefined));

const emailRequired = z
  .string()
  .transform((s) => s.trim())
  .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Email inválido");

const PublicLeadCreateSchema = z.object({
  name: z
    .string()
    .min(2, "Nombre requerido")
    .transform((s) => s.trim()),
  agency: z
    .string()
    .min(2, "Agencia / Operador requerido")
    .transform((s) => s.trim()),
  role: z
    .string()
    .min(2, "Rol requerido")
    .transform((s) => s.trim()),
  size: trimToUndef.optional(),
  location: trimToUndef.optional(),
  email: emailRequired,
  whatsapp: trimToUndef
    .transform((v) => (v ? v.replace(/\D/g, "") : undefined))
    .optional(),
  message: trimToUndef.optional(),
});

/* =========================================================
 * Helpers
 * ========================================================= */

function splitFullName(full: string): { first: string; last: string } {
  const s = (full || "").trim().replace(/\s+/g, " ");
  if (!s) return { first: "Usuario", last: "Ofistur" };
  const parts = s.split(" ");
  const first = parts.shift() || "Usuario";
  const last = parts.join(" ") || "-";
  return { first, last };
}

function generateStrongPassword(): string {
  const base = Math.random().toString(36).slice(2, 10); // 8 chars
  // agregamos mayúscula, número y símbolo para cumplir políticas fuertes
  return base + "A1!";
}

/**
 * Genera un CUIT "trucho" pero con formato de 11 dígitos
 * y dígito verificador calculado. No es un CUIT real,
 * pero respeta el algoritmo.
 */
function generateFakeCuit(): string {
  // "20" + 8 dígitos pseudoaleatorios
  const middle = String(Math.floor(Math.random() * 100_000_000)).padStart(
    8,
    "0",
  );
  const base10 = `20${middle}`; // 10 dígitos

  const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const digits = base10.split("").map(Number);
  const sum = digits.reduce((acc, d, i) => acc + d * mult[i], 0);
  let dv = 11 - (sum % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) dv = 9;

  return base10 + String(dv); // 11 dígitos
}

/* =========================================================
 * Handler principal
 * ========================================================= */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const parsed = PublicLeadCreateSchema.parse(req.body ?? {});
    const { name, agency, role, size, location, email, whatsapp, message } =
      parsed;

    // 1) ¿Ya existe usuario con ese email?
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id_user: true, id_agency: true },
    });

    if (existingUser) {
      // Registramos el lead igual, pero sin crear usuario ni agencia
      await prisma.lead.create({
        data: {
          full_name: name,
          agency_name: agency,
          role,
          team_size: size ?? null,
          location: location ?? null,
          email,
          whatsapp: whatsapp ?? null,
          message: message ?? null,
          status: "PENDING",
          source: "qr-existing",
          id_agency: existingUser.id_agency,
        },
      });

      return res.status(200).json({
        ok: false,
        reason: "EMAIL_EXISTS",
      });
    }

    // 2) Crear agencia "fake" (con CUIT de mentira)
    const fakeTaxId = generateFakeCuit();
    const agencyRecord = await prisma.agency.create({
      data: {
        name: agency,
        legal_name: agency,
        tax_id: fakeTaxId,
        phone: whatsapp ?? null,
        address: location ?? null,
        email,
        website: null,
      },
      select: { id_agency: true },
    });

    // 3) Crear usuario real (rol gerente) con password fuerte
    const { first, last } = splitFullName(name);
    const plainPassword = generateStrongPassword();

    let hashedPassword = plainPassword;
    try {
      hashedPassword = await bcrypt.hash(plainPassword, 10);
    } catch {
      // Si falla el hash por algún motivo raro, guardamos en texto plano
      // (no ideal, pero evita romper el flujo de alta en esta etapa de captación)
    }

    const userRecord = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        first_name: first,
        last_name: last,
        position: role,
        role: "gerente",
        id_agency: agencyRecord.id_agency,
      },
      select: { id_user: true },
    });

    // 4) Crear lead vinculado a la agencia
    const leadRecord = await prisma.lead.create({
      data: {
        full_name: name,
        agency_name: agency,
        role,
        team_size: size ?? null,
        location: location ?? null,
        email,
        whatsapp: whatsapp ?? null,
        message: message ?? null,
        status: "CLOSED",
        source: "qr-autosignup",
        id_agency: agencyRecord.id_agency,
      },
      select: { id_lead: true },
    });

    // 5) Devolver credenciales para mostrar en pantalla (sin mail)
    return res.status(201).json({
      ok: true,
      id_lead: leadRecord.id_lead,
      id_agency: agencyRecord.id_agency,
      id_user: userRecord.id_user,
      login: {
        email,
        password: plainPassword,
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      const msg = e.issues?.[0]?.message ?? "Datos inválidos";
      return res.status(400).json({ error: msg });
    }
    // eslint-disable-next-line no-console
    console.error("[qr-signup][POST]", e);
    return res.status(500).json({ error: "Error procesando la solicitud" });
  }
}
