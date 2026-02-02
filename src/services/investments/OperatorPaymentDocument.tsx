// src/services/investments/OperatorPaymentDocument.tsx
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

export type OperatorPaymentPdfData = {
  paymentNumber: string;
  issueDate: Date;
  paidDate?: Date | null;
  category: string;
  description: string;
  amount: number;
  currency: string;
  paymentMethod?: string | null;
  account?: string | null;
  base_amount?: number | null;
  base_currency?: string | null;
  counter_amount?: number | null;
  counter_currency?: string | null;
  operator: {
    id?: number | null;
    name: string;
  };
  bookingNumbers?: string[];
  services?: Array<{
    id: number;
    serviceNumber?: number | null;
    bookingNumber?: number | null;
    type?: string | null;
    destination?: string | null;
    cost?: number | null;
    currency?: string | null;
  }>;
  agency: {
    name: string;
    legalName: string;
    taxId: string;
    address: string;
    logoBase64?: string;
    logoMime?: string;
  };
};

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

const fmtNumber = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

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
    } catch {
      // fallback below
    }
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
    fontSize: 10,
    padding: 56,
    color: "#1f2937",
    lineHeight: 1.45,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    backgroundColor: "#f8fafc",
  },
  logo: { height: 28, width: 120, objectFit: "contain", marginBottom: 4 },
  agencyName: { fontSize: 12, fontWeight: "bold", color: "#0f172a" },
  agencyMeta: { fontSize: 9, color: "#64748b" },
  title: { fontSize: 14, fontWeight: "bold", textTransform: "uppercase" },
  subtitle: { fontSize: 9, color: "#64748b" },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 10,
    textTransform: "uppercase",
    color: "#0f172a",
  },
  section: {
    marginBottom: 18,
    padding: 10,
    borderRadius: 6,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  amountBox: {
    marginTop: 10,
    marginBottom: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "#cbd5f5",
    borderRadius: 6,
    backgroundColor: "#eef2ff",
  },
  amountLabel: { fontSize: 9, fontWeight: "bold", color: "#475569" },
  amountValue: { fontSize: 16, fontWeight: "bold", color: "#0f172a" },
  amountMeta: { fontSize: 8.5, color: "#64748b", marginTop: 3 },
  listItem: { fontSize: 9, marginBottom: 2, color: "#1f2937" },
});

export default function OperatorPaymentDocument(props: OperatorPaymentPdfData) {
  const {
    paymentNumber,
    issueDate,
    paidDate,
    category,
    description,
    amount,
    currency,
    paymentMethod,
    account,
    base_amount,
    base_currency,
    counter_amount,
    counter_currency,
    operator,
    bookingNumbers,
    services = [],
    agency,
  } = props;

  const displayCurrency = currency || "ARS";
  const displayAmount = safeFmtCurrency(amount, displayCurrency);
  const hasBase =
    typeof base_amount === "number" &&
    Number.isFinite(base_amount) &&
    !!base_currency;
  const hasCounter =
    typeof counter_amount === "number" &&
    Number.isFinite(counter_amount) &&
    !!counter_currency;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            {agency.logoBase64 && agency.logoMime && (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image
                style={styles.logo}
                src={`data:${agency.logoMime};base64,${agency.logoBase64}`}
              />
            )}
            <Text style={styles.agencyName}>{agency.name}</Text>
            <Text style={styles.agencyMeta}>{agency.legalName}</Text>
            <Text style={styles.agencyMeta}>CUIT: {agency.taxId}</Text>
            <Text style={styles.agencyMeta}>{agency.address}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.title}>Comprobante de pago</Text>
            <Text style={styles.subtitle}>Operador</Text>
            <Text style={styles.subtitle}>N° {paymentNumber}</Text>
            <Text style={styles.subtitle}>Fecha: {fmtDate(issueDate)}</Text>
            {paidDate ? (
              <Text style={styles.subtitle}>Pagado: {fmtDate(paidDate)}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Operador</Text>
          <Text style={styles.listItem}>{operator.name}</Text>
          {operator.id ? (
            <Text style={styles.listItem}>ID: {operator.id}</Text>
          ) : null}
        </View>

        <View style={styles.amountBox}>
          <Text style={styles.amountLabel}>Monto total</Text>
          <Text style={styles.amountValue}>{displayAmount}</Text>
          <Text style={styles.amountMeta}>Categoría: {category}</Text>
          <Text style={styles.amountMeta}>{description}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detalle del pago</Text>
          <Text style={styles.listItem}>Moneda: {displayCurrency}</Text>
          {paymentMethod ? (
            <Text style={styles.listItem}>Método: {paymentMethod}</Text>
          ) : null}
          {account ? (
            <Text style={styles.listItem}>Cuenta: {account}</Text>
          ) : null}
          {hasBase ? (
            <Text style={styles.listItem}>
              Valor base: {safeFmtCurrency(base_amount!, base_currency!)}
            </Text>
          ) : null}
          {hasCounter ? (
            <Text style={styles.listItem}>
              Contravalor: {safeFmtCurrency(counter_amount!, counter_currency!)}
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Servicios asociados</Text>
          {bookingNumbers && bookingNumbers.length > 0 ? (
            <Text style={styles.listItem}>
              Reservas: {bookingNumbers.join(", ")}
            </Text>
          ) : null}
          {services.length > 0 ? (
            services.map((svc) => (
              <Text key={svc.id} style={styles.listItem}>
                Res. {svc.bookingNumber ?? "-"} · Svc{" "}
                {svc.serviceNumber ?? svc.id}
                {svc.type ? ` · ${svc.type}` : ""}
                {svc.destination ? ` · ${svc.destination}` : ""}
                {typeof svc.cost === "number" && svc.currency
                  ? ` · ${safeFmtCurrency(svc.cost, svc.currency)}`
                  : ""}
              </Text>
            ))
          ) : (
            <Text style={styles.listItem}>Sin servicios asociados.</Text>
          )}
        </View>
      </Page>
    </Document>
  );
}
