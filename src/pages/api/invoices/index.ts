// src/pages/api/invoices/index.ts

import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { createVoucherService } from "@/services/afip/createVoucherService";

interface ServiceDetail {
  sale_price: number;
  taxableBase21: number;
  commission21: number;
  tax_21: number;
  vatOnCommission21: number;
  taxableBase10_5: number;
  commission10_5: number;
  tax_105: number;
  vatOnCommission10_5: number;
  taxableCardInterest: number;
  vatOnCardInterest: number;
  currency: string;
  description: string;
  nonComputable: number;
}

interface InvoiceRequestBody {
  bookingId: number | string;
  services: number[];
  clientIds: (number | string)[];
  tipoFactura: number;
  exchangeRate?: number;
  description21?: string[];
  description10_5?: string[];
  descriptionNonComputable?: string[];
}

interface VoucherDetails {
  CbteDesde: number;
  ImpTotal: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  console.info(
    `[Invoices API] New request: ${req.method} ${req.url}`,
    req.body ?? req.query,
  );

  if (req.method === "GET") {
    const { bookingId } = req.query;
    if (!bookingId) {
      console.error("[Invoices API][GET] Missing bookingId");
      return res
        .status(400)
        .json({ success: false, message: "Falta bookingId en la consulta." });
    }
    const invoices = await prisma.invoice.findMany({
      where: { bookingId_booking: Number(bookingId) },
    });
    console.info("[Invoices API][GET] Returning invoices:", invoices.length);
    return res.status(200).json({ success: true, invoices });
  }

  if (req.method === "POST") {
    console.info("[Invoices API][POST] Starting invoicing process");
    const {
      bookingId,
      services,
      clientIds,
      tipoFactura,
      exchangeRate,
      description21 = [],
      description10_5 = [],
      descriptionNonComputable = [],
    } = req.body as InvoiceRequestBody;

    console.info("[Invoices API][POST] Payload:", {
      bookingId,
      services,
      clientIds,
      tipoFactura,
      exchangeRate,
      description21,
      description10_5,
      descriptionNonComputable,
    });

    if (!bookingId || !services?.length || !clientIds?.length) {
      console.error("[Invoices API][POST] Missing required data", req.body);
      return res
        .status(400)
        .json({ success: false, message: "Faltan datos requeridos." });
    }

    // 0) Obtener reserva + agencia
    const bookingRecord = await prisma.booking.findUnique({
      where: { id_booking: Number(bookingId) },
      include: { agency: true },
    });
    if (!bookingRecord) {
      console.error("[Invoices API][POST] Booking not found:", bookingId);
      return res
        .status(404)
        .json({ success: false, message: "Reserva no encontrada." });
    }
    console.info("[Invoices API][POST] Booking record:", bookingRecord);

    const {
      agency: {
        name: emitterName,
        legal_name: emitterLegalName,
        tax_id: emitterTaxId,
        address: emitterAddr,
      },
      departure_date,
      return_date,
    } = bookingRecord;

    // 1) Traer servicios crudos
    const rawServices = await prisma.service.findMany({
      where: { id_service: { in: services.map(Number) } },
    });
    console.info("[Invoices API][POST] Raw services:", rawServices);

    // 2) Mapear a ServiceDetail
    const serviceDetails: ServiceDetail[] = rawServices.map((s) => ({
      sale_price: s.sale_price,
      taxableBase21: s.taxableBase21 ?? 0,
      commission21: s.commission21 ?? 0,
      tax_21: s.tax_21 ?? 0,
      vatOnCommission21: s.vatOnCommission21 ?? 0,
      taxableBase10_5: s.taxableBase10_5 ?? 0,
      commission10_5: s.commission10_5 ?? 0,
      tax_105: s.tax_105 ?? 0,
      vatOnCommission10_5: s.vatOnCommission10_5 ?? 0,
      taxableCardInterest: s.taxableCardInterest ?? 0,
      vatOnCardInterest: s.vatOnCardInterest ?? 0,
      currency: s.currency,
      description: s.description,
      nonComputable: s.nonComputable ?? 0,
    }));
    console.info("[Invoices API][POST] Service details:", serviceDetails);

    // 3) Agrupar por moneda
    type GroupInfo = { services: ServiceDetail[] };
    const grouped = serviceDetails.reduce(
      (acc, svc) => {
        const m = svc.currency.toUpperCase();
        if (!acc[m]) acc[m] = { services: [] };
        acc[m].services.push(svc);
        return acc;
      },
      {} as Record<string, GroupInfo>,
    );
    console.info(
      "[Invoices API][POST] Grouped by currency:",
      Object.keys(grouped),
    );

    const invoicesResult: unknown[] = [];
    const mapCurrency = (m: string) =>
      m === "ARS" ? "PES" : m === "USD" ? "DOL" : m;

    // 4) Procesar cada grupo
    for (const m in grouped) {
      const svcs = grouped[m].services;
      const afipCurrency = mapCurrency(m);
      console.info(`[Invoices API][POST] Currency group ${m}→${afipCurrency}`);

      // 5) Facturar cada cliente
      for (const cidRaw of clientIds) {
        const cid = Number(cidRaw);
        const client = await prisma.client.findUnique({
          where: { id_client: cid },
        });
        if (!client) {
          console.warn(
            `[Invoices API][POST] Cliente ${cid} not found, skipping`,
          );
          continue;
        }

        const isFacturaB = tipoFactura === 6;
        const docNumber = isFacturaB
          ? client.dni_number?.toString()
          : client.tax_id?.toString();
        const docType = isFacturaB ? 96 : 80;
        if (!docNumber) {
          console.warn(
            `[Invoices API][POST] Cliente ${cid} invalid doc for tipo ${tipoFactura}, skipping`,
          );
          continue;
        }

        const clientName =
          client.company_name || `${client.first_name} ${client.last_name}`;
        console.info(`[Invoices API][POST] Facturando cliente ${cid}:`, {
          docNumber,
          docType,
          clientName,
        });

        const resp = await createVoucherService(
          tipoFactura,
          docNumber,
          docType,
          svcs,
          afipCurrency,
          description21,
          description10_5,
          descriptionNonComputable,
          exchangeRate,
          clientName,
          emitterName,
          emitterLegalName,
          emitterTaxId,
          emitterAddr ?? undefined,
          departure_date?.toISOString(),
          return_date?.toISOString(),
        );
        console.info(`[Invoices API][POST] AFIP response for ${cid}:`, resp);

        if (!resp.success) {
          console.warn(
            `[Invoices API][POST] AFIP rejected for ${cid}:`,
            resp.message,
          );
          continue;
        }

        const details = resp.details as VoucherDetails;
        console.info("[Invoices API][POST] Voucher details:", details);

        // 6) Guardar en BD
        const inv = await prisma.invoice.create({
          data: {
            invoice_number: details.CbteDesde.toString(),
            issue_date: new Date(),
            total_amount: details.ImpTotal,
            currency: afipCurrency,
            status: "Autorizada",
            type: tipoFactura === 1 ? "Factura A" : "Factura B",
            recipient: clientName,
            facturaHtml: resp.facturaHtml,
            bookingId_booking: Number(bookingId),
            client_id: cid,
          },
        });
        console.info("[Invoices API][POST] Saved invoice:", inv);
        invoicesResult.push(inv);
      }
    }

    if (!invoicesResult.length) {
      console.error("[Invoices API][POST] No invoices generated");
      return res
        .status(400)
        .json({ success: false, message: "No se generó ninguna factura." });
    }

    console.info(
      "[Invoices API][POST] Completed, total invoices:",
      invoicesResult.length,
    );
    return res.status(201).json({ success: true, invoices: invoicesResult });
  }

  res.setHeader("Allow", ["GET", "POST"]);
  console.warn(`[Invoices API] Method ${req.method} not allowed`);
  return res
    .status(405)
    .json({ success: false, message: "Método no permitido" });
}
