// src/services/invoices.ts

import prisma from "@/lib/prisma";
import { createVoucherService } from "@/services/afip/createVoucherService";
import type { Invoice, InvoiceItem, Prisma } from "@prisma/client";

export type InvoiceWithItems = Invoice & { InvoiceItem: InvoiceItem[] };

// Ya no definimos RawVoucherDetails manualmente,
// usamos directamente JsonObject de Prisma:
type RawVoucherDetails = Prisma.JsonObject;

export async function listInvoices(
  bookingId: number
): Promise<InvoiceWithItems[]> {
  return prisma.invoice.findMany({
    where: { bookingId_booking: bookingId },
    include: { InvoiceItem: true },
  });
}

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
  bookingId: number;
  services: number[];
  clientIds: number[];
  tipoFactura: number;
  exchangeRate?: number;
  description21?: string[];
  description10_5?: string[];
  descriptionNonComputable?: string[];
  invoiceDate?: string;
}

interface CreateResult {
  success: boolean;
  message?: string;
  invoices?: InvoiceWithItems[];
}

export async function createInvoices(
  data: InvoiceRequestBody
): Promise<CreateResult> {
  const {
    bookingId,
    services,
    clientIds,
    tipoFactura,
    exchangeRate,
    description21 = [],
    description10_5 = [],
    descriptionNonComputable = [],
    invoiceDate,          
  } = data;

  // 1) Obtener reserva
  const booking = await prisma.booking.findUnique({
    where: { id_booking: bookingId },
    include: { agency: true },
  });
  if (!booking) return { success: false, message: "Reserva no encontrada." };

  // 2) Detalles de servicio
  const rawServices = await prisma.service.findMany({
    where: { id_service: { in: services } },
  });
  const serviceDetails: ServiceDetail[] = services.map((sid) => {
    const s = rawServices.find((r) => r.id_service === sid)!;
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

  // 3) Agrupar por moneda
  const grouped: Record<string, ServiceDetail[]> = {};
  serviceDetails.forEach((svc) => {
    const cur = svc.currency.toUpperCase();
    grouped[cur] = grouped[cur] ?? [];
    grouped[cur].push(svc);
  });
  const mapCurrency = (m: string) =>
    m === "ARS" ? "PES" : m === "USD" ? "DOL" : m;

  const invoicesResult: InvoiceWithItems[] = [];

  // 4) Por cada grupo y cliente, crear factura en transacción
  for (const m in grouped) {
    const svcs = grouped[m];
    const afipCurrency = mapCurrency(m);

    for (const cid of clientIds) {
      const client = await prisma.client.findUnique({
        where: { id_client: cid },
      });
      if (!client) continue;

      const isFactB = tipoFactura === 6;
      const docNumber = isFactB ? client.dni_number : client.tax_id;
      const docType = isFactB ? 96 : 80;
      if (!docNumber) continue;

      // 4.1) Llamada AFIP
      const resp = await createVoucherService(
        tipoFactura,
        docNumber!,
        docType,
        svcs,
        afipCurrency,
        exchangeRate,
        invoiceDate, 
      );
      if (!resp.success || !resp.details) continue;

      // Aquí hacemos el cast a Prisma.JsonObject
      const details = resp.details as RawVoucherDetails;

      // 4.2) Construir payloadAfip como JsonObject
      const payloadAfip: Prisma.JsonObject = {
        voucherData: details,
        afipResponse: {
          CAE: details.CAE as string,
          CAEFchVto: details.CAEFchVto as string,
        },
        qrBase64: resp.qrBase64!,
        description21,
        description10_5,
        descriptionNonComputable,
      };

      // 4.3) Transacción para crear invoice + items
      const created = await prisma.$transaction(async (tx) => {
        const inv = await tx.invoice.create({
          data: {
            invoice_number: details.CbteDesde!.toString(),
            issue_date: new Date(),
            total_amount: details.ImpTotal as number,
            currency: afipCurrency,
            status: "Autorizada",
            type: tipoFactura === 1 ? "Factura A" : "Factura B",
            recipient:
              client.company_name ||
              `${client.first_name} ${client.last_name}`,
            payloadAfip,               // ✅ ahora coincide con JsonObject
            bookingId_booking: bookingId,
            client_id: cid,
          },
        });

        await Promise.all(
          svcs.map((svc) =>
            tx.invoiceItem.create({
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
            })
          )
        );

        return tx.invoice.findUnique({
          where: { id_invoice: inv.id_invoice },
          include: { InvoiceItem: true },
        });
      });

      if (created) invoicesResult.push(created);
    }
  }

  if (!invoicesResult.length) {
    return { success: false, message: "No se generó ninguna factura." };
  }
  return { success: true, invoices: invoicesResult };
}
