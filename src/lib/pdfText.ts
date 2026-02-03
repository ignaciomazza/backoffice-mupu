// src/lib/pdfText.ts

/**
 * Inserta cortes "suaves" en palabras muy largas para evitar solapamientos
 * en PDFs (react-pdf solo corta por espacios/hyphenation).
 */
export function softWrapLongWords(
  input?: string | null,
  opts?: { maxWordLen?: number; chunkLen?: number; breakChar?: string },
): string {
  const text = String(input ?? "");
  if (!text) return text;

  const maxWordLen = opts?.maxWordLen ?? 24;
  const chunkLen = opts?.chunkLen ?? 12;
  const breakChar = opts?.breakChar ?? "\u200B"; // zero-width space (break opportunity)

  return text
    .split(/(\s+)/)
    .map((part) => {
      if (!part.trim()) return part;
      if (part.length <= maxWordLen) return part;
      const chunks: string[] = [];
      for (let i = 0; i < part.length; i += chunkLen) {
        chunks.push(part.slice(i, i + chunkLen));
      }
      return chunks.join(breakChar);
    })
    .join("");
}
