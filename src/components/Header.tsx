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
    <header
      className={`z-50 flex w-full items-center justify-between px-4 py-6 text-sky-950 dark:text-white md:top-0`}
    >
      <div className="flex w-full flex-auto justify-start md:justify-center">
        {!isLoginPage && (
          <p className="text-lg font-medium">
            Ofis<span className="font-light">tur</span>
          </p>
        )}
        {isLoginPage && (
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
              // Icono de Cruz
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
              // Icono de Menú Hamburguesa
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
