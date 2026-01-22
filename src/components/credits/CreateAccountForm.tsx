// src/components/credits/CreateAccountForm.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState, FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Spinner from "@/components/Spinner";
import { loadFinancePicks } from "@/utils/loadFinancePicks";
import ClientPicker from "@/components/clients/ClientPicker";
import type { Client, Operator } from "@/types";

/* =========================
 * Tipos
 * ========================= */
type FinanceCurrency = { code: string; name?: string; enabled?: boolean };
type SubjectMode = "client" | "operator";

export type CreateCreditAccountPayload = {
  /** Si el modo es "pax", se envía el id; si no, va null */
  client_id: number | null;
  /** Si el modo es "operador", se envía el id; si no, se omite o null */
  id_operator?: number | null;
  /** Nombre visible de la cuenta */
  name: string;
  /** Moneda ISO (ARS, USD, ...) */
  currency: string;
  /** Estado */
  status?: "ACTIVE" | "PAUSED" | "CLOSED";
  /** Balance inicial opcional (puede ser negativo o positivo) */
  initial_balance?: string;
};

export interface CreateAccountFormProps {
  token: string | null;

  // Controlado / No controlado
  isFormVisible?: boolean;
  setIsFormVisible?: React.Dispatch<React.SetStateAction<boolean>>;

  // Edición
  editingAccountId?: number | null;

  // Valores iniciales (opcionales)
  initialClientId?: number | null;
  initialOperatorId?: number | null;
  initialName?: string;
  initialCurrency?: string;
  initialStatus?: "ACTIVE" | "PAUSED" | "CLOSED";

  /** Lista de operadores (inyectada por la page) */
  operators: Operator[];

  // Submit
  onSubmit: (payload: CreateCreditAccountPayload) => Promise<void> | void;

  // Opcional
  onCancel?: () => void;
}

/* =========================
 * UI primitives (igual estilo)
 * ========================= */
const Section: React.FC<{
  title: string;
  desc?: string;
  children: React.ReactNode;
}> = ({ title, desc, children }) => (
  <section className="rounded-2xl border border-white/10 bg-white/10 p-4">
    <div className="mb-3">
      <h3 className="text-base font-semibold tracking-tight text-sky-950 dark:text-white">
        {title}
      </h3>
      {desc && (
        <p className="mt-1 text-xs font-light text-sky-950/70 dark:text-white/70">
          {desc}
        </p>
      )}
    </div>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
  </section>
);

const Field: React.FC<{
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}> = ({ id, label, hint, required, children }) => (
  <div className="space-y-1">
    <label
      htmlFor={id}
      className="ml-1 block text-sm font-medium text-sky-950 dark:text-white"
    >
      {label} {required && <span className="text-rose-600">*</span>}
    </label>
    {children}
    {hint && (
      <p
        id={`${id}-hint`}
        className="ml-1 text-xs text-sky-950/70 dark:text-white/70"
      >
        {hint}
      </p>
    )}
  </div>
);

const pillBase = "rounded-full px-3 py-1 text-xs font-medium transition-colors";
const pillNeutral = "bg-white/30 dark:bg-white/10";
const pillOk = "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
const inputBase =
  "w-full rounded-2xl border border-white/10 bg-white/50 p-2 px-3 shadow-sm shadow-sky-950/10 outline-none placeholder:font-light dark:bg-white/10 dark:text-white";

/* =========================
 * Componente
 * ========================= */
export default function CreateAccountForm({
  token,
  isFormVisible,
  setIsFormVisible,
  editingAccountId = null,

  initialClientId = null,
  initialOperatorId = null,
  initialName = "",
  initialCurrency,
  initialStatus = "ACTIVE",

  operators,

  onSubmit,
  onCancel,
}: CreateAccountFormProps) {
  // Visibilidad: controlado / no controlado
  const [internalVisible, setInternalVisible] = useState<boolean>(false);
  const visible = isFormVisible ?? internalVisible;
  const setVisible = (v: boolean) => {
    if (setIsFormVisible) setIsFormVisible(v);
    else setInternalVisible(v);
  };
  const toggleVisible = () => setVisible(!visible);

  // Lifecyle refs
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Picks de monedas (cargan SOLO cuando se abre el form)
  const [currencies, setCurrencies] = useState<FinanceCurrency[]>([]);
  const [loadingCurrencies, setLoadingCurrencies] = useState(false);
  const picksRunRef = useRef<{ ac: AbortController; id: number } | null>(null);

  useEffect(() => {
    if (!visible || !token) return;
    if (currencies.length > 0) return;

    // cancelar corrida previa si existiera
    if (picksRunRef.current) picksRunRef.current.ac.abort();

    const ac = new AbortController();
    const runId = Date.now();
    picksRunRef.current = { ac, id: runId };

    const isActive = () =>
      mountedRef.current &&
      picksRunRef.current?.id === runId &&
      !ac.signal.aborted;

    (async () => {
      try {
        setLoadingCurrencies(true);
        const picks = await loadFinancePicks(token);
        if (!isActive()) return;
        setCurrencies(picks?.currencies ?? []);
      } finally {
        if (isActive()) setLoadingCurrencies(false);
      }
    })();

    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, token]);

  const enabledCurrencies = useMemo(
    () => (currencies || []).filter((c) => c.enabled),
    [currencies],
  );
  const enabledCodes = useMemo(
    () => new Set(enabledCurrencies.map((c) => c.code)),
    [enabledCurrencies],
  );

  // ====== Estado del form
  const [subjectMode, setSubjectMode] = useState<SubjectMode>(() =>
    initialOperatorId ? "operator" : "client",
  );
  const [clientId, setClientId] = useState<number | null>(initialClientId);
  const [operatorId, setOperatorId] = useState<number>(
    initialOperatorId != null ? Number(initialOperatorId) : 0,
  );

  const [name, setName] = useState<string>(initialName);
  const [currency, setCurrency] = useState<string>(initialCurrency || "");
  const [status, setStatus] = useState<"ACTIVE" | "PAUSED" | "CLOSED">(
    initialStatus,
  );
  const [initialBalance, setInitialBalance] = useState<string>("");

  // Al cambiar el modo (UX): limpiar el contrario
  const changeMode = (next: SubjectMode) => {
    setSubjectMode(next);
    if (next === "client") {
      setOperatorId(0);
    } else {
      setClientId(null);
    }
  };

  // Moneda inicial si no vino una válida
  useEffect(() => {
    if (!visible) return;
    if (initialCurrency) return; // respetar la inicial
    if (!enabledCurrencies.length) return;
    if (!currency || !enabledCodes.has(currency)) {
      setCurrency(enabledCurrencies[0].code);
    }
  }, [visible, initialCurrency, enabledCurrencies, enabledCodes, currency]);

  // ====== Validación mínima
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Ingresá un nombre para la cuenta.";
    if (!currency) e.currency = "Elegí una moneda.";

    if (subjectMode === "client" && !clientId) {
      e.subject = "Seleccioná un pax.";
    }
    if (subjectMode === "operator" && !(operatorId > 0)) {
      e.subject = "Seleccioná un operador.";
    }

    if (initialBalance.trim()) {
      const n = Number(initialBalance);
      if (!Number.isFinite(n)) {
        e.initial_balance = "El balance inicial debe ser un número válido.";
      }
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ====== Submit
  const [submitting, setSubmitting] = useState(false);

  const onLocalSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const payload: CreateCreditAccountPayload = {
      client_id: subjectMode === "client" ? (clientId ?? null) : null,
      id_operator:
        subjectMode === "operator"
          ? operatorId > 0
            ? operatorId
            : null
          : null,
      name: name.trim(),
      currency,
      status,
      initial_balance: initialBalance.trim() || undefined,
    };

    setSubmitting(true);
    try {
      await Promise.resolve(onSubmit(payload));
      setVisible(false);
    } finally {
      setSubmitting(false);
    }
  };

  // ====== Header pills
  const HeaderPills = useMemo(() => {
    const pills: React.ReactNode[] = [];
    pills.push(
      <span key="mode" className={`${pillBase} ${pillNeutral}`}>
        {editingAccountId ? "Editar" : "Crear"} cuenta
      </span>,
    );
    if (currency) {
      pills.push(
        <span key="cur" className={`${pillBase} ${pillOk}`}>
          {currency}
        </span>,
      );
    }
    pills.push(
      <span key="st" className={`${pillBase} ${pillNeutral}`}>
        {status === "ACTIVE"
          ? "Activa"
          : status === "PAUSED"
            ? "Pausada"
            : "Cerrada"}
      </span>,
    );
    if (subjectMode === "client" && clientId) {
      pills.push(
        <span key="cli" className={`${pillBase} ${pillOk}`}>
          Pax seleccionado
        </span>,
      );
    } else if (subjectMode === "operator" && operatorId > 0) {
      pills.push(
        <span key="op" className={`${pillBase} ${pillOk}`}>
          Operador seleccionado
        </span>,
      );
    }
    return pills;
  }, [editingAccountId, currency, status, subjectMode, clientId, operatorId]);

  const SUBJECT_LABELS: Record<SubjectMode, string> = {
    client: "Pax",
    operator: "Operador",
  };

  return (
    <motion.div
      layout
      initial={{ maxHeight: 96, opacity: 1 }}
      animate={{
        maxHeight: visible ? 980 : 96,
        opacity: 1,
        transition: { duration: 0.35, ease: "easeInOut" },
      }}
      id="credit-account-form"
      className="mb-6 overflow-auto rounded-3xl border border-white/10 bg-white/10 text-sky-950 shadow-md shadow-sky-950/10 dark:text-white"
    >
      {/* HEADER */}
      <div
        className={`sticky top-0 z-10 ${visible ? "rounded-t-3xl border-b" : ""} border-white/10 px-4 py-3 backdrop-blur-sm`}
      >
        <button
          type="button"
          onClick={toggleVisible}
          className="flex w-full items-center justify-between text-left"
          aria-expanded={visible}
          aria-controls="credit-account-form-body"
        >
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-full bg-sky-100 text-sky-950 shadow-sm shadow-sky-950/20 dark:bg-white/10 dark:text-white">
              {visible ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="size-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 12h14"
                  />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="size-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4.5v15m7.5-7.5h-15"
                  />
                </svg>
              )}
            </div>
            <div>
              <p className="text-lg font-semibold">
                {editingAccountId
                  ? "Editar Cuenta de Crédito"
                  : "Crear Cuenta de Crédito"}
              </p>
              <p className="text-xs text-sky-950/70 dark:text-white/70">
                Elegí si la enlazás a un <b>pax</b> o a un <b>operador</b> y
                completá los datos.
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-2 md:flex">{HeaderPills}</div>
        </button>
      </div>

      {/* BODY */}
      <AnimatePresence initial={false}>
        {visible && (
          <motion.div
            key="body"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative"
          >
            <motion.form
              id="credit-account-form-body"
              onSubmit={onLocalSubmit}
              className="space-y-5 px-4 pb-6 pt-4 md:px-6"
            >
              {/* TITULAR / OPERADOR */}
              <Section
                title="Titular"
                desc="Elegí si la cuenta pertenece a un Pax o a un Operador (mutuamente excluyentes)."
              >
                {/* Selector UX: Client / Operator */}
                <div className="md:col-span-2">
                  <div className="inline-flex rounded-full border border-sky-900/10 bg-white/60 p-1 text-sm shadow-inner shadow-sky-950/10 dark:border-white/10 dark:bg-white/10">
                    {(["client", "operator"] as SubjectMode[]).map((key) => {
                      const active = subjectMode === key;
                      const activeCls =
                        key === "operator"
                          ? "bg-violet-100 text-violet-900 shadow-sm shadow-violet-900/20 ring-1 ring-violet-400/40 dark:bg-violet-500/15 dark:text-violet-200"
                          : "bg-sky-100 text-sky-950 shadow-sm shadow-sky-950/20 ring-1 ring-sky-400/40 dark:bg-sky-500/15 dark:text-sky-100";
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => changeMode(key)}
                          className={[
                            "whitespace-nowrap rounded-full px-3 py-1.5 font-medium transition-all",
                            active
                              ? activeCls
                              : "text-sky-950/70 dark:text-white/70",
                          ].join(" ")}
                          aria-pressed={active}
                        >
                          {SUBJECT_LABELS[key]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Pax */}
                {subjectMode === "client" && (
                  <div className="md:col-span-2">
                    <ClientPicker
                      token={token}
                      label="Pax"
                      placeholder="Buscar por ID, DNI, Pasaporte, CUIT o nombre..."
                      valueId={clientId}
                      excludeIds={[]}
                      onSelect={(c: Client | null) =>
                        setClientId(c ? c.id_client : null)
                      }
                      onClear={() => setClientId(null)}
                    />
                    <p className="ml-1 mt-1 text-xs text-sky-950/70 dark:text-white/60">
                      Obligatorio en modo <b>Pax</b>.
                    </p>
                    {errors.subject && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-500/90">
                        {errors.subject}
                      </p>
                    )}
                  </div>
                )}

                {/* Operador */}
                {subjectMode === "operator" && (
                  <Field
                    id="id_operator"
                    label="Operador"
                    hint="Obligatorio en modo Operador."
                  >
                    <select
                      id="id_operator"
                      value={operatorId || 0}
                      onChange={(e) =>
                        setOperatorId(Number(e.target.value) || 0)
                      }
                      className={`${inputBase} cursor-pointer appearance-none`}
                      disabled={operators.length === 0}
                    >
                      <option value={0}>
                        {operators.length
                          ? "Seleccioná un operador"
                          : "Sin operadores"}
                      </option>
                      {operators.map((op) => (
                        <option key={op.id_operator} value={op.id_operator}>
                          {op.name}
                        </option>
                      ))}
                    </select>
                    {errors.subject && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-500/90">
                        {errors.subject}
                      </p>
                    )}
                  </Field>
                )}

                {/* Nombre + Estado (siempre visibles) */}
                <Field id="name" label="Nombre de la cuenta" required>
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej.: Cuenta Corriente Juan Pérez"
                    className={inputBase}
                    aria-describedby="name-hint"
                  />
                  {errors.name && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-500/90">
                      {errors.name}
                    </p>
                  )}
                </Field>

                <Field
                  id="status"
                  label="Estado"
                  hint="Podés pausar/cerrar la cuenta sin borrarla."
                >
                  <select
                    id="status"
                    value={status}
                    onChange={(e) =>
                      setStatus(
                        e.target.value as "ACTIVE" | "PAUSED" | "CLOSED",
                      )
                    }
                    className={`${inputBase} cursor-pointer appearance-none`}
                  >
                    <option value="ACTIVE">Activa</option>
                    <option value="PAUSED">Pausada</option>
                    <option value="CLOSED">Cerrada</option>
                  </select>
                </Field>
              </Section>

              {/* PARÁMETROS (moneda + balance inicial) */}
              <Section
                title="Parámetros"
                desc="Configurá la moneda y, opcionalmente, un balance inicial para la cuenta."
              >
                <Field id="currency" label="Moneda" required>
                  {loadingCurrencies ? (
                    <div className="flex h-[42px] items-center">
                      <Spinner />
                    </div>
                  ) : (
                    <select
                      id="currency"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className={`${inputBase} cursor-pointer appearance-none`}
                      disabled={enabledCurrencies.length === 0}
                    >
                      <option value="" disabled>
                        {enabledCurrencies.length
                          ? "Seleccionar moneda"
                          : "Sin monedas habilitadas"}
                      </option>
                      {enabledCurrencies.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code} {c.name ? `— ${c.name}` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                  {errors.currency && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-500/90">
                      {errors.currency}
                    </p>
                  )}
                </Field>

                <Field
                  id="initial_balance"
                  label="Balance inicial"
                  hint="Opcional. Podés cargar un saldo a favor (+) o en contra (−)."
                >
                  <input
                    id="initial_balance"
                    type="number"
                    step="0.01"
                    value={initialBalance}
                    onChange={(e) => setInitialBalance(e.target.value)}
                    placeholder="0.00"
                    className={inputBase}
                  />
                  {errors.initial_balance && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-500/90">
                      {errors.initial_balance}
                    </p>
                  )}
                </Field>
              </Section>

              {/* ACTION BAR */}
              <div className="sticky bottom-2 z-10 flex justify-end gap-3">
                {onCancel && (
                  <button
                    type="button"
                    onClick={onCancel}
                    className="rounded-full bg-sky-950/10 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition active:scale-[0.98] dark:bg-white/10 dark:text-white"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  aria-busy={submitting}
                  className={`rounded-full px-6 py-2 shadow-sm shadow-sky-950/20 transition active:scale-[0.98] ${
                    submitting
                      ? "cursor-not-allowed bg-sky-950/20 text-white/60 dark:bg-white/5 dark:text-white/40"
                      : "bg-sky-100 text-sky-950 dark:bg-white/10 dark:text-white"
                  }`}
                  aria-label={
                    editingAccountId
                      ? "Guardar cambios"
                      : "Crear cuenta de crédito"
                  }
                >
                  {submitting ? (
                    <Spinner />
                  ) : editingAccountId ? (
                    "Guardar Cambios"
                  ) : (
                    "Crear Cuenta"
                  )}
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
