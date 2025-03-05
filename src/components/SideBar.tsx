// src/components/SideBar.tsx

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
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) {
    return null;
  }

  const handleLogout = async () => {
    // Se llama al endpoint de logout para borrar la cookie HttpOnly en el backend
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    setToken(null);
    closeMenu();
    router.push("/login");
  };

  return (
    <aside
      className={`fixed top-0 left-0 h-screen w-48 bg-white dark:bg-black p-4 border-r md:border-none border-black dark:border-white transform transition-transform duration-300 md:translate-x-0 ${
        menuOpen ? "translate-x-0" : "-translate-x-full"
      } md:block`}
    >
      <nav className="flex flex-col h-full">
        <ul className="flex flex-col flex-1 justify-center space-y-3">
          <li className="transition-transform hover:scale-105 active:scale-100">
            <Link
              href="/"
              className={`block py-2 rounded-full transition-colors duration-200 text-center ${
                currentPath === "/"
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
              }`}
              onClick={closeMenu}
            >
              Perfil
            </Link>
          </li>
          <li className="transition-transform hover:scale-105 active:scale-100">
            <Link
              href="/clients"
              className={`block py-2 rounded-full transition-colors duration-200 text-center ${
                currentPath === "/clients"
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
              }`}
              onClick={closeMenu}
            >
              Clientes
            </Link>
          </li>
          <li className="transition-transform hover:scale-105 active:scale-100">
            <Link
              href="/bookings"
              className={`block py-2 rounded-full transition-colors duration-200 text-center ${
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
          <li className="transition-transform hover:scale-105 active:scale-100">
            <Link
              href="/operators"
              className={`block py-2 rounded-full transition-colors duration-200 text-center ${
                currentPath === "/operators"
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
              }`}
              onClick={closeMenu}
            >
              Operadores
            </Link>
          </li>
          <li className="transition-transform hover:scale-105 active:scale-100">
            <Link
              href="/agency"
              className={`block py-2 rounded-full transition-colors duration-200 text-center ${
                currentPath === "/agency"
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
              }`}
              onClick={closeMenu}
            >
              Agencia
            </Link>
          </li>
          <li className="transition-transform hover:scale-105 active:scale-100">
            <Link
              href="/users"
              className={`block py-2 rounded-full transition-colors duration-200 text-center ${
                currentPath === "/users"
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
              }`}
              onClick={closeMenu}
            >
              Usuarios
            </Link>
          </li>
          <li className="transition-transform hover:scale-105 active:scale-100">
            <Link
              href="/teams"
              className={`block py-2 rounded-full transition-colors duration-200 text-center ${
                currentPath === "/teams"
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
              }`}
              onClick={closeMenu}
            >
              Equipos
            </Link>
          </li>
        </ul>
        <div className="mt-auto pt-4">
          <button
            onClick={handleLogout}
            className="w-full flex items-center p-2 rounded-full transition-all hover:scale-105 active:scale-100 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-6 h-6"
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
          </button>
        </div>
      </nav>
    </aside>
  );
}
