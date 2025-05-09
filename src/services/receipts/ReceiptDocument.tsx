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

// Fecha con mes capitalizado
const fmtDate = (d: Date) => {
  const day = d.getDate().toString().padStart(2, "0");
  const monthName = new Intl.DateTimeFormat("es-AR", { month: "long" }).format(
    d,
  );
  const month = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  return `${day} de ${month} de ${d.getFullYear()}`;
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Poppins",
    fontSize: 11,
    paddingTop: 40,
    paddingHorizontal: 60,
    paddingBottom: 60, // deja espacio para el footer
    lineHeight: 1.4,
    color: "#333",
    position: "relative",
  },
  headerBand: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  logoSmall: { height: 30 },
  header: { textAlign: "center", marginBottom: 40 },
  headerText: {
    fontSize: 20,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  infoSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  infoColumn: { width: "46%" },
  infoLabel: {
    fontWeight: "bold",
    marginBottom: 4,
    color: "#555",
  },
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
    borderColor: "#DDD",
    marginBottom: 40,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#F2F2F2",
    borderBottomWidth: 1,
    borderColor: "#DDD",
  },
  tableHeaderCell: {
    padding: 8,
    fontWeight: "bold",
    color: "#333",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: "#EEE",
    backgroundColor: "#FFF",
  },
  tableRowAlt: {
    backgroundColor: "#F9F9F9",
  },
  tableCell: {
    padding: 8,
    color: "#333",
  },
  colDescription: { width: "60%" },
  colPrice: { width: "20%", textAlign: "right" },
  colInterest: { width: "20%", textAlign: "right" },
  paymentSection: {
    marginTop: 20,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  signatureLine: {
    marginTop: 40,
    borderTopWidth: 1,
    borderColor: "#AAA",
    width: "40%",
  },
  footerContainer: {
    position: "absolute",
    bottom: 10,
    left: 60,
    right: 60,
    textAlign: "center",
    lineHeight: 1.2,
  },
  footerText: {
    fontSize: 9,
    color: "#888",
  },
});

const ReceiptDocument: React.FC<ReceiptPdfData> = ({
  receiptNumber,
  issueDate,
  concept,
  amount,
  amountString,
  currency,
  services,
  booking: { details, departureDate, returnDate, titular, agency },
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
        </View>

        {/* Título */}
        <View style={styles.header}>
          <Text style={styles.headerText}>Recibo N° {receiptNumber}</Text>
        </View>

        {/* Info básica */}
        <View style={styles.infoSection}>
          <View style={styles.infoColumn}>
            <Text style={styles.infoLabel}>Fecha emisión</Text>
            <Text>{fmtDate(new Date(issueDate))}</Text>
          </View>
          <View style={styles.infoColumn}>
            <Text style={styles.infoLabel}>En concepto de</Text>
            <Text>{concept}</Text>
          </View>
        </View>

        {/* Servicios */}
        <Text style={styles.sectionTitle}>Detalle de servicios</Text>
        <View style={styles.tableContainer}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.colDescription]}>
              Descripción
            </Text>
            <Text style={[styles.tableHeaderCell, styles.colPrice]}>
              Precio
            </Text>
            <Text style={[styles.tableHeaderCell, styles.colInterest]}>
              Interés
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
              <Text style={[styles.tableCell, styles.colPrice]}>
                {safeFmtCurrency(svc.salePrice, svc.currency)}
              </Text>
              <Text style={[styles.tableCell, styles.colInterest]}>
                {safeFmtCurrency(svc.cardInterest, svc.currency)}
              </Text>
            </View>
          ))}
        </View>

        {/* Monto total por moneda */}
        <View style={styles.infoSection}>
          <View style={styles.infoColumn}>
            <Text style={styles.infoLabel}>EL CLIENTE PAGO</Text>
            <Text>{safeFmtCurrency(amount, "ARS")}</Text>
          </View>
        </View>

        {/* Monto en letras / Servicio contratado */}
        <View style={styles.infoSection}>
          <View style={styles.infoColumn}>
            <Text style={styles.infoLabel}>Monto</Text>
            <Text>{amountString}</Text>
          </View>
          <View style={styles.infoColumn}>
            <Text style={styles.infoLabel}>Servicio contratado</Text>
            <Text>{details}</Text>
          </View>
        </View>

        {/* Fechas */}
        <View style={styles.infoSection}>
          <View style={styles.infoColumn}>
            <Text style={styles.infoLabel}>Fecha salida</Text>
            <Text>{fmtDate(new Date(departureDate))}</Text>
          </View>
          <View style={styles.infoColumn}>
            <Text style={styles.infoLabel}>Fecha regreso</Text>
            <Text>{fmtDate(new Date(returnDate))}</Text>
          </View>
        </View>

        {/* Cliente / Agencia */}
        <View style={styles.infoSection}>
          <View style={styles.infoColumn}>
            <Text style={styles.infoLabel}>Cliente</Text>
            <Text>
              {titular.firstName} {titular.lastName} – DNI {titular.dni}
            </Text>
            <Text>
              {titular.address}, {titular.locality}
            </Text>
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

        {/* Pago y firma */}
        <View style={styles.paymentSection}>
          <View>
            <Text style={styles.infoLabel}>Método de pago</Text>
            <Text>{currency}</Text>
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
