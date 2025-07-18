// src/components/resources/ResourceCard.tsx
"use client";

import { motion } from "framer-motion";
import Link from "next/link";

interface Resource {
  id_resource: number;
  title: string;
  description: string | null;
  createdAt: string;
}

interface Props {
  resource: Resource;
  expandedId: number | null;
  setExpandedId: (id: number | null) => void;
}

export default function ResourceCard({
  resource,
  expandedId,
  setExpandedId,
}: Props) {
  const isExpanded = expandedId === resource.id_resource;
  const description = resource.description ?? "";

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("es-AR");
  };

  const displayText = isExpanded
    ? description.slice(0, 200) + "..."
    : description.length > 100
      ? description.slice(0, 100) + "..."
      : description;

  return (
    <motion.div
      layout
      layoutId={`resource-${resource.id_resource}`}
      className="h-fit space-y-3 rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{resource.title}</h3>
        <button
          onClick={() =>
            setExpandedId(isExpanded ? null : resource.id_resource)
          }
          className="rounded-full bg-sky-100 p-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
          aria-label={isExpanded ? "Cerrar" : "Expandir"}
        >
          {isExpanded ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="size-6"
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
              className="size-6"
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

      <p className="text-sm text-gray-600">{formatDate(resource.createdAt)}</p>

      <p className="text-base">{displayText || "Sin descripción."}</p>

      {isExpanded && (
        <Link
          href={`/resources/${resource.id_resource}`}
          className="mt-6 flex w-full justify-end gap-1 rounded-full bg-sky-100 px-4 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
        >
          Ver detalle
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.4}
            stroke="currentColor"
            className="size-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15M12 9l3 3m0 0-3 3m3-3H2.25"
            />
          </svg>
        </Link>
      )}
    </motion.div>
  );
}
