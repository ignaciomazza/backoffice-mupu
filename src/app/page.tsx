// src/app/profile/page.tsx
"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import { motion } from "framer-motion";
import AnimatedMessage from "@/components/profile/AnimatedMessage";
import DashboardShortcuts from "@/components/profile/DashboardShortcuts";

type UserProfile = { first_name?: string };

export default function ProfilePage() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const { token } = useAuth();

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch("/api/user/profile", {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });
        if (!res.ok) throw new Error("Error fetching profile");
        const data = (await res.json()) as UserProfile;
        setUserProfile(data);
      } catch (error) {
        console.error("Error fetching profile:", error);
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
        className="flex min-h-screen w-full flex-col items-center"
      >
        {loading ? (
          <div className="flex min-h-[80vh] items-center justify-center">
            <Spinner />
          </div>
        ) : showGrid ? (
          <div className="flex items-center justify-center p-4">
            <DashboardShortcuts />
          </div>
        ) : (
          <div className="flex h-[80vh] items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.4 }}
            >
              <AnimatedMessage
                text={titleText}
                speed={50}
                startDelay={500} // espera medio segundo tras el fade
                onComplete={() => {
                  setTimeout(() => setShowGrid(true), 1500);
                }}
              />
            </motion.div>
          </div>
        )}
      </motion.section>
    </ProtectedRoute>
  );
}
