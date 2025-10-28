// src/app/profile/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import { motion, AnimatePresence } from "framer-motion";
import AnimatedMessage from "@/components/profile/AnimatedMessage";
import DashboardShortcuts from "@/components/profile/DashboardShortcuts";
import { authFetch } from "@/utils/authFetch";

type UserProfile = {
  id_user: number;
  id_agency: number;
  first_name: string;
  last_name: string;
  role: string;
  position: string;
};

export default function ProfilePage() {
  const { token } = useAuth();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Mostrar mensaje sólo la primera vez
  const [showWelcome, setShowWelcome] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("welcomeShown") !== "true";
  });
  const [showGrid, setShowGrid] = useState(false);

  useEffect(() => {
    if (!loading && !showWelcome) setShowGrid(true);
  }, [loading, showWelcome]);

  // Fetch del perfil (usando authFetch)
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    (async () => {
      try {
        const res = await authFetch(
          "/api/user/profile",
          { cache: "no-store" },
          token,
        );
        if (!res.ok) throw new Error("Error fetching profile");
        const data = (await res.json()) as UserProfile;
        setUserProfile(data);
      } catch (err) {
        console.error("Error fetching profile:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const titleText = `Hola${userProfile?.first_name ? `, ${userProfile.first_name}` : ""} :)`;

  return (
    <ProtectedRoute>
      <motion.section
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex w-full flex-col items-center"
      >
        <AnimatePresence mode="wait">
          {loading && (
            <motion.div
              key="spinner"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex min-h-[80vh] items-center justify-center"
            >
              <Spinner />
            </motion.div>
          )}

          {!loading && showWelcome && !showGrid && (
            <motion.div
              key="message"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex h-[80vh] items-center justify-center p-4"
            >
              <AnimatedMessage
                text={titleText}
                speed={70}
                variance={0.3}
                startDelay={500}
                holdTime={1500}
                onComplete={() => {
                  sessionStorage.setItem("welcomeShown", "true");
                  setShowWelcome(false);
                }}
              />
            </motion.div>
          )}

          {!loading && showGrid && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.4 }}
              className="flex w-full items-center justify-center md:p-4"
            >
              {/* Ya no necesita props */}
              <DashboardShortcuts />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>
    </ProtectedRoute>
  );
}
