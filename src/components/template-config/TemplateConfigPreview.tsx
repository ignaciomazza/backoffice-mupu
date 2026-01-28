// src/components/template-config/TemplateConfigPreview.tsx
/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import BlocksCanvas from "@/components/templates/BlocksCanvas";
import type { OrderedBlock, BlockFormValue } from "@/types/templates";

/* =============================================================================
 * Tipos base + helpers
 * ========================================================================== */

type AnyObj = Record<string, unknown>;
export type Config = AnyObj;

const isObject = (v: unknown): v is AnyObj =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function getAt<T>(obj: AnyObj, path: string[], fallback: T): T {
  let cur: unknown = obj;
  for (const k of path) {
    if (!isObject(cur)) return fallback;
    cur = (cur as AnyObj)[k];
  }
  return (cur as T) ?? fallback;
}
function setAt(obj: AnyObj, path: string[], value: unknown): AnyObj {
  const next: AnyObj = { ...obj };
  let cur: AnyObj = next;
  for (let i = 0; i < path.length - 1; i += 1) {
    const k = path[i];
    const v = cur[k];
    if (!isObject(v)) cur[k] = {};
    cur = cur[k] as AnyObj;
  }
  cur[path[path.length - 1]] = value;
  return next;
}
const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
const cx = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

function normalizeKey(label: string, fallback: string) {
  const s =
    (label || "")
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "") || "";
  return s || fallback;
}

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
  // #RRGGBB -> rgba(r,g,b,a)
  if (color.startsWith("#")) {
    const rgb = hexToRgb(color);
    if (!rgb) return color;
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
  }
  // rgb/rgba(...) -> fuerza nuevo alfa
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1]
      .split(",")
      .slice(0, 3)
      .map((x) => x.trim());
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  // fallback
  return color;
}

/* =============================================================================
 * Bloques de contenido
 * ========================================================================== */

type BlockType =
  | "heading"
  | "subtitle"
  | "paragraph"
  | "list"
  | "keyValue"
  | "twoColumns"
  | "threeColumns";
type BlockMode = "fixed" | "form";

/** Overrides por bloque (solo visibles para Mupu + fixed) */
type MupuStyle = {
  color?: string;
  target?: "all" | "keys" | "values"; // solo keyValue
};

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

type BaseBlock = {
  id: string;
  type: BlockType;
  mode: BlockMode;
  label?: string;
  fieldKey?: string;
  mupuStyle?: MupuStyle;
};

type HeadingBlock = BaseBlock & {
  type: "heading";
  text?: string;
  level?: 1 | 2 | 3;
};
type SubtitleBlock = BaseBlock & { type: "subtitle"; text?: string };
type ParagraphBlock = BaseBlock & { type: "paragraph"; text?: string };
type ListBlock = BaseBlock & { type: "list"; items?: string[] };
type KeyValueBlock = BaseBlock & {
  type: "keyValue";
  pairs?: { key: string; value: string }[];
};
type TwoColumnsBlock = BaseBlock & {
  type: "twoColumns";
  left?: string;
  right?: string;
};
type ThreeColumnsBlock = BaseBlock & {
  type: "threeColumns";
  left?: string;
  center?: string;
  right?: string;
};

type ContentBlock =
  | HeadingBlock
  | SubtitleBlock
  | ParagraphBlock
  | ListBlock
  | KeyValueBlock
  | TwoColumnsBlock
  | ThreeColumnsBlock;

const BLOCK_LABELS: Record<BlockType, string> = {
  heading: "Titulo",
  subtitle: "Subtitulo",
  paragraph: "Parrafo",
  list: "Lista",
  keyValue: "Clave/Valor",
  twoColumns: "Dos columnas",
  threeColumns: "Tres columnas",
};

function isBlock(v: unknown): v is ContentBlock {
  if (!isObject(v)) return false;
  const t = (v as AnyObj)["type"];
  return (
    t === "heading" ||
    t === "subtitle" ||
    t === "paragraph" ||
    t === "list" ||
    t === "keyValue" ||
    t === "twoColumns" ||
    t === "threeColumns"
  );
}

function buildAutoLabels(
  blocks: Array<Pick<ContentBlock, "id" | "type">>,
): Map<string, string> {
  const counts: Record<BlockType, number> = {
    heading: 0,
    subtitle: 0,
    paragraph: 0,
    list: 0,
    keyValue: 0,
    twoColumns: 0,
    threeColumns: 0,
  };
  const map = new Map<string, string>();
  blocks.forEach((b) => {
    counts[b.type] += 1;
    map.set(b.id, `${BLOCK_LABELS[b.type]} ${counts[b.type]}`);
  });
  return map;
}

function resolveFieldKey(b: ContentBlock, label: string): string {
  return b.fieldKey || normalizeKey(label, `${b.type}_${b.id.slice(-4)}`);
}

type BuilderBlock = OrderedBlock & {
  label?: string;
  fieldKey?: string;
  mupuStyle?: MupuStyle;
};

function blockToValue(b: ContentBlock): BlockFormValue {
  switch (b.type) {
    case "heading":
      return { type: "heading", text: b.text ?? "", level: b.level ?? 1 };
    case "subtitle":
      return { type: "subtitle", text: b.text ?? "" };
    case "paragraph":
      return { type: "paragraph", text: b.text ?? "" };
    case "list":
      return { type: "list", items: Array.isArray(b.items) ? b.items : [] };
    case "keyValue":
      return {
        type: "keyValue",
        pairs: Array.isArray(b.pairs) ? b.pairs : [],
      };
    case "twoColumns":
      return { type: "twoColumns", left: b.left ?? "", right: b.right ?? "" };
    case "threeColumns":
      return {
        type: "threeColumns",
        left: b.left ?? "",
        center: b.center ?? "",
        right: b.right ?? "",
      };
  }
}

function blockToPlaceholder(
  b: ContentBlock,
  fieldKey?: string,
): BlockFormValue {
  const placeholder = `{${fieldKey || b.fieldKey || "campo"}}`;
  switch (b.type) {
    case "heading":
      return { type: "heading", text: placeholder, level: b.level ?? 1 };
    case "subtitle":
      return { type: "subtitle", text: placeholder };
    case "paragraph":
      return { type: "paragraph", text: placeholder };
    case "list":
      return { type: "list", items: [placeholder] };
    case "keyValue":
      return { type: "keyValue", pairs: [{ key: placeholder, value: placeholder }] };
    case "twoColumns":
      return { type: "twoColumns", left: placeholder, right: placeholder };
    case "threeColumns":
      return {
        type: "threeColumns",
        left: placeholder,
        center: placeholder,
        right: placeholder,
      };
  }
}

function toOrderedBlock(
  b: ContentBlock,
  label: string,
  fieldKey: string,
): BuilderBlock {
  return {
    id: b.id,
    origin: b.mode === "form" ? "form" : "fixed",
    type: b.type,
    label,
    fieldKey,
    mupuStyle: b.mupuStyle,
    value: b.mode === "form" ? blockToPlaceholder(b, fieldKey) : blockToValue(b),
  };
}

function applyOrderedBlocks(
  next: BuilderBlock[],
  current: ContentBlock[],
): ContentBlock[] {
  const byId = new Map<string, ContentBlock>();
  current.forEach((b) => byId.set(b.id, b));
  const counts: Record<BlockType, number> = {
    heading: 0,
    subtitle: 0,
    paragraph: 0,
    list: 0,
    keyValue: 0,
    twoColumns: 0,
    threeColumns: 0,
  };

  return next.map((b) => {
    const prev = byId.get(b.id);
    const mode: BlockMode = b.origin === "form" ? "form" : "fixed";
    counts[b.type] += 1;
    const label = `${BLOCK_LABELS[b.type]} ${counts[b.type]}`;
    const fallbackKey = normalizeKey(label, `${b.type}_${b.id.slice(-4)}`);
    const fieldKey = prev?.fieldKey ?? b.fieldKey ?? fallbackKey;

    const base: BaseBlock = {
      id: b.id,
      type: b.type,
      mode,
      label,
      fieldKey,
      mupuStyle: b.mupuStyle ?? prev?.mupuStyle,
    };

    const val = (b.value ?? {}) as Partial<BlockFormValue>;
    const useValue = mode === "fixed";

    switch (b.type) {
      case "heading":
        return {
          ...base,
          type: "heading",
          text: useValue
            ? (val as { text?: string }).text ?? (prev as HeadingBlock | undefined)?.text ?? ""
            : (prev as HeadingBlock | undefined)?.text ?? "",
          level: (val as { level?: 1 | 2 | 3 }).level ?? (prev as HeadingBlock | undefined)?.level ?? 1,
        };
      case "subtitle":
        return {
          ...base,
          type: "subtitle",
          text: useValue
            ? (val as { text?: string }).text ?? (prev as SubtitleBlock | undefined)?.text ?? ""
            : (prev as SubtitleBlock | undefined)?.text ?? "",
        };
      case "paragraph":
        return {
          ...base,
          type: "paragraph",
          text: useValue
            ? (val as { text?: string }).text ?? (prev as ParagraphBlock | undefined)?.text ?? ""
            : (prev as ParagraphBlock | undefined)?.text ?? "",
        };
      case "list": {
        const items =
          useValue
            ? (val as { items?: string[] }).items ?? (prev as ListBlock | undefined)?.items ?? []
            : (prev as ListBlock | undefined)?.items ?? [];
        return {
          ...base,
          type: "list",
          items: Array.isArray(items) ? items : [],
        };
      }
      case "keyValue": {
        const pairs =
          useValue
            ? (val as { pairs?: { key: string; value: string }[] }).pairs ??
              (prev as KeyValueBlock | undefined)?.pairs ??
              []
            : (prev as KeyValueBlock | undefined)?.pairs ?? [];
        return {
          ...base,
          type: "keyValue",
          pairs: Array.isArray(pairs) ? pairs : [],
        };
      }
      case "twoColumns":
        return {
          ...base,
          type: "twoColumns",
          left: useValue
            ? (val as { left?: string }).left ?? (prev as TwoColumnsBlock | undefined)?.left ?? ""
            : (prev as TwoColumnsBlock | undefined)?.left ?? "",
          right: useValue
            ? (val as { right?: string }).right ?? (prev as TwoColumnsBlock | undefined)?.right ?? ""
            : (prev as TwoColumnsBlock | undefined)?.right ?? "",
        };
      case "threeColumns":
        return {
          ...base,
          type: "threeColumns",
          left: useValue
            ? (val as { left?: string }).left ?? (prev as ThreeColumnsBlock | undefined)?.left ?? ""
            : (prev as ThreeColumnsBlock | undefined)?.left ?? "",
          center: useValue
            ? (val as { center?: string }).center ?? (prev as ThreeColumnsBlock | undefined)?.center ?? ""
            : (prev as ThreeColumnsBlock | undefined)?.center ?? "",
          right: useValue
            ? (val as { right?: string }).right ?? (prev as ThreeColumnsBlock | undefined)?.right ?? ""
            : (prev as ThreeColumnsBlock | undefined)?.right ?? "",
        };
    }
  });
}

/* =============================================================================
 * Datos remotos: Agencia + Usuario
 * ========================================================================== */

type Agency = {
  id?: number;
  id_agency?: number;
  name?: string;
  legal_name?: string;
  logo_url?: string;
  address?: string;
  website?: string;
  // back clásico
  phone?: string | null;
  email?: string | null;
  social?: Partial<{
    instagram: string;
    facebook: string;
    twitter: string;
    tiktok: string;
  }> | null;
  // variantes alternativas que a veces aparecen
  phones?: string[];
  emails?: string[];
  socials?: Agency["social"];
};
type CurrentUser = {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string | null;
};

function useAgencyAndUser(token?: string | null) {
  const [agency, setAgency] = useState<Agency>({});
  const [user, setUser] = useState<CurrentUser>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    if (!token) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        setLoading(true);

        const agRes = await authFetch(
          "/api/agency",
          { cache: "no-store" },
          token,
        );
        const agJson = (await agRes.json().catch(() => ({}))) as unknown;
        const nextAgency = isObject(agJson) ? (agJson as Agency) : {};
        if (mounted) setAgency(nextAgency);

        const meRes = await authFetch(
          "/api/user/profile",
          { cache: "no-store" },
          token,
        );
        const meJson = (await meRes.json().catch(() => ({}))) as unknown;
        const nextUser = isObject(meJson) ? (meJson as CurrentUser) : {};
        if (mounted) setUser(nextUser);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token]);

  return { agency, user, loading };
}

/* =============================================================================
 * Tokens UI (radius/padding/gaps/dividers) derivados de config
 * ========================================================================== */

type Density = "compact" | "comfortable" | "relaxed";

function useUiTokens(cfg: Config) {
  // radius
  const radius = getAt<string>(cfg, ["styles", "ui", "radius"], "2xl");
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

  // density (normalizada)
  const densityRaw = getAt<string>(
    cfg,
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

  // content max width
  const contentWidth = getAt<string>(
    cfg,
    ["styles", "ui", "contentWidth"],
    "normal",
  );
  const contentMaxW =
    contentWidth === "narrow"
      ? "max-w-2xl"
      : contentWidth === "wide"
        ? "max-w-5xl"
        : "max-w-3xl";

  // dividers
  const dividers = getAt<boolean>(cfg, ["styles", "ui", "dividers"], true);

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
 * Tipografías / acentos / estilos por bloque
 * ========================================================================== */

function resolveMupuTextStyle(
  ms?: { color?: string },
  _role?: BlockRole,
): React.CSSProperties {
  void _role; // evitar warning de var no usada
  if (!ms) return {};
  return { color: ms.color || undefined };
}

/* =============================================================================
 * Componentes utilitarios
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
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt="cover"
        className={cx("w-full object-cover", innerRadiusClass)}
        style={{
          height:
            density === "compact" ? 176 : density === "relaxed" ? 256 : 208,
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
  cfg: Config;
  docTypeLabel?: string;
  editable?: boolean;
  onChange?: (next: Config) => void;
};

const TemplateConfigPreview: React.FC<Props> = ({
  cfg,
  docTypeLabel = "Documento",
  editable = false,
  onChange,
}) => {
  const { token } = useAuth();
  const { agency, user, loading } = useAgencyAndUser(token);
  const canEditContent = editable && typeof onChange === "function";

  // Layout actual
  const layout = getAt<string>(cfg, ["layout"], "layoutA");

  // Colores base + acento (SIEMPRE desde config)
  const bg = getAt<string>(cfg, ["styles", "colors", "background"], "#ffffff");
  const text = getAt<string>(cfg, ["styles", "colors", "text"], "#111111");
  const accent = getAt<string>(cfg, ["styles", "colors", "accent"], "#6B7280");

  // Tipografías globales: ignoramos cfg.styles.fonts y forzamos por agencia
  const isMupuAgency =
    (typeof agency.id === "number" && agency.id === 1) ||
    (typeof agency.id_agency === "number" && agency.id_agency === 1);

  const headingFont = "Poppins";
  const headingWeight = 600;
  const bodyFont = "Poppins";

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
  } = useUiTokens(cfg);

  // Portada
  const coverMode = getAt<string>(cfg, ["coverImage", "mode"], "logo");
  const coverUrl = getAt<string>(cfg, ["coverImage", "url"], "");

  // ===== Normalización de AGENCIA para evitar campos vacíos por naming =====
  const normalized = useMemo(() => {
    const website = (agency.website || "")?.toString();
    const address = (agency.address || "")?.toString();

    // phone: usar phones[0] o caer a phone
    const phone =
      (Array.isArray(agency.phones) && agency.phones.length > 0
        ? agency.phones[0]
        : agency.phone || "") || "";

    // email: usar email o caer a emails[0]
    const email =
      agency.email ||
      "" ||
      (Array.isArray(agency.emails) && agency.emails.length > 0
        ? agency.emails[0]
        : "");

    // social: admitir social o socials
    const socialRaw = agency.social || agency.socials || {};
    const socials = isObject(socialRaw)
      ? (socialRaw as NonNullable<Agency["social"]>)
      : {};

    return { website, address, phone, email, socials };
  }, [agency]);

  // Datos de contacto a mostrar (desde config)
  const contactItems = asStringArray(cfg["contactItems"]);
  const corporateLine = useMemo(() => {
    const items: Array<{ label: string; value: string }> = [];

    if (contactItems.includes("website") && normalized.website)
      items.push({ label: "Web", value: normalized.website });
    if (contactItems.includes("address") && normalized.address)
      items.push({ label: "Dirección", value: normalized.address });
    if (contactItems.includes("phones") && normalized.phone)
      items.push({ label: "Tel", value: normalized.phone });
    if (contactItems.includes("email") && normalized.email)
      items.push({ label: "Mail", value: normalized.email });

    // Redes sociales (si están cargadas en la agencia)
    if (contactItems.includes("instagram") && normalized.socials?.instagram)
      items.push({ label: "Instagram", value: normalized.socials.instagram });
    if (contactItems.includes("facebook") && normalized.socials?.facebook)
      items.push({ label: "Facebook", value: normalized.socials.facebook });
    if (contactItems.includes("twitter") && normalized.socials?.twitter)
      items.push({ label: "Twitter", value: normalized.socials.twitter });
    if (contactItems.includes("tiktok") && normalized.socials?.tiktok)
      items.push({ label: "TikTok", value: normalized.socials.tiktok });

    return items;
  }, [contactItems, normalized]);

  // Bloques de contenido
  const blocks = useMemo(
    () =>
      (getAt<unknown[]>(cfg, ["content", "blocks"], []) || []).filter(
        isBlock,
      ) as ContentBlock[],
    [cfg],
  );

  const autoLabels = useMemo(() => buildAutoLabels(blocks), [blocks]);

  const orderedBlocks = useMemo<BuilderBlock[]>(
    () =>
      blocks.map((b) => {
        const label = autoLabels.get(b.id) ?? BLOCK_LABELS[b.type];
        const fieldKey = resolveFieldKey(b, label);
        return toOrderedBlock(b, label, fieldKey);
      }),
    [autoLabels, blocks],
  );

  const blocksKey = useMemo(
    () => `${blocks.length}:${blocks.map((b) => b.id).join("|")}`,
    [blocks],
  );
  const [draftBlocks, setDraftBlocks] = useState<OrderedBlock[]>(orderedBlocks);
  const commitTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setDraftBlocks(orderedBlocks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocksKey]);

  const lockedIds = useMemo(
    () => new Set(blocks.filter((b) => b.mode === "form").map((b) => b.id)),
    [blocks],
  );

  const commitBlocks = useCallback(
    (next: OrderedBlock[]) => {
      if (!onChange) return;
      const nextBlocks = applyOrderedBlocks(next as BuilderBlock[], blocks);
      onChange(setAt(cfg, ["content", "blocks"], nextBlocks));
    },
    [blocks, cfg, onChange],
  );

  const handleCanvasChange = (next: OrderedBlock[]) => {
    setDraftBlocks(next);
    if (!onChange) return;
    if (commitTimerRef.current != null) {
      window.clearTimeout(commitTimerRef.current);
    }
    commitTimerRef.current = window.setTimeout(() => {
      commitBlocks(next);
    }, 200);
  };

  useEffect(
    () => () => {
      if (commitTimerRef.current != null) {
        window.clearTimeout(commitTimerRef.current);
      }
    },
    [],
  );

  const handleToggleMode = (id: string, nextMode: BlockMode) => {
    if (!onChange) return;
    const current = blocks.find((b) => b.id === id);
    if (!current) return;
    const label = autoLabels.get(current.id) ?? BLOCK_LABELS[current.type];
    const fieldKey = resolveFieldKey(current, label);
    const origin: BuilderBlock["origin"] =
      nextMode === "form" ? "form" : "fixed";
    const source = draftBlocks.length ? draftBlocks : orderedBlocks;
    const next: BuilderBlock[] = source.map((b) =>
      b.id === id
        ? {
            ...b,
            origin,
            value:
              nextMode === "fixed"
                ? blockToValue(current)
                : blockToPlaceholder(current, fieldKey),
          }
        : b,
    );
    setDraftBlocks(next);
    const nextBlocks = applyOrderedBlocks(next, blocks);
    onChange(setAt(cfg, ["content", "blocks"], nextBlocks));
  };

  // Derivados de agencia/usuario
  const agencyName = agency.name || "Nombre de la agencia";
  const legalName = agency.legal_name || agency.name || "Razón social";
  const agencyLogo = agency.logo_url || "";
  const hasLogo = Boolean(agencyLogo && agencyLogo.trim().length > 0);
  const sellerName =
    [user.first_name, user.last_name].filter(Boolean).join(" ") || "Vendedor/a";
  const sellerEmail = user.email || "vendedor@agencia.com";

  // Contraste (bordes, paneles, chips)
  const isLightBg = luminance(bg) >= 0.7;
  const panelBgSoft = isLightBg
    ? withAlpha(accent, 0.05)
    : "rgba(255,255,255,0.04)";
  const panelBgStrong = isLightBg
    ? "rgba(0,0,0,0.06)"
    : "rgba(255,255,255,0.06)";
  const chipBg = isLightBg ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.06)";
  const pillBg = isLightBg ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)";
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

  // ¿Es agencia Mupu? (para permitir overrides por bloque y pago)
  const shouldApplyMupu = (b: ContentBlock) =>
    isMupuAgency && b.mode === "fixed" && !!b.mupuStyle;

  // ====== Vista previa de pago ======
  const paymentOptions = asStringArray(getAt(cfg, ["paymentOptions"], []));
  const paymentSelectedIndex =
    getAt<number | null>(cfg, ["payment", "selectedIndex"], null) ?? null;
  const paymentSelected =
    paymentSelectedIndex !== null
      ? paymentOptions[paymentSelectedIndex] || ""
      : "";
  const paymentMupuStyle = (getAt(cfg, ["payment", "mupuStyle"], null) ||
    null) as {
    color?: string;
  } | null;

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
          {docTypeLabel}
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
              style={{ backgroundColor: pillBg, borderRadius: 8 }}
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
    const note = getAt<string>(cfg, ["styles", "note"], "");
    const notesEnabled = (note || "").length > 0;

    if (canEditContent) {
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
              {draftBlocks.length === 0 ? (
                <p className="text-sm opacity-70">
                  No hay secciones aún. Agregá un bloque para empezar.
                </p>
              ) : (
                <BlocksCanvas
                  blocks={draftBlocks}
                  onChange={handleCanvasChange}
                  lockedIds={lockedIds}
                  allowRemoveLocked
                  showMeta
                  getLabel={(b) => autoLabels.get(b.id)}
                  getMode={(b) => (b.origin === "form" ? "form" : "fixed")}
                  onToggleMode={handleToggleMode}
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
              )}
            </div>
          </div>
        </div>
      );
    }

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
              const label = autoLabels.get(b.id) ?? BLOCK_LABELS[b.type];
              const fieldKey = resolveFieldKey(b, label);

              const placeholder =
                b.mode === "form" ? (
                  <span className="opacity-70">{`{${fieldKey}}`}</span>
                ) : null;

              const topDivider = dividers && index > 0 && (
                <div
                  className="mb-3 h-px w-full md:mb-4"
                  style={{ backgroundColor: dividerColor }}
                />
              );

              if (b.type === "heading") {
                const { level = 1, text: textValue = "" } = b as HeadingBlock;
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
                        color:
                          (applyMs && ms?.color) ||
                          undefined /* si no, hereda */,
                      }}
                    >
                      {b.mode === "form" ? placeholder : textValue}
                    </Tag>
                  </div>
                );
              }

              if (b.type === "subtitle") {
                const { text: t = "" } = b as SubtitleBlock;
                const styleSubtitle = roleStyle("subtitle");
                return (
                  <div key={b.id}>
                    {topDivider}
                    <h4
                      className="text-lg font-medium opacity-95"
                      style={styleSubtitle}
                    >
                      {b.mode === "form" ? placeholder : t}
                    </h4>
                  </div>
                );
              }

              if (b.type === "paragraph") {
                const { text: t = "" } = b as ParagraphBlock;
                const styleParagraph = roleStyle("paragraph");
                return (
                  <div key={b.id}>
                    {topDivider}
                    <p className="leading-relaxed" style={styleParagraph}>
                      {b.mode === "form" ? placeholder : t}
                    </p>
                  </div>
                );
              }

              if (b.type === "list") {
                const { items = [] } = b as ListBlock;
                const styleList = roleStyle("list");
                return (
                  <div key={b.id}>
                    {topDivider}
                    <ul className={cx("list-inside list-disc", listSpace)}>
                      {b.mode === "form" ? (
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
                const { pairs = [] } = b as KeyValueBlock;
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
                      {b.mode === "form" ? (
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
                const { left = "", right = "" } = b as TwoColumnsBlock;
                const styleTwo = roleStyle("two");
                return (
                  <div key={b.id}>
                    {topDivider}
                    <div className={cx("grid md:grid-cols-2", gapGrid)}>
                      {[left, right].map((content, i) => (
                        <div
                          key={i}
                          className={cx("p-3", innerRadiusClass)}
                          style={{ backgroundColor: panelBgStrong }}
                        >
                          <div style={styleTwo}>
                            {b.mode === "form" ? placeholder : content}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }

              if (b.type === "threeColumns") {
                const {
                  left = "",
                  center = "",
                  right = "",
                } = b as ThreeColumnsBlock;
                const styleThree = roleStyle("three");
                const cell = (content: string, key: string) => (
                  <div
                    key={key}
                    className={cx("p-3", innerRadiusClass)}
                    style={{ backgroundColor: panelBgStrong }}
                  >
                    <div style={styleThree}>
                      {b.mode === "form" ? placeholder : content}
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
            // eslint-disable-next-line @next/next/no-img-element
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
      className={cx("col-span-2 h-fit border", radiusClass)}
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
            url={coverUrl}
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
          {coverMode === "url" && coverUrl ? (
            <div className={cx(padX, "mt-4")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverUrl}
                alt="cover"
                className={cx("w-full object-cover", innerRadiusClass)}
                style={{
                  height:
                    density === "compact"
                      ? 160
                      : density === "relaxed"
                        ? 240
                        : 200,
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
              // eslint-disable-next-line @next/next/no-img-element
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
              {docTypeLabel}
            </span>
          </aside>

          {/* Main */}
          <main className={cx("rounded-r-2xl p-2")}>
            {coverMode === "url" && coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverUrl}
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

export default TemplateConfigPreview;
