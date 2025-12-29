// src/app/templates/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const EMPTY_CFG: TemplateConfig = {};
const EMPTY_VALUE: TemplateFormValues = { blocks: [] };
const CONTACT_STORAGE_KEY = "mupu:templates:contact";

export default function TemplatesPage() {
  const { token } = useAuth();

  const [docType, setDocType] = useState<DocType>("quote");
  const [cfg, setCfg] = useState<TemplateConfig>(EMPTY_CFG);
  const [formValue, setFormValue] = useState<TemplateFormValues>(EMPTY_VALUE);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const allowContactPersistRef = useRef(false);

  const docTypeOptions = useMemo(
    () => [
      {
        id: "quote" as DocType,
        label: "Cotizacion",
        description: "Propuesta y detalles iniciales",
        icon: (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 4.5h9.75a1.5 1.5 0 011.5 1.5v12a1.5 1.5 0 01-1.5 1.5H6a1.5 1.5 0 01-1.5-1.5v-12A1.5 1.5 0 016 4.5Z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.25 8.25h6M8.25 12h6M8.25 15.75h4.5"
            />
          </svg>
        ),
      },
      {
        id: "confirmation" as DocType,
        label: "Confirmacion",
        description: "Cierre y datos finales",
        icon: (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.125 2.25h3.75L14.7 4.5h2.425a2.625 2.625 0 012.625 2.625v10.5a2.625 2.625 0 01-2.625 2.625H6.875A2.625 2.625 0 014.25 17.625v-10.5A2.625 2.625 0 016.875 4.5H9.3l.825-2.25Z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75l2.25 2.25L15 11.25"
            />
          </svg>
        ),
      },
    ],
    [],
  );

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
    allowContactPersistRef.current = false;
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

      const storedContact =
        typeof window !== "undefined"
          ? (() => {
              try {
                const raw = window.localStorage.getItem(
                  `${CONTACT_STORAGE_KEY}:${docType}`,
                );
                return raw ? (JSON.parse(raw) as TemplateFormValues["contact"]) : null;
              } catch {
                return null;
              }
            })()
          : null;

      setFormValue({
        blocks: initialBlocks,
        contact: storedContact ?? undefined,
      });
      allowContactPersistRef.current = true;

      return { ok: true as const };
    } catch (e) {
      console.error("[templates/page] load error:", e);
      setCfg(EMPTY_CFG);
      setFormValue(EMPTY_VALUE);
      allowContactPersistRef.current = false;
      return { ok: false as const };
    } finally {
      setLoading(false);
    }
  }, [token, docType]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    allowContactPersistRef.current = false;
  }, [docType]);

  useEffect(() => {
    if (!docType || typeof window === "undefined") return;
    if (!allowContactPersistRef.current) return;
    try {
      if (!formValue.contact) {
        window.localStorage.removeItem(`${CONTACT_STORAGE_KEY}:${docType}`);
        return;
      }
      window.localStorage.setItem(
        `${CONTACT_STORAGE_KEY}:${docType}`,
        JSON.stringify(formValue.contact),
      );
    } catch {}
  }, [docType, formValue.contact]);

  return (
    <ProtectedRoute>
      <section className="mx-auto max-w-6xl p-6 text-slate-950 dark:text-white">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Templates</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
              Personaliza el documento, edita bloques y exporta el PDF final.
            </p>
          </div>
          {(role == "gerente" || role == "desarrollador") && (
            <Link
              className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 shadow-sm shadow-amber-900/10 transition-transform hover:scale-95 active:scale-90 dark:text-amber-300"
              href={`/template-config/${docType}`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0Z"
                />
              </svg>
              Configuracion
            </Link>
          )}
        </div>

        {/* Selector DocType */}
        <div className="mb-6 rounded-3xl border border-slate-900/10 bg-white/70 p-3 shadow-sm shadow-slate-900/10 backdrop-blur dark:border-white/10 dark:bg-white/10">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
            Tipo de documento
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {docTypeOptions.map((opt) => {
              const active = docType === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDocType(opt.id)}
                  className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                    active
                      ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-800 shadow-sm shadow-emerald-900/10"
                      : "border-slate-900/10 bg-white/60 text-slate-700 hover:border-emerald-300/60 dark:border-white/10 dark:bg-white/10 dark:text-slate-200"
                  }`}
                  aria-pressed={active}
                >
                  <span
                    className={`mt-0.5 inline-flex size-8 items-center justify-center rounded-2xl border ${
                      active
                        ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-700"
                        : "border-slate-900/10 bg-white/70 text-slate-500 dark:border-white/10 dark:bg-white/10"
                    }`}
                  >
                    {opt.icon}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">
                      {opt.label}
                    </span>
                    <span className="mt-0.5 block text-xs opacity-70">
                      {opt.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
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
