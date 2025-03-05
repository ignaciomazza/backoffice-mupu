// src/components/ProtectedRoute.tsx

"use client";
import { useEffect, useState, useRef } from "react";
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

  const resetInactivityTimer = () => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => {
      setSessionExpired(true);
    }, INACTIVITY_TIMEOUT);
  };

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
  }, []);

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
            className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-75 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeInOut" }}
          >
            <motion.div
              className="bg-white dark:bg-black dark:border dark:border-[#ffffff4e] rounded-3xl p-8 shadow-lg text-center max-w-md mx-auto"
              initial={{ scale: 0.8, opacity: 0, y: -50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 50 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <h2 className="text-2xl font-semibold mb-4 text-black dark:text-white">
                Sesión Expirada
              </h2>
              <p className="mb-6 font-light text-black dark:text-white">
                Tu sesión ha expirado por inactividad. Presiona "Entendido" para
                iniciar sesión nuevamente.
              </p>
              <button
                onClick={handleModalAccept}
                className="px-4 py-2 bg-black text-white dark:bg-white dark:text-black rounded-2xl hover:scale-105 active:scale-100 transition-transform"
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
