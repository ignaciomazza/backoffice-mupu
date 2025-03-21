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
  // Cálculo de bases y brutos
  const base21 = tax21 / 0.21;
  const base10_5 = tax105 / 0.105;
  const bruto21 = base21 * 1.21;
  const bruto10_5 = base10_5 * 1.105;

  // Cálculo de "No Computable":
  // Si existe valor en "exento", se asume que no se computa (0)
  const noComputable = exempt > 0 ? 0 : cost - (bruto21 + bruto10_5);

  // Margen de operación
  const margin = sale - cost;

  // Variables para repartir la comisión bruta (la suma de comisión neta + IVA en cada grupo)
  let grossComm21 = 0;
  let grossComm10_5 = 0;
  let grossCommExempt = 0;

  if (tax21 + tax105 > 0) {
    // Se reparte el margen proporcionalmente según la suma de los impuestos ingresados
    grossComm21 = margin * (tax21 / (tax21 + tax105));
    grossComm10_5 = margin * (tax105 / (tax21 + tax105));
  } else {
    // Si no hay IVA (tax21 + tax105 === 0), se asigna todo el margen a la comisión exenta
    grossCommExempt = margin;
  }

  // Extraer IVA de las comisiones en los grupos que corresponda
  const netComm21 = grossComm21 ? grossComm21 / 1.21 : 0;
  const ivaComm21 = grossComm21 - netComm21;

  const netComm10_5 = grossComm10_5 ? grossComm10_5 / 1.105 : 0;
  const ivaComm10_5 = grossComm10_5 - netComm10_5;

  // La comisión exenta no tiene IVA
  const netCommExempt = grossCommExempt;

  const totalNetCommission = margin - ivaComm21 - ivaComm10_5;

  // Función de formateo
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
    }).format(value);

  return (
    <div className="mt-6 rounded-xl p-4 dark:bg-white">
      <h3 className="mb-2 text-xl font-semibold">Informacion</h3>
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
