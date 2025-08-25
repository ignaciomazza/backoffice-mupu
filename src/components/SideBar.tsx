// src/components/SideBar.tsx
"use client";
import Link from "next/link";
import { useState, useEffect } from "react";

interface SidebarProps {
  menuOpen: boolean;
  closeMenu: () => void;
  currentPath: string;
}

export default function SideBar({
  menuOpen,
  closeMenu,
  currentPath,
}: SidebarProps) {
  const [mounted, setMounted] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const fetchRole = async () => {
      try {
        const res = await fetch("/api/user/role");
        const data = await res.json();
        if (data && data.role) {
          setRole(data.role.toLowerCase());
        }
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
        return ["desarrollador", "gerente"].includes(role);
      case "/teams":
        return ["desarrollador", "gerente"].includes(role);
      case "/invoices":
        return ["desarrollador", "gerente", "administrativo"].includes(role);
      case "/balances":
        return ["desarrollador", "gerente", "administrativo"].includes(role);
      case "/earnings":
        return ["desarrollador", "gerente", "administrativo"].includes(role);
      case "/investments":
        return ["desarrollador", "gerente", "administrativo"].includes(role);

      default:
        return true;
    }
  };

  if (!mounted) {
    return null;
  }

  return (
    <aside
      className={`fixed left-0 top-0 z-50 h-screen w-44 border-r border-white/10 bg-white/10 p-4 shadow-md shadow-sky-950/10 backdrop-blur-lg transition-transform duration-300 md:translate-x-0 md:border-none md:bg-transparent md:shadow-none ${
        menuOpen ? "translate-x-0" : "-translate-x-full"
      } md:block`}
    >
      <nav className="flex h-full flex-col">
        <ul className="flex flex-1 flex-col justify-center space-y-2 text-sm font-extralight">
          <li className="transition-transform hover:scale-95 active:scale-90">
            <Link
              href="/"
              className={`block rounded-full py-2 text-center text-sky-950 transition-colors duration-200 dark:text-white ${
                currentPath === "/"
                  ? "bg-white/10 shadow-md shadow-sky-950/10 backdrop-blur"
                  : "shadow-sky-950/10 hover:bg-white/10 hover:shadow-md hover:backdrop-blur"
              }`}
              onClick={closeMenu}
            >
              Perfil
            </Link>
          </li>
          <li className="transition-transform hover:scale-95 active:scale-90">
            <Link
              href="/clients"
              className={`block rounded-full py-2 text-center text-sky-950 transition-colors duration-200 dark:text-white ${
                currentPath === "/clients"
                  ? "bg-white/10 shadow-md shadow-sky-950/10 backdrop-blur"
                  : "shadow-sky-950/10 hover:bg-white/10 hover:shadow-md hover:backdrop-blur"
              }`}
              onClick={closeMenu}
            >
              Clientes
            </Link>
          </li>
          <li className="transition-transform hover:scale-95 active:scale-90">
            <Link
              href="/bookings"
              className={`block rounded-full py-2 text-center text-sky-950 transition-colors duration-200 dark:text-white ${
                currentPath === "/bookings" ||
                currentPath.includes("/bookings/")
                  ? "bg-white/10 shadow-md shadow-sky-950/10 backdrop-blur"
                  : "shadow-sky-950/10 hover:bg-white/10 hover:shadow-md hover:backdrop-blur"
              }`}
              onClick={closeMenu}
            >
              Reservas
            </Link>
          </li>
          {hasAccess("/operators") && (
            <li className="transition-transform hover:scale-95 active:scale-90">
              <Link
                href="/operators"
                className={`block rounded-full py-2 text-center text-sky-950 transition-colors duration-200 dark:text-white ${
                  currentPath === "/operators"
                    ? "bg-white/10 shadow-md shadow-sky-950/10 backdrop-blur"
                    : "shadow-sky-950/10 hover:bg-white/10 hover:shadow-md hover:backdrop-blur"
                }`}
                onClick={closeMenu}
              >
                Operadores
              </Link>
            </li>
          )}
          {hasAccess("/invoices") && (
            <li className="transition-transform hover:scale-95 active:scale-90">
              <Link
                href="/invoices"
                className={`block rounded-full py-2 text-center text-sky-950 transition-colors duration-200 dark:text-white ${
                  currentPath === "/invoices"
                    ? "bg-white/10 shadow-md shadow-sky-950/10 backdrop-blur"
                    : "shadow-sky-950/10 hover:bg-white/10 hover:shadow-md hover:backdrop-blur"
                }`}
                onClick={closeMenu}
              >
                Facturas
              </Link>
            </li>
          )}
          {hasAccess("/balances") && (
            <li className="transition-transform hover:scale-95 active:scale-90">
              <Link
                href="/balances"
                className={`block rounded-full py-2 text-center text-sky-950 transition-colors duration-200 dark:text-white ${
                  currentPath === "/balances"
                    ? "bg-white/10 shadow-md shadow-sky-950/10 backdrop-blur"
                    : "shadow-sky-950/10 hover:bg-white/10 hover:shadow-md hover:backdrop-blur"
                }`}
                onClick={closeMenu}
              >
                Saldos
              </Link>
            </li>
          )}
          {hasAccess("/investments") && (
            <li className="transition-transform hover:scale-95 active:scale-90">
              <Link
                href="/investments"
                className={`block rounded-full py-2 text-center text-sky-950 transition-colors duration-200 dark:text-white ${
                  currentPath === "/investments"
                    ? "bg-white/10 shadow-md shadow-sky-950/10 backdrop-blur"
                    : "shadow-sky-950/10 hover:bg-white/10 hover:shadow-md hover:backdrop-blur"
                }`}
                onClick={closeMenu}
              >
                Inversion
              </Link>
            </li>
          )}
          {hasAccess("/earnings") && (
            <li className="transition-transform hover:scale-95 active:scale-90">
              <Link
                href="/earnings"
                className={`block rounded-full py-2 text-center text-sky-950 transition-colors duration-200 dark:text-white ${
                  currentPath === "/earnings"
                    ? "bg-white/10 shadow-md shadow-sky-950/10 backdrop-blur"
                    : "shadow-sky-950/10 hover:bg-white/10 hover:shadow-md hover:backdrop-blur"
                }`}
                onClick={closeMenu}
              >
                Ganancias
              </Link>
            </li>
          )}
          <li className="transition-transform hover:scale-95 active:scale-90">
            <Link
              href="/resources"
              className={`block rounded-full py-2 text-center text-sky-950 transition-colors duration-200 dark:text-white ${
                currentPath === "/resources"
                  ? "bg-white/10 shadow-md shadow-sky-950/10 backdrop-blur"
                  : "shadow-sky-950/10 hover:bg-white/10 hover:shadow-md hover:backdrop-blur"
              }`}
              onClick={closeMenu}
            >
              Recursos
            </Link>
          </li>
          <li className="transition-transform hover:scale-95 active:scale-90">
            <Link
              href="/calendar"
              className={`block rounded-full py-2 text-center text-sky-950 transition-colors duration-200 dark:text-white ${
                currentPath === "/calendar" ||
                currentPath.includes("/calendar/")
                  ? "bg-white/10 shadow-md shadow-sky-950/10 backdrop-blur"
                  : "shadow-sky-950/10 hover:bg-white/10 hover:shadow-md hover:backdrop-blur"
              }`}
              onClick={closeMenu}
            >
              Calendario
            </Link>
          </li>
          <li className="transition-transform hover:scale-95 active:scale-90">
            <Link
              href="/templates"
              className={`block rounded-full py-2 text-center text-sky-950 transition-colors duration-200 dark:text-white ${
                currentPath === "/templates" ||
                currentPath.includes("/templates/")
                  ? "bg-white/10 shadow-md shadow-sky-950/10 backdrop-blur"
                  : "shadow-sky-950/10 hover:bg-white/10 hover:shadow-md hover:backdrop-blur"
              }`}
              onClick={closeMenu}
            >
              Templates
            </Link>
          </li>
          {hasAccess("/agency") && (
            <li className="transition-transform hover:scale-95 active:scale-90">
              <Link
                href="/agency"
                className={`block rounded-full py-2 text-center text-sky-950 transition-colors duration-200 dark:text-white ${
                  currentPath === "/agency"
                    ? "bg-white/10 shadow-md shadow-sky-950/10 backdrop-blur"
                    : "shadow-sky-950/10 hover:bg-white/10 hover:shadow-md hover:backdrop-blur"
                }`}
                onClick={closeMenu}
              >
                Agencia
              </Link>
            </li>
          )}
          <li className="transition-transform hover:scale-95 active:scale-90">
            <Link
              href="/users"
              className={`block rounded-full py-2 text-center text-sky-950 transition-colors duration-200 dark:text-white ${
                currentPath === "/users"
                  ? "bg-white/10 shadow-md shadow-sky-950/10 backdrop-blur"
                  : "shadow-sky-950/10 hover:bg-white/10 hover:shadow-md hover:backdrop-blur"
              }`}
              onClick={closeMenu}
            >
              {role === "gerente" ||
              role === "desarrollador" ||
              role === "administrativo"
                ? "Usuarios"
                : "Usuario"}
            </Link>
          </li>
          {hasAccess("/teams") && (
            <li className="transition-transform hover:scale-95 active:scale-90">
              <Link
                href="/teams"
                className={`block rounded-full py-2 text-center text-sky-950 transition-colors duration-200 dark:text-white ${
                  currentPath === "/teams"
                    ? "bg-white/10 shadow-md shadow-sky-950/10 backdrop-blur"
                    : "shadow-sky-950/10 hover:bg-white/10 hover:shadow-md hover:backdrop-blur"
                }`}
                onClick={closeMenu}
              >
                Equipos
              </Link>
            </li>
          )}
        </ul>
      </nav>
    </aside>
  );
}
