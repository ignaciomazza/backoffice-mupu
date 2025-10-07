// src/components/Header.tsx
"use client";

import ThemeToggle from "@/components/ThemeToggle";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  motion,
  AnimatePresence,
  useScroll,
  useSpring,
  useTransform,
  useMotionTemplate,
} from "framer-motion";

interface HeaderProps {
  toggleMenu: () => void;
  menuOpen: boolean;
}

const WA_NUMBER = process.env.NEXT_PUBLIC_WA_NUMBER ?? "54911XXXXXXXX";
const WA_MSG = encodeURIComponent("Hola, quiero más info sobre Ofistur.");
const WA_URL = `https://wa.me/${WA_NUMBER}?text=${WA_MSG}`;

/* ---------- Botones renovados ---------- */
function WhatsAppBtn() {
  return (
    <motion.a
      href={WA_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={[
        "inline-flex items-center gap-2 rounded-full",
        "border border-emerald-300/50 bg-emerald-50/70 px-3.5 py-1.5",
        "text-sm font-medium text-emerald-900 shadow-sm",
        "transition-colors hover:bg-emerald-50/90",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40",
        "dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20",
      ].join(" ")}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.98 }}
      aria-label="Escribir por WhatsApp"
    >
      <IconWhatsApp className="size-4" />
      <span>WhatsApp</span>
    </motion.a>
  );
}

function PlatformBtn() {
  return (
    <motion.div
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.98 }}
      className="inline-flex"
    >
      <Link
        href="/login"
        className={[
          "inline-flex items-center gap-2 rounded-full",
          "border border-sky-300/50 bg-sky-50/70 px-3.5 py-1.5 text-sm font-medium text-sky-900",
          "shadow-md shadow-sky-950/10 transition-colors",
          "hover:bg-sky-50/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40",
          "active:scale-[0.99]",
        ].join(" ")}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="size-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6A2.25 2.25 0 0 1 18.75 5.25V18A2.25 2.25 0 0 1 16.5 20.25h-6A2.25 2.25 0 0 1 8.25 18V15M12 9l3 3m0 0-3 3m3-3H3.75"
          />
        </svg>
        Plataforma
      </Link>
    </motion.div>
  );
}

export default function Header({ toggleMenu, menuOpen }: HeaderProps) {
  const pathname = usePathname() || "/";
  const isLoginPage = pathname === "/login";
  const isLanding = pathname === "/";

  /* ---------- Animación fluida de la isla (landing) ---------- */
  const { scrollY } = useScroll();
  // Respuesta suave al scroll
  const scale = useSpring(useTransform(scrollY, [0, 120], [1, 0.985]), {
    stiffness: 220,
    damping: 28,
    mass: 0.35,
  });
  const translateY = useSpring(useTransform(scrollY, [0, 120], [0, 2]), {
    stiffness: 220,
    damping: 28,
    mass: 0.35,
  });
  // Blur dinámico del backdrop
  const blurPx = useSpring(useTransform(scrollY, [0, 120], [14, 20]), {
    stiffness: 220,
    damping: 28,
    mass: 0.35,
  });
  const backdrop = useMotionTemplate`blur(${blurPx}px) saturate(1.4)`;
  // Sombra ligeramente más marcada al scrollear
  const shadowSpread = useSpring(useTransform(scrollY, [0, 120], [0.1, 0.18]), {
    stiffness: 220,
    damping: 28,
    mass: 0.35,
  });
  const boxShadow = useMotionTemplate`0 10px 30px rgba(15 23 42 / ${shadowSpread})`;

  const [open, setOpen] = useState(false);

  /* ---------- Header LANDING ---------- */
  if (isLanding) {
    return (
      <>
        <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex justify-center px-3 sm:top-4 sm:px-4">
          <motion.div
            style={{ scale, y: translateY }}
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="pointer-events-auto w-full max-w-6xl"
          >
            <motion.div
              style={{ backdropFilter: backdrop, boxShadow }}
              className={[
                "mx-auto flex items-center justify-between gap-2",
                "rounded-[22px] sm:rounded-[28px]",
                "border border-white/20 bg-white/55 dark:border-white/10 dark:bg-slate-900/40",
              ].join(" ")}
            >
              {/* Contenido con paddings fijos para evitar saltos bruscos */}
              <div className="flex w-full items-center justify-between px-3.5 py-2.5 sm:px-5 sm:py-3">
                {/* Brand */}
                <Link
                  href="/"
                  className="select-none text-base font-semibold tracking-tight text-sky-950 dark:text-white"
                >
                  Ofis<span className="font-light">tur</span>
                </Link>

                {/* Nav desktop */}
                <nav className="hidden items-center gap-5 text-sm text-sky-950 dark:text-white md:flex">
                  {[
                    { href: "#producto", label: "Producto" },
                    { href: "#roles", label: "Para roles" },
                    { href: "#seguridad", label: "Seguridad" },
                    { href: "#faq", label: "FAQ" },
                    { href: "#contacto", label: "Contacto" },
                  ].map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      className="rounded-full px-3 py-1 transition-colors hover:bg-white/40 hover:dark:bg-white/10"
                    >
                      {item.label}
                    </a>
                  ))}
                </nav>

                {/* Acciones */}
                <div className="flex items-center gap-1 sm:gap-2">
                  <WhatsAppBtn />
                  <PlatformBtn />

                  {/* Toggle menú móvil */}
                  <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    className="ml-1 inline-flex size-9 items-center justify-center rounded-full border border-white/30 bg-white/50 text-sky-950 shadow-sm transition hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/20 md:hidden"
                    aria-label="Abrir menú"
                    aria-expanded={open}
                  >
                    {open ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="size-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="size-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4 6h16M4 12h16M4 18h16"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>

        {/* Menú móvil */}
        <AnimatePresence>
          {open && (
            <>
              <motion.button
                key="overlay"
                onClick={() => setOpen(false)}
                className="fixed inset-0 z-[65] bg-black/20 backdrop-blur-[2px] md:hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
              <motion.div
                key="panel"
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -8, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="fixed left-1/2 top-20 z-[75] w-[92%] -translate-x-1/2 md:hidden"
              >
                <div className="rounded-2xl border border-white/20 bg-white/70 p-3 text-sky-950 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/60 dark:text-white">
                  <ul className="divide-y divide-white/20 dark:divide-white/10">
                    {[
                      { href: "#producto", label: "Producto" },
                      { href: "#roles", label: "Para roles" },
                      { href: "#seguridad", label: "Seguridad" },
                      { href: "#faq", label: "FAQ" },
                      { href: "#contacto", label: "Contacto" },
                    ].map((item) => (
                      <li key={item.href}>
                        <a
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className="block px-2 py-3"
                        >
                          {item.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex gap-2">
                    <WhatsAppBtn />
                    <div className="flex-1">
                      <PlatformBtn />
                    </div>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </>
    );
  }

  /* ---------- Header PLATAFORMA (igual que tenías) ---------- */
  return (
    <header className="z-50 flex w-full items-center justify-between px-4 py-6 text-sky-950 dark:text-white md:top-0">
      <div className="flex w-full flex-auto justify-start md:justify-center">
        {!isLoginPage ? (
          <p className="text-lg font-medium">
            Ofis<span className="font-light">tur</span>
          </p>
        ) : (
          <p className="text-lg font-medium text-sky-950">
            Ofis<span className="font-light">tur</span>
          </p>
        )}
      </div>

      <div className="absolute right-4 flex md:right-8">
        {!isLoginPage && <ThemeToggle />}
        {!isLoginPage && (
          <button
            className="ml-4 block md:hidden"
            onClick={toggleMenu}
            aria-label="Toggle Menu"
          >
            {menuOpen ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="size-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="size-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            )}
          </button>
        )}
      </div>
    </header>
  );
}

/* ---------- Iconos ---------- */
function IconWhatsApp(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden {...props}>
      <path d="M19.11 17.18c-.28-.14-1.64-.81-1.89-.9-.26-.1-.45-.14-.64.14-.19.28-.73.9-.9 1.09-.17.19-.33.21-.61.07-.28-.14-1.18-.43-2.25-1.37-.83-.74-1.39-1.65-1.56-1.93-.17-.28-.02-.43.13-.57.13-.13.28-.33.42-.5.14-.17.19-.28.28-.47.09-.19.05-.36-.02-.5-.07-.14-.64-1.54-.87-2.11-.23-.55-.47-.47-.64-.47-.17 0-.36-.02-.55-.02s-.5.07-.76.36c-.26.28-.99.97-.99 2.37 0 1.4 1.02 2.75 1.17 2.94.14.19 2 3.05 4.84 4.27.68.29 1.2.46 1.61.59.68.21 1.31.18 1.8.11.55-.08 1.64-.67 1.87-1.34.23-.67.23-1.24.16-1.36-.07-.11-.25-.18-.53-.32z" />
      <path d="M26.49 5.51C23.7 2.73 20.02 1.2 16.08 1.2 8.2 1.2 1.86 7.54 1.86 15.42c0 2.51.66 4.95 1.92 7.1L1.2 30.8l8.5-2.27c2.06 1.12 4.39 1.7 6.77 1.7h.01c7.88 0 14.22-6.34 14.22-14.22 0-3.94-1.53-7.62-4.21-10.5zm-10.21 22.6h-.01c-2.16 0-4.27-.58-6.13-1.67l-.44-.26-5.05 1.35 1.35-4.92-.29-.5a12.7 12.7 0 01-1.86-6.64c0-7.02 5.71-12.73 12.73-12.73 3.4 0 6.6 1.32 9 3.72a12.65 12.65 0 013.72 9c0 7.03-5.71 12.73-12.72 12.73z" />
    </svg>
  );
}
