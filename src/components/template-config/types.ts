// src/components/template-config/types.ts
export type Config = Record<string, unknown>;

export type CoverSavedItem = { name: string; url: string };

export type PdfLayout = "layoutA" | "layoutB" | "layoutC";

/** Preset de estilo (colores) */
export type StylePreset = {
  id: string;
  label: string;
  colors: { background: string; text: string; accent: string };
  fonts?: { heading?: string; body?: string };
};

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "paper",
    label: "Blanco",
    colors: { background: "#FFFFFF", text: "#111111", accent: "#6B7280" },
    fonts: { heading: "Poppins", body: "Poppins" },
  },
  {
    id: "soft",
    label: "Gris suave",
    colors: { background: "#F8FAFC", text: "#0F172A", accent: "#94A3B8" },
    fonts: { heading: "Poppins", body: "Poppins" },
  },
  {
    id: "ink",
    label: "Tinta",
    colors: { background: "#0F172A", text: "#F8FAFC", accent: "#9CA3AF" },
    fonts: { heading: "Poppins", body: "Poppins" },
  },
];

export const DEFAULT_CFG: Config = {
  layout: "layoutA" as PdfLayout,
  styles: {
    presetId: "paper", // id de STYLE_PRESETS
    colors: { background: "#FFFFFF", text: "#111111", accent: "#6B7280" },
    fonts: { heading: "Poppins", body: "Poppins" },
    note: "",
  },
  coverImage: {
    mode: "logo" as "logo" | "url",
    url: "",
    saved: [] as CoverSavedItem[], // biblioteca con nombre
  },
  contactItems: ["phones", "email", "website", "instagram"],
  content: { blocks: [] },
  paymentOptions: [],
};
