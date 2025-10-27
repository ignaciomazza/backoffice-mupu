// src/components/LayoutWrapper.tsx
"use client";
import { useEffect, useState } from "react";
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
  const isLanding = pathname === "/"; // ✅ NUEVO
  const isQr = pathname === "/qr";

  // ✅ En landing forzamos modo claro (sin dark)
  useEffect(() => {
    if (isLanding) {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isLanding]);

  const showSidebar = !isLoginPage && !isLanding && !isQr; // ✅ sin sidebar en landing
  const showVanta = !isLoginPage; // mantenemos Vanta (en light queda bien)

  return (
    <div className="flex min-h-screen flex-col text-sky-950 dark:text-white">
      {showVanta && <VantaBackground />}
      {!isQr && <Header toggleMenu={toggleMenu} menuOpen={menuOpen} />}
      <div
        className={`flex flex-1 ${isLoginPage ? "items-center justify-center" : ""}`}
      >
        {showSidebar && (
          <SideBar
            menuOpen={menuOpen}
            closeMenu={closeMenu}
            currentPath={pathname}
          />
        )}
        <main
          className={`flex-1 px-2 pb-6 md:px-6 ${showSidebar ? "md:pl-48 md:pr-8" : ""}`}
        >
          {children}
        </main>
      </div>
      <style jsx global>{`
        select {
          background-color: white;
          color: #0f172a;
        }
        .dark select {
          background-color: #000;
          color: #fff;
        }
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
