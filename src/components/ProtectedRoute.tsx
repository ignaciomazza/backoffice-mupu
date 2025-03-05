// src/components/ProtectedRoute.tsx

"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Spinner from "./Spinner";
import { motion, AnimatePresence } from "framer-motion";

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { token, loading, setToken } = useAuth();
  const router = useRouter();
  const [sessionExpired, setSessionExpired] = useState(false);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 5 horas de inactividad (1000 ms * 60 * 60 * 5)
  const INACTIVITY_TIMEOUT = 1000 * 60 * 60 * 5;

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => {
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
      router.push("/login");
    }
  }, [loading, token, router]);

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
                className="rounded-2xl bg-black px-4 py-2 text-white transition-transform hover:scale-105 active:scale-100 dark:bg-white dark:text-black"
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
