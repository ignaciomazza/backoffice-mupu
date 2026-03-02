"use client";

import React, { useEffect, useMemo, useState } from "react";
import Spinner from "@/components/Spinner";
import { toast } from "react-toastify";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import {
  canManageResourceSection,
  normalizeResourceSectionRules,
  normalizeRole,
  resolveCalendarVisibility,
  type CalendarVisibilityMode,
  type ResourceSectionAccessRule,
} from "@/utils/permissions";

type User = {
  id_user: number;
  first_name: string | null;
  last_name: string | null;
  email?: string | null;
  role?: string | null;
};

const NOTES_KEY = "resources_notes";
const CALENDAR_KEY = "calendar";

const GLASS =
  "rounded-3xl border border-white/30 bg-white/10 backdrop-blur shadow-lg shadow-sky-900/10 dark:bg-white/10 dark:border-white/5";
const ICON_BTN =
  "rounded-full bg-sky-100 px-4 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-[.98] active:scale-95 disabled:opacity-50 dark:bg-white/10 dark:text-white";

const MANAGER_ROLES = new Set(["gerente", "desarrollador", "administrativo"]);

function userLabel(u: User) {
  const name = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
  if (name) return name;
  if (u.email) return u.email;
  return `Usuario ${u.id_user}`;
}

function MiniToggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors ${
        checked
          ? "border-sky-500 bg-sky-500"
          : "border-sky-200 bg-sky-100 dark:border-white/25 dark:bg-white/10"
      } ${disabled ? "cursor-not-allowed opacity-70" : ""}`}
    >
      <span
        className={`inline-block size-4 rounded-full border border-slate-200 bg-white shadow-sm transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function includeKey(list: string[], key: string): string[] {
  return list.includes(key) ? list : [...list, key].sort();
}

function excludeKey(list: string[], key: string): string[] {
  return list.filter((item) => item !== key).sort();
}

function buildDefaultRule(userId: number, role?: string | null): ResourceSectionAccessRule {
  const sections: string[] = [];

  if (canManageResourceSection(role, [], NOTES_KEY, false)) {
    sections.push(NOTES_KEY);
  }
  if (canManageResourceSection(role, [], CALENDAR_KEY, false)) {
    sections.push(CALENDAR_KEY);
  }

  return {
    id_user: userId,
    sections: sections.sort() as ResourceSectionAccessRule["sections"],
    calendar_visibility: resolveCalendarVisibility(role, null, false),
  };
}

export default function ResourceSectionAccessConfig() {
  const { token, role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [rules, setRules] = useState<ResourceSectionAccessRule[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number>(0);

  const canEdit = useMemo(
    () => MANAGER_ROLES.has(normalizeRole(role)),
    [role],
  );

  const selectedUser = useMemo(
    () => users.find((u) => u.id_user === selectedUserId) ?? null,
    [selectedUserId, users],
  );

  const hasCustomRule = useMemo(
    () => rules.some((rule) => rule.id_user === selectedUserId),
    [rules, selectedUserId],
  );

  const selectedRule = useMemo(() => {
    if (!selectedUserId) return null;
    return (
      rules.find((rule) => rule.id_user === selectedUserId) ??
      buildDefaultRule(selectedUserId, selectedUser?.role)
    );
  }, [rules, selectedUser?.role, selectedUserId]);

  const setCustomRule = (nextRule: ResourceSectionAccessRule) => {
    setRules((prev) => {
      const next = [
        ...prev.filter((item) => item.id_user !== nextRule.id_user),
        nextRule,
      ];
      return next.sort((a, b) => a.id_user - b.id_user);
    });
  };

  useEffect(() => {
    if (!token) return;
    if (!canEdit) {
      setLoading(false);
      return;
    }
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        const [usersRes, rulesRes] = await Promise.all([
          authFetch("/api/users", { cache: "no-store" }, token),
          authFetch(
            "/api/resources/config?scope=all",
            { cache: "no-store" },
            token,
          ),
        ]);

        if (usersRes.ok) {
          const list = (await usersRes.json()) as User[];
          if (alive) setUsers(Array.isArray(list) ? list : []);
        } else if (alive) {
          setUsers([]);
        }

        if (rulesRes.ok) {
          const payload = (await rulesRes.json()) as { rules?: unknown };
          const parsed = normalizeResourceSectionRules(payload?.rules);
          if (alive) setRules(parsed);
        } else if (alive) {
          setRules([]);
        }
      } catch {
        toast.error("No se pudo cargar permisos de recursos.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [token, canEdit]);

  useEffect(() => {
    if (!users.length) return;
    setSelectedUserId((prev) =>
      prev && users.some((u) => u.id_user === prev) ? prev : users[0].id_user,
    );
  }, [users]);

  const saveRules = async () => {
    if (!token || !canEdit) return;
    setSaving(true);
    try {
      const res = await authFetch(
        "/api/resources/config",
        { method: "PUT", body: JSON.stringify({ rules }) },
        token,
      );
      const body = (await res.json().catch(() => null)) as
        | { rules?: unknown; error?: string }
        | null;
      if (!res.ok) {
        throw new Error(body?.error || "No se pudo guardar");
      }
      const nextRules = normalizeResourceSectionRules(body?.rules);
      setRules(nextRules);
      toast.success("Permisos guardados");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const toggleResourceNotes = () => {
    if (!selectedRule) return;
    const checked = selectedRule.sections.includes(NOTES_KEY);
    const sections = checked
      ? excludeKey(selectedRule.sections, NOTES_KEY)
      : includeKey(selectedRule.sections, NOTES_KEY);
    setCustomRule({ ...selectedRule, sections: sections as typeof selectedRule.sections });
  };

  const toggleCalendarNotes = () => {
    if (!selectedRule) return;
    const checked = selectedRule.sections.includes(CALENDAR_KEY);
    const sections = checked
      ? excludeKey(selectedRule.sections, CALENDAR_KEY)
      : includeKey(selectedRule.sections, CALENDAR_KEY);
    setCustomRule({ ...selectedRule, sections: sections as typeof selectedRule.sections });
  };

  const changeVisibility = (value: CalendarVisibilityMode) => {
    if (!selectedRule) return;
    setCustomRule({ ...selectedRule, calendar_visibility: value });
  };

  const clearCustomRule = () => {
    if (!selectedUserId) return;
    setRules((prev) => prev.filter((item) => item.id_user !== selectedUserId));
  };

  if (loading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className={`${GLASS} p-4 text-sm`}>
        Solo gerencia y administración pueden configurar estos permisos.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Permisos de datos y edición</h2>
          <p className="text-sm opacity-70">
            Todos ven Recursos y Calendario. Aquí definís edición de notas y
            visibilidad del calendario (todo o propio).
          </p>
        </div>
        <button
          type="button"
          onClick={saveRules}
          disabled={saving}
          className={ICON_BTN}
        >
          {saving ? "Guardando..." : "Guardar"}
        </button>
      </div>

      <div className={`${GLASS} p-4`}>
        <label className="mb-2 block text-xs opacity-70">Usuario</label>
        <select
          value={selectedUserId || 0}
          onChange={(e) => setSelectedUserId(Number(e.target.value))}
          className="w-full cursor-pointer rounded-2xl border border-sky-300/40 bg-white/60 px-3 py-2 text-sm text-slate-900 outline-none transition hover:border-sky-400/65 hover:bg-white/75 focus:border-sky-500/65 focus:ring-2 focus:ring-sky-400/30 disabled:cursor-not-allowed dark:border-sky-200/30 dark:bg-sky-950/20 dark:text-sky-50 dark:hover:border-sky-200/45 dark:hover:bg-sky-950/30"
          disabled={!users.length}
        >
          {users.length === 0 ? (
            <option value={0}>No hay usuarios disponibles</option>
          ) : (
            users.map((u) => (
              <option key={u.id_user} value={u.id_user}>
                {userLabel(u)} · {normalizeRole(u.role)}
              </option>
            ))
          )}
        </select>
      </div>

      {selectedRule ? (
        <div className={`${GLASS} space-y-4 p-4`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Regla del usuario</h3>
              <p className="text-xs opacity-70">
                {hasCustomRule
                  ? "Esta regla personalizada reemplaza sus defaults por rol."
                  : "Sin regla personalizada: se aplican defaults por rol."}
              </p>
            </div>
            <button
              type="button"
              onClick={clearCustomRule}
              className={ICON_BTN}
              disabled={saving || !hasCustomRule}
            >
              Volver a defaults
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm">
              <div>
                <p className="font-medium">Editar notas en Recursos</p>
                <p className="text-xs opacity-70">
                  Permite crear, editar y eliminar notas de Recursos.
                </p>
              </div>
              <MiniToggle
                checked={selectedRule.sections.includes(NOTES_KEY)}
                onChange={toggleResourceNotes}
                disabled={saving}
              />
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm">
              <div>
                <p className="font-medium">Editar notas en Calendario</p>
                <p className="text-xs opacity-70">
                  Permite crear, editar y eliminar notas del Calendario.
                </p>
              </div>
              <MiniToggle
                checked={selectedRule.sections.includes(CALENDAR_KEY)}
                onChange={toggleCalendarNotes}
                disabled={saving}
              />
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm">
              <div>
                <p className="font-medium">Visibilidad de calendario</p>
                <p className="text-xs opacity-70">
                  {selectedRule.calendar_visibility === "all"
                    ? "Ver todo el calendario de la agencia."
                    : "Ver solo lo propio."}
                </p>
              </div>
              <div className="inline-flex items-center gap-1 rounded-full border border-sky-300/35 bg-white/70 p-1 dark:border-sky-200/25 dark:bg-sky-950/30">
                <button
                  type="button"
                  onClick={() => changeVisibility("all")}
                  disabled={saving}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    selectedRule.calendar_visibility === "all"
                      ? "bg-sky-500/20 text-sky-900 ring-1 ring-sky-400/50 dark:bg-sky-400/20 dark:text-sky-100 dark:ring-sky-300/40"
                      : "text-sky-900/75 hover:bg-sky-100/60 dark:text-sky-100/75 dark:hover:bg-sky-900/40"
                  } ${saving ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
                >
                  Ver todo
                </button>
                <button
                  type="button"
                  onClick={() => changeVisibility("own")}
                  disabled={saving}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    selectedRule.calendar_visibility === "own"
                      ? "bg-sky-500/20 text-sky-900 ring-1 ring-sky-400/50 dark:bg-sky-400/20 dark:text-sky-100 dark:ring-sky-300/40"
                      : "text-sky-900/75 hover:bg-sky-100/60 dark:text-sky-100/75 dark:hover:bg-sky-900/40"
                  } ${saving ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
                >
                  Solo propio
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className={`${GLASS} p-4 text-sm`}>
          Selecciona un usuario para configurar permisos.
        </div>
      )}
    </div>
  );
}
