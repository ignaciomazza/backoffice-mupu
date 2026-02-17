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
import { softWrapLongWords } from "@/lib/pdfText";

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
  recipient: {
    id?: number | null;
    label?: string | null;
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
    marginBottom: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    backgroundColor: "#f8fafc",
  },
  headerRow: { width: "100%", overflow: "hidden" },
  headerRightRow: { width: "100%", marginTop: 6 },
  headerLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    width: "100%",
    minWidth: 0,
  },
  headerLeftText: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: 320,
  },
  agencyName: { fontSize: 12, fontWeight: "bold", color: "#0f172a" },
  agencyMeta: { fontSize: 9, color: "#64748b" },
  logo: { height: 28, width: 120, objectFit: "contain", marginBottom: 4 },
  title: { fontSize: 14, fontWeight: "bold", textTransform: "uppercase" },
  subtitle: { fontSize: 9, marginBottom: 6, color: "#64748b" },
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
    recipient,
    bookingNumbers,
    services = [],
    agency,
  } = props;

  const agencyNameSafe = softWrapLongWords(agency.name, { breakChar: " " });
  const agencyLegalSafe = softWrapLongWords(agency.legalName, {
    breakChar: " ",
  });

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
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              {agency.logoBase64 && agency.logoMime && (
                // eslint-disable-next-line jsx-a11y/alt-text
                <Image
                  style={styles.logo}
                  src={`data:${agency.logoMime};base64,${agency.logoBase64}`}
                />
              )}
              <View style={styles.headerLeftText}>
                <Text style={styles.agencyName}>{agencyNameSafe}</Text>
                <Text style={styles.agencyMeta}>{agencyLegalSafe}</Text>
                <Text style={styles.agencyMeta}>CUIT: {agency.taxId}</Text>
                <Text style={styles.agencyMeta}>
                  {softWrapLongWords(agency.address, { breakChar: " " })}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.headerRightRow}>
            <Text style={styles.title}>Comprobante de pago</Text>
            <Text style={styles.subtitle}>Categoría: {category}</Text>
            <Text style={styles.subtitle}>N° {paymentNumber}</Text>
            <Text style={styles.subtitle}>Fecha: {fmtDate(issueDate)}</Text>
            {paidDate ? (
              <Text style={styles.subtitle}>Pagado: {fmtDate(paidDate)}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Destinatario</Text>
          <Text style={styles.listItem}>
            {softWrapLongWords(recipient.name, { breakChar: " " })}
          </Text>
          {recipient.label ? (
            <Text style={styles.listItem}>
              Tipo: {softWrapLongWords(recipient.label, { breakChar: " " })}
            </Text>
          ) : null}
          {recipient.id ? (
            <Text style={styles.listItem}>ID: {recipient.id}</Text>
          ) : null}
        </View>

        <View style={styles.amountBox}>
          <Text style={styles.amountLabel}>Monto total</Text>
          <Text style={styles.amountValue}>{displayAmount}</Text>
          <Text style={styles.amountMeta}>
            Categoría: {softWrapLongWords(category, { breakChar: " " })}
          </Text>
          <Text style={styles.amountMeta}>
            {softWrapLongWords(description, { breakChar: " " })}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detalle del pago</Text>
          <Text style={styles.listItem}>Moneda: {displayCurrency}</Text>
          {paymentMethod ? (
            <Text style={styles.listItem}>
              Método: {softWrapLongWords(paymentMethod, { breakChar: " " })}
            </Text>
          ) : null}
          {account ? (
            <Text style={styles.listItem}>
              Cuenta: {softWrapLongWords(account, { breakChar: " " })}
            </Text>
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
                {softWrapLongWords(
                  `Res. ${svc.bookingNumber ?? "-"} · Svc ${svc.serviceNumber ?? svc.id}${
                    svc.type ? ` · ${svc.type}` : ""
                  }${svc.destination ? ` · ${svc.destination}` : ""}${
                    typeof svc.cost === "number" && svc.currency
                      ? ` · ${safeFmtCurrency(svc.cost, svc.currency)}`
                      : ""
                  }`,
                  { breakChar: " " },
                )}
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
