// src/components/finance/ReceiptVerificationConfig.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Spinner from "@/components/Spinner";
import { toast } from "react-toastify";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import {
  normalizeReceiptVerificationRules,
  type ReceiptVerificationRule,
} from "@/utils/receiptVerification";
import type {
  FinanceAccount,
  FinancePaymentMethod,
} from "@/utils/loadFinancePicks";

type User = {
  id_user: number;
  first_name: string | null;
  last_name: string | null;
  email?: string | null;
  role?: string | null;
};

type Props = {
  accounts: FinanceAccount[];
  methods: FinancePaymentMethod[];
};

const GLASS =
  "rounded-3xl border border-white/30 bg-white/10 backdrop-blur shadow-lg shadow-sky-900/10 dark:bg-white/10 dark:border-white/5";
const ICON_BTN =
  "rounded-full bg-sky-100 px-4 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-[.98] active:scale-95 disabled:opacity-50 dark:bg-white/10 dark:text-white";

const MANAGER_ROLES = new Set(["gerente", "desarrollador"]);
const ALLOWED_ROLES = new Set(["gerente", "administrativo", "desarrollador"]);

function normalizeRole(role?: string | null) {
  return (role ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/^leader$/, "lider");
}

function userLabel(u: User) {
  const name = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
  if (name) return name;
  if (u.email) return u.email;
  return `Usuario ${u.id_user}`;
}

function toggleId(list: number[], id: number): number[] {
  const next = list.includes(id)
    ? list.filter((item) => item !== id)
    : [...list, id];
  return Array.from(new Set(next)).sort((a, b) => a - b);
}

export default function ReceiptVerificationConfig({ accounts, methods }: Props) {
  const { token, role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [rules, setRules] = useState<ReceiptVerificationRule[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number>(0);

  const canEdit = useMemo(
    () => MANAGER_ROLES.has(normalizeRole(role)),
    [role],
  );

  const methodOptions = useMemo(
    () => methods.filter((m) => m.enabled),
    [methods],
  );
  const accountOptions = useMemo(
    () => accounts.filter((a) => a.enabled),
    [accounts],
  );

  const filteredUsers = useMemo(() => {
    return users.filter((u) => ALLOWED_ROLES.has(normalizeRole(u.role)));
  }, [users]);

  const selectedRule = useMemo(() => {
    if (!selectedUserId) return null;
    return (
      rules.find((rule) => rule.id_user === selectedUserId) ?? {
        id_user: selectedUserId,
        payment_method_ids: [],
        account_ids: [],
      }
    );
  }, [rules, selectedUserId]);

  const updateRule = (
    userId: number,
    next: Partial<ReceiptVerificationRule>,
  ) => {
    if (!userId) return;
    setRules((prev) => {
      const idx = prev.findIndex((rule) => rule.id_user === userId);
      const base =
        idx >= 0
          ? prev[idx]
          : { id_user: userId, payment_method_ids: [], account_ids: [] };
      const updated: ReceiptVerificationRule = {
        ...base,
        ...next,
        payment_method_ids:
          next.payment_method_ids ?? base.payment_method_ids ?? [],
        account_ids: next.account_ids ?? base.account_ids ?? [],
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
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        const rulesUrl = canEdit
          ? "/api/finance/verification-rules?scope=all"
          : "/api/finance/verification-rules";
        const [usersRes, rulesRes] = await Promise.all([
          authFetch("/api/users", { cache: "no-store" }, token),
          authFetch(rulesUrl, { cache: "no-store" }, token),
        ]);

        if (usersRes.ok) {
          const list = (await usersRes.json()) as User[];
          if (alive) setUsers(Array.isArray(list) ? list : []);
        } else if (alive) {
          setUsers([]);
        }

        if (rulesRes.ok) {
          const payload = (await rulesRes.json()) as { rules?: unknown };
          const parsed = normalizeReceiptVerificationRules(payload?.rules);
          if (alive) setRules(parsed);
        } else if (alive) {
          setRules([]);
        }
      } catch {
        toast.error("No se pudo cargar la configuración de verificación.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [token, canEdit]);

  useEffect(() => {
    if (!filteredUsers.length) return;
    setSelectedUserId((prev) =>
      prev && filteredUsers.some((u) => u.id_user === prev)
        ? prev
        : filteredUsers[0].id_user,
    );
  }, [filteredUsers]);

  const saveRules = async () => {
    if (!token || !canEdit) return;
    setSaving(true);
    try {
      const res = await authFetch(
        "/api/finance/verification-rules",
        {
          method: "PUT",
          body: JSON.stringify({ rules }),
        },
        token,
      );
      const body = (await res.json().catch(() => null)) as {
        rules?: unknown;
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(body?.error || "No se pudo guardar");
      }
      const nextRules = normalizeReceiptVerificationRules(body?.rules);
      setRules(nextRules);
      toast.success("Configuración guardada");
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
        Solo gerencia puede configurar los permisos de verificación.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Verificación de ingresos</h2>
          <p className="text-sm opacity-70">
            Definí qué métodos o cuentas puede verificar cada usuario.
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
          disabled={!filteredUsers.length}
        >
          {filteredUsers.length === 0 ? (
            <option value={0}>No hay usuarios disponibles</option>
          ) : (
            filteredUsers.map((u) => (
              <option key={u.id_user} value={u.id_user}>
                {userLabel(u)} · {normalizeRole(u.role)}
              </option>
            ))
          )}
        </select>
        <p className="mt-2 text-xs text-sky-950/70 dark:text-white/70">
          Si no seleccionás métodos o cuentas, el usuario verá todos los
          ingresos.
        </p>
      </div>

      {selectedRule ? (
        <>
          <div className={`${GLASS} space-y-3 p-4`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Métodos permitidos</h3>
                <p className="text-xs opacity-70">
                  Aplicá filtros por tipo de cobro.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  updateRule(selectedRule.id_user, {
                    payment_method_ids: [],
                  })
                }
                className={ICON_BTN}
                disabled={saving}
              >
                Quitar filtro
              </button>
            </div>

            {methodOptions.length === 0 ? (
              <p className="text-sm opacity-70">
                No hay métodos habilitados.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {methodOptions.map((method) => (
                  <label
                    key={method.id_method}
                    className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={selectedRule.payment_method_ids.includes(
                        method.id_method,
                      )}
                      onChange={() =>
                        updateRule(selectedRule.id_user, {
                          payment_method_ids: toggleId(
                            selectedRule.payment_method_ids,
                            method.id_method,
                          ),
                        })
                      }
                      disabled={saving}
                    />
                    <span>{method.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className={`${GLASS} space-y-3 p-4`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Cuentas permitidas</h3>
                <p className="text-xs opacity-70">
                  Limitá por caja, banco o billetera.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  updateRule(selectedRule.id_user, { account_ids: [] })
                }
                className={ICON_BTN}
                disabled={saving}
              >
                Quitar filtro
              </button>
            </div>

            {accountOptions.length === 0 ? (
              <p className="text-sm opacity-70">No hay cuentas habilitadas.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {accountOptions.map((account) => (
                  <label
                    key={account.id_account}
                    className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={selectedRule.account_ids.includes(
                        account.id_account,
                      )}
                      onChange={() =>
                        updateRule(selectedRule.id_user, {
                          account_ids: toggleId(
                            selectedRule.account_ids,
                            account.id_account,
                          ),
                        })
                      }
                      disabled={saving}
                    />
                    <span>{account.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className={`${GLASS} p-4 text-sm`}>
          Seleccioná un usuario para configurar permisos.
        </div>
      )}
    </div>
  );
}
