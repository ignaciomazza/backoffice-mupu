// src/components/groups/collections/receipt-form/GroupContextSection.tsx
"use client";

import React from "react";
import Spinner from "@/components/Spinner";
import type { ServiceLite } from "@/types/receipts";
import type { GroupFinanceContextOption } from "@/components/groups/finance/contextTypes";
import { Field, Section, inputBase, pillBase, pillNeutral, pillOk } from "./primitives";

type Mode = "agency" | "context";
type Action = "create" | "attach";

const formatAgencyNumber = (value: number | null | undefined): string => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return String(Math.trunc(value));
  }
  return "Sin Nº";
};

export default function GroupContextSection(props: {
  attachEnabled: boolean;
  action: Action;
  setAction: (a: Action) => void;
  hideContext?: boolean;
  requireServiceSelection: boolean;

  canToggleAgency: boolean;
  mode: Mode;
  setMode: (m: Mode) => void;
  clearContextSelection: () => void;

  forcedContextMode: boolean;
  contextId?: number;

  contextQuery: string;
  setContextQuery: (v: string) => void;
  contextOptions: GroupFinanceContextOption[];
  loadingContexts: boolean;

  selectedContextId: number | null;
  setSelectedContextId: (id: number | null) => void;

  services: ServiceLite[];
  loadingServices: boolean;
  selectedServiceIds: number[];
  effectiveServiceIds: number[];
  toggleService: (svc: ServiceLite) => void;
  serviceDisabledReasons: Record<number, string>;

  lockedCurrency: string | null;
  effectiveCurrency: string;

  errors: Record<string, string>;
  formatNum: (n: number, cur?: string) => string;
}) {
  const {
    attachEnabled,
    action,
    setAction,
    hideContext = false,
    requireServiceSelection,

    canToggleAgency,
    mode,
    setMode,
    clearContextSelection,

    forcedContextMode,
    contextId,

    contextQuery,
    setContextQuery,
    contextOptions,
    loadingContexts,

    selectedContextId,
    setSelectedContextId,

    services,
    loadingServices,
    selectedServiceIds,
    effectiveServiceIds,
    toggleService,
    serviceDisabledReasons,

    lockedCurrency,
    effectiveCurrency,

    errors,
    formatNum,
  } = props;

  return (
    <>
      {attachEnabled && (
        <Section
          title="Modo"
          desc="Podés crear un recibo nuevo o asociarlo a un contexto operativo y sus servicios."
        >
          <div className="md:col-span-2">
            <div className="inline-flex rounded-2xl border border-slate-300/80 bg-white/85 p-1 shadow-sm shadow-slate-900/10 dark:border-slate-600 dark:bg-slate-900/60">
              <button
                type="button"
                onClick={() => setAction("create")}
                className={[
                  "rounded-xl px-4 py-2 text-[13px] font-semibold transition-colors md:text-sm",
                  action === "create"
                    ? "border border-sky-300/80 bg-sky-100/80 text-sky-900 dark:border-sky-700 dark:bg-sky-900/25 dark:text-sky-100"
                    : "text-slate-700 hover:bg-sky-50/45 dark:text-slate-200 dark:hover:bg-slate-800/70",
                ].join(" ")}
              >
                Crear nuevo
              </button>
              <button
                type="button"
                onClick={() => setAction("attach")}
                className={[
                  "rounded-xl px-4 py-2 text-[13px] font-semibold transition-colors md:text-sm",
                  action === "attach"
                    ? "border border-sky-300/80 bg-sky-100/80 text-sky-900 dark:border-sky-700 dark:bg-sky-900/25 dark:text-sky-100"
                    : "text-slate-700 hover:bg-sky-50/45 dark:text-slate-200 dark:hover:bg-slate-800/70",
                ].join(" ")}
              >
                Asociar existente
              </button>
            </div>
          </div>
        </Section>
      )}

      {!hideContext && (
        <Section
          title="Contexto"
          desc={
            action === "attach"
              ? requireServiceSelection
                ? "Elegí el contexto y los servicios a los que querés asociar el recibo."
                : "Elegí el contexto y, si aplica, los servicios a los que querés asociar el recibo."
              : requireServiceSelection
                ? "Podés asociarlo a un contexto y elegir servicios, o crearlo como recibo de agencia."
                : "Podés asociarlo a un contexto y elegir servicios de forma opcional, o crearlo como recibo de agencia."
          }
        >
        {canToggleAgency && (
          <div className="md:col-span-2">
            <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-slate-700 dark:text-slate-200 md:text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 rounded border-slate-300 bg-white text-sky-600 shadow-sm shadow-slate-900/10 focus:ring-sky-300 dark:border-slate-600 dark:bg-slate-900"
                checked={mode === "context"}
                onChange={(e) => {
                  const next = e.target.checked ? "context" : "agency";
                  setMode(next);
                  if (next === "agency") clearContextSelection();
                }}
              />
              Asociar a un contexto ahora
            </label>
          </div>
        )}

        {mode === "context" && (
          <>
            {forcedContextMode ? (
              <div className="rounded-xl border border-sky-200/70 bg-sky-50/45 p-3 text-[13px] text-slate-700 dark:border-sky-900/40 dark:bg-slate-900/55 dark:text-slate-300 md:col-span-2 md:text-sm">
                Contexto asociado:{" "}
                <span className="font-semibold">
                  {contextId ? "bloqueado" : "sin Nº interno"}
                </span>{" "}
                <span className="ml-2 rounded-full border border-sky-200/70 bg-sky-50/60 px-2 py-0.5 text-[11px] dark:border-sky-900/40 dark:bg-slate-900/55 md:text-xs">
                  bloqueado
                </span>
              </div>
            ) : (
              <>
                <Field id="context_search" label="Buscar contexto" hint="Por número o titular...">
                  <input
                    id="context_search"
                    value={contextQuery}
                    onChange={(e) => setContextQuery(e.target.value)}
                    placeholder="Escribi al menos 2 caracteres"
                    className={inputBase}
                    autoComplete="off"
                  />
                </Field>

                <div className="md:col-span-2">
                  {loadingContexts ? (
                    <div className="py-2">
                      <Spinner />
                    </div>
                  ) : contextOptions.length > 0 ? (
                    <div className="max-h-56 overflow-auto rounded-2xl border border-sky-200/70 bg-white/70 dark:border-sky-900/40 dark:bg-slate-900/50">
                      {contextOptions.map((opt) => {
                        const active = selectedContextId === opt.id_context;
                        return (
                          <button
                            key={opt.id_context}
                            type="button"
                            className={`w-full px-3 py-2 text-left transition ${
                              active
                                ? "bg-sky-100/70 text-slate-900 dark:bg-sky-900/25 dark:text-slate-100"
                                : "text-slate-700 hover:bg-sky-50/45 dark:text-slate-200 dark:hover:bg-slate-800/70"
                            }`}
                            onClick={() => setSelectedContextId(opt.id_context)}
                          >
                            <div className="text-[13px] font-medium md:text-sm">{opt.label}</div>
                            {opt.subtitle && (
                              <div className="text-[11px] text-slate-600 dark:text-slate-400 md:text-xs">
                                {opt.subtitle}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ) : contextQuery && contextQuery.length >= 2 ? (
                    <p className="text-[13px] text-slate-600 dark:text-slate-400 md:text-sm">
                      Sin resultados.
                    </p>
                  ) : null}

                  {errors.context && <p className="mt-1 text-xs text-red-600">{errors.context}</p>}
                </div>
              </>
            )}

            {selectedContextId && (
              <div className="md:col-span-2">
                <label className="mb-1 ml-1 block text-[13px] font-medium text-slate-900 dark:text-slate-100 md:text-sm">
                  Servicios del contexto
                </label>

                {loadingServices ? (
                  <div className="py-2">
                    <Spinner />
                  </div>
                ) : services.length === 0 ? (
                  <p className="text-[13px] text-slate-600 dark:text-slate-400 md:text-sm">
                    {requireServiceSelection
                      ? "No hay servicios para este contexto."
                      : "No hay servicios para este contexto. Podés continuar igual."}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {services.map((svc) => {
                      const checked = selectedServiceIds.includes(svc.id_service);
                      const currencyLocked =
                        !!lockedCurrency && svc.currency !== lockedCurrency && !checked;
                      const settledReason = serviceDisabledReasons[svc.id_service];
                      const settledLocked = !!settledReason && !checked;
                      const disabled = currencyLocked || settledLocked;

                      return (
                        <label
                          key={svc.id_service}
                          className={`flex items-start gap-3 rounded-2xl border px-3 py-2 ${
                            checked
                              ? "border-sky-300/80 bg-sky-100/70 text-slate-900 dark:border-sky-700 dark:bg-sky-900/25 dark:text-slate-100"
                              : "border-slate-300/80 bg-white/85 text-slate-700 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-200"
                          } ${disabled ? "opacity-50" : ""}`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1 size-4"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggleService(svc)}
                          />
                          <div className="flex-1">
                            <div className="text-[13px] font-medium md:text-sm">
                              Nº {formatAgencyNumber(svc.agency_service_id)}{" "}
                              {svc.type
                                ? `· ${svc.type}`
                                : svc.description || "Servicio"}
                              {svc.destination ? ` · ${svc.destination}` : ""}
                            </div>
                            <div className="text-[11px] text-slate-600 dark:text-slate-400 md:text-xs">
                              Moneda: <b>{svc.currency}</b>
                              {typeof svc.sale_price === "number" && (
                                <>
                                  {" "}
                                  • Venta:{" "}
                                  {formatNum(
                                    (svc.sale_price ?? 0) + (svc.card_interest ?? 0),
                                    (svc.currency || "ARS").toUpperCase(),
                                  )}
                                </>
                              )}
                              {settledReason && (
                                <>
                                  {" "}
                                  •{" "}
                                  <span className="font-semibold text-rose-600 dark:text-rose-300">
                                    {settledReason}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`${pillBase} ${pillNeutral}`}>
                    Servicios aplicados: {effectiveServiceIds.length}
                  </span>
                  <span className={`${pillBase} ${lockedCurrency ? pillOk : pillNeutral}`}>
                    Moneda {lockedCurrency ? `${lockedCurrency} (lock)` : "libre"}
                  </span>
                  {!!effectiveCurrency && !lockedCurrency && (
                    <span className={`${pillBase} ${pillNeutral}`}>
                      {effectiveCurrency}
                    </span>
                  )}
                </div>

                {errors.services && <p className="mt-1 text-xs text-red-600">{errors.services}</p>}
              </div>
            )}
          </>
        )}
        </Section>
      )}
    </>
  );
}
