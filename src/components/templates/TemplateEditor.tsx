// src/components/templates/TemplateEditor.tsx
"use client";
/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid/non-secure";
import { useAuth } from "@/context/AuthContext";
import { useAgencyAndUser } from "@/lib/agencyUser";
import {
  normalizeConfig,
  mergeConfigWithFormValues,
  buildInitialOrderedBlocks,
  asStringArray,
  getAt,
} from "@/lib/templateConfig";
import TemplatePdfDownload from "./TemplatePdfDownload";
import TextPresetPicker from "./TextPresetPicker";
import type {
  DocType,
  TemplateConfig,
  TemplateFormValues,
  OrderedBlock,
  BlockType,
  BlockFormValue,
  Density,
  Agency,
} from "@/types/templates";

import BlocksCanvas from "./BlocksCanvas";

/* =============================================================================
 * Helpers visuales
 * ========================================================================== */

const cx = (...c: Array<string | false | null | undefined>) =>
  c.filter(Boolean).join(" ");

const WS_PRESERVE: React.CSSProperties = {
  whiteSpace: "break-spaces",
  tabSize: 4,
};

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
 * Inicialización
 * ========================================================================== */

function useEnsureBlocksInitialized(
  cfg: TemplateConfig,
  value: TemplateFormValues,
  onChange: (next: TemplateFormValues) => void,
) {
  useEffect(() => {
    if (Array.isArray(value.blocks) && value.blocks.length > 0) return;
    const initial = buildInitialOrderedBlocks(cfg);
    onChange({ ...value, blocks: initial });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, value.blocks]);
}

/* =============================================================================
 * Factory + patchValue
 * ========================================================================== */

function makeNewBlock(type: BlockType): OrderedBlock {
  const id = nanoid();
  switch (type) {
    case "heading":
      return {
        id,
        origin: "extra",
        type,
        label: undefined,
        value: { type: "heading", text: "", level: 1 }, // H1
      };
    case "subtitle":
      return {
        id,
        origin: "extra",
        type,
        value: { type: "subtitle", text: "" },
      };
    case "paragraph":
      return {
        id,
        origin: "extra",
        type,
        value: { type: "paragraph", text: "" },
      };
    case "list":
      return {
        id,
        origin: "extra",
        type,
        value: { type: "list", items: [] },
      };
    case "keyValue":
      return {
        id,
        origin: "extra",
        type,
        value: { type: "keyValue", pairs: [] },
      };
    case "twoColumns":
      return {
        id,
        origin: "extra",
        type,
        value: { type: "twoColumns", left: "", right: "" },
      };
    case "threeColumns":
      return {
        id,
        origin: "extra",
        type,
        value: { type: "threeColumns", left: "", center: "", right: "" },
      };
  }
}

/** Asegura que el `value` tenga la `type` correcta y mergea el patch parcial */
export function patchValueForType(
  b: OrderedBlock,
  patch:
    | Partial<Extract<BlockFormValue, { type: "heading" }>>
    | Partial<Extract<BlockFormValue, { type: "subtitle" }>>
    | Partial<Extract<BlockFormValue, { type: "paragraph" }>>
    | Partial<Extract<BlockFormValue, { type: "list" }>>
    | Partial<Extract<BlockFormValue, { type: "keyValue" }>>
    | Partial<Extract<BlockFormValue, { type: "twoColumns" }>>
    | Partial<Extract<BlockFormValue, { type: "threeColumns" }>>,
): BlockFormValue {
  const existing = b.value;
  switch (b.type) {
    case "heading":
      return {
        type: "heading",
        text: (existing as Extract<BlockFormValue, { type: "heading" }>)?.text,
        level: 1, // 🔒 H1 forzado
        ...(patch as Partial<Extract<BlockFormValue, { type: "heading" }>>),
      };
    case "subtitle":
      return {
        type: "subtitle",
        text: (existing as Extract<BlockFormValue, { type: "subtitle" }>)?.text,
        ...(patch as Partial<Extract<BlockFormValue, { type: "subtitle" }>>),
      };
    case "paragraph":
      return {
        type: "paragraph",
        text: (existing as Extract<BlockFormValue, { type: "paragraph" }>)
          ?.text,
        ...(patch as Partial<Extract<BlockFormValue, { type: "paragraph" }>>),
      };
    case "list":
      return {
        type: "list",
        items:
          (existing as Extract<BlockFormValue, { type: "list" }>)?.items ?? [],
        ...(patch as Partial<Extract<BlockFormValue, { type: "list" }>>),
      };
    case "keyValue":
      return {
        type: "keyValue",
        pairs:
          (existing as Extract<BlockFormValue, { type: "keyValue" }>)?.pairs ??
          [],
        ...(patch as Partial<Extract<BlockFormValue, { type: "keyValue" }>>),
      };
    case "twoColumns":
      return {
        type: "twoColumns",
        left: (existing as Extract<BlockFormValue, { type: "twoColumns" }>)
          ?.left,
        right: (existing as Extract<BlockFormValue, { type: "twoColumns" }>)
          ?.right,
        ...(patch as Partial<Extract<BlockFormValue, { type: "twoColumns" }>>),
      };
    case "threeColumns":
      return {
        type: "threeColumns",
        left: (existing as Extract<BlockFormValue, { type: "threeColumns" }>)
          ?.left,
        center: (existing as Extract<BlockFormValue, { type: "threeColumns" }>)
          ?.center,
        right: (existing as Extract<BlockFormValue, { type: "threeColumns" }>)
          ?.right,
        ...(patch as Partial<
          Extract<BlockFormValue, { type: "threeColumns" }>
        >),
      };
  }
}

/* =============================================================================
 * Props
 * ========================================================================== */

type Props = {
  cfg: TemplateConfig;
  value: TemplateFormValues;
  onChange: (next: TemplateFormValues) => void;
  docType: DocType;
  className?: string;
  token?: string | null;
  filename?: string;
};

/* =============================================================================
 * Helpers de contenido fijo desde la config
 * ========================================================================== */

type CfgBlock =
  | ({ id: string; type: "heading"; level?: number; text?: string } & Record<
      string,
      unknown
    >)
  | ({ id: string; type: "subtitle"; text?: string } & Record<string, unknown>)
  | ({ id: string; type: "paragraph"; text?: string } & Record<string, unknown>)
  | ({ id: string; type: "list"; items?: string[] } & Record<string, unknown>)
  | ({
      id: string;
      type: "keyValue";
      pairs?: Array<{ key?: string; value?: string }>;
    } & Record<string, unknown>)
  | ({
      id: string;
      type: "twoColumns";
      left?: string;
      right?: string;
    } & Record<string, unknown>)
  | ({
      id: string;
      type: "threeColumns";
      left?: string;
      center?: string;
      right?: string;
    } & Record<string, unknown>);

function cfgBlockToFormValue(cb: CfgBlock): BlockFormValue | null {
  switch (cb.type) {
    case "heading":
      return { type: "heading", text: cb.text ?? "", level: 1 }; // H1 fijo
    case "subtitle":
      return { type: "subtitle", text: cb.text ?? "" };
    case "paragraph":
      return { type: "paragraph", text: cb.text ?? "" };
    case "list":
      return { type: "list", items: Array.isArray(cb.items) ? cb.items : [] };
    case "keyValue":
      return {
        type: "keyValue",
        pairs: Array.isArray(cb.pairs)
          ? cb.pairs.map((p) => ({
              key: p?.key ?? "",
              value: p?.value ?? "",
            }))
          : [],
      };
    case "twoColumns":
      return {
        type: "twoColumns",
        left: cb.left ?? "",
        right: cb.right ?? "",
      };
    case "threeColumns":
      return {
        type: "threeColumns",
        left: cb.left ?? "",
        center: cb.center ?? "",
        right: cb.right ?? "",
      };
    default:
      return null;
  }
}

// helper para detectar contenido real (tipado, sin any)
function hasMeaningfulContent(b: OrderedBlock): boolean {
  const v = b?.value as BlockFormValue | undefined;
  const hasText = (s?: string) => !!(s && s.trim().length);

  switch (b.type) {
    case "heading": {
      const hv = v as Extract<BlockFormValue, { type: "heading" }> | undefined;
      return hasText(hv?.text);
    }
    case "subtitle": {
      const sv = v as Extract<BlockFormValue, { type: "subtitle" }> | undefined;
      return hasText(sv?.text);
    }
    case "paragraph": {
      const pv = v as
        | Extract<BlockFormValue, { type: "paragraph" }>
        | undefined;
      return hasText(pv?.text);
    }
    case "list": {
      const lv = v as Extract<BlockFormValue, { type: "list" }> | undefined;
      const items = Array.isArray(lv?.items) ? lv!.items : [];
      return items.some((x) => hasText(x));
    }
    case "keyValue": {
      const kv =
        (v as Extract<BlockFormValue, { type: "keyValue" }>) || undefined;
      const pairs = Array.isArray(kv?.pairs) ? kv!.pairs : [];
      return pairs.some((p) => hasText(p?.key) || hasText(p?.value));
    }
    case "twoColumns": {
      const tv =
        (v as Extract<BlockFormValue, { type: "twoColumns" }>) || undefined;
      return hasText(tv?.left) || hasText(tv?.right);
    }
    case "threeColumns": {
      const tv =
        (v as Extract<BlockFormValue, { type: "threeColumns" }>) || undefined;
      return hasText(tv?.left) || hasText(tv?.center) || hasText(tv?.right);
    }
    default:
      return false;
  }
}

/* =============================================================================
 * Componente principal
 * ========================================================================== */

const TemplateEditor: React.FC<Props> = ({
  cfg,
  value,
  onChange,
  docType,
  className,
  token: propToken,
  filename,
}) => {
  useEnsureBlocksInitialized(cfg, value, onChange);

  const { token: ctxToken } = useAuth();
  const token = propToken ?? ctxToken ?? null;
  const { agency, user, loading } = useAgencyAndUser(token);

  // UX: desbloquear fijos / foco tras agregar / ref canvas
  const [unlockFixed, setUnlockFixed] = useState(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [focusSeq, setFocusSeq] = useState(0);

  // Normalizamos config y mergeamos selections del form + agencia/usuario
  const normalized = useMemo(
    () => normalizeConfig(cfg, docType),
    [cfg, docType],
  );
  const runtime = useMemo(
    () => mergeConfigWithFormValues(normalized, value, agency, user),
    [normalized, value, agency, user],
  );

  const rCfg = runtime.config;
  const rAgency = runtime.agency;
  const rUser = runtime.user;

  const blocks = useMemo<OrderedBlock[]>(
    () => (Array.isArray(value.blocks) ? value.blocks : []),
    [value.blocks],
  );
  const setBlocks = (next: OrderedBlock[]) =>
    onChange({ ...value, blocks: next });

  // 🔄 Hidratar bloques fijos desde la config si están vacíos
  useEffect(() => {
    const cfgBlocks = (cfg?.content?.blocks ?? []) as CfgBlock[];
    if (!Array.isArray(value.blocks) || value.blocks.length === 0) return;

    const byId = new Map<string, BlockFormValue>();
    for (const cb of cfgBlocks) {
      const fv = cfgBlockToFormValue(cb);
      if (fv) byId.set(cb.id, fv);
    }

    let changed = false;
    const next = value.blocks.map((b) => {
      if (b.origin === "fixed" && !hasMeaningfulContent(b)) {
        const srcVal = byId.get(b.id);
        if (srcVal) {
          changed = true;
          return { ...b, value: srcVal };
        }
      }
      return b;
    });

    if (changed) onChange({ ...value, blocks: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, value.blocks]);

  // Etiquetas / layout / estilos corporativos
  const labels =
    (rCfg as unknown as { labels?: { docTypeLabel?: string } }).labels || {};
  const docLabel =
    labels.docTypeLabel ??
    (docType === "quote" ? "Cotización" : "Confirmación");

  const layout = rCfg.layout ?? "layoutA";

  const bg = rCfg.styles?.colors?.background ?? "#111827";
  const text = rCfg.styles?.colors?.text ?? "#ffffff";
  const accent = rCfg.styles?.colors?.accent ?? "#22C55E";

  const headingFont =
    (rAgency as Agency)?.id === 1 || (rAgency as Agency)?.id_agency === 1
      ? "Arimo, sans-serif"
      : (rCfg.styles?.fonts?.heading ?? "Poppins");
  const headingWeight = 600;
  const bodyFont =
    (rAgency as Agency)?.id === 1 || (rAgency as Agency)?.id_agency === 1
      ? "Arimo, sans-serif"
      : (rCfg.styles?.fonts?.body ?? "Poppins");

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
  } = useUiTokens(rCfg);

  // Portada
  const selectedCoverUrl = value?.cover?.url ?? rCfg.coverImage?.url ?? "";
  const coverMode = selectedCoverUrl
    ? "url"
    : (rCfg.coverImage?.mode ?? "logo");
  const hasCoverUrl = coverMode === "url" && !!selectedCoverUrl;

  // Línea corporativa
  const contactItems = asStringArray(rCfg.contactItems);
  const selectedPhoneFromForm = value?.contact?.phone ?? "";
  const corporateLine = useMemo(() => {
    const items: Array<{ label: string; value: string }> = [];
    const agencyWebsite = rAgency.website || "";
    const agencyAddress = rAgency.address || "";
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

  // Contraste
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

  // Pago
  type PaymentMupuStyle = { color?: string };
  const rcfg = rCfg as unknown as Record<string, unknown>;
  const paymentOptions = asStringArray(
    getAt<string[] | undefined>(rcfg, ["paymentOptions"], undefined),
  );
  const paymentSelectedIndex =
    value?.payment?.selectedIndex ??
    getAt<number | null>(rcfg, ["payment", "selectedIndex"], null) ??
    null;
  const paymentSelected =
    paymentSelectedIndex !== null
      ? paymentOptions[paymentSelectedIndex] || ""
      : "";
  const paymentMupuStyle =
    getAt<PaymentMupuStyle | null>(rcfg, ["payment", "mupuStyle"], null) ??
    null;
  const isMupuAgency =
    (typeof (rAgency as Agency).id === "number" &&
      (rAgency as Agency).id === 1) ||
    (typeof (rAgency as Agency).id_agency === "number" &&
      (rAgency as Agency).id_agency === 1);
  const paymentStyle =
    isMupuAgency && paymentMupuStyle ? { color: paymentMupuStyle.color } : {};

  /* =============================================================================
   * Toolbar (agregar bloques + presets)
   * ========================================================================== */

  const onAddBlock = (t: BlockType) => {
    const nb = makeNewBlock(t);
    setBlocks([...(blocks ?? []), nb]);
    setFocusSeq((n) => n + 1); // focus al último editable
  };

  // Enfocar último editable tras agregar bloque
  useEffect(() => {
    if (!focusSeq) return;
    const root = canvasRef.current;
    if (!root) return;

    const id = requestAnimationFrame(() => {
      const editables = root.querySelectorAll<HTMLElement>(
        '[contenteditable="true"]',
      );
      if (editables.length === 0) return;
      const el = editables[editables.length - 1];

      el.focus();
      const sel = window.getSelection?.();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);

      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });

    return () => cancelAnimationFrame(id);
  }, [blocks.length, focusSeq]);

  // Guardar preset de data (bloques)
  async function saveCurrentAsPreset() {
    try {
      if (!token) throw new Error("No hay token de autenticación.");
      const title = window.prompt("Nombre del preset de contenido:");
      if (!title || !title.trim()) return;

      const envelope = {
        version: 2,
        kind: "data" as const,
        data: { blocks },
      };

      const payload = {
        title: title.trim(),
        content: "",
        doc_type: docType,
        data: envelope,
      };

      const res = await fetch("/api/text-preset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg =
          (data?.error as string) ||
          (data?.message as string) ||
          "No se pudo guardar el preset.";
        throw new Error(msg);
      }

      alert("Preset de contenido guardado.");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error guardando el preset.");
    }
  }

  /* =============================================================================
   * Partes visuales (cabecera / contenido / pie)
   * ========================================================================== */

  const Header: React.FC = () => (
    <div className={cx(padX, "pt-6")}>
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1
            className="text-2xl"
            style={{
              fontFamily: headingFont,
              fontWeight: headingWeight,
              ...WS_PRESERVE,
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
          <div
            className="opacity-90"
            style={{ ...paymentStyle, ...WS_PRESERVE }}
          >
            {paymentSelected}
          </div>
        </div>
      </div>
    );

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

  /* =============================================================================
   * Render
   * ========================================================================== */

  // ✅ SOLO bloquea los bloques con origin:"fixed" (los "form" quedan editables)
  const lockedIdsSet = useMemo(
    () =>
      unlockFixed
        ? new Set<string>()
        : new Set(
            (blocks || []).filter((b) => b.origin === "fixed").map((b) => b.id),
          ),
    [unlockFixed, blocks],
  );

  return (
    <section className={cx("space-y-6", className)}>
      {/* Toolbar superior */}
      <div className="mb-2 rounded-2xl border border-slate-900/10 bg-white/50 p-4 dark:border-white/10 dark:bg-white/10">
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h3 className="text-base font-semibold opacity-90">
            Contenido del documento
          </h3>

          <div className="flex flex-wrap items-center gap-3">
            {/* Toggle: desbloquear fijos */}
            <label className="flex cursor-pointer select-none items-center gap-2 text-sm opacity-90">
              <input
                type="checkbox"
                className="size-4 accent-sky-600"
                checked={unlockFixed}
                onChange={(e) => setUnlockFixed(e.target.checked)}
              />
              Editar bloques fijos
            </label>

            <button
              type="button"
              onClick={saveCurrentAsPreset}
              className="rounded-full bg-sky-100 px-3 py-1 text-sm text-sky-900 shadow-sm hover:opacity-90 dark:bg-white/10 dark:text-white"
              title="Guardar los bloques actuales como preset"
            >
              Guardar preset
            </button>
          </div>
        </div>

        <TextPresetPicker
          token={token ?? null}
          docType={docType}
          onApply={(content) => {
            if (!content?.trim()) return;
            setBlocks([
              ...(blocks ?? []),
              {
                id: nanoid(),
                origin: "extra",
                type: "paragraph",
                value: { type: "paragraph", text: content },
              },
            ]);
            setFocusSeq((n) => n + 1);
          }}
          onApplyData={(maybeBlocks) => {
            if (Array.isArray(maybeBlocks)) {
              setBlocks(maybeBlocks as OrderedBlock[]);
              setFocusSeq((n) => n + 1);
            }
          }}
        />

        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ["heading", "Título"],
              ["subtitle", "Subtítulo"],
              ["paragraph", "Párrafo"],
              ["list", "Lista"],
              ["keyValue", "Clave/Valor"],
              ["twoColumns", "Dos columnas"],
              ["threeColumns", "Tres columnas"],
            ] as Array<[BlockType, string]>
          ).map(([t, label]) => (
            <button
              key={t}
              type="button"
              onClick={() => onAddBlock(t)}
              className="rounded-full bg-sky-100 px-3 py-1 text-xs text-sky-900 hover:opacity-90 dark:bg-white/10 dark:text-white"
            >
              + {label}
            </button>
          ))}
        </div>

        <p className="mt-2 text-xs opacity-70">
          Editá los bloques <b>directamente</b> en la vista previa. Usá la
          manija <b>⋮⋮</b> para moverlos. Los bloques <b>fijos</b> se pueden
          mover, y si activás “Editar bloques fijos”, también
          editarlos/eliminarlos.
        </p>
      </div>

      {/* Lienzo: preview editable */}
      <div
        className={cx(`col-span-2 h-fit border`, radiusClass)}
        style={{
          backgroundColor: bg,
          color: text,
          fontFamily: bodyFont,
          borderColor: borderColor,
        }}
      >
        {/* Layout A */}
        {layout === "layoutA" && (
          <>
            {/* Cover */}
            {hasCoverUrl ? (
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
            ) : hasLogo ? (
              <div className={cx("p-4")}>
                <img
                  src={agencyLogo}
                  alt="logo"
                  className={cx(
                    "mx-auto h-8 w-auto object-contain opacity-90",
                    innerRadiusClass,
                  )}
                />
              </div>
            ) : null}

            <Header />

            {/* Bloques editables */}
            <div className={cx("mt-4", "pb-6", "w-full", padX)} ref={canvasRef}>
              <div className={cx("mx-auto", contentMaxW, "w-full", gapBlocks)}>
                <BlocksCanvas
                  blocks={blocks}
                  onChange={setBlocks}
                  lockedIds={lockedIdsSet}
                  options={{
                    dividerColor,
                    panelBgStrong,
                    innerRadiusClass,
                    gapGridClass: gapGrid,
                    listSpaceClass: listSpace,
                    accentColor: accent,
                    headingFont,
                    headingWeight,
                  }}
                />
              </div>
            </div>

            <PaymentPreview />
            <Footer />
          </>
        )}

        {/* Layout B */}
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

            <div className={cx("mt-4", "pb-6", "w-full", padX)} ref={canvasRef}>
              <div className={cx("mx-auto", contentMaxW, "w-full", gapBlocks)}>
                <BlocksCanvas
                  blocks={blocks}
                  onChange={setBlocks}
                  lockedIds={lockedIdsSet}
                  options={{
                    dividerColor,
                    panelBgStrong,
                    innerRadiusClass,
                    gapGridClass: gapGrid,
                    listSpaceClass: listSpace,
                    accentColor: accent,
                    headingFont,
                    headingWeight,
                  }}
                />
              </div>
            </div>

            <PaymentPreview />
            <Footer />
          </>
        )}

        {/* Layout C */}
        {layout === "layoutC" && (
          <div
            className={cx("grid gap-0 md:grid-cols-[280px_1fr]", radiusClass)}
          >
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
                  ...WS_PRESERVE,
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

            {/* Main editable */}
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

              <div
                className={cx("mt-2", "pb-6", "w-full", padX)}
                ref={canvasRef}
              >
                <div
                  className={cx("mx-auto", contentMaxW, "w-full", gapBlocks)}
                >
                  <BlocksCanvas
                    blocks={blocks}
                    onChange={setBlocks}
                    lockedIds={lockedIdsSet}
                    options={{
                      dividerColor,
                      panelBgStrong,
                      innerRadiusClass,
                      gapGridClass: gapGrid,
                      listSpaceClass: listSpace,
                      accentColor: accent,
                      headingFont,
                      headingWeight,
                    }}
                  />
                </div>
              </div>

              <PaymentPreview />
              <Footer />
            </main>
          </div>
        )}
      </div>

      {/* Botón PDF */}
      <div className="flex justify-end">
        <TemplatePdfDownload
          cfg={rCfg}
          form={value}
          docType={docType}
          docTypeLabel={docLabel}
          filename={
            filename ||
            (docType === "quote"
              ? `cotizacion-${new Date().toISOString().slice(0, 10)}.pdf`
              : `confirmacion-${new Date().toISOString().slice(0, 10)}.pdf`)
          }
        />
      </div>
    </section>
  );
};

export default TemplateEditor;

/* =============================================================================
 * Tipos auxiliares exportados para BlocksCanvas
 * ========================================================================== */

export type CanvasOptions = {
  dividerColor: string;
  panelBgStrong: string;
  innerRadiusClass: string;
  gapGridClass: string;
  listSpaceClass: string;
  accentColor: string;
  headingFont: string;
  headingWeight: number;
};

export type BlocksCanvasProps = {
  blocks: OrderedBlock[];
  onChange: (next: OrderedBlock[]) => void;
  lockedIds: Set<string>;
  options: CanvasOptions;
};
