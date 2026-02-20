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
import type { CreditNoteItem } from "@prisma/client";
import { formatDateOnlyInBuenosAires } from "@/lib/buenosAiresDate";

export interface VoucherData {
  CbteTipo: number; // 3: NC A, 8: NC B
  PtoVta: number;
  CbteDesde: number;
  CbteFch: string | number | Date;
  ImpTotal: number;
  ImpNeto: number;
  ImpIVA: number;
  CAE: string;
  CAEFchVto: string;
  DocNro: number;
  emitterName: string;
  emitterLegalName: string;
  emitterTaxId?: string;
  emitterAddress?: string;
  recipient: string;
  departureDate?: string;
  returnDate?: string;
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

const fmtDate = (raw: string | number | Date): string => {
  const s = raw?.toString();
  const normalized =
    /^\d{8}$/.test(s || "")
      ? `${s!.slice(0, 4)}-${s!.slice(4, 6)}-${s!.slice(6, 8)}`
      : raw;
  const formatted = formatDateOnlyInBuenosAires(normalized);
  return formatted === "-" ? String(s || "") : formatted;
};

const safeFmtCurrency = (value: number, curr: string): string => {
  let code = (curr || "").toUpperCase();
  if (code === "PES") code = "ARS";
  if (code === "DOL" || code === "U$S") code = "USD";
  try {
    if (code === "ARS" || code === "USD") {
      return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: code,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    }
  } catch {
    // ignore
  }
  return `${(value ?? 0).toFixed(2)} ${code || ""}`;
};

const styles = StyleSheet.create({
  page: { fontFamily: "Poppins", fontSize: 10, padding: 60, color: "#333" },
  headerBand: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    borderRadius: 6,
    marginBottom: 12,
  },
  logo: { height: 30 },
  noteType: {
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
  title: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "bold",
    textTransform: "uppercase",
    marginBottom: 12,
    color: "#555",
  },
  infoTable: { marginBottom: 12 },
  infoRow: { flexDirection: "row", marginBottom: 4 },
  infoLabel: { width: "15%", fontWeight: "bold", color: "#555" },
  infoValue: { width: "25%" },
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
  row: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#eee" },
  rowAlt: { backgroundColor: "#fcfcfc" },
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

const CreditNoteDocument: React.FC<{
  creditNumber: string;
  issueDate: Date;
  currency: string;
  qrBase64?: string;
  logoBase64?: string;
  logoMime?: string;
  voucherData: VoucherData;
  items: CreditNoteItem[];
}> = ({ currency, qrBase64, logoBase64, logoMime, voucherData, items }) => {
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
    emitterName,
    emitterLegalName,
    emitterTaxId,
    emitterAddress,
    recipient,
    departureDate,
    returnDate,
  } = voucherData;

  const fechaEm = fmtDate(CbteFch);
  const caeVto = fmtDate(CAEFchVto);

  const rows = items.map((it) => ({
    code: it.serviceId?.toString() || "-",
    description: it.description,
    quantity: 1,
    unitPrice: it.sale_price,
    subtotal: it.sale_price,
  }));

  const logoSrc = logoBase64
    ? `data:${logoMime || "image/png"};base64,${logoBase64}`
    : undefined;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.headerBand}>
          {logoSrc && (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image style={styles.logo} src={logoSrc} />
          )}
          <Text style={styles.noteType}>
            {CbteTipo === 3 ? "NC A" : CbteTipo === 8 ? "NC B" : "NC"}
          </Text>
        </View>

        {/* Title */}
        <Text style={styles.title}>Nota de Crédito Electrónica</Text>

        {/* Info */}
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
              <Text style={styles.infoValue}>
                {departureDate && fmtDate(departureDate)}
                {returnDate && ` al ${fmtDate(returnDate)}`}
              </Text>
            </View>
          )}
        </View>

        {/* Parties */}
        <View style={styles.parties}>
          <View style={styles.partyBox}>
            <Text style={styles.sectionTitle}>Emisor</Text>
            <Text>{emitterName}</Text>
            <Text>Razón social: {emitterLegalName}</Text>
            <Text>CUIT: {emitterTaxId}</Text>
            <Text>Domicilio: {emitterAddress}</Text>
          </View>
          <View style={styles.partyBox}>
            <Text style={styles.sectionTitle}>Receptor</Text>
            <Text>{recipient}</Text>
            <Text>DNI/CUIT: {DocNro}</Text>
          </View>
        </View>

        {/* Items */}
        <View style={styles.table}>
          <View style={styles.headerCell}>
            <Text style={styles.cellCode}>Código</Text>
            <Text style={styles.cellDesc}>Descripción</Text>
            <Text style={styles.cellNum}>Cant.</Text>
            <Text style={styles.cellNum}>Precio U.</Text>
            <Text style={styles.cellNum}>Subtotal</Text>
          </View>
          {rows.map((it, i) => (
            <View
              key={i}
              style={i % 2 ? [styles.row, styles.rowAlt] : styles.row}
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

        {/* Summary */}
        <View style={styles.summary}>
          <Text>Neto: {safeFmtCurrency(ImpNeto, currency)}</Text>
          <Text>IVA: {safeFmtCurrency(ImpIVA, currency)}</Text>
          <Text style={{ fontWeight: "bold" }}>
            Total: {safeFmtCurrency(ImpTotal, currency)}
          </Text>
        </View>

        {qrBase64 && (
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image style={styles.qr} src={qrBase64} />
        )}
        <Text>CAE N°: {CAE}</Text>
        <Text>Vto. CAE: {caeVto}</Text>

        <Text style={styles.footer} fixed>
          Este comprobante es copia fiel de la nota de crédito electrónica.
        </Text>
      </Page>
    </Document>
  );
};

export default CreditNoteDocument;
