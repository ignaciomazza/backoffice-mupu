"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
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
  const { setToken } = useAuth();
  const router = useRouter();
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
        return ["desarrollador", "administrativo"].includes(role);
      case "/agency":
        return ["desarrollador", "gerente"].includes(role);
      case "/users":
        return ["desarrollador"].includes(role);
      case "/teams":
        return ["desarrollador", "gerente"].includes(role);
      default:
        return true;
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    setToken(null);
    closeMenu();
    router.push("/login");
  };

  if (!mounted) {
    return null;
  }

  return (
    <aside
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      className={`fixed left-0 top-0 z-50 h-screen w-48 border-r border-black bg-white p-4 transition-transform duration-300 dark:border-white dark:bg-black md:translate-x-0 md:border-none ${
        menuOpen ? "translate-x-0" : "-translate-x-full"
      } md:block`}
    >
      <nav className="flex h-full flex-col">
        {/* Contenedor para los enlaces centrados */}
        <div className="flex flex-1 flex-col justify-center">
          <ul className="flex flex-col space-y-3">
            <li className="transition-transform hover:scale-95 active:scale-90">
              <Link
                href="/"
                className={`block rounded-full py-2 text-center transition-colors duration-200 ${
                  currentPath === "/"
                    ? "bg-black text-white dark:bg-white dark:text-black"
                    : "hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                }`}
                onClick={closeMenu}
              >
                Perfil
              </Link>
            </li>
            <li className="transition-transform hover:scale-95 active:scale-90">
              <Link
                href="/clients"
                className={`block rounded-full py-2 text-center transition-colors duration-200 ${
                  currentPath === "/clients"
                    ? "bg-black text-white dark:bg-white dark:text-black"
                    : "hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                }`}
                onClick={closeMenu}
              >
                Clientes
              </Link>
            </li>
            <li className="transition-transform hover:scale-95 active:scale-90">
              <Link
                href="/bookings"
                className={`block rounded-full py-2 text-center transition-colors duration-200 ${
                  currentPath === "/bookings" ||
                  currentPath.includes("/bookings/")
                    ? "bg-black text-white dark:bg-white dark:text-black"
                    : "hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
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
                  className={`block rounded-full py-2 text-center transition-colors duration-200 ${
                    currentPath === "/operators"
                      ? "bg-black text-white dark:bg-white dark:text-black"
                      : "hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                  }`}
                  onClick={closeMenu}
                >
                  Operadores
                </Link>
              </li>
            )}
            {hasAccess("/agency") && (
              <li className="transition-transform hover:scale-95 active:scale-90">
                <Link
                  href="/agency"
                  className={`block rounded-full py-2 text-center transition-colors duration-200 ${
                    currentPath === "/agency"
                      ? "bg-black text-white dark:bg-white dark:text-black"
                      : "hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
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
                  className={`block rounded-full py-2 text-center transition-colors duration-200 ${
                    currentPath === "/users"
                      ? "bg-black text-white dark:bg-white dark:text-black"
                      : "hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
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
                  className={`block rounded-full py-2 text-center transition-colors duration-200 ${
                    currentPath === "/teams"
                      ? "bg-black text-white dark:bg-white dark:text-black"
                      : "hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                  }`}
                  onClick={closeMenu}
                >
                  Equipos
                </Link>
              </li>
            )}
          </ul>
        </div>
        {/* Botón de logout en la parte inferior */}
        <div className="w-full">
          <button
            onClick={handleLogout}
            className="flex w-full items-center justify-evenly rounded-full p-2 transition-all hover:scale-95 hover:bg-black hover:text-white active:scale-90 dark:hover:bg-white dark:hover:text-black"
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
            <p className="font-light md:text-white md:dark:text-black">
              Cerrar Sesión
            </p>
          </button>
        </div>
      </nav>
    </aside>
  );
}
