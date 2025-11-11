// src/components/SideBar.tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface SidebarProps {
  menuOpen: boolean;
  closeMenu: () => void;
  currentPath: string;
}

type Role =
  | "desarrollador"
  | "administrativo"
  | "gerente"
  | "vendedor"
  | "lider"
  | string;

/* =========================
 * Helpers (rol cookie-first)
 * ========================= */
function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const row = document.cookie
    .split("; ")
    .find((r) => r.startsWith(`${encodeURIComponent(name)}=`));
  return row ? decodeURIComponent(row.split("=")[1] || "") : null;
}

function normalizeRole(raw: unknown): Role | "" {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!s) return "";
  if (["admin", "administrador", "administrativa"].includes(s))
    return "administrativo";
  if (["dev", "developer"].includes(s)) return "desarrollador";
  return s as Role;
}

async function fetchRoleFromApis(): Promise<Role | ""> {
  try {
    // 1) /api/role (si existe)
    let r = await fetch("/api/role", { cache: "no-store" });
    if (r.ok) {
      const j = (await r.json()) as { role?: unknown };
      const norm = normalizeRole(j?.role);
      if (norm) return norm;
    }
    // 2) /api/user/role (compat previo)
    r = await fetch("/api/user/role", { cache: "no-store" });
    if (r.ok) {
      const j = (await r.json()) as { role?: unknown };
      const norm = normalizeRole(j?.role);
      if (norm) return norm;
    }
    // 3) /api/user/profile (fallback)
    r = await fetch("/api/user/profile", { cache: "no-store" });
    if (r.ok) {
      const j = (await r.json()) as { role?: unknown };
      const norm = normalizeRole(j?.role);
      if (norm) return norm;
    }
  } catch {
    // silencio
  }
  return "";
}

/* ==========
 * Component
 * ========== */
export default function SideBar({
  menuOpen,
  closeMenu,
  currentPath,
}: SidebarProps) {
  const [mounted, setMounted] = useState(false);
  const [role, setRole] = useState<Role | "">("");

  // Para abortar si desmonta mientras pedimos el rol
  const fetchingRef = useRef(false);

  useEffect(() => setMounted(true), []);

  // Rol cookie-first + fallbacks
  useEffect(() => {
    const fromCookie = normalizeRole(getCookie("role"));
    if (fromCookie) {
      setRole(fromCookie);
      return;
    }
    // Si no hay cookie, consultamos APIs
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    void (async () => {
      const r = await fetchRoleFromApis();
      setRole(r || "");
      fetchingRef.current = false;
    })();
  }, []);

  // Releer cookie al volver el foco (por si cambió en otra pestaña)
  useEffect(() => {
    const onFocus = () => {
      const cookieRole = normalizeRole(getCookie("role"));
      if ((cookieRole || "") !== (role || "")) setRole(cookieRole);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [role]);

  // =========================
  // ACL por ruta (más simple)
  // =========================
  const routeAccess = useMemo(() => {
    const adm = ["desarrollador", "gerente", "administrativo"];
    const devMgr = ["desarrollador", "gerente"];
    return {
      "/operators": ["desarrollador", "administrativo", "gerente"],
      "/agency": devMgr,
      "/teams": devMgr,
      "/invoices": adm,
      "/bookings/config": adm,
      "/balances": adm,
      "/earnings": adm,
      "/earnings/my": [
        "desarrollador",
        "gerente",
        "administrativo",
        "vendedor",
        "lider",
      ],
      "/investments": adm,
      "/receipts": adm,
      "/finance/config": adm,
      "/credits": adm, // NUEVO: Créditos
      // por defecto -> sin restricción
    } as Record<string, Role[]>;
  }, []);

  const hasAccess = useCallback(
    (route: string): boolean => {
      if (!role) return false;
      const allow = routeAccess[route];
      return allow ? allow.includes(role) : true;
    },
    [role, routeAccess],
  );

  // Activo: exacto o subrutas (e.g., /earnings/my o /bookings/123)
  const isActive = useCallback(
    (route: string) =>
      currentPath === route ||
      (route !== "/" && currentPath.startsWith(route + "/")),
    [currentPath],
  );

  const itemCls = (active: boolean) =>
    [
      "block rounded-full py-2 text-center text-sky-950 transition-colors duration-200 dark:text-white",
      active
        ? "bg-white/10 shadow-md shadow-sky-950/10 backdrop-blur"
        : "shadow-sky-950/10 hover:bg-white/10 hover:shadow-md hover:backdrop-blur",
    ].join(" ");

  // ==============================
  // Definición de secciones/ítems
  // ==============================
  const sections = useMemo(() => {
    const chunks: {
      id: string;
      title: string;
      items: { href: string; label: string }[];
    }[] = [
      {
        id: "clientes",
        title: "Clientes",
        items: [
          { href: "/clients", label: "Clientes" },
          { href: "/client-stats", label: "Estadísticas" },
        ],
      },
      {
        id: "reservas",
        title: "Reservas",
        items: [
          { href: "/bookings", label: "Reservas" },
          hasAccess("/invoices")
            ? { href: "/invoices", label: "Facturas" }
            : null,
          hasAccess("/bookings/config")
            ? { href: "/bookings/config", label: "Configuración" }
            : null,
        ].filter(Boolean) as { href: string; label: string }[],
      },
      {
        id: "finanzas",
        title: "Finanzas",
        items: [
          hasAccess("/credits")
            ? { href: "/credits", label: "Créditos" }
            : null, // NUEVO
          hasAccess("/investments")
            ? { href: "/investments", label: "Inversión" }
            : null,
          hasAccess("/receipts")
            ? { href: "/receipts", label: "Recibos" }
            : null,
          hasAccess("/balances")
            ? { href: "/balances", label: "Saldos" }
            : null,
          hasAccess("/earnings")
            ? { href: "/earnings", label: "Ganancias" }
            : null,
          hasAccess("/earnings/my")
            ? { href: "/earnings/my", label: "Mis Ganancias" }
            : null,
          hasAccess("/finance/config")
            ? { href: "/finance/config", label: "Configuración" }
            : null,
        ].filter(Boolean) as { href: string; label: string }[],
      },
      {
        id: "recursos",
        title: "Recursos",
        items: [
          { href: "/resources", label: "Recursos" },
          { href: "/calendar", label: "Calendario" },
          { href: "/templates", label: "Templates" },
        ],
      },
      {
        id: "agencia",
        title: "Agencia",
        items: [
          hasAccess("/agency") ? { href: "/agency", label: "Agencia" } : null,
          hasAccess("/operators")
            ? { href: "/operators", label: "Operadores" }
            : null,
          hasAccess("/users")
            ? {
                href: "/users",
                label:
                  role === "gerente" ||
                  role === "desarrollador" ||
                  role === "administrativo"
                    ? "Usuarios"
                    : "Usuario",
              }
            : null,
          hasAccess("/teams") ? { href: "/teams", label: "Equipos" } : null,
        ].filter(Boolean) as { href: string; label: string }[],
      },
    ];

    return chunks.filter((sec) => sec.items.length > 0);
  }, [hasAccess, role]);

  // =========================================
  // Estado de colapso por sección (persistido)
  // Usamos una clave por rol para no mezclar
  // =========================================
  const STORAGE_KEY = useMemo(
    () => `sidebar-sections-expanded:${role || "anon"}`,
    [role],
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Evitamos reinit en cada render con un ref
  const initRef = useRef(false);

  useEffect(() => {
    if (!mounted || initRef.current) return;
    initRef.current = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, boolean>;
        setExpanded(parsed);
      } else {
        // Por defecto, abrir la primera sección disponible
        const init: Record<string, boolean> = {};
        const firstId = sections[0]?.id;
        sections.forEach((s) => (init[s.id] = s.id === firstId));
        setExpanded(init);
      }
    } catch {
      const init: Record<string, boolean> = {};
      const firstId = sections[0]?.id;
      sections.forEach((s) => (init[s.id] = s.id === firstId));
      setExpanded(init);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, STORAGE_KEY, sections.length]);

  // Persistir cambios
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(expanded));
    } catch {
      // noop
    }
  }, [expanded, mounted, STORAGE_KEY]);

  // Auto-expandir la sección que contiene el item activo
  useEffect(() => {
    const idx = sections.findIndex((sec) =>
      sec.items.some((it) => isActive(it.href)),
    );
    if (idx >= 0) {
      const id = sections[idx].id;
      setExpanded((prev) => ({ ...prev, [id]: true }));
    }
  }, [currentPath, sections, isActive]);

  const toggleSection = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  if (!mounted) return null;

  return (
    <aside
      className={`fixed left-0 top-0 z-50 h-dvh w-44 overflow-y-auto border-r border-white/10 bg-white/10 p-4 shadow-md shadow-sky-950/10 backdrop-blur-lg transition-transform duration-300 md:block md:translate-x-0 md:border-none md:bg-transparent md:shadow-none ${
        menuOpen ? "translate-x-0" : "-translate-x-full"
      }`}
      aria-label="Barra lateral de navegación"
    >
      <nav className="flex min-h-full flex-col pb-6">
        <ul className="flex flex-1 flex-col items-center justify-center space-y-3 text-sm font-extralight">
          {/* Perfil */}
          <li className="w-full transition-transform hover:scale-95 active:scale-90">
            <Link
              href="/profile"
              className={itemCls(isActive("/profile"))}
              onClick={closeMenu}
              aria-current={isActive("/profile") ? "page" : undefined}
            >
              <span className="inline-flex items-center justify-center gap-2">
                Perfil
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="size-4"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                  />
                </svg>
              </span>
            </Link>
          </li>

          {/* Secciones */}
          {sections.map((sec) => {
            const open = !!expanded[sec.id];
            const anyActive = sec.items.some((it) => isActive(it.href));
            return (
              <li key={sec.id} className="w-full select-none">
                <button
                  type="button"
                  className={`flex w-full items-center justify-between rounded-full px-4 py-2 text-left tracking-wide text-sky-950 transition-colors dark:text-white ${
                    anyActive
                      ? "bg-white/10 shadow-sm backdrop-blur"
                      : "hover:bg-white/10"
                  }`}
                  onClick={() => toggleSection(sec.id)}
                  aria-expanded={open}
                  aria-controls={`sec-${sec.id}`}
                >
                  <span className="text-sm font-medium tracking-wide">
                    {sec.title}
                  </span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                    />
                  </svg>
                </button>

                <div
                  id={`sec-${sec.id}`}
                  className="mt-2 overflow-hidden transition-[max-height] duration-300"
                  style={{
                    maxHeight: open
                      ? `${Math.min(48 * sec.items.length + 8, 600)}px`
                      : "0px",
                  }}
                >
                  <ul className="mb-3 space-y-2 pl-1">
                    {sec.items.map((it) => {
                      const active = isActive(it.href);
                      return (
                        <li
                          key={it.href}
                          className="text-sm transition-transform hover:scale-95 active:scale-90"
                        >
                          <Link
                            href={it.href}
                            className={itemCls(active)}
                            onClick={closeMenu}
                            aria-current={active ? "page" : undefined}
                          >
                            {it.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
