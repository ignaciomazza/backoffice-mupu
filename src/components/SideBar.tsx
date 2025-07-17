// src/components/SideBar.tsx
"use client";

import Link from "next/link";
// import { useAuth } from "@/context/AuthContext";
// import { useRouter } from "next/navigation";
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
  // const { setToken } = useAuth();
  // const router = useRouter();
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
        console.log("[SideBar] Rol obtenido:", data);
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
      case "/users":
        return ["desarrollador", "gerente"].includes(role);
      case "/teams":
        return ["desarrollador", "gerente"].includes(role);
      case "/invoices":
        return ["desarrollador", "gerente", "administrativo"].includes(role);
      case "/balances":
        return ["desarrollador", "gerente", "administrativo"].includes(role);
      case "/earnings":
        return ["desarrollador", "gerente", "administrativo"].includes(role);

      default:
        return true;
    }
  };

  // const handleLogout = async () => {
  //   await fetch("/api/auth/logout", {
  //     method: "POST",
  //     credentials: "include",
  //   });
  //   setToken(null);
  //   closeMenu();
  //   router.push("/login");
  // };

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
          {hasAccess("/users") && (
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
                Usuarios
              </Link>
            </li>
          )}
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
        {/* <div className="w-full">
          <button
            onClick={handleLogout}
            className="absolute flex w-full items-center justify-evenly rounded-full p-2 transition-all hover:scale-95 hover:bg-sky-950 hover:text-white active:scale-90 dark:hover:bg-white dark:hover:text-sky-950"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="size-6"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.4}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75"
              />
            </svg>
            <p className="font-light md:text-white md:dark:text-sky-950">
              Cerrar Sesion
            </p>
          </button>
        </div> */}
      </nav>
    </aside>
  );
}
