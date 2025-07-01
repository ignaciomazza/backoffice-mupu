// src/services/afip/creditNoteService.ts
import afip from "@/services/afip/afipConfig";
import type { Prisma } from "@prisma/client";
import qrcode from "qrcode";

export interface IVAEntry {
  Id: number;
  BaseImp: number;
  Importe: number;
}

export interface ServiceDetail {
  sale_price: number;
  taxableBase21: number;
  commission21: number;
  tax_21: number;
  vatOnCommission21: number;
  taxableBase10_5?: number;
  commission10_5?: number;
  tax_105?: number;
  vatOnCommission10_5?: number;
  taxableCardInterest?: number;
  vatOnCardInterest?: number;
  nonComputable: number;
}

export interface CreditNoteVoucherResponse {
  success: boolean;
  message: string;
  details?: Prisma.JsonObject;
  qrBase64?: string;
}

async function getValidExchangeRate(
  currency: string,
  startDate: Date,
): Promise<number> {
  const date = new Date(startDate);
  for (let i = 0; i < 5; i++) {
    const formatted = date.toISOString().slice(0, 10).replace(/-/g, "");
    try {
      const resp = await afip.ElectronicBilling.executeRequest(
        "FEParamGetCotizacion",
        { MonId: currency, FchCotiz: formatted },
      );
      const rate = parseFloat(resp.ResultGet.MonCotiz);
      if (rate) return rate;
    } catch {}
    date.setDate(date.getDate() - 1);
  }
  if (process.env.AFIP_ENV === "testing") return 1;
  throw new Error("No se pudo obtener cotización");
}

export async function createCreditNoteVoucher(
  tipoNota: 3 | 8,
  receptorDocNumber: string,
  receptorDocTipo: number,
  serviceDetails: ServiceDetail[],
  currency: string,
  exchangeRateManual?: number,
  invoiceDate?: string,
  cbtesAsoc?: Array<{ Tipo: number; PtoVta: number; Nro: number }>,
): Promise<CreditNoteVoucherResponse> {
  try {
    // Totales y ajustes
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

    const base21 = serviceDetails.reduce(
      (sum, s) => sum + s.taxableBase21 + s.commission21,
      0,
    );
    const imp21 = serviceDetails.reduce(
      (sum, s) => sum + s.tax_21 + s.vatOnCommission21,
      0,
    );
    const base10 = serviceDetails.reduce(
      (sum, s) => sum + (s.taxableBase10_5 ?? 0) + (s.commission10_5 ?? 0),
      0,
    );
    const imp10 = serviceDetails.reduce(
      (sum, s) => sum + (s.tax_105 ?? 0) + (s.vatOnCommission10_5 ?? 0),
      0,
    );
    const exento = serviceDetails.reduce((sum, s) => sum + s.nonComputable, 0);

    // Armar líneas de IVA, ya redondeadas a 2 decimales
    const ivaEntries: IVAEntry[] = [];
    if (base21 || imp21)
      ivaEntries.push({
        Id: 5,
        BaseImp: +base21.toFixed(2),
        Importe: +imp21.toFixed(2),
      });
    if (base10 || imp10)
      ivaEntries.push({
        Id: 4,
        BaseImp: +base10.toFixed(2),
        Importe: +imp10.toFixed(2),
      });
    if (exento > 0) {
      ivaEntries.push({
        Id: 3,
        BaseImp: +exento.toFixed(2),
        Importe: 0,
      });
    }

    // Fusionar posibles entradas duplicadas
    const merged: Record<number, IVAEntry> = {};
    ivaEntries.forEach((e) => {
      if (!merged[e.Id]) merged[e.Id] = { ...e };
      else {
        merged[e.Id].BaseImp += e.BaseImp;
        merged[e.Id].Importe += e.Importe;
      }
    });
    const mergedIva = Object.values(merged).map((e) => ({
      Id: e.Id,
      BaseImp: parseFloat(e.BaseImp.toFixed(2)),
      Importe: parseFloat(e.Importe.toFixed(2)),
    }));

    // Calcular total IVA y neto
    const totalIVAraw = mergedIva.reduce((sum, e) => sum + e.Importe, 0);
    const totalIVA = parseFloat(totalIVAraw.toFixed(2)); // <- redondeo aquí
    const neto = parseFloat((adjustedTotal - totalIVA).toFixed(2));

    // Verificar estado de AFIP
    const status = await afip.ElectronicBilling.getServerStatus();
    if (
      status.AppServer !== "OK" ||
      status.DbServer !== "OK" ||
      status.AuthServer !== "OK"
    )
      throw new Error("AFIP no disponible");

    // Punto de venta y próximo número
    const pts = await afip.ElectronicBilling.getSalesPoints().catch(() => []);
    const ptoVta = pts.length ? pts[0].Nro : 1;
    const last = await afip.ElectronicBilling.getLastVoucher(ptoVta, tipoNota);
    const next = last + 1;
    const lastInfo = await afip.ElectronicBilling.getVoucherInfo(
      last,
      ptoVta,
      tipoNota,
    ).catch(() => null);
    const lastDate = lastInfo ? parseInt(lastInfo.CbteFch, 10) : null;

    // Fecha de comprobante
    const now = new Date();
    const todayStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(
      2,
      "0",
    )}${String(now.getDate()).padStart(2, "0")}`;
    const cbteFch = invoiceDate
      ? parseInt(invoiceDate.replace(/-/g, ""), 10)
      : lastDate && Number(todayStr) < lastDate
        ? lastDate
        : Number(todayStr);

    const condId = tipoNota === 8 ? 5 : 1;
    const cotiz =
      currency === "PES"
        ? 1
        : (exchangeRateManual ??
          (await getValidExchangeRate(
            currency,
            new Date(Date.now() - 86400000),
          )));

    // === Aquí armamos el payload exacto para AFIP ===
    const voucherData: Prisma.JsonObject = {
      CantReg: 1,
      PtoVta: ptoVta,
      CbteTipo: tipoNota,
      Concepto: 1,
      DocTipo: receptorDocTipo,
      DocNro: Number(receptorDocNumber),
      CbteDesde: next,
      CbteHasta: next,
      CbteFch: cbteFch,
      ...(cbtesAsoc ? { CbtesAsoc: cbtesAsoc } : {}),
      ImpTotal: adjustedTotal,
      ImpTotConc: 0,
      ImpNeto: neto,
      ImpIVA: totalIVA, // <- redondeado
      MonId: currency,
      MonCotiz: cotiz,
      Iva: mergedIva as unknown as Prisma.JsonArray,
      CondicionIVAReceptorId: condId,
    };
    console.info("Emitting voucher", voucherData);

    // Llamada a AFIP
    const created = await afip.ElectronicBilling.createVoucher(voucherData);
    if (!created.CAE) return { success: false, message: "CAE no devuelto" };

    // Generar QR
    const qrFecha = invoiceDate ? invoiceDate.replace(/-/g, "") : todayStr;
    const qrPayload = {
      ver: 1,
      fecha: qrFecha,
      cuit: parseInt(process.env.AGENCY_CUIT || "0", 10),
      ptoVta,
      tipoCmp: tipoNota,
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
      message: "Nota de Crédito generada exitosamente.",
      details: { ...voucherData, ...created } as Prisma.JsonObject,
      qrBase64,
    };
  } catch (err) {
    console.error("[createCreditNoteVoucher] Error", err);
    return { success: false, message: (err as Error).message };
  }
}
