// src/lib/markdown.ts

export type SegmentType = "text" | "bold" | "subtitle";

export interface Segment {
  text: string;
  type: SegmentType;
}

// Regex que busca primero **doble** y luego *simple*
const MD_RE = /(\*\*(.*?)\*\*)|(\*(.*?)\*)/g;

export function parseMarkdown(text: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = MD_RE.exec(text))) {
    const [fullMatch, dbl, innerDbl, sml, innerSml] = m;
    const idx = m.index;

    // todo lo anterior al match
    if (idx > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, idx),
        type: "text",
      });
    }

    if (dbl) {
      // **subtítulo**
      segments.push({
        text: innerDbl,
        type: "subtitle",
      });
    } else if (sml) {
      // *negrita*
      segments.push({
        text: innerSml,
        type: "bold",
      });
    }

    lastIndex = idx + fullMatch.length;
  }

  // resto del texto
  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      type: "text",
    });
  }

  return segments;
}
