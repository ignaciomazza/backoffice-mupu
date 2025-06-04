// src/services/afip/createVoucherService.ts
import afip from "@/services/afip/afipConfig";
import qrcode from "qrcode";
import { Prisma } from "@prisma/client";

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

async function getValidExchangeRate(
  currency: string,
  startDate: Date,
): Promise<number> {
  const date = new Date(startDate);
  for (let i = 0; i < 5; i++) {
    const formatted = date.toISOString().slice(0, 10).replace(/-/g, "");
    try {
      console.info(
        `[createVoucherService] Fetching cotización for ${currency} on ${formatted}`,
      );
      const resp = await afip.ElectronicBilling.executeRequest(
        "FEParamGetCotizacion",
        { MonId: currency, FchCotiz: formatted },
      );
      const rate = parseFloat(resp.ResultGet.MonCotiz);
      if (rate) return rate;
    } catch {
      console.warn(
        `[createVoucherService] Cotización not available for ${formatted}, retrying…`,
      );
    }
    date.setDate(date.getDate() - 1);
  }
  if (process.env.AFIP_ENV === "testing") {
    console.warn("[createVoucherService] Testing mode: defaulting rate to 1");
    return 1;
  }
  throw new Error("No se pudo obtener cotización");
}

export async function createVoucherService(
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
  }>,
  currency: string,
  exchangeRateManual?: number,
  invoiceDate?: string,
): Promise<VoucherResponse> {
  try {
    console.info(
      `📤 AFIP billing for receptor ${receptorDocNumber} (tipo ${receptorDocTipo})`,
    );
    // Totales
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
    console.info(`Adjusted total: ${adjustedTotal}`);

    // Entradas de IVA
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
    const serviceIvaEntry: IVAEntry = {
      Id: 5,
      BaseImp: +base21.toFixed(2),
      Importe: +imp21.toFixed(2),
    };
    const interestIvaEntry: IVAEntry = {
      Id: 5,
      BaseImp: +interestBase.toFixed(2),
      Importe: +interestVat.toFixed(2),
    };
    const ivaEntries: IVAEntry[] = [];
    if (base21 || imp21) ivaEntries.push(serviceIvaEntry);
    if (base10_5 || imp10_5)
      ivaEntries.push({
        Id: 4,
        BaseImp: +base10_5.toFixed(2),
        Importe: +imp10_5.toFixed(2),
      });
    if (interestBase || interestVat) ivaEntries.push(interestIvaEntry);

    // Merge de entradas IVA por Id
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
    );
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

    // Estado de AFIP y punto de venta
    const status = await afip.ElectronicBilling.getServerStatus();
    if (
      status.AppServer !== "OK" ||
      status.DbServer !== "OK" ||
      status.AuthServer !== "OK"
    ) {
      throw new Error("AFIP no disponible");
    }
    const pts = await afip.ElectronicBilling.getSalesPoints().catch(() => []);
    const ptoVta = pts.length ? pts[0].Nro : 1;

    // Último comprobante y próximo número
    const lastVoucherNumber = await afip.ElectronicBilling.getLastVoucher(
      ptoVta,
      tipoFactura,
    );
    const next = lastVoucherNumber + 1;
    const lastInfo = await afip.ElectronicBilling.getVoucherInfo(
      lastVoucherNumber,
      ptoVta,
      tipoFactura,
    );
    const lastDate = lastInfo ? parseInt(lastInfo.CbteFch, 10) : null;

    // Determinar cbteFch (YYYYMMDD)
    let cbteFch: number;
    // Precalcular “hoy” en formato YYYYMMDD
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const todayStrFallback = `${yyyy}${mm}${dd}`;

    if (invoiceDate) {
      // Si el front envía invoiceDate en “YYYY-MM-DD”, convertir a “YYYYMMDD”
      cbteFch = parseInt(invoiceDate.replace(/-/g, ""), 10);
    } else {
      // Si no vino invoiceDate, usar la lógica previa: si lastDate > hoy, usar lastDate; sino usar hoy.
      cbteFch =
        lastDate && Number(todayStrFallback) < lastDate
          ? lastDate
          : Number(todayStrFallback);
    }

    // Condición de IVA del receptor
    const condId = tipoFactura === 6 ? 5 : 1;

    // Cotización de moneda
    const cotiz =
      currency === "PES"
        ? 1
        : (exchangeRateManual ??
          (await getValidExchangeRate(
            currency,
            new Date(Date.now() - 86400000),
          )));

    // Construir payload para AFIP
    const voucherData: Prisma.JsonObject = {
      CantReg: 1,
      PtoVta: ptoVta,
      CbteTipo: tipoFactura,
      Concepto: 1,
      DocTipo: receptorDocTipo,
      DocNro: Number(receptorDocNumber),
      CbteDesde: next,
      CbteHasta: next,
      CbteFch: cbteFch,
      ImpTotal: adjustedTotal,
      ImpTotConc: 0,
      ImpNeto: neto,
      ImpIVA: totalIVA,
      MonId: currency,
      MonCotiz: cotiz,
      Iva: mergedIvaEntries as unknown as Prisma.JsonArray,
      CondicionIVAReceptorId: condId,
    };
    console.info("Emitting voucher", voucherData);

    const created = await afip.ElectronicBilling.createVoucher(voucherData);
    if (!created.CAE) {
      return { success: false, message: "CAE no devuelto" };
    }

    // Generar campo “fecha” para el QR: usar invoiceDate o todayStrFallback
    const qrFecha = invoiceDate
      ? invoiceDate.replace(/-/g, "")
      : todayStrFallback;

    // Generar QR Base64
    const qrPayload = {
      ver: 1,
      fecha: qrFecha,
      cuit: parseInt(process.env.AGENCY_CUIT || "0", 10),
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
