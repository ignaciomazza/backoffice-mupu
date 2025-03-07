// src/app/page.tsx (ProfilePage)

"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { UserProfile } from "@/types/index";
import Spinner from "@/components/Spinner";

export default function ProfilePage() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { token } = useAuth();

  useEffect(() => {
    if (!token) return;

    const fetchProfile = async () => {
      try {
        const res = await fetch("/api/user/profile", {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include", 
        });

        if (!res.ok) {
          if (res.status === 401) {
            return;
          }
          throw new Error("Error fetching profile");
        }
        const data = await res.json();
        setUserProfile(data);
      } catch (error) {
        console.error("Error fetching profile:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [token]);

  return (
    <ProtectedRoute>
      <section className="text-black dark:text-white">
        <h1 className="mb-4 text-2xl font-semibold dark:font-medium">
          Perfil del Usuario
        </h1>
        {isLoading ? (
          <div className="flex size-64 items-center justify-center">
            <Spinner />
          </div>
        ) : userProfile ? (
          <div className="mx-2 mb-6 space-y-3 rounded-3xl bg-white p-6 text-black shadow-md dark:border dark:border-white dark:bg-black dark:text-white">
            <p>
              <strong>Nombre:</strong> {userProfile.name}
            </p>
            <p>
              <strong>Email:</strong> {userProfile.email}
            </p>
            <p>
              <strong>Posición:</strong> {userProfile.position}
            </p>
            <p>
              <strong>Rol:</strong> {userProfile.role}
            </p>
          </div>
        ) : (
          <p>No hay información disponible para el perfil del usuario.</p>
        )}
      </section>
    </ProtectedRoute>
  );
}
