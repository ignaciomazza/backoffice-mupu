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
import { softWrapLongWords } from "@/lib/pdfText";

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

  /** Detalle libre para el PDF (método de pago / notas) */
  currency: string;

  /** ISO del monto total (ARS/USD) */
  amount_currency: string;

  /** NUEVO */
  paymentFeeAmount?: number;
  payments?: ReceiptPdfPaymentLine[];

  /** Conversión (valor / contravalor) */
  base_amount?: number | null;
  base_currency?: string | null;
  counter_amount?: number | null;
  counter_currency?: string | null;

  services: Array<{
    id: number;
    description: string;
    salePrice: number;
    cardInterest: number;
    currency: string;
    departureDate?: string | Date | null;
    returnDate?: string | Date | null;
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

const toValidDate = (value?: string | Date | null) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatServiceRange = (svc: {
  departureDate?: string | Date | null;
  returnDate?: string | Date | null;
}) => {
  const dep = toValidDate(svc.departureDate);
  const ret = toValidDate(svc.returnDate);
  if (dep && ret) {
    const depLabel = fmtDate(dep);
    const retLabel = fmtDate(ret);
    return depLabel === retLabel ? depLabel : `${depLabel} - ${retLabel}`;
  }
  if (dep) return fmtDate(dep);
  if (ret) return fmtDate(ret);
  return "—";
};

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
        ? `Método N° ${p.payment_method_id}`
        : "Método");

  const acc =
    (p.accountName && p.accountName.trim()) ||
    (p.account_id ? `Cuenta N° ${p.account_id}` : "");

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
    padding: 12,
    borderRadius: 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
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
  headerLeftText: { flexGrow: 1, flexShrink: 1, minWidth: 0, maxWidth: 320 },
  agencyName: { fontSize: 10, fontWeight: "bold", color: "#0f172a" },
  agencyMeta: { fontSize: 8.5, color: "#64748b" },
  logo: { height: 30, width: 120, objectFit: "contain" },
  docTitle: {
    fontSize: 14,
    marginBottom: 6,
    fontWeight: "bold",
    textTransform: "uppercase",
    color: "#0f172a",
  },
  docSub: { fontSize: 9, color: "#64748b" },

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
    backgroundColor: "#f8fafc",
    padding: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  infoLabel: { fontWeight: "bold", color: "#555", marginBottom: 2 },
  infoText: { fontSize: 9.5 },
  amountBox: {
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#cbd5f5",
    backgroundColor: "#eef2ff",
  },
  amountValue: { fontSize: 14, fontWeight: "bold", color: "#0f172a" },
  amountMeta: { fontSize: 8.5, color: "#64748b", marginTop: 2 },

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
  cellDesc: { width: "70%", padding: 6, fontSize: 9 },
  cellDate: {
    width: "30%",
    padding: 6,
    fontSize: 9,
    textAlign: "right",
    color: "#333",
  },

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
  currency,
  amount_currency,
  paymentFeeAmount,
  payments,
  base_amount,
  base_currency,
  counter_amount,
  counter_currency,
  services,
  booking: { details, departureDate, returnDate, agency },
  recipients,
}) => {
  const logoSrc =
    agency.logoBase64 && (agency.logoMime || "image/png")
      ? `data:${agency.logoMime || "image/png"};base64,${agency.logoBase64}`
      : undefined;
  const agencyNameSafe = softWrapLongWords(agency.name, { breakChar: " " });
  const agencyLegalSafe = softWrapLongWords(agency.legalName, {
    breakChar: " ",
  });

  const safePayments = Array.isArray(payments) ? payments : [];
  const fee =
    typeof paymentFeeAmount === "number" && Number.isFinite(paymentFeeAmount)
      ? paymentFeeAmount
      : 0;
  const clientTotal = amount + fee;
  const hasBase = base_amount != null && !!base_currency;
  const hasCounter = counter_amount != null && !!counter_currency;
  const displayAmount = hasBase ? Number(base_amount) : amount;
  const displayCurrency = hasBase
    ? base_currency || amount_currency
    : amount_currency;
  const hideAltValues =
    hasBase &&
    base_currency &&
    amount_currency &&
    base_currency !== amount_currency;
  const counterAmount = hasCounter ? Number(counter_amount) : amount;
  const counterCurrency = hasCounter
    ? counter_currency || amount_currency
    : amount_currency;
  const showCounter = hasCounter && !hideAltValues;
  const showPaymentAmounts = !hideAltValues;
  const paymentDetail = (currency || "").trim();
  const showPaymentDetail =
    paymentDetail.length > 0 && !/^[A-Z]{3}$/.test(paymentDetail);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Cabecera */}
        <View style={styles.headerBand}>
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              {logoSrc ? (
                // eslint-disable-next-line jsx-a11y/alt-text
                <Image style={styles.logo} src={logoSrc} />
              ) : (
                <View style={{ height: 30, width: 90 }} />
              )}
              <View style={styles.headerLeftText}>
                <Text style={styles.agencyName}>{agencyNameSafe}</Text>
                <Text style={styles.agencyMeta}>{agencyLegalSafe}</Text>
                <Text style={styles.agencyMeta}>CUIT {agency.taxId}</Text>
              </View>
            </View>
          </View>
          <View style={styles.headerRightRow}>
            <Text style={styles.docTitle}>Recibo de pago</Text>
            <Text style={styles.docSub}>Nro {receiptNumber}</Text>
            <Text style={styles.docSub}>{fmtDate(new Date(issueDate))}</Text>
          </View>
        </View>

        {/* Datos */}
        <Text style={styles.sectionTitle}>Datos</Text>
        <View style={styles.twoCols}>
          <View style={styles.col}>
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>Pasajeros</Text>
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
                {agencyNameSafe} ({agencyLegalSafe})
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
            <Text style={styles.cellDate}>Fecha</Text>
          </View>
          {services.map((svc, i) => (
            <View
              key={svc.id}
              style={i % 2 ? [styles.row, styles.rowAlt] : styles.row}
            >
              <Text style={styles.cellDesc}>{svc.description}</Text>
              <Text style={styles.cellDate}>{formatServiceRange(svc)}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Resumen de pago</Text>
        <View style={styles.twoCols}>
          <View style={styles.col}>
            <View style={styles.amountBox}>
              <Text style={styles.infoLabel}>
                {hasBase ? "Importe aplicado" : "Total cobrado"}
              </Text>
              <Text style={styles.amountValue}>
                {safeFmtCurrency(
                  hasBase ? displayAmount : clientTotal,
                  hasBase ? displayCurrency : amount_currency,
                )}
              </Text>
              {showCounter ? (
                <Text style={styles.amountMeta}>
                  Contravalor: {safeFmtCurrency(counterAmount, counterCurrency)}
                </Text>
              ) : null}
              {!hasBase && fee > 0 ? (
                <Text style={styles.amountMeta}>
                  Incluye {safeFmtCurrency(amount, amount_currency)} acreditados
                  + costo financiero {safeFmtCurrency(fee, amount_currency)}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={styles.col}>
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>Pagos</Text>

              {safePayments.length ? (
                safePayments.map((p, idx) => (
                  <View key={idx} style={styles.payLine}>
                    <Text style={styles.payLeft}>{paymentLabel(p)}</Text>
                    {showPaymentAmounts ? (
                      <Text style={styles.payRight}>
                        {safeFmtCurrency(p.amount, amount_currency)}
                      </Text>
                    ) : null}
                  </View>
                ))
              ) : (
                <Text style={styles.infoText}>-</Text>
              )}
              {fee > 0 ? (
                <Text style={styles.payMeta}>
                  Costo financiero: {safeFmtCurrency(fee, amount_currency)}
                </Text>
              ) : null}
              {showPaymentDetail ? (
                <Text style={styles.payMeta}>Detalle: {paymentDetail}</Text>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.twoCols}>
          <View style={styles.col}>
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>En concepto de</Text>
              <Text style={styles.infoText}>{concept}</Text>
            </View>
          </View>
          <View style={styles.col}>
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>Monto en letras</Text>
              <Text style={styles.infoText}>{amountString}</Text>
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
