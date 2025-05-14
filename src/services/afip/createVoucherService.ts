import afip from "@/services/afip/afipConfig";
import qrcode from "qrcode";
import generateHtml from "@/services/afip/generateHtml";

interface VoucherResponse {
  success: boolean;
  message: string;
  details?: unknown;
  qrBase64?: string;
  facturaHtml?: string;
}

interface IVAEntry {
  Id: number;
  BaseImp: number;
  Importe: number;
}

interface TaxImpuesto {
  idImpuesto: number;
  [key: string]: any;
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
      if (rate) {
        console.info(`[createVoucherService] Got rate ${rate}`);
        return rate;
      }
    } catch (err) {
      console.warn(
        `[createVoucherService] Cotización not available for ${formatted}, retrying…`,
        err,
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
  serviceDetails: {
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
  }[],
  currency: string,
  description21List: string[],
  description10_5List: string[],
  descriptionNonCompList: string[],
  exchangeRateManual?: number,
  recipient?: string,
  emitterName?: string,
  emitterLegalName?: string,
  emitterTaxId?: string,
  emitterAddress?: string,
  departureDate?: string,
  returnDate?: string,
): Promise<VoucherResponse> {
  try {
    console.info(
      `📤 Starting AFIP billing for receptor ${receptorDocNumber} (tipo ${receptorDocTipo})`,
    );

    // 1) Calcular totales
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
    console.info(
      `saleTotal: ${saleTotal}, interestBase: ${interestBase}, interestVat: ${interestVat}, adjustedTotal: ${adjustedTotal}`,
    );

    // 2) Construir entries de IVA
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
    if (base21 > 0 || imp21 > 0) ivaEntries.push(serviceIvaEntry);
    if (base10_5 > 0 || imp10_5 > 0)
      ivaEntries.push({
        Id: 4,
        BaseImp: +base10_5.toFixed(2),
        Importe: +imp10_5.toFixed(2),
      });
    if (interestBase > 0 || interestVat > 0) ivaEntries.push(interestIvaEntry);

    // 3) Merge IVA entries
    const mergedIvaEntries: IVAEntry[] = Object.values(
      ivaEntries.reduce((acc: Record<number, IVAEntry>, cur: IVAEntry) => {
        if (!acc[cur.Id]) acc[cur.Id] = { ...cur };
        else {
          acc[cur.Id].BaseImp += cur.BaseImp;
          acc[cur.Id].Importe += cur.Importe;
        }
        return acc;
      }, {}),
    );

    const rawTotalIVA = mergedIvaEntries.reduce((sum, e) => sum + e.Importe, 0);
    const totalIVA = parseFloat(rawTotalIVA.toFixed(2));
    const neto = parseFloat((adjustedTotal - totalIVA).toFixed(2));
    const totalBase = mergedIvaEntries.reduce((sum, e) => sum + e.BaseImp, 0);
    if (Math.abs(neto - totalBase) > 0.01) {
      const resto = parseFloat((neto - totalBase).toFixed(2));
      mergedIvaEntries.push({ Id: 3, BaseImp: resto, Importe: 0 });
    }

    // 4) Obtener punto de venta y siguiente comprobante
    console.info("Checking AFIP servers status");
    const status = await afip.ElectronicBilling.getServerStatus();
    if (
      status.AppServer !== "OK" ||
      status.DbServer !== "OK" ||
      status.AuthServer !== "OK"
    ) {
      throw new Error("AFIP no disponible (App/DB/Auth).");
    }

    let ptoVta = 1;
    try {
      const pts = await afip.ElectronicBilling.getSalesPoints();
      if (pts.length) ptoVta = pts[0].Nro;
    } catch {}

    console.info("Getting next voucher number");
    const last = await afip.ElectronicBilling.getLastVoucher(
      ptoVta,
      tipoFactura,
    );
    const next = last + 1;
    const info = await afip.ElectronicBilling.getVoucherInfo(
      last,
      ptoVta,
      tipoFactura,
    );
    const lastDate = info ? parseInt(info.CbteFch, 10) : null;
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const cbteFch =
      lastDate && Number(todayStr) < lastDate ? lastDate : Number(todayStr);

    // 5) Asignar condición IVA automáticamente
    // Si es Factura B (tipo 6) => Consumidor Final (5), si es Factura A (tipo 1) => Responsable Inscripto (1)
    const condId = tipoFactura === 6 ? 5 : 1;
    console.info("Auto CondicionIVAReceptorId:", condId);

    // Validación: no permitir Factura A si tipoFactura no es 1
    if (tipoFactura === 1 && condId !== 1) {
      return {
        success: false,
        message: "Tipo de factura no válido para la condición IVA automática",
      };
    }

    // 6) Obtener cotizaciónón
    const cotiz =
      currency === "PES"
        ? 1
        : (exchangeRateManual ??
          (await getValidExchangeRate(
            currency,
            new Date(Date.now() - 86400000),
          )));

    // 7) Armar payload y emitir
    const voucherData = {
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
      Iva: mergedIvaEntries,
      CondicionIVAReceptorId: condId,
    };
    console.info("Emitting voucher:", voucherData);

    const created = await afip.ElectronicBilling.createVoucher(voucherData);
    if (!created.CAE) {
      return { success: false, message: "CAE no devuelto por AFIP" };
    }

    // 8) Generar QR y HTML
    const qrPayload = {
      ver: 1,
      fecha: todayStr,
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
      `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(qrPayload)).toString("base64")}`,
    );
    const facturaHtml = generateHtml(
      {
        ...voucherData,
        ...created,
        saleTotal,
        serviceIvaEntry,
        interestBase,
        interestVat,
        interestIvaEntry,
        recipient,
        emitterName,
        emitterLegalName,
        emitterTaxId,
        emitterAddress,
        departureDate,
        returnDate,
        description21: description21List,
        description10_5: description10_5List,
        descriptionNonComputable: descriptionNonCompList,
      },
      qrBase64,
    );

    return {
      success: true,
      message: "Factura creada exitosamente.",
      details: { ...voucherData, ...created },
      qrBase64,
      facturaHtml,
    };
  } catch (err: unknown) {
    console.error("[createVoucherService] Error:", err);
    return { success: false, message: (err as Error).message };
  }
}
