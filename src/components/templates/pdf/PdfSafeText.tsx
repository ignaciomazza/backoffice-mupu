/* eslint-disable jsx-a11y/alt-text */
import React from "react";
import { Text, Font } from "@react-pdf/renderer";
import type { TextProps } from "@react-pdf/renderer";
import { NBSP, stripZeroWidth, expandTabs } from "@/lib/whitespace";
import { getPdfFontFamily } from "./registerFonts";

// Desactiva hyphenation (evita cortes raros)
type FontHyph = {
  registerHyphenationCallback?: (cb: (w: string) => string[]) => void;
};
(Font as unknown as FontHyph).registerHyphenationCallback?.((w) => [w]);

const MAX_LEN = 120_000;

type MdToken = { text: string; bold: boolean };

// *negrita* con \* para escapar
function tokenizeBold(s: string): MdToken[] {
  const out: MdToken[] = [];
  let buf = "";
  let bold = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "\\" && s[i + 1] === "*") {
      buf += "*";
      i++;
      continue;
    }
    if (ch === "*") {
      if (buf) out.push({ text: buf, bold });
      bold = !bold;
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf) out.push({ text: buf, bold });
  return out.length ? out : [{ text: s || NBSP, bold: false }];
}

type PdfTextStyle = TextProps["style"];

export interface PdfSafeTextProps {
  text?: string | null;
  style?: PdfTextStyle;
}

/**
 * PdfSafeText: **single-line**.
 * - CR/LF → espacio (evitamos \n en children).
 * - Quita invisibles problemáticos.
 * - *negrita* inline con *...* (escape con \*).
 * - Aplica `fontFamily` explícito para evitar fallbacks.
 */
export default function PdfSafeText({ text, style }: PdfSafeTextProps) {
  const FAMILY = getPdfFontFamily();

  let t = String(text ?? "");
  if (!t) {
    return (
      <Text
        style={
          [FAMILY ? { fontFamily: FAMILY } : {}, style] as TextProps["style"]
        }
        wrap
      >
        {NBSP}
      </Text>
    );
  }

  t = t.replace(/\r\n?/g, "\n").replace(/\n+/g, " ");
  t = stripZeroWidth(t);
  t = expandTabs(t);
  if (t.length > MAX_LEN) t = t.slice(0, MAX_LEN);

  if (process.env.NODE_ENV !== "production" && /\n/.test(text || "")) {
    // eslint-disable-next-line no-console
    console.warn("[PdfSafeText] recibió \\n; normalizado a single line.");
  }

  const toks = tokenizeBold(t);

  // Normalizar style a array plano
  const baseStyleArray: object[] = Array.isArray(style)
    ? (style.filter(Boolean) as object[])
    : style
      ? [style as object]
      : [];
  const finalStyle = [
    ...(FAMILY ? [{ fontFamily: FAMILY }] : []),
    ...baseStyleArray,
  ] as TextProps["style"];

  return (
    <Text style={finalStyle}>
      {toks.map((tk, i) =>
        tk.bold ? (
          <Text
            key={i}
            style={
              [
                FAMILY ? { fontFamily: FAMILY } : {},
                { fontWeight: 700 },
              ] as TextProps["style"]
            }
          >
            {tk.text}
          </Text>
        ) : (
          <Text
            key={i}
            style={[FAMILY ? { fontFamily: FAMILY } : {}] as TextProps["style"]}
          >
            {tk.text}
          </Text>
        ),
      )}
    </Text>
  );
}
