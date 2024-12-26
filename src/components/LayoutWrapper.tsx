"use client";

import { useState } from "react";
import { usePathname } from "next/navigation"; // Importar para obtener la ruta actual
import Header from "./Header";
import SideBar from "./SideBar";

export default function LayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname() || ""; // Asegura que siempre sea una string, usando "" como valor por defecto

  const toggleMenu = () => setMenuOpen(!menuOpen);
  const closeMenu = () => setMenuOpen(false);

  const isLoginPage = pathname === "/login"; // Verificar si estamos en la página de login

  return (
    <div className="flex flex-col min-h-screen bg-white text-black dark:bg-black dark:text-white">
      <Header toggleMenu={toggleMenu} menuOpen={menuOpen} />
      <div
        className={`flex flex-1 ${
          isLoginPage ? "items-center justify-center" : ""
        }`}
      >
        {!isLoginPage && (
          <SideBar
            menuOpen={menuOpen}
            closeMenu={closeMenu}
            currentPath={pathname} // Se pasa pathname sin problemas
          />
        )}
        <main
          className={`flex-1 px-6 py-20 ${
            !isLoginPage
              ? "md:pl-56 md:pr-8"
              : "w-full h-full flex items-center justify-center"
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
