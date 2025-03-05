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
const formatDate = (dateString: string): string => {
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
        <h1 className="mb-4 text-2xl font-semibold dark:font-medium">
          Información de la Agencia
        </h1>
        {agency ? (
          <div className="mx-2 mb-6 space-y-3 rounded-3xl bg-white p-6 text-black shadow-md dark:border dark:border-white dark:bg-black dark:text-white">
            <p className="font-light">
              <span className="mr-2 font-semibold dark:font-medium">
                Nombre
              </span>
              {agency.name}
            </p>
            <p className="font-light">
              <span className="mr-2 font-semibold dark:font-medium">
                Dirección
              </span>
              {agency.address}
            </p>
            <p className="font-light">
              <span className="mr-2 font-semibold dark:font-medium">
                Teléfono
              </span>
              {agency.phone}
            </p>
            <p className="font-light">
              <span className="mr-2 font-semibold dark:font-medium">Email</span>
              {agency.email}
            </p>
            <p className="font-light">
              <span className="mr-2 font-semibold dark:font-medium">CUIT</span>
              {agency.tax_id}
            </p>
            <p className="font-light">
              <span className="mr-2 font-semibold dark:font-medium">
                Sitio Web
              </span>
              {agency.website}
            </p>
            <p className="font-light">
              <span className="mr-2 font-semibold dark:font-medium">
                Fecha de Fundación
              </span>
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
