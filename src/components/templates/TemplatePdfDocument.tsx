// src/components/templates/TemplatePdfDocument.tsx
/* eslint-disable react/no-unstable-nested-components */
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
} from "@react-pdf/renderer";
import type {
  TemplateConfig,
  ContentBlock,
  Density,
  Agency,
} from "@/types/templates";

/** Tipo mínimo para el usuario */
type MinimalUser = {
  first_name?: string;
  last_name?: string;
  email?: string;
};

/** Campos legacy opcionales (para evitar any) */
type AgencyLegacy = {
  phone?: string;
  email?: string;
  social?: Partial<{
    instagram: string;
    facebook: string;
    twitter: string;
    tiktok: string;
  }>;
};

/** Fuente base */
Font.register({
  family: "Poppins",
  fonts: [
    { src: "/poppins/Poppins-Regular.ttf", fontWeight: "normal" },
    { src: "/poppins/Poppins-Bold.ttf", fontWeight: "bold" },
  ],
});

/* ============================== Utils =============================== */

const isBlank = (s?: string | null) => !s || s.trim().length === 0;

/** Rompe la autolinkificación del visor PDF sin cambiar lo que se ve */
const deLinkify = (s: string) => (s || "").replace(/([:@./])/g, "\u200B$1");

function luminance(hex: string): number {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(
    (hex || "").trim(),
  );
  if (!m) return 0.5;
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const a = [r, g, b].map((v) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

/** Parse simple #RRGGBB a {r,g,b} */
const hexToRgb = (hex: string) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(
    (hex || "").trim(),
  );
  if (!m) return { r: 255, g: 255, b: 255 };
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
};
/** rgba(...) a objeto */
const parseRgba = (rgba: string) => {
  const m = rgba.match(/rgba?\(([^)]+)\)/i);
  if (!m) return { r: 0, g: 0, b: 0, a: 1 };
  const [r, g, b, a] = m[1].split(",").map((v) => v.trim());
  return {
    r: Math.round(Number(r)),
    g: Math.round(Number(g)),
    b: Math.round(Number(b)),
    a: a !== undefined ? Number(a) : 1,
  };
};
/** Mezcla src (con alpha) sobre bg (hex) y devuelve HEX sólido */
const blendToHex = (srcRgba: string, bgHex: string) => {
  const bg = hexToRgb(bgHex);
  const s = parseRgba(srcRgba);
  const r = Math.round(s.r * s.a + bg.r * (1 - s.a));
  const g = Math.round(s.g * s.a + bg.g * (1 - s.a));
  const b = Math.round(s.b * s.a + bg.b * (1 - s.a));
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};
/** Crea un rgba() a partir de hex + alpha */
const withAlpha = (hex: string, alpha: number) => {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/* ============================== Styles base =============================== */

const base = StyleSheet.create({
  page: {
    fontFamily: "Poppins",
    fontSize: 12,
    paddingTop: 28,
    paddingBottom: 22,
    paddingHorizontal: 28,
  },
  section: { marginTop: 10 },
  divider: { height: 1, width: "100%", marginVertical: 8 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  col: { flex: 1 },
  listItem: { fontSize: 12, marginBottom: 4 },
});

/* ============================== Props =============================== */

export type TemplatePdfDocumentProps = {
  rCfg: TemplateConfig;
  rAgency: Partial<Agency>;
  rUser: Partial<MinimalUser>;
  blocks: ContentBlock[];
  docLabel: string;
  selectedCoverUrl: string;
  paymentSelected?: string;
};

/* ============================== Component =============================== */

const TemplatePdfDocument: React.FC<TemplatePdfDocumentProps> = ({
  rCfg,
  rAgency,
  rUser,
  blocks,
  docLabel,
  selectedCoverUrl,
  paymentSelected,
}) => {
  // Tokens de estilo
  const bg = rCfg.styles?.colors?.background ?? "#111111";
  const text = rCfg.styles?.colors?.text ?? "#ffffff";
  const accent = rCfg.styles?.colors?.accent ?? "#9CA3AF";

  const isLightBg = luminance(bg) >= 0.7;

  // Paneles / divisores
  const panelSoftRGBA = isLightBg
    ? withAlpha(accent, 0.05)
    : "rgba(255,255,255,0.06)";
  const panelStrongRGBA = isLightBg
    ? "rgba(0,0,0,0.06)"
    : "rgba(255,255,255,0.06)";
  const dividerRGBA = isLightBg ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.12)";
  const borderSoftRGBA = isLightBg
    ? withAlpha(accent, 0.3)
    : "rgba(255,255,255,0.10)";

  // Bordes siempre en HEX sólido (evita "verde")
  const borderSoftHEX = blendToHex(borderSoftRGBA, bg);

  // Density
  const densityRaw = rCfg.styles?.ui?.density ?? "comfortable";
  const density: Density =
    densityRaw === "compact" || densityRaw === "relaxed"
      ? densityRaw
      : "comfortable";
  const coverH =
    density === "compact" ? 170 : density === "relaxed" ? 250 : 200;

  const layout = rCfg.layout ?? "layoutA";

  // Línea corporativa
  const contactItems = Array.isArray(rCfg.contactItems)
    ? rCfg.contactItems
    : [];
  const phones = Array.isArray(rAgency.phones) ? rAgency.phones : [];
  const emails = Array.isArray(rAgency.emails) ? rAgency.emails : [];

  const agLegacy: AgencyLegacy = {
    phone: (rAgency as unknown as AgencyLegacy).phone,
    email: (rAgency as unknown as AgencyLegacy).email,
    social: (rAgency as unknown as AgencyLegacy).social,
  };

  const corporateLine: Array<{ label: string; value: string }> = [];
  const website = rAgency.website || "";
  const address = rAgency.address || "";
  const phone = phones[0] || agLegacy.phone || "";
  const email = emails[0] || agLegacy.email || "";
  const ig = rAgency.socials?.instagram || agLegacy.social?.instagram || "";
  const fb = rAgency.socials?.facebook || agLegacy.social?.facebook || "";
  const tw = rAgency.socials?.twitter || agLegacy.social?.twitter || "";
  const tk = rAgency.socials?.tiktok || agLegacy.social?.tiktok || "";

  if (contactItems.includes("website") && website)
    corporateLine.push({ label: "Web", value: deLinkify(website) });
  if (contactItems.includes("address") && address)
    corporateLine.push({ label: "Dirección", value: address });
  if (contactItems.includes("phones") && phone)
    corporateLine.push({ label: "Tel", value: phone });
  if (contactItems.includes("email") && email)
    corporateLine.push({ label: "Mail", value: deLinkify(email) });
  if (contactItems.includes("instagram") && ig)
    corporateLine.push({ label: "Instagram", value: deLinkify(ig) });
  if (contactItems.includes("facebook") && fb)
    corporateLine.push({ label: "Facebook", value: deLinkify(fb) });
  if (contactItems.includes("twitter") && tw)
    corporateLine.push({ label: "Twitter", value: deLinkify(tw) });
  if (contactItems.includes("tiktok") && tk)
    corporateLine.push({ label: "TikTok", value: deLinkify(tk) });

  const agencyName = rAgency.name || "Nombre de la agencia";
  const legalName = rAgency.legal_name || rAgency.name || "Razón social";
  const logo = rAgency.logo_url || "";
  const hasLogo = !!logo;

  const headingFont = rCfg.styles?.fonts?.heading ?? "Poppins";
  const showDividers = rCfg.styles?.ui?.dividers ?? true;

  // Medidas Layout C
  const SIDEBAR_W = 200; // como el preview
  const MAIN_PAD = 14;

  const styles = StyleSheet.create({
    // Página con padding normal (layouts A/B)
    pageBase: {
      ...base.page,
      backgroundColor: bg,
      color: text,
    },
    // Página sin padding (layout C full-bleed)
    pageNoPad: {
      fontFamily: "Poppins",
      fontSize: 12,
      padding: 0,
      backgroundColor: bg,
      color: text,
    },

    title: {
      fontFamily: headingFont,
      fontSize: 22,
      fontWeight: 700,
    },
    subtitle: {
      fontSize: 14,
      opacity: 0.95,
      marginTop: 2,
    },
    chip: {
      fontSize: 10,
      paddingVertical: 4,
      paddingHorizontal: 8,
      textTransform: "uppercase",
      alignSelf: "flex-start",
      borderRadius: 6,
      backgroundColor: isLightBg
        ? withAlpha("#000000", 0.06)
        : "rgba(255,255,255,0.06)",
      color: accent,
      borderStyle: "solid",
      borderColor: borderSoftHEX,
      borderWidth: 1,
    },
    brandLine: {
      height: 2,
      width: "60%",
      marginTop: 4,
      backgroundColor: accent,
    },
    corpLine: {
      marginTop: 8,
      padding: 8,
      borderRadius: 8,
      flexDirection: "row",
      flexWrap: "wrap",
      backgroundColor: panelSoftRGBA,
      borderStyle: "solid",
      borderColor: borderSoftHEX,
      borderWidth: 1,
    },
    corpItem: {
      fontSize: 10,
      paddingVertical: 2,
      paddingHorizontal: 6,
      borderRadius: 6,
      marginRight: 6,
      marginBottom: 6,
      backgroundColor: isLightBg
        ? "rgba(0,0,0,0.05)"
        : "rgba(255,255,255,0.08)",
    },
    cover: {
      width: "100%",
      height: coverH,
      objectFit: "cover",
      borderRadius: 8,
    },
    section: { ...base.section },
    divider: { ...base.divider, backgroundColor: dividerRGBA },
    card: {
      borderRadius: 8,
      padding: 8,
      backgroundColor: panelStrongRGBA,
    },
    paymentCard: {
      borderRadius: 8,
      padding: 8,
      backgroundColor: panelSoftRGBA,
      borderStyle: "solid",
      borderColor: borderSoftHEX,
      borderWidth: 1,
    },
    accentText: { color: accent, fontWeight: 600, marginBottom: 4 },
    footer: {
      marginTop: 16,
      paddingTop: 8,
      borderTopStyle: "solid",
      borderTopColor: blendToHex(dividerRGBA, bg),
      borderTopWidth: 1,
    },

    /* ====== Layout C ====== */
    // Sidebar fijo que se repite en cada página
    sidebarFixed: {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      width: SIDEBAR_W,
      padding: 16,
      backgroundColor: panelSoftRGBA,
    },
    // Main fluido: deja margen para no quedar debajo del sidebar y agrega un padding suave
    mainFlow: {
      marginLeft: SIDEBAR_W,
      padding: MAIN_PAD,
    },
  });

  /* ============================== Blocks =============================== */

  const Block: React.FC<{ b: ContentBlock; index: number }> = ({
    b,
    index,
  }) => {
    const topDivider = showDividers && index > 0;

    if (b.type === "heading") {
      const lvl = Math.max(1, Math.min(3, b.level ?? 1));
      const size = lvl === 1 ? 20 : lvl === 2 ? 16 : 14;
      const textValue = b.text ?? "";
      if (b.mode === "form" && isBlank(textValue)) return null;

      return (
        <View style={styles.section}>
          {topDivider && <View style={styles.divider} />}
          <Text
            style={{ fontSize: size, fontFamily: headingFont, fontWeight: 700 }}
          >
            {textValue}
          </Text>
        </View>
      );
    }

    if (b.type === "subtitle") {
      const t = b.text ?? "";
      if (b.mode === "form" && isBlank(t)) return null;
      return (
        <View style={styles.section} wrap={false}>
          {topDivider && <View style={styles.divider} />}
          <Text style={{ fontSize: 14, fontWeight: 600, opacity: 0.95 }}>
            {t}
          </Text>
        </View>
      );
    }

    if (b.type === "paragraph") {
      const t = b.text ?? "";
      if (b.mode === "form" && isBlank(t)) return null;
      return (
        <View style={styles.section}>
          {topDivider && <View style={styles.divider} />}
          {/* Sin widows/orphans: no existen en react-pdf */}
          <Text style={{ lineHeight: 1.4 }}>{t}</Text>
        </View>
      );
    }

    if (b.type === "list") {
      const items = b.items ?? [];
      if (b.mode === "form" && items.length === 0) return null;
      return (
        <View style={styles.section}>
          {topDivider && <View style={styles.divider} />}
          <View>
            {items.map((it, i) => (
              <Text key={i} style={base.listItem}>
                • {it}
              </Text>
            ))}
          </View>
        </View>
      );
    }

    if (b.type === "keyValue") {
      const pairs = b.pairs ?? [];
      if (b.mode === "form" && pairs.length === 0) return null;
      return (
        <View style={styles.section} wrap={false}>
          {topDivider && <View style={styles.divider} />}
          <View>
            {pairs.map((p, i) => (
              <View
                key={i}
                style={[
                  styles.card,
                  {
                    marginBottom: 4,
                    flexDirection: "row",
                    justifyContent: "space-between",
                  },
                ]}
              >
                <Text>{p.key}</Text>
                <Text>{p.value}</Text>
              </View>
            ))}
          </View>
        </View>
      );
    }

    if (b.type === "twoColumns") {
      const l = b.left ?? "";
      const r = b.right ?? "";
      const bothEmpty = isBlank(l) && isBlank(r);
      if (b.mode === "form" && bothEmpty) return null;

      return (
        <View style={styles.section} wrap={false}>
          {topDivider && <View style={styles.divider} />}
          <View style={{ flexDirection: "row" }}>
            <View style={{ flex: 1, marginRight: 6 }}>
              <View style={styles.card}>
                <Text>{l}</Text>
              </View>
            </View>
            <View style={{ flex: 1, marginLeft: 6 }}>
              <View style={styles.card}>
                <Text>{r}</Text>
              </View>
            </View>
          </View>
        </View>
      );
    }

    if (b.type === "threeColumns") {
      const l = b.left ?? "";
      const c = b.center ?? "";
      const r = b.right ?? "";
      const empty = isBlank(l) && isBlank(c) && isBlank(r);
      if (b.mode === "form" && empty) return null;

      return (
        <View style={styles.section} wrap={false}>
          {topDivider && <View style={styles.divider} />}
          <View style={{ flexDirection: "row" }}>
            <View style={{ flex: 1, marginRight: 6 }}>
              <View style={styles.card}>
                <Text>{l}</Text>
              </View>
            </View>
            <View style={{ flex: 1, marginHorizontal: 6 }}>
              <View style={styles.card}>
                <Text>{c}</Text>
              </View>
            </View>
            <View style={{ flex: 1, marginLeft: 6 }}>
              <View style={styles.card}>
                <Text>{r}</Text>
              </View>
            </View>
          </View>
        </View>
      );
    }

    return null;
  };

  const Payment: React.FC = () =>
    !paymentSelected ? null : (
      <View style={[base.section, styles.paymentCard]} wrap={false}>
        <Text style={styles.accentText}>Forma de pago</Text>
        <Text>{deLinkify(paymentSelected)}</Text>
      </View>
    );

  const Header: React.FC = () => (
    <View style={{ marginBottom: 12 }}>
      <View style={{ ...base.row }}>
        <View>
          <Text style={styles.title}>{agencyName}</Text>
          <View style={styles.brandLine} />
        </View>
        <View>
          <Text style={styles.chip}>{docLabel}</Text>
        </View>
      </View>

      {corporateLine.length > 0 && (
        <View style={styles.corpLine}>
          {corporateLine.map((it, i) => (
            <Text key={i} style={styles.corpItem}>
              <Text style={{ color: accent, fontWeight: 600 }}>
                {it.label}:{" "}
              </Text>
              <Text>{it.value}</Text>
            </Text>
          ))}
        </View>
      )}
    </View>
  );

  const Footer: React.FC = () => (
    <View style={styles.footer}>
      <View style={base.row}>
        <View
          style={{
            borderRadius: 8,
            padding: 8,
            backgroundColor: panelSoftRGBA,
            borderStyle: "solid",
            borderColor: borderSoftHEX,
            borderWidth: 1,
          }}
        >
          <Text style={{ color: accent, fontWeight: 600 }}>
            {[rUser.first_name, rUser.last_name].filter(Boolean).join(" ") ||
              "Vendedor/a"}
          </Text>
          <Text>{deLinkify(rUser.email || "vendedor@agencia.com")}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {hasLogo ? (
            <Image
              src={logo}
              style={{ height: 24, width: 72, objectFit: "contain" }}
            />
          ) : (
            <View
              style={{
                height: 24,
                width: 72,
                backgroundColor: isLightBg
                  ? "rgba(0,0,0,0.08)"
                  : "rgba(255,255,255,0.10)",
                borderRadius: 6,
              }}
            />
          )}
          <Text style={{ fontSize: 9, opacity: 0.8, marginLeft: 8 }}>
            {legalName}
          </Text>
        </View>
      </View>
    </View>
  );

  const SidebarC: React.FC = () => (
    <View fixed style={styles.sidebarFixed}>
      {hasLogo ? (
        <Image
          src={logo}
          style={{
            height: 28,
            width: 100,
            objectFit: "contain",
            opacity: 0.9,
            marginBottom: 8,
          }}
        />
      ) : (
        <View
          style={{
            height: 28,
            width: 100,
            borderRadius: 6,
            backgroundColor: isLightBg
              ? "rgba(0,0,0,0.08)"
              : "rgba(255,255,255,0.10)",
            marginBottom: 8,
          }}
        />
      )}

      <Text
        style={{
          fontFamily: headingFont,
          fontSize: 16,
          fontWeight: 700,
        }}
      >
        {agencyName}
      </Text>
      <View
        style={{
          height: 2,
          width: "70%",
          backgroundColor: accent,
          marginTop: 4,
          borderRadius: 2,
        }}
      />

      <View style={{ marginTop: 8 }}>
        {corporateLine.length > 0 ? (
          corporateLine.map((it, i) => (
            <Text
              key={i}
              style={{ fontSize: 10, opacity: 0.85, marginBottom: 3 }}
            >
              <Text style={{ color: accent, fontWeight: 600 }}>
                {it.label}:{" "}
              </Text>
              <Text>{it.value}</Text>
            </Text>
          ))
        ) : (
          <Text style={{ fontSize: 10, opacity: 0.6 }}>
            Sin datos de contacto
          </Text>
        )}
      </View>

      <View
        style={{
          marginTop: 10,
          alignSelf: "flex-start",
          borderRadius: 6,
          borderStyle: "solid",
          borderColor: borderSoftHEX,
          borderWidth: 1,
          paddingVertical: 4,
          paddingHorizontal: 8,
        }}
      >
        <Text
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            color: accent,
          }}
        >
          {docLabel}
        </Text>
      </View>
    </View>
  );

  const Cover: React.FC = () =>
    selectedCoverUrl ? (
      <View wrap={false}>
        <Image src={selectedCoverUrl} style={styles.cover} />
      </View>
    ) : hasLogo ? (
      <View style={{ alignItems: "center", marginBottom: 4 }} wrap={false}>
        <Image
          src={logo}
          style={{ height: 28, width: 100, objectFit: "contain", opacity: 0.9 }}
        />
      </View>
    ) : null;

  /* ============================== Render =============================== */

  return (
    <Document>
      {/* Layouts A y B usan padding base */}
      {(layout === "layoutA" || layout === "layoutB") && (
        <Page size="A4" style={styles.pageBase}>
          {layout === "layoutA" && (
            <>
              <Cover />
              <Header />
              {blocks.map((b, i) => (
                <Block key={b.id || i} b={b} index={i} />
              ))}
              <Payment />
              <Footer />
            </>
          )}

          {layout === "layoutB" && (
            <>
              <Header />
              <View style={{ marginTop: 8 }}>
                {selectedCoverUrl ? <Cover /> : null}
              </View>
              {blocks.map((b, i) => (
                <Block key={b.id || i} b={b} index={i} />
              ))}
              <Payment />
              <Footer />
            </>
          )}
        </Page>
      )}

      {/* Layout C: full-bleed, sidebar fijo en todas las páginas */}
      {layout === "layoutC" && (
        <Page size="A4" style={styles.pageNoPad}>
          <SidebarC />
          <View style={styles.mainFlow}>
            {selectedCoverUrl ? (
              <View style={{ marginBottom: 8 }}>
                <Cover />
              </View>
            ) : null}

            {blocks.map((b, i) => (
              <Block key={b.id || i} b={b} index={i} />
            ))}
            <Payment />
            <Footer />
          </View>
        </Page>
      )}
    </Document>
  );
};

export default TemplatePdfDocument;
