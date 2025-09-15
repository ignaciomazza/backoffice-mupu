// src/components/template-config/types.ts
export type Config = Record<string, unknown>;

export type CoverSavedItem = { name: string; url: string };

export type PdfLayout = "layoutA" | "layoutB" | "layoutC";

/** Preset de estilo (colores + tipografías opcional) */
export type StylePreset = {
  id: string;
  label: string;
  colors: { background: string; text: string; accent: string };
  fonts?: { heading?: string; body?: string };
};

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "light",
    label: "Claro",
    colors: { background: "#FFFFFF", text: "#111111", accent: "#6B7280" },
    fonts: { heading: "Poppins", body: "Poppins" },
  },
  {
    id: "dark",
    label: "Oscuro",
    colors: { background: "#111111", text: "#FFFFFF", accent: "#9CA3AF" },
    fonts: { heading: "Poppins", body: "Poppins" },
  },
  {
    id: "mono",
    label: "Monocromo",
    colors: { background: "#F3F4F6", text: "#111111", accent: "#374151" },
    fonts: { heading: "Poppins", body: "Poppins" },
  },
];

export const DEFAULT_CFG: Config = {
  layout: "layoutA" as PdfLayout,
  styles: {
    presetId: "light", // id de STYLE_PRESETS
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
