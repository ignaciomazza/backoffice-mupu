// src/app/agency/page.tsx

"use client";
import { useState, useEffect } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";

interface Agency {
  id_agency: number;
  name: string;
  address: string;
  phone: string;
  email: string;
  tax_id: string;
  website: string;
  foundation_date: string;
}

// Función para formatear la fecha en dd/mm/yyyy
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0"); // Los meses empiezan en 0
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
};

export default function AgencyPage() {
  const [agency, setAgency] = useState<Agency | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);

    fetch("/api/agency")
      .then((res) => res.json())
      .then((data) => setAgency(data));
  }, []);

  if (!isMounted) {
    return null;
  }

  return (
    <ProtectedRoute>
      <section className="text-black dark:text-white">
        <h1 className="text-2xl font-semibold dark:font-medium mb-4">
          Información de la Agencia
        </h1>
        {agency ? (
          <div className="bg-white dark:bg-black text-black dark:text-white shadow-md rounded-3xl p-6 space-y-3 mb-6 mx-2 dark:border dark:border-white">
            <p className="font-light">
              <span className="font-semibold dark:font-medium mr-2">Nombre</span> {agency.name}
            </p>
            <p className="font-light">
              <span className="font-semibol dark:font-medium mr-2">Dirección</span> {agency.address}
            </p>
            <p className="font-light">
              <span className="font-semibold dark:font-medium mr-2">Teléfono</span> {agency.phone}
            </p>
            <p className="font-light">
              <span className="font-semibold dark:font-medium mr-2">Email</span> {agency.email}
            </p>
            <p className="font-light">
              <span className="font-semibold dark:font-medium mr-2">CUIT</span> {agency.tax_id}
            </p>
            <p className="font-light">
              <span className="font-semibold dark:font-medium mr-2">Sitio Web</span> {agency.website}
            </p>
            <p className="font-light">
              <span className="font-semibold dark:font-medium mr-2">Fecha de Fundación</span>{" "}
              {agency.foundation_date
                ? formatDate(agency.foundation_date)
                : "No disponible"}
            </p>
          </div>
        ) : (
          <p>No hay información disponible para la agencia.</p>
        )}
      </section>
    </ProtectedRoute>
  );
}
