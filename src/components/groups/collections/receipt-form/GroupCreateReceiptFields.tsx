// src/components/groups/collections/receipt-form/GroupCreateReceiptFields.tsx
"use client";

import React from "react";
import ClientPicker from "@/components/clients/ClientPicker";
import OperatorPicker from "@/components/operators/OperatorPicker";
import type {
  CurrencyCode,
  FinanceAccount,
  FinanceCurrency,
  FinancePaymentMethod,
  ReceiptPaymentFeeMode,
} from "@/types/receipts";
import type { Client } from "@/types";
import Spinner from "@/components/Spinner";
import { parseAmountInput } from "@/utils/receipts/receiptForm";
import { formatMoneyInput, shouldPreferDotDecimal } from "@/utils/moneyInput";
import { RECEIPT_ADJUSTMENT_LABELS } from "@/utils/receipts/paymentAdjustments";
import { Field, Section, inputBase } from "./primitives";

type CreditAccountOption = {
  id_credit_account: number;
  name: string;
  currency?: string;
  enabled?: boolean;
  operator_id?: number;
};

type PaymentDraft = {
  key: string;
  amount: string;
  payment_method_id: number | null;
  account_id: number | null;
  payment_currency: string;
  fee_mode: "NONE" | ReceiptPaymentFeeMode;
  fee_value: string;
  fee_label: string;

  operator_id: number | null;
  credit_account_id: number | null;
};

type ManualPdfItemDraft = {
  key: string;
  description: string;
  date_label: string;
};

type IconProps = React.SVGProps<SVGSVGElement>;

const sanitizePercentInput = (raw: string): string => {
  const cleaned = String(raw || "").replace(/[^\d.,]/g, "");
  if (!cleaned) return "";

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const sepIndex = Math.max(lastComma, lastDot);
  if (sepIndex < 0) {
    return cleaned.replace(/[^\d]/g, "");
  }

  const intPart = cleaned.slice(0, sepIndex).replace(/[^\d]/g, "") || "0";
  const decPart = cleaned.slice(sepIndex + 1).replace(/[^\d]/g, "").slice(0, 2);
  return decPart ? `${intPart},${decPart}` : intPart;
};

export default function GroupCreateReceiptFields(props: {
  token: string | null;

  creditMethodId: number;
  issueDate: string;
  setIssueDate: (v: string) => void;

  clientsCount: number;
  clientIds: (number | null)[];
  lockClientSelection?: boolean;
  lockedClientLabel?: string | null;
  onIncClient: () => void;
  onDecClient: () => void;
  setClientAt: (index: number, client: Client | null) => void;
  excludeForIndex: (idx: number) => number[];

  amountReceived: string;
  feeAmount: string;
  clientTotal: string;

  lockedCurrency: string | null;
  loadingPicks: boolean;

  currencies: FinanceCurrency[];
  effectiveCurrency: CurrencyCode;
  currencyOverride: boolean;
  conversionEnabled?: boolean;
  setConversionEnabled?: (next: boolean) => void;

  suggestions: {
    base: number | null;
    fee: number | null;
    total: number | null;
  } | null;
  applySuggestedAmounts: () => void;
  formatNum: (n: number, cur?: string) => string;

  amountWords: string;
  setAmountWords: (v: string) => void;

  paymentMethods: FinancePaymentMethod[];
  accounts: FinanceAccount[];
  getFilteredAccountsByCurrency: (currencyCode: string) => FinanceAccount[];
  hasMixedPaymentCurrencies: boolean;

  paymentLines: PaymentDraft[];
  addPaymentLine: () => void;
  removePaymentLine: (key: string) => void;
  setPaymentLineAmount: (key: string, v: string) => void;
  setPaymentLineMethod: (key: string, methodId: number | null) => void;
  setPaymentLineAccount: (key: string, accountId: number | null) => void;
  setPaymentLineCurrency: (key: string, currencyCode: string) => void;
  setPaymentLineFeeMode: (
    key: string,
    mode: "NONE" | ReceiptPaymentFeeMode,
  ) => void;
  setPaymentLineFeeValue: (key: string, value: string) => void;
  setPaymentLineFeeLabel: (key: string, value: string) => void;
  getPaymentLineFee: (key: string) => number;
  getPaymentLineImpact: (key: string) => number;

  setPaymentLineOperator: (key: string, operatorId: number | null) => void;
  setPaymentLineCreditAccount: (
    key: string,
    creditAccountId: number | null,
  ) => void;
  creditAccountsByOperator: Record<number, CreditAccountOption[]>;
  loadingCreditAccountsByOperator: Record<number, boolean>;

  operators: { id_operator: number; name: string }[];

  paymentDescription: string;
  setPaymentDescription: (v: string) => void;
  manualPdfItemsEnabled?: boolean;
  setManualPdfItemsEnabled?: (next: boolean) => void;
  manualPdfItems?: ManualPdfItemDraft[];
  manualPdfFreeText?: string;
  addManualPdfItem?: () => void;
  removeManualPdfItem?: (key: string) => void;
  setManualPdfItemDescription?: (key: string, value: string) => void;
  setManualPdfItemDateLabel?: (key: string, value: string) => void;
  setManualPdfFreeText?: (value: string) => void;

  concept: string;
  setConcept: (v: string) => void;

  baseAmount: string;
  setBaseAmount: (v: string) => void;
  baseCurrency: string;
  setBaseCurrency: (v: string) => void;

  counterAmount: string;
  setCounterAmount: (v: string) => void;
  counterCurrency: string;
  setCounterCurrency: (v: string) => void;

  errors: Record<string, string>;
}) {
  const {
    token,
    creditMethodId,
    issueDate,
    setIssueDate,

    clientsCount,
    clientIds,
    lockClientSelection = false,
    lockedClientLabel,
    onIncClient,
    onDecClient,
    setClientAt,
    excludeForIndex,

    amountReceived,

    lockedCurrency,
    loadingPicks,

    currencies,
    effectiveCurrency,
    currencyOverride,
    conversionEnabled = currencyOverride,
    setConversionEnabled = () => {},

    formatNum,

    amountWords,
    setAmountWords,

    paymentMethods,
    getFilteredAccountsByCurrency,
    hasMixedPaymentCurrencies,

    paymentLines,
    addPaymentLine,
    removePaymentLine,
    setPaymentLineAmount,
    setPaymentLineMethod,
    setPaymentLineAccount,
    setPaymentLineCurrency,
    setPaymentLineFeeMode,
    setPaymentLineFeeValue,
    setPaymentLineFeeLabel,
    getPaymentLineFee,
    getPaymentLineImpact,

    setPaymentLineOperator,
    setPaymentLineCreditAccount,
    creditAccountsByOperator,
    loadingCreditAccountsByOperator,

    operators,

    paymentDescription,
    setPaymentDescription,
    manualPdfItemsEnabled = false,
    setManualPdfItemsEnabled = () => {},
    manualPdfItems = [],
    manualPdfFreeText = "",
    addManualPdfItem = () => {},
    removeManualPdfItem = () => {},
    setManualPdfItemDescription = () => {},
    setManualPdfItemDateLabel = () => {},
    setManualPdfFreeText = () => {},

    concept,
    setConcept,

    baseAmount,
    setBaseAmount,
    baseCurrency,
    setBaseCurrency,

    counterAmount,
    setCounterAmount,
    counterCurrency,
    setCounterCurrency,

    errors,
  } = props;

  const baseNum = parseAmountInput(baseAmount);
  const counterNum = parseAmountInput(counterAmount);

  const fmtMaybe = (raw: string, num: number | null, cur: string | null) => {
    if (num != null && cur) return formatNum(num, cur);
    if (raw && cur) return `${raw} ${cur}`;
    return "—";
  };

  return (
    <>
      <Section
        title={lockClientSelection ? "Pasajero y fecha" : "Pasajeros y fecha"}
        desc={
          lockClientSelection
            ? "El recibo se emite sobre el pasajero activo seleccionado en la grupal."
            : "Podés adjudicar el recibo a uno o varios pasajeros (opcional)."
        }
      >
        <div className="space-y-3">
          {lockClientSelection ? (
            <div className="rounded-2xl border border-emerald-300/70 bg-emerald-50/35 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-500/70 dark:bg-emerald-900/20 dark:text-emerald-100">
              <span className="font-semibold">
                {lockedClientLabel || "Pasajero activo"}
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 pl-1">
                <button
                  type="button"
                  onClick={onDecClient}
                  className="rounded-full border border-sky-300/80 bg-sky-100/80 px-2 py-1 text-[13px] font-semibold text-sky-900 shadow-sm shadow-sky-100/60 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 dark:border-sky-700 dark:bg-sky-900/25 dark:text-sky-100 md:text-sm"
                  disabled={clientsCount <= 1}
                >
                  −
                </button>
                <span className="rounded-full border border-sky-200/70 bg-sky-50/45 px-3 py-1 text-[13px] font-medium text-slate-700 dark:border-sky-900/40 dark:bg-slate-900/55 dark:text-slate-200 md:text-sm">
                  {clientsCount}
                </span>
                <button
                  type="button"
                  onClick={onIncClient}
                  className="rounded-full border border-sky-300/80 bg-sky-100/80 px-2 py-1 text-[13px] font-semibold text-sky-900 shadow-sm shadow-sky-100/60 transition active:scale-[0.98] dark:border-sky-700 dark:bg-sky-900/25 dark:text-sky-100 md:text-sm"
                >
                  +
                </button>
              </div>

              <div className="space-y-3">
                {Array.from({ length: clientsCount }).map((_, idx) => (
                  <div key={idx} className="pl-1">
                    <ClientPicker
                      token={token}
                      label={`Pax ${idx + 1}`}
                      placeholder="Buscar por Nº interno, DNI, Pasaporte, CUIT o nombre..."
                      valueId={clientIds[idx] ?? null}
                      excludeIds={excludeForIndex(idx)}
                      onSelect={(c) => setClientAt(idx, c)}
                      onClear={() => setClientAt(idx, null)}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="md:w-full md:max-w-[260px] md:justify-self-end">
          <Field id="issue_date" label="Fecha" required>
            <input
              id="issue_date"
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className={`${inputBase} cursor-pointer`}
              required
            />
            {errors.issue_date && (
              <p className="mt-1 text-xs text-red-600">{errors.issue_date}</p>
            )}
          </Field>
        </div>
      </Section>

      <Section
        title="Pagos"
        desc="Por cada método cargá importe, cuenta, moneda y ajustes."
      >
        <div className="space-y-3 md:col-span-2">
          {errors.payments && (
            <p className="text-xs text-red-600">{errors.payments}</p>
          )}
          {errors.amount && (
            <p className="text-xs text-red-600">{errors.amount}</p>
          )}

          {paymentLines.map((line, idx) => {
            const method = paymentMethods.find(
              (m) => m.id_method === line.payment_method_id,
            );

            const isCredit =
              line.payment_method_id != null &&
              Number(line.payment_method_id) === Number(creditMethodId);

            const requiresAcc = !!method?.requires_account;

            const creditAccounts =
              line.operator_id != null
                ? creditAccountsByOperator[line.operator_id] || []
                : [];
            const loadingCredit =
              line.operator_id != null
                ? !!loadingCreditAccountsByOperator[line.operator_id]
                : false;
            const filteredAccountsForLine = getFilteredAccountsByCurrency(
              line.payment_currency || effectiveCurrency,
            );
            const lineCurrencyForCredit = (
              line.payment_currency || effectiveCurrency
            ).toUpperCase();

            const selectedCreditAccount = creditAccounts.find(
              (a) => a.id_credit_account === line.credit_account_id,
            );
            const fallbackCreditAccount =
              selectedCreditAccount ??
              (creditAccounts.length === 1 ? creditAccounts[0] : null);

            return (
              <div
                key={line.key}
                className="rounded-2xl border border-sky-200/70 bg-sky-50/45 p-4 dark:border-sky-900/40 dark:bg-slate-900/55"
              >
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Pago Nº {idx + 1}
                  </p>
                  <button
                    type="button"
                    onClick={() => removePaymentLine(line.key)}
                    className="rounded-full border border-slate-300/80 bg-white/85 px-3 py-1 text-xs text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800/70"
                    title="Quitar línea"
                  >
                    Quitar
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end">
                  <div className="md:col-span-4">
                    <label className="ml-1 block text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                      Importe
                    </label>
                    <input
                      value={line.amount}
                      onChange={(e) => {
                        const nextValue = formatMoneyInput(
                          e.target.value,
                          line.payment_currency || effectiveCurrency,
                          { preferDotDecimal: shouldPreferDotDecimal(e) },
                        );
                        setPaymentLineAmount(line.key, nextValue);
                      }}
                      placeholder={formatNum(
                        0,
                        line.payment_currency || effectiveCurrency,
                      )}
                      className={inputBase}
                    />
                    {errors[`payment_amount_${idx}`] && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors[`payment_amount_${idx}`]}
                      </p>
                    )}
                  </div>

                  <div className="md:col-span-4">
                    <label className="ml-1 block text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                      Método
                    </label>
                    {loadingPicks ? (
                      <div className="flex h-[42px] items-center">
                        <Spinner />
                      </div>
                    ) : (
                      <select
                        value={line.payment_method_id ?? ""}
                        onChange={(e) =>
                          setPaymentLineMethod(
                            line.key,
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                        className={`${inputBase} cursor-pointer appearance-none`}
                      >
                        <option value="">— Elegir —</option>
                        {paymentMethods.map((m) => (
                          <option key={m.id_method} value={m.id_method}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {errors[`payment_method_${idx}`] && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors[`payment_method_${idx}`]}
                      </p>
                    )}
                  </div>

                  <div className="md:col-span-4">
                    {isCredit ? (
                      <div className="space-y-3">
                        <div>
                          <label className="ml-1 block text-sm font-medium text-slate-900 dark:text-slate-100">
                            Operador <span className="text-rose-600">*</span>
                          </label>
                          <OperatorPicker
                            inputId={`payment_operator_${idx}`}
                            operators={operators}
                            valueId={line.operator_id ?? null}
                            onSelect={(operator) =>
                              setPaymentLineOperator(line.key, operator.id_operator)
                            }
                            onClear={() =>
                              setPaymentLineOperator(line.key, null)
                            }
                            disabled={!operators.length}
                            placeholder={
                              operators.length
                                ? "Buscar operador por nombre o número..."
                                : "Sin operadores"
                            }
                          />
                          {errors[`payment_operator_${idx}`] && (
                            <p className="mt-1 text-xs text-red-600">
                              {errors[`payment_operator_${idx}`]}
                            </p>
                          )}
                        </div>

                        <div>
                          <label className="ml-1 block text-sm font-medium text-slate-900 dark:text-slate-100">
                            Cuenta crédito <span className="text-rose-600">*</span>
                          </label>

                          {loadingCredit ? (
                            <div className="flex h-[42px] items-center">
                              <Spinner />
                            </div>
                          ) : !line.operator_id ? (
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                              Elegí un operador para ver sus cuentas.
                            </p>
                          ) : creditAccounts.length === 0 ? (
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                              No hay cuentas crédito para este operador en{" "}
                              {lineCurrencyForCredit}.
                            </p>
                          ) : creditAccounts.length === 1 ? (
                            <div className="rounded-2xl border border-sky-200/70 bg-white/85 px-3 py-2 text-sm dark:border-sky-900/40 dark:bg-slate-900/60">
                              <div className="font-semibold">
                                {fallbackCreditAccount?.name}
                              </div>
                              <div className="text-xs text-slate-600 dark:text-slate-400">
                                Se impactará en esta cuenta crédito{" "}
                                {(
                                  fallbackCreditAccount?.currency ||
                                  lineCurrencyForCredit
                                )?.toUpperCase()}
                                .
                              </div>
                            </div>
                          ) : (
                            <select
                              className={`${inputBase} cursor-pointer appearance-none`}
                              value={line.credit_account_id ?? ""}
                              onChange={(e) =>
                                setPaymentLineCreditAccount(
                                  line.key,
                                  e.target.value
                                    ? Number(e.target.value)
                                    : null,
                                )
                              }
                              disabled={
                                !line.operator_id || creditAccounts.length === 0
                              }
                            >
                              <option value="">
                                {!line.operator_id
                                  ? "Elegí operador primero…"
                                  : creditAccounts.length
                                    ? "Seleccionar cuenta crédito…"
                                    : "No hay cuentas crédito"}
                              </option>
                              {creditAccounts.map((a) => (
                                <option
                                  key={a.id_credit_account}
                                  value={a.id_credit_account}
                                >
                                  {a.name}
                                </option>
                              ))}
                            </select>
                          )}

                          {errors[`payment_credit_account_${idx}`] && (
                            <p className="mt-1 text-xs text-red-600">
                              {errors[`payment_credit_account_${idx}`]}
                            </p>
                          )}
                        </div>
                      </div>
                    ) : requiresAcc ? (
                      <>
                        <label className="ml-1 block text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                          Cuenta
                        </label>
                        <select
                          className={`${inputBase} cursor-pointer appearance-none`}
                          value={line.account_id ?? ""}
                          onChange={(e) =>
                            setPaymentLineAccount(
                              line.key,
                              e.target.value ? Number(e.target.value) : null,
                            )
                          }
                        >
                          <option value="">— Elegir —</option>
                          {filteredAccountsForLine.map((a) => (
                            <option key={a.id_account} value={a.id_account}>
                              {a.display_name || a.name}
                            </option>
                          ))}
                        </select>
                        {errors[`payment_account_${idx}`] && (
                          <p className="mt-1 text-xs text-red-600">
                            {errors[`payment_account_${idx}`]}
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="text-sm text-slate-600 dark:text-slate-400 md:pt-7">
                        (No requiere cuenta)
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end">
                  <div className="md:col-span-3">
                    <label className="ml-1 block text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                      Moneda del cobro
                    </label>
                    {loadingPicks ? (
                      <div className="flex h-[42px] items-center">
                        <Spinner />
                      </div>
                    ) : (
                      <select
                        value={line.payment_currency || effectiveCurrency}
                        onChange={(e) =>
                          setPaymentLineCurrency(line.key, e.target.value)
                        }
                        className={`${inputBase} cursor-pointer appearance-none`}
                      >
                        {currencies
                          .filter((c) => c.enabled)
                          .map((c) => (
                            <option key={`${line.key}-${c.code}`} value={c.code}>
                              {c.code} {c.name ? `— ${c.name}` : ""}
                            </option>
                          ))}
                      </select>
                    )}
                    {errors[`payment_currency_${idx}`] && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors[`payment_currency_${idx}`]}
                      </p>
                    )}
                  </div>

                  <div className="md:col-span-3">
                    <label className="ml-1 block text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                      Ajuste del cobro
                    </label>
                    <select
                      value={line.fee_mode}
                      onChange={(e) =>
                        setPaymentLineFeeMode(
                          line.key,
                          e.target.value as "NONE" | ReceiptPaymentFeeMode,
                        )
                      }
                      className={`${inputBase} cursor-pointer appearance-none`}
                    >
                      <option value="NONE">Sin ajuste</option>
                      <option value="PERCENT">Porcentaje (%)</option>
                      <option value="FIXED">Monto fijo</option>
                    </select>
                  </div>

                  <div className="md:col-span-3">
                    <label className="ml-1 block text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                      Concepto
                    </label>
                    <select
                      value={line.fee_label}
                      onChange={(e) =>
                        setPaymentLineFeeLabel(line.key, e.target.value)
                      }
                      className={`${inputBase} cursor-pointer appearance-none`}
                      disabled={line.fee_mode === "NONE"}
                    >
                      {RECEIPT_ADJUSTMENT_LABELS.map((label) => (
                        <option key={label} value={label}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-3">
                    <label className="ml-1 block text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                      Valor del ajuste
                    </label>
                    <input
                      value={line.fee_value}
                      onChange={(e) => {
                        if (line.fee_mode === "PERCENT") {
                          setPaymentLineFeeValue(
                            line.key,
                            sanitizePercentInput(e.target.value),
                          );
                          return;
                        }
                        const nextValue = formatMoneyInput(
                          e.target.value,
                          line.payment_currency || effectiveCurrency,
                          { preferDotDecimal: shouldPreferDotDecimal(e) },
                        );
                        setPaymentLineFeeValue(line.key, nextValue);
                      }}
                      placeholder={line.fee_mode === "PERCENT" ? "Ej: 5" : "0,00"}
                      className={inputBase}
                      disabled={line.fee_mode === "NONE"}
                    />
                    {errors[`payment_fee_value_${idx}`] && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors[`payment_fee_value_${idx}`]}
                      </p>
                    )}
                  </div>

                  <div className="md:col-span-12">
                    <p className="ml-1 text-xs text-slate-600 dark:text-slate-400">
                      Impacta en deuda:{" "}
                      {formatNum(
                        getPaymentLineImpact(line.key),
                        line.payment_currency || effectiveCurrency,
                      )}
                      {line.fee_mode !== "NONE"
                        ? ` (Ajuste: ${formatNum(
                            getPaymentLineFee(line.key),
                            line.payment_currency || effectiveCurrency,
                          )})`
                        : ""}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={addPaymentLine}
              className="rounded-full border border-sky-300/80 bg-sky-100/80 px-4 py-2 text-[13px] font-medium text-sky-900 shadow-sm shadow-sky-100/60 transition hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-900/25 dark:text-sky-100 dark:hover:bg-sky-900/35 md:text-sm"
            >
              + Agregar método
            </button>
          </div>
        </div>
      </Section>

      <Section
        title="Conversión (opcional)"
        desc="Disponible siempre. Activala cuando quieras reflejar contravalor."
        headerRight={
          <button
            type="button"
            role="switch"
            aria-checked={conversionEnabled}
            onClick={() => setConversionEnabled(!conversionEnabled)}
            className={[
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
              conversionEnabled
                ? "bg-sky-500/70"
                : "bg-sky-950/20 dark:bg-white/20",
            ].join(" ")}
          >
            <span
              className={[
                "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
                conversionEnabled ? "translate-x-5" : "translate-x-1",
              ].join(" ")}
            />
          </button>
        }
      >
        {!conversionEnabled && currencyOverride && (
          <div className="rounded-2xl border border-sky-200/70 bg-sky-50/45 p-3 text-[11px] text-amber-700 dark:border-sky-900/40 dark:bg-slate-900/55 dark:text-amber-300 md:col-span-2">
            Advertencia: hay diferencia de moneda entre servicio y cobro. Podés
            seguir igual sin bloquear el guardado.
          </div>
        )}

        {conversionEnabled && (
          <>
            <div className="rounded-2xl border border-sky-200/70 bg-sky-50/45 p-4 text-xs text-slate-700 dark:border-sky-900/40 dark:bg-slate-900/55 dark:text-slate-300 md:col-span-2">
              <p>
                Servicio en {lockedCurrency || "moneda base"}.{" "}
                {hasMixedPaymentCurrencies
                  ? "Cobro en múltiples monedas."
                  : `Cobro en ${effectiveCurrency}.`}{" "}
                El PDF mostrará el valor base.
              </p>
              <div className="mt-2 grid gap-1 text-[11px]">
                <div>
                  <span className="font-medium">Recibo (PDF):</span>{" "}
                  {fmtMaybe(baseAmount, baseNum, baseCurrency || lockedCurrency)}
                </div>
                <div>
                  <span className="font-medium">
                    Administración (entra al banco/caja):
                  </span>{" "}
                  {amountReceived || "—"}
                </div>
                <div>
                  <span className="font-medium">Contravalor:</span>{" "}
                  {counterAmount.trim()
                    ? fmtMaybe(
                        counterAmount,
                        counterNum,
                        counterCurrency || effectiveCurrency,
                      )
                    : hasMixedPaymentCurrencies
                      ? "—"
                      : amountReceived || "—"}
                </div>
              </div>
              {hasMixedPaymentCurrencies && (
                <p className="mt-2 text-[10px] opacity-70">
                  Con cobro en múltiples monedas, cargá el contravalor
                  manualmente.
                </p>
              )}
            </div>

            <Field
              id="base"
              label="Valor base (moneda del servicio)"
              hint="Ej.: 1500 USD (si es pago parcial, ingresá el parcial)."
            >
              <div className="flex gap-2">
                <input
                  value={baseAmount}
                  onChange={(e) =>
                    setBaseAmount(
                      formatMoneyInput(
                        e.target.value,
                        baseCurrency || lockedCurrency || effectiveCurrency,
                        { preferDotDecimal: shouldPreferDotDecimal(e) },
                      ),
                    )
                  }
                  placeholder="1500"
                  className={inputBase}
                />
                <select
                  value={baseCurrency}
                  onChange={(e) => {
                    const nextCurrency = e.target.value;
                    setBaseCurrency(nextCurrency);
                    if (baseAmount.trim()) {
                      setBaseAmount(
                        formatMoneyInput(
                          baseAmount,
                          nextCurrency || lockedCurrency || effectiveCurrency,
                        ),
                      );
                    }
                  }}
                  className={`${inputBase} cursor-pointer appearance-none`}
                >
                  <option value="">Moneda</option>
                  {currencies
                    .filter((c) => c.enabled)
                    .map((c) => (
                      <option key={`bc-${c.code}`} value={c.code}>
                        {c.code}
                      </option>
                    ))}
                </select>
              </div>
              {errors.base && (
                <p className="mt-1 text-xs text-red-600">{errors.base}</p>
              )}
            </Field>

            <Field
              id="counter"
              label="Contravalor (moneda del cobro)"
              hint="Ej.: 2.000.000 ARS"
            >
              <div className="flex gap-2">
                <input
                  value={counterAmount}
                  onChange={(e) =>
                    setCounterAmount(
                      formatMoneyInput(
                        e.target.value,
                        counterCurrency || effectiveCurrency,
                        { preferDotDecimal: shouldPreferDotDecimal(e) },
                      ),
                    )
                  }
                  placeholder="2000000"
                  className={inputBase}
                />
                <select
                  value={counterCurrency}
                  onChange={(e) => {
                    const nextCurrency = e.target.value;
                    setCounterCurrency(nextCurrency);
                    if (counterAmount.trim()) {
                      setCounterAmount(
                        formatMoneyInput(
                          counterAmount,
                          nextCurrency || effectiveCurrency,
                        ),
                      );
                    }
                  }}
                  className={`${inputBase} cursor-pointer appearance-none`}
                >
                  <option value="">Moneda</option>
                  {currencies
                    .filter((c) => c.enabled)
                    .map((c) => (
                      <option key={`cc-${c.code}`} value={c.code}>
                        {c.code}
                      </option>
                    ))}
                </select>
              </div>
              {errors.counter && (
                <p className="mt-1 text-xs text-red-600">{errors.counter}</p>
              )}
            </Field>
          </>
        )}
      </Section>

      <Section
        title="Detalle para PDF"
        desc="Texto visible en el recibo. Si no escribís nada, se autogenera."
      >
        <div className="md:col-span-2">
          <Field id="amount_words" label="Equivalente en palabras" required>
            <input
              id="amount_words"
              value={amountWords}
              onChange={(e) => setAmountWords(e.target.value)}
              placeholder='Ej.: "UN MILLÓN CIEN MIL"'
              className={inputBase}
            />
            {errors.amountWords && (
              <p className="mt-1 text-xs text-red-600">{errors.amountWords}</p>
            )}
          </Field>

          <div className="mt-3">
            <Field
              id="payment_desc"
              label="Método de pago (detalle para el PDF)"
              required
            >
              <input
                id="payment_desc"
                value={paymentDescription}
                onChange={(e) => setPaymentDescription(e.target.value)}
                placeholder="Ej.: Efectivo: 100 USD + Transferencia: 200 USD"
                className={inputBase}
              />
              {errors.paymentDescription && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.paymentDescription}
                </p>
              )}
            </Field>
          </div>

          <div className="mt-3">
            <Field id="concept" label="Concepto">
              <input
                id="concept"
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                placeholder="Ej.: Pago parcial contexto Nº 1024"
                className={inputBase}
              />
            </Field>
          </div>
        </div>
      </Section>

      <Section
        title="Ítems del recibo"
        desc="Opcional: cargá manualmente las filas del detalle de servicios del PDF."
        headerRight={
          <button
            type="button"
            role="switch"
            aria-checked={manualPdfItemsEnabled}
            onClick={() => {
              const next = !manualPdfItemsEnabled;
              setManualPdfItemsEnabled(next);
              if (next && manualPdfItems.length === 0) {
                addManualPdfItem();
              }
            }}
            className={[
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
              manualPdfItemsEnabled
                ? "bg-sky-500/70"
                : "bg-sky-950/20 dark:bg-white/20",
            ].join(" ")}
          >
            <span
              className={[
                "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
                manualPdfItemsEnabled ? "translate-x-5" : "translate-x-1",
              ].join(" ")}
            />
          </button>
        }
      >
        <div className="rounded-2xl border border-sky-200/70 bg-sky-50/45 p-3 dark:border-sky-900/40 dark:bg-slate-900/55 md:col-span-2">
          {manualPdfItemsEnabled && (
            <div className="mt-3 space-y-2">
              {manualPdfItems.length === 0 && (
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Todavía no hay ítems manuales.
                </p>
              )}

              {manualPdfItems.map((item, idx) => (
                <div
                  key={item.key}
                  className="rounded-2xl border border-sky-200/70 bg-white/85 p-3 dark:border-sky-900/40 dark:bg-slate-900/60"
                >
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Ítem Nº {idx + 1}
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-12 md:items-end">
                    <div className="md:col-span-7">
                      <label className="ml-1 block text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                        Descripción
                      </label>
                      <input
                        value={item.description}
                        onChange={(e) =>
                          setManualPdfItemDescription(item.key, e.target.value)
                        }
                        placeholder="Ej.: Hotel + excursión ciudad"
                        className={inputBase}
                      />
                    </div>

                    <div className="md:col-span-4">
                      <label className="ml-1 block text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                        Fecha (opcional)
                      </label>
                      <input
                        value={item.date_label}
                        onChange={(e) =>
                          setManualPdfItemDateLabel(item.key, e.target.value)
                        }
                        placeholder="Ej.: 10/04/2026 - 14/04/2026"
                        className={inputBase}
                      />
                    </div>

                    <div className="md:col-span-1">
                      <button
                        type="button"
                        onClick={() => removeManualPdfItem(item.key)}
                        className="inline-flex size-10 items-center justify-center rounded-full border border-slate-300/80 bg-white/85 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800/70"
                        title="Quitar ítem"
                        aria-label={`Quitar ítem ${idx + 1}`}
                      >
                        <IconTrash className="size-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={addManualPdfItem}
                  className="rounded-full border border-sky-300/80 bg-sky-100/80 px-3 py-1.5 text-xs text-sky-900 shadow-sm shadow-sky-100/60 transition hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-900/25 dark:text-sky-100 dark:hover:bg-sky-900/35"
                >
                  + Agregar ítem
                </button>
              </div>

              <div className="pt-1">
                <label className="ml-1 block text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                  Texto libre debajo de la tabla (opcional)
                </label>
                <textarea
                  value={manualPdfFreeText}
                  onChange={(e) => setManualPdfFreeText(e.target.value)}
                  placeholder="Ej.: Los servicios sujetos a reconfirmación se informarán por correo."
                  className={`${inputBase} mt-1 min-h-[88px] resize-y`}
                />
              </div>
            </div>
          )}

          {errors.pdf_items && (
            <p className="mt-2 text-xs text-red-600">{errors.pdf_items}</p>
          )}
        </div>
      </Section>
    </>
  );
}

function IconTrash(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
      />
    </svg>
  );
}
