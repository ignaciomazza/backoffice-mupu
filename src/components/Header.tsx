// src/components/Header.tsx

"use client";
import ThemeToggle from "@/components/ThemeToggle";
import { usePathname } from "next/navigation";

interface HeaderProps {
  toggleMenu: () => void;
  menuOpen: boolean;
}

export default function Header({ toggleMenu, menuOpen }: HeaderProps) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  return (
    <header className="z-50 bg-white dark:bg-black fixed md:top-0 w-full flex justify-between items-center p-4">
      <h1 className="text-lg font-semibold dark:font-medium tracking-wide flex-auto md:text-center">
        Back Office <span className="text-xs font-light">by MUPU</span>
      </h1>
      <div className="absolute right-4 flex">
        <ThemeToggle />
        {!isLoginPage && (
          <button
            className="block md:hidden ml-4"
            onClick={toggleMenu}
            aria-label="Toggle Menu"
          >
            {menuOpen ? (
              // Icono de Cruz
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
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
              // Icono de Menú Hamburguesa
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
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
