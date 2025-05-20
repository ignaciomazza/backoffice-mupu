// src/pages/api/invoices/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import type { Invoice, InvoiceItem } from "@prisma/client";
import { createVoucherService } from "@/services/afip/createVoucherService";

// Combina Invoice con sus items asociados
type InvoiceWithItems = Invoice & { InvoiceItem: InvoiceItem[] };

interface ServiceDetail {
  id_service: number;
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
  CAE: string;
  CAEFchVto: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  console.info(
    `[Invoices API] ${req.method} ${req.url}`,
    req.body ?? req.query,
  );

  if (req.method === "GET") {
    const { bookingId } = req.query;
    if (!bookingId) {
      return res
        .status(400)
        .json({ success: false, message: "Falta bookingId en la consulta." });
    }
    const invoices = await prisma.invoice.findMany({
      where: { bookingId_booking: Number(bookingId) },
      include: { InvoiceItem: true },
    });
    return res.status(200).json({ success: true, invoices });
  }

  if (req.method === "POST") {
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

    if (!bookingId || !services.length || !clientIds.length) {
      return res
        .status(400)
        .json({ success: false, message: "Faltan datos requeridos." });
    }

    const bookingRecord = await prisma.booking.findUnique({
      where: { id_booking: Number(bookingId) },
      include: { agency: true },
    });
    if (!bookingRecord) {
      return res
        .status(404)
        .json({ success: false, message: "Reserva no encontrada." });
    }

    const rawServices = await prisma.service.findMany({
      where: { id_service: { in: services.map(Number) } },
    });
    const serviceDetails: ServiceDetail[] = services.map((sid) => {
      const s = rawServices.find((r) => r.id_service === Number(sid))!;
      return {
        id_service: s.id_service,
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
      };
    });

    // Agrupar servicios por moneda
    const grouped: Record<string, ServiceDetail[]> = {};
    serviceDetails.forEach((svc) => {
      const m = svc.currency.toUpperCase();
      if (!grouped[m]) grouped[m] = [];
      grouped[m].push(svc);
    });

    const invoicesResult: InvoiceWithItems[] = [];
    const mapCurrency = (m: string) =>
      m === "ARS" ? "PES" : m === "USD" ? "DOL" : m;

    for (const m in grouped) {
      const svcs = grouped[m];
      const afipCurrency = mapCurrency(m);

      for (const cidRaw of clientIds) {
        const cid = Number(cidRaw);
        const client = await prisma.client.findUnique({
          where: { id_client: cid },
        });
        if (!client) continue;

        const isFacturaB = tipoFactura === 6;
        const docNumber = isFacturaB ? client.dni_number : client.tax_id;
        const docType = isFacturaB ? 96 : 80;
        if (!docNumber) continue;

        const clientName =
          client.company_name || `${client.first_name} ${client.last_name}`;

        const resp = await createVoucherService(
          tipoFactura,
          docNumber!,
          docType,
          svcs,
          afipCurrency,
          exchangeRate,
        );
        if (!resp.success) continue;

        const rawDetails = resp.details as Prisma.JsonObject | undefined;
        if (!rawDetails) continue;
        const details: VoucherDetails = {
          CbteDesde: rawDetails.CbteDesde as number,
          ImpTotal: rawDetails.ImpTotal as number,
          CAE: rawDetails.CAE as string,
          CAEFchVto: rawDetails.CAEFchVto as string,
        };

        const payloadAfip: Prisma.JsonObject = {
          voucherData: rawDetails,
          afipResponse: { CAE: details.CAE, CAEFchVto: details.CAEFchVto },
          qrBase64: resp.qrBase64!,
          description21,
          description10_5,
          descriptionNonComputable,
        };

        const inv = await prisma.invoice.create({
          data: {
            invoice_number: details.CbteDesde.toString(),
            issue_date: new Date(),
            total_amount: details.ImpTotal,
            currency: afipCurrency,
            status: "Autorizada",
            type: tipoFactura === 1 ? "Factura A" : "Factura B",
            recipient: clientName,
            payloadAfip,
            bookingId_booking: Number(bookingId),
            client_id: cid,
          },
        });

        await Promise.all(
          svcs.map((svc) =>
            prisma.invoiceItem.create({
              data: {
                invoiceId: inv.id_invoice,
                serviceId: svc.id_service,
                description: svc.description,
                sale_price: svc.sale_price,
                taxableBase21: svc.taxableBase21,
                commission21: svc.commission21,
                tax_21: svc.tax_21,
                vatOnCommission21: svc.vatOnCommission21,
                taxableBase10_5: svc.taxableBase10_5,
                commission10_5: svc.commission10_5,
                tax_105: svc.tax_105,
                vatOnCommission10_5: svc.vatOnCommission10_5,
                taxableCardInterest: svc.taxableCardInterest,
                vatOnCardInterest: svc.vatOnCardInterest,
              },
            }),
          ),
        );

        const invWithItems = await prisma.invoice.findUnique({
          where: { id_invoice: inv.id_invoice },
          include: { InvoiceItem: true },
        });
        if (invWithItems) invoicesResult.push(invWithItems);
      }
    }

    if (!invoicesResult.length) {
      return res
        .status(400)
        .json({ success: false, message: "No se generó ninguna factura." });
    }
    return res.status(201).json({ success: true, invoices: invoicesResult });
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res
    .status(405)
    .json({ success: false, message: "Método no permitido" });
}
