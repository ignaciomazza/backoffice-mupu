// src/app/template-config/[doc_type]/page.tsx
"use client";

import React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ProtectedRoute from "@/components/ProtectedRoute";
import TemplateConfigContainer from "@/components/template-config/TemplateConfigContainer";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

type DocType = "quote" | "confirmation";

export default function Page() {
  const params = useParams<{ doc_type?: string }>();
  const raw = String(params?.doc_type || "")
    .trim()
    .toLowerCase();

  const isValid = raw === "quote" || raw === "confirmation";
  const docType = (isValid ? raw : "quote") as DocType;

  if (!isValid) {
    return (
      <ProtectedRoute>
        <section className="mx-auto max-w-3xl p-6 text-sky-950 dark:text-white">
          <h1 className="mb-2 text-2xl font-semibold">Configurar plantilla</h1>
          <p className="opacity-80">
            El tipo de documento &quot;<code>{raw || "(vacío)"}</code>&quot; no
            es válido.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link
              href="/template-config/quote"
              className="rounded-2xl border border-sky-950/10 bg-white/50 p-4 transition hover:scale-[0.99] dark:border-white/10 dark:bg-white/10"
            >
              <div className="text-lg font-medium">Cotización</div>
              <div className="text-sm opacity-70">
                Configurar estilos y contenido de la cotización.
              </div>
            </Link>

            <Link
              href="/template-config/confirmation"
              className="rounded-2xl border border-sky-950/10 bg-white/50 p-4 transition hover:scale-[0.99] dark:border-white/10 dark:bg-white/10"
            >
              <div className="text-lg font-medium">Confirmación</div>
              <div className="text-sm opacity-70">
                Configurar estilos y contenido de la confirmación.
              </div>
            </Link>
          </div>

          <ToastContainer />
        </section>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <TemplateConfigContainer docType={docType} />
      <ToastContainer />
    </ProtectedRoute>
  );
}
