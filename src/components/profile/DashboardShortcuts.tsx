// src/components/profile/DashboardShortcuts.tsx
"use client";
import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import Spinner from "@/components/Spinner";
import { Booking, Client } from "@/types";
import { authFetch } from "@/utils/authFetch";

type Metric = {
  label: string;
  icon: JSX.Element;
  span: { cols: number; rows: number };
  link?: string;
  value?: React.ReactNode;
};

interface DashboardCardProps {
  label: string;
  icon: JSX.Element;
  value: React.ReactNode;
  span: { cols: number; rows: number };
  link?: string;
}

// === Nuevos tipos usados por /api/earnings/my ===
type Currency = "ARS" | "USD";
type TotalsByCurrency = Record<Currency, number>;

type MyEarningsTotals = {
  seller: TotalsByCurrency; // lo que cobrás por tus reservas
  beneficiary: TotalsByCurrency; // lo que cobrás de reservas de otros
  grandTotal: TotalsByCurrency; // seller + beneficiary
};

type MyEarningsResponse = { totals: MyEarningsTotals };

type ProfileMinimal = { id_user: number };

interface Props {
  agencyId: number;
}

const getSpanClasses = (span: { cols: number; rows: number }) => {
  const colClass =
    span.cols === 1
      ? "col-span-1"
      : span.cols === 2
        ? "col-span-1 md:col-span-2"
        : `md:col-span-${span.cols}`;
  const rowClass =
    span.rows === 1
      ? "row-span-1"
      : span.rows === 2
        ? "row-span-2"
        : `row-span-${span.rows}`;
  return `${colClass} ${rowClass}`;
};

const DashboardCard: React.FC<DashboardCardProps> = ({
  label,
  icon,
  value,
  span,
  link,
}) => {
  const spanClasses = getSpanClasses(span);
  return (
    <motion.div
      layout
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 },
      }}
      className={`${spanClasses} flex flex-col justify-between rounded-3xl border border-white/10 bg-white/10 p-6 shadow-lg backdrop-blur-lg`}
      title={label}
    >
      <div>
        {icon}
        <p className="mt-2 text-sm font-light text-sky-950 dark:text-sky-100">
          {label}
        </p>
        <div className="mt-1 text-2xl font-semibold text-sky-950 dark:text-white">
          {value}
        </div>
      </div>
      {link && (
        <Link href={link}>
          <button className="mt-4 self-start rounded-full bg-sky-100 px-4 py-1 text-sm font-medium shadow-sm dark:bg-white/10 dark:text-white">
            Ver más
          </button>
        </Link>
      )}
    </motion.div>
  );
};

interface Props {
  agencyId: number;
}

export default function DashboardShortcuts({ agencyId }: Props) {
  const { token, setToken } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  const [obsBookings, setObsBookings] = useState<Booking[]>([]);
  const [pendingBookingsArr, setPendingBookingsArr] = useState<Booking[]>([]);
  const [commissionARS, setCommissionARS] = useState(0);
  const [commissionUSD, setCommissionUSD] = useState(0);
  const [newClientsCount, setNewClientsCount] = useState(0);
  const [totalBookings, setTotalBookings] = useState(0);
  const [pendingBookings, setPendingBookings] = useState(0);

  const { from: defaultFrom, to: defaultTo } = useMemo(() => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const toYMD = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`;
    return { from: toYMD(firstDay), to: toYMD(lastDay) };
  }, []);

  useEffect(() => {
    if (!token) return;
    setLoadingMetrics(true);

    (async () => {
      try {
        // Perfil (para id_user)
        const pr = await authFetch("/api/user/profile", {}, token);
        if (!pr.ok) throw new Error("No se pudo cargar perfil");
        const profile = (await pr.json()) as ProfileMinimal;

        // Comisiones del usuario (nueva API /api/earnings/my)
        const er = await authFetch(
          `/api/earnings/my?from=${defaultFrom}&to=${defaultTo}`,
          {},
          token,
        );
        if (!er.ok) throw new Error("Error al cargar mis comisiones");
        const { totals } = (await er.json()) as MyEarningsResponse;
        setCommissionARS(totals.grandTotal.ARS);
        setCommissionUSD(totals.grandTotal.USD);

        // Reservas con observaciones (primer page para “atajos”)
        {
          const br = await authFetch("/api/bookings?take=24", {}, token);
          if (br.ok) {
            const {
              items: bookingsPage,
            }: { items: Booking[]; nextCursor: number | null } =
              await br.json();
            setObsBookings(
              bookingsPage.filter(
                (b) =>
                  b.user.id_user === profile.id_user &&
                  (b.observation?.trim() ?? "") !== "",
              ),
            );
          } else {
            setObsBookings([]);
          }
        }

        // Nuevos clientes del mes
        setNewClientsCount(
          await countNewClientsForMonth({
            token,
            userId: profile.id_user,
            agencyId,
            from: defaultFrom,
            to: defaultTo,
          }),
        );

        // Reservas del mes
        {
          const { all } = await fetchAllBookingsForRange({
            token,
            userId: profile.id_user,
            from: defaultFrom,
            to: defaultTo,
          });
          setTotalBookings(all.length);
          const pendings = all.filter((b) => b.clientStatus === "Pendiente");
          setPendingBookingsArr(pendings);
          setPendingBookings(pendings.length);
        }
      } catch (error) {
        console.error("Error inicializando DashboardShortcuts:", error);
      } finally {
        setLoadingMetrics(false);
      }
    })();
  }, [token, defaultFrom, defaultTo, agencyId]);

  const metrics: Metric[] = [
    {
      label: "Comisión - ARS",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.4}
          stroke="currentColor"
          className="size-7 text-green-700"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        </svg>
      ),
      span: { cols: 1, rows: 1 },
      value: loadingMetrics ? (
        <Spinner />
      ) : (
        new Intl.NumberFormat("es-AR", {
          style: "currency",
          currency: "ARS",
        }).format(commissionARS)
      ),
    },
    {
      label: "Comisión - USD",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.4}
          stroke="currentColor"
          className="size-7 text-green-700"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
          />
        </svg>
      ),
      span: { cols: 1, rows: 1 },
      value: loadingMetrics ? (
        <Spinner />
      ) : (
        new Intl.NumberFormat("es-AR", {
          style: "currency",
          currency: "USD",
        }).format(commissionUSD)
      ),
    },
    {
      label: "Nuevos clientes",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.4}
          stroke="currentColor"
          className="size-7 text-sky-700"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
          />
        </svg>
      ),
      span: { cols: 1, rows: 1 },
      value: loadingMetrics ? <Spinner /> : newClientsCount,
    },
    {
      label: "Reservas",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.4}
          stroke="currentColor"
          className="size-7 text-orange-700"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 1 0-5.198V6.375c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"
          />
        </svg>
      ),
      span: { cols: 1, rows: 1 },
      value: loadingMetrics ? <Spinner /> : totalBookings,
    },
    {
      label: "Reservas pendientes",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.4}
          stroke="currentColor"
          className="size-7 text-orange-700"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        </svg>
      ),
      span: { cols: 2, rows: 1 },
      link: "/bookings?status=pendiente",
      value: loadingMetrics ? <Spinner /> : pendingBookings,
    },
  ];

  const shortcuts = [
    {
      href: "/profile",
      label: "Ajustes",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="size-6 text-sky-950 dark:text-white"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 113.586-3.586l6.837-5.63M5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26"
          />
        </svg>
      ),
    },
  ];

  const skeletonOrder: { cols: number; rows: number }[] = [
    { cols: 1, rows: 1 },
    { cols: 1, rows: 1 },
    { cols: 1, rows: 1 },
    { cols: 1, rows: 2 },
    { cols: 1, rows: 1 },
    { cols: 2, rows: 1 },
    { cols: 1, rows: 1 },
  ];

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <AnimatePresence>
      <motion.div
        layout
        initial="hidden"
        animate="visible"
        exit="hidden"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.2 } },
        }}
        className="grid w-full grid-flow-dense auto-rows-[150px] grid-cols-1 gap-6 p-4 md:grid-cols-3 lg:grid-cols-4"
      >
        {loadingMetrics &&
          skeletonOrder.map((span, i) => (
            <motion.div
              key={`skeleton-${i}`}
              layout
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0 },
              }}
              className={`md:col-span-${span.cols} row-span-${span.rows} animate-pulse rounded-3xl bg-sky-950/10 p-6 shadow-lg backdrop-blur-lg dark:border dark:border-white/10 dark:bg-white/10`}
            />
          ))}

        {!loadingMetrics &&
          metrics.map((m) => (
            <React.Fragment key={m.label}>
              <DashboardCard
                label={m.label}
                icon={m.icon}
                span={m.span}
                value={
                  m.label === "Reservas pendientes" ? (
                    pendingBookingsArr.length > 0 ? (
                      <ul className="space-y-1 text-xs">
                        {pendingBookingsArr.map((b) => (
                          <li key={b.id_booking}>
                            <Link
                              href={`/bookings/services/${b.id_booking}`}
                              className="underline"
                            >
                              #{b.id_booking} – {b.titular.first_name}{" "}
                              {b.titular.last_name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-sky-950/60 dark:text-white/60">
                        No hay reservas pendientes.
                      </p>
                    )
                  ) : (
                    m.value!
                  )
                }
              />

              {m.label === "Nuevos clientes" && (
                <DashboardCard
                  label="Reservas con observaciones"
                  icon={
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.4}
                      stroke="currentColor"
                      className="size-7 text-sky-700"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"
                      />
                    </svg>
                  }
                  span={{ cols: 1, rows: 2 }}
                  value={
                    obsBookings.length > 0 ? (
                      <ul className="space-y-1 text-xs">
                        {obsBookings.map((b) => (
                          <li key={b.id_booking}>
                            <Link
                              href={`/bookings/services/${b.id_booking}`}
                              className="underline"
                            >
                              #{b.id_booking} – {b.titular.first_name}{" "}
                              {b.titular.last_name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-sky-950/60 dark:text-white/60">
                        No hay reservas con observaciones.
                      </p>
                    )
                  }
                />
              )}
            </React.Fragment>
          ))}

        {!loadingMetrics &&
          shortcuts.map(({ href, label, icon }) => {
            const box = (
              <motion.div
                key={label}
                layout
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  visible: { opacity: 1, y: 0 },
                }}
                className={`flex h-full flex-col items-center justify-center space-y-2 rounded-3xl border border-white/10 bg-white/10 p-6 shadow-lg backdrop-blur-lg`}
                title={label}
              >
                {icon}
                <span className="mt-2 text-base font-medium text-sky-950 dark:text-white">
                  {label}
                </span>
              </motion.div>
            );
            return href ? (
              <Link key={label} href={href}>
                {box}
              </Link>
            ) : (
              box
            );
          })}

        <motion.div
          layout
          variants={{
            hidden: { opacity: 0, y: 20 },
            visible: { opacity: 1, y: 0 },
          }}
          className="col-span-1 flex h-1/2 w-full cursor-pointer flex-col items-center justify-center rounded-3xl border border-red-400 bg-red-600/10 p-2 shadow-lg backdrop-blur-lg md:w-1/3"
          onClick={() => setToken(null)}
          title="Cerrar sesión"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.4}
            stroke="currentColor"
            className="size-5 text-red-600"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"
            />
          </svg>
          <span className="text-base text-red-600">Salir</span>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ===================== helpers (paginación) ===================== */

async function fetchAllBookingsForRange({
  token,
  userId,
  from,
  to,
}: {
  token: string | null;
  userId: number;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}): Promise<{ all: Booking[] }> {
  const all: Booking[] = [];
  let cursor: number | null = null;
  let safety = 0;
  const TAKE = 100; // el backend limita a 100

  do {
    const params = new URLSearchParams({
      userId: String(userId),
      creationFrom: from,
      creationTo: to,
      take: String(TAKE),
    });
    if (cursor) params.append("cursor", String(cursor));

    const r = await authFetch(`/api/bookings?${params.toString()}`, {}, token);
    if (!r.ok) throw new Error("Error al cargar reservas del rango");
    const {
      items,
      nextCursor,
    }: { items: Booking[]; nextCursor: number | null } = await r.json();
    all.push(...items);
    cursor = nextCursor;
    safety++;
  } while (cursor && safety < 50); // corta a 50 páginas por seguridad

  return { all };
}

async function countNewClientsForMonth({
  token,
  userId,
  agencyId,
  from,
  to,
}: {
  token: string | null;
  userId: number;
  agencyId: number;
  from: string;
  to: string;
}): Promise<number> {
  let count = 0;
  let cursor: number | null = null;
  let safety = 0;
  const TAKE = 100;

  do {
    const params = new URLSearchParams({
      userId: String(userId),
      agencyId: String(agencyId),
      take: String(TAKE),
    });
    if (cursor) params.append("cursor", String(cursor));

    const r = await authFetch(`/api/clients?${params.toString()}`, {}, token);
    if (!r.ok) throw new Error("Error al cargar clientes");
    const {
      items,
      nextCursor,
    }: { items: Client[]; nextCursor: number | null } = await r.json();

    // filtramos por registro en el mes (formato YYYY-MM-DD...)
    for (const c of items) {
      const reg = (c.registration_date || "").slice(0, 10);
      if (reg >= from && reg <= to) count++;
    }

    cursor = nextCursor;
    safety++;
  } while (cursor && safety < 50);

  return count;
}
