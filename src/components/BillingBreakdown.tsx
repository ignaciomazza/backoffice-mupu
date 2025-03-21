// BillingBreakdown.tsx

import { NextPage } from "next";

interface Props {
  sale: number;
  cost: number;
  tax21: number;
  tax105: number;
  exempt: number;
  other_taxes: number;
  currency?: string;
}

const BillingBreakdown: NextPage<Props> = ({
  sale,
  cost,
  tax21,
  tax105,
  exempt,
  other_taxes,
  currency = "ARS",
}) => {
  // Bases para impuestos (si se ingresan)
  const base21 = tax21 > 0 ? tax21 / 0.21 : 0;
  const base10_5 = tax105 > 0 ? tax105 / 0.105 : 0;

  // Se calcula el monto computable a partir de IVA, si existen
  const computedTaxable = (tax21 > 0 || tax105 > 0)
    ? (base21 * 1.21 + base10_5 * 1.105)
    : 0;
  // "No computable" es el costo que queda al restar el exento y el monto computable
  const noComputable = cost - (exempt + computedTaxable);

  // Margen de operación (venta - costo)
  const margin = sale - cost;

  // Variables para las comisiones
  let netComm21 = 0;
  let netComm10_5 = 0;
  let grossComm21 = 0;
  let grossComm10_5 = 0;
  let netCommExempt = 0;
  let ivaComm21 = 0;
  let ivaComm10_5 = 0;

  if (tax21 + tax105 > 0) {
    // Caso en que se ingresan impuestos:
    // Se reparte el margen proporcionalmente según la parte gravada (costo - exento)
    const taxableCost = cost - exempt;
    const taxableMargin = cost > 0 ? margin * (taxableCost / cost) : 0;
    const exemptMargin = margin - taxableMargin;

    grossComm21 = taxableMargin * (tax21 / (tax21 + tax105));
    grossComm10_5 = taxableMargin * (tax105 / (tax21 + tax105));

    netComm21 = grossComm21 ? grossComm21 / 1.21 : 0;
    ivaComm21 = grossComm21 - netComm21;

    netComm10_5 = grossComm10_5 ? grossComm10_5 / 1.105 : 0;
    ivaComm10_5 = grossComm10_5 - netComm10_5;

    netCommExempt = exemptMargin;
  } else {
    // Caso sin impuestos (tax21 y tax105 en 0):
    // Se reparte el margen M en dos partes: una para el grupo gravado y otra para el exento,
    // de forma que la relación de las comisiones netas sea:
    //    netComm21 / netCommExempt = (costo - exento) / (exento)
    // y además, la comisión bruta del grupo gravado es 1.21 veces la comisión neta.
    // Es decir, si definimos X = netComm21 y Y = netCommExempt,
    // se cumple que:
    //    X / Y = (cost - exempt) / exempt
    //    1.21 * X + Y = margin
    // De ahí, se despeja:
    //    X = margin / (1.21 + (exempt / (cost - exempt)))
    const taxableCost = cost - exempt;
    if (taxableCost > 0) {
      const netTaxableCommission = margin / (1.21 + (exempt / taxableCost));
      const grossTaxableCommission = netTaxableCommission * 1.21;
      netComm21 = netTaxableCommission;
      grossComm21 = grossTaxableCommission;
      netCommExempt = margin - grossTaxableCommission;
      ivaComm21 = grossTaxableCommission - netTaxableCommission;
    } else {
      // Si no hay monto gravado, toda la comisión es exenta.
      netCommExempt = margin;
    }
  }

  const totalNetCommission = netComm21 + netComm10_5 + netCommExempt;

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
    }).format(value);

  return (
    <div className="mt-6 rounded-xl p-4 dark:text-white">
      <h3 className="mb-2 text-xl font-semibold">Información</h3>
      <div className="mb-4">
        <p>
          <strong>Venta:</strong> {formatCurrency(sale)}
        </p>
        <p>
          <strong>Costo:</strong> {formatCurrency(cost)}
        </p>
        <p>
          <strong>Iva 21.00:</strong> {formatCurrency(tax21)}
        </p>
        <p>
          <strong>Iva 10.50:</strong> {formatCurrency(tax105)}
        </p>
        <p>
          <strong>Exento:</strong> {formatCurrency(exempt)}
        </p>
        <p>
          <strong>Otros impuestos:</strong> {formatCurrency(other_taxes)}
        </p>
      </div>

      <h3 className="mb-2 text-xl font-semibold">Desglose de Facturación</h3>
      <div className="mb-4">
        <p>
          <strong>No Computable:</strong> {formatCurrency(noComputable)}
        </p>
        <p>
          <strong>Gravado 21%:</strong> {formatCurrency(base21)}
        </p>
        <p>
          <strong>Gravado 10,5%:</strong> {formatCurrency(base10_5)}
        </p>
      </div>

      <h4 className="mb-2 text-lg font-semibold">Comisiones</h4>
      <div className="mb-4">
        <p>
          <strong>Exenta:</strong> {formatCurrency(netCommExempt)}
        </p>
        <p>
          <strong>21%:</strong> {formatCurrency(netComm21)}
        </p>
        <p>
          <strong>10,5%:</strong> {formatCurrency(netComm10_5)}
        </p>
      </div>

      <h4 className="mb-2 text-lg font-semibold">IVA sobre Comisiones</h4>
      <div className="mb-4">
        <p>
          <strong>21%:</strong> {formatCurrency(ivaComm21)}
        </p>
        <p>
          <strong>10,5%:</strong> {formatCurrency(ivaComm10_5)}
        </p>
      </div>

      <p className="font-semibold">
        Total Comisión (sin IVA): {formatCurrency(totalNetCommission)}
      </p>
    </div>
  );
};

export default BillingBreakdown;
