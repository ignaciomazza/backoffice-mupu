// src/services/receipts/ReceiptDocument.tsx
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

export interface ReceiptPdfData {
  receiptNumber: string;
  issueDate: Date;
  concept: string;
  amount: number;
  amountString: string;
  currency: string; // método de pago global
  amount_currency: string;
  services: Array<{
    id: number;
    description: string;
    salePrice: number;
    cardInterest: number;
    currency: string; // ISO o texto libre
  }>;
  booking: {
    details: string;
    departureDate: Date;
    returnDate: Date;
    titular: {
      firstName: string;
      lastName: string;
      dni: string;
      address: string;
      locality: string;
    };
    agency: {
      name: string;
      legalName: string;
      taxId: string;
      address: string;
      logoBase64?: string;
    };
  };
  recipients: Array<{
    firstName: string;
    lastName: string;
    dni: string;
    address: string;
    locality: string;
  }>;
}

// Registrar Poppins
Font.register({
  family: "Poppins",
  fonts: [
    {
      src: path.join(process.cwd(), "public", "poppins", "Poppins-Regular.ttf"),
      fontWeight: "normal",
    },
    {
      src: path.join(process.cwd(), "public", "poppins", "Poppins-Bold.ttf"),
      fontWeight: "bold",
    },
  ],
});

// Números con separadores y dos decimales
const fmtNumber = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

// Moneda con Intl o fallback
const fmtCurrency = (value: number, curr: string) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: curr,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const safeFmtCurrency = (value: number, curr: string) => {
  if (/^[A-Z]{3}$/.test(curr)) {
    try {
      return fmtCurrency(value, curr);
    } catch {}
  }
  return `${fmtNumber(value)} ${curr}`;
};

const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat("es-AR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);

const styles = StyleSheet.create({
  page: {
    fontFamily: "Poppins",
    fontSize: 11,
    paddingTop: 40,
    paddingHorizontal: 60,
    paddingBottom: 60,
    lineHeight: 1.4,
    color: "#0A0A0A",
    position: "relative",
  },
  headerBand: {
    height: 50,
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 60,
  },
  logoSmall: { height: 40 },
  header: { color: "#0A0A0A" },
  headerText: { fontSize: 14, textTransform: "uppercase", marginBottom: 4 },
  headerDate: { fontSize: 8, fontWeight: "light", color: "#555" },
  infoSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  infoColumn: { width: "46%" },
  infoLabel: { fontWeight: "bold", marginBottom: 4, color: "#555" },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 16,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#555",
  },
  tableContainer: {
    borderWidth: 1,
    borderRadius: 15,
    borderColor: "#0A0A0A",
    marginBottom: 40,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#0A0A0A",
    borderWidth: 1,
    borderColor: "#0A0A0A",
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  tableHeaderCell: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontWeight: "bold",
    color: "#FFF",
  },
  tableRow: { flexDirection: "row" },
  tableRowAlt: { backgroundColor: "#0A0A0A", color: "#FFF" },
  tableCell: { paddingHorizontal: 12, paddingVertical: 8 },
  colDescription: { width: "100%" },
  footerContainer: {
    position: "absolute",
    bottom: 10,
    left: 60,
    right: 60,
    textAlign: "center",
    lineHeight: 1.2,
  },
  footerText: { fontSize: 9, color: "#888" },
});

const ReceiptDocument: React.FC<ReceiptPdfData> = ({
  receiptNumber,
  issueDate,
  concept,
  amount,
  amountString,
  currency,
  services,
  amount_currency,
  booking: { details, departureDate, returnDate, agency },
  recipients,
}) => {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Banda y logo */}
        <View style={styles.headerBand}>
          {agency.logoBase64 && (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image
              style={styles.logoSmall}
              src={`data:image/png;base64,${agency.logoBase64}`}
            />
          )}
          <View style={styles.header}>
            <Text style={styles.headerText}>Recibo N° {receiptNumber}</Text>
            <Text style={styles.headerDate}>
              {fmtDate(new Date(issueDate))}
            </Text>
          </View>
        </View>
        {/* Cliente(s) / Agencia */}
        <View style={styles.infoSection}>
          <View style={styles.infoColumn}>
            <Text style={styles.infoLabel}>Cliente(s)</Text>
            {recipients.map((r, i) => (
              <View key={i} style={{ marginBottom: 4 }}>
                <Text>
                  {r.firstName} {r.lastName} – DNI {r.dni}
                </Text>
                <Text>
                  {r.address}, {r.locality}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.infoColumn}>
            <Text style={styles.infoLabel}>Agencia</Text>
            <Text>
              {agency.name} ({agency.legalName})
            </Text>
            <Text>CUIT: {agency.taxId}</Text>
            <Text>{agency.address}</Text>
          </View>
        </View>
        {/* Servicios */}
        <Text style={styles.sectionTitle}>Detalle de servicios</Text>
        <View style={styles.tableContainer}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.colDescription]}>
              Descripción
            </Text>
          </View>
          {services.map((svc, i) => (
            <View
              key={svc.id}
              style={[
                styles.tableRow,
                ...(i % 2 === 1 ? [styles.tableRowAlt] : []),
              ]}
            >
              <Text style={[styles.tableCell, styles.colDescription]}>
                {svc.description}
              </Text>
            </View>
          ))}
        </View>
        {/* Monto y método */}
        <View style={styles.infoSection}>
          <View style={styles.infoColumn}>
            <Text style={styles.infoLabel}>En concepto de</Text>
            <Text>{concept}</Text>
          </View>
          <View style={styles.infoColumn}>
            <Text style={styles.infoLabel}>EL CLIENTE PAGO</Text>
            <Text>{safeFmtCurrency(amount, amount_currency)}</Text>
          </View>
        </View>
        <View style={styles.infoSection}>
          <View style={styles.infoColumn}>
            <Text style={styles.infoLabel}>Monto</Text>
            <Text>{amountString}</Text>
          </View>
          <View style={styles.infoColumn}>
            <Text style={styles.infoLabel}>Método de pago</Text>
            <Text>{currency}</Text>
          </View>
        </View>
        {/* Pie */}
        <View style={styles.footerContainer} fixed>
          <Text style={styles.footerText}>
            Este comprobante no es válido como factura.
          </Text>
        </View>

        {/* Pago y firma */}
        <View style={styles.infoSection}>
          <View style={styles.infoColumn}>
            <Text style={styles.infoLabel}>Servicio contratado</Text>
            <Text>{details}</Text>
          </View>
          <View style={styles.infoColumn}>
            <Text style={styles.infoLabel}>
              Servicio contratado Desde - Hasta
            </Text>
            <Text>
              {fmtDate(new Date(departureDate))} -{" "}
              {fmtDate(new Date(returnDate))}
            </Text>
          </View>
        </View>

        {/* Pie de página estático */}
        <View style={styles.footerContainer} fixed>
          <Text style={styles.footerText}>
            Este comprobante no es válido como factura.
          </Text>
        </View>
      </Page>
    </Document>
  );
};

export default ReceiptDocument;
