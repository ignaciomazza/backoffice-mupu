// src/components/resources/ResourceCard.tsx
"use client";

import { motion } from "framer-motion";
import Link from "next/link";

interface Resource {
  id_resource: number;
  public_id?: string | null;
  title: string;
  description: string | null;
  createdAt: string;
}

interface Props {
  resource: Resource;
  expandedId: number | null;
  setExpandedId: (id: number | null) => void;
}

const URL_REGEX = /https?:\/\/[^\s]+/gi;

const extractLinks = (text?: string | null) =>
  text ? text.match(URL_REGEX) ?? [] : [];

const extractListItems = (text?: string | null) => {
  if (!text) return [];
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-•*]\s+/.test(line))
    .map((line) => line.replace(/^[-•*]\s+/, "").trim())
    .filter(Boolean);
};

export default function ResourceCard({
  resource,
  expandedId,
  setExpandedId,
}: Props) {
  const isExpanded = expandedId === resource.id_resource;
  const description = resource.description ?? "";
  const hasDescription = description.trim().length > 0;
  const links = extractLinks(description);
  const listItems = extractListItems(description);
  const maxChars = isExpanded ? 240 : 140;

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("es-AR");
  };

  const displayText = !hasDescription
    ? "Sin descripción."
    : description.length > maxChars
      ? `${description.slice(0, maxChars).trim()}...`
      : description;

  return (
    <motion.div
      layout
      layoutId={`resource-${resource.id_resource}`}
      className="group h-fit space-y-4 rounded-3xl border border-sky-200/60 bg-white/80 p-6 text-sky-950 shadow-lg shadow-sky-950/10 backdrop-blur transition hover:-translate-y-1 hover:border-sky-300/70 dark:border-white/10 dark:bg-white/5 dark:text-white"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-sky-900/60 dark:text-white/60">
            <span className="rounded-full border border-sky-200/60 bg-sky-100/80 px-2 py-1 text-[10px] font-semibold text-sky-900 dark:border-white/10 dark:bg-white/5 dark:text-white">
              Recurso
            </span>
            {links.length > 0 && (
              <span className="rounded-full border border-emerald-200/60 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100">
                {links.length} links
              </span>
            )}
            {listItems.length > 0 && (
              <span className="rounded-full border border-sky-200/60 bg-white/70 px-2 py-1 text-[10px] font-semibold text-sky-900 dark:border-white/10 dark:bg-white/5 dark:text-white">
                {listItems.length} ítems
              </span>
            )}
          </div>
          <h3 className="text-lg font-semibold">{resource.title}</h3>
        </div>
        <button
          onClick={() =>
            setExpandedId(isExpanded ? null : resource.id_resource)
          }
          className="rounded-full border border-sky-200/60 bg-white/70 p-2 text-sky-900 shadow-sm shadow-sky-950/10 transition-transform hover:scale-95 active:scale-90 dark:border-white/10 dark:bg-white/5 dark:text-white"
          aria-label={isExpanded ? "Cerrar" : "Expandir"}
        >
          {isExpanded ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="size-5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="size-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
          )}
        </button>
      </div>

      <p className="text-xs text-sky-900/60 dark:text-white/60">
        Creado el {formatDate(resource.createdAt)}
      </p>

      <p className="whitespace-pre-wrap text-sm text-sky-900/80 dark:text-white/80">
        {displayText}
      </p>

      <div className="flex items-center justify-between gap-3">
        {isExpanded && (
          <Link
            href={`/resources/${resource.public_id ?? resource.id_resource}`}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-300/60 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-900 shadow-sm shadow-emerald-900/10 transition-transform hover:scale-95 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100"
          >
            Ver detalle
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.4}
              stroke="currentColor"
              className="size-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15M12 9l3 3m0 0-3 3m3-3H2.25"
              />
            </svg>
          </Link>
        )}
        {!isExpanded && (
          <span className="text-[11px] text-sky-900/60 dark:text-white/60">
            Click para expandir
          </span>
        )}
      </div>
    </motion.div>
  );
}
