"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";

/* ================= Estilos compartidos ================= */
const GLASS =
  "rounded-3xl border border-white/30 bg-white/10 backdrop-blur shadow-lg shadow-sky-900/10 dark:bg-white/10 dark:border-white/5";
const ICON_BTN =
  "rounded-full bg-sky-100 px-4 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-[.98] active:scale-95 disabled:opacity-50 dark:bg-white/10 dark:text-white";
const BADGE =
  "inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[10px] font-medium border border-white/10 bg-white/10";

/* ================= Tipos (alineados a las APIs) ================= */
type FinanceConfig = {
  id_agency: number;
  default_currency_code: string | null;
  hide_operator_expenses_in_investments?: boolean | null;
};

type FinanceCurrency = {
  id_currency: number;
  code: string;
  name: string;
  symbol: string | null;
  enabled: boolean;
  is_primary: boolean;
  sort_order: number;
};

type FinanceAccount = {
  id_account: number;
  name: string;
  type?: string | null;
  alias?: string | null;
  cbu?: string | null;
  currency: string | null; // código de moneda (ej: "ARS") o null
  enabled: boolean;
  sort_order: number;
};

type FinancePaymentMethod = {
  id_method: number;
  name: string;
  code: string;
  requires_account: boolean;
  enabled: boolean;
  sort_order: number;
  lock_system?: boolean;
};

type FinanceExpenseCategory = {
  id_category: number;
  name: string;
  enabled: boolean;
  sort_order: number;
  requires_operator?: boolean; // ← agregado
  requires_user?: boolean; // ← agregado
};

type FinanceBundle = {
  config: FinanceConfig | null;
  currencies: FinanceCurrency[];
  accounts: FinanceAccount[];
  paymentMethods: FinancePaymentMethod[];
  categories: FinanceExpenseCategory[];
};

/* ================== Helpers UI ================== */
function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs opacity-70">{children}</label>;
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`block w-full min-w-fit appearance-none rounded-3xl border border-white/30 bg-white/10 px-4 py-2 outline-none backdrop-blur placeholder:opacity-60 dark:border-white/10 dark:bg-white/10 ${props.className || ""}`}
    />
  );
}
function Switch({
  checked,
  onChange,
  label,
  title,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-3 py-1.5 shadow-sm backdrop-blur transition hover:bg-white/20 dark:border-white/10 dark:bg-white/10 ${
        checked ? "ring-1 ring-sky-400/60" : ""
      }`}
      title={title}
    >
      <span
        className={`inline-block h-4 w-7 rounded-full ${
          checked ? "bg-emerald-500/60" : "bg-white/30 dark:bg-white/10"
        }`}
      >
        <span
          className={`block size-4 rounded-full bg-white transition ${
            checked ? "translate-x-3" : ""
          }`}
        />
      </span>
      <span className="text-sm">{label}</span>
    </button>
  );
}

/* =============== Modal simple =============== */
function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100]">
      <div
        className="absolute inset-0 bg-black/10 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`${GLASS} absolute left-1/2 top-1/2 ${
          wide ? "w-[min(94vw,780px)]" : "w-[min(92vw,560px)]"
        } -translate-x-1/2 -translate-y-1/2 p-5`}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} className={ICON_BTN}>
            ✕
          </button>
        </div>
        <div className="max-h-[65vh] overflow-auto pr-1">{children}</div>
        {footer && <div className="mt-4 flex justify-end">{footer}</div>}
      </div>
    </div>
  );
}

/* =================== Página =================== */
type TabKey = "general" | "currencies" | "accounts" | "methods" | "categories";

export default function FinanceConfigPage() {
  const { token } = useAuth();
  const [agencyId, setAgencyId] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [bundle, setBundle] = useState<FinanceBundle | null>(null);

  const [active, setActive] = useState<TabKey>("general");
  const [savingGeneral, setSavingGeneral] = useState(false);

  // ====== Form estado general ======
  const [generalForm, setGeneralForm] = useState<{
    default_currency_code: string;
    hide_operator_expenses_in_investments: boolean;
  }>({
    default_currency_code: "",
    hide_operator_expenses_in_investments: false,
  });

  // Sincroniza formulario cuando cambian los datos
  useEffect(() => {
    if (!bundle?.config) return;
    setGeneralForm({
      default_currency_code: bundle.config.default_currency_code || "",
      hide_operator_expenses_in_investments:
        bundle.config.hide_operator_expenses_in_investments ?? false,
    });
  }, [bundle]);

  // ====== Cargar agencyId y datos ======
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        // perfil => id_agency
        const pr = await authFetch(
          "/api/user/profile",
          { cache: "no-store" },
          token,
        );
        if (pr.ok) {
          const p = await pr.json();
          setAgencyId(p?.id_agency ?? null);
        }
      } catch {
        setAgencyId(null);
      }
      setLoading(true);
      try {
        const res = await authFetch(
          "/api/finance/config",
          { cache: "no-store" },
          token,
        );
        if (!res.ok) throw new Error("No se pudo cargar la configuración");
        const json = (await res.json()) as FinanceBundle;
        setBundle(json);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error cargando datos");
        setBundle({
          config: null,
          currencies: [],
          accounts: [],
          paymentMethods: [],
          categories: [],
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const reload = useCallback(async () => {
    if (!token) return;
    try {
      const res = await authFetch(
        "/api/finance/config",
        { cache: "no-store" },
        token,
      );
      if (!res.ok) throw new Error("No se pudo recargar");
      const json = (await res.json()) as FinanceBundle;
      setBundle(json);
    } catch {
      /* no-op */
    }
  }, [token]);

  /* =================== GENERAL =================== */
  const saveGeneral = async () => {
    if (!token) return;
    if (!generalForm.default_currency_code) {
      toast.error("Elegí una moneda por defecto");
      return;
    }
    setSavingGeneral(true);
    try {
      const res = await authFetch(
        "/api/finance/config",
        {
          method: "PUT",
          body: JSON.stringify({
            default_currency_code: generalForm.default_currency_code,
            hide_operator_expenses_in_investments:
              generalForm.hide_operator_expenses_in_investments,
          }),
        },
        token,
      );
      if (!res.ok) throw new Error("No se pudo guardar la configuración");
      toast.success("Configuración guardada");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSavingGeneral(false);
    }
  };

  /* =================== MONEDAS =================== */
  const [currencyModalOpen, setCurrencyModalOpen] = useState(false);
  const [currencyEditing, setCurrencyEditing] =
    useState<FinanceCurrency | null>(null);
  const [currencyForm, setCurrencyForm] = useState<{
    code: string;
    name: string;
    symbol: string;
    enabled: boolean;
  }>({ code: "", name: "", symbol: "", enabled: true });

  const openNewCurrency = () => {
    setCurrencyEditing(null);
    setCurrencyForm({ code: "", name: "", symbol: "", enabled: true });
    setCurrencyModalOpen(true);
  };
  const openEditCurrency = (c: FinanceCurrency) => {
    setCurrencyEditing(c);
    setCurrencyForm({
      code: c.code,
      name: c.name,
      symbol: c.symbol ?? "",
      enabled: c.enabled,
    });
    setCurrencyModalOpen(true);
  };

  const saveCurrency = async () => {
    if (!token) return;
    const payload = {
      code: currencyForm.code.trim().toUpperCase(),
      name: currencyForm.name.trim(),
      symbol: currencyForm.symbol.trim(),
      enabled: !!currencyForm.enabled,
    };
    if (!payload.code || !payload.name || !payload.symbol) {
      toast.error("Completá código, nombre y símbolo");
      return;
    }
    try {
      const url =
        "/api/finance/currencies" +
        (currencyEditing ? `/${currencyEditing.id_currency}` : "");
      const method = currencyEditing ? "PATCH" : "POST";
      const res = await authFetch(
        url,
        { method, body: JSON.stringify(payload) },
        token,
      );
      if (!res.ok) throw new Error("No se pudo guardar la moneda");
      toast.success(currencyEditing ? "Moneda actualizada" : "Moneda creada");
      setCurrencyModalOpen(false);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  const toggleCurrencyEnabled = async (c: FinanceCurrency) => {
    if (!token) return;
    try {
      const res = await authFetch(
        `/api/finance/currencies/${c.id_currency}`,
        { method: "PATCH", body: JSON.stringify({ enabled: !c.enabled }) },
        token,
      );
      if (!res.ok) throw new Error("No se pudo actualizar la moneda");
      await reload();
    } catch {
      toast.error("Error al actualizar estado");
    }
  };

  const setCurrencyPrimary = async (c: FinanceCurrency) => {
    if (!token) return;
    try {
      const res = await authFetch(
        `/api/finance/currencies/${c.id_currency}`,
        { method: "PATCH", body: JSON.stringify({ is_primary: true }) },
        token,
      );
      if (!res.ok) throw new Error("No se pudo marcar como principal");
      toast.success(`${c.code} es ahora la moneda principal`);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al actualizar");
    }
  };

  const deleteCurrency = async (c: FinanceCurrency) => {
    if (!token) return;
    if (!confirm(`¿Eliminar la moneda ${c.code}?`)) return;
    try {
      const res = await authFetch(
        `/api/finance/currencies/${c.id_currency}`,
        { method: "DELETE" },
        token,
      );
      if (!res.ok) throw new Error("No se pudo eliminar");
      toast.success("Moneda eliminada");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    }
  };

  const moveCurrency = async (idx: number, direction: -1 | 1) => {
    const list = currencies || [];
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= list.length) return;

    // Reorden local optimista
    const reordered = [...list];
    const [item] = reordered.splice(idx, 1);
    reordered.splice(newIdx, 0, item);

    setBundle((prev) =>
      prev
        ? {
            ...prev,
            currencies: reordered.map((c, i) => ({ ...c, sort_order: i + 1 })),
          }
        : prev,
    );

    // Commit
    try {
      const body = {
        id_agency: agencyId ?? 0,
        items: reordered.map((c, i) => ({
          id: c.id_currency,
          sort_order: i + 1,
        })),
      };
      const res = await authFetch(
        "/api/finance/currencies/reorder",
        { method: "POST", body: JSON.stringify(body) },
        token,
      );
      if (!res.ok) throw new Error("No se pudo reordenar");
      toast.success("Orden actualizado");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al reordenar");
      await reload();
    }
  };

  /* =================== CUENTAS =================== */
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountEditing, setAccountEditing] = useState<FinanceAccount | null>(
    null,
  );
  const [accountForm, setAccountForm] = useState<{
    name: string;
    alias: string;
    currency: string; // vacío => sin moneda
    enabled: boolean;
  }>({
    name: "",
    alias: "",
    currency: "",
    enabled: true,
  });

  const openNewAccount = () => {
    setAccountEditing(null);
    setAccountForm({
      name: "",
      alias: "",
      currency: bundle?.config?.default_currency_code || "",
      enabled: true,
    });
    setAccountModalOpen(true);
  };
  const openEditAccount = (a: FinanceAccount) => {
    setAccountEditing(a);
    setAccountForm({
      name: a.name,
      alias: a.alias || "",
      currency: a.currency || bundle?.config?.default_currency_code || "",
      enabled: a.enabled,
    });
    setAccountModalOpen(true);
  };

  const saveAccount = async () => {
    if (!token) return;
    const payload = {
      id_agency: agencyId ?? undefined,
      name: accountForm.name.trim(),
      alias: accountForm.alias.trim() || null,
      currency: accountForm.currency || null, // ← puede ser null
      enabled: !!accountForm.enabled,
    };
    if (!payload.name) {
      toast.error("Completá el nombre de la cuenta");
      return;
    }
    try {
      const url =
        "/api/finance/accounts" +
        (accountEditing ? `/${accountEditing.id_account}` : "");
      const method = accountEditing ? "PATCH" : "POST";
      const res = await authFetch(
        url,
        { method, body: JSON.stringify(payload) },
        token,
      );
      if (!res.ok) {
        let msg = "No se pudo guardar la cuenta";
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {}
        throw new Error(msg);
      }
      toast.success(accountEditing ? "Cuenta actualizada" : "Cuenta creada");
      setAccountModalOpen(false);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  const toggleAccountEnabled = async (a: FinanceAccount) => {
    if (!token) return;
    try {
      const res = await authFetch(
        `/api/finance/accounts/${a.id_account}`,
        { method: "PATCH", body: JSON.stringify({ enabled: !a.enabled }) },
        token,
      );
      if (!res.ok) throw new Error("No se pudo actualizar");
      await reload();
    } catch {
      toast.error("Error al actualizar estado");
    }
  };

  const deleteAccount = async (a: FinanceAccount) => {
    if (!token) return;
    if (!confirm(`¿Eliminar la cuenta "${a.name}"?`)) return;
    try {
      const res = await authFetch(
        `/api/finance/accounts/${a.id_account}`,
        { method: "DELETE" },
        token,
      );
      if (!res.ok) throw new Error("No se pudo eliminar");
      toast.success("Cuenta eliminada");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    }
  };

  /* =================== MÉTODOS DE PAGO =================== */
  const [methodModalOpen, setMethodModalOpen] = useState(false);
  const [methodEditing, setMethodEditing] =
    useState<FinancePaymentMethod | null>(null);
  const [methodForm, setMethodForm] = useState<{
    name: string;
    code: string;
    requires_account: boolean;
    enabled: boolean;
  }>({ name: "", code: "", requires_account: false, enabled: true });

  const openNewMethod = () => {
    setMethodEditing(null);
    setMethodForm({
      name: "",
      code: "",
      requires_account: false,
      enabled: true,
    });
    setMethodModalOpen(true);
  };
  const openEditMethod = (m: FinancePaymentMethod) => {
    setMethodEditing(m);
    setMethodForm({
      name: m.name,
      code: m.code,
      requires_account: m.requires_account,
      enabled: m.enabled,
    });
    setMethodModalOpen(true);
  };

  const saveMethod = async () => {
    if (!token) return;
    const payload = {
      id_agency: agencyId ?? undefined,
      name: methodForm.name.trim(),
      code: methodForm.code.trim(),
      requires_account: !!methodForm.requires_account,
      enabled: !!methodForm.enabled,
    };
    if (!payload.name || !payload.code) {
      toast.error("Completá nombre y código del método");
      return;
    }
    try {
      const url =
        "/api/finance/methods" +
        (methodEditing ? `/${methodEditing.id_method}` : "");
      const method = methodEditing ? "PATCH" : "POST";
      const res = await authFetch(
        url,
        { method, body: JSON.stringify(payload) },
        token,
      );
      if (!res.ok) throw new Error("No se pudo guardar el método");
      toast.success(methodEditing ? "Método actualizado" : "Método creado");
      setMethodModalOpen(false);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  const toggleMethodEnabled = async (m: FinancePaymentMethod) => {
    if (!token) return;
    try {
      const res = await authFetch(
        `/api/finance/methods/${m.id_method}`,
        { method: "PATCH", body: JSON.stringify({ enabled: !m.enabled }) },
        token,
      );
      if (!res.ok) throw new Error("No se pudo actualizar");
      await reload();
    } catch {
      toast.error("Error al actualizar estado");
    }
  };

  const toggleMethodRequiresAccount = async (m: FinancePaymentMethod) => {
    if (!token) return;
    try {
      const res = await authFetch(
        `/api/finance/methods/${m.id_method}`,
        {
          method: "PATCH",
          body: JSON.stringify({ requires_account: !m.requires_account }),
        },
        token,
      );
      if (!res.ok) throw new Error("No se pudo actualizar");
      await reload();
    } catch {
      toast.error("Error al actualizar método");
    }
  };

  const deleteMethod = async (m: FinancePaymentMethod) => {
    if (!token) return;
    if (!confirm(`¿Eliminar el método "${m.name}"?`)) return;
    try {
      const res = await authFetch(
        `/api/finance/methods/${m.id_method}`,
        { method: "DELETE" },
        token,
      );
      if (!res.ok) throw new Error("No se pudo eliminar");
      toast.success("Método eliminado");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    }
  };

  /* =================== CATEGORÍAS =================== */
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catEditing, setCatEditing] = useState<FinanceExpenseCategory | null>(
    null,
  );
  const [catForm, setCatForm] = useState<{
    name: string;
    enabled: boolean;
    requires_operator: boolean; // ← agregado
    requires_user: boolean; // ← agregado
  }>({
    name: "",
    enabled: true,
    requires_operator: false,
    requires_user: false,
  });

  const openNewCategory = () => {
    setCatEditing(null);
    setCatForm({
      name: "",
      enabled: true,
      requires_operator: false,
      requires_user: false,
    });
    setCatModalOpen(true);
  };
  const openEditCategory = (c: FinanceExpenseCategory) => {
    setCatEditing(c);
    setCatForm({
      name: c.name,
      enabled: c.enabled,
      requires_operator: !!c.requires_operator,
      requires_user: !!c.requires_user,
    });
    setCatModalOpen(true);
  };

  const saveCategory = async () => {
    if (!token) return;
    const payload = {
      id_agency: agencyId ?? undefined,
      name: catForm.name.trim(),
      enabled: !!catForm.enabled,
      requires_operator: !!catForm.requires_operator,
      requires_user: !!catForm.requires_user,
    };
    if (!payload.name) {
      toast.error("Completá el nombre de la categoría");
      return;
    }
    try {
      const url =
        "/api/finance/categories" +
        (catEditing ? `/${catEditing.id_category}` : "");
      const method = catEditing ? "PATCH" : "POST";
      const res = await authFetch(
        url,
        { method, body: JSON.stringify(payload) },
        token,
      );
      if (!res.ok) throw new Error("No se pudo guardar la categoría");
      toast.success(catEditing ? "Categoría actualizada" : "Categoría creada");
      setCatModalOpen(false);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  const toggleCategoryEnabled = async (c: FinanceExpenseCategory) => {
    if (!token) return;
    try {
      const res = await authFetch(
        `/api/finance/categories/${c.id_category}`,
        { method: "PATCH", body: JSON.stringify({ enabled: !c.enabled }) },
        token,
      );
      if (!res.ok) throw new Error("No se pudo actualizar");
      await reload();
    } catch {
      toast.error("Error al actualizar estado");
    }
  };

  const deleteCategory = async (c: FinanceExpenseCategory) => {
    if (!token) return;
    if (!confirm(`¿Eliminar la categoría "${c.name}"?`)) return;
    try {
      const res = await authFetch(
        `/api/finance/categories/${c.id_category}`,
        { method: "DELETE" },
        token,
      );
      if (!res.ok) throw new Error("No se pudo eliminar");
      toast.success("Categoría eliminada");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    }
  };

  /* =================== Derivados (con arrays estables) =================== */
  const EMPTY_CURRENCIES: FinanceCurrency[] = useMemo(() => [], []);
  const EMPTY_ACCOUNTS: FinanceAccount[] = useMemo(() => [], []);
  const EMPTY_METHODS: FinancePaymentMethod[] = useMemo(() => [], []);
  const EMPTY_CATEGORIES: FinanceExpenseCategory[] = useMemo(() => [], []);

  const currencies: FinanceCurrency[] = bundle?.currencies ?? EMPTY_CURRENCIES;
  const accounts: FinanceAccount[] = bundle?.accounts ?? EMPTY_ACCOUNTS;
  const methods: FinancePaymentMethod[] =
    bundle?.paymentMethods ?? EMPTY_METHODS;
  const categories: FinanceExpenseCategory[] =
    bundle?.categories ?? EMPTY_CATEGORIES;

  const enabledCurrencies = useMemo(
    () => currencies.filter((c) => c.enabled),
    [currencies],
  );

  /* =================== Render =================== */
  return (
    <ProtectedRoute>
      <section className="text-sky-950 dark:text-white">
        {/* Título + Tabs */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Configuración de Finanzas</h1>
            <p className="text-sm opacity-70">
              Monedas, cuentas, métodos de pago y categorías. Alcance por
              agencia.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { key: "general", label: "General" },
              { key: "currencies", label: "Monedas" },
              { key: "accounts", label: "Cuentas" },
              { key: "methods", label: "Métodos" },
              { key: "categories", label: "Categorías" },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setActive(t.key as TabKey)}
                className={`${ICON_BTN} ${
                  active === t.key ? "ring-1 ring-sky-400/60" : ""
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Contenido */}
        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <>
            {/* GENERAL */}
            {active === "general" && (
              <div className={`${GLASS} p-5`}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <Label>Moneda por defecto</Label>
                    <select
                      value={generalForm.default_currency_code}
                      onChange={(e) =>
                        setGeneralForm((f) => ({
                          ...f,
                          default_currency_code: e.target.value,
                        }))
                      }
                      className="w-full cursor-pointer appearance-none rounded-3xl border border-white/30 bg-white/10 px-3 py-2 outline-none backdrop-blur dark:border-white/10 dark:bg-white/10"
                    >
                      <option value="" disabled>
                        Elegir…
                      </option>
                      {currencies.map((c) => (
                        <option key={c.id_currency} value={c.code}>
                          {c.code} — {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-end">
                    <Switch
                      checked={
                        !!generalForm.hide_operator_expenses_in_investments
                      }
                      onChange={(v) =>
                        setGeneralForm((f) => ({
                          ...f,
                          hide_operator_expenses_in_investments: v,
                        }))
                      }
                      label="Ocultar egresos de Operador en 'Gastos'"
                      title="Impacta en la vista de Investments / Gastos"
                    />
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    onClick={saveGeneral}
                    disabled={savingGeneral}
                    className={ICON_BTN}
                  >
                    {savingGeneral ? <Spinner /> : "Guardar"}
                  </button>
                </div>
              </div>
            )}

            {/* MONEDAS */}
            {active === "currencies" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">Monedas</h2>
                  <button onClick={openNewCurrency} className={ICON_BTN}>
                    Nueva moneda
                  </button>
                </div>

                {currencies.length === 0 ? (
                  <div className={`${GLASS} p-6 text-center`}>
                    Aún no hay monedas configuradas.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {currencies.map((c, idx) => (
                      <article
                        key={c.id_currency}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className={`${BADGE}`}>#{c.id_currency}</div>
                          <div className="truncate">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold">
                                {c.code}
                              </span>
                              {c.is_primary && (
                                <span className={`${BADGE}`}>Principal</span>
                              )}
                              {!c.enabled && (
                                <span className={`${BADGE}`}>
                                  Deshabilitada
                                </span>
                              )}
                            </div>
                            <div className="text-sm opacity-80">
                              {c.name} • {c.symbol ?? ""}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => moveCurrency(idx, -1)}
                            disabled={idx === 0}
                            className={ICON_BTN}
                            title="Subir"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => moveCurrency(idx, +1)}
                            disabled={idx === currencies.length - 1}
                            className={ICON_BTN}
                            title="Bajar"
                          >
                            ↓
                          </button>

                          <button
                            onClick={() => setCurrencyPrimary(c)}
                            disabled={c.is_primary}
                            className={ICON_BTN}
                            title="Marcar como principal"
                          >
                            Principal
                          </button>

                          <button
                            onClick={() => toggleCurrencyEnabled(c)}
                            className={ICON_BTN}
                          >
                            {c.enabled ? "Deshabilitar" : "Habilitar"}
                          </button>

                          <button
                            onClick={() => openEditCurrency(c)}
                            className={ICON_BTN}
                            title="Editar"
                          >
                            Editar
                          </button>

                          <button
                            onClick={() => deleteCurrency(c)}
                            className={`${ICON_BTN} bg-red-600 text-red-100 dark:bg-red-800`}
                            title="Eliminar"
                          >
                            Eliminar
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* CUENTAS */}
            {active === "accounts" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">Cuentas</h2>
                  <button onClick={openNewAccount} className={ICON_BTN}>
                    Nueva cuenta
                  </button>
                </div>

                {accounts.length === 0 ? (
                  <div className={`${GLASS} p-6 text-center`}>
                    Aún no hay cuentas configuradas.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {accounts.map((a) => {
                      const cur = a.currency
                        ? currencies.find((c) => c.code === a.currency)
                        : undefined;
                      return (
                        <article
                          key={a.id_account}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <div className={`${BADGE}`}>#{a.id_account}</div>
                            <div className="truncate">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold">
                                  {a.name}
                                </span>
                                {!a.enabled && (
                                  <span className={`${BADGE}`}>
                                    Deshabilitada
                                  </span>
                                )}
                              </div>
                              <div className="text-sm opacity-80">
                                {a.alias ? `${a.alias} • ` : ""}
                                {a.currency ?? "— sin moneda —"}
                                {cur ? ` • ${cur.name}` : ""}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              onClick={() => toggleAccountEnabled(a)}
                              className={ICON_BTN}
                            >
                              {a.enabled ? "Deshabilitar" : "Habilitar"}
                            </button>

                            <button
                              onClick={() => openEditAccount(a)}
                              className={ICON_BTN}
                            >
                              Editar
                            </button>

                            <button
                              onClick={() => deleteAccount(a)}
                              className={`${ICON_BTN} bg-red-600 text-red-100 dark:bg-red-800`}
                            >
                              Eliminar
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* MÉTODOS */}
            {active === "methods" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">Métodos de pago</h2>
                  <button onClick={openNewMethod} className={ICON_BTN}>
                    Nuevo método
                  </button>
                </div>

                {methods.length === 0 ? (
                  <div className={`${GLASS} p-6 text-center`}>
                    Aún no hay métodos configurados.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {methods.map((m) => (
                      <article
                        key={m.id_method}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className={`${BADGE}`}>#{m.id_method}</div>
                          <div className="truncate">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold">
                                {m.name}
                              </span>
                              <span className={`${BADGE}`}>{m.code}</span>
                              {!m.enabled && (
                                <span className={`${BADGE}`}>
                                  Deshabilitado
                                </span>
                              )}
                              {m.requires_account && (
                                <span className={`${BADGE}`}>
                                  Requiere cuenta
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => toggleMethodRequiresAccount(m)}
                            className={ICON_BTN}
                            title="Alternar 'requiere cuenta'"
                          >
                            {m.requires_account
                              ? "No requiere cuenta"
                              : "Requiere cuenta"}
                          </button>

                          <button
                            onClick={() => toggleMethodEnabled(m)}
                            className={ICON_BTN}
                          >
                            {m.enabled ? "Deshabilitar" : "Habilitar"}
                          </button>

                          <button
                            onClick={() => openEditMethod(m)}
                            className={ICON_BTN}
                          >
                            Editar
                          </button>

                          <button
                            onClick={() => deleteMethod(m)}
                            className={`${ICON_BTN} bg-red-600 text-red-100 dark:bg-red-800`}
                          >
                            Eliminar
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* CATEGORÍAS */}
            {active === "categories" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">
                    Categorías de gastos
                  </h2>
                  <button onClick={openNewCategory} className={ICON_BTN}>
                    Nueva categoría
                  </button>
                </div>

                {categories.length === 0 ? (
                  <div className={`${GLASS} p-6 text-center`}>
                    Aún no hay categorías configuradas.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {categories.map((c) => (
                      <article
                        key={c.id_category}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className={`${BADGE}`}>#{c.id_category}</div>
                          <div className="truncate">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold">
                                {c.name}
                              </span>
                              {c.requires_user && (
                                <span className={BADGE}>Vincula usuario</span>
                              )}
                              {c.requires_operator && (
                                <span className={BADGE}>Vincula operador</span>
                              )}
                              {!c.enabled && (
                                <span className={`${BADGE}`}>
                                  Deshabilitada
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => toggleCategoryEnabled(c)}
                            className={ICON_BTN}
                          >
                            {c.enabled ? "Deshabilitar" : "Habilitar"}
                          </button>

                          <button
                            onClick={() => openEditCategory(c)}
                            className={ICON_BTN}
                          >
                            Editar
                          </button>

                          <button
                            onClick={() => deleteCategory(c)}
                            className={`${ICON_BTN} bg-red-600 text-red-100 dark:bg-red-800`}
                          >
                            Eliminar
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Modales */}
        <Modal
          open={currencyModalOpen}
          onClose={() => setCurrencyModalOpen(false)}
          title={currencyEditing ? "Editar moneda" : "Nueva moneda"}
          footer={
            <>
              <button
                onClick={() => setCurrencyModalOpen(false)}
                className={ICON_BTN}
              >
                Cancelar
              </button>
              <button onClick={saveCurrency} className={ICON_BTN}>
                Guardar
              </button>
            </>
          }
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Código</Label>
              <Input
                value={currencyForm.code}
                onChange={(e) =>
                  setCurrencyForm((f) => ({
                    ...f,
                    code: e.target.value.toUpperCase(),
                  }))
                }
                placeholder="ARS / USD"
              />
            </div>
            <div>
              <Label>Símbolo</Label>
              <Input
                value={currencyForm.symbol}
                onChange={(e) =>
                  setCurrencyForm((f) => ({ ...f, symbol: e.target.value }))
                }
                placeholder="$ / U$D"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Nombre</Label>
              <Input
                value={currencyForm.name}
                onChange={(e) =>
                  setCurrencyForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="Peso argentino / Dólar estadounidense"
              />
            </div>
            <div className="sm:col-span-2">
              <Switch
                checked={currencyForm.enabled}
                onChange={(v) => setCurrencyForm((f) => ({ ...f, enabled: v }))}
                label="Habilitada"
              />
            </div>
          </div>
        </Modal>

        <Modal
          open={accountModalOpen}
          onClose={() => setAccountModalOpen(false)}
          title={accountEditing ? "Editar cuenta" : "Nueva cuenta"}
          footer={
            <>
              <button
                onClick={() => setAccountModalOpen(false)}
                className={ICON_BTN}
              >
                Cancelar
              </button>
              <button onClick={saveAccount} className={ICON_BTN}>
                Guardar
              </button>
            </>
          }
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Nombre</Label>
              <Input
                value={accountForm.name}
                onChange={(e) =>
                  setAccountForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="Banco / Billetera / Caja…"
              />
            </div>
            <div>
              <Label>Alias (opcional)</Label>
              <Input
                value={accountForm.alias}
                onChange={(e) =>
                  setAccountForm((f) => ({ ...f, alias: e.target.value }))
                }
                placeholder="Ej: Macro Sucursal Centro"
              />
            </div>
            <div>
              <Label>Moneda (opcional)</Label>
              <select
                value={accountForm.currency}
                onChange={(e) =>
                  setAccountForm((f) => ({ ...f, currency: e.target.value }))
                }
                className="w-full cursor-pointer appearance-none rounded-3xl border border-white/30 bg-white/10 px-3 py-2 outline-none backdrop-blur dark:border-white/10 dark:bg-white/10"
              >
                <option value="">— Sin moneda —</option>
                {enabledCurrencies.map((c) => (
                  <option key={c.id_currency} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <Switch
                checked={accountForm.enabled}
                onChange={(v) => setAccountForm((f) => ({ ...f, enabled: v }))}
                label="Habilitada"
              />
            </div>
          </div>
        </Modal>

        <Modal
          open={methodModalOpen}
          onClose={() => setMethodModalOpen(false)}
          title={methodEditing ? "Editar método" : "Nuevo método"}
          footer={
            <>
              <button
                onClick={() => setMethodModalOpen(false)}
                className={ICON_BTN}
              >
                Cancelar
              </button>
              <button onClick={saveMethod} className={ICON_BTN}>
                Guardar
              </button>
            </>
          }
        >
          <div className="grid grid-cols-1 gap-3">
            <div>
              <Label>Nombre</Label>
              <Input
                value={methodForm.name}
                onChange={(e) =>
                  setMethodForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="Efectivo / Transferencia / Crédito / IATA…"
              />
            </div>
            <div>
              <Label>Código</Label>
              <Input
                value={methodForm.code}
                onChange={(e) =>
                  setMethodForm((f) => ({ ...f, code: e.target.value }))
                }
                placeholder="cash / transfer / card…"
                disabled={!!methodEditing?.lock_system}
                title={
                  methodEditing?.lock_system
                    ? "Código bloqueado por sistema"
                    : undefined
                }
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Switch
                checked={methodForm.requires_account}
                onChange={(v) =>
                  setMethodForm((f) => ({ ...f, requires_account: v }))
                }
                label="Requiere cuenta"
              />
              <Switch
                checked={methodForm.enabled}
                onChange={(v) => setMethodForm((f) => ({ ...f, enabled: v }))}
                label="Habilitado"
              />
            </div>
          </div>
        </Modal>

        <Modal
          open={catModalOpen}
          onClose={() => setCatModalOpen(false)}
          title={catEditing ? "Editar categoría" : "Nueva categoría"}
          footer={
            <>
              <button
                onClick={() => setCatModalOpen(false)}
                className={ICON_BTN}
              >
                Cancelar
              </button>
              <button onClick={saveCategory} className={ICON_BTN}>
                Guardar
              </button>
            </>
          }
        >
          <div className="grid grid-cols-1 gap-3">
            <div>
              <Label>Nombre</Label>
              <Input
                value={catForm.name}
                onChange={(e) =>
                  setCatForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="AFIP / SUELDO / OPERADOR / MANTENCIÓN…"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Switch
                checked={catForm.enabled}
                onChange={(v) => setCatForm((f) => ({ ...f, enabled: v }))}
                label="Habilitada"
              />
              <Switch
                checked={catForm.requires_user}
                onChange={(v) =>
                  setCatForm((f) => ({ ...f, requires_user: v }))
                }
                label="Vincula a un usuario"
              />
            </div>
          </div>
        </Modal>

        <ToastContainer position="bottom-right" />
      </section>
    </ProtectedRoute>
  );
}
