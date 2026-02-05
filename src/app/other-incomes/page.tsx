"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import { loadFinancePicks } from "@/utils/loadFinancePicks";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const PANEL =
  "rounded-3xl border border-white/10 bg-white/10 p-4 shadow-md shadow-sky-950/10 backdrop-blur dark:border-white/10 dark:bg-white/10";
const SUBPANEL =
  "rounded-2xl border border-white/15 bg-white/30 p-3 shadow-inner dark:bg-zinc-900/40";
const CHIP =
  "rounded-full border border-white/20 bg-white/40 px-3 py-1 text-xs text-zinc-700 shadow-sm dark:text-zinc-200";

const TAKE = 24;

const DEFAULT_FILTERS = {
  q: "",
  status: "ALL",
  currency: "",
  dateFrom: "",
  dateTo: "",
  paymentMethodId: "ALL",
  accountId: "ALL",
};

type PaymentLine = {
  amount: number;
  payment_method_id: number | null;
  account_id: number | null;
};

type OtherIncomeItem = {
  id_other_income: number;
  agency_other_income_id?: number | null;
  description: string;
  amount: number;
  currency: string;
  issue_date: string;
  payment_fee_amount?: number | string | null;
  verification_status?: string | null;
  payments?: PaymentLine[];
};

type ApiResponse = {
  items: OtherIncomeItem[];
  nextCursor: number | null;
};

type ReportCurrencyRow = {
  currency: string;
  amount: number;
  fees: number;
  count: number;
};

type ReportResponse = {
  totalCount: number;
  totalsByCurrency: ReportCurrencyRow[];
  totalsByPaymentMethod: { payment_method_id: number | null; amount: number }[];
  totalsByAccount: { account_id: number | null; amount: number }[];
};

type FinancePickBundle = {
  currencies: { code: string; name: string; enabled: boolean }[];
  accounts: { id_account: number; name: string; enabled: boolean }[];
  paymentMethods: {
    id_method: number;
    name: string;
    enabled: boolean;
    requires_account?: boolean | null;
  }[];
};

type PaymentFormLine = {
  amount: string;
  payment_method_id: string;
  account_id: string;
};

type ViewMode = "cards" | "table" | "monthly";

type GroupedMonth = {
  key: string;
  label: string;
  items: OtherIncomeItem[];
  totals: Record<string, number>;
};

const emptyLine = (): PaymentFormLine => ({
  amount: "",
  payment_method_id: "",
  account_id: "",
});

const toNumber = (v: string) => {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const normCurrency = (c?: string | null) =>
  String(c || "")
    .trim()
    .toUpperCase();

const fmtMoney = (v?: number | string | null, curr?: string | null) => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  const currency = normCurrency(curr) || "ARS";
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
    }).format(Number.isFinite(n) ? n : 0);
  } catch {
    return `${currency} ${Number.isFinite(n) ? n.toFixed(2) : "0.00"}`;
  }
};

const fmtDate = (iso?: string | null) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("es-AR");
};

const ymdToday = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

function toYmd(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const formatMonthLabel = (key: string) => {
  const [y, m] = key.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
  }).format(date);
};

export default function OtherIncomesPage() {
  const { token } = useAuth() as { token?: string | null };

  const [finance, setFinance] = useState<FinancePickBundle | null>(null);
  const [items, setItems] = useState<OtherIncomeItem[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
  const [appliedFilters, setAppliedFilters] = useState({ ...DEFAULT_FILTERS });
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("cards");

  const [form, setForm] = useState(() => ({
    description: "",
    currency: "ARS",
    issue_date: ymdToday(),
    payment_fee_amount: "",
    payments: [emptyLine()],
  }));

  const [editingItem, setEditingItem] = useState<OtherIncomeItem | null>(null);
  const [editForm, setEditForm] = useState(() => ({
    description: "",
    currency: "ARS",
    issue_date: ymdToday(),
    payment_fee_amount: "",
    payments: [emptyLine()],
  }));

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const picks = await loadFinancePicks(token);
        setFinance({
          currencies: picks.currencies.map((c) => ({
            code: c.code,
            name: c.name,
            enabled: c.enabled,
          })),
          accounts: picks.accounts.map((a) => ({
            id_account: a.id_account,
            name: a.name,
            enabled: a.enabled,
          })),
          paymentMethods: picks.paymentMethods.map((m) => ({
            id_method: m.id_method,
            name: m.name,
            enabled: m.enabled,
            requires_account: m.requires_account,
          })),
        });
      } catch {
        setFinance(null);
      }
    })();
  }, [token]);

  const accountMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const acc of finance?.accounts || []) {
      if (!acc.enabled) continue;
      map.set(acc.id_account, acc.name);
    }
    return map;
  }, [finance?.accounts]);

  const methodMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const method of finance?.paymentMethods || []) {
      if (!method.enabled) continue;
      map.set(method.id_method, method.name);
    }
    return map;
  }, [finance?.paymentMethods]);

  const currencyOptions = useMemo(() => {
    const enabled = finance?.currencies?.filter((c) => c.enabled) ?? [];
    if (enabled.length === 0) return ["ARS", "USD"];
    return enabled.map((c) => c.code);
  }, [finance?.currencies]);

  useEffect(() => {
    if (currencyOptions.length === 0) return;
    if (!currencyOptions.includes(form.currency)) {
      setForm((prev) => ({ ...prev, currency: currencyOptions[0] }));
    }
    if (!currencyOptions.includes(editForm.currency)) {
      setEditForm((prev) => ({ ...prev, currency: currencyOptions[0] }));
    }
  }, [currencyOptions, form.currency, editForm.currency]);

  const totalAmount = useMemo(() => {
    return form.payments.reduce((acc, line) => acc + toNumber(line.amount), 0);
  }, [form.payments]);

  const totalEditAmount = useMemo(() => {
    return editForm.payments.reduce(
      (acc, line) => acc + toNumber(line.amount),
      0,
    );
  }, [editForm.payments]);

  const reportCurrency = useMemo(() => {
    if (appliedFilters.currency) return normCurrency(appliedFilters.currency);
    const rows = report?.totalsByCurrency ?? [];
    if (rows.length === 1) return normCurrency(rows[0]?.currency);
    return null;
  }, [appliedFilters.currency, report?.totalsByCurrency]);

  const formatReportAmount = useCallback(
    (amount: number) => {
      if (reportCurrency) return fmtMoney(amount, reportCurrency);
      const safe = Number.isFinite(amount) ? amount : 0;
      return safe.toFixed(2);
    },
    [reportCurrency],
  );

  const buildQS = useCallback(
    (withCursor?: number | null) => {
      const qs = new URLSearchParams();
      if (appliedFilters.q.trim()) qs.set("q", appliedFilters.q.trim());
      if (appliedFilters.status !== "ALL")
        qs.set("status", appliedFilters.status);
      if (appliedFilters.currency.trim())
        qs.set("currency", appliedFilters.currency.trim());
      if (appliedFilters.dateFrom) qs.set("dateFrom", appliedFilters.dateFrom);
      if (appliedFilters.dateTo) qs.set("dateTo", appliedFilters.dateTo);
      if (appliedFilters.paymentMethodId !== "ALL")
        qs.set("payment_method_id", appliedFilters.paymentMethodId);
      if (appliedFilters.accountId !== "ALL")
        qs.set("account_id", appliedFilters.accountId);

      qs.set("take", String(TAKE));
      if (withCursor) qs.set("cursor", String(withCursor));
      return qs;
    },
    [appliedFilters],
  );

  const fetchItems = useCallback(
    async (resetList: boolean) => {
      if (!token) return;
      if (resetList) setLoading(true);
      else setLoadingMore(true);

      try {
        const qs = buildQS(resetList ? undefined : cursor);
        const res = await authFetch(
          `/api/other-incomes?${qs.toString()}`,
          { cache: "no-store" },
          token,
        );
        const json = (await res.json()) as ApiResponse & { error?: string };
        if (!res.ok) throw new Error(json?.error || "Error al cargar ingresos");

        setItems((prev) => (resetList ? json.items : [...prev, ...json.items]));
        setCursor(json.nextCursor ?? null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error al cargar ingresos";
        toast.error(msg);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [token, buildQS, cursor],
  );

  const fetchReport = useCallback(async () => {
    if (!token) return;
    setReportLoading(true);
    try {
      const qs = buildQS(null);
      const res = await authFetch(
        `/api/other-incomes/report?${qs.toString()}`,
        { cache: "no-store" },
        token,
      );
      const json = (await res.json()) as ReportResponse & { error?: string };
      if (!res.ok) throw new Error(json?.error || "Error al generar reporte");
      setReport(json);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al generar reporte";
      toast.error(msg);
      setReport(null);
    } finally {
      setReportLoading(false);
    }
  }, [token, buildQS]);

  useEffect(() => {
    setCursor(null);
    setItems([]);
    fetchItems(true);
    fetchReport();
  }, [appliedFilters, fetchItems, fetchReport]);

  const refreshList = () => {
    setCursor(null);
    setItems([]);
    fetchItems(true);
  };

  const applyFilters = () => {
    setAppliedFilters({ ...filters });
  };

  const clearFilters = () => {
    setFilters({ ...DEFAULT_FILTERS });
    setAppliedFilters({ ...DEFAULT_FILTERS });
  };

  const updateLine = (index: number, patch: Partial<PaymentFormLine>) => {
    setForm((prev) => {
      const next = [...prev.payments];
      next[index] = { ...next[index], ...patch };
      return { ...prev, payments: next };
    });
  };

  const updateEditLine = (index: number, patch: Partial<PaymentFormLine>) => {
    setEditForm((prev) => {
      const next = [...prev.payments];
      next[index] = { ...next[index], ...patch };
      return { ...prev, payments: next };
    });
  };

  const addLine = () => {
    setForm((prev) => ({ ...prev, payments: [...prev.payments, emptyLine()] }));
  };

  const addEditLine = () => {
    setEditForm((prev) => ({
      ...prev,
      payments: [...prev.payments, emptyLine()],
    }));
  };

  const removeLine = (index: number) => {
    setForm((prev) => {
      const next = prev.payments.filter((_, i) => i !== index);
      return { ...prev, payments: next.length ? next : [emptyLine()] };
    });
  };

  const removeEditLine = (index: number) => {
    setEditForm((prev) => {
      const next = prev.payments.filter((_, i) => i !== index);
      return { ...prev, payments: next.length ? next : [emptyLine()] };
    });
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!token) return;

    if (!form.description.trim()) {
      toast.error("La descripción es obligatoria.");
      return;
    }

    const normalizedPayments = form.payments
      .map((line) => ({
        amount: toNumber(line.amount),
        payment_method_id: Number(line.payment_method_id),
        account_id: line.account_id ? Number(line.account_id) : undefined,
      }))
      .filter(
        (p) =>
          Number.isFinite(p.amount) &&
          p.amount > 0 &&
          Number.isFinite(p.payment_method_id) &&
          p.payment_method_id > 0,
      );

    if (normalizedPayments.length === 0) {
      toast.error("Agregá al menos una línea de pago válida.");
      return;
    }

    const payload = {
      description: form.description.trim(),
      currency: form.currency,
      issue_date: form.issue_date,
      payment_fee_amount: form.payment_fee_amount || undefined,
      amount: totalAmount,
      payments: normalizedPayments,
    };

    try {
      const res = await authFetch(
        "/api/other-incomes",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        token,
      );
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err?.error || "Error creando el ingreso");
      }
      const data = (await res.json()) as { item?: OtherIncomeItem | null };
      if (data?.item) {
        setItems((prev) => [data.item!, ...prev]);
      }
      setForm({
        description: "",
        currency: form.currency,
        issue_date: ymdToday(),
        payment_fee_amount: "",
        payments: [emptyLine()],
      });
      fetchReport();
      toast.success("Ingreso creado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error creando el ingreso.");
    }
  };

  const openEdit = (item: OtherIncomeItem) => {
    if (item.verification_status === "VERIFIED") {
      toast.error("Desverificá el ingreso antes de editarlo.");
      return;
    }

    const payments =
      Array.isArray(item.payments) && item.payments.length > 0
        ? item.payments
        : [];

    setEditForm({
      description: item.description || "",
      currency: item.currency || "ARS",
      issue_date: toYmd(item.issue_date) || ymdToday(),
      payment_fee_amount:
        item.payment_fee_amount != null ? String(item.payment_fee_amount) : "",
      payments:
        payments.length > 0
          ? payments.map((p) => ({
              amount: String(p.amount ?? ""),
              payment_method_id: String(p.payment_method_id ?? ""),
              account_id: p.account_id ? String(p.account_id) : "",
            }))
          : [emptyLine()],
    });
    setEditingItem(item);
  };

  const handleEditSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!token || !editingItem) return;

    if (!editForm.description.trim()) {
      toast.error("La descripción es obligatoria.");
      return;
    }

    const normalizedPayments = editForm.payments
      .map((line) => ({
        amount: toNumber(line.amount),
        payment_method_id: Number(line.payment_method_id),
        account_id: line.account_id ? Number(line.account_id) : undefined,
      }))
      .filter(
        (p) =>
          Number.isFinite(p.amount) &&
          p.amount > 0 &&
          Number.isFinite(p.payment_method_id) &&
          p.payment_method_id > 0,
      );

    if (normalizedPayments.length === 0) {
      toast.error("Agregá al menos una línea de pago válida.");
      return;
    }

    const payload = {
      description: editForm.description.trim(),
      currency: editForm.currency,
      issue_date: editForm.issue_date,
      payment_fee_amount:
        editForm.payment_fee_amount !== "" ? editForm.payment_fee_amount : null,
      amount: totalEditAmount,
      payments: normalizedPayments,
    };

    try {
      const res = await authFetch(
        `/api/other-incomes/${editingItem.id_other_income}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        token,
      );
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err?.error || "Error actualizando el ingreso");
      }
      const data = (await res.json()) as { item?: OtherIncomeItem | null };
      if (data?.item) {
        setItems((prev) =>
          prev.map((it) =>
            it.id_other_income === data.item?.id_other_income ? data.item : it,
          ),
        );
      }
      setEditingItem(null);
      fetchReport();
      toast.success("Ingreso actualizado.");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Error actualizando el ingreso.",
      );
    }
  };

  const handleDelete = async (item: OtherIncomeItem) => {
    if (!token) return;
    if (item.verification_status === "VERIFIED") {
      toast.error("Desverificá el ingreso antes de eliminarlo.");
      return;
    }
    if (!window.confirm("¿Eliminar este ingreso?")) return;

    try {
      const res = await authFetch(
        `/api/other-incomes/${item.id_other_income}`,
        { method: "DELETE" },
        token,
      );
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err?.error || "Error eliminando el ingreso");
      }
      setItems((prev) =>
        prev.filter((it) => it.id_other_income !== item.id_other_income),
      );
      fetchReport();
      toast.success("Ingreso eliminado.");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Error eliminando el ingreso.",
      );
    }
  };

  const downloadCSV = async () => {
    if (!token) return;
    try {
      const headers = [
        "Fecha",
        "N°",
        "Descripción",
        "Moneda",
        "Monto",
        "Fee",
        "Estado",
        "Pagos",
      ].join(";");

      let next: number | null = null;
      const rows: string[] = [];

      for (let i = 0; i < 300; i++) {
        const qs = buildQS(next);
        const res = await authFetch(
          `/api/other-incomes?${qs.toString()}`,
          { cache: "no-store" },
          token,
        );
        const json = (await res.json()) as ApiResponse & { error?: string };
        if (!res.ok) throw new Error(json?.error || "Error al exportar CSV");

        for (const row of json.items) {
          const payments = Array.isArray(row.payments) ? row.payments : [];
          const paymentsLabel = payments
            .map((p) => {
              const method =
                methodMap.get(p.payment_method_id ?? 0) || "Sin método";
              const account = p.account_id
                ? accountMap.get(p.account_id) || ""
                : "";
              const accountLabel = account ? ` (${account})` : "";
              return `${method}${accountLabel} ${fmtMoney(p.amount, row.currency)}`;
            })
            .join(" | ");

          const cells = [
            fmtDate(row.issue_date),
            String(row.agency_other_income_id ?? row.id_other_income),
            row.description,
            row.currency,
            fmtMoney(row.amount, row.currency),
            row.payment_fee_amount != null
              ? fmtMoney(row.payment_fee_amount, row.currency)
              : "",
            row.verification_status || "PENDING",
            paymentsLabel,
          ];
          rows.push(
            cells
              .map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`)
              .join(";"),
          );
        }

        next = json.nextCursor ?? null;
        if (next === null) break;
      }

      const csv = [headers, ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ingresos_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al descargar CSV";
      toast.error(msg);
    }
  };

  const activeFilters = useMemo(() => {
    const chips: { key: string; label: string }[] = [];
    const trimmedQ = appliedFilters.q.trim();
    if (trimmedQ) chips.push({ key: "q", label: `Búsqueda: \"${trimmedQ}\"` });
    if (appliedFilters.status !== "ALL") {
      chips.push({
        key: "status",
        label: `Estado: ${
          appliedFilters.status === "VERIFIED" ? "Verificado" : "Pendiente"
        }`,
      });
    }
    if (appliedFilters.currency) {
      chips.push({
        key: "currency",
        label: `Moneda: ${appliedFilters.currency}`,
      });
    }
    if (appliedFilters.dateFrom || appliedFilters.dateTo) {
      chips.push({
        key: "date",
        label: `Fecha: ${appliedFilters.dateFrom || "..."} → ${appliedFilters.dateTo || "..."}`,
      });
    }
    if (appliedFilters.paymentMethodId !== "ALL") {
      const label =
        methodMap.get(Number(appliedFilters.paymentMethodId)) ||
        `ID ${appliedFilters.paymentMethodId}`;
      chips.push({ key: "method", label: `Medio: ${label}` });
    }
    if (appliedFilters.accountId !== "ALL") {
      const label =
        accountMap.get(Number(appliedFilters.accountId)) ||
        `ID ${appliedFilters.accountId}`;
      chips.push({ key: "account", label: `Cuenta: ${label}` });
    }
    return chips;
  }, [appliedFilters, methodMap, accountMap]);

  const groupedByMonth = useMemo<GroupedMonth[]>(() => {
    if (items.length === 0) return [];
    const map = new Map<string, GroupedMonth>();
    for (const item of items) {
      const date = new Date(item.issue_date);
      if (Number.isNaN(date.getTime())) continue;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: formatMonthLabel(key),
          items: [],
          totals: {},
        });
      }
      const group = map.get(key);
      if (!group) continue;
      group.items.push(item);
      const cur = item.currency || "ARS";
      group.totals[cur] = (group.totals[cur] || 0) + Number(item.amount || 0);
    }
    return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [items]);

  const pillClass = (active: boolean) =>
    [
      "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
      active
        ? "border-sky-300/70 bg-sky-500/20 text-sky-900 dark:border-sky-300/40 dark:text-sky-100"
        : "border-white/20 bg-white/20 text-zinc-600 hover:bg-white/30 dark:text-zinc-200",
    ].join(" ");

  const pillSm = (active: boolean) =>
    [
      "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
      active
        ? "border-sky-300/70 bg-sky-500/20 text-sky-900 dark:border-sky-300/40 dark:text-sky-100"
        : "border-white/20 bg-white/20 text-zinc-600 hover:bg-white/30 dark:text-zinc-200",
    ].join(" ");

  return (
    <ProtectedRoute>
      <main className="min-h-screen text-zinc-900 dark:text-zinc-50">
        <ToastContainer position="top-right" autoClose={4000} />

        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">Ingresos</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-300">
                Ingresos no vinculados a reservas, con medios de cobro y
                verificación.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setFiltersOpen((prev) => !prev)}
                className="rounded-full border border-white/30 bg-white/20 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-white/30 dark:text-zinc-100"
              >
                {filtersOpen
                  ? "Ocultar filtros"
                  : `Filtros (${activeFilters.length})`}
              </button>
              <button
                type="button"
                onClick={downloadCSV}
                className="rounded-full border border-emerald-500/40 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-500/30 dark:text-emerald-100"
              >
                Exportar CSV
              </button>
              <button
                type="button"
                onClick={refreshList}
                className="rounded-full border border-white/30 bg-white/20 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-white/30 dark:text-zinc-100"
              >
                Actualizar
              </button>
            </div>
          </header>

          {activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {activeFilters.map((chip) => (
                <span key={chip.key} className={CHIP}>
                  {chip.label}
                </span>
              ))}
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-full border border-white/30 bg-white/20 px-3 py-1 text-xs text-zinc-600 hover:bg-white/30 dark:text-zinc-200"
              >
                Limpiar filtros
              </button>
            </div>
          )}

          {filtersOpen && (
            <section className={PANEL}>
              <div className="grid gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-2xl border border-white/20 bg-white/40 px-3 py-2 shadow-inner dark:bg-zinc-900/40">
                    <input
                      className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-500"
                      value={filters.q}
                      onChange={(e) =>
                        setFilters((prev) => ({ ...prev, q: e.target.value }))
                      }
                      placeholder="Descripción o número"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={applyFilters}
                    className="rounded-full border border-sky-500/40 bg-sky-500/20 px-4 py-2 text-sm font-semibold text-sky-800 transition hover:bg-sky-500/30 dark:text-sky-100"
                  >
                    Buscar
                  </button>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="rounded-full border border-white/30 bg-white/20 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-white/30 dark:text-zinc-100"
                  >
                    Limpiar
                  </button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className={SUBPANEL}>
                    <p className="text-xs font-semibold text-zinc-500">
                      Estado
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {["ALL", "PENDING", "VERIFIED"].map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() =>
                            setFilters((prev) => ({ ...prev, status }))
                          }
                          className={pillClass(filters.status === status)}
                        >
                          {status === "ALL"
                            ? "Todos"
                            : status === "VERIFIED"
                              ? "Verificados"
                              : "Pendientes"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={SUBPANEL}>
                    <p className="text-xs font-semibold text-zinc-500">
                      Moneda
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setFilters((prev) => ({ ...prev, currency: "" }))
                        }
                        className={pillClass(filters.currency === "")}
                      >
                        Todas
                      </button>
                      {currencyOptions.map((code) => (
                        <button
                          key={code}
                          type="button"
                          onClick={() =>
                            setFilters((prev) => ({ ...prev, currency: code }))
                          }
                          className={pillClass(filters.currency === code)}
                        >
                          {code}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={SUBPANEL}>
                    <p className="text-xs font-semibold text-zinc-500">
                      Medio de pago
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setFilters((prev) => ({
                            ...prev,
                            paymentMethodId: "ALL",
                          }))
                        }
                        className={pillClass(filters.paymentMethodId === "ALL")}
                      >
                        Todos
                      </button>
                      {(finance?.paymentMethods || [])
                        .filter((m) => m.enabled)
                        .map((m) => (
                          <button
                            key={m.id_method}
                            type="button"
                            onClick={() =>
                              setFilters((prev) => ({
                                ...prev,
                                paymentMethodId: String(m.id_method),
                              }))
                            }
                            className={pillClass(
                              filters.paymentMethodId === String(m.id_method),
                            )}
                          >
                            {m.name}
                          </button>
                        ))}
                    </div>
                  </div>

                  <div className={SUBPANEL}>
                    <p className="text-xs font-semibold text-zinc-500">
                      Cuenta
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setFilters((prev) => ({ ...prev, accountId: "ALL" }))
                        }
                        className={pillClass(filters.accountId === "ALL")}
                      >
                        Todas
                      </button>
                      {(finance?.accounts || [])
                        .filter((a) => a.enabled)
                        .map((a) => (
                          <button
                            key={a.id_account}
                            type="button"
                            onClick={() =>
                              setFilters((prev) => ({
                                ...prev,
                                accountId: String(a.id_account),
                              }))
                            }
                            className={pillClass(
                              filters.accountId === String(a.id_account),
                            )}
                          >
                            {a.name}
                          </button>
                        ))}
                    </div>
                  </div>

                  <div className={SUBPANEL}>
                    <p className="text-xs font-semibold text-zinc-500">
                      Rango de fechas
                    </p>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <label className="flex flex-col gap-1 text-xs">
                        Desde
                        <input
                          type="date"
                          className="rounded-xl border border-white/30 bg-white/60 px-3 py-2 text-sm shadow-inner outline-none dark:bg-zinc-900/50"
                          value={filters.dateFrom}
                          onChange={(e) =>
                            setFilters((prev) => ({
                              ...prev,
                              dateFrom: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs">
                        Hasta
                        <input
                          type="date"
                          className="rounded-xl border border-white/30 bg-white/60 px-3 py-2 text-sm shadow-inner outline-none dark:bg-zinc-900/50"
                          value={filters.dateTo}
                          onChange={(e) =>
                            setFilters((prev) => ({
                              ...prev,
                              dateTo: e.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          <section className={PANEL}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">Resumen</h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-300">
                  Reporte compacto de ingresos y medios de cobro.
                </p>
              </div>
              {reportLoading && (
                <span className="text-xs text-zinc-500 dark:text-zinc-300">
                  Calculando...
                </span>
              )}
            </div>

            {!report && !reportLoading ? (
              <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-300">
                Sin datos para mostrar.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className={`${CHIP} font-semibold`}>
                    Ingresos: {report?.totalCount ?? 0}
                  </span>
                  {(report?.totalsByCurrency || []).map((row) => (
                    <span key={`cur-${row.currency}`} className={CHIP}>
                      {row.currency}: {fmtMoney(row.amount, row.currency)} · Fee{" "}
                      {fmtMoney(row.fees, row.currency)}
                    </span>
                  ))}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className={SUBPANEL}>
                    <p className="text-xs font-semibold text-zinc-500">
                      Por medio
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      {(report?.totalsByPaymentMethod || []).map((row) => (
                        <span
                          key={`pm-${row.payment_method_id ?? "none"}`}
                          className={CHIP}
                        >
                          {row.payment_method_id
                            ? methodMap.get(row.payment_method_id) ||
                              `ID ${row.payment_method_id}`
                            : "Sin método"}
                          : {formatReportAmount(row.amount)}
                        </span>
                      ))}
                      {!reportCurrency &&
                        (report?.totalsByPaymentMethod?.length ?? 0) > 0 && (
                          <span className="text-[11px] text-zinc-500">
                            Multimoneda: filtrá por moneda para ver valores
                            consistentes.
                          </span>
                        )}
                    </div>
                  </div>

                  <div className={SUBPANEL}>
                    <p className="text-xs font-semibold text-zinc-500">
                      Por cuenta
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      {(report?.totalsByAccount || []).map((row) => (
                        <span
                          key={`acc-${row.account_id ?? "none"}`}
                          className={CHIP}
                        >
                          {row.account_id
                            ? accountMap.get(row.account_id) ||
                              `ID ${row.account_id}`
                            : "Sin cuenta"}
                          : {formatReportAmount(row.amount)}
                        </span>
                      ))}
                      {!reportCurrency &&
                        (report?.totalsByAccount?.length ?? 0) > 0 && (
                          <span className="text-[11px] text-zinc-500">
                            Multimoneda: filtrá por moneda para ver valores
                            consistentes.
                          </span>
                        )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          <motion.div
            layout
            initial={{ maxHeight: 96, opacity: 1 }}
            animate={{
              maxHeight: formOpen ? 1600 : 96,
              opacity: 1,
              transition: { duration: 0.35, ease: "easeInOut" },
            }}
            className="mb-6 overflow-auto rounded-3xl border border-white/10 bg-white/10 text-zinc-900 shadow-md shadow-sky-950/10 backdrop-blur dark:text-zinc-50"
          >
            <div
              className={`sticky top-0 z-10 ${
                formOpen ? "rounded-t-3xl border-b" : ""
              } border-white/10 px-4 py-3 backdrop-blur-sm`}
            >
              <button
                type="button"
                onClick={() => setFormOpen((prev) => !prev)}
                className="flex w-full items-center justify-between text-left"
                aria-expanded={formOpen}
              >
                <div className="flex items-center gap-3">
                  <div className="grid size-9 place-items-center rounded-full bg-sky-100 text-sky-950 shadow-sm shadow-sky-950/20 dark:bg-white/10 dark:text-white">
                    {formOpen ? (
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
                    <p className="text-lg font-semibold">Nuevo ingreso</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-300">
                      Registrá ingresos no vinculados a reservas.
                    </p>
                  </div>
                </div>
                <div className="hidden items-center gap-2 md:flex">
                  <span className={CHIP}>Moneda: {form.currency}</span>
                  <span className={CHIP}>
                    Total: {fmtMoney(totalAmount, form.currency)}
                  </span>
                </div>
              </button>
            </div>

            <AnimatePresence initial={false}>
              {formOpen && (
                <motion.div
                  key="body"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <form
                    className="space-y-5 px-4 pb-6 pt-4 md:px-6"
                    onSubmit={handleSubmit}
                  >
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="flex flex-col gap-1 text-sm">
                        Descripción
                        <input
                          className="rounded-xl border border-white/30 bg-white/60 px-3 py-2 text-sm shadow-inner outline-none dark:bg-zinc-900/50"
                          value={form.description}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              description: e.target.value,
                            }))
                          }
                          placeholder="Ingreso por intereses, reintegro, venta, etc."
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-sm">
                        Fecha
                        <input
                          type="date"
                          className="rounded-xl border border-white/30 bg-white/60 px-3 py-2 text-sm shadow-inner outline-none dark:bg-zinc-900/50"
                          value={form.issue_date}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              issue_date: e.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="flex flex-col gap-1 text-sm">
                        Moneda
                        <div className="mt-1 flex flex-wrap gap-2">
                          {currencyOptions.map((code) => (
                            <button
                              key={code}
                              type="button"
                              onClick={() =>
                                setForm((prev) => ({ ...prev, currency: code }))
                              }
                              className={pillClass(form.currency === code)}
                            >
                              {code}
                            </button>
                          ))}
                        </div>
                      </div>
                      <label className="flex flex-col gap-1 text-sm">
                        Costo financiero (retención del medio. Ej: Intereses de
                        tarjeta)
                        <input
                          className="rounded-xl border border-white/30 bg-white/60 px-3 py-2 text-sm shadow-inner outline-none dark:bg-zinc-900/50"
                          value={form.payment_fee_amount}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              payment_fee_amount: e.target.value,
                            }))
                          }
                          placeholder="0.00"
                        />
                      </label>
                    </div>

                    <div className="grid gap-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">Pagos</h3>
                        <button
                          type="button"
                          onClick={addLine}
                          className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-500/20 dark:text-emerald-100"
                        >
                          Agregar línea
                        </button>
                      </div>

                      <div className="grid gap-3">
                        {form.payments.map((line, index) => (
                          <div
                            key={`line-${index}`}
                            className="grid gap-3 rounded-xl border border-white/20 bg-white/40 p-3 shadow-inner dark:bg-zinc-900/40 md:grid-cols-4"
                          >
                            <label className="flex flex-col gap-1 text-xs">
                              Monto
                              <input
                                className="rounded-lg border border-white/30 bg-white/70 px-2 py-1 text-sm outline-none dark:bg-zinc-900/60"
                                value={line.amount}
                                onChange={(e) =>
                                  updateLine(index, {
                                    amount: e.target.value,
                                  })
                                }
                                placeholder="0.00"
                              />
                            </label>
                            <div className="flex flex-col gap-1 text-xs">
                              Medio de pago
                              <div className="flex flex-wrap gap-2">
                                {(finance?.paymentMethods || [])
                                  .filter((m) => m.enabled)
                                  .map((m) => {
                                    const value = String(m.id_method);
                                    const active =
                                      line.payment_method_id === value;
                                    return (
                                      <button
                                        key={m.id_method}
                                        type="button"
                                        onClick={() =>
                                          updateLine(index, {
                                            payment_method_id: active
                                              ? ""
                                              : value,
                                          })
                                        }
                                        className={pillSm(active)}
                                      >
                                        {m.name}
                                      </button>
                                    );
                                  })}
                              </div>
                            </div>
                            <div className="flex flex-col gap-1 text-xs">
                              Cuenta (opcional)
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateLine(index, { account_id: "" })
                                  }
                                  className={pillSm(line.account_id === "")}
                                >
                                  Sin cuenta
                                </button>
                                {(finance?.accounts || [])
                                  .filter((a) => a.enabled)
                                  .map((a) => {
                                    const value = String(a.id_account);
                                    const active = line.account_id === value;
                                    return (
                                      <button
                                        key={a.id_account}
                                        type="button"
                                        onClick={() =>
                                          updateLine(index, {
                                            account_id: active ? "" : value,
                                          })
                                        }
                                        className={pillSm(active)}
                                      >
                                        {a.name}
                                      </button>
                                    );
                                  })}
                              </div>
                            </div>
                            <div className="flex items-end justify-end">
                              <button
                                type="button"
                                onClick={() => removeLine(index)}
                                className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-500/20 dark:text-rose-100"
                              >
                                Quitar
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="text-zinc-500 dark:text-zinc-300">
                          Total cobrado
                        </span>
                        <span className="font-semibold">
                          {fmtMoney(totalAmount, form.currency)}
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="rounded-full border border-sky-500/40 bg-sky-500/20 px-4 py-2 text-sm font-semibold text-sky-800 transition hover:bg-sky-500/30 dark:text-sky-100"
                      >
                        Guardar ingreso
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <section className={PANEL}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/40 p-1 shadow-sm dark:bg-white/10">
                {[
                  { key: "cards", label: "Tarjetas" },
                  { key: "table", label: "Tabla" },
                  { key: "monthly", label: "Mensual" },
                ].map((opt) => {
                  const active = viewMode === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setViewMode(opt.key as ViewMode)}
                      className={
                        active
                          ? "rounded-xl bg-sky-500/15 px-4 py-2 text-xs font-semibold text-sky-800 dark:text-sky-100"
                          : "rounded-xl px-4 py-2 text-xs font-semibold text-zinc-600 hover:bg-white/40 dark:text-zinc-200"
                      }
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-300">
                {items.length} ingresos cargados
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : items.length === 0 ? (
              <p className="py-6 text-sm text-zinc-500 dark:text-zinc-300">
                Todavía no hay ingresos cargados.
              </p>
            ) : viewMode === "table" ? (
              <div className="mt-4 overflow-x-auto rounded-2xl border border-white/20 bg-white/40 shadow-inner dark:bg-zinc-900/40">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="text-xs text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">Fecha</th>
                      <th className="px-3 py-2">N°</th>
                      <th className="px-3 py-2">Descripción</th>
                      <th className="px-3 py-2">Monto</th>
                      <th className="px-3 py-2">Estado</th>
                      <th className="px-3 py-2">Pagos</th>
                      <th className="px-3 py-2 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr
                        key={item.id_other_income}
                        className="border-t border-white/10"
                      >
                        <td className="px-3 py-2 text-xs text-zinc-600">
                          {fmtDate(item.issue_date)}
                        </td>
                        <td className="px-3 py-2 text-xs text-zinc-600">
                          {item.agency_other_income_id ?? item.id_other_income}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-semibold">
                            {item.description}
                          </div>
                          {item.payment_fee_amount != null && (
                            <div className="text-xs text-zinc-500">
                              Fee:{" "}
                              {fmtMoney(item.payment_fee_amount, item.currency)}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 font-semibold">
                          {fmtMoney(item.amount, item.currency)}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] ${
                              item.verification_status === "VERIFIED"
                                ? "border-emerald-300 bg-emerald-100 text-emerald-900"
                                : "border-amber-300 bg-amber-100 text-amber-900"
                            }`}
                          >
                            {item.verification_status || "PENDING"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-zinc-600">
                          {(item.payments || []).map((p, idx) => (
                            <div key={`${item.id_other_income}-p-${idx}`}>
                              {(methodMap.get(p.payment_method_id ?? 0) ||
                                "Sin método") +
                                (p.account_id
                                  ? ` · ${accountMap.get(p.account_id) ?? ""}`
                                  : "") +
                                " · " +
                                fmtMoney(p.amount, item.currency)}
                            </div>
                          ))}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openEdit(item)}
                              className="rounded-full border border-sky-500/40 bg-sky-500/20 px-3 py-1 text-xs font-semibold text-sky-800 transition hover:bg-sky-500/30 disabled:opacity-50"
                              disabled={item.verification_status === "VERIFIED"}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(item)}
                              className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-500/20 disabled:opacity-50"
                              disabled={item.verification_status === "VERIFIED"}
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : viewMode === "monthly" ? (
              <div className="mt-4 space-y-4">
                {groupedByMonth.map((group) => (
                  <div
                    key={group.key}
                    className="rounded-2xl border border-white/20 bg-white/40 p-4 shadow-inner dark:bg-zinc-900/40"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">{group.label}</h3>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {Object.entries(group.totals).map(([cur, total]) => (
                          <span key={`${group.key}-${cur}`} className={CHIP}>
                            {cur}: {fmtMoney(total, cur)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="mt-3 divide-y divide-white/10">
                      {group.items.map((item) => (
                        <div
                          key={`${group.key}-${item.id_other_income}`}
                          className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                        >
                          <div>
                            <div className="font-medium">
                              {item.description}
                            </div>
                            <div className="text-xs text-zinc-500">
                              {fmtDate(item.issue_date)} · N°{" "}
                              {item.agency_other_income_id ??
                                item.id_other_income}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">
                              {fmtMoney(item.amount, item.currency)}
                            </span>
                            <button
                              type="button"
                              onClick={() => openEdit(item)}
                              className="rounded-full border border-sky-500/40 bg-sky-500/20 px-3 py-1 text-xs font-semibold text-sky-800 transition hover:bg-sky-500/30 disabled:opacity-50"
                              disabled={item.verification_status === "VERIFIED"}
                            >
                              Editar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 grid gap-3">
                {items.map((item) => (
                  <div
                    key={item.id_other_income}
                    className="rounded-2xl border border-white/20 bg-white/40 p-4 shadow-inner dark:bg-zinc-900/40"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">
                          {item.description}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-300">
                          {fmtDate(item.issue_date)} · N°{" "}
                          {item.agency_other_income_id ?? item.id_other_income}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">
                          {fmtMoney(item.amount, item.currency)}
                        </p>
                        <span
                          className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] ${
                            item.verification_status === "VERIFIED"
                              ? "border-emerald-300 bg-emerald-100 text-emerald-900"
                              : "border-amber-300 bg-amber-100 text-amber-900"
                          }`}
                        >
                          {item.verification_status || "PENDING"}
                        </span>
                      </div>
                    </div>

                    {item.payment_fee_amount != null && (
                      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-300">
                        Fee: {fmtMoney(item.payment_fee_amount, item.currency)}
                      </p>
                    )}

                    {Array.isArray(item.payments) &&
                      item.payments.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-zinc-600 dark:text-zinc-200">
                          {item.payments.map((p, idx) => (
                            <span
                              key={`${item.id_other_income}-p-${idx}`}
                              className="rounded-full bg-zinc-900/5 px-2 py-0.5 dark:bg-white/10"
                            >
                              {(methodMap.get(p.payment_method_id ?? 0) ||
                                "Sin método") +
                                (p.account_id
                                  ? ` • ${accountMap.get(p.account_id) ?? ""}`
                                  : "") +
                                " • " +
                                fmtMoney(p.amount, item.currency)}
                            </span>
                          ))}
                        </div>
                      )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="rounded-full border border-sky-500/40 bg-sky-500/20 px-3 py-1 text-xs font-semibold text-sky-800 transition hover:bg-sky-500/30 disabled:opacity-50"
                        disabled={item.verification_status === "VERIFIED"}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-500/20 disabled:opacity-50"
                        disabled={item.verification_status === "VERIFIED"}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {cursor && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => fetchItems(false)}
                  className="rounded-full border border-white/30 bg-white/20 px-4 py-2 text-xs font-medium text-zinc-700 transition hover:bg-white/30 dark:text-zinc-100"
                  disabled={loadingMore}
                >
                  {loadingMore ? "Cargando..." : "Cargar más"}
                </button>
              </div>
            )}
          </section>
        </div>

        {editingItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-3xl rounded-2xl border border-white/20 bg-white/90 p-5 shadow-xl backdrop-blur dark:bg-zinc-900/90">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Editar ingreso</h2>
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="rounded-full border border-white/30 px-3 py-1 text-xs text-zinc-600 hover:bg-white/30 dark:text-zinc-200"
                >
                  Cerrar
                </button>
              </div>

              <form className="mt-4 grid gap-4" onSubmit={handleEditSubmit}>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-1 text-sm">
                    Descripción
                    <input
                      className="rounded-xl border border-white/30 bg-white/60 px-3 py-2 text-sm shadow-inner outline-none dark:bg-zinc-900/50"
                      value={editForm.description}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          description: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Fecha
                    <input
                      type="date"
                      className="rounded-xl border border-white/30 bg-white/60 px-3 py-2 text-sm shadow-inner outline-none dark:bg-zinc-900/50"
                      value={editForm.issue_date}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          issue_date: e.target.value,
                        }))
                      }
                    />
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="flex flex-col gap-1 text-sm">
                    Moneda
                    <div className="mt-1 flex flex-wrap gap-2">
                      {currencyOptions.map((code) => (
                        <button
                          key={code}
                          type="button"
                          onClick={() =>
                            setEditForm((prev) => ({ ...prev, currency: code }))
                          }
                          className={pillClass(editForm.currency === code)}
                        >
                          {code}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="flex flex-col gap-1 text-sm">
                    Fee financiero (opcional)
                    <input
                      className="rounded-xl border border-white/30 bg-white/60 px-3 py-2 text-sm shadow-inner outline-none dark:bg-zinc-900/50"
                      value={editForm.payment_fee_amount}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          payment_fee_amount: e.target.value,
                        }))
                      }
                      placeholder="0.00"
                    />
                  </label>
                </div>

                <div className="grid gap-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Pagos</h3>
                    <button
                      type="button"
                      onClick={addEditLine}
                      className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-500/20 dark:text-emerald-100"
                    >
                      Agregar línea
                    </button>
                  </div>

                  <div className="grid gap-3">
                    {editForm.payments.map((line, index) => (
                      <div
                        key={`edit-line-${index}`}
                        className="grid gap-3 rounded-xl border border-white/20 bg-white/40 p-3 shadow-inner dark:bg-zinc-900/40 md:grid-cols-4"
                      >
                        <label className="flex flex-col gap-1 text-xs">
                          Monto
                          <input
                            className="rounded-lg border border-white/30 bg-white/70 px-2 py-1 text-sm outline-none dark:bg-zinc-900/60"
                            value={line.amount}
                            onChange={(e) =>
                              updateEditLine(index, { amount: e.target.value })
                            }
                            placeholder="0.00"
                          />
                        </label>
                        <div className="flex flex-col gap-1 text-xs">
                          Medio de pago
                          <div className="flex flex-wrap gap-2">
                            {(finance?.paymentMethods || [])
                              .filter((m) => m.enabled)
                              .map((m) => {
                                const value = String(m.id_method);
                                const active = line.payment_method_id === value;
                                return (
                                  <button
                                    key={m.id_method}
                                    type="button"
                                    onClick={() =>
                                      updateEditLine(index, {
                                        payment_method_id: active ? "" : value,
                                      })
                                    }
                                    className={pillSm(active)}
                                  >
                                    {m.name}
                                  </button>
                                );
                              })}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 text-xs">
                          Cuenta (opcional)
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                updateEditLine(index, { account_id: "" })
                              }
                              className={pillSm(line.account_id === "")}
                            >
                              Sin cuenta
                            </button>
                            {(finance?.accounts || [])
                              .filter((a) => a.enabled)
                              .map((a) => {
                                const value = String(a.id_account);
                                const active = line.account_id === value;
                                return (
                                  <button
                                    key={a.id_account}
                                    type="button"
                                    onClick={() =>
                                      updateEditLine(index, {
                                        account_id: active ? "" : value,
                                      })
                                    }
                                    className={pillSm(active)}
                                  >
                                    {a.name}
                                  </button>
                                );
                              })}
                          </div>
                        </div>
                        <div className="flex items-end justify-end">
                          <button
                            type="button"
                            onClick={() => removeEditLine(index)}
                            className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-500/20 dark:text-rose-100"
                          >
                            Quitar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-zinc-500 dark:text-zinc-300">
                      Total cobrado
                    </span>
                    <span className="font-semibold">
                      {fmtMoney(totalEditAmount, editForm.currency)}
                    </span>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingItem(null)}
                    className="rounded-full border border-white/30 bg-white/20 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-white/30 dark:text-zinc-100"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="rounded-full border border-sky-500/40 bg-sky-500/20 px-4 py-2 text-sm font-semibold text-sky-800 transition hover:bg-sky-500/30 dark:text-sky-100"
                  >
                    Guardar cambios
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </ProtectedRoute>
  );
}
