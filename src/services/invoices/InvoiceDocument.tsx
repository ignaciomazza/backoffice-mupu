import React from "react";
import path from "path";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Font,
} from "@react-pdf/renderer";

interface IVAEntry {
  Id: number;
  BaseImp: number;
  Importe: number;
}
interface ServiceLine {
  description: string;
  quantity: number;
  unitPrice?: number;
  description21?: string;
  description10_5?: string;
}
interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}
export interface VoucherData {
  CbteTipo: number;
  PtoVta: number;
  CbteDesde: number;
  CbteFch: string | number;
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
  lineItems?: LineItem[];
  services?: ServiceLine[];
  Iva?: IVAEntry[];
}

Font.register({
  family: "Poppins",
  fonts: [
    {
      src: path.join(process.cwd(), "public/poppins/Poppins-Regular.ttf"),
      fontWeight: "normal",
    },
    {
      src: path.join(process.cwd(), "public/poppins/Poppins-Bold.ttf"),
      fontWeight: "bold",
    },
  ],
});

const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
const fmtNum = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
const fmtCurr = (n: number, curr: string) => {
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: curr,
    }).format(n);
  } catch {
    return `${fmtNum(n)} ${curr}`;
  }
};

const styles = StyleSheet.create({
  page: { fontFamily: "Poppins", fontSize: 11, padding: 20, color: "#333" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  invoiceInfo: { textAlign: "center" },
  section: { marginBottom: 10 },
  table: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#ddd",
    marginBottom: 10,
  },
  row: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#ddd" },
  headerCell: { backgroundColor: "#f0f0f0", fontWeight: "bold" },
  cellDesc: { width: "40%", padding: 4 },
  cellNum: { width: "20%", padding: 4, textAlign: "right" },
  summary: { flexDirection: "column", alignItems: "flex-end", marginTop: 5 },
  qr: { width: 80, height: 80, marginTop: 10 },
  footer: { fontSize: 9, textAlign: "center", marginTop: 10, color: "#555" },
});

const InvoiceDocument: React.FC<{
  invoiceNumber: string;
  issueDate: Date;
  voucherData: VoucherData;
  qrBase64?: string;
  currency: string;
}> = ({ invoiceNumber, voucherData, qrBase64, currency }) => {
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
    description21 = [],
    description10_5 = [],
    descriptionNonComputable = [],
    saleTotal = 0,
    serviceIvaEntry,
    interestBase = 0,
    interestVat = 0,
    lineItems = [],
    services = [],
    Iva = [],
  } = voucherData;

  // Build service items
  let items: LineItem[] = lineItems;
  if (!items.length && services.length && (Iva.length || serviceIvaEntry)) {
    const ivaArr = Iva.length ? Iva : serviceIvaEntry ? [serviceIvaEntry] : [];
    items = services.flatMap((svc) =>
      ivaArr.map((iva) => {
        const rate = iva.Id === 5 ? 21 : iva.Id === 4 ? 10.5 : iva.Id;
        const desc =
          rate === 21
            ? (svc.description21 ?? svc.description)
            : rate === 10.5
              ? (svc.description10_5 ?? svc.description)
              : svc.description;
        const unitPrice = svc.unitPrice ?? iva.BaseImp;
        return {
          description: desc,
          quantity: svc.quantity,
          unitPrice,
          subtotal: unitPrice * svc.quantity,
        };
      }),
    );
  }
  // Fallback non-computable
  if (!items.length && serviceIvaEntry) {
    const fallback: LineItem[] = [];
    if (serviceIvaEntry.BaseImp > 0) {
      const val21 = serviceIvaEntry.BaseImp + serviceIvaEntry.Importe;
      fallback.push({
        description: description21[0] || "Servicio Turístico",
        quantity: 1,
        unitPrice: val21,
        subtotal: val21,
      });
    }
    const entry105 = Iva.find((e) => e.Id === 4);
    if (entry105 && entry105.BaseImp > 0) {
      const val105 = entry105.BaseImp + entry105.Importe;
      fallback.push({
        description: description10_5[0] || "Servicio Turístico",
        quantity: 1,
        unitPrice: val105,
        subtotal: val105,
      });
    }
    const nonComp =
      saleTotal -
      ((serviceIvaEntry.BaseImp ?? 0) +
        (serviceIvaEntry.Importe ?? 0) +
        (entry105?.BaseImp ?? 0) +
        (entry105?.Importe ?? 0));
    if (nonComp > 0)
      fallback.push({
        description: descriptionNonComputable[0] || "Servicio No Computable",
        quantity: 1,
        unitPrice: nonComp,
        subtotal: nonComp,
      });
    items = fallback;
  }

  // Interest items
  const interestItems: LineItem[] = [];
  if (interestBase)
    interestItems.push({
      description: "Interés tarjeta",
      quantity: 1,
      unitPrice: interestBase,
      subtotal: interestBase,
    });
  if (interestVat)
    interestItems.push({
      description: "IVA sobre interés",
      quantity: 1,
      unitPrice: interestVat,
      subtotal: interestVat,
    });

  // Format dates
  const fechaEm =
    typeof CbteFch === "string"
      ? `${CbteFch.slice(6, 8)}/${CbteFch.slice(4, 6)}/${CbteFch.slice(0, 4)}`
      : fmtDate(new Date(CbteFch.toString()));
  const caeVto = CAEFchVto.split("-").reverse().join("/");

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.invoiceInfo}>
            <Text>Factura {CbteTipo === 1 ? "A" : "B"}</Text>
            <Text>N° {invoiceNumber}</Text>
            <Text>Pto Vta: {PtoVta}</Text>
            <Text>Cmp Nro: {CbteDesde}</Text>
            <Text>Emisión: {fechaEm}</Text>
          </View>
        </View>

        {/* Emitter / Receiver */}
        <View style={styles.section}>
          <Text style={{ fontWeight: "bold" }}>Emisor</Text>
          <Text>{emitterName}</Text>
          <Text>Razón social: {emitterLegalName}</Text>
          <Text>CUIT: {emitterTaxId}</Text>
          <Text>{emitterAddress}</Text>
        </View>
        <View style={styles.section}>
          <Text style={{ fontWeight: "bold" }}>Receptor</Text>
          <Text>{recipient}</Text>
          <Text>DNI/CUIT: {DocNro}</Text>
        </View>

        {/* Reservation dates */}
        {(departureDate || returnDate) && (
          <View style={styles.section}>
            <Text>
              <Text style={{ fontWeight: "bold" }}>Salida: </Text>
              {departureDate ? fmtDate(new Date(departureDate)) : "-"}
            </Text>
            <Text>
              <Text style={{ fontWeight: "bold" }}>Regreso: </Text>
              {returnDate ? fmtDate(new Date(returnDate)) : "-"}
            </Text>
          </View>
        )}

        {/* Services table */}
        <View style={styles.table}>
          <View style={[styles.row, styles.headerCell]}>
            <Text style={styles.cellDesc}>Descripción</Text>
            <Text style={styles.cellNum}>Cant.</Text>
            <Text style={styles.cellNum}>Precio U.</Text>
            <Text style={styles.cellNum}>Subtotal</Text>
          </View>
          {items.map((it, i) => (
            <View style={styles.row} key={i}>
              <Text style={styles.cellDesc}>{it.description}</Text>
              <Text style={styles.cellNum}>{it.quantity}</Text>
              <Text style={styles.cellNum}>
                {fmtCurr(it.unitPrice, currency)}
              </Text>
              <Text style={styles.cellNum}>
                {fmtCurr(it.subtotal, currency)}
              </Text>
            </View>
          ))}
        </View>

        {/* Interest */}
        {interestItems.length > 0 && (
          <View style={[styles.table, { marginBottom: 0 }]}>
            <View style={[styles.row, styles.headerCell]}>
              <Text style={styles.cellDesc}>Concepto</Text>
              <Text style={styles.cellNum}>Cant.</Text>
              <Text style={styles.cellNum}>Precio U.</Text>
              <Text style={styles.cellNum}>Subtotal</Text>
            </View>
            {interestItems.map((it, i) => (
              <View style={styles.row} key={i}>
                <Text style={styles.cellDesc}>{it.description}</Text>
                <Text style={styles.cellNum}>{it.quantity}</Text>
                <Text style={styles.cellNum}>
                  {fmtCurr(it.unitPrice, currency)}
                </Text>
                <Text style={styles.cellNum}>
                  {fmtCurr(it.subtotal, currency)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* IVA */}
        <View style={styles.table}>
          <View style={[styles.row, styles.headerCell]}>
            <Text style={styles.cellDesc}>Tasa</Text>
            <Text style={styles.cellNum}>Base</Text>
            <Text style={styles.cellNum}>Importe</Text>
          </View>
          {Iva.map((e, i) => (
            <View style={styles.row} key={i}>
              <Text style={styles.cellDesc}>
                {e.Id === 5 ? "21%" : e.Id === 4 ? "10.5%" : "No Gravado"}
              </Text>
              <Text style={styles.cellNum}>{fmtNum(e.BaseImp)}</Text>
              <Text style={styles.cellNum}>{fmtNum(e.Importe)}</Text>
            </View>
          ))}
        </View>

        {/* Summary */}
        <View style={styles.summary}>
          <Text>Subtotal Neto: {fmtCurr(ImpNeto, currency)}</Text>
          <Text>IVA: {fmtCurr(ImpIVA, currency)}</Text>
          <Text style={{ fontWeight: "bold" }}>
            Total: {fmtCurr(ImpTotal, currency)}
          </Text>
        </View>

        {/* QR & CAE */}
        {qrBase64 && (
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image style={styles.qr} src={qrBase64} />
        )}
        <Text>CAE N°: {CAE}</Text>
        <Text>Vto. CAE: {caeVto}</Text>

        <Text style={styles.footer} fixed>
          Este comprobante es copia fiel de la factura electrónica.
        </Text>
      </Page>
    </Document>
  );
};

export default InvoiceDocument;
