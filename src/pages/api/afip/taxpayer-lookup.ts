import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { jwtVerify, type JWTPayload } from "jose";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getAfipFromRequest } from "@/services/afip/afipConfig";
import {
  getBookingComponentGrants,
} from "@/lib/accessControl";
import { canAccessBookingComponent } from "@/utils/permissions";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

type TokenPayload = JWTPayload & {
  id_user?: number;
  userId?: number;
  uid?: number;
  role?: string;
  id_agency?: number;
  agencyId?: number;
  aid?: number;
  email?: string;
};

type DecodedUser = {
  id_user?: number;
  id_agency?: number;
  role?: string;
  email?: string;
};

type AnyRecord = Record<string, unknown>;

type TaxpayerLookupResult = {
  dni: string | null;
  cuit: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  address: string | null;
  locality: string | null;
  postal_code: string | null;
  commercial_address: string | null;
};

const lookupSchema = z.object({
  clientId: z.number().int().positive().optional(),
  documentType: z.enum(["DNI", "CUIT"]).optional(),
  documentNumber: z.string().optional(),
  persist: z.boolean().optional().default(false),
});

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

async function getUserFromAuth(req: NextApiRequest): Promise<DecodedUser | null> {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return null;

    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET),
    );
    const p = payload as TokenPayload;

    const id_user = Number(p.id_user ?? p.userId ?? p.uid) || undefined;
    const id_agency = Number(p.id_agency ?? p.agencyId ?? p.aid) || undefined;
    const role = p.role;
    const email = p.email;

    if (!id_user && email) {
      const u = await prisma.user.findUnique({
        where: { email },
        select: { id_user: true, id_agency: true, role: true, email: true },
      });
      if (u) {
        return {
          id_user: u.id_user,
          id_agency: u.id_agency,
          role: u.role,
          email: u.email,
        };
      }
    }

    if (id_user && !id_agency) {
      const u = await prisma.user.findUnique({
        where: { id_user },
        select: { id_agency: true, role: true, email: true },
      });
      if (u) {
        return {
          id_user,
          id_agency: u.id_agency,
          role: role ?? u.role,
          email: email ?? u.email ?? undefined,
        };
      }
    }

    return { id_user, id_agency, role, email };
  } catch {
    return null;
  }
}

function isRecord(v: unknown): v is AnyRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pickString(obj: AnyRecord | null, keys: string[]): string | null {
  if (!obj) return null;
  for (const key of keys) {
    const raw = obj[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  }
  return null;
}

function onlyDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeCuit(value: unknown): string | null {
  const digits = onlyDigits(value);
  return digits.length === 11 ? digits : null;
}

function normalizeDni(value: unknown): string | null {
  const digits = onlyDigits(value);
  return digits.length >= 7 && digits.length <= 9 ? digits : null;
}

function extractCuitFromDocumentLookup(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const maybe = normalizeCuit(item);
      if (maybe) return maybe;
      if (isRecord(item)) {
        const nested =
          normalizeCuit(item.idPersona) ||
          normalizeCuit(item.id_persona) ||
          normalizeCuit(item.cuit);
        if (nested) return nested;
      }
    }
    return null;
  }

  if (isRecord(value)) {
    return (
      normalizeCuit(value.idPersona) ||
      normalizeCuit(value.id_persona) ||
      normalizeCuit(value.cuit)
    );
  }

  return normalizeCuit(value);
}

function parseTaxpayer(raw: unknown, fallback: { dni?: string; cuit?: string }): TaxpayerLookupResult {
  const root = isRecord(raw) ? raw : {};
  const persona = isRecord(root.persona) ? root.persona : root;
  const datosGenerales = isRecord(persona.datosGenerales)
    ? persona.datosGenerales
    : isRecord(persona.datos_generales)
      ? persona.datos_generales
      : persona;

  const domicilio = isRecord(datosGenerales.domicilioFiscal)
    ? datosGenerales.domicilioFiscal
    : isRecord(datosGenerales.domicilio_fiscal)
      ? datosGenerales.domicilio_fiscal
      : isRecord(persona.domicilioFiscal)
        ? persona.domicilioFiscal
        : isRecord(persona.domicilio)
          ? persona.domicilio
          : null;

  const cuit =
    normalizeCuit(
      pickString(persona, ["idPersona", "id_persona", "cuit"]) ??
        pickString(datosGenerales, ["idPersona", "id_persona", "cuit"]),
    ) ??
    normalizeCuit(fallback.cuit ?? "");

  const dni =
    normalizeDni(
      pickString(datosGenerales, [
        "numeroDocumento",
        "nroDocumento",
        "documento",
        "dni",
      ]) ?? pickString(persona, ["numeroDocumento", "documento", "dni"]),
    ) ??
    normalizeDni(fallback.dni ?? "");

  const companyName = pickString(datosGenerales, [
    "razonSocial",
    "razon_social",
    "denominacion",
  ]);

  const firstName = pickString(datosGenerales, ["nombre", "first_name"]);
  const lastName = pickString(datosGenerales, ["apellido", "last_name"]);

  const address = pickString(domicilio, [
    "direccion",
    "domicilio",
    "street",
    "calle",
  ]);
  const locality = pickString(domicilio, [
    "localidad",
    "ciudad",
    "municipio",
    "provincia",
    "descripcionProvincia",
  ]);
  const postalCode = pickString(domicilio, ["codPostal", "codigoPostal", "cp"]);

  return {
    dni,
    cuit,
    first_name: firstName,
    last_name: lastName,
    company_name: companyName,
    address,
    locality,
    postal_code: postalCode,
    commercial_address: address,
  };
}

async function applyLookupToClient(
  agencyId: number,
  clientId: number,
  lookup: TaxpayerLookupResult,
) {
  const client = await prisma.client.findFirst({
    where: { id_client: clientId, id_agency: agencyId },
    select: {
      id_client: true,
      tax_id: true,
      dni_number: true,
      first_name: true,
      last_name: true,
      company_name: true,
      address: true,
      locality: true,
      postal_code: true,
      commercial_address: true,
    },
  });

  if (!client) return null;

  const data: Prisma.ClientUpdateInput = {};

  if (lookup.cuit && !client.tax_id) data.tax_id = lookup.cuit;
  if (lookup.dni && !client.dni_number) data.dni_number = lookup.dni;

  if (lookup.company_name && !client.company_name) {
    data.company_name = lookup.company_name;
  }
  if (lookup.first_name && !client.first_name) {
    data.first_name = lookup.first_name;
  }
  if (lookup.last_name && !client.last_name) {
    data.last_name = lookup.last_name;
  }
  if (lookup.address && !client.address) {
    data.address = lookup.address;
  }
  if (lookup.locality && !client.locality) {
    data.locality = lookup.locality;
  }
  if (lookup.postal_code && !client.postal_code) {
    data.postal_code = lookup.postal_code;
  }
  if (lookup.commercial_address && !client.commercial_address) {
    data.commercial_address = lookup.commercial_address;
  }

  if (!Object.keys(data).length) return client;

  return prisma.client.update({
    where: { id_client: client.id_client },
    data,
    select: {
      id_client: true,
      tax_id: true,
      dni_number: true,
      first_name: true,
      last_name: true,
      company_name: true,
      address: true,
      locality: true,
      postal_code: true,
      commercial_address: true,
    },
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ success: false, message: "Método no permitido" });
  }

  const auth = await getUserFromAuth(req);
  if (!auth?.id_user || !auth.id_agency) {
    return res.status(401).json({ success: false, message: "No autenticado" });
  }

  const bookingGrants = await getBookingComponentGrants(
    auth.id_agency,
    auth.id_user,
  );
  const canBilling = canAccessBookingComponent(
    auth.role,
    bookingGrants,
    "billing",
  );

  if (!canBilling) {
    return res.status(403).json({ success: false, message: "Sin permisos" });
  }

  const parsed = lookupSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: parsed.error.errors.map((e) => e.message).join(", "),
    });
  }

  const { clientId, documentType, documentNumber, persist } = parsed.data;

  let clientData: {
    id_client: number;
    dni_number: string | null;
    tax_id: string | null;
  } | null = null;

  if (clientId) {
    clientData = await prisma.client.findFirst({
      where: { id_client: clientId, id_agency: auth.id_agency },
      select: { id_client: true, dni_number: true, tax_id: true },
    });
    if (!clientData) {
      return res.status(404).json({ success: false, message: "Pax no encontrado" });
    }
  }

  const rawInput = String(documentNumber ?? "").trim();
  const dni =
    documentType === "DNI"
      ? normalizeDni(rawInput) ?? normalizeDni(clientData?.dni_number ?? "")
      : normalizeDni(clientData?.dni_number ?? "");
  let cuit =
    documentType === "CUIT"
      ? normalizeCuit(rawInput) ?? normalizeCuit(clientData?.tax_id ?? "")
      : normalizeCuit(clientData?.tax_id ?? "");

  if (!dni && !cuit) {
    return res.status(400).json({
      success: false,
      message: "Ingresá un DNI o CUIT para consultar en AFIP.",
    });
  }

  const cfg = await prisma.agencyArcaConfig.findUnique({
    where: { agencyId: auth.id_agency },
    select: { authorizedServices: true },
  });

  const hasPadron = (cfg?.authorizedServices ?? []).includes("ws_sr_padron_a13");
  if (!hasPadron) {
    return res.status(400).json({
      success: false,
      message:
        "Tu agencia no tiene autorizado ws_sr_padron_a13 en ARCA. Habilitalo y reintentá.",
    });
  }

  try {
    const afip = await getAfipFromRequest(req);

    if (!cuit && dni) {
      const byDoc = await afip.RegisterScopeThirteen.getTaxIDByDocument(dni);
      cuit = extractCuitFromDocumentLookup(byDoc);
      if (!cuit) {
        return res.status(404).json({
          success: false,
          message: "No se encontró CUIT para el DNI informado en AFIP.",
        });
      }
    }

    if (!cuit) {
      return res.status(400).json({
        success: false,
        message: "No se pudo resolver el CUIT para consultar padrón.",
      });
    }

    const rawTaxpayer = await afip.RegisterScopeThirteen.getTaxpayerDetails(cuit);
    if (!rawTaxpayer) {
      return res.status(404).json({
        success: false,
        message: "No se encontraron datos del contribuyente en AFIP.",
      });
    }

    const lookup = parseTaxpayer(rawTaxpayer, { dni: dni ?? undefined, cuit });

    let updatedClient: unknown = null;
    if (persist && clientId) {
      updatedClient = await applyLookupToClient(auth.id_agency, clientId, lookup);
    }

    return res.status(200).json({
      success: true,
      lookup,
      persisted: Boolean(persist && clientId),
      client: updatedClient,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return res.status(500).json({ success: false, message });
  }
}
