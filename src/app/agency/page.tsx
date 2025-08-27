// src/app/agency/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";

import AgencyHeader from "@/components/agency/AgencyHeader";
import AgencyForm, {
  type AgencyDTO as AgencyDTOForm,
  type AgencyUpdateInput,
} from "@/components/agency/AgencyForm";
import AgencyReadOnlyCard from "@/components/agency/AgencyReadOnlyCard";
import AgencyLogoCard from "@/components/agency/AgencyLogoCard";
import AgencyAfipCard from "@/components/agency/AgencyAfipCard";

type AgencyDTO = AgencyDTOForm;

export default function AgencyPage() {
  const { token } = useAuth();

  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [agency, setAgency] = useState<AgencyDTO | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const logoRef = useRef<HTMLDivElement>(null);

  const canEdit = role === "gerente" || role === "desarrollador";

  useEffect(() => setMounted(true), []);

  // Cargar rol (para habilitar edición) y datos de agencia
  useEffect(() => {
    if (!token) return;

    const controller = new AbortController();

    const load = async () => {
      try {
        setLoading(true);

        // Rol
        const rr = await authFetch(
          "/api/user/role",
          { signal: controller.signal },
          token,
        );
        if (rr.ok) {
          const { role: r } = await rr.json();
          setRole((r || "").toLowerCase());
        } else {
          setRole(null);
        }

        // Agencia
        const ar = await authFetch(
          "/api/agency",
          { signal: controller.signal },
          token,
        );
        if (!ar.ok) throw new Error("Error al obtener la agencia");
        const data: AgencyDTO = await ar.json();
        setAgency(data);
      } catch (e) {
        console.error("[agency/page] load error:", e);
        toast.error("No se pudo cargar la información de la agencia.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    load();
    return () => controller.abort();
  }, [token]);

  async function handleSave(input: AgencyUpdateInput) {
    if (!token) return;
    setSaving(true);
    try {
      const res = await authFetch(
        "/api/agency",
        {
          method: "PUT",
          body: JSON.stringify(input),
        },
        token,
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Error al guardar cambios");
      }

      const updated: AgencyDTO = await res.json();
      setAgency(updated);
      setIsEditing(false);
      toast.success("Agencia actualizada");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al guardar";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  if (!mounted) return null;

  return (
    <ProtectedRoute>
      <section className="text-sky-950 dark:text-white">
        <AgencyHeader
          agency={agency}
        />

        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Spinner />
          </div>
        ) : agency ? (
          <>
            {isEditing && canEdit ? (
              <AgencyForm
                initial={agency}
                isSaving={saving}
                onSubmit={handleSave}
                onCancel={() => setIsEditing(false)}
              />
            ) : (
              <AgencyReadOnlyCard
                agency={agency}
                onEdit={canEdit ? () => setIsEditing(true) : undefined}
              />
            )}

            {/* Sección secundaria: Logo y AFIP */}
            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div ref={logoRef}>
                <AgencyLogoCard />
              </div>
              <AgencyAfipCard />
            </div>
          </>
        ) : (
          <p>No hay información disponible para la agencia.</p>
        )}

        <ToastContainer />
      </section>
    </ProtectedRoute>
  );
}
