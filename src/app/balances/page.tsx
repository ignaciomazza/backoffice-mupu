// src/app/bookings/page.tsx

"use client";

import React, { useState, useCallback, useMemo } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import Spinner from "@/components/Spinner";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Link from "next/link";

interface Booking {
  id_booking: number;
  clientStatus: string;
  operatorStatus: string;
  creation_date: string;
  titular: {
    first_name: string;
    last_name: string;
  };
  services: {
    sale_price: number;
    currency: "ARS" | "USD";
  }[];
  Receipt: {
    amount: number;
    amount_currency: "ARS" | "USD";
  }[];
}

export default function BalancesPage() {
  const { token } = useAuth();
  const [clientStatusArr, setClientStatusArr] = useState<string[]>([]);
  const [operatorStatusArr, setOperatorStatusArr] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);

  const stats = useMemo(() => {
    const totals = { ARS: 0, USD: 0 };
    const paidTotals = { ARS: 0, USD: 0 };

    data.forEach((b) => {
      b.services.forEach((s) => {
        totals[s.currency] = (totals[s.currency] || 0) + s.sale_price;
      });
      b.Receipt.forEach((r) => {
        paidTotals[r.amount_currency] =
          (paidTotals[r.amount_currency] || 0) + r.amount;
      });
    });

    const debtTotals = {
      ARS: totals.ARS - (paidTotals.ARS || 0),
      USD: totals.USD - (paidTotals.USD || 0),
    };

    return {
      count: data.length,
      totals,
      debtTotals,
    };
  }, [data]);

  const fmtARS = useCallback(
    (v: number) =>
      new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
      }).format(v),
    [],
  );

  const fmtUSD = useCallback(
    (v: number) =>
      new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "USD",
      })
        .format(v)
        .replace("US$", "U$D"),
    [],
  );

  const formatTotalByCurrency = useCallback(
    (services: Booking["services"]) => {
      const sums = services.reduce<Record<string, number>>((acc, s) => {
        acc[s.currency] = (acc[s.currency] || 0) + s.sale_price;
        return acc;
      }, {});
      const parts: string[] = [];
      if (sums["ARS"] != null) parts.push(fmtARS(sums["ARS"]));
      if (sums["USD"] != null) parts.push(fmtUSD(sums["USD"]));
      return parts.join(" y ");
    },
    [fmtARS, fmtUSD],
  );

  const formatDebtByCurrency = useCallback(
    (services: Booking["services"], receipts: Booking["Receipt"]) => {
      // Suma ventas por moneda
      const sales = services.reduce<Record<string, number>>((acc, s) => {
        acc[s.currency] = (acc[s.currency] || 0) + s.sale_price;
        return acc;
      }, {});

      // Suma recibos por moneda (usamos amount_currency)
      const paid = receipts.reduce<Record<string, number>>((acc, r) => {
        const cur = r.amount_currency;
        acc[cur] = (acc[cur] || 0) + r.amount;
        return acc;
      }, {});

      // Resta para deuda neta por moneda
      const debts: Record<string, number> = {};
      for (const cur of Object.keys(sales)) {
        debts[cur] = sales[cur] - (paid[cur] || 0);
      }

      const parts: string[] = [];
      if (debts["ARS"] != null) parts.push(fmtARS(debts["ARS"]));
      if (debts["USD"] != null) parts.push(fmtUSD(debts["USD"]));
      return parts.join(" y ");
    },
    [fmtARS, fmtUSD],
  );

  const toggle = (
    arr: string[],
    setArr: (s: string[]) => void,
    val: string,
  ) => {
    setArr(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
  };

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (clientStatusArr.length)
        qs.append("clientStatus", clientStatusArr.join(","));
      if (operatorStatusArr.length)
        qs.append("operatorStatus", operatorStatusArr.join(","));
      if (from) qs.append("from", from);
      if (to) qs.append("to", to);

      const res = await fetch(`/api/bookings?${qs.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: token ? "include" : undefined,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al cargar reservas");
      const sorted = json.sort(
        (a: Booking, b: Booking) =>
          new Date(b.creation_date).getTime() -
          new Date(a.creation_date).getTime(),
      );
      setData(sorted);
    } catch (err: unknown) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [clientStatusArr, operatorStatusArr, from, to, token]);

  const downloadCSV = () => {
    const header = [
      "Reserva",
      "Titular",
      "Estado Cliente",
      "Estado Operador",
      "Fecha Creación",
      "Total Venta",
      "Deuda",
    ];
    const rows = data.map((b) => [
      b.id_booking,
      `${b.titular.first_name} ${b.titular.last_name}`,
      b.clientStatus,
      b.operatorStatus,
      new Date(b.creation_date).toLocaleDateString("es-AR"),
      formatTotalByCurrency(b.services),
      formatDebtByCurrency(b.services, b.Receipt),
    ]);
    const csvContent = [header, ...rows].map((r) => r.join(";")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reservas_${from || "all"}_${to || "all"}.csv`;
    a.click();
  };

  return (
    <ProtectedRoute>
      <div className="">
        <h1 className="mb-6 text-2xl font-semibold text-sky-950 dark:text-white">
          Reservas
        </h1>

        {/* Filtros */}
        <div className="mb-6 space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Estado Cliente */}
            <div className="rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white">
              <p className="mb-2 font-medium dark:font-medium">
                Estado Cliente
              </p>
              <div className="flex gap-2">
                {["Pendiente", "Pago", "Facturado"].map((st) => (
                  <div
                    key={st}
                    onClick={() =>
                      toggle(clientStatusArr, setClientStatusArr, st)
                    }
                    className={`flex-1 cursor-pointer rounded-full px-4 py-2 text-center font-light ${
                      clientStatusArr.includes(st)
                        ? "border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white"
                        : "text-sky-950/70 hover:bg-sky-950/5 dark:text-white/70 dark:hover:bg-white/5"
                    }`}
                  >
                    {st}
                  </div>
                ))}
              </div>
            </div>

            {/* Estado Operador */}
            <div className="rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white">
              <p className="mb-2 font-medium dark:font-medium">
                Estado Operador
              </p>
              <div className="flex gap-2">
                {["Pendiente", "Pago"].map((st) => (
                  <div
                    key={st}
                    onClick={() =>
                      toggle(operatorStatusArr, setOperatorStatusArr, st)
                    }
                    className={`flex-1 cursor-pointer rounded-full px-4 py-2 text-center font-light ${
                      operatorStatusArr.includes(st)
                        ? "border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white"
                        : "text-sky-950/70 hover:bg-sky-950/5 dark:text-white/70 dark:hover:bg-white/5"
                    }`}
                  >
                    {st}
                  </div>
                ))}
              </div>
            </div>

            {/* Fecha Desde */}
            <div className="rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white">
              <label className="mb-2 block font-medium dark:font-medium">
                Desde
              </label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full cursor-pointer appearance-none rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sky-950 shadow-md outline-none backdrop-blur dark:border dark:border-white/10 dark:text-white"
              />
            </div>

            {/* Fecha Hasta */}
            <div className="rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white">
              <label className="mb-2 block font-medium dark:font-medium">
                Hasta
              </label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full cursor-pointer appearance-none rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sky-950 shadow-md shadow-sky-950/10 outline-none backdrop-blur dark:border dark:border-white/10 dark:text-white"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={fetchBookings}
              disabled={loading}
              className="ml-auto w-32 rounded-full bg-sky-100 p-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 disabled:opacity-50 dark:bg-white/10 dark:text-white dark:backdrop-blur"
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
          </div>
        </div>

        {/* Resultados */}
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner />
          </div>
        ) : (
          data.length > 0 && (
            <>
              <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white">
                  <p className="text-lg font-medium">Total de reservas</p>
                  <p className="font-light">{stats.count}</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white">
                  <p className="text-lg font-medium">Venta total</p>
                  <p className="font-light">
                    {fmtARS(stats.totals.ARS)}
                    {stats.totals.USD > 0 && ` y ${fmtUSD(stats.totals.USD)}`}
                  </p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white">
                  <p className="text-lg font-medium">Deuda total</p>
                  <p className="font-light">
                    {fmtARS(stats.debtTotals.ARS)}
                    {stats.debtTotals.USD > 0 &&
                      ` y ${fmtUSD(stats.debtTotals.USD)}`}
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto rounded-3xl border border-white/10 bg-white/10 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white">
                <table className="w-full">
                  <thead>
                    <tr className="text-sky-950 dark:text-white">
                      <th className="px-4 py-3 font-normal">Reserva</th>
                      <th className="px-4 py-3 font-normal">Titular</th>
                      <th className="px-4 py-3 font-normal">Cliente</th>
                      <th className="px-4 py-3 font-normal">Operador</th>
                      <th className="px-4 py-3 font-normal">Fecha</th>
                      <th className="px-4 py-3 font-normal">Venta</th>
                      <th className="px-4 py-3 font-normal">Deuda</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((b) => (
                      <tr
                        key={b.id_booking}
                        className="border-t border-white/10"
                      >
                        <td className="px-2 py-4">
                          <Link
                            href={`/bookings/services/${b.id_booking}`}
                            target={"blank"}
                            className="m-auto flex w-fit items-center gap-1 text-sky-950/70 transition-colors hover:text-sky-950 dark:text-white/70 dark:hover:text-white"
                          >
                            {b.id_booking}
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth={2}
                              stroke="currentColor"
                              className="size-4"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                              />
                            </svg>
                          </Link>
                        </td>
                        <td className="px-2 py-4 text-center text-sm font-light">
                          {`${b.titular.first_name} ${b.titular.last_name}`}
                        </td>
                        <td className="px-2 py-4 text-center text-sm font-light">
                          {b.clientStatus}
                        </td>
                        <td className="px-2 py-4 text-center text-sm font-light">
                          {b.operatorStatus}
                        </td>
                        <td className="px-2 py-4 text-center text-sm font-light">
                          {new Date(b.creation_date).toLocaleDateString(
                            "es-AR",
                          )}
                        </td>
                        <td className="px-2 py-4 text-center text-sm font-light">
                          {formatTotalByCurrency(b.services)}
                        </td>
                        <td className="px-2 py-4 text-center text-sm font-light">
                          {formatDebtByCurrency(b.services, b.Receipt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex w-full justify-end border-t border-white/10 px-4 py-2">
                  <button
                    onClick={downloadCSV}
                    className="w-fit rounded-full bg-sky-100 px-4 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
                  >
                    Descargar Listado
                  </button>
                </div>
              </div>
            </>
          )
        )}

        <ToastContainer position="bottom-right" />
      </div>
    </ProtectedRoute>
  );
}
