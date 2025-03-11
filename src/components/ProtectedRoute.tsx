// src/components/ProtectedRoute.tsx
"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import Spinner from "./Spinner";
import { motion, AnimatePresence } from "framer-motion";

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { token, loading, setToken } = useAuth();
  const router = useRouter();
  const pathname = usePathname() || "";

  const [sessionExpired, setSessionExpired] = useState(false);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const INACTIVITY_TIMEOUT = 1000 * 60 * 60 * 5;

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => {
      console.log("[ProtectedRoute] Sesión expirada por inactividad");
      setSessionExpired(true);
    }, INACTIVITY_TIMEOUT);
  }, [INACTIVITY_TIMEOUT]);

  useEffect(() => {
    const events = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
    ];
    const handleEvent = () => resetInactivityTimer();
    events.forEach((event) => window.addEventListener(event, handleEvent));
    resetInactivityTimer();
    return () => {
      events.forEach((event) => window.removeEventListener(event, handleEvent));
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [resetInactivityTimer]);

  useEffect(() => {
    if (!loading && !token) {
      console.log("[ProtectedRoute] No hay token, redirigiendo a /login");
      router.push("/login");
    }
  }, [loading, token, router]);

  const [role, setRole] = useState<string | null>(null);
  useEffect(() => {
    if (!loading && token) {
      const fetchRole = async () => {
        try {
          const res = await fetch("/api/user/role");
          const data = await res.json();
          console.log(
            "[ProtectedRoute] Rol obtenido desde /api/user/role:",
            data,
          );
          if (data.error) {
            console.log("[ProtectedRoute] Error al obtener rol:", data.error);
            router.push("/login");
          } else if (data.role) {
            setRole(data.role.toLowerCase());
          }
        } catch (error) {
          console.error("[ProtectedRoute] Error fetching role:", error);
          router.push("/login");
        }
      };
      fetchRole();
    }
  }, [loading, token, router]);

  useEffect(() => {
    if (!loading && token && role) {
      let allowedRoles: string[] = [];
      if (/^\/(teams|agency)(\/|$)/.test(pathname)) {
        allowedRoles = ["desarrollador", "gerente"];
      } else if (/^\/operators(\/|$)/.test(pathname)) {
        allowedRoles = ["desarrollador", "administrativo"];
      } else if (/^\/users(\/|$)/.test(pathname)) {
        allowedRoles = ["desarrollador"];
      }
      console.log(
        `[ProtectedRoute] Para la ruta "${pathname}", roles permitidos:`,
        allowedRoles,
      );
      console.log("[ProtectedRoute] Rol del usuario:", role);
      if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
        console.log(
          `[ProtectedRoute] El rol "${role}" no está permitido para la ruta "${pathname}". Redirigiendo a /login`,
        );
        router.push("/");
      }
    }
  }, [loading, token, role, pathname, router]);

  const handleModalAccept = () => {
    setToken(null);
    router.push("/login");
  };

  if (loading) return <Spinner />;
  return (
    <>
      {token ? children : null}
      <AnimatePresence>
        {sessionExpired && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeInOut" }}
          >
            <motion.div
              className="mx-auto max-w-md rounded-3xl bg-white p-8 text-center shadow-lg dark:border dark:border-[#ffffff4e] dark:bg-black"
              initial={{ scale: 0.8, opacity: 0, y: -50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 50 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <h2 className="mb-4 text-2xl font-semibold text-black dark:text-white">
                Sesión Expirada
              </h2>
              <p className="mb-6 font-light text-black dark:text-white">
                Tu sesión ha expirado por inactividad. Presiona
                &quot;Entendido&quot; para iniciar sesión nuevamente.
              </p>
              <button
                onClick={handleModalAccept}
                className="rounded-2xl bg-black px-4 py-2 text-white transition-transform hover:scale-95 active:scale-90 dark:bg-white dark:text-black"
              >
                Entendido
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
