// src/components/template-config/TemplateConfigContainer.tsx
"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import TemplateConfigHeader from "@/components/template-config/TemplateConfigHeader";
import TemplateConfigForm from "@/components/template-config/TemplateConfigForm";
import TemplateConfigPreview from "@/components/template-config/TemplateConfigPreview";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import Spinner from "@/components/Spinner";
import { toast } from "react-toastify";
import { type Config } from "@/components/template-config/types";

// ===== Tipos =====
export type DocType = "quote" | "confirmation" | "voucher";

type ApiGetResponse<T extends DocType = DocType> = {
  exists: boolean;
  id_template: number | null;
  id_agency: number;
  doc_type: T;
  config: Config;
  created_at: string | null;
  updated_at: string | null;
};

type TemplateConfigRecord = {
  id_template: number;
  id_agency: number;
  doc_type: DocType;
  config: Config;
  created_at: string | null;
  updated_at: string | null;
};

// ===== Helpers =====
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function toObj(v: unknown): Config {
  return isObj(v) ? (v as Record<string, unknown>) : {};
}

// ===== Presets mínimos (fallback local por doc_type) =====
const LOCAL_DEFAULTS: Record<DocType, Config> = {
  confirmation: {
    styles: {
      colors: { background: "#FFFFFF", text: "#111111", accent: "#6B7280" },
      fonts: { heading: "Poppins", body: "Poppins" },
    },
    layout: "layoutA",
    coverImage: { mode: "logo" },
    contactItems: ["phones", "email", "website", "address"],
    content: { blocks: [] },
    paymentOptions: [],
  },
  voucher: {
    styles: {
      colors: { background: "#FFFFFF", text: "#111111", accent: "#6B7280" },
      fonts: { heading: "Poppins", body: "Poppins" },
    },
    layout: "layoutA",
    coverImage: { mode: "logo" },
    contactItems: ["phones", "email", "website", "address"],
    content: { blocks: [] },
    paymentOptions: [],
  },
  quote: {
    styles: {
      colors: { background: "#FFFFFF", text: "#111111", accent: "#6B7280" },
      fonts: { heading: "Poppins", body: "Poppins" },
    },
    layout: "layoutA",
    coverImage: { mode: "logo" },
    contactItems: ["phones", "email", "website", "address"],
    content: { blocks: [] },
    paymentOptions: [],
  },
};

// ===== Props =====
type Props = {
  docType: DocType;
};

const TemplateConfigContainer: React.FC<Props> = ({ docType }) => {
  const { token } = useAuth();

  const [cfg, setCfg] = useState<Config>({});
  const [exists, setExists] = useState<boolean>(false);

  const [meta, setMeta] = useState<{
    id_template: number | null;
    created_at: string | null;
    updated_at: string | null;
  }>({ id_template: null, created_at: null, updated_at: null });

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);

  // resolved=1 (usar defaults del backend mezclados)
  const [resolvedView, setResolvedView] = useState<boolean>(false);

  // abort para GET
  const abortRef = useRef<AbortController | null>(null);

  const fallback = useMemo<Config>(
    () => LOCAL_DEFAULTS[docType] ?? {},
    [docType],
  );

  const disabled = loading || saving || deleting || !docType;

  const load = useCallback(async () => {
    if (!token || !docType) return;

    setLoading(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const url = `/api/template-config/${encodeURIComponent(docType)}${
        resolvedView ? "?resolved=1" : ""
      }`;

      const res = await authFetch(
        url,
        { cache: "no-store", signal: controller.signal },
        token,
      );
      const data = (await res.json()) as ApiGetResponse;

      if (!res.ok) {
        throw new Error(
          (data as { error?: string })?.error || "No se pudo cargar",
        );
      }

      setExists(Boolean(data.exists));
      setMeta({
        id_template: data.id_template ?? null,
        created_at: data.created_at ?? null,
        updated_at: data.updated_at ?? null,
      });
      setCfg(toObj(data.config));
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") return;
      console.error(e);
      setExists(false);
      setCfg(fallback);
      toast.error(
        e instanceof Error ? e.message : "Error cargando configuración",
      );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [docType, token, resolvedView, fallback]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docType, token, resolvedView]);

  const onChangeCfg = (next: Record<string, unknown>) => {
    setCfg(toObj(next));
  };

  const onResetDefaults = () => {
    setCfg(fallback);
  };

  const onSave = async () => {
    if (!token) return;
    try {
      setSaving(true);

      const contactItemsRaw = (cfg as Record<string, unknown>).contactItems;
      const sanitized: Config = {
        ...cfg,
        contactItems: Array.isArray(contactItemsRaw)
          ? contactItemsRaw.filter((x): x is string => typeof x === "string")
          : [],
      };

      const payload = { config: sanitized };

      const res = await authFetch(
        `/api/template-config/${encodeURIComponent(docType)}`,
        { method: "PUT", body: JSON.stringify(payload) },
        token,
      );

      const body = (await res.json()) as
        | TemplateConfigRecord
        | { error?: string };

      if (!res.ok) {
        throw new Error(
          (body as { error?: string })?.error || "No se pudo guardar",
        );
      }

      const record = body as TemplateConfigRecord;
      setExists(true);
      setMeta({
        id_template: record.id_template,
        created_at: record.created_at,
        updated_at: record.updated_at,
      });
      setCfg(toObj(record.config));
      toast.success("Configuración guardada ✅");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!token) return;
    if (!confirm("¿Eliminar configuración para este doc_type?")) return;

    try {
      setDeleting(true);
      const res = await authFetch(
        `/api/template-config/${encodeURIComponent(docType)}`,
        { method: "DELETE" },
        token,
      );
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !body?.ok)
        throw new Error(body?.error || "No se pudo eliminar");

      setExists(false);
      setMeta({ id_template: null, created_at: null, updated_at: null });
      setCfg(fallback);
      toast.success("Configuración eliminada ✅");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="mx-auto max-w-6xl text-slate-900 dark:text-white">
      <TemplateConfigHeader
        docType={docType}
        exists={exists}
        meta={meta}
        loading={loading}
        onSave={onSave}
        onDelete={onDelete}
        resolvedView={resolvedView}
        onToggleResolved={setResolvedView}
        saving={saving}
        deleting={deleting}
        disabled={disabled}
        onResetDefaults={onResetDefaults}
      />

      {loading ? (
        <div className="flex min-h-[50vh] items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          {/* Editor */}
          <TemplateConfigForm
            cfg={cfg}
            disabled={disabled}
            onChange={onChangeCfg}
          />

          {/* Preview */}
          <TemplateConfigPreview
            cfg={cfg}
            docTypeLabel={
              docType === "quote"
                ? "Cotización"
                : docType === "confirmation"
                  ? "Confirmación"
                  : "Voucher"
            }
            editable={!disabled}
            onChange={onChangeCfg}
          />
        </div>
      )}
    </section>
  );
};

export default TemplateConfigContainer;
