// src/components/template-config/TemplateConfigHeader.tsx
"use client";

import React from "react";
import Spinner from "@/components/Spinner";

export type TemplateMeta = {
  id_template: number | null;
  created_at: string | null;
  updated_at: string | null;
};

type Props = {
  docType: string;
  exists: boolean;
  meta: TemplateMeta;
  resolvedView: boolean;
  disabled: boolean;
  loading: boolean;
  saving: boolean;
  deleting: boolean;
  onToggleResolved: (v: boolean) => void;
  onSave: () => void;
  onDelete: () => void;
  onResetDefaults: () => void;
};

const chip = (ok: boolean) =>
  ok
    ? "rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-700 dark:text-emerald-300"
    : "rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-3 py-1 text-sm text-yellow-700 dark:text-yellow-300";

const TemplateConfigHeader: React.FC<Props> = ({
  docType,
  exists,
  meta,
  resolvedView,
  disabled,
  loading,
  saving,
  deleting,
  onToggleResolved,
  onSave,
  onDelete,
  onResetDefaults,
}) => {
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          Configuracion —{" "}
          <code className="text-base opacity-80">
            {docType === "quote"
              ? "Cotizacion"
              : docType === "confirmation"
                ? "Confirmacion"
                : "(sin tipo de documento)"}
          </code>
        </h1>

        {!loading && (
          <span className={chip(exists)}>
            {exists ? "Existe" : "Sin configurar"}
          </span>
        )}
      </div>

      {!loading && (
        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs opacity-80">
          <span>ID: {meta.id_template ?? "-"}</span>
          <span>
            Creado:{" "}
            {meta.created_at ? new Date(meta.created_at).toLocaleString() : "-"}
          </span>
          <span>
            Actualizado:{" "}
            {meta.updated_at ? new Date(meta.updated_at).toLocaleString() : "-"}
          </span>

          <label className="ml-auto flex items-center gap-2">
            <input
              type="checkbox"
              checked={resolvedView}
              onChange={(e) => onToggleResolved(e.target.checked)}
              disabled={loading}
            />
            <span className="text-[11px]">Ver con defaults</span>
          </label>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <button
          onClick={onSave}
          disabled={disabled}
          className="rounded-full bg-slate-100 px-5 py-2 text-slate-900 shadow-sm shadow-slate-900/10 transition-transform hover:scale-95 active:scale-90 disabled:opacity-60 dark:bg-white/10 dark:text-white"
        >
          {saving ? <Spinner /> : "Guardar"}
        </button>

        <button
          onClick={onDelete}
          disabled={disabled || !exists}
          className="rounded-full bg-red-600 px-5 py-2 text-red-100 shadow-sm shadow-red-950/20 transition-transform hover:scale-95 active:scale-90 disabled:opacity-60 dark:bg-red-800"
          title="Eliminar configuración"
        >
          {deleting ? <Spinner /> : "Eliminar"}
        </button>

        <div className="mx-2 h-6 w-px bg-slate-900/10 dark:bg-white/10" />

        <button
          onClick={onResetDefaults}
          disabled={disabled}
          className="rounded-full bg-white/50 px-4 py-2 text-sm shadow-sm transition-transform hover:scale-95 active:scale-90 dark:bg-white/10"
          title="Usar valores sugeridos"
        >
          Sugeridos
        </button>

        {loading && (
          <div className="ml-auto">
            <Spinner />
          </div>
        )}
      </div>
    </>
  );
};

export default TemplateConfigHeader;
