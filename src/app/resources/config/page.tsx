"use client";

import Link from "next/link";
import ProtectedRoute from "@/components/ProtectedRoute";
import ResourceSectionAccessConfig from "@/components/resources/ResourceSectionAccessConfig";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const GLASS =
  "rounded-3xl border border-white/30 bg-white/10 backdrop-blur shadow-lg shadow-sky-900/10 dark:bg-white/10 dark:border-white/5";
const SUBTLE_BTN =
  "inline-flex items-center gap-2 rounded-full border border-sky-500/35 bg-white/55 px-4 py-2 text-sm text-sky-900 shadow-sm shadow-sky-950/10 transition duration-200 hover:-translate-y-0.5 hover:bg-sky-100/65 active:translate-y-0 dark:border-sky-300/35 dark:bg-sky-950/30 dark:text-sky-100";

export default function ResourcesConfigPage() {
  return (
    <ProtectedRoute>
      <main className="space-y-5 p-6 text-sky-950 dark:text-sky-50">
        <section className={`${GLASS} p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-sky-900/60 dark:text-sky-100/60">
                Recursos
              </p>
              <h1 className="text-2xl font-semibold">Configuración</h1>
              <p className="text-sm text-sky-900/75 dark:text-sky-100/70">
                Define edición de notas y visibilidad de calendario por usuario.
              </p>
            </div>
            <Link href="/resources" className={SUBTLE_BTN}>
              Volver a Recursos
            </Link>
          </div>
        </section>

        <ResourceSectionAccessConfig />
      </main>

      <ToastContainer
        position="bottom-right"
        autoClose={2200}
        hideProgressBar
        newestOnTop
      />
    </ProtectedRoute>
  );
}
