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

// Función auxiliar para obtener la cotización válida retrocediendo hasta 5 días
async function getValidExchangeRate(
  currency: string,
  startDate: Date,
): Promise<number> {
  const date = new Date(startDate);
  for (let i = 0; i < 5; i++) {
    const formattedDate = date.toISOString().split("T")[0].replace(/-/g, "");
    try {
      console.log(
        `Consultando cotización para ${currency} en la fecha ${formattedDate}`,
      );
      const cotizacionResponse = await afip.ElectronicBilling.executeRequest(
        "FEParamGetCotizacion",
        {
          MonId: currency,
          FchCotiz: formattedDate,
        },
      );
      const rate = parseFloat(cotizacionResponse.ResultGet.MonCotiz);
      if (rate) {
        console.info(
          `Cotización oficial para ${currency} en ${formattedDate}: ${rate}`,
        );
        return rate;
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(`Error para la fecha ${formattedDate}: ${error.message}`);
      }
    }
    date.setDate(date.getDate() - 1);
  }
  if (process.env.AFIP_ENV === "testing") {
    console.warn(
      `No se pudo obtener la cotización en los últimos 5 días para ${currency}. Se usará un valor por defecto de 1.`,
    );
    return 1;
  }
  throw new Error("No se pudo obtener la cotización en los últimos 5 días.");
}

export async function createVoucherService(
  tipoFactura: number,
  cuitReceptor: string,
  totalAmount: number,
  currency: string,
  impIVAValue: number, // Nuevo parámetro: IVA total calculado externamente
  exchangeRateManual?: number,
): Promise<VoucherResponse> {
  try {
    console.info(`📤 Enviando datos a AFIP para CUIT: ${cuitReceptor}`);

    const isTesting = process.env.AFIP_ENV === "testing";
    const testingCuitEmisor = isTesting
      ? (() => {
          const TESTING_CUIT_EMISOR_FACTURA_A = 33693450239;
          const TESTING_CUIT_EMISOR_FACTURA_B = 30558515305;
          const TESTING_CUIT_RECEPTOR = 30202020204;
          cuitReceptor = TESTING_CUIT_RECEPTOR.toString();
          if (tipoFactura === 1) {
            console.warn(
              `⚠️ En ambiente de testing se asigna Factura B para Factura A.`,
            );
            tipoFactura = 6;
            return TESTING_CUIT_EMISOR_FACTURA_B;
          }
          return tipoFactura === 1
            ? TESTING_CUIT_EMISOR_FACTURA_A
            : TESTING_CUIT_EMISOR_FACTURA_B;
        })()
      : parseInt(process.env.AGENCY_CUIT || "0", 10);

    console.info("🔍 Consultando estado del servidor de AFIP...");
    const serverStatus = await afip.ElectronicBilling.getServerStatus();
    if (
      serverStatus.AppServer !== "OK" ||
      serverStatus.DbServer !== "OK" ||
      serverStatus.AuthServer !== "OK"
    ) {
      throw new Error("El servidor de AFIP no está disponible.");
    }
    console.info("✅ Servidor AFIP en funcionamiento:", serverStatus);

    console.info("🔍 Obteniendo punto de venta...");
    const puntoDeVenta = await (async (): Promise<number> => {
      try {
        const salesPoints = await afip.ElectronicBilling.getSalesPoints();
        if (salesPoints && salesPoints.length > 0) {
          return salesPoints[0].Nro;
        }
      } catch (error: unknown) {
        if (error instanceof Error) {
          console.error(
            "⚠️ No se pudo obtener puntos de venta:",
            error.message,
          );
        }
      }
      return 1;
    })();
    console.info("✅ Punto de venta obtenido:", puntoDeVenta);

    console.info("🔍 Obteniendo el último comprobante autorizado...");
    const lastVoucher = await afip.ElectronicBilling.getLastVoucher(
      puntoDeVenta,
      tipoFactura,
    );
    const nuevoComprobante = lastVoucher + 1;
    console.info(`✅ Último comprobante autorizado: ${lastVoucher}`);
    console.info(
      `📝 Próximo comprobante esperado (Número de factura): ${nuevoComprobante}`,
    );

    console.info("🔍 Obteniendo la fecha del último comprobante...");
    const voucherInfo = await afip.ElectronicBilling.getVoucherInfo(
      lastVoucher,
      puntoDeVenta,
      tipoFactura,
    );
    const lastVoucherDate = voucherInfo
      ? parseInt(voucherInfo.CbteFch, 10)
      : null;
    console.info(`📆 Fecha del último comprobante: ${lastVoucherDate}`);

    const today = new Date();
    const currentDateStr = today.toISOString().split("T")[0];
    const currentDateNumber = parseInt(currentDateStr.replace(/-/g, ""), 10);
    const comprobanteFecha =
      lastVoucherDate && currentDateNumber < lastVoucherDate
        ? lastVoucherDate
        : currentDateNumber;
    console.info(`📆 Fecha del comprobante (CbteFch): ${comprobanteFecha}`);

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    console.info("🔍 Obteniendo datos del contribuyente desde AFIP...");
    let ivaCondition: string;
    try {
      const taxpayerDetails =
        await afip.RegisterInscriptionProof.getTaxpayerDetails(
          Number(cuitReceptor),
        );
      if (taxpayerDetails && taxpayerDetails.CondicionIVA) {
        ivaCondition = taxpayerDetails.CondicionIVA;
        console.info(`✅ Condición IVA obtenida: ${ivaCondition}`);
      } else {
        console.warn(
          "No se encontraron datos del contribuyente, se usará 'Consumidor Final'.",
        );
        ivaCondition = "Consumidor Final";
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(
          "Error al obtener datos del contribuyente desde AFIP:",
          error.message,
        );
      }
      ivaCondition = "Consumidor Final";
    }

    console.info("🔍 Validando condición de IVA...");
    const ivaConditionMapping: Record<string, number> = {
      "Responsable Inscripto": 1,
      Monotributista: 6,
      Exento: 4,
      "No Responsable": 3,
      "Consumidor Final": 5,
    };
    const condicionIVA = ivaConditionMapping[ivaCondition] || 5;
    if (tipoFactura === 1 && condicionIVA !== 1) {
      console.warn(
        `⚠️ Cliente con IVA '${ivaCondition}' no puede recibir Factura A. Cambiando a Factura B.`,
      );
      tipoFactura = 6;
    }
    console.info(`✅ Condición IVA asignada: ${condicionIVA}`);

    console.info("🔍 Calculando impuestos...");
    // Se utiliza el valor de impIVA calculado externamente (impIVAValue)
    const impNeto = parseFloat((totalAmount - impIVAValue).toFixed(2));
    const impIVA = impIVAValue;
    const calculatedTotal = parseFloat((impNeto + impIVA).toFixed(2));
    if (calculatedTotal !== totalAmount) {
      console.warn(
        `La suma de impNeto (${impNeto}) e impIVA (${impIVA}) da ${calculatedTotal}, que no coincide con el total (${totalAmount}).`,
      );
    }
    console.info(
      `💰 Total: ${totalAmount} | Neto: ${impNeto} | IVA: ${impIVA}`,
    );

    // Obtener la cotización usando la función auxiliar
    const monCotiz =
      currency === "PES"
        ? 1
        : exchangeRateManual !== undefined
          ? exchangeRateManual
          : await getValidExchangeRate(currency, yesterday);
    console.info(`Cotización usada para ${currency}: ${monCotiz}`);

    const voucherData = {
      CantReg: 1,
      PtoVta: puntoDeVenta,
      CbteTipo: tipoFactura,
      Concepto: 1,
      DocTipo: 80,
      DocNro: Number(cuitReceptor),
      CbteDesde: nuevoComprobante,
      CbteHasta: nuevoComprobante,
      CbteFch: comprobanteFecha,
      ImpTotal: totalAmount,
      ImpTotConc: 0,
      ImpNeto: impNeto,
      ImpIVA: impIVA,
      MonId: currency,
      MonCotiz: monCotiz,
      Iva: impIVA
        ? [
            {
              Id: tipoFactura === 1 ? 5 : 4,
              BaseImp: impNeto,
              Importe: impIVA,
            },
          ]
        : [],
      CondicionIVAReceptorId: condicionIVA,
    };
    console.info("🪪 Datos de la factura a enviar a AFIP:", voucherData);

    console.info("📤 Enviando factura a AFIP...");
    const createdVoucher =
      await afip.ElectronicBilling.createVoucher(voucherData);
    if (!createdVoucher.CAE) {
      console.error("❌ No se obtuvo el CAE de la factura.");
      return {
        success: false,
        message: "No se obtuvo el CAE de la factura.",
      };
    }
    console.info("✅ Comprobante creado exitosamente:", createdVoucher);

    const voucherResult = { ...voucherData, ...createdVoucher };

    console.info("📌 Generando código QR...");
    const qrData = {
      ver: 1,
      fecha: currentDateStr,
      cuit: testingCuitEmisor,
      ptoVta: puntoDeVenta,
      tipoCmp: tipoFactura,
      nroCmp: nuevoComprobante,
      importe: totalAmount,
      moneda: currency,
      ctz: monCotiz,
      tipoDocRec: 80,
      nroDocRec: Number(cuitReceptor),
      tipoCodAut: "E",
      codAut: Number(createdVoucher.CAE),
    };
    const qrString = JSON.stringify(qrData);
    const qrBase64 = Buffer.from(qrString).toString("base64");
    const qrUrl = `https://www.afip.gob.ar/fe/qr/?p=${qrBase64}`;
    const qrImage = await qrcode.toDataURL(qrUrl);
    console.info("✅ Código QR generado correctamente.");

    console.info("📄 Generando HTML de la factura...");
    const facturaHtml = generateHtml(voucherResult, qrImage);

    return {
      success: true,
      message: "Factura creada exitosamente.",
      details: voucherResult,
      qrBase64: qrImage,
      facturaHtml,
    };
  } catch (error: unknown) {
    let message = "Error interno.";
    if (error instanceof Error) {
      message = error.message;
      console.error(
        "❌ Error en createVoucherService:",
        error.message,
        error.stack,
      );
    }
    return {
      success: false,
      message,
    };
  }
}
