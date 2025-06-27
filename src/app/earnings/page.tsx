"use client";

import React, { useState, useCallback, useMemo } from "react";
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
  TooltipProps,
} from "recharts";

interface EarningItem {
  currency: "ARS" | "USD";
  userId: number;
  userName: string;
  teamId: number;
  teamName: string;
  totalSellerComm: number;
  totalLeaderComm: number;
  totalAgencyShare: number;
}

interface EarningsResponse {
  totals: {
    sellerComm: Record<"ARS" | "USD", number>;
    leaderComm: Record<"ARS" | "USD", number>;
    agencyShare: Record<"ARS" | "USD", number>;
  };
  items: EarningItem[];
}

function getDefaultRange() {
  const today = new Date();
  const past = new Date(today);
  past.setDate(past.getDate() - 30);
  return {
    from: past.toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10),
  };
}

const MoneyTooltip = ({ active, payload }: TooltipProps<number, string>) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="space-y-2 rounded-3xl border border-white/10 bg-white/10 p-4 text-black shadow-md backdrop-blur-3xl dark:bg-black/10 dark:text-white">
      {payload.map((p) => {
        // Hacemos cast a nuestro tipo
        const item = p.payload as EarningItem;
        const cur = item.currency;
        const val = p.value ?? 0;
        return (
          <p key={p.dataKey} className="text-sm">
            <strong>{p.name}:</strong>{" "}
            {new Intl.NumberFormat("es-AR", {
              style: "currency",
              currency: cur,
            }).format(val)}
          </p>
        );
      })}
    </div>
  );
};

interface ChartSectionProps {
  title: string;
  data: EarningItem[];
  colors: [string, string, string];
}
const ChartSection: React.FC<ChartSectionProps> = ({ title, data, colors }) => (
  <div className="mb-8 h-fit space-y-3 rounded-3xl border border-white/10 bg-white/10 p-6 text-black shadow-md backdrop-blur dark:text-white">
    <h2 className="mb-4 text-center text-2xl font-medium">{title}</h2>
    <ResponsiveContainer width="100%" height={370}>
      <BarChart data={data} margin={{ bottom: 80 }}>
        <XAxis
          dataKey="userName"
          height={60}
          interval={0}
          angle={-45}
          textAnchor="end"
          tick={{ fill: "currentColor", fontSize: 12 }}
        />
        <YAxis tick={{ fill: "currentColor", fontSize: 12 }} />
        <Tooltip content={<MoneyTooltip />} />
        <Legend
          verticalAlign="top"
          wrapperStyle={{ color: "currentColor" }}
          height={80}
        />
        <Bar
          dataKey="totalSellerComm"
          stackId="a"
          name="Vendedor"
          fill={colors[0]}
        />
        <Bar
          dataKey="totalLeaderComm"
          stackId="a"
          name="Líder"
          fill={colors[1]}
        />
        <Bar
          dataKey="totalAgencyShare"
          stackId="a"
          name="Agencia"
          fill={colors[2]}
          radius={[8, 8, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  </div>
);

export default function EarningsPage() {
  const { from: defaultFrom, to: defaultTo } = useMemo(getDefaultRange, []);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [data, setData] = useState<EarningsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const formatCurrency = useCallback(
    (value: number, cur: "ARS" | "USD") =>
      new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: cur,
      }).format(value),
    [],
  );

  const loadEarnings = useCallback(async () => {
    if (new Date(from) > new Date(to)) {
      toast.error("El rango 'Desde' no puede ser posterior a 'Hasta'");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/earnings?from=${from}&to=${to}`);
      if (!res.ok) throw new Error("Error al cargar ganancias");
      const json: EarningsResponse = await res.json();
      setData(json);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  const itemsARS = useMemo(
    () => data?.items.filter((i) => i.currency === "ARS") || [],
    [data],
  );
  const itemsUSD = useMemo(
    () => data?.items.filter((i) => i.currency === "USD") || [],
    [data],
  );

  return (
    <ProtectedRoute>
      <div className="">
        <h1 className="mb-6 text-2xl font-semibold dark:text-white">
          Ganancias
        </h1>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            loadEarnings();
          }}
          className="mb-6 flex flex-wrap items-end gap-4"
        >
          <div>
            <label className="block dark:text-white">Desde</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="flex w-fit cursor-pointer appearance-none rounded-2xl bg-white/10 px-4 py-2 text-black shadow-md outline-none backdrop-blur dark:text-white"
              required
            />
          </div>
          <div>
            <label className="block dark:text-white">Hasta</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="flex w-fit cursor-pointer appearance-none rounded-2xl bg-white/10 px-4 py-2 text-black shadow-md outline-none backdrop-blur dark:text-white"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="ml-auto w-32 rounded-full bg-sky-100 py-2 text-black shadow-md transition-transform hover:scale-95 active:scale-90 disabled:opacity-50 dark:bg-white/10 dark:text-white dark:backdrop-blur"
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

        {data && (
          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {(["ARS", "USD"] as const).map((cur) => (
              <div
                key={cur}
                className="h-fit space-y-3 rounded-3xl border border-white/10 bg-white/10 p-6 text-black shadow-md backdrop-blur dark:text-white"
              >
                <p className="text-end font-light tracking-wide">{cur}</p>
                <div>
                  <p className="font-medium">Vendedores</p>
                  <p className="font-light tracking-wide">
                    {formatCurrency(data.totals.sellerComm[cur], cur)}
                  </p>
                </div>

                <div>
                  <p className="font-medium">Líderes</p>
                  <p className="font-light tracking-wide">
                    {formatCurrency(data.totals.leaderComm[cur], cur)}
                  </p>
                </div>

                <div>
                  <p className="font-medium">Agencia</p>
                  <p className="font-light tracking-wide">
                    {formatCurrency(data.totals.agencyShare[cur], cur)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {itemsARS.length > 0 && (
          <ChartSection
            title="Pesos"
            data={itemsARS}
            colors={["#ea580c", "#f97316", "#fb923c"]}
          />
        )}

        {itemsUSD.length > 0 && (
          <ChartSection
            title="Dolares"
            data={itemsUSD}
            colors={["#166534", "#16a34a", "#22c55e"]}
          />
        )}

        {itemsARS.length > 0 && (
          <div className="mb-8 h-fit space-y-3 overflow-x-auto rounded-3xl border border-white/10 bg-white/10 p-6 text-black shadow-md backdrop-blur dark:text-white">
            <h3 className="mb-2 font-medium">ARS</h3>
            <table className="w-full text-center">
              <thead className="">
                <tr className="">
                  <th className="px-4 py-2 font-medium">Equipo</th>
                  <th className="px-4 py-2 font-medium">Vendedor</th>
                  <th className="px-4 py-2 font-medium">Comisión Vendedor</th>
                  <th className="px-4 py-2 font-medium">Comisión Líder</th>
                  <th className="px-4 py-2 font-medium">Agencia</th>
                </tr>
              </thead>
              <tbody>
                {itemsARS.map((it) => (
                  <tr
                    key={`ARS-${it.teamId}-${it.userId}`}
                    className="border-b font-light dark:border-white/10"
                  >
                    <td className="px-4 py-2">{it.teamName}</td>
                    <td className="px-4 py-2">{it.userName}</td>
                    <td className="px-4 py-2">
                      {formatCurrency(it.totalSellerComm, "ARS")}
                    </td>
                    <td className="px-4 py-2">
                      {formatCurrency(it.totalLeaderComm, "ARS")}
                    </td>
                    <td className="px-4 py-2">
                      {formatCurrency(it.totalAgencyShare, "ARS")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {itemsUSD.length > 0 && (
          <div className="mb-8 h-fit space-y-3 overflow-x-auto rounded-3xl border border-white/10 bg-white/10 p-6 text-black shadow-md backdrop-blur dark:text-white">
            <h3 className="mb-2 font-medium">USD</h3>
            <table className="w-full text-center">
              <thead className="">
                <tr>
                  <th className="px-4 py-2 font-medium">Equipo</th>
                  <th className="px-4 py-2 font-medium">Vendedor</th>
                  <th className="px-4 py-2 font-medium">Comisión Vendedor</th>
                  <th className="px-4 py-2 font-medium">Comisión Líder</th>
                  <th className="px-4 py-2 font-medium">Agencia</th>
                </tr>
              </thead>
              <tbody>
                {itemsUSD.map((it) => (
                  <tr
                    key={`USD-${it.teamId}-${it.userId}`}
                    className="border-b font-light dark:border-white/10"
                  >
                    <td className="px-4 py-2">{it.teamName}</td>
                    <td className="px-4 py-2">{it.userName}</td>
                    <td className="px-4 py-2">
                      {formatCurrency(it.totalSellerComm, "USD")}
                    </td>
                    <td className="px-4 py-2">
                      {formatCurrency(it.totalLeaderComm, "USD")}
                    </td>
                    <td className="px-4 py-2">
                      {formatCurrency(it.totalAgencyShare, "USD")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.items.length === 0 && !loading && (
          <p className="text-center dark:text-white">
            No hay datos para ese rango.
          </p>
        )}
      </div>
    </ProtectedRoute>
  );
}
