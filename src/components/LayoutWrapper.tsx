// src/components/LayoutWrapper.tsx
"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import Header from "./Header";
import SideBar from "./SideBar";
import VantaBackground from "./VantaBackground";

export default function LayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname() || "";

  const toggleMenu = () => setMenuOpen(!menuOpen);
  const closeMenu = () => setMenuOpen(false);

  const isLoginPage = pathname === "/login";

  return (
    <div className="flex min-h-screen flex-col text-sky-950 dark:text-white">
      {!isLoginPage && <VantaBackground />}
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
            currentPath={pathname}
          />
        )}
        <main
          className={`flex-1 px-2 pb-6 md:px-6 ${
            !isLoginPage
              ? "md:pl-48 md:pr-8"
              : "flex size-full items-center justify-center"
          }`}
        >
          {children}
        </main>
      </div>
      <style jsx global>{`
        /* Estilo del <select> en claro y oscuro */
        select {
          background-color: white;
          color: #0f172a; /* tu clase text-sky-950 */
        }
        .dark select {
          background-color: #000;
          color: #fff;
        }

        /* Para las <option> */
        select option {
          background-color: white;
          color: #0f172a;
        }
        .dark select option {
          background-color: #000;
          color: #fff;
        }
      `}</style>
    </div>
  );
}
