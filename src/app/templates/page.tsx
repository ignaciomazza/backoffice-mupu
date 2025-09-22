// src/app/templates/page.tsx
"use client";

import React, { useCallback, useEffect, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import TemplateConfigForm from "@/components/templates/TemplateConfigForm";
import TemplateEditor from "@/components/templates/TemplateEditor";
import type {
  DocType,
  TemplateConfig,
  TemplateFormValues,
} from "@/types/templates";
import { buildInitialOrderedBlocks } from "@/lib/templateConfig";
import Link from "next/link";

type ApiGetResponse = {
  exists: boolean;
  id_template: number | null;
  id_agency: number;
  doc_type: DocType;
  config: TemplateConfig;
  created_at: string | null;
  updated_at: string | null;
};

const DOC_TYPES: DocType[] = ["quote", "confirmation"];
const EMPTY_CFG: TemplateConfig = {};
const EMPTY_VALUE: TemplateFormValues = { blocks: [] };

export default function TemplatesPage() {
  const { token } = useAuth();

  const [docType, setDocType] = useState<DocType>("quote");
  const [cfg, setCfg] = useState<TemplateConfig>(EMPTY_CFG);
  const [formValue, setFormValue] = useState<TemplateFormValues>(EMPTY_VALUE);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);

  // Perfil (role)
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await authFetch(
          "/api/user/profile",
          { signal: controller.signal },
          token,
        );
        if (!res.ok) throw new Error("Error al obtener perfil");
        const data = await res.json();
        setRole(data.role);
      } catch (err) {
        if ((err as DOMException)?.name !== "AbortError") {
          console.error("❌ Error fetching profile:", err);
        }
      }
    })();
    return () => controller.abort();
  }, [token]);

  // Cargar config del docType (resuelta)
  const load = useCallback(async () => {
    if (!token || !docType) return { ok: false as const };
    setLoading(true);
    try {
      const res = await authFetch(
        `/api/template-config/${encodeURIComponent(docType)}?resolved=1`,
        { cache: "no-store" },
        token,
      );
      const data = (await res.json()) as ApiGetResponse;
      if (!res.ok) {
        const errMsg = (data as { error?: string })?.error;
        throw new Error(errMsg || "No se pudo cargar el template");
      }
      setCfg(data.config || EMPTY_CFG);

      // Inicializar blocks si existen en la config
      const hasBlocks = Array.isArray(data.config?.content?.blocks);
      const initialBlocks = hasBlocks
        ? buildInitialOrderedBlocks(data.config)
        : [];

      setFormValue({ blocks: initialBlocks });

      return { ok: true as const };
    } catch (e) {
      console.error("[templates/page] load error:", e);
      setCfg(EMPTY_CFG);
      setFormValue(EMPTY_VALUE);
      return { ok: false as const };
    } finally {
      setLoading(false);
    }
  }, [token, docType]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ProtectedRoute>
      <section className="mx-auto max-w-6xl p-6 text-sky-950 dark:text-white">
        {(role == "gerente" || role == "desarrollador") && (
          <div className="mb-6 flex w-full justify-end">
            <Link
              className="w-fit rounded-full bg-sky-100 px-4 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
              href={`/template-config/${docType}`}
            >
              Configuracion
            </Link>
          </div>
        )}

        {/* Selector DocType */}
        <div className="mb-6">
          <select
            className="w-full cursor-pointer appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
            value={docType}
            onChange={(e) => setDocType(e.target.value as DocType)}
          >
            {DOC_TYPES.map((t) => (
              <option key={t} value={t}>
                {t === "quote" ? "Cotización" : "Confirmación"}
              </option>
            ))}
          </select>
        </div>

        {/* Layout principal */}
        {loading ? (
          <div className="flex min-h-[60vh] items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Config del doc (portada/contacto/pago…) */}
            <TemplateConfigForm
              cfg={cfg}
              value={formValue}
              onChange={setFormValue}
            />

            {/* Editor en vivo (preview editable con presets + PDF adentro) */}
            <TemplateEditor
              cfg={cfg}
              value={formValue}
              onChange={setFormValue}
              docType={docType}
            />
          </div>
        )}
      </section>
    </ProtectedRoute>
  );
}
