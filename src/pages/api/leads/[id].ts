// src/pages/api/leads/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import { jwtVerify, type JWTPayload } from "jose";
import { z } from "zod";
import bcrypt from "bcrypt";

/* ===== Auth helpers ===== */
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

type TokenPayload = JWTPayload & {
  role?: string;
};

function normalizeRole(r?: string) {
  return (r ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function getTokenFromRequest(req: NextApiRequest): string | null {
  if (req.cookies?.token) return req.cookies.token;
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  const c = req.cookies || {};
  for (const k of [
    "session",
    "auth_token",
    "access_token",
    "next-auth.session-token",
  ]) {
    const v = c[k];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

async function requireAuthRole(
  req: NextApiRequest,
  roles: string[] = ["desarrollador", "gerente"],
): Promise<string | null> {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return null;

    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET),
    );
    const role = normalizeRole((payload as TokenPayload).role);
    if (!role) return null;
    if (!roles.includes(role)) return null;
    return role;
  } catch {
    return null;
  }
}

/* ===== Utils ===== */
function validateCUIT(cuitRaw: string): boolean {
  const cuit = (cuitRaw || "").replace(/\D/g, "");
  if (cuit.length !== 11) return false;
  const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const digits = cuit.split("").map(Number);
  const dv = digits.pop()!;
  const sum = digits.reduce((acc, d, i) => acc + d * mult[i], 0);
  let mod = 11 - (sum % 11);
  if (mod === 11) mod = 0;
  if (mod === 10) mod = 9;
  return dv === mod;
}

function splitFullName(full: string): { first: string; last: string } {
  const s = (full || "").trim().replace(/\s+/g, " ");
  if (!s) return { first: "Usuario", last: "Ofistur" };
  const parts = s.split(" ");
  const first = parts.shift() || "Usuario";
  const last = parts.join(" ") || "-";
  return { first, last };
}

function isEmail(v?: string | null): v is string {
  return !!v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/* ===== Schemas ===== */
const PutSchema = z.object({
  status: z.string().min(1, "status requerido").transform((s) => s.trim()),
});

const ConvertSchema = z.object({
  action: z.literal("convert"),
  // A) vincular a agencia ya existente
  existing_agency_id: z.number().int().positive().optional(),
  // B) crear agencia nueva (si no se pasó existing_agency_id)
  agency_tax_id: z.string().optional(), // validaremos CUIT si se usa
  // opcionales / override
  user_email: z.string().email().optional(),
  user_password: z.string().min(6).optional(),
  user_role: z.string().optional(), // default: "gerente"
});

/* ===== Handler ===== */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { id } = req.query;
  const idNum = Array.isArray(id) ? Number(id[0]) : Number(id);
  if (!Number.isFinite(idNum)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  if (req.method === "PUT") {
    const role = await requireAuthRole(req);
    if (!role) return res.status(401).json({ error: "No autorizado" });

    try {
      const { status } = PutSchema.parse(req.body ?? {});
      const updated = await prisma.lead.update({
        where: { id_lead: idNum },
        data: {
          status,
          ...(status.toUpperCase() === "CONTACTED" ? { contacted_at: new Date() } : {}),
        },
        select: { id_lead: true, status: true },
      });
      res.status(200).json(updated);
      return;
    } catch (e: unknown) {
      if (
        typeof e === "object" &&
        e !== null &&
        (e as Record<string, unknown>).name === "ZodError"
      ) {
        const issues = (e as Record<string, unknown>).issues;
        const msg =
          Array.isArray(issues) &&
          issues[0] &&
          typeof (issues[0] as Record<string, unknown>).message === "string"
            ? String((issues[0] as Record<string, unknown>).message)
            : "Datos inválidos";
        res.status(400).json({ error: msg });
        return;
      }
      console.error("[leads/:id][PUT]", e);
      res.status(500).json({ error: "Error actualizando lead" });
      return;
    }
  }

  if (req.method === "DELETE") {
    const role = await requireAuthRole(req);
    if (!role) return res.status(401).json({ error: "No autorizado" });

    try {
      await prisma.lead.delete({ where: { id_lead: idNum } });
      res.status(200).json({ ok: true });
      return;
    } catch (e) {
      console.error("[leads/:id][DELETE]", e);
      res.status(500).json({ error: "Error eliminando lead" });
      return;
    }
  }

  if (req.method === "POST") {
    const role = await requireAuthRole(req);
    if (!role) return res.status(401).json({ error: "No autorizado" });

    // convertir lead -> agencia + usuario
    try {
      const body = ConvertSchema.parse(req.body ?? {});
      const lead = await prisma.lead.findUnique({ where: { id_lead: idNum } });
      if (!lead) return res.status(404).json({ error: "Lead no encontrado" });

      // 1) Asegurar email para usuario
      const userEmail = body.user_email ?? lead.email;
      if (!isEmail(userEmail)) {
        return res.status(400).json({ error: "Email de usuario inválido" });
      }

      // 2) Obtener / crear Agencia
      let agencyId: number | null = null;
      if (body.existing_agency_id) {
        const existing = await prisma.agency.findUnique({
          where: { id_agency: body.existing_agency_id },
          select: { id_agency: true },
        });
        if (!existing) {
          return res.status(400).json({ error: "Agencia existente no encontrada" });
        }
        agencyId = existing.id_agency;
      } else {
        const cuit = (body.agency_tax_id ?? "").trim();
        if (!validateCUIT(cuit)) {
          return res.status(400).json({ error: "CUIT inválido (agency_tax_id)" });
        }

        // si existe una con mismo CUIT, reusar
        const foundByTax = await prisma.agency.findFirst({
          where: { tax_id: cuit },
          select: { id_agency: true },
        });

        if (foundByTax) {
          agencyId = foundByTax.id_agency;
        } else {
          const name = lead.agency_name?.trim() || "Agencia";
          const legal = lead.agency_name?.trim() || name;
          const createdAgency = await prisma.agency.create({
            data: {
              name,
              legal_name: legal,
              tax_id: cuit,
              phone: lead.whatsapp ?? null,
              address: lead.location ?? null,
              email: null,
              website: null,
            },
            select: { id_agency: true },
          });
          agencyId = createdAgency.id_agency;
        }
      }

      if (!agencyId) return res.status(500).json({ error: "No se pudo resolver agencia" });

      // 3) Crear usuario (o error si mail está en otra agencia)
      const existingUser = await prisma.user.findUnique({
        where: { email: userEmail },
        select: { id_user: true, id_agency: true },
      });

      if (existingUser) {
        if (existingUser.id_agency !== agencyId) {
          return res
            .status(409)
            .json({ error: "Ya existe un usuario con ese email en otra agencia" });
        }
        // si ya existe en la misma agencia, lo reutilizamos
        const updatedLead = await prisma.$transaction(async (tx) => {
          const agencyLeadId =
            lead.agency_lead_id ??
            (await getNextAgencyCounter(tx, agencyId, "lead"));
          return tx.lead.update({
            where: { id_lead: idNum },
            data: {
              id_agency: agencyId,
              agency_lead_id: agencyLeadId,
              status: "CLOSED",
              contacted_at: lead.contacted_at ?? new Date(),
            },
            select: { id_lead: true, id_agency: true, status: true },
          });
        });
        return res.status(200).json({
          ok: true,
          id_agency: updatedLead.id_agency,
          id_user: existingUser.id_user,
          reused_user: true,
        });
      }

      const { first, last } = splitFullName(lead.full_name);
      const plainPassword =
        body.user_password ?? Math.random().toString(36).slice(2, 10) + "A1!";
      let hashed = plainPassword;
      try {
        hashed = await bcrypt.hash(plainPassword, 10);
      } catch {
        // si falla el hash por alguna razón, guardamos la plain (no ideal, pero evita romper)
      }

      const newUser = await prisma.$transaction(async (tx) => {
        const agencyUserId = await getNextAgencyCounter(tx, agencyId, "user");
        return tx.user.create({
          data: {
            email: userEmail,
            password: hashed,
            role: body.user_role ?? "gerente",
            position: lead.role?.trim() || null,
            first_name: first,
            last_name: last,
            id_agency: agencyId,
            agency_user_id: agencyUserId,
          },
          select: { id_user: true },
        });
      });

      // 4) Actualizar lead con vínculo
      await prisma.$transaction(async (tx) => {
        const agencyLeadId =
          lead.agency_lead_id ??
          (await getNextAgencyCounter(tx, agencyId, "lead"));
        await tx.lead.update({
          where: { id_lead: idNum },
          data: {
            id_agency: agencyId,
            agency_lead_id: agencyLeadId,
            status: "CLOSED",
            contacted_at: lead.contacted_at ?? new Date(),
          },
        });
      });

      res.status(200).json({
        ok: true,
        id_agency: agencyId,
        id_user: newUser.id_user,
        temp_password: body.user_password ? undefined : plainPassword,
      });
      return;
    } catch (e: unknown) {
      if (
        typeof e === "object" &&
        e !== null &&
        (e as Record<string, unknown>).name === "ZodError"
      ) {
        const issues = (e as Record<string, unknown>).issues;
        const msg =
          Array.isArray(issues) &&
          issues[0] &&
          typeof (issues[0] as Record<string, unknown>).message === "string"
            ? String((issues[0] as Record<string, unknown>).message)
            : "Datos inválidos";
        res.status(400).json({ error: msg });
        return;
      }
      console.error("[leads/:id][POST convert]", e);
      res.status(500).json({ error: "Error convirtiendo lead" });
      return;
    }
  }

  res.setHeader("Allow", ["PUT", "DELETE", "POST"]);
  res.status(405).end(`Método ${req.method} no permitido`);
}
