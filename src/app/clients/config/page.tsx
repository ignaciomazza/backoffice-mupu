// src/app/clients/config/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";

/* ================= Estilos compartidos ================= */
const GLASS =
  "rounded-3xl border border-white/30 bg-white/10 backdrop-blur shadow-lg shadow-sky-900/10 dark:bg-white/10 dark:border-white/5";
const PRIMARY_BTN =
  "rounded-2xl bg-sky-600/30 px-4 py-2 text-sm font-medium text-sky-950 shadow-sm shadow-sky-900/10 transition hover:bg-sky-600/40 active:scale-[.99] disabled:opacity-50 dark:text-white";

type VisibilityMode = "all" | "team" | "own";

type ClientConfig = {
  id_agency: number;
  visibility_mode: VisibilityMode;
};

type ApiError = { error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function normalizeClientConfig(v: unknown): ClientConfig | null {
  if (!isRecord(v)) return null;
  const id_agency = typeof v.id_agency === "number" ? v.id_agency : 0;
  const visibility_mode =
    v.visibility_mode === "all" ||
    v.visibility_mode === "team" ||
    v.visibility_mode === "own"
      ? v.visibility_mode
      : "all";
  return { id_agency, visibility_mode };
}

function apiErrorMessage(v: unknown): string | null {
  return isRecord(v) && typeof (v as ApiError).error === "string"
    ? (v as ApiError).error
    : null;
}

const OPTIONS: { key: VisibilityMode; label: string; desc: string }[] = [
  {
    key: "all",
    label: "Todos",
    desc: "Todos pueden ver clientes y estadísticas de toda la agencia.",
  },
  {
    key: "team",
    label: "Por equipo",
    desc: "Cada usuario ve los clientes de su equipo. Si no pertenece a un equipo, solo ve los suyos.",
  },
  {
    key: "own",
    label: "Solo propios",
    desc: "Cada usuario ve solo sus clientes.",
  },
];

export default function ClientsConfigPage() {
  const { token } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  const [mode, setMode] = useState<VisibilityMode>("all");
  const [initialMode, setInitialMode] = useState<VisibilityMode>("all");

  const canEdit = useMemo(
    () =>
      ["gerente", "administrativo", "desarrollador"].includes(
        (role || "").toLowerCase(),
      ),
    [role],
  );

  const dirty = mode !== initialMode;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    setLoading(true);

    (async () => {
      try {
        const [roleRes, cfgRes] = await Promise.all([
          authFetch("/api/user/profile", { cache: "no-store" }, token),
          authFetch("/api/clients/config", { cache: "no-store" }, token),
        ]);

        if (roleRes.ok) {
          const roleJson = (await roleRes.json().catch(() => ({}))) as {
            role?: string;
          };
          if (alive)
            setRole(roleJson.role ? String(roleJson.role).toLowerCase() : null);
        }

        if (cfgRes.ok) {
          const cfgJson = (await cfgRes.json().catch(() => null)) as unknown;
          const cfg = normalizeClientConfig(cfgJson);
          const nextMode = cfg?.visibility_mode || "all";
          if (alive) {
            setMode(nextMode);
            setInitialMode(nextMode);
          }
        } else if (alive) {
          setMode("all");
          setInitialMode("all");
        }
      } catch (e) {
        console.error("[clients/config] load error", e);
        toast.error("No se pudo cargar la configuración de clientes.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [token]);

  const saveConfig = async () => {
    if (!token || !dirty) return;
    setSaving(true);
    try {
      const res = await authFetch(
        "/api/clients/config",
        {
          method: "PUT",
          body: JSON.stringify({ visibility_mode: mode }),
        },
        token,
      );
      const body = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        throw new Error(apiErrorMessage(body) || "No se pudo guardar.");
      }
      setInitialMode(mode);
      toast.success("Configuración guardada.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo guardar.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!mounted) return null;

  return (
    <ProtectedRoute>
      <section className="mx-auto px-4 py-6 text-sky-950 dark:text-white">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">
              Configuración de Clientes
            </h1>
            <p className="mt-1 text-sm text-sky-950/70 dark:text-white/70">
              Definí el alcance de visibilidad para vendedores.
            </p>
          </div>
          {!canEdit && (
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs">
              Solo lectura
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <div className={`${GLASS} p-6`}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium">Visibilidad</h2>
                <p className="text-sm text-sky-950/70 dark:text-white/70">
                  Aplica a vendedores. Líderes ven su equipo. Y gerentes ven
                  todo.
                </p>
              </div>
              <button
                type="button"
                onClick={saveConfig}
                disabled={!dirty || !canEdit || saving}
                className={PRIMARY_BTN}
              >
                Guardar
              </button>
            </div>

            <div className="grid gap-3">
              {OPTIONS.map((opt) => {
                const active = mode === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setMode(opt.key)}
                    disabled={!canEdit || saving}
                    className={`flex w-full items-start gap-3 rounded-3xl border border-white/20 bg-white/10 p-4 text-left backdrop-blur transition ${
                      active ? "ring-1 ring-sky-400/60" : "hover:bg-white/20"
                    } ${!canEdit ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    <span
                      className={`mt-1 inline-block size-4 rounded-full border ${
                        active
                          ? "border-sky-500 bg-sky-400/70"
                          : "border-white/40 bg-transparent"
                      }`}
                      aria-hidden="true"
                    />
                    <span>
                      <span className="block text-sm font-semibold">
                        {opt.label}
                      </span>
                      <span className="block text-sm opacity-70">
                        {opt.desc}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4">
              <p className="text-xs text-sky-950/70 dark:text-white/70">
                Cambios en visibilidad impactan el listado, búsquedas y
                estadísticas.
              </p>
            </div>
          </div>
        )}
      </section>
      <ToastContainer position="bottom-right" autoClose={2200} />
    </ProtectedRoute>
  );
}
