// tailwind.config.ts
import type { Config } from "tailwindcss";

export default {
  darkMode: "class", // Permite activar el modo oscuro usando la clase "dark"
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  safelist: ["fc-col-header-cell", "fc", "fc-scrollgrid"],
  theme: {
    extend: {
      fontFamily: {
        // Agregamos Arimo a la pila sans
        sans: ["var(--font-poppins)", "var(--font-arimo)", "sans-serif"],
        // Nueva familia para la manuscrita Reenie Beanie
        hand: ["var(--font-reenie)", "cursive"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        black: "#131313",
      },
    },
  },
  plugins: [],
} satisfies Config;
