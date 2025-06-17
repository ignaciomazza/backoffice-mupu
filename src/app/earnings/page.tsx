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

// Rango por defecto (últimos 30 días)
function getDefaultRange() {
  const today = new Date();
  const past = new Date(today);
  past.setDate(past.getDate() - 30);
  return {
    from: past.toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10),
  };
}

// Tooltip personalizado
const MoneyTooltip = ({ active, payload }: TooltipProps<number, string>) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded bg-white p-2 shadow dark:bg-black dark:text-white">
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

// Sección de gráfico reutilizable
interface ChartSectionProps {
  title: string;
  data: EarningItem[];
  colors: [string, string, string];
}
const ChartSection: React.FC<ChartSectionProps> = ({ title, data, colors }) => (
  <div className="mb-8 rounded-3xl bg-white p-4 text-black shadow dark:bg-black dark:text-white">
    <h2 className="mb-4 text-xl font-semibold">{title}</h2>
    <ResponsiveContainer width="100%" height={300}>
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
        <Legend verticalAlign="top" wrapperStyle={{ color: "currentColor" }} />
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
      <div className="p-6">
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
              className="rounded-xl border px-3 py-2 dark:border-white/50 dark:bg-[#252525] dark:text-white"
              required
            />
          </div>
          <div>
            <label className="block dark:text-white">Hasta</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-xl border px-3 py-2 dark:border-white/50 dark:bg-[#252525] dark:text-white"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="ml-auto rounded-full bg-black px-6 py-2 text-white hover:scale-95 active:scale-90 disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {loading ? <Spinner /> : "Buscar"}
          </button>
        </form>

        {data && (
          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {(["ARS", "USD"] as const).map((cur) => (
              <div
                key={cur}
                className="rounded-3xl bg-white p-4 shadow dark:bg-black dark:text-white"
              >
                <p className="font-medium">Vendedores ({cur})</p>
                <p className="mt-1 text-xl font-light">
                  {formatCurrency(data.totals.sellerComm[cur], cur)}
                </p>

                <p className="mt-3 font-medium">Líderes ({cur})</p>
                <p className="mt-1 text-xl font-light">
                  {formatCurrency(data.totals.leaderComm[cur], cur)}
                </p>

                <p className="mt-3 font-medium">Agencia ({cur})</p>
                <p className="mt-1 text-xl font-light">
                  {formatCurrency(data.totals.agencyShare[cur], cur)}
                </p>
              </div>
            ))}
          </div>
        )}

        {itemsARS.length > 0 && (
          <ChartSection
            title="Desglose ARS"
            data={itemsARS}
            colors={["#000", "#4B5563", "#9CA3AF"]}
          />
        )}

        {itemsUSD.length > 0 && (
          <ChartSection
            title="Desglose USD"
            data={itemsUSD}
            colors={["#000", "#4B5563", "#9CA3AF"]}
          />
        )}

        {itemsARS.length > 0 && (
          <div className="mb-8 overflow-x-auto rounded-3xl bg-white p-4 shadow dark:bg-black dark:text-white">
            <h3 className="mb-2 font-semibold">Detalle ARS</h3>
            <table className="w-full text-center">
              <thead className="bg-gray-100 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-2">Equipo</th>
                  <th className="px-4 py-2">Vendedor</th>
                  <th className="px-4 py-2">Comisión Vendedor</th>
                  <th className="px-4 py-2">Comisión Líder</th>
                  <th className="px-4 py-2">Agencia</th>
                </tr>
              </thead>
              <tbody>
                {itemsARS.map((it) => (
                  <tr
                    key={`ARS-${it.teamId}-${it.userId}`}
                    className="border odd:bg-gray-50 dark:border-white/20 dark:odd:bg-gray-800"
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
          <div className="mb-8 overflow-x-auto rounded-3xl bg-white p-4 shadow dark:bg-black dark:text-white">
            <h3 className="mb-2 font-semibold">Detalle USD</h3>
            <table className="w-full text-center">
              <thead className="bg-gray-100 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-2">Equipo</th>
                  <th className="px-4 py-2">Vendedor</th>
                  <th className="px-4 py-2">Comisión Vendedor</th>
                  <th className="px-4 py-2">Comisión Líder</th>
                  <th className="px-4 py-2">Agencia</th>
                </tr>
              </thead>
              <tbody>
                {itemsUSD.map((it) => (
                  <tr
                    key={`USD-${it.teamId}-${it.userId}`}
                    className="border odd:bg-gray-50 dark:border-white/20 dark:odd:bg-gray-800"
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
