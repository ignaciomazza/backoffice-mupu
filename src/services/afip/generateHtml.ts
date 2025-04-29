// src/services/afip/generateHtml.ts

import fs from "fs";
import path from "path";

interface IVAEntry {
  Id: number;
  BaseImp: number;
  Importe: number;
}

interface ServiceLine {
  code?: string;
  description: string;
  description21?: string;
  description10_5?: string;
  quantity: number;
  unitPrice?: number;
}

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface VoucherData {
  CbteTipo: number | string;
  PtoVta: number;
  CbteDesde: number;
  CbteFch: number | string;
  ImpTotal: number;
  ImpNeto: number;
  ImpIVA: number;
  CAE: string;
  CAEFchVto: string;
  DocNro: number;
  recipient?: string;
  emitterName: string;
  emitterLegalName: string;
  emitterTaxId?: string;
  emitterAddress?: string;
  departureDate?: string;
  returnDate?: string;
  description21?: string[];
  description10_5?: string[];
  descriptionNonComputable?: string[];
  saleTotal?: number;
  serviceIvaEntry?: IVAEntry;
  interestBase?: number;
  interestVat?: number;
  interestIvaEntry?: IVAEntry;
  lineItems?: LineItem[];
  services?: ServiceLine[];
  Iva?: IVAEntry[];
}

const logoFilePath = path.join(process.cwd(), "public", "logo.png");
console.log("Leyendo logo en ruta:", logoFilePath);

let logoBase64 = "";
try {
  logoBase64 = fs.readFileSync(logoFilePath).toString("base64");
  console.log("Logo cargado correctamente, tamaño base64:", logoBase64.length);
} catch (err) {
  console.warn("No pude leer el logo en:", logoFilePath, err);
}

const generateHtml = (voucherData: VoucherData, qrBase64: string): string => {
  console.log("generateHtml invoked");
  console.log("voucherData:", voucherData);
  console.log("qrBase64 length:", qrBase64.length);

  const {
    CbteTipo,
    PtoVta,
    CbteDesde,
    CbteFch,
    ImpTotal,
    ImpNeto,
    ImpIVA,
    CAE,
    CAEFchVto,
    DocNro,
    recipient,
    emitterName,
    emitterLegalName,
    emitterTaxId,
    emitterAddress,
    departureDate,
    returnDate,
    saleTotal = 0,
    serviceIvaEntry,
    interestBase = 0,
    interestVat = 0,
    lineItems,
    services = [],
    Iva = [],
    description21 = [],
    description10_5 = [],
    descriptionNonComputable = [],
  } = voucherData;

  console.log("Desestructurando voucherData completo:", {
    CbteTipo,
    PtoVta,
    CbteDesde,
    CbteFch,
    ImpTotal,
    ImpNeto,
    ImpIVA,
    CAE,
    CAEFchVto,
    DocNro,
    recipient,
    emitterName,
    emitterLegalName,
    emitterTaxId,
    emitterAddress,
    departureDate,
    returnDate,
    saleTotal,
    serviceIvaEntry,
    interestBase,
    interestVat,
    lineItemsLength: lineItems?.length,
    servicesLength: services.length,
    IvaLength: Iva.length,
  });

  const fechaEmision =
    typeof CbteFch === "string" && CbteFch !== "N/A"
      ? `${CbteFch.slice(6, 8)}/${CbteFch.slice(4, 6)}/${CbteFch.slice(0, 4)}`
      : typeof CbteFch === "number"
        ? `${CbteFch.toString().slice(6, 8)}/${CbteFch.toString().slice(
            4,
            6,
          )}/${CbteFch.toString().slice(0, 4)}`
        : "Fecha no disponible";
  console.log("fechaEmision calculada:", fechaEmision);

  const caeVto =
    CAEFchVto && CAEFchVto !== "N/A"
      ? CAEFchVto.split("-").reverse().join("/")
      : "CAE no disponible";
  console.log("caeVto calculada:", caeVto);

  const fmt = (n: number) => {
    const formatted = new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 2,
    }).format(n);
    console.log(`Formateando número ${n} como ${formatted}`);
    return formatted;
  };

  let items: LineItem[];
  console.log("Iniciando construcción de items...");

  if (Array.isArray(lineItems) && lineItems.length > 0) {
    console.log("Usando lineItems pasados desde voucherData");
    items = lineItems;
  } else if (services.length > 0 && (Iva.length > 0 || serviceIvaEntry)) {
    console.log("Armando items dinámicos a partir de services e IVA");
    const ivaArray =
      Iva.length > 0 ? Iva : serviceIvaEntry ? [serviceIvaEntry] : [];
    console.log("ivaArray:", ivaArray);

    items = services.flatMap((svc) =>
      ivaArray.map((ivaEntry) => {
        const rate =
          ivaEntry.Id === 5 ? 21 : ivaEntry.Id === 4 ? 10.5 : ivaEntry.Id;
        const desc =
          rate === 21
            ? (svc.description21 ?? svc.description)
            : rate === 10.5
              ? (svc.description10_5 ?? svc.description)
              : svc.description;
        const unitPrice = svc.unitPrice ?? ivaEntry.BaseImp;
        const subtotal = unitPrice * svc.quantity;
        const item = {
          description: desc,
          quantity: svc.quantity,
          unitPrice,
          subtotal,
        };
        console.log("Item dinámico creado:", item);
        return item;
      }),
    );
  } else {
    console.log("Usando fallback de descripciones para items");
    const parts: LineItem[] = [];

    if (serviceIvaEntry && serviceIvaEntry.BaseImp > 0) {
      const part21 = {
        description: description21[0] || "Servicio Turístico",
        quantity: 1,
        unitPrice: serviceIvaEntry.BaseImp + serviceIvaEntry.Importe,
        subtotal: serviceIvaEntry.BaseImp + serviceIvaEntry.Importe,
      };
      console.log("Fallback 21%:", part21);
      parts.push(part21);
    }

    const entry105 = Iva.find((e) => e.Id === 4);
    if (entry105 && entry105.BaseImp > 0) {
      const part105 = {
        description: description10_5[0] || "Servicio Turístico",
        quantity: 1,
        unitPrice: entry105.BaseImp + entry105.Importe,
        subtotal: entry105.BaseImp + entry105.Importe,
      };
      console.log("Fallback 10.5%:", part105);
      parts.push(part105);
    }

    if (serviceIvaEntry) {
      const nonCompVal =
        saleTotal -
        ((serviceIvaEntry.BaseImp ?? 0) +
          (serviceIvaEntry.Importe ?? 0) +
          (entry105?.BaseImp ?? 0) +
          (entry105?.Importe ?? 0));
      if (nonCompVal > 0) {
        const partNC = {
          description: descriptionNonComputable[0] || "Servicio No Computable",
          quantity: 1,
          unitPrice: nonCompVal,
          subtotal: nonCompVal,
        };
        console.log("Fallback no computable:", partNC);
        parts.push(partNC);
      }
    }
    items = parts;
  }

  console.log("Items finales:", items);

  const reservationInfo =
    departureDate && returnDate
      ? `
    <p><strong>Salida:</strong> ${new Date(departureDate).toLocaleDateString(
      "es-AR",
    )}</p>
    <p><strong>Regreso:</strong> ${new Date(returnDate).toLocaleDateString(
      "es-AR",
    )}</p>
    `
      : "";
  console.log("reservationInfo HTML:", reservationInfo);

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>Factura ${CbteTipo === 1 ? "A" : "B"}</title>
    <style type="text/css">
      * { box-sizing: border-box; user-select: none; }
      .bill-container { width: 750px; margin: auto; font-family: sans-serif; font-size: 13px; }
      .bill-emitter-row td { width: 50%; vertical-align: top; padding: 10px; }
      .bill-type { border: 1px solid; width: 60px; height: 50px; text-align: center; font-size: 40px; font-weight: 600; }
      .rounded { border-radius: 10%; }
      .text-lg { font-size: 30px; }
      .text-center { text-align: center; }
      .text-right { text-align: right; }
      .section-title { margin-top: 20px; font-weight: bold; }
      table { width: 100%; border-collapse: collapse; margin-top: 5px; }
      .border { border: 1px solid #ccc; }
      th, td { padding: 8px; text-align: center; }
      .summary p { margin: 2px 0; }
      #qrcode { width: 50%; }
      .bill-footer { margin-top: 20px; text-align: center; border-top: 1px solid #ccc; padding-top: 10px; }
      .footer-logo { max-width: 150px; height: auto; }
    </style>
  </head>
  <body>
    <table class="bill-container">
      <tr class="bill-emitter-row">
        <td>
          <div class="bill-type rounded">${CbteTipo === 1 ? "A" : "B"}</div>
          <div class="text-lg"><strong>${emitterName}</strong></div>
          <p><strong>Razón social:</strong> ${emitterLegalName}</p>
          <p><strong>CUIT:</strong> ${emitterTaxId}</p>
          <p><strong>Domicilio Comercial:</strong> ${emitterAddress}</p>
        </td>
        <td>
          <div>
            <div class="text-lg">Factura</div>
            <p><strong>Punto de Venta:</strong> ${PtoVta}</p>
            <p><strong>Comp. Nro:</strong> ${CbteDesde}</p>
            <p><strong>Fecha de Emisión:</strong> ${fechaEmision}</p>
            ${reservationInfo}
          </div>
        </td>
      </tr>
      <tr>
        <td colspan="2">
          <p><strong>CUIL/CUIT Cliente:</strong> ${DocNro}</p>
          <p><strong>Apellido y Nombre / Razón Social:</strong> ${recipient}</p>
        </td>
      </tr>
      <tr>
        <td colspan="2" class="section-title">Detalle de Servicios</td>
      </tr>
      <tr>
        <td colspan="2">
          <table class="border">
            <tr class="border">
              <th>Cód.</th><th>Descripción</th><th>Cant.</th><th>Precio U.</th><th>Subtotal</th>
            </tr>
            ${items
              .map(
                (it, idx) => `
            <tr class="border">
              <td>${idx + 1}</td>
              <td>${it.description}</td>
              <td>${it.quantity}</td>
              <td>${it.unitPrice.toFixed(2)}</td>
              <td>${it.subtotal.toFixed(2)}</td>
            </tr>`,
              )
              .join("")}
          </table>
        </td>
      </tr>
      ${
        interestBase > 0 || interestVat > 0
          ? `
      <tr class="border">
        <td colspan="2" class="section-title">Detalle de Intereses</td>
      </tr>
      <tr>
        <td colspan="2">
          <table>
            <tr><th>Cód.</th><th>Descripción</th><th>Cant.</th><th>Precio U.</th><th>Subtotal</th></tr>
            <tr>
              <td>1</td><td>Interés de la tarjeta</td><td>1</td><td>${interestBase.toFixed(
                2,
              )}</td><td>${interestBase.toFixed(2)}</td>
            </tr>
            <tr>
              <td>2</td><td>IVA sobre interés</td><td>1</td><td>${interestVat.toFixed(
                2,
              )}</td><td>${interestVat.toFixed(2)}</td>
            </tr>
          </table>
        </td>
      </tr>`
          : ""
      }
      <tr>
        <td colspan="2" class="section-title">Resumen</td>
      </tr>
      <tr>
        <td colspan="2">
          <div class="summary text-right">
            <p><strong>Subtotal (neto):</strong> ${fmt(ImpNeto)}</p>
            <p><strong>IVA:</strong> ${fmt(ImpIVA)}</p>
            <p><strong>Total:</strong> ${fmt(ImpTotal)}</p>
          </div>
        </td>
      </tr>
      <tr>
        <td class="text-center"><img id="qrcode" src="${qrBase64}" /></td>
        <td class="text-right">
          <p><strong>CAE Nº:</strong> ${CAE}</p>
          <p><strong>Vto. CAE:</strong> ${caeVto}</p>
        </td>
      </tr>
    </table>
    <footer class="bill-footer">
      <img src="data:image/png;base64,${logoBase64}" alt="Logo de la empresa" class="footer-logo" />
    </footer>
  </body>
  </html>
  `;
};

export default generateHtml;
