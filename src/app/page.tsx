// src/app/page.tsx
"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { UserProfile } from "@/types/index";

export default function ProfilePage() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const { token } = useAuth();

  useEffect(() => {
    if (!token) return;
    fetch("/api/user/profile", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error("No autorizado");
        }
        return res.json();
      })
      .then((data) => {
        setUserProfile(data);
      })
      .catch((err) => console.error("Error fetching profile:", err));
  }, [token]);

  return (
    <ProtectedRoute>
      <section className="text-black dark:text-white">
        <h1 className="text-2xl font-semibold dark:font-medium mb-4">Perfil del Usuario</h1>
        {userProfile ? (
          <div className="bg-white dark:bg-black text-black dark:text-white shadow-md rounded-3xl p-6 space-y-3 mb-6 mx-2 dark:border dark:border-white">
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
            <div>
              <h2 className="text-xl font-semibold dark:font-medium mt-4">Ventas</h2>
              {userProfile.salesData && userProfile.salesData.length > 0 ? (
                <ul>
                  {userProfile.salesData.map((sale) => (
                    <li
                      key={sale.id_booking}
                      className="border-b border-gray-200 pb-2 mb-2"
                    >
                      <p>
                        <strong>Reserva:</strong>{" "}
                        {sale.details || "Sin detalles"}
                      </p>
                      <p>
                        <strong>Servicios Totales:</strong> {sale.totalServices}
                      </p>
                      <p>
                        <strong>Ventas Totales:</strong> $
                        {sale.totalSales.toFixed(2)}
                      </p>
                      {sale.seller && (
                        <p>
                          <strong>Vendedor:</strong> {sale.seller}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No hay ventas disponibles.</p>
              )}
            </div>
          </div>
        ) : (
          <p>No hay información disponible para el perfil del usuario.</p>
        )}
      </section>
    </ProtectedRoute>
  );
}
