// src/services/afip/createVoucherService.ts

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

// Para el desglose de IVA
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

/**
 * Crea un comprobante en AFIP (Factura A o B), sumando automáticamente
 * el interés al IVA y al total, mergeando las entradas de IVA por alícuota,
 * y exponiendo por separado los totales de servicio e intereses para el HTML.
 */
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
      `[createVoucherService] 📤 Starting AFIP billing for receptor ${receptorDocNumber} (tipo ${receptorDocTipo})`,
    );

    // 1) Sumar precios de venta + intereses
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
      `[createVoucherService] saleTotal: ${saleTotal}, interestBase: ${interestBase}, interestVat: ${interestVat}, adjustedTotal: ${adjustedTotal}`,
    );

    // 2) Calcular base e IVA por alícuota (solo servicios)
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
    console.info("[createVoucherService] serviceIvaEntry:", serviceIvaEntry);
    console.info("[createVoucherService] interestIvaEntry:", interestIvaEntry);

    // 3) Construir array de IVA para AFIP
    const ivaEntries: IVAEntry[] = [];
    if (base21 > 0 || imp21 > 0) ivaEntries.push(serviceIvaEntry);
    if (base10_5 > 0 || imp10_5 > 0) {
      ivaEntries.push({
        Id: 4,
        BaseImp: +base10_5.toFixed(2),
        Importe: +imp10_5.toFixed(2),
      });
    }
    if (interestBase > 0 || interestVat > 0) ivaEntries.push(interestIvaEntry);
    console.info("[createVoucherService] initial ivaEntries:", ivaEntries);

    // 4) Merge IVA entries por Id
    const mergedIvaEntries: IVAEntry[] = Object.values(
      ivaEntries.reduce(
        (acc, cur) => {
          if (!acc[cur.Id]) acc[cur.Id] = { ...cur };
          else {
            acc[cur.Id].BaseImp = parseFloat(
              (acc[cur.Id].BaseImp + cur.BaseImp).toFixed(2),
            );
            acc[cur.Id].Importe = parseFloat(
              (acc[cur.Id].Importe + cur.Importe).toFixed(2),
            );
          }
          return acc;
        },
        {} as Record<number, IVAEntry>,
      ),
    );
    console.info("[createVoucherService] mergedIvaEntries:", mergedIvaEntries);

    // 5) Ajuste de IVA 0% si falta
    const rawTotalIVA = mergedIvaEntries.reduce((sum, e) => sum + e.Importe, 0);
    const totalIVA = parseFloat(rawTotalIVA.toFixed(2));
    const neto = parseFloat((adjustedTotal - totalIVA).toFixed(2));
    const totalBase = mergedIvaEntries.reduce((sum, e) => sum + e.BaseImp, 0);
    if (Math.abs(neto - totalBase) > 0.01) {
      const resto = parseFloat((neto - totalBase).toFixed(2));
      mergedIvaEntries.push({ Id: 3, BaseImp: resto, Importe: 0 });
      console.info(`[createVoucherService] Added IVA 0%: BaseImp=${resto}`);
    }

    // Ajustes TEST vs PROD
    const isTesting = process.env.AFIP_ENV === "testing";
    let cuitEmisor = parseInt(process.env.AGENCY_CUIT || "0", 10);
    if (isTesting) {
      console.warn(
        "[createVoucherService] Testing mode: overriding CUITs & tipos",
      );
      const TEST_A = 33693450239,
        TEST_B = 30558515305,
        TEST_R = 30202020204;
      receptorDocNumber = TEST_R.toString();
      receptorDocTipo = 96;
      cuitEmisor = tipoFactura === 1 ? TEST_A : TEST_B;
      if (tipoFactura === 1) {
        console.warn(
          "[createVoucherService] Factura A inválida en TEST, cambiando a B",
        );
        tipoFactura = 6;
      }
    }

    // 6) Verificar estado AFIP
    console.info("[createVoucherService] Checking AFIP servers status");
    const status = await afip.ElectronicBilling.getServerStatus();
    console.info("[createVoucherService] AFIP status:", status);
    if (
      status.AppServer !== "OK" ||
      status.DbServer !== "OK" ||
      status.AuthServer !== "OK"
    ) {
      throw new Error("AFIP no disponible (App/DB/Auth).");
    }

    // 7) Obtener puntos de venta
    let ptoVta = 1;
    try {
      console.info("[createVoucherService] Fetching sales points");
      const pts = await afip.ElectronicBilling.getSalesPoints();
      if (pts.length) ptoVta = pts[0].Nro;
    } catch (err) {
      console.warn(
        `[createVoucherService] Couldn't fetch sales points: ${(err as Error).message}`,
      );
    }

    // 8) Último comprobante
    console.info("[createVoucherService] Getting last voucher number");
    const last = await afip.ElectronicBilling.getLastVoucher(
      ptoVta,
      tipoFactura,
    );
    const next = last + 1;
    console.info("[createVoucherService] Next voucher number:", next);

    // Fecha
    const info = await afip.ElectronicBilling.getVoucherInfo(
      last,
      ptoVta,
      tipoFactura,
    );
    const lastDate = info ? parseInt(info.CbteFch, 10) : null;
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const cbteFch =
      lastDate && Number(todayStr) < lastDate ? lastDate : Number(todayStr);
    console.info("[createVoucherService] Voucher date:", cbteFch);

    // Condición IVA receptor
    let condIVA = "Consumidor Final";
    try {
      console.info("[createVoucherService] Fetching receptor IVA condition");
      const d = await afip.RegisterInscriptionProof.getTaxpayerDetails(
        Number(receptorDocNumber),
      );
      condIVA = d.CondicionIVA ?? condIVA;
    } catch {
      console.warn(
        "[createVoucherService] No se pudo obtener Cond.IVA, usando Consumidor Final",
      );
    }
    const condMap: Record<string, number> = {
      "Responsable Inscripto": 1,
      Monotributista: 6,
      Exento: 4,
      "No Responsable": 3,
      "Consumidor Final": 5,
    };
    let condId = condMap[condIVA] ?? 5;
    if (tipoFactura === 1 && condId !== 1) {
      console.warn("[createVoucherService] Cliente no RI → Factura A pasa a B");
      tipoFactura = 6;
      condId = 5;
    }
    console.info("[createVoucherService] condId:", condId);

    // 9) Cotización
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    const cotiz =
      currency === "PES"
        ? 1
        : (exchangeRateManual ?? (await getValidExchangeRate(currency, ayer)));
    console.info("[createVoucherService] Exchange rate:", cotiz);

    // 10) Payload para AFIP
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
    console.info("[createVoucherService] Payload for AFIP:", voucherData);

    // 11) Crear comprobante
    console.info("[createVoucherService] Sending createVoucher request");
    const created = await afip.ElectronicBilling.createVoucher(voucherData);
    if (!created.CAE) {
      console.error("[createVoucherService] No CAE returned");
      return { success: false, message: "CAE no devuelto por AFIP" };
    }
    console.info("[createVoucherService] AFIP response:", created);

    // 12) Generar QR
    const qrPayload = {
      ver: 1,
      fecha: todayStr,
      cuit: cuitEmisor,
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
    console.info("[createVoucherService] QR generated");

    // 13) Preparar HTML
    console.info("[createVoucherService] FullVoucherData for HTML:", {
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
      description21List,
      description10_5List,
      descriptionNonCompList,
    });
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

    console.info("[createVoucherService] HTML generated");
    return {
      success: true,
      message: "Factura creada exitosamente.",
      details: { ...voucherData, ...created },
      qrBase64,
      facturaHtml,
    };
  } catch (err: unknown) {
    console.error("[createVoucherService] Error:", err);
    return {
      success: false,
      message: (err as Error).message,
    };
  }
}
