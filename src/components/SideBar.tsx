// src/components/SideBar.tsx
"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

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

export default function SideBar({
  menuOpen,
  closeMenu,
  currentPath,
}: SidebarProps) {
  const [mounted, setMounted] = useState(false);
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const fetchRole = async () => {
      try {
        const res = await fetch("/api/user/role");
        const data = await res.json();
        if (data?.role) setRole(String(data.role).toLowerCase());
      } catch (error) {
        console.error("[SideBar] Error obteniendo rol:", error);
      }
    };
    fetchRole();
  }, []);

  const hasAccess = (route: string): boolean => {
    if (!role) return false;
    switch (route) {
      case "/operators":
        return ["desarrollador", "administrativo", "gerente"].includes(role);
      case "/agency":
      case "/teams":
        return ["desarrollador", "gerente"].includes(role);
      case "/invoices":
      case "/balances":
      case "/earnings":
      case "/investments":
        return ["desarrollador", "gerente", "administrativo"].includes(role);
      default:
        return true;
    }
  };

  const itemCls = (active: boolean) =>
    `block rounded-full py-2 text-center text-sky-950 transition-colors duration-200 dark:text-white ${
      active
        ? "bg-white/10 shadow-md shadow-sky-950/10 backdrop-blur"
        : "shadow-sky-950/10 hover:bg-white/10 hover:shadow-md hover:backdrop-blur"
    }`;

  // 🔧 Memoizamos y reutilizamos en deps
  const isActive = useCallback(
    (route: string) =>
      currentPath === route || currentPath.startsWith(`${route}/`),
    [currentPath],
  );

  // ====== Definición de secciones ======
  const sections = useMemo(
    () =>
      [
        {
          id: "clientes",
          title: "Clientes",
          items: [
            { href: "/clients", label: "Clientes" },
            { href: "/client-stats", label: "Estadísticas" }, // NUEVO
          ],
        },
        {
          id: "reservas",
          title: "Reservas",
          items: [
            { href: "/bookings", label: "Reservas" },
            hasAccess("/invoices") && { href: "/invoices", label: "Facturas" },
          ].filter(Boolean) as { href: string; label: string }[],
        },
        {
          id: "finanzas",
          title: "Finanzas",
          items: [
            hasAccess("/investments") && {
              href: "/investments",
              label: "Inversión",
            },
            hasAccess("/balances") && { href: "/balances", label: "Saldos" },
            hasAccess("/earnings") && { href: "/earnings", label: "Ganancias" },
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
            hasAccess("/agency") && { href: "/agency", label: "Agencia" },
            hasAccess("/operators") && {
              href: "/operators",
              label: "Operadores",
            },
            hasAccess("/users") && {
              href: "/users",
              label:
                role === "gerente" ||
                role === "desarrollador" ||
                role === "administrativo"
                  ? "Usuarios"
                  : "Usuario",
            },
            hasAccess("/teams") && { href: "/teams", label: "Equipos" },
          ].filter(Boolean) as { href: string; label: string }[],
        },
      ].filter((sec) => sec.items.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [role],
  );

  // ====== Estado de colapso por sección (persistido) ======
  const STORAGE_KEY = "sidebar-sections-expanded";
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, boolean>;
        setExpanded(parsed);
      } else {
        // ✅ Por defecto abrimos la PRIMER sección disponible
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
  }, [mounted, sections.length]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expanded));
  }, [expanded, mounted]);

  // Auto-expandir la sección que contiene el item activo
  useEffect(() => {
    const idx = sections.findIndex((sec) =>
      sec.items.some((it) => isActive(it.href)),
    );
    if (idx >= 0) {
      const id = sections[idx].id;
      setExpanded((prev) => ({ ...prev, [id]: true }));
    }
  }, [currentPath, sections, isActive]); // ✅ añadimos isActive

  const toggleSection = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  if (!mounted) return null;

  return (
    <aside
      className={`fixed left-0 top-0 z-50 w-44 border-r border-white/10 bg-white/10 p-4 shadow-md shadow-sky-950/10 backdrop-blur-lg transition-transform duration-300 md:translate-x-0 md:border-none md:bg-transparent md:shadow-none ${
        menuOpen ? "translate-x-0" : "-translate-x-full"
      } h-dvh overflow-y-auto md:block`}
    >
      <nav className="flex min-h-full flex-col pb-6">
        <ul className="flex flex-1 flex-col items-center justify-center space-y-3 text-sm font-extralight">
          <li className="w-full transition-transform hover:scale-95 active:scale-90">
            <Link
              href="/"
              className={`flex w-full items-center justify-between rounded-full px-4 py-2 text-sm font-medium text-sky-950 transition-colors duration-200 dark:text-white ${
                isActive("/")
                  ? "bg-white/10 shadow-md shadow-sky-950/10 backdrop-blur"
                  : "shadow-sky-950/10 hover:bg-white/10 hover:shadow-md hover:backdrop-blur"
              }`}
              onClick={closeMenu}
            >
              Perfil
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
                  d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                />
              </svg>
            </Link>
          </li>

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
                  <ul className="space-y-2 pl-1">
                    {sec.items.map((it) => (
                      <li
                        key={it.href}
                        className="text-sm transition-transform hover:scale-95 active:scale-90"
                      >
                        <Link
                          href={it.href}
                          className={itemCls(isActive(it.href))}
                          onClick={closeMenu}
                        >
                          {it.label}
                        </Link>
                      </li>
                    ))}
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
