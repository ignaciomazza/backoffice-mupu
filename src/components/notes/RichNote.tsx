// src/components/notes/RichNote.tsx
"use client";

import React from "react";
import { URL_REGEX } from "@/utils/notes";

type NoteBlock =
  | { type: "paragraph"; lines: string[] }
  | { type: "list"; items: string[] };

const buildBlocks = (text: string): NoteBlock[] => {
  const lines = text.split("\n");
  const blocks: NoteBlock[] = [];
  let currentList: string[] = [];
  let currentPara: string[] = [];

  const flushPara = () => {
    if (currentPara.length) {
      blocks.push({ type: "paragraph", lines: currentPara });
      currentPara = [];
    }
  };
  const flushList = () => {
    if (currentList.length) {
      blocks.push({ type: "list", items: currentList });
      currentList = [];
    }
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushPara();
      flushList();
      return;
    }
    if (/^[-•*]\s+/.test(trimmed)) {
      flushPara();
      currentList.push(trimmed.replace(/^[-•*]\s+/, ""));
      return;
    }
    flushList();
    currentPara.push(line);
  });

  flushList();
  flushPara();
  return blocks;
};

const renderWithLinks = (
  text: string,
  keyPrefix: string,
  linkClassName: string,
) => {
  const nodes: React.ReactNode[] = [];
  const regex = new RegExp(URL_REGEX);
  let lastIndex = 0;
  let idx = 0;

  for (const match of text.matchAll(regex)) {
    const url = match[0];
    const start = match.index ?? 0;
    if (start > lastIndex) {
      nodes.push(
        <span key={`${keyPrefix}-t-${idx}`}>
          {text.slice(lastIndex, start)}
        </span>,
      );
    }
    nodes.push(
      <a
        key={`${keyPrefix}-l-${idx}`}
        href={url}
        target="_blank"
        rel="noreferrer"
        className={linkClassName}
      >
        {url}
      </a>,
    );
    lastIndex = start + url.length;
    idx += 1;
  }

  if (lastIndex < text.length) {
    nodes.push(
      <span key={`${keyPrefix}-t-${idx}`}>{text.slice(lastIndex)}</span>,
    );
  }

  return nodes;
};

interface RichNoteProps {
  text?: string | null;
  emptyLabel?: string;
  className?: string;
  linkClassName?: string;
}

export default function RichNote({
  text,
  emptyLabel = "Sin notas.",
  className = "space-y-2 text-sm text-sky-900/80 dark:text-white/80",
  linkClassName = "break-all text-emerald-700 underline underline-offset-2 hover:text-emerald-900 dark:text-emerald-300",
}: RichNoteProps) {
  const content = String(text ?? "").trim();
  if (!content) {
    return (
      <p className={className}>
        {emptyLabel}
      </p>
    );
  }

  const blocks = buildBlocks(content);

  return (
    <div className={className}>
      {blocks.map((block, blockIdx) => {
        if (block.type === "list") {
          return (
            <ul
              key={`list-${blockIdx}`}
              className="list-disc space-y-1 pl-5"
            >
              {block.items.map((item, itemIdx) => (
                <li key={`item-${blockIdx}-${itemIdx}`}>
                  {renderWithLinks(
                    item,
                    `li-${blockIdx}-${itemIdx}`,
                    linkClassName,
                  )}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={`p-${blockIdx}`} className="whitespace-pre-wrap break-words">
            {block.lines.map((line, lineIdx) => (
              <React.Fragment key={`line-${blockIdx}-${lineIdx}`}>
                {renderWithLinks(
                  line,
                  `p-${blockIdx}-${lineIdx}`,
                  linkClassName,
                )}
                {lineIdx < block.lines.length - 1 && <br />}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
