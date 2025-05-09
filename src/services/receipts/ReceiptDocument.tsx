// src/services/receipts/ReceiptDocument.tsx
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";

export interface ReceiptHtmlData {
  receiptNumber: string;
  booking: {
    details: string;
    departure_date: Date;
    return_date: Date;
    titular: {
      first_name: string;
      last_name: string;
      dni_number: string;
      address?: string;
      locality?: string;
    };
    agency: {
      name: string;
      legal_name: string;
      tax_id: string;
      address: string;
      logoBase64?: string;
    };
  };
  concept: string;
  amountString: string;
  currency: string;
}

const styles = StyleSheet.create({
  page: { fontSize: 12, padding: 20 },
  header: { textAlign: "center", marginBottom: 20 },
  logo: { width: 100, marginBottom: 10, alignSelf: "center" },
  section: { marginBottom: 10 },
  label: { fontWeight: "bold" },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 20,
    right: 20,
    textAlign: "center",
    fontSize: 10,
    color: "#888",
  },
});

const ReceiptDocument: React.FC<ReceiptHtmlData> = ({
  receiptNumber,
  booking: { details, departure_date, return_date, titular, agency },
  concept,
  amountString,
  currency,
}) => {
  const formatDate = (d: Date) =>
    d.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {agency.logoBase64 && (
          <Image
            style={styles.logo}
            src={`data:image/png;base64,${agency.logoBase64}`}
          />
        )}
        <View style={styles.header}>
          <Text>RECIBO N° {receiptNumber}</Text>
        </View>

        <View style={styles.section}>
          <Text>
            <Text style={styles.label}>Fecha: </Text>
            {formatDate(new Date())}
          </Text>
        </View>

        <View style={styles.section}>
          <Text>
            <Text style={styles.label}>En concepto de: </Text>
            {concept}
          </Text>
          <Text>
            <Text style={styles.label}>Monto: </Text>
            {amountString} ({currency})
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Servicio:</Text>
          <Text>{details}</Text>
          <Text style={styles.label}>Salida:</Text>
          <Text>{formatDate(new Date(departure_date))}</Text>
          <Text style={styles.label}>Regreso:</Text>
          <Text>{formatDate(new Date(return_date))}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Cliente:</Text>
          <Text>
            {titular.first_name} {titular.last_name} – DNI {titular.dni_number}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Agencia:</Text>
          <Text>{agency.name}</Text>
          <Text>{agency.legal_name}</Text>
          <Text>CUIT: {agency.tax_id}</Text>
          <Text>Domicilio: {agency.address}</Text>
        </View>

        <Text style={styles.footer}>Gracias por su preferencia</Text>
      </Page>
    </Document>
  );
};

export default ReceiptDocument;
