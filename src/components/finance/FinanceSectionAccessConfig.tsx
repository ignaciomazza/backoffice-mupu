// src/components/finance/FinanceSectionAccessConfig.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Spinner from "@/components/Spinner";
import { toast } from "react-toastify";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import {
  FINANCE_SECTIONS,
  normalizeFinanceSectionRules,
  normalizeRole,
  type FinanceSectionAccessRule,
  type FinanceSectionKey,
} from "@/utils/permissions";

type User = {
  id_user: number;
  first_name: string | null;
  last_name: string | null;
  email?: string | null;
  role?: string | null;
};

const GLASS =
  "rounded-3xl border border-white/30 bg-white/10 backdrop-blur shadow-lg shadow-sky-900/10 dark:bg-white/10 dark:border-white/5";
const ICON_BTN =
  "rounded-full bg-sky-100 px-4 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-[.98] active:scale-95 disabled:opacity-50 dark:bg-white/10 dark:text-white";

const MANAGER_ROLES = new Set(["gerente", "desarrollador"]);

function userLabel(u: User) {
  const name = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
  if (name) return name;
  if (u.email) return u.email;
  return `Usuario ${u.id_user}`;
}

function toggleKey<T extends string>(list: T[], key: T): T[] {
  const next = list.includes(key)
    ? list.filter((item) => item !== key)
    : [...list, key];
  return Array.from(new Set(next)).sort();
}

export default function FinanceSectionAccessConfig() {
  const { token, role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [rules, setRules] = useState<FinanceSectionAccessRule[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number>(0);

  const canEdit = useMemo(
    () => MANAGER_ROLES.has(normalizeRole(role)),
    [role],
  );

  const selectedRule = useMemo(() => {
    if (!selectedUserId) return null;
    return (
      rules.find((rule) => rule.id_user === selectedUserId) ?? {
        id_user: selectedUserId,
        sections: [],
      }
    );
  }, [rules, selectedUserId]);

  const updateRule = (userId: number, sections: FinanceSectionKey[]) => {
    if (!userId) return;
    setRules((prev) => {
      const idx = prev.findIndex((rule) => rule.id_user === userId);
      const updated: FinanceSectionAccessRule = {
        id_user: userId,
        sections,
      };
      const nextList =
        idx >= 0
          ? prev.map((rule) => (rule.id_user === userId ? updated : rule))
          : [...prev, updated];
      return nextList.sort((a, b) => a.id_user - b.id_user);
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
            "/api/finance/section-access?scope=all",
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
          const parsed = normalizeFinanceSectionRules(payload?.rules);
          if (alive) setRules(parsed);
        } else if (alive) {
          setRules([]);
        }
      } catch {
        toast.error("No se pudo cargar permisos de finanzas.");
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
        "/api/finance/section-access",
        { method: "PUT", body: JSON.stringify({ rules }) },
        token,
      );
      const body = (await res.json().catch(() => null)) as
        | { rules?: unknown; error?: string }
        | null;
      if (!res.ok) {
        throw new Error(body?.error || "No se pudo guardar");
      }
      const nextRules = normalizeFinanceSectionRules(body?.rules);
      setRules(nextRules);
      toast.success("Permisos guardados");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
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
        Solo gerencia puede configurar estos permisos.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Acceso a secciones</h2>
          <p className="text-sm opacity-70">
            Habilita secciones de finanzas para usuarios especificos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={saveRules}
            disabled={saving}
            className={ICON_BTN}
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>

      <div className={`${GLASS} p-4`}>
        <label className="mb-2 block text-xs opacity-70">Usuario</label>
        <select
          value={selectedUserId || 0}
          onChange={(e) => setSelectedUserId(Number(e.target.value))}
          className="w-full appearance-none rounded-3xl border border-white/30 bg-white/10 px-3 py-2 text-sm outline-none backdrop-blur dark:border-white/10 dark:bg-white/10"
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
        <div className={`${GLASS} space-y-3 p-4`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Secciones permitidas</h3>
              <p className="text-xs opacity-70">
                Si no seleccionas ninguna, aplican solo los permisos por rol.
              </p>
            </div>
            <button
              type="button"
              onClick={() => updateRule(selectedRule.id_user, [])}
              className={ICON_BTN}
              disabled={saving}
            >
              Limpiar
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {FINANCE_SECTIONS.map((section) => (
              <label
                key={section.key}
                className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-xs"
              >
                <input
                  type="checkbox"
                  checked={selectedRule.sections.includes(section.key)}
                  onChange={() =>
                    updateRule(
                      selectedRule.id_user,
                      toggleKey(selectedRule.sections, section.key),
                    )
                  }
                  disabled={saving}
                />
                <span>{section.label}</span>
              </label>
            ))}
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
