// src/components/templates/ConfirmationDocument.tsx
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
import { Confirmation } from "@/types";

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

const styles = StyleSheet.create({
  page: {
    fontFamily: "Poppins",
    fontSize: 10,
    padding: 40,
    color: "#333",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  logo: { width: 80, height: 80 },
  title: {
    fontSize: 16,
    fontWeight: "bold",
    textTransform: "uppercase",
    textAlign: "center",
    flex: 1,
  },
  section: { marginBottom: 8 },
  label: { fontWeight: "bold" },
  servicesList: { marginLeft: 12 },
  serviceItem: { marginBottom: 4 },
  footer: {
    position: "absolute",
    bottom: 40,
    left: 40,
    right: 40,
    textAlign: "center",
    fontSize: 8,
    color: "#777",
  },
});

export default function ConfirmationDocument({
  confirmation,
  logoBase64,
}: {
  confirmation: Confirmation;
  logoBase64?: string;
}) {
  const {
    confirmationNumber,
    clientName,
    issueDate,
    expiryDate,
    paxCount,
    services,
    conditions,
    passengerData,
    total,
    currency,
  } = confirmation;

  const fmtDate = (d: string) => {
    const [y, m, day] = d.split("-"); // ISO yyyy-mm-dd
    return `${day}/${m}/${y}`;
  };

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
    }).format(v);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          {logoBase64 && (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image
              src={`data:image/png;base64,${logoBase64}`}
              style={styles.logo}
            />
          )}
          <Text style={styles.title}>Confirmación de Servicios</Text>
        </View>

        {/* Datos generales */}
        <View style={styles.section}>
          <Text>
            <Text style={styles.label}>N° Confirmación: </Text>
            {confirmationNumber}
          </Text>
          <Text>
            <Text style={styles.label}>Cliente: </Text>
            {clientName}
          </Text>
          <Text>
            <Text style={styles.label}>Emisión: </Text>
            {fmtDate(issueDate)}
            {expiryDate && (
              <>
                {" "}
                <Text style={styles.label}>| Vto: </Text>
                {fmtDate(expiryDate)}
              </>
            )}
          </Text>
          <Text>
            <Text style={styles.label}>Pasajeros: </Text>
            {paxCount}
          </Text>
        </View>

        {/* Servicios */}
        <View style={styles.section}>
          <Text style={styles.label}>Servicios:</Text>
          <View style={styles.servicesList}>
            {services.map((s, i) => (
              <Text key={i} style={styles.serviceItem}>
                • <Text style={{ fontWeight: "bold" }}>{s.title}:</Text>{" "}
                {s.detail}
              </Text>
            ))}
          </View>
        </View>

        {/* Condiciones */}
        <View style={styles.section}>
          <Text style={styles.label}>Cláusulas / Condiciones:</Text>
          <Text>{conditions}</Text>
        </View>

        {/* Datos de pasajeros */}
        {passengerData && (
          <View style={styles.section}>
            <Text style={styles.label}>Datos Pasajeros:</Text>
            <Text>{passengerData}</Text>
          </View>
        )}

        {/* Total */}
        <View style={styles.section}>
          <Text
            style={{ fontSize: 12, fontWeight: "bold", textAlign: "right" }}
          >
            Total: {fmtCurrency(total)}
          </Text>
        </View>

        {/* Footer */}
        <Text style={styles.footer} fixed>
          Gracias por elegirnos. Para más información, contactanos en Mupu
          Viajes.
        </Text>
      </Page>
    </Document>
  );
}
