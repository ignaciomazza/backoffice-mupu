// src/services/afip/createVoucherService.ts
import type { NextApiRequest } from "next";
import prisma from "@/lib/prisma";
import {
  getAfipFromRequest,
  type AfipClient,
} from "@/services/afip/afipConfig";
import qrcode from "qrcode";
import { Prisma } from "@prisma/client";

/** ---------------- Tipos ---------------- */
interface VoucherResponse {
  success: boolean;
  message: string;
  details?: Prisma.JsonObject;
  qrBase64?: string;
}

interface IVAEntry {
  Id: number;
  BaseImp: number;
  Importe: number;
}

type ServerStatus = { AppServer: string; DbServer: string; AuthServer: string };
type SalesPoint = { Nro: number };
type LastInfo = { CbteFch?: string | number } | null;

/** -------------- Helpers de contexto (AFIP + CUIT) -------------- */
function parseCUIT(raw?: string | null): number {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

async function resolveAgencyCUITFromRequest(
  req: NextApiRequest,
): Promise<number> {
  const userIdHeader = req.headers["x-user-id"];
  const uid =
    typeof userIdHeader === "string"
      ? parseInt(userIdHeader, 10)
      : Array.isArray(userIdHeader)
        ? parseInt(userIdHeader[0] ?? "", 10)
        : NaN;

  if (!Number.isNaN(uid) && uid > 0) {
    // Buscamos la agencia del usuario y su CUIT (tax_id)
    const user = await prisma.user.findUnique({
      where: { id_user: uid },
      select: { id_agency: true },
    });

    if (user?.id_agency) {
      const agency = await prisma.agency.findUnique({
        where: { id_agency: user.id_agency },
        select: { tax_id: true },
      });
      const cuit = parseCUIT(agency?.tax_id);
      if (cuit) return cuit;
    }
  }

  // Sin fallback a .env: si no hay CUIT, cortamos acá.
  throw new Error("No se pudo resolver el CUIT de la agencia del usuario.");
}

/** -------------- Cotización con AFIP (últimos 5 días hábiles) -------------- */
function isWeekend(date: Date): boolean {
  const d = date.getDay();
  return d === 0 || d === 6;
}

async function getValidExchangeRate(
  client: AfipClient,
  currency: string,
  startDate: Date,
): Promise<number> {
  const date = new Date(startDate);
  for (let i = 0; i < 5; i++) {
    if (isWeekend(date)) {
      date.setDate(date.getDate() - 1);
      continue;
    }
    const formatted = date.toISOString().slice(0, 10).replace(/-/g, "");
    try {
      const resp = await client.ElectronicBilling.executeRequest(
        "FEParamGetCotizacion",
        { MonId: currency, FchCotiz: formatted },
      );
      const rateStr = resp?.ResultGet?.MonCotiz;
      const rate = rateStr ? parseFloat(rateStr) : NaN;
      if (!Number.isNaN(rate) && rate > 0) return rate;
    } catch {
      // intento siguiente día
    }
    date.setDate(date.getDate() - 1);
  }

  if (process.env.AFIP_ENV === "testing") {
    console.warn("[createVoucherService] Testing mode: defaulting rate to 1");
    return 1;
  }
  throw new Error("No se pudo obtener cotización");
}

/** -------------- Servicio principal -------------- */
export async function createVoucherService(
  req: NextApiRequest, // necesitamos el request para detectar la agencia del usuario
  tipoFactura: number,
  receptorDocNumber: string,
  receptorDocTipo: number,
  serviceDetails: Array<{
    sale_price: number;
    taxableBase21: number;
    commission21: number;
    tax_21: number;
    vatOnCommission21: number;
    taxableBase10_5?: number | null;
    commission10_5?: number | null;
    tax_105?: number | null;
    vatOnCommission10_5?: number | null;
    taxableCardInterest?: number | null;
    vatOnCardInterest?: number | null;
    return_date: Date;
    departure_date: Date;
  }>,
  currency: string,
  exchangeRateManual?: number,
  invoiceDate?: string,
): Promise<VoucherResponse> {
  try {
    // 1) Resolver AFIP según la agencia del usuario + CUIT real de esa agencia
    const afipClient = await getAfipFromRequest(req);
    const agencyCUIT = await resolveAgencyCUITFromRequest(req);

    // 2) Totales
    const saleTotal = serviceDetails.reduce((sum, s) => sum + s.sale_price, 0);
    const interestBase = serviceDetails.reduce(
      (sum, s) => sum + (s.taxableCardInterest ?? 0),
      0,
    );
    const interestVat = serviceDetails.reduce(
      (sum, s) => sum + (s.vatOnCardInterest ?? 0),
      0,
    );
    const adjustedTotal = parseFloat(
      (saleTotal + interestBase + interestVat).toFixed(2),
    );

    // 3) IVA
    const base21 = serviceDetails.reduce(
      (sum, s) => sum + s.taxableBase21 + s.commission21,
      0,
    );
    const imp21 = serviceDetails.reduce(
      (sum, s) => sum + s.tax_21 + s.vatOnCommission21,
      0,
    );
    const base10_5 = serviceDetails.reduce(
      (sum, s) => sum + (s.taxableBase10_5 ?? 0) + (s.commission10_5 ?? 0),
      0,
    );
    const imp10_5 = serviceDetails.reduce(
      (sum, s) => sum + (s.tax_105 ?? 0) + (s.vatOnCommission10_5 ?? 0),
      0,
    );

    const ivaEntries: IVAEntry[] = [];
    if (base21 || imp21)
      ivaEntries.push({
        Id: 5,
        BaseImp: +base21.toFixed(2),
        Importe: +imp21.toFixed(2),
      });
    if (base10_5 || imp10_5)
      ivaEntries.push({
        Id: 4,
        BaseImp: +base10_5.toFixed(2),
        Importe: +imp10_5.toFixed(2),
      });
    if (interestBase || interestVat)
      ivaEntries.push({
        Id: 5,
        BaseImp: +interestBase.toFixed(2),
        Importe: +interestVat.toFixed(2),
      });

    const mergedIvaEntries: IVAEntry[] = Object.values(
      ivaEntries.reduce(
        (acc, cur) => {
          if (!acc[cur.Id]) acc[cur.Id] = { ...cur };
          else {
            acc[cur.Id].BaseImp += cur.BaseImp;
            acc[cur.Id].Importe += cur.Importe;
          }
          return acc;
        },
        {} as Record<number, IVAEntry>,
      ),
    ).map((e) => ({
      Id: e.Id,
      BaseImp: parseFloat(e.BaseImp.toFixed(2)),
      Importe: parseFloat(e.Importe.toFixed(2)),
    }));

    const totalIVA = parseFloat(
      mergedIvaEntries.reduce((sum, e) => sum + e.Importe, 0).toFixed(2),
    );
    const neto = parseFloat((adjustedTotal - totalIVA).toFixed(2));
    const totalBase = mergedIvaEntries.reduce((sum, e) => sum + e.BaseImp, 0);
    if (Math.abs(neto - totalBase) > 0.01) {
      mergedIvaEntries.push({
        Id: 3,
        BaseImp: parseFloat((neto - totalBase).toFixed(2)),
        Importe: 0,
      });
    }

    // 4) Estado AFIP / pto. de venta / numeración
    const status =
      (await afipClient.ElectronicBilling.getServerStatus()) as ServerStatus;
    if (
      status.AppServer !== "OK" ||
      status.DbServer !== "OK" ||
      status.AuthServer !== "OK"
    ) {
      throw new Error("AFIP no disponible");
    }

    const pts = (await afipClient.ElectronicBilling.getSalesPoints().catch(
      () => [],
    )) as SalesPoint[];
    const ptoVta = pts.length ? pts[0].Nro : 1;

    const lastVoucherNumber = await afipClient.ElectronicBilling.getLastVoucher(
      ptoVta,
      tipoFactura,
    );
    const next = lastVoucherNumber + 1;

    const lastInfo = (await afipClient.ElectronicBilling.getVoucherInfo(
      lastVoucherNumber,
      ptoVta,
      tipoFactura,
    )) as LastInfo;
    const lastDate = lastInfo ? parseInt(String(lastInfo.CbteFch), 10) : null;

    // 5) Fechas
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const todayStrFallback = `${yyyy}${mm}${dd}`;

    const cbteFch = invoiceDate
      ? parseInt(invoiceDate.replace(/-/g, ""), 10)
      : lastDate && Number(todayStrFallback) < lastDate
        ? lastDate
        : Number(todayStrFallback);

    const condId = tipoFactura === 6 ? 5 : 1;

    const cotiz =
      currency === "PES"
        ? 1
        : (exchangeRateManual ??
          (await getValidExchangeRate(
            afipClient,
            currency,
            new Date(Date.now() - 86400000),
          )));

    const fmt = (d: Date) =>
      parseInt(d.toISOString().slice(0, 10).replace(/-/g, ""), 10);
    const allFrom = serviceDetails.map((s) => fmt(s.departure_date));
    const allTo = serviceDetails.map((s) => fmt(s.return_date));
    const FchServDesde = Math.min(...allFrom);
    const FchServHasta = Math.max(...allTo);
    const FchVtoPago = cbteFch;

    // 6) Envío a AFIP
    const voucherData: Prisma.JsonObject = {
      CantReg: 1,
      PtoVta: ptoVta,
      CbteTipo: tipoFactura,
      Concepto: 2,
      DocTipo: receptorDocTipo,
      DocNro: Number(receptorDocNumber),
      CbteDesde: next,
      CbteHasta: next,
      CbteFch: cbteFch,
      FchServDesde,
      FchServHasta,
      FchVtoPago,
      ImpTotal: adjustedTotal,
      ImpTotConc: 0,
      ImpNeto: neto,
      ImpIVA: totalIVA,
      MonId: currency,
      MonCotiz: cotiz,
      Iva: mergedIvaEntries as unknown as Prisma.JsonArray,
      CondicionIVAReceptorId: condId,
    };

    const created =
      await afipClient.ElectronicBilling.createVoucher(voucherData);
    if (!created.CAE) {
      return { success: false, message: "CAE no devuelto" };
    }

    // 7) QR con CUIT de la agencia del usuario (resuelto desde DB)
    const qrFecha = invoiceDate
      ? invoiceDate.replace(/-/g, "")
      : todayStrFallback;

    const qrPayload = {
      ver: 1,
      fecha: qrFecha,
      cuit: agencyCUIT, // <-- CUIT real de la agencia (sin .env)
      ptoVta,
      tipoCmp: tipoFactura,
      nroCmp: next,
      importe: adjustedTotal,
      moneda: currency,
      ctz: cotiz,
      tipoDocRec: receptorDocTipo,
      nroDocRec: Number(receptorDocNumber),
      tipoCodAut: "E",
      codAut: Number(created.CAE),
    };

    const qrBase64 = await qrcode.toDataURL(
      `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(
        JSON.stringify(qrPayload),
      ).toString("base64")}`,
    );

    return {
      success: true,
      message: "Factura creada exitosamente.",
      details: { ...voucherData, ...created } as Prisma.JsonObject,
      qrBase64,
    };
  } catch (err) {
    console.error("[createVoucherService] Error", err);
    return { success: false, message: (err as Error).message };
  }
}
