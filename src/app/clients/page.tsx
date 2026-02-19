// src/app/clients/page.tsx
"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  Client,
  ClientProfileConfig,
  User,
  SalesTeam,
  ClientCustomField,
  PassengerCategory,
} from "@/types";
import { motion } from "framer-motion";
import { toast, ToastContainer } from "react-toastify";
import ClientForm from "@/components/clients/ClientForm";
import ClientList from "@/components/clients/ClientList";
import ClientTable from "@/components/clients/ClientTable";
import ClientRelationsPanel from "@/components/clients/ClientRelationsPanel";
import Spinner from "@/components/Spinner";
import { useAuth } from "@/context/AuthContext";
import "react-toastify/dist/ReactToastify.css";
import FilterPanel from "@/components/clients/FilterPanel";
import { authFetch } from "@/utils/authFetch";
import {
  formatDateInBuenosAires,
  toDateKeyInBuenosAires,
} from "@/lib/buenosAiresDate";
import {
  DEFAULT_CLIENT_PROFILE_KEY,
  DEFAULT_REQUIRED_FIELDS,
  DOCUMENT_ANY_KEY,
  normalizeClientProfiles,
  resolveClientProfile,
} from "@/utils/clientConfig";
import { rankClientsBySimilarity } from "@/utils/clientSearch";

function rankClients(list: Client[], query: string): Client[] {
  return rankClientsBySimilarity(list, query);
}

/* =========================================================
 * resto del archivo
 * ========================================================= */

const FILTROS = [
  "lider",
  "gerente",
  "administrativo",
  "desarrollador",
] as const;
type FilterRole = (typeof FILTROS)[number];

// Debounce helper
function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function Page() {
  const { token } = useAuth();

  // --- Perfil, Users & Teams ---
  const [profile, setProfile] = useState<{
    id_user: number;
    role: FilterRole;
    id_agency: number;
  } | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  const [teamsList, setTeamsList] = useState<SalesTeam[]>([]);

  // selecciones de filtros
  const [selectedUserId, setSelectedUserId] = useState<number>(0);
  const [selectedTeamId, setSelectedTeamId] = useState<number>(0);
  const [selectedGender, setSelectedGender] = useState<
    "" | "Masculino" | "Femenino" | "No Binario"
  >("");
  const [hiddenFields, setHiddenFields] = useState<string[]>([]);
  const [relatedClientId, setRelatedClientId] = useState<number | null>(null);

  // buscador
  const [searchTerm, setSearchTerm] = useState<string>("");
  const debouncedSearch = useDebounced(searchTerm, 400);

  // --- Clients state ---
  const [clients, setClients] = useState<Client[]>([]);
  const [expandedClientId, setExpandedClientId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<"grid" | "list" | "table">("grid");

  // Paginación (API ahora retorna { items, nextCursor })
  const take = viewMode === "list" ? 40 : viewMode === "table" ? 60 : 24;
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  // --- Form state ---
  const [formData, setFormData] = useState<
    Omit<Client, "id_client" | "registration_date" | "user"> & {
      id_user: number;
      id_agency: number;
    }
  >({
    profile_key: DEFAULT_CLIENT_PROFILE_KEY,
    first_name: "",
    last_name: "",
    phone: "",
    address: "",
    postal_code: "",
    locality: "",
    company_name: "",
    tax_id: "",
    commercial_address: "",
    dni_number: "",
    passport_number: "",
    birth_date: "",
    nationality: "",
    gender: "",
    category_id: null,
    email: "",
    custom_fields: {},
    id_user: 0,
    id_agency: 0,
  });
  const [requiredFields, setRequiredFields] = useState<string[]>(
    DEFAULT_REQUIRED_FIELDS,
  );
  const [customFields, setCustomFields] = useState<ClientCustomField[]>([]);
  const [clientProfiles, setClientProfiles] = useState<ClientProfileConfig[]>([
    {
      key: DEFAULT_CLIENT_PROFILE_KEY,
      label: "Pax",
      required_fields: DEFAULT_REQUIRED_FIELDS,
      hidden_fields: [],
      custom_fields: [],
    },
  ]);
  const [passengerCategories, setPassengerCategories] = useState<
    PassengerCategory[]
  >([]);
  const [selectedProfileFilter, setSelectedProfileFilter] = useState<string>("all");
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingClientId, setEditingClientId] = useState<number | null>(null);
  const [relationsClient, setRelationsClient] = useState<Client | null>(null);

  // Abort + race conditions control
  const fetchAbortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  // 1) Cargar perfil + equipos + usuarios visibles según rol
  useEffect(() => {
    if (!token) return;

    const abort = new AbortController();
    (async () => {
      try {
        const res = await authFetch(
          "/api/user/profile",
          { cache: "no-store", signal: abort.signal },
          token,
        );
        if (!res.ok) throw new Error("No se pudo obtener el perfil");
        const p = (await res.json()) as {
          id_user: number;
          id_agency: number;
          role: FilterRole;
        };
        setProfile(p);
        setFormData((f) => ({
          ...f,
          id_user: p.id_user,
          id_agency: p.id_agency,
        }));
        const viewAllRoles = ["vendedor", "lider", "gerente"] as const;
        setSelectedUserId(
          (viewAllRoles as readonly string[]).includes(p.role) ? 0 : p.id_user,
        );
        setSelectedTeamId(0);

        // Equipos de la agencia
        const teamsRes = await authFetch(
          `/api/teams?agencyId=${p.id_agency}`,
          { cache: "no-store", signal: abort.signal },
          token,
        );
        if (!teamsRes.ok) throw new Error("No se pudieron cargar los equipos");
        const allTeams = (await teamsRes.json()) as SalesTeam[];
        const allowedTeams =
          p.role === "lider"
            ? allTeams.filter((t) =>
                t.user_teams.some(
                  (ut) =>
                    ut.user.id_user === p.id_user && ut.user.role === "lider",
                ),
              )
            : allTeams;
        setTeamsList(allowedTeams);

        // Usuarios visibles
        if (FILTROS.includes(p.role)) {
          const usersRes = await authFetch(
            "/api/users",
            { cache: "no-store", signal: abort.signal },
            token,
          );
          if (!usersRes.ok)
            throw new Error("No se pudieron cargar los usuarios");
          const users = (await usersRes.json()) as User[];
          setAllUsers(users);
          setTeamMembers(users);
        }

        // Si es líder: solo miembros de sus equipos
        if (p.role === "lider") {
          const myTeams = allowedTeams.filter((t) =>
            t.user_teams.some(
              (ut) => ut.user.id_user === p.id_user && ut.user.role === "lider",
            ),
          );
          const members = Array.from(
            new Map(
              myTeams
                .flatMap((t) => t.user_teams.map((ut) => ut.user))
                .map((u) => [u.id_user, u]),
            ).values(),
          );
          setTeamMembers(members as User[]);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.error("❌ Error inicializando perfil/equipos/usuarios:", err);
        toast.error("No se pudo inicializar la vista de pasajeros.");
      }
    })();

    return () => abort.abort();
  }, [token]);

  // 1b) Cargar categorías de pasajeros (select de categoría)
  useEffect(() => {
    if (!token) {
      setPassengerCategories([]);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const res = await authFetch(
          "/api/passenger-categories",
          { cache: "no-store" },
          token,
        );
        if (!res.ok) throw new Error("No se pudieron cargar categorías.");
        const data = (await res.json().catch(() => [])) as PassengerCategory[];
        if (alive) setPassengerCategories(Array.isArray(data) ? data : []);
      } catch {
        if (alive) setPassengerCategories([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  // 1.1) Configuración de campos requeridos y custom (por agencia)
  useEffect(() => {
    if (!token) return;
    let alive = true;
    (async () => {
      try {
        const res = await authFetch(
          "/api/clients/config",
          { cache: "no-store" },
          token,
        );
        if (!res.ok) throw new Error("No se pudo cargar la configuración");
        const cfg = (await res.json().catch(() => null)) as {
          profiles?: unknown;
          required_fields?: unknown;
          hidden_fields?: unknown;
          custom_fields?: unknown;
        } | null;
        const profiles = normalizeClientProfiles(cfg?.profiles, {
          required_fields: cfg?.required_fields,
          hidden_fields: cfg?.hidden_fields,
          custom_fields: cfg?.custom_fields,
        });
        if (alive) {
          setClientProfiles(profiles);
        }
      } catch (err) {
        console.warn("⚠️ No se pudo cargar config de pasajeros:", err);
        if (alive) {
          setClientProfiles([
            {
              key: DEFAULT_CLIENT_PROFILE_KEY,
              label: "Pax",
              required_fields: DEFAULT_REQUIRED_FIELDS,
              hidden_fields: [],
              custom_fields: [],
            },
          ]);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    const profile = resolveClientProfile(clientProfiles, formData.profile_key);
    setRequiredFields(profile.required_fields);
    setCustomFields(profile.custom_fields);
    setHiddenFields(profile.hidden_fields);
    if (profile.key !== formData.profile_key) {
      setFormData((prev) => ({ ...prev, profile_key: profile.key }));
    }
  }, [clientProfiles, formData.profile_key]);

  // 2) Al cambiar de equipo (solo roles no-líder), recalcular miembros visibles
  useEffect(() => {
    if (!profile || profile.role === "lider") return;
    setSelectedUserId(0);
    if (selectedTeamId > 0) {
      const team = teamsList.find((t) => t.id_team === selectedTeamId);
      setTeamMembers(team ? team.user_teams.map((ut) => ut.user) : []);
    } else if (selectedTeamId === -1) {
      const assigned = teamsList.flatMap((t) =>
        t.user_teams.map((ut) => ut.user.id_user),
      );
      setTeamMembers(allUsers.filter((u) => !assigned.includes(u.id_user)));
    } else {
      setTeamMembers(allUsers);
    }
  }, [selectedTeamId, teamsList, profile, allUsers]);

  // 3) Fetch de pasajeros (usa la nueva API: { items, nextCursor } y filtros server-side)
  const buildClientsQuery = useCallback(
    (opts?: { cursor?: number | null }) => {
      const qs = new URLSearchParams();

      if (selectedUserId > 0) qs.append("userId", String(selectedUserId));
      if (selectedTeamId !== 0) qs.append("teamId", String(selectedTeamId));
      if (selectedGender) qs.append("gender", selectedGender);
      if (selectedProfileFilter && selectedProfileFilter !== "all") {
        qs.append("profile_key", selectedProfileFilter);
      }
      if (relatedClientId) qs.append("related_to", String(relatedClientId));

      const queryText = debouncedSearch.trim();
      if (queryText) {
        qs.append("q", queryText);
      }

      qs.append("take", String(take));
      if (opts?.cursor) qs.append("cursor", String(opts.cursor));

      return qs.toString();
    },
    [
      selectedUserId,
      selectedTeamId,
      selectedGender,
      selectedProfileFilter,
      relatedClientId,
      debouncedSearch,
      take,
    ],
  );

  useEffect(() => {
    if (!profile || !token) return;

    setIsLoading(true);

    // cancelar petición anterior si existe
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    const myRequestId = ++requestIdRef.current;

    (async () => {
      try {
        const qs = buildClientsQuery();
        const res = await authFetch(
          `/api/clients?${qs}`,
          { cache: "no-store", signal: controller.signal },
          token,
        );
        const payload = (await res.json().catch(() => null)) as
          | { items?: Client[]; nextCursor?: number | null; error?: string }
          | null;
        if (!res.ok) {
          throw new Error(payload?.error || "Error al obtener pasajeros");
        }
        const { items, nextCursor } = payload || {};
        const parsedItems = Array.isArray(items) ? items : [];

        if (myRequestId !== requestIdRef.current) return; // evita race

        // ⬇️ NUEVO: ordenamos los resultados por similitud con la búsqueda
        const ranked = rankClients(parsedItems, debouncedSearch);

        setClients(ranked);
        setNextCursor(nextCursor ?? null);
        setExpandedClientId(null);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.error("❌ Error fetching clients:", err);
        toast.error(
          err instanceof Error ? err.message : "Error al obtener pasajeros.",
        );
        setClients([]);
        setNextCursor(null);
      } finally {
        if (
          myRequestId === requestIdRef.current &&
          !controller.signal.aborted
        ) {
          setIsLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, [
    profile,
    selectedUserId,
    selectedTeamId,
    selectedGender,
    debouncedSearch,
    token,
    buildClientsQuery,
  ]);

  // (Opcional) cargar más
  const loadMore = async () => {
    if (!nextCursor || !token || loadingMore) return;
    setLoadingMore(true);
    try {
      const qs = buildClientsQuery({ cursor: nextCursor });
      const res = await authFetch(
        `/api/clients?${qs}`,
        { cache: "no-store" },
        token,
      );
      const payload = (await res.json().catch(() => null)) as
        | { items?: Client[]; nextCursor?: number | null; error?: string }
        | null;
      if (!res.ok) {
        throw new Error(payload?.error || "No se pudieron cargar más pasajeros");
      }
      const { items, nextCursor: newCursor } = payload || {};
      const parsedItems = Array.isArray(items) ? items : [];

      // Merge y volver a rankear con la búsqueda actual
      const merged = [...clients, ...parsedItems];
      const ranked = rankClients(merged, debouncedSearch);

      setClients(ranked);
      setNextCursor(newCursor ?? null);
    } catch (e) {
      console.error("loadMore clients:", e);
      toast.error("No se pudieron cargar más pasajeros.");
    } finally {
      setLoadingMore(false);
    }
  };

  // Handlers de formulario
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    if (name === "profile_key") {
      const profile = resolveClientProfile(clientProfiles, value);
      const allowed = new Set(profile.custom_fields.map((field) => field.key));
      setFormData((prev) => {
        const nextCustom = Object.fromEntries(
          Object.entries(prev.custom_fields || {}).filter(([key]) =>
            allowed.has(key),
          ),
        );
        return {
          ...prev,
          profile_key: profile.key,
          custom_fields: nextCustom,
        };
      });
      return;
    }
    if (name === "category_id") {
      setFormData((prev) => ({
        ...prev,
        category_id: value ? Number(value) : null,
      }));
      return;
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCustomFieldChange = (key: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      custom_fields: {
        ...(prev.custom_fields || {}),
        [key]: value,
      },
    }));
  };

  const openClientInEditor = useCallback((client: Client) => {
    setFormData({
      profile_key: client.profile_key || DEFAULT_CLIENT_PROFILE_KEY,
      first_name: client.first_name,
      last_name: client.last_name,
      phone: client.phone || "",
      address: client.address || "",
      postal_code: client.postal_code || "",
      locality: client.locality || "",
      company_name: client.company_name || "",
      tax_id: client.tax_id || "",
      commercial_address: client.commercial_address || "",
      dni_number: client.dni_number || "",
      passport_number: client.passport_number || "",
      birth_date: toDateKeyInBuenosAires(client.birth_date) ?? "",
      nationality: client.nationality || "",
      gender: client.gender || "",
      category_id: client.category_id ?? null,
      email: client.email || "",
      custom_fields: client.custom_fields || {},
      id_user: client.user.id_user,
      id_agency: client.user.id_agency,
    });
    setEditingClientId(client.id_client);
    setIsFormVisible(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const openDuplicateClient = useCallback(
    async (duplicateId: number) => {
      if (!token) return;
      try {
        const res = await authFetch(
          `/api/clients/${duplicateId}`,
          { cache: "no-store" },
          token,
        );
        const body = await res.json().catch(() => null);
        if (!res.ok || !body) {
          throw new Error("No se pudo abrir el pax duplicado");
        }
        openClientInEditor(body as Client);
      } catch (err) {
        console.error("Error al abrir pax duplicado:", err);
        toast.error("No se pudo abrir el pax duplicado.");
      }
    },
    [token, openClientInEditor],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const isFilled = (val: unknown) => String(val ?? "").trim().length > 0;

    const missingBase = requiredFields.filter((field) => {
      if (field === DOCUMENT_ANY_KEY) return false;
      const value = (formData as Record<string, unknown>)[field];
      return !isFilled(value);
    });

    const requiredCustomKeys = customFields
      .filter((field) => field.required)
      .map((field) => field.key);

    const missingCustom = requiredCustomKeys.filter(
      (key) => !isFilled(formData.custom_fields?.[key]),
    );

    if (missingBase.length || missingCustom.length) {
      toast.error("Completá los campos obligatorios antes de guardar.");
      return;
    }

    // 🔁 ACTUALIZADO: misma regla que definimos en el form nuevo
    // Necesita al menos uno: Documento/CI-DNI, Pasaporte o CUIT/RUT
    const docRequired = requiredFields.includes(DOCUMENT_ANY_KEY);
    const hasDocOrTax =
      formData.dni_number?.trim() ||
      formData.passport_number?.trim() ||
      formData.tax_id?.trim();

    if (docRequired && !hasDocOrTax) {
      toast.error(
        "Cargá al menos Documento/CI-DNI, Pasaporte o CUIT / RUT para guardar.",
      );
      return;
    }

    // backend espera "YYYY-MM-DD"; normalizamos en zona Buenos Aires
    const birthISO = formData.birth_date
      ? (toDateKeyInBuenosAires(formData.birth_date) ?? "")
      : "";

    let shouldResetForm = false;
    try {
      const url = editingClientId
        ? `/api/clients/${editingClientId}`
        : "/api/clients";
      const method = editingClientId ? "PUT" : "POST";
      const cleanedCustom = Object.fromEntries(
        Object.entries(formData.custom_fields || {}).filter(
          ([, value]) => String(value ?? "").trim().length > 0,
        ),
      );
      const payload = {
        ...formData,
        birth_date: birthISO,
        custom_fields: cleanedCustom,
      };

      const res = await authFetch(
        url,
        { method, body: JSON.stringify(payload) },
        token,
      );

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const duplicateIdRaw = (body as { duplicate?: { id_client?: unknown } })
          ?.duplicate?.id_client;
        const duplicateClientId = Number(duplicateIdRaw);
        const apiError =
          (body as { error?: string })?.error || "Error al guardar el pax";

        if (Number.isFinite(duplicateClientId) && duplicateClientId > 0) {
          const duplicateId = Number(duplicateClientId);
          toast.error(
            ({ closeToast }: { closeToast?: () => void }) => (
              <div className="space-y-3">
                <p className="text-sm leading-relaxed text-sky-950">
                  {apiError}
                </p>
                <button
                  type="button"
                  className="inline-flex w-fit items-center justify-center rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-950 shadow-sm transition-colors hover:bg-sky-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
                  onClick={() => {
                    closeToast?.();
                    void openDuplicateClient(duplicateId);
                  }}
                >
                  Abrir pax duplicado
                </button>
              </div>
            ),
            { autoClose: false, closeOnClick: false },
          );
          return;
        }

        toast.error(apiError);
        return;
      }

      // Refrescar primera página con filtros actuales
      const qs = buildClientsQuery();
      const listRes = await authFetch(
        `/api/clients?${qs}`,
        { cache: "no-store" },
        token,
      );
      if (!listRes.ok) throw new Error("No se pudo refrescar la lista.");
      const { items, nextCursor } = await listRes.json();

      // Re-rankear también acá
      const ranked = rankClients(items as Client[], debouncedSearch);

      setClients(ranked);
      setNextCursor(nextCursor ?? null);
      setExpandedClientId(null);

      toast.success("Pax guardado con éxito!");
      shouldResetForm = true;
    } catch (err: unknown) {
      console.error("Error al guardar el pax:", err);
      toast.error(
        (err as Error).message ||
          "Error al guardar el pax. Intente nuevamente.",
      );
    } finally {
      if (!shouldResetForm) return;
      setFormData((prev) => ({
        profile_key: prev.profile_key || DEFAULT_CLIENT_PROFILE_KEY,
        first_name: "",
        last_name: "",
        phone: "",
        address: "",
        postal_code: "",
        locality: "",
        company_name: "",
        tax_id: "",
        commercial_address: "",
        dni_number: "",
        passport_number: "",
        birth_date: "",
        nationality: "",
        gender: "",
        category_id: null,
        email: "",
        custom_fields: {},
        id_user: prev.id_user,
        id_agency: prev.id_agency,
      }));
      setIsFormVisible(false);
      setEditingClientId(null);
    }
  };

  const deleteClient = async (id: number) => {
    try {
      const res = await authFetch(
        `/api/clients/${id}`,
        { method: "DELETE" },
        token,
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          body?.error ||
            (res.status === 409
              ? "El pax tiene movimientos."
              : "Error al eliminar el pax"),
        );
      }

      // sacamos el pax de la lista y re-rankeamos por si había búsqueda activa
      const remaining = clients.filter((c) => c.id_client !== id);
      const ranked = rankClients(remaining, debouncedSearch);
      setClients(ranked);

      toast.success("Pax eliminado con éxito!");
    } catch (err: unknown) {
      console.error("Error al eliminar el pax:", err);
      toast.error(
        (err as Error).message ||
          "Error al eliminar el pax. Intente nuevamente.",
      );
    }
  };

  const startEditingClient = (client: Client) => {
    openClientInEditor(client);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "-";
    return formatDateInBuenosAires(dateString);
  };

  const pillBase = "rounded-full px-2.5 py-0.5 text-xs font-medium";
  const pillOk = "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  const pillWarn = "bg-rose-500/15 text-rose-700 dark:text-rose-300";

  const applyClientUpdates = useCallback(
    (updates: Client[]) => {
      if (!updates.length) return;
      setClients((prev) => {
        const map = new Map(updates.map((u) => [u.id_client, u]));
        const next = prev.map((c) => map.get(c.id_client) || c);
        return rankClients(next, debouncedSearch);
      });
    },
    [debouncedSearch],
  );

  const profileOptions = useMemo(
    () => clientProfiles.map((profile) => ({ key: profile.key, label: profile.label })),
    [clientProfiles],
  );
  const allCustomFields = useMemo(() => {
    const map = new Map<string, ClientCustomField>();
    for (const profile of clientProfiles) {
      for (const field of profile.custom_fields || []) {
        if (!map.has(field.key)) {
          map.set(field.key, field);
        }
      }
    }
    return Array.from(map.values());
  }, [clientProfiles]);
  const profileLabels = useMemo(
    () => Object.fromEntries(profileOptions.map((opt) => [opt.key, opt.label])),
    [profileOptions],
  );

  return (
    <ProtectedRoute>
      <section className="text-sky-950 dark:text-white">
        <motion.div layout>
          <ClientForm
            formData={formData}
            handleChange={handleChange}
            handleCustomFieldChange={handleCustomFieldChange}
            handleSubmit={handleSubmit}
            editingClientId={editingClientId}
            isFormVisible={isFormVisible}
            setIsFormVisible={setIsFormVisible}
            requiredFields={requiredFields}
            customFields={customFields}
            hiddenFields={hiddenFields}
            profileOptions={profileOptions}
            passengerCategories={passengerCategories}
          />
        </motion.div>

        {relationsClient && (
          <div className="mt-4">
            <ClientRelationsPanel
              client={relationsClient}
              token={token}
              passengerCategories={passengerCategories}
              onClose={() => setRelationsClient(null)}
            />
          </div>
        )}

        <div className="my-4 flex flex-wrap items-center justify-between gap-4">
          <h2 className="flex items-center gap-2 text-2xl font-semibold dark:font-medium">
            Pasajeros
            <span
              className={`${pillBase} ${
                clients.length > 0 ? pillOk : pillWarn
              }`}
              title="Resultados actuales"
            >
              {clients.length}{" "}
              {clients.length === 1 ? "resultado" : "resultados"}
            </span>
          </h2>

          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 text-xs dark:border-white/5 dark:bg-white/5">
            <button
              onClick={() => setViewMode("grid")}
              className={`flex items-center justify-center gap-1 rounded-full px-4 py-1.5 text-sm transition-colors ${
                viewMode === "grid"
                  ? "bg-emerald-500/15 text-emerald-700 shadow-sm shadow-emerald-900/20 dark:text-emerald-300"
                  : "text-emerald-900/70 hover:text-emerald-900 dark:text-emerald-100"
              }`}
              aria-pressed={viewMode === "grid"}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="size-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z"
                />
              </svg>
              Grilla
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center justify-center gap-1 rounded-full px-4 py-1.5 text-sm transition-colors ${
                viewMode === "list"
                  ? "bg-emerald-500/15 text-emerald-700 shadow-sm shadow-emerald-900/20 dark:text-emerald-300"
                  : "text-emerald-900/70 hover:text-emerald-900 dark:text-emerald-100"
              }`}
              aria-pressed={viewMode === "list"}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="size-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
                />
              </svg>
              Lista
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`flex items-center justify-center gap-1 rounded-full px-4 py-1.5 text-sm transition-colors ${
                viewMode === "table"
                  ? "bg-emerald-500/15 text-emerald-700 shadow-sm shadow-emerald-900/20 dark:text-emerald-300"
                  : "text-emerald-900/70 hover:text-emerald-900 dark:text-emerald-100"
              }`}
              aria-pressed={viewMode === "table"}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="size-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 5.25h16.5M3.75 9.75h16.5M3.75 14.25h16.5M3.75 18.75h16.5"
                />
              </svg>
              Tabla
            </button>
          </div>
        </div>

        <FilterPanel
          token={token}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          role={profile?.role}
          selectedUserId={selectedUserId}
          setSelectedUserId={setSelectedUserId}
          selectedTeamId={selectedTeamId}
          setSelectedTeamId={setSelectedTeamId}
          selectedGender={selectedGender}
          setSelectedGender={setSelectedGender}
          profileOptions={profileOptions}
          selectedProfileKey={selectedProfileFilter}
          setSelectedProfileKey={setSelectedProfileFilter}
          relatedClientId={relatedClientId}
          setRelatedClientId={setRelatedClientId}
          displayedTeamMembers={teamMembers}
          teams={teamsList}
        />

        {viewMode === "table" ? (
          <ClientTable
            clients={clients}
            token={token}
            isLoading={isLoading}
            hasMore={Boolean(nextCursor)}
            onLoadMore={loadMore}
            loadingMore={loadingMore}
            onClientsUpdated={applyClientUpdates}
            profiles={clientProfiles}
            customFields={allCustomFields}
          />
        ) : isLoading ? (
          <div className="flex min-h-[50vh] items-center">
            <Spinner />
          </div>
        ) : (
          <ClientList
            clients={clients}
            expandedClientId={expandedClientId}
            setExpandedClientId={setExpandedClientId}
            formatDate={formatDate}
            startEditingClient={startEditingClient}
            deleteClient={deleteClient}
            hasMore={Boolean(nextCursor)}
            onLoadMore={loadMore}
            loadingMore={loadingMore}
            viewMode={viewMode === "list" ? "list" : "grid"}
            onOpenRelations={(c) => setRelationsClient(c)}
            passengerCategories={passengerCategories}
            profileLabels={profileLabels}
          />
        )}

        <ToastContainer />
      </section>
    </ProtectedRoute>
  );
}
