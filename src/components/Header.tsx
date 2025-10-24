// src/components/Header.tsx
/* eslint-disable @next/next/no-img-element */
"use client";

import ThemeToggle from "@/components/ThemeToggle";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

/* ---------- Botones renovados (solo light) ---------- */
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
  const blurPx = useSpring(useTransform(scrollY, [0, 120], [14, 20]), {
    stiffness: 220,
    damping: 28,
    mass: 0.35,
  });
  const backdrop = useMotionTemplate`blur(${blurPx}px) saturate(1.35)`;
  const shadowSpread = useSpring(useTransform(scrollY, [0, 120], [0.1, 0.18]), {
    stiffness: 220,
    damping: 28,
    mass: 0.35,
  });
  const boxShadow = useMotionTemplate`0 10px 30px rgba(15 23 42 / ${shadowSpread})`;

  const [open, setOpen] = useState(false);
  const islandRef = useRef<HTMLDivElement | null>(null);
  const [panelTop, setPanelTop] = useState<number>(96); // fallback seguro

  // Medimos la altura real de la isla para anclar el panel móvil justo debajo (evita cortes)
  const measure = () => {
    const el = islandRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect(); // top relativo al viewport
    const gap = 10; // separación visual
    setPanelTop(Math.max(72, rect.top + rect.height + gap));
  };

  useLayoutEffect(() => {
    measure();
    const onResize = () => measure();
    const onScroll = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Bloqueo del scroll del body cuando el menú está abierto (mejor UX móvil)
  useEffect(() => {
    const b = document.body;
    if (open) {
      const prev = b.style.overflow;
      b.style.overflow = "hidden";
      return () => {
        b.style.overflow = prev;
      };
    }
  }, [open]);

  /* ---------- Header LANDING ---------- */
  if (isLanding) {
    return (
      <>
        <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex justify-center sm:top-4 sm:px-4">
          <motion.div
            style={{ scale, y: translateY }}
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="pointer-events-auto w-full"
          >
            <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
              <motion.div
                ref={islandRef}
                style={{ backdropFilter: backdrop, boxShadow }}
                className={[
                  "mx-auto flex items-center justify-between gap-2",
                  "rounded-[22px] sm:rounded-[28px]",
                  "border border-white/30 bg-white/55",
                ].join(" ")}
              >
                {/* Paddings fijos para evitar saltos */}
                <div className="flex w-full items-center justify-between px-3.5 py-2.5 sm:px-5 sm:py-3">
                  {/* Brand */}
                  <Link
                    href="/"
                    className="flex select-none items-center gap-1"
                  >
                    <img src="/logo-dark.png" alt="" className="size-6" />
                    <p className="text-base font-medium tracking-tight text-sky-950">
                      Ofis<span className="font-light">tur</span>
                    </p>
                  </Link>

                  {/* Nav desktop */}
                  <nav className="hidden items-center gap-5 text-sm text-sky-950 md:flex">
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
                        className="rounded-full px-3 py-1 transition-colors hover:bg-white/50"
                      >
                        {item.label}
                      </a>
                    ))}
                  </nav>

                  {/* Acciones */}
                  <div className="flex items-center gap-1 sm:gap-2">
                    <div className="hidden items-center gap-1 sm:gap-2 md:flex">
                      <WhatsAppBtn />
                      <PlatformBtn />
                    </div>
                    {/* Toggle menú móvil */}
                    <button
                      type="button"
                      onClick={() => setOpen((v) => !v)}
                      className="ml-1 inline-flex size-9 items-center justify-center rounded-full border border-white/40 bg-white/60 text-sky-950 shadow-sm transition hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 md:hidden"
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
            </div>
          </motion.div>
        </div>

        {/* Menú móvil (anclado bajo la isla, nunca se corta) */}
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
                aria-label="Cerrar menú"
              />
              <motion.div
                key="panel"
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -8, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="fixed z-[75] md:hidden"
                style={{
                  top: panelTop + 10,
                  left: 0,
                  right: 0,
                  // márgenes seguros a los lados (safe areas + padding)
                  paddingLeft: "clamp(0.75rem, 3vw, 2rem)",
                  paddingRight: "clamp(0.75rem, 3vw, 2rem)",
                }}
              >
                <div className="mx-auto w-full max-w-7xl">
                  <div className="rounded-2xl border border-white/30 bg-white/75 p-3 text-sky-950 shadow-xl backdrop-blur-xl">
                    <ul className="divide-y divide-white/30">
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
                    <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                      <WhatsAppBtn />
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

  /* ---------- Header PLATAFORMA (ligero y responsive, solo light) ---------- */
  return (
    <header className="z-50 flex w-full items-center justify-between px-4 py-6 text-sky-950 dark:text-sky-100 md:top-0">
      {isLoginPage && (
        <Link href={`/`}>
          <img
            src="/logo.png"
            alt=""
            className="absolute bottom-4 right-4 z-50 size-14 transition-transform hover:scale-105 active:scale-95"
          />
        </Link>
      )}
      <div className="flex w-full flex-auto justify-start md:justify-center">
        {!isLoginPage ? (
          <div className="flex select-none items-center gap-1">
            <div className="hidden dark:block">
              <img src="/logo.png" alt="" className="size-5" />
            </div>
            <div className="block dark:hidden">
              <img src="/logo-dark.png" alt="" className="size-5" />
            </div>
            <p className="text-base font-medium tracking-tight">
              Ofis<span className="font-light">tur</span>
            </p>
          </div>
        ) : (
          <p className="text-lg font-medium text-sky-950">
            Ofis<span className="font-light">tur</span>
          </p>
        )}
      </div>

      <div className="absolute right-4 flex items-center gap-2 md:right-8">
        {!isLoginPage && <ThemeToggle />}
        {!isLoginPage && (
          <button
            className="ml-2 block rounded-full border border-sky-200 bg-white/70 p-2 shadow-sm md:hidden"
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
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 464 488"
      {...props}
    >
      <path
        fill="#064e3b"
        d="M462 228q0 93-66 159t-160 66q-56 0-109-28L2 464l40-120q-32-54-32-116q0-93 66-158.5T236 4t160 65.5T462 228zM236 39q-79 0-134.5 55.5T46 228q0 62 36 111l-24 70l74-23q49 31 104 31q79 0 134.5-55.5T426 228T370.5 94.5T236 39zm114 241q-1-1-10-7q-3-1-19-8.5t-19-8.5q-9-3-13 2q-1 3-4.5 7.5t-7.5 9t-5 5.5q-4 6-12 1q-34-17-45-27q-7-7-13.5-15t-12-15t-5.5-8q-3-7 3-11q4-6 8-10l6-9q2-5-1-10q-4-13-17-41q-3-9-12-9h-11q-9 0-15 7q-19 19-19 45q0 24 22 57l2 3q2 3 4.5 6.5t7 9t9 10.5t10.5 11.5t13 12.5t14.5 11.5t16.5 10t18 8.5q16 6 27.5 10t18 5t9.5 1t7-1t5-1q9-1 21.5-9t15.5-17q8-21 3-26z"
      ></path>
    </svg>
  );
}
