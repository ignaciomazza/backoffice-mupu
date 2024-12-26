"use client";

import Link from "next/link";

interface SidebarProps {
  menuOpen: boolean;
  closeMenu: () => void;
  currentPath: string; // Recibir la ruta actual como prop
}

export default function SideBar({ menuOpen, closeMenu, currentPath }: SidebarProps) {
  return (
    <aside
      className={`fixed top-0 left-0 h-screen w-48 bg-white dark:bg-black p-4 border-r md:border-none border-black dark:border-white transform transition-transform duration-300 md:translate-x-0 ${
        menuOpen ? "translate-x-0" : "-translate-x-full"
      } md:block`}
    >
      <nav className="h-full">
        <ul className="space-y-3 h-full flex flex-col justify-center">
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
                currentPath === "/bookings" || currentPath.includes("/bookings/")
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
      </nav>
    </aside>
  );
}
