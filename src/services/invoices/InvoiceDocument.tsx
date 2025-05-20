// src/components/InvoiceDocument.tsx
import React from "react";
import path from "path";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";

export interface VoucherData {
  CbteTipo: number;
  PtoVta: number;
  CbteDesde: number;
  CbteFch: string | number | Date;
  ImpTotal: number;
  ImpNeto: number;
  ImpIVA: number;
  ImpOtrosTributos?: number;
  CAE: string;
  CAEFchVto: string;
  DocNro: number;
  recipient?: string;
  recipientAddress?: string;
  recipientCondIVA?: string;
  emitterName: string;
  emitterLegalName: string;
  emitterTaxId?: string;
  emitterAddress?: string;
  emitterCondIVA?: string;
  emitterIIBB?: string;
  emitterActInicio?: string;
  departureDate?: string;
  returnDate?: string;
  Iva?: Array<{ Id: number; BaseImp: number; Importe: number }>;
  description21?: string[];
  description10_5?: string[];
  descriptionNonComputable?: string[];
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

/**
 * Formatea fechas:
 * - Si es número tipo 20250520 -> 20/05/2025
 * - Si es string "YYYY-MM-DD" -> DD/MM/YYYY
 * - Si es Date u otro string ISO -> Intl.format con zona AR sin desfasaje
 */
const fmtDate = (raw: string | number | Date): string => {
  const s = raw?.toString();
  // YYYYMMDD numérico
  if (/^\d{8}$/.test(s!)) {
    return `${s!.slice(6, 8)}/${s!.slice(4, 6)}/${s!.slice(0, 4)}`;
  }
  // YYYY-MM-DD
  const iso = s?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return `${iso[3]}/${iso[2]}/${iso[1]}`;
  }
  // Date u otro string
  const d = raw instanceof Date ? raw : new Date(s!);
  if (isNaN(d.getTime())) return s!;
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
};

const safeFmtCurrency = (value: number, curr: string): string => {
  let code = curr.toUpperCase();
  if (code === "PES") code = "ARS";
  else if (code === "DOL" || code === "U$S") code = "USD";
  try {
    if (code === "ARS" || code === "USD") {
      return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: code,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    }
  } catch {}
  return `${value.toFixed(2)} ${code}`;
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Poppins",
    fontSize: 10,
    padding: 60,
    color: "#333",
  },
  headerBand: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    borderRadius: 6,
    marginBottom: 12,
  },
  logo: { height: 40 },
  invoiceType: {
    color: "#333",
    fontSize: 24,
    fontWeight: "bold",
    padding: "2px 10px 0px 12px",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#333",
    alignItems: "center",
    justifyContent: "center",
  },
  invoiceTitle: {
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
    textTransform: "uppercase",
    marginBottom: 12,
    color: "#555",
  },
  infoTable: { marginBottom: 12 },
  infoRow: { flexDirection: "row", marginBottom: 4 },
  infoLabel: { width: "15%", fontWeight: "bold", color: "#555" },
  infoValue: { width: "20%" },
  parties: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  partyBox: {
    width: "48%",
    backgroundColor: "#fafafa",
    padding: 8,
    borderRadius: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 6,
    textTransform: "uppercase",
    color: "#555",
  },
  table: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 12,
  },
  headerCell: {
    flexDirection: "row",
    backgroundColor: "#e8e8e8",
    borderBottomWidth: 1,
    borderColor: "#ccc",
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: "#eee",
  },
  rowAlt: {
    backgroundColor: "#fcfcfc",
  },
  cellCode: { width: "10%", padding: 6, fontSize: 8 },
  cellDesc: { width: "40%", padding: 6, fontSize: 8 },
  cellNum: { width: "15%", padding: 6, textAlign: "right", fontSize: 8 },
  summary: {
    marginTop: 8,
    borderTopWidth: 1,
    borderColor: "#ccc",
    paddingTop: 6,
    alignItems: "flex-end",
  },
  qr: { width: 120, height: 120, marginTop: 10 },
  footer: { fontSize: 8, textAlign: "center", marginTop: 36, color: "#777" },
});

const InvoiceDocument: React.FC<{
  voucherData: VoucherData;
  qrBase64?: string;
  currency: string;
  logoBase64?: string;
}> = ({ voucherData, qrBase64, currency, logoBase64 }) => {
  const {
    CbteTipo,
    PtoVta,
    CbteDesde,
    CbteFch,
    ImpTotal,
    ImpNeto,
    ImpIVA,
    ImpOtrosTributos = 0,
    CAE,
    CAEFchVto,
    DocNro,
    recipient,
    recipientAddress,
    recipientCondIVA,
    emitterName,
    emitterLegalName,
    emitterTaxId,
    emitterAddress,
    emitterCondIVA,
    emitterIIBB,
    emitterActInicio,
    departureDate,
    returnDate,
    Iva = [],
    description21 = [],
    description10_5 = [],
    descriptionNonComputable = [],
  } = voucherData;

  const fechaEm = fmtDate(CbteFch);
  const caeVto = fmtDate(CAEFchVto);

  // Construir ítems con descripciones según tasa
  const items = Iva.map((e) => {
    const rate = e.Id === 5 ? 21 : e.Id === 4 ? 10.5 : 0;
    let desc: string;
    if (rate === 21) desc = description21[0] || `IVA ${rate}%`;
    else if (rate === 10.5) desc = description10_5[0] || `IVA ${rate}%`;
    else desc = descriptionNonComputable[0] || `IVA ${rate}%`;
    const amount = e.BaseImp + e.Importe;
    return {
      code: "-",
      description: desc,
      quantity: 1,
      unitPrice: amount,
      subtotal: amount,
    };
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Cabecera */}
        <View style={styles.headerBand}>
          {logoBase64 && (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image
              style={styles.logo}
              src={`data:image/png;base64,${logoBase64}`}
            />
          )}
          <Text style={styles.invoiceType}>
            {`${CbteTipo === 1 ? "A" : CbteTipo === 6 ? "B" : CbteTipo}`}
          </Text>
        </View>

        {/* Título */}
        <Text style={styles.invoiceTitle}>Comprobante Electrónico</Text>

        {/* Datos generales */}
        <View style={styles.infoTable}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Pto. Venta:</Text>
            <Text style={styles.infoValue}>{PtoVta}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>N°:</Text>
            <Text style={styles.infoValue}>{CbteDesde}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Emisión:</Text>
            <Text style={styles.infoValue}>{fechaEm}</Text>
          </View>
          {(departureDate || returnDate) && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Período:</Text>
              <Text style={styles.infoRow}>
                {departureDate && fmtDate(departureDate)}
                {returnDate && ` al ${fmtDate(returnDate)}`}
              </Text>
            </View>
          )}
        </View>

        {/* Emisor y Receptor */}
        <View style={styles.parties}>
          <View style={styles.partyBox}>
            <Text style={styles.sectionTitle}>Emisor</Text>
            <Text>{emitterName}</Text>
            <Text>Razón social: {emitterLegalName}</Text>
            <Text>CUIT: {emitterTaxId}</Text>
            <Text>Domicilio: {emitterAddress}</Text>
            {emitterCondIVA && <Text>IVA: {emitterCondIVA}</Text>}
            {emitterIIBB && <Text>IIBB: {emitterIIBB}</Text>}
            {emitterActInicio && <Text>Inicio Act.: {emitterActInicio}</Text>}
          </View>
          <View style={styles.partyBox}>
            <Text style={styles.sectionTitle}>Receptor</Text>
            <Text>{recipient}</Text>
            <Text>DNI/CUIT: {DocNro}</Text>
            {recipientAddress && <Text>Domicilio: {recipientAddress}</Text>}
            {recipientCondIVA && <Text>IVA: {recipientCondIVA}</Text>}
          </View>
        </View>

        {/* Detalle de ítems */}
        <View style={styles.table}>
          <View style={styles.headerCell}>
            <Text style={styles.cellCode}>Código</Text>
            <Text style={styles.cellDesc}>Descripción</Text>
            <Text style={styles.cellNum}>Cant.</Text>
            <Text style={styles.cellNum}>Precio U.</Text>
            <Text style={styles.cellNum}>Subtotal</Text>
          </View>
          {items.map((it, i) => (
            <View
              key={i}
              style={i % 2 === 1 ? [styles.row, styles.rowAlt] : styles.row}
            >
              <Text style={styles.cellCode}>{it.code}</Text>
              <Text style={styles.cellDesc}>{it.description}</Text>
              <Text style={styles.cellNum}>{it.quantity}</Text>
              <Text style={styles.cellNum}>
                {safeFmtCurrency(it.unitPrice, currency)}
              </Text>
              <Text style={styles.cellNum}>
                {safeFmtCurrency(it.subtotal, currency)}
              </Text>
            </View>
          ))}
        </View>

        {/* Resumen de totales */}
        <View style={styles.summary}>
          <Text>Subtotal Neto: {safeFmtCurrency(ImpNeto, currency)}</Text>
          <Text>IVA: {safeFmtCurrency(ImpIVA, currency)}</Text>
          {ImpOtrosTributos !== undefined && (
            <Text>
              Otros Tributos: {safeFmtCurrency(ImpOtrosTributos, currency)}
            </Text>
          )}
          <Text style={{ fontWeight: "bold" }}>
            Total: {safeFmtCurrency(ImpTotal, currency)}
          </Text>
        </View>

        {/* QR y CAE */}
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
