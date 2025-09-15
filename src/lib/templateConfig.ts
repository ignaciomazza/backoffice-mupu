// src/lib/templateConfig.ts
import type {
  Agency,
  CurrentUser,
  DocType,
  TemplateConfig,
  TemplateFormValues,
  ContentBlock,
  OrderedBlock,
  BlockType,
  RuntimeResolved,
  Density,
  HeadingBlock,
  SubtitleBlock,
  ParagraphBlock,
  ListBlock,
  KeyValueBlock,
  TwoColumnsBlock,
  ThreeColumnsBlock,
} from "@/types/templates";

// ==========================================================
// Helpers básicos
// ==========================================================
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export const toObject = <T extends object = Record<string, unknown>>(
  v: unknown,
  fallback = {} as T,
): T => (isObject(v) ? (v as T) : fallback);

export const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

export function getAt<T>(
  obj: Record<string, unknown>,
  path: string[],
  fallback: T,
): T {
  let cur: unknown = obj;
  for (const k of path) {
    if (!isObject(cur)) return fallback;
    cur = (cur as Record<string, unknown>)[k];
  }
  return (cur as T) ?? fallback;
}

// Tipo fuerte para los tokens de UI del template
type UiSettings = {
  radius?: "sm" | "md" | "lg" | "xl" | "2xl";
  density?: Density;
  contentWidth?: "narrow" | "normal" | "wide";
  dividers?: boolean;
};

// ==========================================================
// Defaults locales (fallback) — alineados al TemplateConfigPreview
// ==========================================================
export function getLocalDefaults(docType: DocType): TemplateConfig {
  const base: TemplateConfig = {
    styles: {
      colors:
        docType === "confirmation"
          ? { background: "#111111", text: "#FFFFFF", accent: "#9CA3AF" }
          : { background: "#FFFFFF", text: "#111111", accent: "#6B7280" },
      fonts: { heading: "Poppins", body: "Poppins" },
      ui: {
        radius: "2xl",
        density: "comfortable",
        contentWidth: "normal",
        dividers: true,
      },
    },
    layout: "layoutA",
    coverImage: { mode: "logo", urls: [] },
    contactItems: ["phones", "email", "website", "address"],
    content: { blocks: [] },
    paymentOptions: [],
  };
  return base;
}

// ==========================================================
// Type guards de bloques (para evitar any)
// ==========================================================
function isHeadingBlock(b: ContentBlock | undefined): b is HeadingBlock {
  return !!b && b.type === "heading";
}
function isSubtitleBlock(b: ContentBlock | undefined): b is SubtitleBlock {
  return !!b && b.type === "subtitle";
}
function isParagraphBlock(b: ContentBlock | undefined): b is ParagraphBlock {
  return !!b && b.type === "paragraph";
}
function isListBlock(b: ContentBlock | undefined): b is ListBlock {
  return !!b && b.type === "list";
}
function isKeyValueBlock(b: ContentBlock | undefined): b is KeyValueBlock {
  return !!b && b.type === "keyValue";
}
function isTwoColumnsBlock(b: ContentBlock | undefined): b is TwoColumnsBlock {
  return !!b && b.type === "twoColumns";
}
function isThreeColumnsBlock(
  b: ContentBlock | undefined,
): b is ThreeColumnsBlock {
  return !!b && b.type === "threeColumns";
}

// ==========================================================
// Normalización y validación
// ==========================================================
export function normalizeConfig(
  input: unknown,
  docType: DocType,
): TemplateConfig {
  const cfg = toObject<TemplateConfig>(input, {});
  const def = getLocalDefaults(docType);

  // ui ahora está fuertemente tipado
  const ui = toObject<UiSettings>(cfg.styles?.ui ?? {}, {} as UiSettings);

  const densityRaw = ui.density ?? "comfortable";
  const density: Density =
    densityRaw === "compact" || densityRaw === "relaxed"
      ? densityRaw
      : "comfortable";

  return {
    styles: {
      colors: {
        background:
          cfg.styles?.colors?.background ?? def.styles!.colors!.background,
        text: cfg.styles?.colors?.text ?? def.styles!.colors!.text,
        accent: cfg.styles?.colors?.accent ?? def.styles!.colors!.accent,
      },
      fonts: {
        heading: cfg.styles?.fonts?.heading ?? def.styles!.fonts!.heading,
        body: cfg.styles?.fonts?.body ?? def.styles!.fonts!.body,
      },
      ui: {
        radius: ui.radius ?? def.styles!.ui!.radius,
        density,
        contentWidth: ui.contentWidth ?? def.styles!.ui!.contentWidth,
        dividers: ui.dividers ?? def.styles!.ui!.dividers,
      },
      note: cfg.styles?.note ?? def.styles?.note,
    },
    layout: (cfg.layout as "layoutA" | "layoutB" | "layoutC") ?? def.layout,
    coverImage: {
      mode: cfg.coverImage?.mode ?? def.coverImage!.mode,
      url: cfg.coverImage?.url ?? def.coverImage!.url,
      urls: asStringArray(cfg.coverImage?.urls ?? def.coverImage!.urls),
    },
    contactItems: asStringArray(cfg.contactItems ?? def.contactItems),
    content: {
      blocks: Array.isArray(cfg.content?.blocks)
        ? (cfg.content?.blocks as ContentBlock[]).filter(isContentBlock)
        : [],
    },
    paymentOptions: asStringArray(cfg.paymentOptions ?? def.paymentOptions),
    payment: toObject(cfg.payment ?? {}, {}),
  };
}

function isContentBlock(b: unknown): b is ContentBlock {
  if (!isObject(b)) return false;
  const t = (b as Record<string, unknown>).type;
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

export function validateOrderedBlocks(blocks: OrderedBlock[]): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  blocks.forEach((b, i) => {
    if (!b.id) errs.push(`Bloque #${i} sin id`);
    if (b.id && ids.has(b.id)) errs.push(`Bloque duplicado: ${b.id}`);
    if (b.id) ids.add(b.id);
    if (!isValidBlockType(b.type))
      errs.push(`Bloque ${b.id} con type inválido`);
    if (b.origin !== "fixed" && b.origin !== "form" && b.origin !== "extra")
      errs.push(`Bloque ${b.id} con origin inválido`);
  });
  return errs;
}

function isValidBlockType(t: string): t is BlockType {
  return [
    "heading",
    "subtitle",
    "paragraph",
    "list",
    "keyValue",
    "twoColumns",
    "threeColumns",
  ].includes(t);
}

// ==========================================================
// Merge de config + form values -> runtime
// - Aplica selecciones de portada/contacto/pago
// - Ensambla bloques en orden final (fixed + form + extra)
// - Devuelve agency con valores elegidos como prioridad
// ==========================================================
export function mergeConfigWithFormValues(
  cfg: TemplateConfig,
  form: TemplateFormValues | undefined,
  agency: Agency,
  user: CurrentUser,
): RuntimeResolved {
  const config: TemplateConfig = { ...cfg };

  // ---- Portada
  if (form?.cover?.mode) {
    config.coverImage = {
      ...(config.coverImage ?? {}),
      mode: form.cover.mode,
      url: form.cover.url ?? config.coverImage?.url,
    };
  }

  // ---- Pago
  if (typeof form?.payment?.selectedIndex === "number") {
    config.payment = {
      ...(config.payment ?? {}),
      selectedIndex: form.payment.selectedIndex,
    };
  }

  // ---- Agency priorizada con selección del usuario
  const resolvedAgency: Agency = {
    ...agency,
    website: form?.contact?.website ?? agency.website,
    address: form?.contact?.address ?? agency.address,
    phones: prioritizeSelected(agency.phones, form?.contact?.phone),
    emails: prioritizeSelected(agency.emails, form?.contact?.email),
    socials: {
      ...(agency.socials ?? {}),
      instagram: form?.contact?.instagram ?? agency.socials?.instagram,
      facebook: form?.contact?.facebook ?? agency.socials?.facebook,
      twitter: form?.contact?.twitter ?? agency.socials?.twitter,
      tiktok: form?.contact?.tiktok ?? agency.socials?.tiktok,
    },
  };

  // ---- Bloques (orden final)
  if (Array.isArray(form?.blocks) && form.blocks.length) {
    const mapFixed = new Map<string, ContentBlock>();
    (config.content?.blocks ?? []).forEach((b) => mapFixed.set(b.id, b));

    const ordered: ContentBlock[] = form.blocks.map((ob) => {
      if (ob.origin === "fixed") {
        // usa el bloque original tal cual
        const origin = mapFixed.get(ob.id);
        return origin ? origin : makeEmptyFallback(ob);
      }
      if (ob.origin === "form") {
        // parte del bloque base (si existe) + value del form
        const origin = mapFixed.get(ob.id);
        return buildBlockFromValue(origin, ob);
      }
      // origin === "extra"
      return buildBlockFromValue(undefined, ob);
    });

    config.content = { blocks: ordered };
  }

  return { config, agency: resolvedAgency, user };
}

function prioritizeSelected(list: string[] | undefined, selected?: string) {
  const arr = Array.isArray(list) ? [...list] : [];
  if (!selected) return arr;
  const idx = arr.indexOf(selected);
  if (idx === 0) return arr;
  if (idx > 0) {
    arr.splice(idx, 1);
    arr.unshift(selected);
    return arr;
  }
  // si no estaba en la lista, lo ponemos primero
  return [selected, ...arr];
}

function makeEmptyFallback(ob: OrderedBlock): ContentBlock {
  // Fallback defensivo si no encontramos el fixed original
  switch (ob.type) {
    case "heading":
      return { id: ob.id, type: "heading", mode: "fixed", text: "" };
    case "subtitle":
      return { id: ob.id, type: "subtitle", mode: "fixed", text: "" };
    case "paragraph":
      return { id: ob.id, type: "paragraph", mode: "fixed", text: "" };
    case "list":
      return { id: ob.id, type: "list", mode: "fixed", items: [] };
    case "keyValue":
      return { id: ob.id, type: "keyValue", mode: "fixed", pairs: [] };
    case "twoColumns":
      return {
        id: ob.id,
        type: "twoColumns",
        mode: "fixed",
        left: "",
        right: "",
      };
    case "threeColumns":
      return {
        id: ob.id,
        type: "threeColumns",
        mode: "fixed",
        left: "",
        center: "",
        right: "",
      };
    default:
      return { id: ob.id, type: "paragraph", mode: "fixed", text: "" };
  }
}

function buildBlockFromValue(
  origin: ContentBlock | undefined,
  ob: OrderedBlock,
): ContentBlock {
  const val = ob.value ?? {};

  switch (ob.type) {
    case "heading": {
      const base: HeadingBlock =
        (isHeadingBlock(origin) ? origin : undefined) ??
        ({ id: ob.id, type: "heading", mode: "form" } as HeadingBlock);
      const v = val as { text?: string; level?: 1 | 2 | 3 };
      return {
        ...base,
        text: v.text ?? base.text ?? "",
        level: v.level ?? base.level ?? 1,
      };
    }
    case "subtitle": {
      const base: SubtitleBlock =
        (isSubtitleBlock(origin) ? origin : undefined) ??
        ({ id: ob.id, type: "subtitle", mode: "form" } as SubtitleBlock);
      const v = val as { text?: string };
      return { ...base, text: v.text ?? base.text ?? "" };
    }
    case "paragraph": {
      const base: ParagraphBlock =
        (isParagraphBlock(origin) ? origin : undefined) ??
        ({ id: ob.id, type: "paragraph", mode: "form" } as ParagraphBlock);
      const v = val as { text?: string };
      return { ...base, text: v.text ?? base.text ?? "" };
    }
    case "list": {
      const base: ListBlock =
        (isListBlock(origin) ? origin : undefined) ??
        ({ id: ob.id, type: "list", mode: "form" } as ListBlock);
      const v = val as { items?: string[] };
      return { ...base, items: v.items ?? base.items ?? [] };
    }
    case "keyValue": {
      const base: KeyValueBlock =
        (isKeyValueBlock(origin) ? origin : undefined) ??
        ({ id: ob.id, type: "keyValue", mode: "form" } as KeyValueBlock);
      const v = val as { pairs?: { key: string; value: string }[] };
      return { ...base, pairs: v.pairs ?? base.pairs ?? [] };
    }
    case "twoColumns": {
      const base: TwoColumnsBlock =
        (isTwoColumnsBlock(origin) ? origin : undefined) ??
        ({ id: ob.id, type: "twoColumns", mode: "form" } as TwoColumnsBlock);
      const v = val as { left?: string; right?: string };
      return {
        ...base,
        left: v.left ?? base.left ?? "",
        right: v.right ?? base.right ?? "",
      };
    }
    case "threeColumns": {
      const base: ThreeColumnsBlock =
        (isThreeColumnsBlock(origin) ? origin : undefined) ??
        ({
          id: ob.id,
          type: "threeColumns",
          mode: "form",
        } as ThreeColumnsBlock);
      const v = val as { left?: string; center?: string; right?: string };
      return {
        ...base,
        left: v.left ?? base.left ?? "",
        center: v.center ?? base.center ?? "",
        right: v.right ?? base.right ?? "",
      };
    }
    default: {
      // fallback defensivo
      const base: ParagraphBlock =
        (isParagraphBlock(origin) ? origin : undefined) ??
        ({ id: ob.id, type: "paragraph", mode: "form" } as ParagraphBlock);
      const v = val as { text?: string };
      return { ...base, text: v.text ?? base.text ?? "" };
    }
  }
}

// ==========================================================
// Utilidades para construir el esqueleto de OrderedBlocks
// a partir del config (para inicializar el formulario).
// ==========================================================
export function buildInitialOrderedBlocks(cfg: TemplateConfig): OrderedBlock[] {
  const blocks = (cfg.content?.blocks ?? []) as ContentBlock[];
  return blocks.map<OrderedBlock>((b) => {
    const origin: OrderedBlock["origin"] =
      b.mode === "fixed" ? "fixed" : "form";

    // Si el bloque del config es "form", trasladamos sus valores iniciales
    // al OrderedBlock.value para que el editor los muestre desde el inicio.
    let value: OrderedBlock["value"] | undefined = undefined;

    if (origin === "form") {
      switch (b.type) {
        case "heading":
          value = {
            type: "heading",
            text: b.text ?? "",
            level: b.level ?? 1,
          };
          break;
        case "subtitle":
          value = { type: "subtitle", text: b.text ?? "" };
          break;
        case "paragraph":
          value = { type: "paragraph", text: b.text ?? "" };
          break;
        case "list":
          value = { type: "list", items: (b as ListBlock).items ?? [] };
          break;
        case "keyValue":
          value = {
            type: "keyValue",
            pairs: (b as KeyValueBlock).pairs ?? [],
          };
          break;
        case "twoColumns":
          value = {
            type: "twoColumns",
            left: (b as TwoColumnsBlock).left ?? "",
            right: (b as TwoColumnsBlock).right ?? "",
          };
          break;
        case "threeColumns":
          value = {
            type: "threeColumns",
            left: (b as ThreeColumnsBlock).left ?? "",
            center: (b as ThreeColumnsBlock).center ?? "",
            right: (b as ThreeColumnsBlock).right ?? "",
          };
          break;
      }
    }

    return {
      id: b.id,
      origin,
      type: b.type,
      label: b.label,
      value, // <- ahora sí viaja el valor inicial si era "form"
    };
  });
}

// ==========================================================
// Extractores de “posibilidades” desde config
// ==========================================================
export function getAvailableCoverUrls(cfg: TemplateConfig): string[] {
  return asStringArray(cfg.coverImage?.urls ?? []);
}

export function hasContactItem(cfg: TemplateConfig, key: string): boolean {
  const items = asStringArray(cfg.contactItems);
  return items.includes(key);
}
