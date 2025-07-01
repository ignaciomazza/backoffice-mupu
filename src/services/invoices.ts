// src/services/invoices.ts
import prisma from "@/lib/prisma";
import { createVoucherService } from "@/services/afip/createVoucherService";
import type { Invoice, InvoiceItem, Prisma } from "@prisma/client";

export type InvoiceWithItems = Invoice & { InvoiceItem: InvoiceItem[] };

type RawVoucherDetails = Prisma.JsonObject;

export async function listInvoices(
  bookingId: number,
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
  data: InvoiceRequestBody,
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

  const booking = await prisma.booking.findUnique({
    where: { id_booking: bookingId },
    include: { agency: true },
  });
  if (!booking) return { success: false, message: "Reserva no encontrada." };

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

  const numClients = clientIds.length;
  const splitDetails: ServiceDetail[] = serviceDetails.map((s) => ({
    ...s,
    sale_price: parseFloat((s.sale_price / numClients).toFixed(2)),
    taxableBase21: parseFloat((s.taxableBase21 / numClients).toFixed(2)),
    commission21: parseFloat((s.commission21 / numClients).toFixed(2)),
    tax_21: parseFloat((s.tax_21 / numClients).toFixed(2)),
    vatOnCommission21: parseFloat(
      (s.vatOnCommission21 / numClients).toFixed(2),
    ),
    taxableBase10_5: parseFloat(
      ((s.taxableBase10_5 ?? 0) / numClients).toFixed(2),
    ),
    commission10_5: parseFloat(
      ((s.commission10_5 ?? 0) / numClients).toFixed(2),
    ),
    tax_105: parseFloat(((s.tax_105 ?? 0) / numClients).toFixed(2)),
    vatOnCommission10_5: parseFloat(
      ((s.vatOnCommission10_5 ?? 0) / numClients).toFixed(2),
    ),
    taxableCardInterest: parseFloat(
      ((s.taxableCardInterest ?? 0) / numClients).toFixed(2),
    ),
    vatOnCardInterest: parseFloat(
      ((s.vatOnCardInterest ?? 0) / numClients).toFixed(2),
    ),
    nonComputable: parseFloat(((s.nonComputable ?? 0) / numClients).toFixed(2)),
  }));

  const grouped: Record<string, ServiceDetail[]> = {};
  splitDetails.forEach((svc) => {
    const cur = svc.currency.toUpperCase();
    grouped[cur] = grouped[cur] ?? [];
    grouped[cur].push(svc);
  });
  const mapCurrency = (m: string) =>
    m === "ARS" ? "PES" : m === "USD" ? "DOL" : m;

  const invoicesResult: InvoiceWithItems[] = [];

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

      const details = resp.details as RawVoucherDetails;
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
              client.company_name || `${client.first_name} ${client.last_name}`,
            payloadAfip,
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
            }),
          ),
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
