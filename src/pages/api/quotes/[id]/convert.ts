import type { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import { decodePublicId, encodePublicId } from "@/lib/publicIds";
import {
  canAccessQuoteOwner,
  getLeaderScope,
  resolveQuoteAuth,
} from "@/lib/quotesAuth";
import {
  normalizeQuotePaxDrafts,
  normalizeQuoteServiceDrafts,
} from "@/utils/quoteDrafts";
import { normalizeRole } from "@/utils/permissions";

type ConvertPassenger =
  | {
      mode: "existing";
      client_id: number;
    }
  | {
      mode: "new";
      first_name: string;
      last_name: string;
      phone: string;
      birth_date: string;
      nationality: string;
      gender: string;
      email?: string;
      dni_number?: string;
      passport_number?: string;
      tax_id?: string;
    };

type ConvertService = {
  type: string;
  description?: string;
  note?: string;
  sale_price: number;
  cost_price: number;
  currency: string;
  destination?: string;
  reference?: string;
  operator_id: number;
  departure_date?: string;
  return_date?: string;
};

type ConvertBody = {
  booking: {
    clientStatus: string;
    operatorStatus: string;
    status: string;
    details: string;
    invoice_type: string;
    invoice_observation?: string | null;
    observation?: string | null;
    departure_date: string;
    return_date: string;
    id_user?: number;
  };
  titular: ConvertPassenger;
  companions?: ConvertPassenger[];
  services?: ConvertService[];
  delete_quote?: boolean;
};

function cleanString(v: unknown, max = 2000): string {
  return String(v ?? "").trim().slice(0, max);
}

function toPositiveInt(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function toLocalDate(v: unknown): Date | undefined {
  if (typeof v !== "string" || !v) return undefined;
  const ymd = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    return new Date(
      Number(ymd[1]),
      Number(ymd[2]) - 1,
      Number(ymd[3]),
      0,
      0,
      0,
      0,
    );
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

async function resolveQuoteIdFromParam(
  idParam: string,
  id_agency: number,
): Promise<number | null> {
  const numeric = toPositiveInt(idParam);
  if (numeric) {
    const foundById = await prisma.quote.findFirst({
      where: { id_quote: numeric, id_agency },
      select: { id_quote: true },
    });
    if (foundById) return foundById.id_quote;

    const foundByAgencyId = await prisma.quote.findFirst({
      where: { agency_quote_id: numeric, id_agency },
      select: { id_quote: true },
    });
    if (foundByAgencyId) return foundByAgencyId.id_quote;
  }

  const decoded = decodePublicId(idParam);
  if (!decoded || decoded.t !== "quote" || decoded.a !== id_agency) return null;
  const found = await prisma.quote.findFirst({
    where: { id_agency, agency_quote_id: decoded.i },
    select: { id_quote: true },
  });
  return found?.id_quote ?? null;
}

async function resolvePassengerToClientId(args: {
  tx: Prisma.TransactionClient;
  passenger: ConvertPassenger;
  id_agency: number;
  owner_user_id: number;
}): Promise<number> {
  const { tx, passenger, id_agency, owner_user_id } = args;

  if (passenger.mode === "existing") {
    const clientId = toPositiveInt(passenger.client_id);
    if (!clientId) throw new Error("Pasajero existente inválido.");
    const existing = await tx.client.findFirst({
      where: { id_client: clientId, id_agency },
      select: { id_client: true },
    });
    if (!existing) throw new Error("Pasajero no encontrado en tu agencia.");
    return existing.id_client;
  }

  const first_name = cleanString(passenger.first_name, 80);
  const last_name = cleanString(passenger.last_name, 80);
  const phone = cleanString(passenger.phone, 60);
  const nationality = cleanString(passenger.nationality, 60);
  const gender = cleanString(passenger.gender, 40);
  const birth = toLocalDate(passenger.birth_date);
  if (
    !first_name ||
    !last_name ||
    !phone ||
    !nationality ||
    !gender ||
    !birth
  ) {
    throw new Error(
      "Para crear pax se requiere: nombre, apellido, teléfono, fecha nacimiento, nacionalidad y género.",
    );
  }

  const agencyClientId = await getNextAgencyCounter(tx, id_agency, "client");
  const created = await tx.client.create({
    data: {
      agency_client_id: agencyClientId,
      first_name,
      last_name,
      phone,
      birth_date: birth,
      nationality,
      gender,
      email: cleanString(passenger.email, 120) || null,
      dni_number: cleanString(passenger.dni_number, 60) || null,
      passport_number: cleanString(passenger.passport_number, 60) || null,
      tax_id: cleanString(passenger.tax_id, 60) || null,
      id_user: owner_user_id,
      id_agency,
    },
    select: { id_client: true },
  });
  return created.id_client;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const auth = await resolveQuoteAuth(req);
  if (!auth) return res.status(401).json({ error: "No autenticado" });

  const rawId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!rawId || typeof rawId !== "string") {
    return res.status(400).json({ error: "ID inválido" });
  }

  const quoteId = await resolveQuoteIdFromParam(rawId, auth.id_agency);
  if (!quoteId) return res.status(404).json({ error: "Cotización no encontrada" });

  const quote = await prisma.quote.findUnique({
    where: { id_quote: quoteId },
  });
  if (!quote || quote.id_agency !== auth.id_agency) {
    return res.status(404).json({ error: "Cotización no encontrada" });
  }

  const allowed = await canAccessQuoteOwner(auth, quote.id_user);
  if (!allowed) return res.status(403).json({ error: "No autorizado." });

  const body = (req.body ?? {}) as Partial<ConvertBody>;
  const booking = body.booking;
  const titular = body.titular;
  const companions = Array.isArray(body.companions) ? body.companions : [];
  const services = Array.isArray(body.services) ? body.services : [];
  const deleteQuote = body.delete_quote !== false;

  if (!booking || typeof booking !== "object") {
    return res.status(400).json({ error: "Falta bloque booking." });
  }
  if (!titular || typeof titular !== "object") {
    return res.status(400).json({ error: "Falta titular." });
  }

  const requiredBooking = [
    "clientStatus",
    "operatorStatus",
    "status",
    "details",
    "invoice_type",
    "departure_date",
    "return_date",
  ] as const;
  for (const key of requiredBooking) {
    if (!cleanString((booking as Record<string, unknown>)[key])) {
      return res.status(400).json({ error: `Falta ${key} en booking.` });
    }
  }

  const departureDate = toLocalDate(booking.departure_date);
  const returnDate = toLocalDate(booking.return_date);
  if (!departureDate || !returnDate) {
    return res.status(400).json({ error: "Fechas de booking inválidas." });
  }

  const quotePaxDrafts = normalizeQuotePaxDrafts(quote.pax_drafts);
  const quoteServiceDrafts = normalizeQuoteServiceDrafts(quote.service_drafts);
  const requestedPaxCount = 1 + companions.length;
  if (quotePaxDrafts.length > 0 && requestedPaxCount < quotePaxDrafts.length) {
    return res.status(400).json({
      error:
        "La cotización tiene pax cargados. Completa titular y acompañantes para convertir.",
    });
  }
  if (quoteServiceDrafts.length > 0 && services.length < quoteServiceDrafts.length) {
    return res.status(400).json({
      error:
        "La cotización tiene servicios cargados. Completa los datos mínimos de todos los servicios para convertir.",
    });
  }

  const role = normalizeRole(auth.role);
  const canAssignOthers = [
    "gerente",
    "administrativo",
    "desarrollador",
    "lider",
  ].includes(role);
  let ownerUserId = quote.id_user;
  const requestedOwnerId = toPositiveInt(booking.id_user);
  if (canAssignOthers && requestedOwnerId) {
    if (role === "lider" && requestedOwnerId !== auth.id_user) {
      const scope = await getLeaderScope(auth.id_user, auth.id_agency);
      if (!scope.userIds.includes(requestedOwnerId)) {
        return res
          .status(403)
          .json({ error: "No podés asignar fuera de tu equipo." });
      }
    }
    ownerUserId = requestedOwnerId;
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const titularId = await resolvePassengerToClientId({
        tx,
        passenger: titular as ConvertPassenger,
        id_agency: auth.id_agency,
        owner_user_id: ownerUserId,
      });

      const companionIds: number[] = [];
      for (const companion of companions as ConvertPassenger[]) {
        const clientId = await resolvePassengerToClientId({
          tx,
          passenger: companion,
          id_agency: auth.id_agency,
          owner_user_id: ownerUserId,
        });
        if (clientId !== titularId && !companionIds.includes(clientId)) {
          companionIds.push(clientId);
        }
      }

      const bookingAgencyId = await getNextAgencyCounter(
        tx,
        auth.id_agency,
        "booking",
      );
      const createdBooking = await tx.booking.create({
        data: {
          agency_booking_id: bookingAgencyId,
          clientStatus: cleanString(booking.clientStatus, 60),
          operatorStatus: cleanString(booking.operatorStatus, 60),
          status: cleanString(booking.status, 60),
          details: cleanString(booking.details, 2000),
          invoice_type: cleanString(booking.invoice_type, 120),
          invoice_observation: cleanString(booking.invoice_observation, 2000),
          observation: cleanString(booking.observation, 2000),
          departure_date: departureDate,
          return_date: returnDate,
          pax_count: 1 + companionIds.length,
          titular: { connect: { id_client: titularId } },
          clients: { connect: companionIds.map((id) => ({ id_client: id })) },
          user: { connect: { id_user: ownerUserId } },
          agency: { connect: { id_agency: auth.id_agency } },
        },
        include: {
          titular: true,
          user: true,
          agency: true,
          clients: true,
        },
      });

      let createdServices = 0;
      for (const svcRaw of services) {
        const svc = svcRaw as ConvertService;
        const type = cleanString(svc.type, 80);
        const currency = cleanString(svc.currency, 16);
        const operatorId = toPositiveInt(svc.operator_id);
        const sale = Number(svc.sale_price);
        const cost = Number(svc.cost_price);
        if (
          !type ||
          !currency ||
          !operatorId ||
          !Number.isFinite(sale) ||
          !Number.isFinite(cost)
        ) {
          throw new Error(
            "Cada servicio requiere: type, sale_price, cost_price, currency y operator_id.",
          );
        }

        const operator = await tx.operator.findFirst({
          where: { id_operator: operatorId, id_agency: auth.id_agency },
          select: { id_operator: true },
        });
        if (!operator) {
          throw new Error(`Operador inválido para servicio (${operatorId}).`);
        }

        const serviceAgencyId = await getNextAgencyCounter(
          tx,
          auth.id_agency,
          "service",
        );
        const svcDeparture = toLocalDate(svc.departure_date) ?? departureDate;
        const svcReturn = toLocalDate(svc.return_date) ?? returnDate;

        await tx.service.create({
          data: {
            agency_service_id: serviceAgencyId,
            booking: { connect: { id_booking: createdBooking.id_booking } },
            agency: { connect: { id_agency: auth.id_agency } },
            operator: { connect: { id_operator: operator.id_operator } },
            type,
            description: cleanString(svc.description, 2000),
            note: cleanString(svc.note, 2000),
            sale_price: sale,
            cost_price: cost,
            currency,
            destination: cleanString(svc.destination, 200) || "",
            reference: cleanString(svc.reference, 120) || "",
            departure_date: svcDeparture,
            return_date: svcReturn,
          },
        });
        createdServices += 1;
      }

      if (deleteQuote) {
        await tx.quote.delete({ where: { id_quote: quote.id_quote } });
      }

      return { booking: createdBooking, servicesCreated: createdServices };
    });

    const public_id =
      result.booking.agency_booking_id != null
        ? encodePublicId({
            t: "booking",
            a: result.booking.id_agency,
            i: result.booking.agency_booking_id,
          })
        : null;

    return res.status(201).json({
      ...result.booking,
      public_id,
      services_created: result.servicesCreated,
      quote_deleted: deleteQuote,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    console.error("[quotes/:id/convert][POST]", error);
    return res.status(400).json({ error: message });
  }
}
