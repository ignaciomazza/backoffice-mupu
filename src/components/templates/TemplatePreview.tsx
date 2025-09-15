// src/components/templates/TemplatePreview.tsx
/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useAgencyAndUser } from "@/lib/agencyUser";
import {
  asStringArray,
  getAt,
  mergeConfigWithFormValues,
  normalizeConfig,
} from "@/lib/templateConfig";
import type {
  DocType,
  TemplateConfig,
  TemplateFormValues,
  ContentBlock,
  Density,
  Agency,
} from "@/types/templates";

/* =============================================================================
 * Utils visuals
 * ========================================================================== */

const cx = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(
    (hex || "").trim(),
  );
  if (!m) return null;
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}
function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5;
  const a = [rgb.r, rgb.g, rgb.b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}
function withAlpha(color: string, alpha: number) {
  if (color.startsWith("#")) {
    const rgb = hexToRgb(color);
    if (!rgb) return color;
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
  }
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1]
      .split(",")
      .slice(0, 3)
      .map((x) => x.trim());
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

const isBlank = (s?: string | null) => !s || s.trim().length === 0;

/* =============================================================================
 * Tipografías / acentos / estilos por bloque
 * ========================================================================== */

type BlockRole =
  | "h1"
  | "h2"
  | "h3"
  | "subtitle"
  | "paragraph"
  | "list"
  | "kv"
  | "two"
  | "three";

function resolveMupuTextStyle(
  ms?: { color?: string },
  _role?: BlockRole,
): React.CSSProperties {
  void _role; // evitar warning de var no usada
  if (!ms) return {};
  return { color: ms.color || undefined };
}

/* =============================================================================
 * UI tokens (igual que en TemplateConfigPreview)
 * ========================================================================== */

function useUiTokens(cfg: TemplateConfig) {
  const rcfg = cfg as unknown as Record<string, unknown>;

  const radius = getAt<string>(rcfg, ["styles", "ui", "radius"], "2xl");
  const radiusClass =
    radius === "sm"
      ? "rounded-sm"
      : radius === "md"
        ? "rounded-md"
        : radius === "lg"
          ? "rounded-lg"
          : radius === "xl"
            ? "rounded-xl"
            : "rounded-2xl";

  const innerRadiusClass =
    radius === "sm"
      ? "rounded"
      : radius === "md"
        ? "rounded-md"
        : radius === "lg"
          ? "rounded-lg"
          : radius === "xl"
            ? "rounded-xl"
            : "rounded-2xl";

  const densityRaw = getAt<string>(
    rcfg,
    ["styles", "ui", "density"],
    "comfortable",
  );
  const density: Density =
    densityRaw === "compact" || densityRaw === "relaxed"
      ? densityRaw
      : "comfortable";

  const padX =
    density === "compact" ? "px-4" : density === "relaxed" ? "px-7" : "px-6";
  const padY =
    density === "compact" ? "py-3" : density === "relaxed" ? "py-6" : "py-5";

  const gapBlocks =
    density === "compact"
      ? "space-y-2"
      : density === "relaxed"
        ? "space-y-5"
        : "space-y-3";
  const gapGrid =
    density === "compact" ? "gap-2" : density === "relaxed" ? "gap-4" : "gap-3";
  const listSpace =
    density === "compact"
      ? "space-y-0.5"
      : density === "relaxed"
        ? "space-y-2"
        : "space-y-1";

  const contentWidth = getAt<string>(
    rcfg,
    ["styles", "ui", "contentWidth"],
    "normal",
  );
  const contentMaxW =
    contentWidth === "narrow"
      ? "max-w-2xl"
      : contentWidth === "wide"
        ? "max-w-5xl"
        : "max-w-3xl";

  const dividers = getAt<boolean>(rcfg, ["styles", "ui", "dividers"], true);

  return {
    radiusClass,
    innerRadiusClass,
    padX,
    padY,
    gapBlocks,
    gapGrid,
    listSpace,
    contentMaxW,
    density,
    dividers,
  };
}

/* =============================================================================
 * Partes visuales
 * ========================================================================== */

const CoverImage: React.FC<{
  mode: string;
  url: string;
  innerRadiusClass: string;
  density: Density;
  logoUrl?: string;
  isLightBg: boolean;
}> = ({ mode, url, innerRadiusClass, density, logoUrl, isLightBg }) => {
  const hasLogo = Boolean(logoUrl && logoUrl.trim().length > 0);

  if (mode === "url" && url) {
    return (
      <img
        src={url}
        alt="cover"
        className={cx("w-full object-cover", innerRadiusClass)}
        style={{
          height:
            density === "compact" ? 350 : density === "relaxed" ? 450 : 400,
        }}
      />
    );
  }

  if (hasLogo && logoUrl) {
    return (
      <img
        src={logoUrl}
        alt="logo pequeño"
        className={cx(
          "m-auto w-auto object-contain opacity-90",
          innerRadiusClass,
        )}
        style={{
          height: density === "compact" ? 24 : 32,
          marginTop: density === "compact" ? 12 : 18,
        }}
      />
    );
  }

  return (
    <div
      className={cx("m-auto w-24", innerRadiusClass)}
      style={{
        height: 32,
        marginTop: 16,
        backgroundColor: isLightBg
          ? "rgba(0,0,0,0.08)"
          : "rgba(255,255,255,0.10)",
      }}
    />
  );
};

const KeyValueRow: React.FC<{
  k?: React.ReactNode;
  v?: React.ReactNode;
  bg: string;
  innerRadiusClass: string;
}> = ({ k, v, bg, innerRadiusClass }) => (
  <div
    className={cx("flex items-center justify-between p-2", innerRadiusClass)}
    style={{ backgroundColor: bg }}
  >
    <span className="opacity-90">{k}</span>
    <span className="opacity-90">{v}</span>
  </div>
);

/* =============================================================================
 * Componente principal
 * ========================================================================== */

type Props = {
  cfg: TemplateConfig; // config persistida para el doc_type
  form?: TemplateFormValues | null; // elecciones + datos del usuario para ESTE documento
  docType: DocType;
  docTypeLabel?: string;
  token?: string | null; // opcional: permite pasar token externo
  showPlaceholders?: boolean; // si true, muestra {campo} en bloques form vacíos
};

const TemplatePreview: React.FC<Props> = ({
  cfg,
  form = null,
  docType,
  docTypeLabel = "Documento",
  token: propToken,
  showPlaceholders = false,
}) => {
  // Token: prioriza prop; si no está, usa contexto
  const { token: ctxToken } = useAuth();
  const token = propToken ?? ctxToken ?? null;

  const { agency, user, loading } = useAgencyAndUser(token);

  // Normalizamos config y mergeamos selections del form + agencia/usuario
  const normalized = useMemo(
    () => normalizeConfig(cfg, docType),
    [cfg, docType],
  );
  const runtime = useMemo(
    () =>
      mergeConfigWithFormValues(normalized, form ?? undefined, agency, user),
    [normalized, form, agency, user],
  );

  const rCfg = runtime.config;
  const rAgency = runtime.agency;
  const rUser = runtime.user;

  // ¿Es Mupu? (para overrides por bloque en fixed)
  const isMupuAgency =
    (typeof (rAgency as Agency).id === "number" &&
      (rAgency as Agency).id === 1) ||
    (typeof (rAgency as Agency).id_agency === "number" &&
      (rAgency as Agency).id_agency === 1);
  const shouldApplyMupu = (b: ContentBlock) =>
    isMupuAgency && b.mode === "fixed" && !!b.mupuStyle;

  // Bloques ya mergeados (memo fino para evitar casts dispersos)
  const blocks = useMemo<ContentBlock[]>(
    () => (rCfg.content?.blocks ?? []) as ContentBlock[],
    [rCfg.content?.blocks],
  );

  // Etiqueta sensible y tipada
  type LabelsCfg = { docTypeLabel?: string };
  const labels = (rCfg as unknown as { labels?: LabelsCfg }).labels;
  const docLabel = docTypeLabel ?? labels?.docTypeLabel ?? "Documento";

  // Layout
  const layout = rCfg.layout ?? "layoutA";

  // Colores / tipografías
  const bg = rCfg.styles?.colors?.background ?? "#111827";
  const text = rCfg.styles?.colors?.text ?? "#ffffff";
  const accent = rCfg.styles?.colors?.accent ?? "#22C55E";

  const headingFont = isMupuAgency
    ? "Arimo, sans-serif"
    : (rCfg.styles?.fonts?.heading ?? "Poppins");
  const headingWeight = 600;
  const bodyFont = isMupuAgency
    ? "Arimo, sans-serif"
    : (rCfg.styles?.fonts?.body ?? "Poppins");
  // UI tokens
  const {
    radiusClass,
    innerRadiusClass,
    padX,
    padY,
    gapBlocks,
    gapGrid,
    listSpace,
    contentMaxW,
    density,
    dividers,
  } = useUiTokens(rCfg);

  // Portada: ahora priorizamos la selección del vendedor (form.cover.url)
  const selectedCoverUrl = form?.cover?.url ?? rCfg.coverImage?.url ?? "";
  const coverMode = selectedCoverUrl
    ? "url"
    : (rCfg.coverImage?.mode ?? "logo");
  const hasCoverUrl = coverMode === "url" && !!selectedCoverUrl;

  // Línea corporativa
  const contactItems = asStringArray(rCfg.contactItems);
  // Teléfono elegido por el vendedor (si hay)
  const selectedPhoneFromForm = form?.contact?.phone ?? "";
  const corporateLine = useMemo(() => {
    const items: Array<{ label: string; value: string }> = [];

    const agencyWebsite = rAgency.website || "";
    const agencyAddress = rAgency.address || "";
    // Si el vendedor eligió un teléfono, usamos ése. Si no, el primero de agencia.
    const phoneChosen =
      selectedPhoneFromForm ||
      (Array.isArray(rAgency.phones) && rAgency.phones[0]) ||
      "";
    const agencyEmail =
      (Array.isArray(rAgency.emails) && rAgency.emails[0]) || "";

    const ig = rAgency.socials?.instagram || "";
    const fb = rAgency.socials?.facebook || "";
    const tw = rAgency.socials?.twitter || "";
    const tk = rAgency.socials?.tiktok || "";

    if (contactItems.includes("website") && agencyWebsite)
      items.push({ label: "Web", value: agencyWebsite });
    if (contactItems.includes("address") && agencyAddress)
      items.push({ label: "Dirección", value: agencyAddress });
    if (contactItems.includes("phones") && phoneChosen)
      items.push({ label: "Tel", value: phoneChosen });
    if (contactItems.includes("email") && agencyEmail)
      items.push({ label: "Mail", value: agencyEmail });

    if (contactItems.includes("instagram") && ig)
      items.push({ label: "Instagram", value: ig });
    if (contactItems.includes("facebook") && fb)
      items.push({ label: "Facebook", value: fb });
    if (contactItems.includes("twitter") && tw)
      items.push({ label: "Twitter", value: tw });
    if (contactItems.includes("tiktok") && tk)
      items.push({ label: "TikTok", value: tk });

    return items;
  }, [
    contactItems,
    rAgency.website,
    rAgency.address,
    rAgency.phones,
    rAgency.emails,
    rAgency.socials?.instagram,
    rAgency.socials?.facebook,
    rAgency.socials?.twitter,
    rAgency.socials?.tiktok,
    selectedPhoneFromForm,
  ]);

  // Derivados de agencia/usuario
  const agencyName = rAgency.name || "Nombre de la agencia";
  const legalName = rAgency.legal_name || rAgency.name || "Razón social";
  const agencyLogo = rAgency.logo_url || "";
  const hasLogo = Boolean(agencyLogo && agencyLogo.trim().length > 0);
  const sellerName =
    [rUser.first_name, rUser.last_name].filter(Boolean).join(" ") ||
    "Vendedor/a";
  const sellerEmail = rUser.email || "vendedor@agencia.com";

  // Contraste (bordes, paneles, chips)
  const isLightBg = luminance(bg) >= 0.7;
  const panelBgSoft = isLightBg
    ? withAlpha(accent, 0.05)
    : "rgba(255,255,255,0.04)";
  const panelBgStrong = isLightBg
    ? "rgba(0,0,0,0.06)"
    : "rgba(255,255,255,0.06)";
  const chipBg = isLightBg ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.06)";
  const borderColor = isLightBg
    ? withAlpha(accent, 0.35)
    : "rgba(255,255,255,0.10)";
  const dividerColor = isLightBg
    ? "rgba(0,0,0,0.10)"
    : "rgba(255,255,255,0.10)";
  const panelBorder = `1px solid ${borderColor}`;
  const chipStyle: React.CSSProperties = {
    border: panelBorder,
    backgroundColor: chipBg,
    color: accent,
  };

  // Pago seleccionado → priorizamos la selección del vendedor (form.payment.selectedIndex)
  type PaymentMupuStyle = {
    color?: string;
  };
  const rcfg = rCfg as unknown as Record<string, unknown>;
  const paymentOptions = asStringArray(
    getAt<string[] | undefined>(rcfg, ["paymentOptions"], undefined),
  );
  const paymentSelectedIndex =
    form?.payment?.selectedIndex ??
    getAt<number | null>(rcfg, ["payment", "selectedIndex"], null) ??
    null;
  const paymentSelected =
    paymentSelectedIndex !== null
      ? paymentOptions[paymentSelectedIndex] || ""
      : "";
  const paymentMupuStyle =
    getAt<PaymentMupuStyle | null>(rcfg, ["payment", "mupuStyle"], null) ??
    null;
  const paymentStyle =
    isMupuAgency && paymentMupuStyle
      ? resolveMupuTextStyle(paymentMupuStyle)
      : undefined;

  const PaymentPreview: React.FC = () =>
    !paymentSelected ? null : (
      <div className={cx(padX)}>
        <div
          className={cx("mt-4 text-sm", innerRadiusClass, "p-3")}
          style={{ border: panelBorder, backgroundColor: panelBgSoft }}
        >
          <div className="mb-1 font-medium" style={{ color: accent }}>
            Forma de pago
          </div>
          <div className="opacity-90" style={paymentStyle}>
            {paymentSelected}
          </div>
        </div>
      </div>
    );

  // Header
  const Header: React.FC = () => (
    <div className={cx(padX, "pt-6")}>
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1
            className="text-2xl"
            style={{
              fontFamily: headingFont,
              fontWeight: headingWeight,
            }}
          >
            {agencyName}
          </h1>
          <div
            className="mt-1 h-[2px] w-2/3 rounded-full"
            style={{ backgroundColor: accent }}
          />
        </div>
        <span
          className={cx(
            "mt-2 inline-flex w-max items-center px-3 py-1 text-sm uppercase tracking-wide",
            innerRadiusClass,
          )}
          style={chipStyle}
        >
          {docLabel}
        </span>
      </div>

      {corporateLine.length > 0 || loading ? (
        <div
          className={cx(
            "mt-4 flex flex-wrap items-center gap-2 text-sm",
            innerRadiusClass,
            "px-3 py-2",
          )}
          style={{ backgroundColor: panelBgSoft, border: panelBorder }}
        >
          {corporateLine.map((it, i) => (
            <span
              key={`${it.label}-${i}`}
              className={cx("px-2 py-0.5")}
              style={{ backgroundColor: chipBg, borderRadius: 8 }}
            >
              <b style={{ color: accent }}>{it.label}:</b>{" "}
              <span className="opacity-90" style={{ color: text }}>
                {it.value}
              </span>
            </span>
          ))}
          {loading && <span className="opacity-70">Cargando datos…</span>}
        </div>
      ) : null}
    </div>
  );

  // Content
  const ContentBlocks: React.FC = () => {
    const note = rCfg.styles?.note ?? "";
    const notesEnabled = (note || "").length > 0;

    const shouldRenderPlaceholder = (node: React.ReactNode) =>
      showPlaceholders ? node : null;

    return (
      <div className={cx(padX, "pb-6")}>
        <div className={cx("mx-auto", contentMaxW, "w-full")}>
          {notesEnabled && (
            <div
              className={cx("text-sm", innerRadiusClass, "p-3")}
              style={{ border: panelBorder, backgroundColor: panelBgSoft }}
            >
              {note}
            </div>
          )}

          <div className={cx("mt-4", gapBlocks)}>
            {blocks.map((b, index) => {
              const ms = b.mupuStyle;
              const applyMs = shouldApplyMupu(b);
              const roleStyle = (role?: BlockRole) =>
                applyMs ? resolveMupuTextStyle(ms, role) : undefined;

              const placeholder =
                b.mode === "form"
                  ? shouldRenderPlaceholder(
                      <span className="opacity-70">{`{${b.fieldKey || "campo"}}`}</span>,
                    )
                  : null;

              const topDivider = dividers && index > 0 && (
                <div
                  className="mb-3 h-px w-full md:mb-4"
                  style={{ backgroundColor: dividerColor }}
                />
              );

              if (b.type === "heading") {
                const level = b.level ?? 1;
                const textValue = b.text ?? "";
                if (
                  b.mode === "form" &&
                  isBlank(textValue) &&
                  !showPlaceholders
                )
                  return null;

                const size =
                  level === 1
                    ? "text-2xl"
                    : level === 2
                      ? "text-xl"
                      : "text-lg";
                const Tag = (["h1", "h2", "h3"] as const)[
                  Math.min(Math.max(level, 1), 3) - 1
                ];
                const role: BlockRole =
                  level === 1 ? "h1" : level === 2 ? "h2" : "h3";
                const styleHeading = roleStyle(role);

                return (
                  <div key={b.id}>
                    {topDivider}
                    <Tag
                      className={cx(size)}
                      style={{
                        ...(styleHeading || {}),
                        fontFamily: styleHeading?.fontFamily ?? headingFont,
                        fontWeight: styleHeading?.fontWeight ?? headingWeight,
                        color: (applyMs && ms?.color) || undefined,
                      }}
                    >
                      {b.mode === "form"
                        ? isBlank(textValue)
                          ? placeholder
                          : textValue
                        : textValue}
                    </Tag>
                  </div>
                );
              }

              if (b.type === "subtitle") {
                const t = b.text ?? "";
                if (b.mode === "form" && isBlank(t) && !showPlaceholders)
                  return null;

                const styleSubtitle = roleStyle("subtitle");
                return (
                  <div key={b.id}>
                    {topDivider}
                    <h4
                      className="text-lg font-medium opacity-95"
                      style={styleSubtitle}
                    >
                      {b.mode === "form" ? (isBlank(t) ? placeholder : t) : t}
                    </h4>
                  </div>
                );
              }

              if (b.type === "paragraph") {
                const t = b.text ?? "";
                if (b.mode === "form" && isBlank(t) && !showPlaceholders)
                  return null;

                const styleParagraph = roleStyle("paragraph");
                return (
                  <div key={b.id}>
                    {topDivider}
                    <p className="leading-relaxed" style={styleParagraph}>
                      {b.mode === "form" ? (isBlank(t) ? placeholder : t) : t}
                    </p>
                  </div>
                );
              }

              if (b.type === "list") {
                const items = b.items ?? [];
                if (
                  b.mode === "form" &&
                  items.length === 0 &&
                  !showPlaceholders
                )
                  return null;

                const styleList = roleStyle("list");
                return (
                  <div key={b.id}>
                    {topDivider}
                    <ul className={cx("list-inside list-disc", listSpace)}>
                      {b.mode === "form" && items.length === 0 ? (
                        <li style={styleList}>{placeholder}</li>
                      ) : (
                        items.map((it, i) => (
                          <li key={i} style={styleList}>
                            {it}
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                );
              }

              if (b.type === "keyValue") {
                const pairs = b.pairs ?? [];
                if (
                  b.mode === "form" &&
                  pairs.length === 0 &&
                  !showPlaceholders
                )
                  return null;

                const target = ms?.target ?? "all";
                const styleKey =
                  applyMs && (target === "all" || target === "keys")
                    ? roleStyle("kv")
                    : undefined;
                const styleVal =
                  applyMs && (target === "all" || target === "values")
                    ? roleStyle("kv")
                    : undefined;

                return (
                  <div key={b.id} className="mt-2">
                    {topDivider}
                    <div className="grid gap-2">
                      {b.mode === "form" && pairs.length === 0 ? (
                        <KeyValueRow
                          k={
                            <span className="opacity-70" style={styleKey}>
                              {placeholder}
                            </span>
                          }
                          v={
                            <span className="opacity-70" style={styleVal}>
                              {placeholder}
                            </span>
                          }
                          bg={panelBgStrong}
                          innerRadiusClass={innerRadiusClass}
                        />
                      ) : (
                        pairs.map((p, i) => (
                          <KeyValueRow
                            key={i}
                            k={<span style={styleKey}>{p.key}</span>}
                            v={<span style={styleVal}>{p.value}</span>}
                            bg={panelBgStrong}
                            innerRadiusClass={innerRadiusClass}
                          />
                        ))
                      )}
                    </div>
                  </div>
                );
              }

              if (b.type === "twoColumns") {
                const left = b.left ?? "";
                const right = b.right ?? "";
                const bothEmpty = isBlank(left) && isBlank(right);
                if (b.mode === "form" && bothEmpty && !showPlaceholders)
                  return null;

                const styleTwo = roleStyle("two");
                const cell = (content: string, key: string) => (
                  <div
                    key={key}
                    className={cx("p-3", innerRadiusClass)}
                    style={{ backgroundColor: panelBgStrong }}
                  >
                    <div style={styleTwo}>
                      {b.mode === "form"
                        ? isBlank(content)
                          ? placeholder
                          : content
                        : content}
                    </div>
                  </div>
                );

                return (
                  <div key={b.id}>
                    {topDivider}
                    <div className={cx("grid md:grid-cols-2", gapGrid)}>
                      {cell(left, "l")}
                      {cell(right, "r")}
                    </div>
                  </div>
                );
              }

              if (b.type === "threeColumns") {
                const left = b.left ?? "";
                const center = b.center ?? "";
                const right = b.right ?? "";
                const allEmpty =
                  isBlank(left) && isBlank(center) && isBlank(right);
                if (b.mode === "form" && allEmpty && !showPlaceholders)
                  return null;

                const styleThree = roleStyle("three");
                const cell = (content: string, key: string) => (
                  <div
                    key={key}
                    className={cx("p-3", innerRadiusClass)}
                    style={{ backgroundColor: panelBgStrong }}
                  >
                    <div style={styleThree}>
                      {b.mode === "form"
                        ? isBlank(content)
                          ? placeholder
                          : content
                        : content}
                    </div>
                  </div>
                );
                return (
                  <div key={b.id}>
                    {topDivider}
                    <div className={cx("grid md:grid-cols-3", gapGrid)}>
                      {cell(left, "l")}
                      {cell(center, "c")}
                      {cell(right, "r")}
                    </div>
                  </div>
                );
              }

              return null;
            })}
          </div>
        </div>
      </div>
    );
  };

  // Footer
  const Footer: React.FC = () => (
    <div
      className={cx("mt-4", padX, padY)}
      style={{ borderTop: `1px solid ${dividerColor}` }}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div
          className={cx("text-sm", innerRadiusClass, "p-3")}
          style={{ border: panelBorder, backgroundColor: panelBgSoft }}
        >
          <div className="font-medium" style={{ color: accent }}>
            {sellerName}
          </div>
          <div className="opacity-90">{sellerEmail}</div>
        </div>

        <div className="flex items-center gap-3 self-end md:self-auto">
          {hasLogo ? (
            <img
              src={agencyLogo}
              alt="logo pequeño"
              className={cx(
                "h-8 w-auto object-contain opacity-90",
                innerRadiusClass,
              )}
            />
          ) : (
            <div
              className={cx("h-8 w-16", innerRadiusClass)}
              style={{
                backgroundColor: isLightBg
                  ? "rgba(0,0,0,0.08)"
                  : "rgba(255,255,255,0.10)",
              }}
            />
          )}
          <div className="text-xs opacity-80">{legalName}</div>
        </div>
      </div>
    </div>
  );

  /* ===========================================================================
   * Render principal con variantes de layout (A/B/C)
   * ======================================================================== */

  return (
    <div
      className={cx(`col-span-2 h-fit border`, radiusClass)}
      style={{
        backgroundColor: bg,
        color: text,
        fontFamily: bodyFont,
        borderColor: borderColor,
      }}
    >
      {layout === "layoutA" && (
        <>
          <CoverImage
            mode={coverMode}
            url={selectedCoverUrl}
            innerRadiusClass={innerRadiusClass}
            density={density}
            logoUrl={agencyLogo}
            isLightBg={isLightBg}
          />
          <Header />
          <ContentBlocks />
          <PaymentPreview />
          <Footer />
        </>
      )}

      {layout === "layoutB" && (
        <>
          <Header />
          {hasCoverUrl ? (
            <div className={cx(padX, "mt-4")}>
              <img
                src={selectedCoverUrl}
                alt="cover"
                className={cx("w-full object-cover", innerRadiusClass)}
                style={{
                  height:
                    density === "compact"
                      ? 350
                      : density === "relaxed"
                        ? 450
                        : 400,
                }}
              />
            </div>
          ) : null}
          <ContentBlocks />
          <PaymentPreview />
          <Footer />
        </>
      )}

      {layout === "layoutC" && (
        <div className={cx("grid gap-0 md:grid-cols-[280px_1fr]", radiusClass)}>
          {/* Sidebar */}
          <aside
            className={cx("p-6", innerRadiusClass)}
            style={{ backgroundColor: panelBgSoft }}
          >
            {hasLogo ? (
              <img
                src={agencyLogo}
                alt="logo"
                className={cx(
                  "mb-4 h-10 w-auto object-contain opacity-90",
                  innerRadiusClass,
                )}
              />
            ) : (
              <div
                className={cx("mb-4 h-10 w-24", innerRadiusClass)}
                style={{
                  backgroundColor: isLightBg
                    ? "rgba(0,0,0,0.08)"
                    : "rgba(255,255,255,0.10)",
                }}
              />
            )}

            <h2
              className="text-lg"
              style={{
                fontFamily: headingFont,
                fontWeight: headingWeight,
              }}
            >
              {agencyName}
            </h2>
            <div
              className="mt-1 h-[2px] w-2/3 rounded-full"
              style={{ backgroundColor: accent }}
            />

            <div className="mt-3 text-xs opacity-80">
              {corporateLine.map((it, i) => (
                <div key={i} className="mb-1">
                  <b style={{ color: accent }}>{it.label}:</b>{" "}
                  <span style={{ color: text }}>{it.value}</span>
                </div>
              ))}
              {corporateLine.length === 0 && (
                <div className="opacity-60">Sin datos de contacto</div>
              )}
            </div>

            <span
              className={cx(
                "mt-4 inline-flex w-max items-center px-2 py-1 text-[11px] uppercase tracking-wide",
                innerRadiusClass,
              )}
              style={{
                border: panelBorder,
                backgroundColor: chipBg,
                color: accent,
              }}
            >
              {docLabel}
            </span>
          </aside>

          {/* Main */}
          <main className={cx("rounded-r-2xl p-2")}>
            {hasCoverUrl ? (
              <img
                src={selectedCoverUrl}
                alt="cover"
                className={cx("w-full object-cover", innerRadiusClass)}
                style={{
                  height:
                    density === "compact"
                      ? 144
                      : density === "relaxed"
                        ? 220
                        : 184,
                }}
              />
            ) : null}

            <ContentBlocks />
            <PaymentPreview />
            <Footer />
          </main>
        </div>
      )}
    </div>
  );
};

export default TemplatePreview;
