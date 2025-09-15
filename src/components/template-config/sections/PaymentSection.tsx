// src/components/template-config/sections/PaymentSection.tsx

"use client";
import React, { useEffect, useState } from "react";
import {
  getAt,
  setAt,
  section,
  input,
  asStringArray,
  isObject,
} from "./_helpers";
import { Config } from "../types";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";

type Props = {
  cfg: Config;
  disabled: boolean;
  onChange: (next: Config) => void;
};

type AgencyLite = { id?: number; id_agency?: number } & Record<string, unknown>;

const PaymentSection: React.FC<Props> = ({ cfg, disabled, onChange }) => {
  // Lista y seleccionado
  const paymentOptions = asStringArray(getAt(cfg, ["paymentOptions"], []));
  const selectedIndex =
    getAt<number | null>(cfg, ["payment", "selectedIndex"], null) ?? null;

  // Estilo Mupu (solo visible si agencia id=1)
  const mupuStyle = (getAt(cfg, ["payment", "mupuStyle"], {}) || {}) as {
    color?: string;
  };

  const setMupuStyle = (patch: Partial<typeof mupuStyle>) =>
    onChange(
      setAt(cfg, ["payment", "mupuStyle"], { ...(mupuStyle || {}), ...patch }),
    );

  // ¿Es agencia Mupu?
  const { token } = useAuth();
  const [isMupuAgency, setIsMupuAgency] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!token) return;
    (async () => {
      try {
        const res = await authFetch(
          "/api/agency",
          { cache: "no-store" },
          token,
        );
        const data = (await res.json().catch(() => ({}))) as unknown;
        const ag = isObject(data) ? (data as AgencyLite) : {};
        const agencyId =
          (typeof ag.id === "number" ? ag.id : ag.id_agency) ?? null;
        if (mounted) setIsMupuAgency(agencyId === 1);
      } catch {
        if (mounted) setIsMupuAgency(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token]);

  // Handlers básicos
  const addPayment = () =>
    onChange(
      setAt(
        cfg,
        ["paymentOptions"],
        [...paymentOptions, "Instrucciones de pago"],
      ),
    );

  const updatePayment = (idx: number, value: string) =>
    onChange(
      setAt(
        cfg,
        ["paymentOptions"],
        paymentOptions.map((v, i) => (i === idx ? value : v)),
      ),
    );

  const removePayment = (idx: number) => {
    let nextSelected: number | null = selectedIndex;
    if (selectedIndex !== null) {
      if (selectedIndex === idx) nextSelected = null;
      else if (selectedIndex > idx) nextSelected = selectedIndex - 1;
    }
    let next = setAt(
      cfg,
      ["paymentOptions"],
      paymentOptions.filter((_, i) => i !== idx),
    );
    next = setAt(next, ["payment", "selectedIndex"], nextSelected);
    onChange(next);
  };

  const selectForPreview = (idx: number | null) =>
    onChange(setAt(cfg, ["payment", "selectedIndex"], idx));

  return (
    <section className={section}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Opciones de pago</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => selectForPreview(null)}
            disabled={disabled || selectedIndex === null}
            className="rounded-full bg-slate-200 px-3 py-1 text-xs text-slate-900 shadow-sm disabled:opacity-50 dark:bg-white/10 dark:text-white"
            title="Quitar selección de vista previa"
          >
            Quitar selección
          </button>
          <button
            onClick={addPayment}
            disabled={disabled}
            className="rounded-full bg-slate-200 px-4 py-1 text-sm text-slate-900 shadow-sm dark:bg-white/10 dark:text-white"
          >
            + Agregar opción
          </button>
        </div>
      </div>

      {paymentOptions.length === 0 ? (
        <p className="text-sm opacity-70">Sin opciones de pago.</p>
      ) : (
        <div className="space-y-2">
          {paymentOptions.map((p, idx) => {
            const active = selectedIndex === idx;
            return (
              <div
                key={idx}
                className={`relative rounded-xl border p-3 dark:border-white/10 dark:bg-white/5 ${
                  active
                    ? "border-sky-400/60 ring-2 ring-sky-400"
                    : "border-slate-900/10 bg-white/40"
                }`}
              >
                {active && (
                  <div className="pointer-events-none absolute right-2 top-2 rounded-full bg-sky-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    Vista previa
                  </div>
                )}

                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <label className="block flex-1 text-sm">
                    Descripción
                    <input
                      className={`${input} mt-1`}
                      value={p}
                      onChange={(e) => updatePayment(idx, e.target.value)}
                      disabled={disabled}
                      placeholder="Ej.: Transferencia ARS — alias: …"
                    />
                  </label>

                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="paymentPreview"
                        checked={active}
                        onChange={() => selectForPreview(idx)}
                        disabled={disabled}
                      />
                      Usar en la vista previa
                    </label>

                    <button
                      onClick={() => removePayment(idx)}
                      disabled={disabled}
                      className="rounded-full bg-red-600 px-3 py-1 text-sm text-red-100 shadow-sm dark:bg-red-800"
                      title="Quitar opción"
                    >
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
                          d="M6 18 18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== Estilo de tipografía/color para Mupu ===== */}
      {isMupuAgency && (
        <details className="mt-4 rounded-xl border border-sky-500/20 bg-sky-500/5 p-3">
          <summary className="cursor-pointer select-none text-sm font-medium text-sky-800 dark:text-sky-300">
            Mupu — Estilo de texto de la opción seleccionada
          </summary>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            {/* Color */}
            <label className="text-sm">
              Color del texto
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  className="h-8 w-10 cursor-pointer rounded border border-slate-900/10 bg-white/70 dark:border-white/10 dark:bg-white/10"
                  value={mupuStyle.color ?? "#1F2937"}
                  onChange={(e) => setMupuStyle({ color: e.target.value })}
                  disabled={disabled}
                  title="Elegí un color — dejá vacío para heredar"
                />
                <input
                  className={`${input} flex-1`}
                  value={mupuStyle.color ?? ""}
                  onChange={(e) =>
                    setMupuStyle({
                      color: e.target.value || undefined,
                    })
                  }
                  placeholder="#1F2937 o rgba(...)"
                  disabled={disabled}
                />
              </div>
            </label>
          </div>

          <div className="mt-3">
            <button
              type="button"
              onClick={() =>
                setMupuStyle({
                  color: undefined,
                })
              }
              disabled={disabled}
              className="rounded-full bg-slate-200 px-3 py-1 text-xs text-slate-900 shadow-sm transition hover:scale-[0.98] dark:bg-white/10 dark:text-white"
              title="Volver a heredar"
            >
              Restablecer estilo
            </button>
          </div>
        </details>
      )}
    </section>
  );
};

export default PaymentSection;
