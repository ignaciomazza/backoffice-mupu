// src/components/templates/QuoteDocument.tsx
/* eslint-disable jsx-a11y/alt-text */
import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  Font,
  Svg,
  Path,
} from "@react-pdf/renderer";
import { Quote, User } from "@/types";
import { parseMarkdown } from "@/lib/markdown";

export type SimpleQuote = Pick<
  Quote,
  "dateRange" | "region" | "price" | "currency" | "concept"
>;

interface QuoteDocumentProps {
  quote: SimpleQuote;
  user: User;
}

// Registrar Poppins
Font.register({
  family: "Poppins",
  fonts: [
    { src: "/poppins/Poppins-Regular.ttf", fontWeight: "normal" },
    { src: "/poppins/Poppins-Bold.ttf", fontWeight: "bold" },
  ],
});

const styles = StyleSheet.create({
  firstPage: {
    fontFamily: "Poppins",
    fontSize: 12,
    color: "#fff",
    position: "relative",
    backgroundColor: "#000",
  },
  secondPage: {
    paddingVertical: 40,
    fontFamily: "Poppins",
    fontSize: 12,
    color: "#fff",
    position: "relative",
    backgroundColor: "#000",
  },
  imageContainer: {
    position: "relative",
    width: "100%",
    height: "600px",
    justifyContent: "flex-end",
  },
  regionImg: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  headerOverlay: {
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    paddingTop: 12,
    paddingHorizontal: 24,
    width: "100%",
  },
  title: {
    fontSize: 30,
    fontWeight: "bold",
    color: "white",
    letterSpacing: -0.025,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: "300",
    color: "white",
    position: "relative",
    bottom: 12,
    letterSpacing: 0.025,
    paddingLeft: 4,
  },
  contactsGrid: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    marginTop: 20,
    gap: 8,
    padding: 40,
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "40%",
    marginVertical: 4,
  },
  contactText: {
    fontSize: 12,
    color: "white",
  },
  icon: {
    width: 16,
    height: 16,
    marginRight: 4,
  },
  content: {
    padding: 40,
    backgroundColor: "#000",
    color: "#fff",
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontWeight: "bold",
    marginBottom: 4,
    fontSize: 14,
  },
  payment: {
    marginBottom: 24,
  },
  agentInfo: {
    marginTop: 16,
    alignItems: "flex-end",
    fontSize: 9,
    fontWeight: "300",
    marginBottom: 12,
  },
  footer: {
    marginTop: 32,
    fontSize: 10,
    color: "#ccc",
  },
  bottomLogo: {
    height: 20,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
});

export default function QuoteDocument({ quote, user }: QuoteDocumentProps) {
  const { dateRange, region, price, currency, concept } = quote;

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency }).format(v);

  return (
    <Document>
      {/* Página 1 */}
      <Page size="A4" style={styles.firstPage}>
        <View style={styles.imageContainer}>
          <Image src={`/images/${region}.jpg`} style={styles.regionImg} />
          <View style={styles.headerOverlay}>
            <Text style={styles.title}>MUPU VIAJES</Text>
            <Text style={styles.subtitle}>Cotización de viaje</Text>
          </View>
        </View>
        <View style={styles.contactsGrid}>
          <View style={styles.contactItem}>
            <Svg style={styles.icon} viewBox="0 0 50 50">
              <Path
                d="M 25 2 C 12.309534 2 2 12.309534 2 25 C 2 29.079097 3.1186875 32.88588 4.984375 36.208984 L 2.0371094 46.730469 A 1.0001 1.0001 0 0 0 3.2402344 47.970703 L 14.210938 45.251953 C 17.434629 46.972929 21.092591 48 25 48 C 37.690466 48 48 37.690466 48 25 C 48 12.309534 37.690466 2 25 2 z M 25 4 C 36.609534 4 46 13.390466 46 25 C 46 36.609534 36.609534 46 25 46 C 21.278025 46 17.792121 45.029635 14.761719 43.333984 A 1.0001 1.0001 0 0 0 14.033203 43.236328 L 4.4257812 45.617188 L 7.0019531 36.425781 A 1.0001 1.0001 0 0 0 6.9023438 35.646484 C 5.0606869 32.523592 4 28.890107 4 25 C 4 13.390466 13.390466 4 25 4 z M 16.642578 13 C 16.001539 13 15.086045 13.23849 14.333984 14.048828 C 13.882268 14.535548 12 16.369511 12 19.59375 C 12 22.955271 14.331391 25.855848 14.613281 26.228516 L 14.615234 26.228516 L 14.615234 26.230469 C 14.588494 26.195329 14.973031 26.752191 15.486328 27.419922 C 15.999626 28.087653 16.717405 28.96464 17.619141 29.914062 C 19.422612 31.812909 21.958282 34.007419 25.105469 35.349609 C 26.554789 35.966779 27.698179 36.339417 28.564453 36.611328 C 30.169845 37.115426 31.632073 37.038799 32.730469 36.876953 C 33.55263 36.755876 34.456878 36.361114 35.351562 35.794922 C 36.246248 35.22873 37.12309 34.524722 37.509766 33.455078 C 37.786772 32.688244 37.927591 31.979598 37.978516 31.396484 C 38.003976 31.104927 38.007211 30.847602 37.988281 30.609375 C 37.969311 30.371148 37.989581 30.188664 37.767578 29.824219 C 37.302009 29.059804 36.774753 29.039853 36.224609 28.767578 C 35.918939 28.616297 35.048661 28.191329 34.175781 27.775391 C 33.303883 27.35992 32.54892 26.991953 32.083984 26.826172 C 31.790239 26.720488 31.431556 26.568352 30.914062 26.626953 C 30.396569 26.685553 29.88546 27.058933 29.587891 27.5 C 29.305837 27.918069 28.170387 29.258349 27.824219 29.652344 C 27.819619 29.649544 27.849659 29.663383 27.712891 29.595703 C 27.284761 29.383815 26.761157 29.203652 25.986328 28.794922 C 25.2115 28.386192 24.242255 27.782635 23.181641 26.847656 L 23.181641 26.845703 C 21.603029 25.455949 20.497272 23.711106 20.148438 23.125 C 20.171937 23.09704 20.145643 23.130901 20.195312 23.082031 L 20.197266 23.080078 C 20.553781 22.728924 20.869739 22.309521 21.136719 22.001953 C 21.515257 21.565866 21.68231 21.181437 21.863281 20.822266 C 22.223954 20.10644 22.02313 19.318742 21.814453 18.904297 L 21.814453 18.902344 C 21.828863 18.931014 21.701572 18.650157 21.564453 18.326172 C 21.426943 18.001263 21.251663 17.580039 21.064453 17.130859 C 20.690033 16.232501 20.272027 15.224912 20.023438 14.634766 L 20.023438 14.632812 C 19.730591 13.937684 19.334395 13.436908 18.816406 13.195312 C 18.298417 12.953717 17.840778 13.022402 17.822266 13.021484 L 17.820312 13.021484 C 17.450668 13.004432 17.045038 13 16.642578 13 z M 16.642578 15 C 17.028118 15 17.408214 15.004701 17.726562 15.019531 C 18.054056 15.035851 18.033687 15.037192 17.970703 15.007812 C 17.906713 14.977972 17.993533 14.968282 18.179688 15.410156 C 18.423098 15.98801 18.84317 16.999249 19.21875 17.900391 C 19.40654 18.350961 19.582292 18.773816 19.722656 19.105469 C 19.863021 19.437122 19.939077 19.622295 20.027344 19.798828 L 20.027344 19.800781 L 20.029297 19.802734 C 20.115837 19.973483 20.108185 19.864164 20.078125 19.923828 C 19.867096 20.342656 19.838461 20.445493 19.625 20.691406 C 19.29998 21.065838 18.968453 21.483404 18.792969 21.65625 C 18.639439 21.80707 18.36242 22.042032 18.189453 22.501953 C 18.016221 22.962578 18.097073 23.59457 18.375 24.066406 C 18.745032 24.6946 19.964406 26.679307 21.859375 28.347656 C 23.05276 29.399678 24.164563 30.095933 25.052734 30.564453 C 25.940906 31.032973 26.664301 31.306607 26.826172 31.386719 C 27.210549 31.576953 27.630655 31.72467 28.119141 31.666016 C 28.607627 31.607366 29.02878 31.310979 29.296875 31.007812 L 29.298828 31.005859 C 29.655629 30.601347 30.715848 29.390728 31.224609 28.644531 C 31.246169 28.652131 31.239109 28.646231 31.408203 28.707031 L 31.408203 28.708984 L 31.410156 28.708984 C 31.487356 28.736474 32.454286 29.169267 33.316406 29.580078 C 34.178526 29.990889 35.053561 30.417875 35.337891 30.558594 C 35.748225 30.761674 35.942113 30.893881 35.992188 30.894531 C 35.995572 30.982516 35.998992 31.07786 35.986328 31.222656 C 35.951258 31.624292 35.8439 32.180225 35.628906 32.775391 C 35.523582 33.066746 34.975018 33.667661 34.283203 34.105469 C 33.591388 34.543277 32.749338 34.852514 32.4375 34.898438 C 31.499896 35.036591 30.386672 35.087027 29.164062 34.703125 C 28.316336 34.437036 27.259305 34.092596 25.890625 33.509766 C 23.114812 32.325956 20.755591 30.311513 19.070312 28.537109 C 18.227674 27.649908 17.552562 26.824019 17.072266 26.199219 C 16.592866 25.575584 16.383528 25.251054 16.208984 25.021484 L 16.207031 25.019531 C 15.897202 24.609805 14 21.970851 14 19.59375 C 14 17.077989 15.168497 16.091436 15.800781 15.410156 C 16.132721 15.052495 16.495617 15 16.642578 15 z"
                stroke="white"
                strokeWidth={1.2}
                fill="white"
              />
            </Svg>
            <Text style={styles.contactText}>+54 9 11 5970 1234</Text>
          </View>
          <View style={styles.contactItem}>
            <Svg style={styles.icon} viewBox="0 0 24 24">
              <Path
                d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
                stroke="white"
                strokeWidth={1.2}
                fill="none"
              />
            </Svg>
            <Text style={styles.contactText}>info@mupuviajes.com.ar</Text>
          </View>
          <View style={styles.contactItem}>
            <Svg style={styles.icon} viewBox="0 0 50 50">
              <Path
                d="M 14.78125 5 C 14.75 5.007813 14.71875 5.019531 14.6875 5.03125 C 14.644531 5.050781 14.601563 5.070313 14.5625 5.09375 C 14.550781 5.09375 14.542969 5.09375 14.53125 5.09375 C 14.511719 5.101563 14.488281 5.113281 14.46875 5.125 C 14.457031 5.136719 14.449219 5.144531 14.4375 5.15625 C 14.425781 5.167969 14.417969 5.175781 14.40625 5.1875 C 14.375 5.207031 14.34375 5.226563 14.3125 5.25 C 14.289063 5.269531 14.269531 5.289063 14.25 5.3125 C 14.238281 5.332031 14.226563 5.355469 14.21875 5.375 C 14.183594 5.414063 14.152344 5.457031 14.125 5.5 C 14.113281 5.511719 14.105469 5.519531 14.09375 5.53125 C 14.09375 5.542969 14.09375 5.550781 14.09375 5.5625 C 14.082031 5.582031 14.070313 5.605469 14.0625 5.625 C 14.050781 5.636719 14.042969 5.644531 14.03125 5.65625 C 14.03125 5.675781 14.03125 5.699219 14.03125 5.71875 C 14.019531 5.757813 14.007813 5.800781 14 5.84375 C 14 5.875 14 5.90625 14 5.9375 C 14 5.949219 14 5.957031 14 5.96875 C 14 5.980469 14 5.988281 14 6 C 13.996094 6.050781 13.996094 6.105469 14 6.15625 L 14 39 C 14.003906 39.398438 14.242188 39.757813 14.609375 39.914063 C 14.972656 40.070313 15.398438 39.992188 15.6875 39.71875 L 22.9375 32.90625 L 28.78125 46.40625 C 28.890625 46.652344 29.09375 46.847656 29.347656 46.941406 C 29.601563 47.035156 29.882813 47.023438 30.125 46.90625 L 34.5 44.90625 C 34.996094 44.679688 35.21875 44.09375 35 43.59375 L 28.90625 30.28125 L 39.09375 29.40625 C 39.496094 29.378906 39.84375 29.113281 39.976563 28.730469 C 40.105469 28.347656 39.992188 27.921875 39.6875 27.65625 L 15.84375 5.4375 C 15.796875 5.378906 15.746094 5.328125 15.6875 5.28125 C 15.648438 5.234375 15.609375 5.195313 15.5625 5.15625 C 15.550781 5.15625 15.542969 5.15625 15.53125 5.15625 C 15.511719 5.132813 15.492188 5.113281 15.46875 5.09375 C 15.457031 5.09375 15.449219 5.09375 15.4375 5.09375 C 15.386719 5.070313 15.335938 5.046875 15.28125 5.03125 C 15.269531 5.03125 15.261719 5.03125 15.25 5.03125 C 15.230469 5.019531 15.207031 5.007813 15.1875 5 C 15.175781 5 15.167969 5 15.15625 5 C 15.136719 5 15.113281 5 15.09375 5 C 15.082031 5 15.074219 5 15.0625 5 C 15.042969 5 15.019531 5 15 5 C 14.988281 5 14.980469 5 14.96875 5 C 14.9375 5 14.90625 5 14.875 5 C 14.84375 5 14.8125 5 14.78125 5 Z M 16 8.28125 L 36.6875 27.59375 L 27.3125 28.40625 C 26.992188 28.4375 26.707031 28.621094 26.546875 28.902344 C 26.382813 29.179688 26.367188 29.519531 26.5 29.8125 L 32.78125 43.5 L 30.21875 44.65625 L 24.21875 30.8125 C 24.089844 30.515625 23.828125 30.296875 23.511719 30.230469 C 23.195313 30.160156 22.863281 30.25 22.625 30.46875 L 16 36.6875 Z"
                stroke="white"
                strokeWidth={1}
                fill="white"
              />
            </Svg>
            <Text style={styles.contactText}>mupuviajes.com</Text>
          </View>
          <View style={styles.contactItem}>
            <Svg style={styles.icon} viewBox="0 0 24 24">
              <Path
                d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                stroke="white"
                strokeWidth={1.2}
                fill="none"
              />
              <Path
                d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
                stroke="white"
                strokeWidth={1.2}
                fill="none"
              />
            </Svg>
            <Text style={styles.contactText}>Domingo F. Sarmiento 1355</Text>
          </View>
          <View style={styles.contactItem}>
            <Svg style={styles.icon} viewBox="0 0 50 50">
              <Path
                d="M 16 3 C 8.8 3 3 8.8 3 16 V 34 C 3 41.2 8.8 47 16 47 H 34 C 41.2 47 47 41.2 47 34 V 16 C 47 8.8 41.2 3 34 3 Z M 37 11 A 2 2 0 1 1 35 13 A 2 2 0 0 1 37 11 Z M 25 14 C 18.9 14 14 18.9 14 25 C 14 31.1 18.9 36 25 36 C 31.1 36 36 31.1 36 25 C 36 18.9 31.1 14 25 14 Z M 25 16 C 30 16 34 20 34 25 C 34 30 30 34 25 34 C 20 34 16 30 16 25 C 16 20 20 16 25 16 Z"
                stroke="white"
                strokeWidth={2}
                fill="none"
              />
            </Svg>
            <Text style={styles.contactText}>@mupuviajesturismo</Text>
          </View>
          <View style={styles.contactItem}>
            <Svg style={styles.icon} viewBox="0 0 50 50">
              <Path
                d="M 9 4 C 6.2504839 4 4 6.2504839 4 9 L 4 41 C 4 43.749516 6.2504839 46 9 46 L 25.832031 46 A 1.0001 1.0001 0 0 0 26.158203 46 L 31.832031 46 A 1.0001 1.0001 0 0 0 32.158203 46 L 41 46 C 43.749516 46 46 43.749516 46 41 L 46 9 C 46 6.2504839 43.749516 4 41 4 L 9 4 z M 9 6 L 41 6 C 42.668484 6 44 7.3315161 44 9 L 44 41 C 44 42.668484 42.668484 44 41 44 L 33 44 L 33 30 L 36.820312 30 L 38.220703 23 L 33 23 L 33 21 C 33 20.442508 33.05305 20.398929 33.240234 20.277344 C 33.427419 20.155758 34.005822 20 35 20 L 38 20 L 38 14.369141 L 37.429688 14.097656 C 37.429688 14.097656 35.132647 13 32 13 C 29.75 13 27.901588 13.896453 26.71875 15.375 C 25.535912 16.853547 25 18.833333 25 21 L 25 23 L 22 23 L 22 30 L 25 30 L 25 44 L 9 44 C 7.3315161 44 6 42.668484 6 41 L 6 9 C 6 7.3315161 7.3315161 6 9 6 z M 32 15 C 34.079062 15 35.38736 15.458455 36 15.701172 L 36 18 L 35 18 C 33.849178 18 32.926956 18.0952 32.150391 18.599609 C 31.373826 19.104024 31 20.061492 31 21 L 31 25 L 35.779297 25 L 35.179688 28 L 31 28 L 31 44 L 27 44 L 27 28 L 24 28 L 24 25 L 27 25 L 27 21 C 27 19.166667 27.464088 17.646453 28.28125 16.625 C 29.098412 15.603547 30.25 15 32 15 z"
                stroke="white"
                strokeWidth={1}
                fill="white"
              />
            </Svg>
            <Text style={styles.contactText}>Mupu Viajes</Text>
          </View>
        </View>
      </Page>

      {/* Página 2 */}
      <Page size="A4" style={styles.secondPage}>
        <View style={styles.content}>
          <View style={styles.section}>
            <Text
              style={{
                fontSize: 20,
                fontWeight: "bold",
                textAlign: "center",
                marginBottom: 12,
              }}
            >
              DATOS DEL VIAJE
            </Text>
            {dateRange.split("\n").map((line, i) => (
              <Text key={i} style={{ fontWeight: "300", marginBottom: 4 }}>
                {parseMarkdown(line).map((seg, j) => {
                  if (seg.type === "subtitle") {
                    return (
                      <Text
                        key={j}
                        style={{
                          fontWeight: "bold",
                          fontSize: 14,
                        }}
                      >
                        {seg.text}
                      </Text>
                    );
                  }
                  if (seg.type === "bold") {
                    return (
                      <Text key={j} style={{ fontWeight: "bold" }}>
                        {seg.text}
                      </Text>
                    );
                  }
                  return <Text key={j}>{seg.text}</Text>;
                })}
              </Text>
            ))}
          </View>
        </View>
      </Page>

      <Page size="A4" style={styles.secondPage}>
        <View style={styles.content}>
          <View style={styles.section}>
            <Text style={{ fontSize: 16, fontWeight: "bold" }}>
              {fmtCurrency(price)}
            </Text>
            <Text style={{ fontSize: 14, fontWeight: "bold" }}>{concept}</Text>
          </View>

          <View style={styles.payment}>
            <Text style={{ fontSize: 14, fontWeight: "bold", marginBottom: 4 }}>
              FORMAS DE PAGO
            </Text>
            <Text style={{ fontWeight: "300", fontSize: 12, lineHeight: 1.5 }}>
              Se reserva con el 50% del valor total del paquete – esto puede ser
              abonado en efectivo, transferencia y/o depósito – en dólares o en
              pesos argentinos (para pesos argentinos se debe consultar
              previamente la cotización del dólar del día). El saldo restante
              puede ser abonado en plan de pagos. Es imprescindible que un mes
              antes de la fecha de salida del viaje el paquete esté abonado en
              su totalidad. Las cuotas pueden ser abonadas en efectivo,
              transferencia y/o depósito – en dólares o en pesos argentinos
              (para pesos argentinos se debe consultar previamente la cotización
              del dólar del día).
            </Text>
          </View>

          <View style={styles.agentInfo}>
            <Text>
              {user.first_name} {user.last_name}
            </Text>
            <Text>Agente de viajes</Text>
            <Text>{user.email}</Text>
          </View>

          <Text style={styles.footer}>Gracias por elegir Mupu Viajes.</Text>
          <Image src="/logo.png" style={styles.bottomLogo} />
          <Text style={{ textAlign: "center", fontSize: 8, color: "#ccc" }}>
            MUPU S.R.L. – Legajo 15362
          </Text>
        </View>
      </Page>
    </Document>
  );
}
