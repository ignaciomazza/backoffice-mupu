// src/services/creditNotes.ts
import prisma from "@/lib/prisma";
import { createCreditNoteVoucher } from "@/services/afip/creditNoteService";
import type { Prisma, CreditNote, CreditNoteItem } from "@prisma/client";

export type CreditNoteWithItems = CreditNote & { items: CreditNoteItem[] };

interface CreditNoteRequest {
  invoiceId: number;
  tipoNota: 3 | 8;
  exchangeRate?: number;
  invoiceDate?: string;
}

interface CreateCreditNoteResult {
  success: boolean;
  message?: string;
  creditNote?: CreditNote;
  items?: CreditNoteItem[];
}

export async function listCreditNotes(
  invoiceId: number,
): Promise<CreditNoteWithItems[]> {
  return prisma.creditNote.findMany({
    where: { invoiceId },
    include: { items: true },
  });
}

export async function createCreditNote(
  data: CreditNoteRequest,
): Promise<CreateCreditNoteResult> {
  const { invoiceId, tipoNota, exchangeRate, invoiceDate } = data;

  // 1) Obtener factura original (scalar fields + relaciones)
  const orig = await prisma.invoice.findUnique({
    where: { id_invoice: invoiceId },
    include: {
      client: true,
      InvoiceItem: true,
    },
  });
  if (!orig || orig.payloadAfip == null) {
    return {
      success: false,
      message: "Factura original no encontrada o sin datos AFIP",
    };
  }

  // 2) Extraer datos AFIP para asociar comprobante
  const payload = orig.payloadAfip as Prisma.JsonObject;
  const voucherData = (payload.voucherData || payload) as Prisma.JsonObject;
  const ivaLines =
    (voucherData.Iva as Array<{
      Id: number;
      BaseImp: number;
      Importe: number;
    }>) || [];

  const originalPtoVta = voucherData.PtoVta as number;
  const originalCbteTipo = voucherData.CbteTipo as number;
  const originalCbteDesde = voucherData.CbteDesde as number;
  const cbtesAsoc = [
    { Tipo: originalCbteTipo, PtoVta: originalPtoVta, Nro: originalCbteDesde },
  ];

  // 3) Extraer descripciones de cada alícuota
  const desc21 = (payload.description21 as string[]) || [];
  const desc10 = (payload.description10_5 as string[]) || [];
  const desc0 = (payload.descriptionNonComputable as string[]) || [];

  // 4) Mapear cada línea de IVA a nuestro ServiceDetail
  type ServiceDetail = {
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
    nonComputable: number;
    currency: string;
    description: string;
  };

  const serviceDetails: ServiceDetail[] = ivaLines.map((iva) => {
    const base = iva.BaseImp;
    const tax = iva.Importe;
    // identificar tipo
    const is21 = iva.Id === 5;
    const is10 = iva.Id === 4;
    const is0 = iva.Id === 3;

    const description = is21
      ? desc21[0] || "IVA 21%"
      : is10
        ? desc10[0] || "IVA 10.5%"
        : desc0[0] || "Exento";

    return {
      sale_price: base + tax,
      taxableBase21: is21 ? base : 0,
      commission21: 0,
      tax_21: is21 ? tax : 0,
      vatOnCommission21: 0,
      taxableBase10_5: is10 ? base : 0,
      commission10_5: 0,
      tax_105: is10 ? tax : 0,
      vatOnCommission10_5: 0,
      taxableCardInterest: 0,
      vatOnCardInterest: 0,
      nonComputable: is0 ? base : 0,
      currency: orig.currency.toUpperCase(),
      description,
    };
  });

  // 5) Agrupar por moneda (normalmente solo una)
  const grouped: Record<string, ServiceDetail[]> = {};
  for (const svc of serviceDetails) {
    grouped[svc.currency] = grouped[svc.currency] || [];
    grouped[svc.currency].push(svc);
  }

  let createdNote: CreditNote | null = null;
  let createdItems: CreditNoteItem[] = [];

  // 6) Para cada grupo de moneda, emitir nota en AFIP y guardar
  for (const currency of Object.keys(grouped)) {
    const afipCurrency =
      currency === "ARS" ? "PES" : currency === "USD" ? "DOL" : currency;

    const resp = await createCreditNoteVoucher(
      tipoNota,
      String(voucherData.DocNro as number),
      voucherData.DocTipo as number,
      grouped[currency],
      afipCurrency,
      exchangeRate,
      invoiceDate,
      cbtesAsoc,
    );
    if (!resp.success || !resp.details) {
      return {
        success: false,
        message: resp.message ?? "Error al emitir nota de crédito en AFIP",
      };
    }

    const det = resp.details as Prisma.JsonObject;
    const qrBase64 = resp.qrBase64;

    // 7) Guardar en DB en una transacción
    const { note, items } = await prisma.$transaction(async (tx) => {
      const note = await tx.creditNote.create({
        data: {
          credit_number: String(det.CbteDesde as number),
          issue_date: new Date(),
          total_amount: det.ImpTotal as number,
          currency: afipCurrency,
          status: "Autorizada",
          type: tipoNota === 3 ? "Nota A" : "Nota B",
          recipient:
            orig.client.company_name ??
            `${orig.client.first_name} ${orig.client.last_name}`,
          payloadAfip: {
            ...det,
            qrBase64,
            CbtesAsoc: cbtesAsoc,
          } as Prisma.JsonObject,
          invoiceId,
        },
      });

      const items = await Promise.all(
        grouped[currency].map((svc) =>
          tx.creditNoteItem.create({
            data: {
              creditNoteId: note.id_credit_note,
              serviceId: null, // no hace falta enlazar un servicio concreto
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

      return { note, items };
    });

    createdNote = note;
    createdItems = items;
    break; // solo una moneda
  }

  if (!createdNote) {
    return { success: false, message: "No se generó ninguna nota de crédito" };
  }

  return {
    success: true,
    creditNote: createdNote,
    items: createdItems,
  };
}
