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
import AgencyArcaCard from "@/components/agency/AgencyArcaCard";

type AgencyDTO = AgencyDTOForm;

type AgencyApiError = {
  error?: string;
  field?: string;
  hint?: string;
};

const AGENCY_FIELD_LABELS: Record<string, string> = {
  name: "Nombre",
  legal_name: "Razón social",
  tax_id: "CUIT",
  email: "Email",
  website: "Sitio web",
  foundation_date: "Fecha de fundación",
  address: "Dirección",
  phone: "Teléfono",
};

function fieldLabel(field?: string) {
  if (!field) return undefined;
  return AGENCY_FIELD_LABELS[field] ?? field;
}

async function parseAgencyApiError(res: Response): Promise<AgencyApiError> {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const data = (await res.json().catch(() => null)) as AgencyApiError | null;
    if (data && typeof data === "object") return data;
  }

  const rawText = await res.text().catch(() => "");
  return rawText ? { error: rawText } : {};
}

function buildLoadErrorMessage(status: number, apiError: AgencyApiError): string {
  if (status === 401) {
    return "No se pudo cargar la agencia porque la sesión venció. Iniciá sesión nuevamente.";
  }
  if (status === 404) {
    return "No se encontró una agencia asociada a tu usuario. Verificá la asignación de agencia.";
  }

  const detail = apiError.error?.trim();
  if (detail) {
    return `No se pudo cargar la agencia: ${detail}. Probá recargar la página.`;
  }
  return "No se pudo cargar la información de la agencia. Probá recargar la página.";
}

function buildSaveErrorMessage(status: number, apiError: AgencyApiError): string {
  if (status === 400) {
    const detail = apiError.error?.trim() || "Hay datos inválidos.";
    const label = fieldLabel(apiError.field);
    const hint =
      apiError.hint?.trim() || "Corregí el campo indicado y volvé a guardar.";

    if (label) return `Error en ${label}: ${detail}. ${hint}`;
    return `No se pudieron guardar los cambios: ${detail}. ${hint}`;
  }

  if (status === 401) {
    return "No se pudieron guardar los cambios porque la sesión venció. Iniciá sesión nuevamente.";
  }
  if (status === 403) {
    return "No tenés permisos para editar la agencia. Solicitá acceso a un gerente o desarrollador.";
  }
  if (status === 404) {
    return "No se encontró la agencia a actualizar. Verificá la configuración de la cuenta.";
  }

  const detail = apiError.error?.trim();
  if (detail) {
    return `No se pudieron guardar los cambios: ${detail}. Volvé a intentar.`;
  }
  return "No se pudieron guardar los cambios por un error inesperado. Volvé a intentar.";
}

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
    const { signal } = controller;

    // ✅ sin "any": chequea AbortError tanto en DOMException como en errores comunes
    type NamedError = { name?: unknown };
    const isAbortError = (e: unknown): boolean => {
      if (e instanceof DOMException) return e.name === "AbortError";
      if (typeof e === "object" && e !== null && "name" in e) {
        const n = (e as NamedError).name;
        return typeof n === "string" && n === "AbortError";
      }
      return false;
    };

    setLoading(true);

    (async () => {
      try {
        // Pedí rol y agencia en paralelo
        const [rr, ar] = await Promise.all([
          authFetch("/api/user/role", { signal, cache: "no-store" }, token),
          authFetch("/api/agency", { signal, cache: "no-store" }, token),
        ]);

        if (rr.ok) {
          const { role: r } = await rr.json();
          setRole((r || "").toLowerCase());
        } else {
          setRole(null);
        }

        if (!ar.ok) {
          const apiError = await parseAgencyApiError(ar);
          throw new Error(buildLoadErrorMessage(ar.status, apiError));
        }
        const data: AgencyDTO = await ar.json();
        setAgency(data);
      } catch (e) {
        if (isAbortError(e)) {
          // esperado en dev por Strict Mode / navegación; no mostrar toast
          console.debug("[agency/page] fetch abortado");
          return;
        }
        console.error("[agency/page] load error:", e);
        const msg =
          e instanceof Error
            ? e.message
            : "No se pudo cargar la información de la agencia. Probá recargar la página.";
        toast.error(msg);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [token]);

  async function handleSave(input: AgencyUpdateInput) {
    if (!token) {
      toast.error(
        "No se pudieron guardar los cambios porque no hay sesión activa. Iniciá sesión nuevamente.",
      );
      return;
    }
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
        const apiError = await parseAgencyApiError(res);
        throw new Error(buildSaveErrorMessage(res.status, apiError));
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
        <AgencyHeader agency={agency} />

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
              <AgencyArcaCard />
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
