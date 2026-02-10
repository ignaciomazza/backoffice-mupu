// src/services/invoices.ts
import prisma from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import type { NextApiRequest } from "next";
import { createVoucherService } from "@/services/afip/createVoucherService";
import {
  buildInvoiceNumber,
  buildInvoiceNumberLegacy,
} from "@/utils/invoiceNumbers";
import {
  splitManualTotalsByShares,
  type ManualTotalsInput,
} from "@/services/afip/manualTotals";
import type { Invoice, InvoiceItem, Prisma } from "@prisma/client";

export type InvoiceWithItems = Invoice & { InvoiceItem: InvoiceItem[] };

type RawVoucherDetails = Prisma.JsonObject;

const isPrismaUniqueError = (err: unknown) => {
  if (typeof err !== "object" || err === null) return false;
  return (err as { code?: string }).code === "P2002";
};

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
  departure_date: Date;
  return_date: Date;
}

type CustomItemTaxCategory = "21" | "10_5" | "EXEMPT";

interface InvoiceCustomItem {
  description: string;
  taxCategory: CustomItemTaxCategory;
  amount?: number;
}

interface PaxDataInput {
  clientId: number;
  dni?: string;
  cuit?: string;
  persistLookup?: boolean;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  address?: string;
  locality?: string;
  postal_code?: string;
  commercial_address?: string;
}

interface InvoiceRequestBody {
  bookingId: number;
  services: number[];
  clientIds: number[];
  clientShares?: number[];
  tipoFactura: number;
  exchangeRate?: number;
  description21?: string[];
  description10_5?: string[];
  descriptionNonComputable?: string[];
  paxData?: PaxDataInput[];
  customItems?: InvoiceCustomItem[];
  invoiceDate?: string;
  manualTotals?: ManualTotalsInput;
}

interface CreateResult {
  success: boolean;
  message?: string;
  invoices?: InvoiceWithItems[];
}

const round2 = (value: number) => Number(value.toFixed(2));

const SERVICE_SPLIT_KEYS: Array<keyof ServiceDetail> = [
  "sale_price",
  "taxableBase21",
  "commission21",
  "tax_21",
  "vatOnCommission21",
  "taxableBase10_5",
  "commission10_5",
  "tax_105",
  "vatOnCommission10_5",
  "taxableCardInterest",
  "vatOnCardInterest",
  "nonComputable",
];

function normalizeShares(shares: number[]): number[] {
  if (!Array.isArray(shares) || shares.length === 0) return [1];
  const sanitized = shares.map((s) =>
    Number.isFinite(s) && s > 0 ? Number(s) : 0,
  );
  const sum = sanitized.reduce((acc, n) => acc + n, 0);
  if (sum <= 0) {
    const fallback = 1 / sanitized.length;
    return sanitized.map(() => fallback);
  }
  return sanitized.map((s) => s / sum);
}

function splitAmountByShares(value: number, shares: number[]): number[] {
  const normalized = normalizeShares(shares);
  if (normalized.length <= 1) return [round2(value)];
  const out = normalized.map((share) => round2(value * share));
  const sum = round2(out.reduce((acc, n) => acc + n, 0));
  const diff = round2(value - sum);
  if (Math.abs(diff) >= 0.01) {
    out[out.length - 1] = round2(out[out.length - 1] + diff);
  }
  return out;
}

function splitServiceDetailsByShares(
  source: ServiceDetail[],
  shares: number[],
): ServiceDetail[][] {
  const normalized = normalizeShares(shares);
  const out: ServiceDetail[][] = Array.from({ length: normalized.length }, () =>
    [],
  );

  source.forEach((svc) => {
    const chunksByKey = SERVICE_SPLIT_KEYS.reduce(
      (acc, key) => {
        acc[key] = splitAmountByShares(Number(svc[key] ?? 0), normalized);
        return acc;
      },
      {} as Record<keyof ServiceDetail, number[]>,
    );

    for (let idx = 0; idx < normalized.length; idx += 1) {
      const nextSvc: ServiceDetail = {
        ...svc,
        sale_price: chunksByKey.sale_price[idx] ?? 0,
        taxableBase21: chunksByKey.taxableBase21[idx] ?? 0,
        commission21: chunksByKey.commission21[idx] ?? 0,
        tax_21: chunksByKey.tax_21[idx] ?? 0,
        vatOnCommission21: chunksByKey.vatOnCommission21[idx] ?? 0,
        taxableBase10_5: chunksByKey.taxableBase10_5[idx] ?? 0,
        commission10_5: chunksByKey.commission10_5[idx] ?? 0,
        tax_105: chunksByKey.tax_105[idx] ?? 0,
        vatOnCommission10_5: chunksByKey.vatOnCommission10_5[idx] ?? 0,
        taxableCardInterest: chunksByKey.taxableCardInterest[idx] ?? 0,
        vatOnCardInterest: chunksByKey.vatOnCardInterest[idx] ?? 0,
        nonComputable: chunksByKey.nonComputable[idx] ?? 0,
      };
      out[idx].push(nextSvc);
    }
  });

  return out;
}

function splitCustomItemsByShares(
  items: InvoiceCustomItem[],
  shares: number[],
): InvoiceCustomItem[][] {
  const normalized = normalizeShares(shares);
  const out: InvoiceCustomItem[][] = Array.from(
    { length: normalized.length },
    () => [],
  );
  if (!items.length) return out;

  items.forEach((item) => {
    const cleanDescription = String(item.description ?? "").trim();
    if (!cleanDescription) return;

    const chunks =
      typeof item.amount === "number" && Number.isFinite(item.amount)
        ? splitAmountByShares(item.amount, normalized)
        : null;

    for (let idx = 0; idx < normalized.length; idx += 1) {
      const amount = chunks ? chunks[idx] : undefined;
      out[idx].push({
        description: cleanDescription,
        taxCategory: item.taxCategory,
        ...(typeof amount === "number" ? { amount } : {}),
      });
    }
  });

  return out;
}

function digits(value?: string | null): string {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeDni(value?: string | null): string | null {
  const d = digits(value);
  return d.length >= 7 && d.length <= 9 ? d : null;
}

function normalizeCuit(value?: string | null): string | null {
  const d = digits(value);
  return d.length === 11 ? d : null;
}

function displayRecipient(
  client: {
    first_name?: string | null;
    last_name?: string | null;
    company_name?: string | null;
  },
  pax?: PaxDataInput,
): string {
  const companyOverride = String(pax?.company_name ?? "").trim();
  if (companyOverride) return companyOverride;

  const company = String(client.company_name ?? "").trim();
  if (company) return company;

  const first = String(pax?.first_name ?? client.first_name ?? "").trim();
  const last = String(pax?.last_name ?? client.last_name ?? "").trim();
  const full = `${first} ${last}`.trim();
  return full || "Consumidor Final";
}

export async function createInvoices(
  req: NextApiRequest,
  data: InvoiceRequestBody,
): Promise<CreateResult> {
  const {
    bookingId,
    services,
    clientIds,
    clientShares,
    tipoFactura,
    exchangeRate,
    description21 = [],
    description10_5 = [],
    descriptionNonComputable = [],
    paxData = [],
    customItems = [],
    invoiceDate,
    manualTotals,
  } = data;

  if (!clientIds.length) {
    return { success: false, message: "Debe haber al menos un pax." };
  }

  const paxDataByClient = new Map<number, PaxDataInput>();
  paxData.forEach((p) => {
    if (!p?.clientId) return;
    paxDataByClient.set(p.clientId, p);
  });

  let shares: number[] = Array.from({ length: clientIds.length }, () => 1);
  if (Array.isArray(clientShares) && clientShares.length > 0) {
    if (clientShares.length !== clientIds.length) {
      return {
        success: false,
        message: "La distribución por pax no coincide con la cantidad de pax.",
      };
    }
    const hasInvalid = clientShares.some(
      (v) => !Number.isFinite(v) || Number(v) <= 0,
    );
    if (hasInvalid) {
      return {
        success: false,
        message: "La distribución por pax debe contener valores positivos.",
      };
    }
    shares = clientShares.map(Number);
  }
  shares = normalizeShares(shares);

  const booking = await prisma.booking.findUnique({
    where: { id_booking: bookingId },
    include: { agency: true },
  });
  if (!booking) return { success: false, message: "Reserva no encontrada." };

  const rawServices = await prisma.service.findMany({
    where: { id_service: { in: services } },
  });
  if (rawServices.length !== services.length) {
    return {
      success: false,
      message: "No se encontraron todos los servicios seleccionados.",
    };
  }
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
      departure_date: s.departure_date,
      return_date: s.return_date,
    };
  });

  const splitDetailsByClient = splitServiceDetailsByShares(serviceDetails, shares);
  const mapCurrency = (m: string) =>
    m === "ARS" ? "PES" : m === "USD" ? "DOL" : m;

  const currencies = new Set(
    serviceDetails.map((svc) => String(svc.currency || "").toUpperCase()),
  );

  if (manualTotals && currencies.size > 1) {
    return {
      success: false,
      message:
        "Importes manuales solo disponibles cuando todos los servicios están en la misma moneda.",
    };
  }

  const invoicesResult: InvoiceWithItems[] = [];
  const errorMessages = new Set<string>();

  const manualTotalsByClient = manualTotals
    ? splitManualTotalsByShares(manualTotals, shares)
    : undefined;
  const customItemsByClient = splitCustomItemsByShares(customItems, shares);

  for (let idx = 0; idx < clientIds.length; idx += 1) {
    const cid = clientIds[idx];
    let client = await prisma.client.findUnique({
      where: { id_client: cid },
    });
    if (!client) {
      errorMessages.add("No se encontró el pax seleccionado.");
      continue;
    }

    const pax = paxDataByClient.get(cid);
    const overrideDni = normalizeDni(pax?.dni);
    const overrideCuit = normalizeCuit(pax?.cuit);

    if (pax?.persistLookup) {
      const updateData: Prisma.ClientUpdateInput = {};
      const paxCompanyName = String(pax.company_name ?? "").trim();
      const paxFirstName = String(pax.first_name ?? "").trim();
      const paxLastName = String(pax.last_name ?? "").trim();
      const paxAddress = String(pax.address ?? "").trim();
      const paxLocality = String(pax.locality ?? "").trim();
      const paxPostalCode = String(pax.postal_code ?? "").trim();
      const paxCommercialAddress = String(pax.commercial_address ?? "").trim();

      if (overrideDni && !client.dni_number) updateData.dni_number = overrideDni;
      if (overrideCuit && !client.tax_id) updateData.tax_id = overrideCuit;
      if (paxCompanyName && !client.company_name) {
        updateData.company_name = paxCompanyName;
      }
      if (paxFirstName && !client.first_name) {
        updateData.first_name = paxFirstName;
      }
      if (paxLastName && !client.last_name) {
        updateData.last_name = paxLastName;
      }
      if (paxAddress && !client.address) {
        updateData.address = paxAddress;
      }
      if (paxLocality && !client.locality) {
        updateData.locality = paxLocality;
      }
      if (paxPostalCode && !client.postal_code) {
        updateData.postal_code = paxPostalCode;
      }
      if (paxCommercialAddress && !client.commercial_address) {
        updateData.commercial_address = paxCommercialAddress;
      }
      if (Object.keys(updateData).length) {
        client = await prisma.client.update({
          where: { id_client: cid },
          data: updateData,
        });
      }
    }

    const splitForClient = splitDetailsByClient[idx] ?? [];
    const grouped: Record<string, ServiceDetail[]> = {};
    splitForClient.forEach((svc) => {
      const cur = String(svc.currency || "").toUpperCase();
      grouped[cur] = grouped[cur] ?? [];
      grouped[cur].push(svc);
    });

    for (const m in grouped) {
      const svcs = grouped[m];
      const afipCurrency = mapCurrency(m);

      const isFactB = tipoFactura === 6;
      const docNumber = isFactB
        ? normalizeDni(client.dni_number) ?? overrideDni
        : normalizeCuit(client.tax_id) ?? overrideCuit;
      const docType = isFactB ? 96 : 80;
      if (!docNumber) {
        errorMessages.add(
          isFactB
            ? "Falta DNI del pax para emitir Factura B."
            : "Falta CUIT del pax para emitir Factura A.",
        );
        continue;
      }

      const resp = await createVoucherService(
        req,
        tipoFactura,
        docNumber,
        docType,
        svcs,
        afipCurrency,
        exchangeRate,
        invoiceDate,
        manualTotalsByClient ? manualTotalsByClient[idx] : undefined,
      );
      if (!resp.success || !resp.details) {
        errorMessages.add(
          resp.message || "No se pudo emitir la factura en AFIP.",
        );
        continue;
      }

      const details = resp.details as RawVoucherDetails;
      const ptoVta = Number(details.PtoVta ?? 0);
      const cbteTipo = Number(details.CbteTipo ?? tipoFactura);
      const rawNumber = details.CbteDesde?.toString() ?? "";
      const formattedNumber =
        buildInvoiceNumber(ptoVta, cbteTipo, rawNumber) || rawNumber;
      const legacyNumber = buildInvoiceNumberLegacy(ptoVta, rawNumber);

      if (rawNumber) {
        const duplicate = await prisma.invoice.findFirst({
          where: {
            id_agency: booking.id_agency,
            pto_vta: ptoVta,
            cbte_tipo: cbteTipo,
            OR: [
              { invoice_number: rawNumber },
              { invoice_number: legacyNumber },
              { invoice_number: formattedNumber },
            ],
          },
          select: { id_invoice: true, invoice_number: true },
        });
        if (duplicate) {
          errorMessages.add(
            "Ya existe una factura con el mismo número para ese punto de venta y tipo.",
          );
          continue;
        }
      }

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
        customItems: (customItemsByClient[idx] ?? []).map((item) => ({
          description: item.description,
          taxCategory: item.taxCategory,
          ...(typeof item.amount === "number" ? { amount: item.amount } : {}),
        })) as Prisma.JsonArray,
        distributionShare: shares[idx],
        ...(manualTotalsByClient
          ? { manualTotals: manualTotalsByClient[idx] }
          : {}),
        serviceDates: svcs.map((s) => ({
          id_service: s.id_service,
          from: s.departure_date.toISOString().slice(0, 10),
          to: s.return_date.toISOString().slice(0, 10),
        })),
      };

      let created: InvoiceWithItems | null = null;
      try {
        created = await prisma.$transaction(async (tx) => {
          const agencyInvoiceId = await getNextAgencyCounter(
            tx,
            booking.id_agency,
            "invoice",
          );
          const inv = await tx.invoice.create({
            data: {
              agency_invoice_id: agencyInvoiceId,
              id_agency: booking.id_agency,
              invoice_number: formattedNumber || rawNumber,
              pto_vta: ptoVta,
              cbte_tipo: cbteTipo,
              issue_date: new Date(),
              total_amount: details.ImpTotal as number,
              currency: afipCurrency,
              status: "Autorizada",
              type: tipoFactura === 1 ? "Factura A" : "Factura B",
              recipient: displayRecipient(client, pax),
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
      } catch (err) {
        if (isPrismaUniqueError(err)) {
          errorMessages.add(
            "La factura ya existe para ese punto de venta y tipo.",
          );
          continue;
        }
        throw err;
      }

      if (created) invoicesResult.push(created);
    }
  }

  if (!invoicesResult.length) {
    const firstError = Array.from(errorMessages).find(Boolean);
    return {
      success: false,
      message: firstError || "No se generó ninguna factura.",
    };
  }
  return { success: true, invoices: invoicesResult };
}
