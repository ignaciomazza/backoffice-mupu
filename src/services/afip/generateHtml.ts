// src/services/afip/generateHtml.ts

const generateHtml = (voucherData: any, qrBase64: string) => {
  console.log(
    "📄 Datos completos recibidos en generateHtml:",
    JSON.stringify(voucherData, null, 2)
  );

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
  } = voucherData;

  console.log("📌 Verificando datos extraídos:", {
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
  });

  const fechaEmision =
    CbteFch !== "N/A"
      ? `${CbteFch.toString().slice(6, 8)}/${CbteFch.toString().slice(
          4,
          6
        )}/${CbteFch.toString().slice(0, 4)}`
      : "Fecha no disponible";

  const caeVto =
    CAEFchVto !== "N/A"
      ? CAEFchVto.split("-").reverse().join("/")
      : "CAE no disponible";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Factura ${CbteTipo === 1 ? "A" : "B"}</title>
      <style type="text/css">
        * { box-sizing: border-box; user-select: none; }
        .bill-container { width: 750px; margin: auto; border-collapse: collapse; font-family: sans-serif; font-size: 13px; }
        .bill-emitter-row td { width: 50%; border-bottom: 1px solid; padding-top: 10px; padding-left: 10px; vertical-align: top; }
        .bill-type { border: 1px solid; width: 60px; height: 50px; text-align: center; font-size: 40px; font-weight: 600; }
        .text-lg { font-size: 30px; }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .bill-row td { padding-top: 5px; }
        .bill-row td > div { border-top: 1px solid; border-bottom: 1px solid; padding: 0 10px 13px 10px; }
        .row-details table { border-collapse: collapse; width: 100%; }
        .row-details table tr:nth-child(1) { border-top: 1px solid; border-bottom: 1px solid; background: #c0c0c0; font-weight: bold; text-align: center; }
        #qrcode { width: 50%; }
      </style>
    </head>
    <body>
      <table class="bill-container">
        <tr class="bill-emitter-row">
          <td>
            <div class="bill-type">${CbteTipo === 1 ? "A" : "B"}</div>
            <div class="text-lg text-center">Mupu Viajes S.A.</div>
            <p><strong>Razón social:</strong> Mupu Viajes S.A.</p>
            <p><strong>CUIT:</strong> 30-12345678-9</p>
            <p><strong>Domicilio Comercial:</strong> Av. Corrientes 1234, Buenos Aires</p>
            <p><strong>Condición Frente al IVA:</strong> Responsable Inscripto</p>
            <p><strong>Ingresos Brutos:</strong> 123456789</p>
            <p><strong>Fecha de Inicio de Actividades:</strong> 01/01/2020</p>
          </td>
          <td>
            <div>
              <div class="text-lg">Factura</div>
              <p><strong>Punto de Venta:</strong> ${PtoVta}</p>
              <p><strong>Comp. Nro:</strong> ${CbteDesde}</p>
              <p><strong>Fecha de Emisión:</strong> ${fechaEmision}</p>
            </div>
          </td>
        </tr>
        <tr class="bill-row">
          <td colspan="2">
            <div>
              <p><strong>CUIL/CUIT Cliente:</strong> ${DocNro}</p>
              <p><strong>Apellido y Nombre / Razón Social:</strong> Cliente</p>
            </div>
          </td>
        </tr>
        <tr class="bill-row row-details">
          <td colspan="2">
            <div>
              <table>
                <tr>
                  <td>Código</td>
                  <td>Producto / Servicio</td>
                  <td>Cantidad</td>
                  <td>Precio Unit.</td>
                  <td>Subtotal</td>
                </tr>
                <tr>
                  <td>001</td>
                  <td>Servicio Turístico</td>
                  <td>1</td>
                  <td>${ImpNeto.toFixed(2)}</td>
                  <td>${ImpNeto.toFixed(2)}</td>
                </tr>
              </table>
            </div>
          </td>
        </tr>
        <tr class="bill-row total-row">
          <td colspan="2">
            <div class="text-right">
              <p><strong>Subtotal:</strong> $${ImpNeto.toFixed(2)}</p>
              <p><strong>IVA:</strong> $${ImpIVA.toFixed(2)}</p>
              <p><strong>Total:</strong> $${ImpTotal.toFixed(2)}</p>
            </div>
          </td>
        </tr>
        <tr class="bill-row row-qrcode">
          <td>
            <div class="text-center">
              <img id="qrcode" src="${qrBase64}">
            </div>
          </td>
          <td>
            <div class="text-right">
              <p><strong>CAE Nº:</strong> ${CAE}</p>
              <p><strong>Fecha de Vto. de CAE:</strong> ${caeVto}</p>
            </div>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

export default generateHtml;
