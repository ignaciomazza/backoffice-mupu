// src/app/clients/page.tsx
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  Client,
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
  DEFAULT_REQUIRED_FIELDS,
  DOCUMENT_ANY_KEY,
  normalizeHiddenFields,
  normalizeCustomFields,
  normalizeRequiredFields,
} from "@/utils/clientConfig";

/* =========================================================
 * NUEVO: helpers de búsqueda flexible
 * ========================================================= */

/** Saca tildes, baja a minúsculas, colapsa espacios */
function norm(s: string | undefined | null): string {
  return (s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // saca acentos
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Distancia de Levenshtein básica (cuántos cambios necesito para convertir a -> b) */
function levenshtein(aRaw: string, bRaw: string): number {
  const a = aRaw;
  const b = bRaw;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;

  // ⬇⬇⬇ cambio acá: ya no usamos (_, i)
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // borrado
        dp[i][j - 1] + 1, // inserción
        dp[i - 1][j - 1] + cost, // reemplazo
      );
    }
  }
  return dp[m][n];
}

/** score entre una query normalizada y un string candidato */
function matchScore(queryNorm: string, candidateRaw: string): number {
  if (!candidateRaw) return 9999;
  const cand = norm(candidateRaw);
  if (!cand) return 9999;

  // prioridad 0: arranca igual
  if (cand.startsWith(queryNorm)) return 0;

  // prioridad 1: lo contiene en algún lado
  if (cand.includes(queryNorm)) return 1;

  // prioridad 2+: parecido (typo). Mientras más cerca, mejor.
  // sumamos 2 para que sea siempre peor que startsWith/includes
  const dist = levenshtein(queryNorm, cand);
  return 2 + dist;
}

/** Saca el mejor score de un pax comparando varios campos */
function scoreClient(c: Client, queryNorm: string): number {
  const combos = [
    `${c.first_name || ""} ${c.last_name || ""}`,
    `${c.last_name || ""} ${c.first_name || ""}`,
    c.dni_number || "",
    c.passport_number || "",
    c.tax_id || "",
    c.phone || "",
    c.email || "",
    c.company_name || "",
    c.locality || "",
  ];

  let best = Infinity;
  for (const field of combos) {
    const s = matchScore(queryNorm, field);
    if (s < best) best = s;
  }
  return best;
}

/** Ordena la lista de pasajeros de "mejor match" → "peor match" */
function rankClients(list: Client[], query: string): Client[] {
  const qn = norm(query);
  if (!qn) return list; // sin búsqueda → dejamos el orden del server
  return [...list].sort((a, b) => scoreClient(a, qn) - scoreClient(b, qn));
}

function primaryToken(q: string): string {
  return q.trim().split(/\s+/)[0] || "";
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
  const take =
    viewMode === "list" ? 40 : viewMode === "table" ? 60 : 24;
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  // --- Form state ---
  const [formData, setFormData] = useState<
    Omit<Client, "id_client" | "registration_date" | "user"> & {
      id_user: number;
      id_agency: number;
    }
  >({
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
  const [passengerCategories, setPassengerCategories] = useState<
    PassengerCategory[]
  >([]);
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
          required_fields?: unknown;
          hidden_fields?: unknown;
          custom_fields?: unknown;
        } | null;
        const hidden = normalizeHiddenFields(cfg?.hidden_fields);
        const required = normalizeRequiredFields(cfg?.required_fields).filter(
          (field) => !hidden.includes(field),
        );
        const custom = normalizeCustomFields(cfg?.custom_fields);
        if (alive) {
          setRequiredFields(required);
          setCustomFields(custom);
          setHiddenFields(hidden);
        }
      } catch (err) {
        console.warn("⚠️ No se pudo cargar config de pasajeros:", err);
        if (alive) {
          setRequiredFields(DEFAULT_REQUIRED_FIELDS);
          setCustomFields([]);
          setHiddenFields([]);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

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
      if (relatedClientId) qs.append("related_to", String(relatedClientId));

      // 👇 cambio clave:
      // en vez de mandar TODA la búsqueda al backend,
      // le mandamos SOLO la primera palabra (apellido o nombre).
      const tokenQ = primaryToken(debouncedSearch);
      if (tokenQ) {
        qs.append("q", tokenQ);
      }

      qs.append("take", String(take));
      if (opts?.cursor) qs.append("cursor", String(opts.cursor));

      return qs.toString();
    },
    [
      selectedUserId,
      selectedTeamId,
      selectedGender,
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
        if (!res.ok) throw new Error("Error al obtener pasajeros");
        const { items, nextCursor } = await res.json();

        if (myRequestId !== requestIdRef.current) return; // evita race

        // ⬇️ NUEVO: ordenamos los resultados por similitud con la búsqueda
        const ranked = rankClients(items as Client[], debouncedSearch);

        setClients(ranked);
        setNextCursor(nextCursor ?? null);
        setExpandedClientId(null);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.error("❌ Error fetching clients:", err);
        toast.error("Error al obtener pasajeros.");
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
      if (!res.ok) throw new Error("No se pudieron cargar más pasajeros");
      const { items, nextCursor: newCursor } = await res.json();

      // Merge y volver a rankear con la búsqueda actual
      const merged = [...clients, ...(items as Client[])];
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const isFilled = (val: unknown) =>
      String(val ?? "")
        .trim()
        .length > 0;

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

    // backend espera "YYYY-MM-DD" o fecha parseable local; normalizamos
    const birthISO =
      formData.birth_date && formData.birth_date.includes("T")
        ? formData.birth_date.split("T")[0]
        : formData.birth_date;

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

      const body = await res.json();
      if (!res.ok)
        throw new Error(body?.error || "Error al guardar el pax");

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
    } catch (err: unknown) {
      console.error("Error al guardar el pax:", err);
      toast.error(
        (err as Error).message ||
          "Error al guardar el pax. Intente nuevamente.",
      );
    } finally {
      setFormData((prev) => ({
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
    setFormData({
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
      birth_date: client.birth_date
        ? new Date(client.birth_date).toISOString().split("T")[0]
        : "",
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
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("es-AR", {
      timeZone: "UTC",
    });
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
              {clients.length} {clients.length === 1 ? "resultado" : "resultados"}
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
            requiredFields={requiredFields}
            customFields={customFields}
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
          />
        )}

        <ToastContainer />
      </section>
    </ProtectedRoute>
  );
}
