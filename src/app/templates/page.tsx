// src/app/templates/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import TemplateConfigForm from "@/components/templates/TemplateConfigForm";
import TemplateDataForm from "@/components/templates/TemplateDataForm";
import TemplatePreview from "@/components/templates/TemplatePreview";
import TemplatePdfDownload from "@/components/templates/TemplatePdfDownload";
import type {
  DocType,
  TemplateConfig,
  TemplateFormValues,
} from "@/types/templates";
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

  // 1) Perfil (role + agency)
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
        throw new Error(
          (data as { error?: string })?.error ||
            "No se pudo cargar el template",
        );
      }
      setCfg(data.config || EMPTY_CFG);
      setFormValue(EMPTY_VALUE); // reset por docType
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
    let alive = true;
    (async () => {
      if (!token || !docType) {
        setLoading(false);
        return;
      }
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
        if (!alive) return;
        setCfg(data.config || EMPTY_CFG);
        setFormValue(EMPTY_VALUE);
      } catch (e) {
        console.error("[templates/page] load error:", e);
        if (!alive) return;
        setCfg(EMPTY_CFG);
        setFormValue(EMPTY_VALUE);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token, docType]);

  useEffect(() => {
    // Ejecuta y devuelve cleanup si hiciera falta en el futuro
    void load();
  }, [load]);

  const docTypeLabel = useMemo(
    () => (docType === "quote" ? "Cotización" : "Confirmación"),
    [docType],
  );

  return (
    <ProtectedRoute>
      <section className="mx-auto max-w-6xl p-6 text-sky-950 dark:text-white">
        {/* Selector DocType */}
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

        {/* Layout */}
        {loading ? (
          <div className="flex min-h-[60vh] items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Columna izquierda: config + data */}
            <div className="space-y-6">
              <TemplateConfigForm
                cfg={cfg}
                value={formValue}
                onChange={setFormValue}
              />

              {/* NUEVO: formulario de contenido por documento */}
              <TemplateDataForm
                cfg={cfg}
                value={formValue}
                onChange={setFormValue}
                docType={docType}
              />
            </div>

            <div className="flex flex-col gap-2">
              <TemplatePreview
                cfg={cfg}
                form={formValue}
                docType={docType}
                docTypeLabel={docTypeLabel}
              />

              <div className="flex justify-end">
                <TemplatePdfDownload
                  cfg={cfg}
                  form={formValue}
                  docType={docType}
                  docTypeLabel={docTypeLabel}
                  filename={
                    docType === "quote"
                      ? `cotizacion-${new Date().toISOString().slice(0, 10)}.pdf`
                      : `confirmacion-${new Date().toISOString().slice(0, 10)}.pdf`
                  }
                />
              </div>
            </div>
          </div>
        )}
      </section>
    </ProtectedRoute>
  );
}
