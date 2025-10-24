// src/app/earnings/my/page.tsx
"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import { toast } from "react-toastify";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  TooltipProps,
} from "recharts";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import {
  loadFinancePicks,
  type FinanceCurrency,
} from "@/utils/loadFinancePicks";

/* ============ Helpers de fecha (seguros contra TZ) ============ */
function firstDayOfMonthLocal(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonthsLocal(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function ymdLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function defaultRange12Months() {
  const today = new Date();
  const start = firstDayOfMonthLocal(addMonthsLocal(today, -11));
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { from: ymdLocal(start), to: ymdLocal(end) };
}
function monthKeyToLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, (m ?? 1) - 1, 1);
  return d.toLocaleDateString("es-AR", { month: "short", year: "numeric" });
}

/* ============ Tipos API ============ */
type MyMonthlyItem = {
  month: string; // YYYY-MM
  currency: string; // código
  seller: number;
  beneficiary: number;
  total: number;
};
type MyMonthlyResponse = {
  items: MyMonthlyItem[];
  totalsByCurrency: Record<
    string,
    { seller: number; beneficiary: number; total: number }
  >;
};

/* ============ UI consts ============ */
const CARD =
  "h-fit space-y-3 rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white";

/* ============ Formateo de dinero sin depender de `decimals` ============ */
function formatMoney(value: number, code: string) {
  const n = Number.isFinite(value) ? Number(value) : 0;
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: code,
      currencyDisplay: "symbol",
    }).format(n);
  } catch {
    return `${code} ${new Intl.NumberFormat("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n)}`;
  }
}

/* ============ Tooltip ============ */
const MoneyTooltip: React.FC<
  TooltipProps<number, string> & { code: string }
> = ({ active, payload, label, code }) => {
  if (!active || !payload?.length) return null;
  const seller = payload.find((p) => p.dataKey === "seller")?.value ?? 0;
  const beneficiary =
    payload.find((p) => p.dataKey === "beneficiary")?.value ?? 0;
  const total = (Number(seller) || 0) + (Number(beneficiary) || 0);

  return (
    <div className="space-y-2 rounded-2xl border border-white/10 bg-white/70 p-3 text-sky-950 shadow-md backdrop-blur dark:bg-sky-950/70 dark:text-white">
      <p className="text-xs font-medium">{label}</p>
      <p className="text-xs">
        <strong>Vendedor:</strong> {formatMoney(Number(seller) || 0, code)}
      </p>
      <p className="text-xs">
        <strong>Beneficiario:</strong>{" "}
        {formatMoney(Number(beneficiary) || 0, code)}
      </p>
      <p className="text-xs">
        <strong>Total:</strong> {formatMoney(total, code)}
      </p>
    </div>
  );
};

/* ============ Tipado local de picks para evitar `any` ============ */
type CurrencyLike = Pick<FinanceCurrency, "code"> & {
  enabled?: boolean | null;
};

/* ============ Página ============ */
export default function MyEarningsPage() {
  const { token } = useAuth();
  const { from: defaultFrom, to: defaultTo } = useMemo(
    defaultRange12Months,
    [],
  );
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [loading, setLoading] = useState(false);

  const [items, setItems] = useState<MyMonthlyItem[]>([]);
  const [totalsByCurrency, setTotalsByCurrency] = useState<
    MyMonthlyResponse["totalsByCurrency"]
  >({});

  const loadAll = useCallback(async () => {
    if (new Date(from) > new Date(to)) {
      toast.error("El rango 'Desde' no puede ser posterior a 'Hasta'");
      return;
    }
    if (!token) {
      toast.error("Sesión no iniciada");
      return;
    }
    setLoading(true);
    try {
      // Monedas habilitadas
      const picks = await loadFinancePicks(token);
      const raw = (picks?.currencies ?? []) as unknown as CurrencyLike[];
      const enabled = raw.filter((c) => !!c.enabled);
      const codesEnabled = new Set(enabled.map((c) => c.code));

      const res = await authFetch(
        `/api/earnings/my-monthly?from=${from}&to=${to}`,
        { cache: "no-store" },
        token,
      );
      if (!res.ok) throw new Error("Error al cargar datos");
      const json: MyMonthlyResponse = await res.json();

      setItems(json.items.filter((i) => codesEnabled.has(i.currency)));

      const filteredTotals: typeof json.totalsByCurrency = {};
      for (const [code, v] of Object.entries(json.totalsByCurrency)) {
        if (codesEnabled.has(code)) filteredTotals[code] = v;
      }
      setTotalsByCurrency(filteredTotals);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [from, to, token]);

  // Llamada inicial UNA vez, sin desactivar eslint
  const didRunInitial = useRef(false);
  useEffect(() => {
    if (!didRunInitial.current) {
      didRunInitial.current = true;
      void loadAll();
    }
  }, [loadAll]);

  /* Series por moneda con meses faltantes en 0 */
  const monthsRange = useMemo(() => {
    const start = new Date(from + "T00:00:00");
    const end = new Date(to + "T00:00:00");
    const list: string[] = [];
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur <= end) {
      list.push(
        `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`,
      );
      cur.setMonth(cur.getMonth() + 1);
    }
    return list;
  }, [from, to]);

  const dataByCurrency = useMemo(() => {
    const map: Record<
      string,
      Array<{
        month: string;
        seller: number;
        beneficiary: number;
        total: number;
      }>
    > = {};
    const grouped: Record<
      string,
      Record<string, { seller: number; beneficiary: number; total: number }>
    > = {};

    for (const it of items) {
      grouped[it.currency] ||= {};
      grouped[it.currency][it.month] ||= {
        seller: 0,
        beneficiary: 0,
        total: 0,
      };
      grouped[it.currency][it.month].seller += it.seller;
      grouped[it.currency][it.month].beneficiary += it.beneficiary;
      grouped[it.currency][it.month].total += it.total;
    }

    for (const cur of Object.keys(grouped)) {
      map[cur] = monthsRange.map((m) => {
        const s = grouped[cur][m] || { seller: 0, beneficiary: 0, total: 0 };
        return {
          month: monthKeyToLabel(m),
          seller: s.seller,
          beneficiary: s.beneficiary,
          total: s.total,
        };
      });
    }
    return map;
  }, [items, monthsRange]);

  return (
    <ProtectedRoute>
      <section className="text-sky-950 dark:text-white">
        {/* Header */}
        <div className="mb-6 flex w-full flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Mis ganancias (mensual)</h1>
            <p className="text-sm opacity-70">
              Detalle por mes y por moneda. Incluye lo que ganás como vendedor y
              como beneficiario.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void loadAll();
            }}
            className="flex flex-wrap items-end gap-3"
          >
            <div>
              <label className="block text-sm opacity-70">Desde</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="flex w-fit cursor-pointer appearance-none rounded-2xl bg-white/70 px-4 py-2 text-sky-950 shadow-md shadow-sky-950/10 outline-none backdrop-blur dark:bg-white/10 dark:text-white"
                required
              />
            </div>
            <div>
              <label className="block text-sm opacity-70">Hasta</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="flex w-fit cursor-pointer appearance-none rounded-2xl bg-white/70 px-4 py-2 text-sky-950 shadow-md shadow-sky-950/10 outline-none backdrop-blur dark:bg-white/10 dark:text-white"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-sky-100 px-4 py-2 text-sky-950 shadow-sm shadow-sky-950/10 transition-transform hover:scale-95 active:scale-90 disabled:opacity-50 dark:bg-white/10 dark:text-white dark:backdrop-blur"
            >
              {loading ? (
                <Spinner />
              ) : (
                <div className="flex w-full items-center justify-center gap-2">
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
                      d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                    />
                  </svg>
                  <p>Buscar</p>
                </div>
              )}
            </button>
          </form>
        </div>

        {/* Totales por moneda */}
        {Object.keys(totalsByCurrency).length > 0 && (
          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {Object.entries(totalsByCurrency).map(([code, v]) => (
              <div
                key={code}
                className={
                  CARD +
                  " bg-gradient-to-br from-sky-50/80 to-white/10 dark:from-sky-900/30 dark:to-sky-900/10"
                }
              >
                <p className="text-end font-light tracking-wide">{code}</p>
                <div>
                  <p className="font-medium">Como vendedor</p>
                  <p className="font-light tracking-wide">
                    {formatMoney(v.seller, code)}
                  </p>
                </div>
                <div>
                  <p className="font-medium">Como beneficiario</p>
                  <p className="font-light tracking-wide">
                    {formatMoney(v.beneficiary, code)}
                  </p>
                </div>
                <div>
                  <p className="font-medium">Total</p>
                  <p className="font-light tracking-wide">
                    {formatMoney(v.total, code)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Gráficos por moneda */}
        {Object.keys(dataByCurrency).map((code) => {
          const data = dataByCurrency[code] || [];
          if (data.length === 0) return null;
          return (
            <div
              key={code}
              className={
                CARD +
                " mb-8 bg-gradient-to-br from-white/60 to-white/10 dark:from-sky-950/30 dark:to-sky-950/10"
              }
            >
              <h2 className="mb-4 text-center text-2xl font-medium">{code}</h2>
              <ResponsiveContainer width="100%" height={380}>
                <BarChart
                  data={data}
                  margin={{ bottom: 70, left: 8, right: 8 }}
                >
                  <CartesianGrid
                    stroke="currentColor"
                    strokeOpacity={0.15}
                    strokeDasharray="3 3"
                  />
                  <XAxis
                    dataKey="month"
                    height={60}
                    interval={0}
                    angle={-35}
                    textAnchor="end"
                    tick={{ fill: "currentColor", fontSize: 12 }}
                  />
                  <YAxis
                    tick={{ fill: "currentColor", fontSize: 12 }}
                    width={80}
                  />
                  <Tooltip content={<MoneyTooltip code={code} />} />
                  <Legend
                    verticalAlign="top"
                    wrapperStyle={{ color: "currentColor" }}
                    height={50}
                  />
                  <Bar
                    dataKey="seller"
                    stackId="a"
                    name="Vendedor"
                    fill="rgba(14,165,233,0.85)" // sky-500
                  />
                  <Bar
                    dataKey="beneficiary"
                    stackId="a"
                    name="Beneficiario"
                    radius={[8, 8, 0, 0]}
                    fill="rgba(2,132,199,0.9)" // sky-600
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          );
        })}

        {/* Tablas por moneda */}
        {Object.keys(dataByCurrency).map((code) => {
          const data = dataByCurrency[code] || [];
          if (data.length === 0) return null;
          return (
            <div
              key={`tbl-${code}`}
              className={
                CARD +
                " mb-8 overflow-x-auto bg-gradient-to-br from-white/60 to-white/10 dark:from-sky-950/30 dark:to-sky-950/10"
              }
            >
              <h3 className="mb-2 font-medium">{code}</h3>
              <table className="w-full text-center">
                <thead>
                  <tr className="text-sky-700 dark:text-sky-200">
                    <th className="px-4 py-2 font-medium">Mes</th>
                    <th className="px-4 py-2 font-medium">Vendedor</th>
                    <th className="px-4 py-2 font-medium">Beneficiario</th>
                    <th className="px-4 py-2 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <tr
                      key={`${code}-${row.month}`}
                      className="border-b font-light dark:border-white/10"
                    >
                      <td className="px-4 py-2">{row.month}</td>
                      <td className="px-4 py-2">
                        {formatMoney(row.seller, code)}
                      </td>
                      <td className="px-4 py-2">
                        {formatMoney(row.beneficiary, code)}
                      </td>
                      <td className="px-4 py-2">
                        {formatMoney(row.total, code)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}

        {!loading && items.length === 0 && (
          <p className="text-center opacity-80">No hay datos para ese rango.</p>
        )}
      </section>
    </ProtectedRoute>
  );
}
