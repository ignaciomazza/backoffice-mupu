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

/** Línea de pago para el PDF */
export type ReceiptPdfPaymentLine = {
  amount: number;
  payment_method_id: number | null;
  account_id: number | null;

  // si se resolvió con lookup
  paymentMethodName?: string;
  accountName?: string;
};

export interface ReceiptPdfData {
  receiptNumber: string;
  issueDate: Date;
  concept: string;
  amount: number;
  amountString: string;

  /** Texto legacy (no lo usamos como “método”, lo dejamos por compat) */
  currency: string;

  /** ISO del monto total (ARS/USD) */
  amount_currency: string;

  /** NUEVO */
  paymentFeeAmount?: number;
  payments?: ReceiptPdfPaymentLine[];

  services: Array<{
    id: number;
    description: string;
    salePrice: number;
    cardInterest: number;
    currency: string;
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
      logoMime?: string;
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

/* ====== Fuentes (servidor) ====== */
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

/* ====== Utils ====== */
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
      // fallback abajo
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

const CREDIT_METHOD_LABEL = "Crédito operador";
const VIRTUAL_CREDIT_METHOD_ID = 999000000;

const paymentLabel = (p: ReceiptPdfPaymentLine) => {
  const isVirtualCredit =
    typeof p.payment_method_id === "number" &&
    p.payment_method_id >= VIRTUAL_CREDIT_METHOD_ID;

  const pm =
    (p.paymentMethodName && p.paymentMethodName.trim()) ||
    (isVirtualCredit
      ? CREDIT_METHOD_LABEL
      : p.payment_method_id
        ? `Método #${p.payment_method_id}`
        : "Método");

  const acc =
    (p.accountName && p.accountName.trim()) ||
    (p.account_id ? `Cuenta #${p.account_id}` : "");

  return acc ? `${pm} (${acc})` : pm;
};

/* ====== Estilos ====== */
const styles = StyleSheet.create({
  page: {
    fontFamily: "Poppins",
    fontSize: 10,
    padding: 60,
    color: "#333",
    lineHeight: 1.35,
  },
  headerBand: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    borderRadius: 6,
    marginBottom: 12,
  },
  logo: { height: 30 },
  headerRight: {
    alignItems: "flex-end",
    gap: 2,
  },
  docTitle: {
    fontSize: 14,
    fontWeight: "bold",
    textTransform: "uppercase",
    color: "#555",
  },
  docSub: { fontSize: 9, color: "#555" },

  sectionTitle: {
    fontSize: 12,
    fontWeight: "bold",
    marginTop: 6,
    marginBottom: 6,
    textTransform: "uppercase",
    color: "#555",
  },

  twoCols: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },
  col: { width: "48%" },

  infoBox: {
    backgroundColor: "#fafafa",
    padding: 8,
    borderRadius: 4,
  },
  infoLabel: { fontWeight: "bold", color: "#555", marginBottom: 2 },
  infoText: { fontSize: 9.5 },

  table: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 12,
    marginTop: 4,
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
  rowAlt: { backgroundColor: "#fcfcfc" },
  cellDesc: { width: "100%", padding: 6, fontSize: 9 },

  divider: {
    height: 1,
    backgroundColor: "#e5e5e5",
    marginVertical: 10,
  },

  footer: {
    fontSize: 8,
    textAlign: "center",
    marginTop: 24,
    color: "#777",
  },

  payLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 3,
  },
  payLeft: { fontSize: 9.5, color: "#333" },
  payRight: { fontSize: 9.5, color: "#333" },
  payMeta: { fontSize: 8.5, color: "#666" },
});

/* ====== Componente ====== */
const ReceiptDocument: React.FC<ReceiptPdfData> = ({
  receiptNumber,
  issueDate,
  concept,
  amount,
  amountString,
  amount_currency,
  paymentFeeAmount,
  payments,
  services,
  booking: { details, departureDate, returnDate, agency },
  recipients,
}) => {
  const logoSrc =
    agency.logoBase64 && (agency.logoMime || "image/png")
      ? `data:${agency.logoMime || "image/png"};base64,${agency.logoBase64}`
      : undefined;

  const safePayments = Array.isArray(payments) ? payments : [];
  const fee =
    typeof paymentFeeAmount === "number" && Number.isFinite(paymentFeeAmount)
      ? paymentFeeAmount
      : 0;
  const clientTotal = amount + fee;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Cabecera */}
        <View style={styles.headerBand}>
          {logoSrc ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image style={styles.logo} src={logoSrc} />
          ) : (
            <View style={{ height: 30, width: 90 }} />
          )}
          <View style={styles.headerRight}>
            <Text style={styles.docTitle}>Recibo</Text>
            <Text style={styles.docSub}>N° {receiptNumber}</Text>
            <Text style={styles.docSub}>{fmtDate(new Date(issueDate))}</Text>
          </View>
        </View>

        {/* Datos */}
        <Text style={styles.sectionTitle}>Datos</Text>
        <View style={styles.twoCols}>
          <View style={styles.col}>
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>Cliente(s)</Text>
              {recipients.map((r, i) => (
                <View key={i} style={{ marginBottom: 4 }}>
                  <Text style={styles.infoText}>
                    {r.firstName} {r.lastName} – DNI {r.dni}
                  </Text>
                  <Text style={styles.infoText}>
                    {r.address}, {r.locality}
                  </Text>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.col}>
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>Agencia</Text>
              <Text style={styles.infoText}>
                {agency.name} ({agency.legalName})
              </Text>
              <Text style={styles.infoText}>CUIT: {agency.taxId}</Text>
              <Text style={styles.infoText}>{agency.address}</Text>
            </View>
          </View>
        </View>

        {/* Servicios */}
        <Text style={styles.sectionTitle}>Detalle de servicios</Text>
        <View style={styles.table}>
          <View style={styles.headerCell}>
            <Text style={styles.cellDesc}>Descripción</Text>
          </View>
          {services.map((svc, i) => (
            <View
              key={svc.id}
              style={i % 2 ? [styles.row, styles.rowAlt] : styles.row}
            >
              <Text style={styles.cellDesc}>{svc.description}</Text>
            </View>
          ))}
        </View>

        {/* Concepto / Total */}
        <View style={styles.twoCols}>
          <View style={styles.col}>
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>En concepto de</Text>
              <Text style={styles.infoText}>{concept}</Text>
            </View>
          </View>
          <View style={styles.col}>
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>Total recibido</Text>
              <Text style={styles.infoText}>
                {safeFmtCurrency(clientTotal, amount_currency)}
              </Text>
              {fee > 0 ? (
                <Text style={styles.payMeta}>
                  Incluye {safeFmtCurrency(amount, amount_currency)} acreditados
                  + costo financiero {safeFmtCurrency(fee, amount_currency)}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* Monto en letras / Pagos */}
        <View style={styles.twoCols}>
          <View style={styles.col}>
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>Monto en letras</Text>
              <Text style={styles.infoText}>{amountString}</Text>
            </View>
          </View>
          <View style={styles.col}>
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>Pagos</Text>

              {safePayments.length ? (
                safePayments.map((p, idx) => (
                  <View key={idx} style={styles.payLine}>
                    <Text style={styles.payLeft}>{paymentLabel(p)}</Text>
                    <Text style={styles.payRight}>
                      {safeFmtCurrency(p.amount, amount_currency)}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.infoText}>-</Text>
              )}
            </View>
          </View>
        </View>

        {/* Servicio contratado */}
        <Text style={styles.sectionTitle}>Servicio contratado</Text>
        <View style={styles.twoCols}>
          <View style={styles.col}>
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>Detalle</Text>
              <Text style={styles.infoText}>{details}</Text>
            </View>
          </View>
          <View style={styles.col}>
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>Desde / Hasta</Text>
              <Text style={styles.infoText}>
                {fmtDate(new Date(departureDate))} -{" "}
                {fmtDate(new Date(returnDate))}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.divider} />
        <Text style={styles.footer} fixed>
          Este comprobante no es válido como factura.
        </Text>
      </Page>
    </Document>
  );
};

export default ReceiptDocument;
