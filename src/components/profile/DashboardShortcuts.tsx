"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import ThemeToggle from "@/components/ThemeToggle";

type Metric = {
  label: string;
  svg: JSX.Element;
  span: { cols: number; rows: number };
  link?: string;
};

const metrics: Metric[] = [
  {
    label: "Comisión último mes",
    svg: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="size-8 text-sky-500"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 4v4m0 8v4m4-12h4m-12 0H4"
        />
      </svg>
    ),
    span: { cols: 2, rows: 1 },
    link: "/earnings",
  },
  {
    label: "Ventas y reservas",
    svg: (
      <div className="flex space-x-4">
        {/* Ícono de ventas */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="size-8 text-green-500"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 3h18v18H3V3z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 13h8m-8-4h12m-12-4h16"
          />
        </svg>
        {/* Ícono de reservas pendientes */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="size-8 text-yellow-500"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 7V3m8 4V3m-9 8h10m-10 4h10m-5 4v-4"
          />
        </svg>
      </div>
    ),
    span: { cols: 2, rows: 2 },
    link: "/bookings",
  },
  {
    label: "Nuevos clientes",
    svg: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="size-8 text-indigo-500"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M18 20a2 2 0 01-2 2H8a2 2 0 01-2-2v-2c0-3.314 2.686-6 6-6s6 2.686 6 6v2z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 12a4 4 0 100-8 4 4 0 000 8z"
        />
      </svg>
    ),
    span: { cols: 1, rows: 1 },
    link: "/clients",
  },
];

const shortcuts = [
  {
    href: "/",
    label: "Ajustes",
    svg: (
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
  {
    label: "Tema",
    svg: <ThemeToggle />,
    isButton: true,
  },
];

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};
const item = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export default function DashboardShortcuts() {
  const { setToken } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-1 gap-6 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {metrics.map((m) => (
        <motion.div
          key={m.label}
          variants={item}
          layout
          className={`col-span-${m.span.cols} row-span-${m.span.rows} flex flex-col justify-between rounded-3xl border border-white/10 bg-white/10 p-6 shadow-md backdrop-blur-lg`}
        >
          <div>
            {m.svg}
            {m.label !== "Ventas y reservas" ? (
              <>
                <p className="mt-2 text-sm font-light text-sky-950 dark:text-sky-100">
                  {m.label}
                </p>
                <p className="mt-1 text-2xl font-semibold text-sky-950 dark:text-white">
                  {m.label === "Comisión último mes" ? "$--.--" : "--"}
                </p>
              </>
            ) : (
              <>
                <div className="mt-2">
                  <p className="text-sm font-light text-sky-950 dark:text-sky-100">
                    Ventas último mes
                  </p>
                  <p className="text-2xl font-semibold text-sky-950 dark:text-white">
                    $--.--{/* valor real aquí */}
                  </p>
                </div>
                <div className="mt-4">
                  <p className="text-sm font-light text-sky-950 dark:text-sky-100">
                    Reservas pendientes
                  </p>
                  <p className="text-2xl font-semibold text-sky-950 dark:text-white">
                    --{/* valor real aquí */}
                  </p>
                </div>
              </>
            )}
          </div>
          {m.link && (
            <Link href={m.link}>
              <button className="mt-4 self-start rounded-full bg-sky-100 px-4 py-1 text-sm font-medium shadow-sm transition-transform hover:scale-95 dark:bg-white/10 dark:text-white">
                Ver más
              </button>
            </Link>
          )}
        </motion.div>
      ))}

      {shortcuts.map(({ href, label, svg, isButton }) =>
        isButton ? (
          <motion.div
            key={label}
            variants={item}
            layout
            className="flex items-center justify-center rounded-3xl border border-white/10 bg-white/10 p-6 shadow-md backdrop-blur-lg"
          >
            {svg}
          </motion.div>
        ) : (
          <Link key={label} href={href!}>
            <motion.div
              variants={item}
              layout
              className="flex flex-col items-center space-y-2 rounded-3xl border border-white/10 bg-white/10 p-6 shadow-md backdrop-blur-lg transition-transform hover:scale-105"
            >
              {svg}
              <span className="text-base font-medium text-sky-950 dark:text-white">
                {label}
              </span>
            </motion.div>
          </Link>
        ),
      )}

      <button onClick={() => setToken(null)} className="p-0">
        <motion.div
          variants={item}
          layout
          className="col-span-2 flex flex-col items-center space-y-2 rounded-3xl border border-red-400 bg-red-600/10 p-6 shadow-md backdrop-blur-lg transition-transform hover:scale-105"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="size-8 text-red-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6A2.25 2.25 0 005.25 5.25v13.5A2.25
                 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l3 3-3 3"
            />
          </svg>
          <span className="text-base font-medium text-red-600">Salir</span>
        </motion.div>
      </button>
    </motion.div>
  );
}
