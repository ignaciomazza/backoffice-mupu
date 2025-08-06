// src/app/resources/page.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import ResourceCard from "@/components/resources/ResourceCard";
import ResourceForm from "@/components/resources/ResourceForm";

interface Resource {
  id_resource: number;
  title: string;
  description: string | null;
  createdAt: string;
}

export default function Page() {
  const { token } = useAuth();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [agencyId, setAgencyId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // 1) Fetch perfil para obtener role + agency
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch("/api/user/profile", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Error al obtener perfil");
        const data = await res.json();
        setRole(data.role);
        setAgencyId(data.id_agency);
      } catch (err) {
        console.error("❌ Error fetching profile:", err);
      }
    })();
  }, [token]);

  // 2) Fetch resources filtrados por agencyId
  useEffect(() => {
    if (agencyId === null) return;
    setLoading(true);
    fetch(`/api/resources?agencyId=${agencyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Error al obtener recursos");
        return res.json() as Promise<Resource[]>;
      })
      .then((data) => {
        setResources(data);
      })
      .catch((err) => {
        console.error("❌ Error fetching resources:", err);
        setResources([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [agencyId, token]);

  const displayed = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return resources.filter((r) => r.title.toLowerCase().includes(term));
  }, [resources, searchTerm]);

  const handleCreated = (newRes: Resource) => {
    setResources((prev) => [newRes, ...prev]);
  };

  const isManager = role === "gerente" || role === "desarrollador" || role === "lider";

  return (
    <ProtectedRoute>
      <section className="text-sky-950 dark:text-white">
        {isManager && <ResourceForm onCreated={handleCreated} />}

        <h2 className="mt-4 text-2xl font-medium">Recursos</h2>

        <div className="mt-4 flex w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:border-white/10 dark:text-white">
          <input
            type="text"
            placeholder="Buscar recurso por título..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-transparent outline-none placeholder:font-light placeholder:tracking-wide"
          />
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="size-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
        </div>

        {loading || !displayed ? (
          <div className="flex min-h-[50vh] items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {displayed.map((res) => (
              <ResourceCard
                key={res.id_resource}
                resource={res}
                expandedId={expandedId}
                setExpandedId={setExpandedId}
              />
            ))}
          </div>
        )}
      </section>
    </ProtectedRoute>
  );
}
