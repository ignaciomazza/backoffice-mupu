// src/components/templates/pdf/registerFonts.ts
import { Font } from "@react-pdf/renderer";

type Weight = 300 | 400 | 500 | 600 | 700 | 800 | 900;
type FamilyDef = {
  family: string;
  files: Array<{ weight: Weight; path: string }>;
};

const FONTS: Record<"arimo" | "poppins", FamilyDef> = {
  arimo: {
    family: "Arimo",
    files: [
      { weight: 400, path: "/Arimo/static/Arimo-Regular.ttf" }, // <-- coincide con /public/Arimo/static
      { weight: 600, path: "/Arimo/static/Arimo-SemiBold.ttf" },
      { weight: 700, path: "/Arimo/static/Arimo-Bold.ttf" },
    ],
  },
  poppins: {
    family: "Poppins",
    files: [
      { weight: 400, path: "/poppins/Poppins-Regular.ttf" }, // <-- coincide con /public/poppins
      { weight: 600, path: "/poppins/Poppins-SemiBold.ttf" },
      { weight: 700, path: "/poppins/Poppins-Bold.ttf" },
    ],
  },
};

let ready = false;
let currentFamily: string | undefined;

export function ensurePdfFonts(
  primary: keyof typeof FONTS = "poppins",
  secondary?: keyof typeof FONTS,
) {
  if (ready || typeof window === "undefined") return ready;

  const register = (key: keyof typeof FONTS) => {
    const def = FONTS[key];
    Font.register({
      family: def.family,
      fonts: def.files.map((f) => ({
        src: new URL(f.path, window.location.origin).href,
        fontWeight: f.weight,
      })),
    });
  };

  try {
    register(primary);
    if (secondary) register(secondary);
    currentFamily = FONTS[primary].family;
    ready = true;
  } catch (err) {
    console.warn("[PDF] No se pudo registrar fuentes custom:", err);
    ready = false;
    currentFamily = undefined;
  }
  return ready;
}

export function getPdfFontFamily() {
  return ready ? currentFamily : undefined;
}
