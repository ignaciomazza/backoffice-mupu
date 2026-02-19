"use client";

import React, { useEffect, useMemo, useState } from "react";
import Spinner from "@/components/Spinner";
import { toast } from "react-toastify";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import { toDateKeyInBuenosAires } from "@/lib/buenosAiresDate";

type User = {
  id_user: number;
  first_name: string;
  last_name: string;
  role: string;
  id_agency: number;
};

type ShareRow = { beneficiary_user_id: number; percent: string };

type RuleSet = {
  id_rule_set: number;
  owner_user_id: number;
  valid_from: string | null; // ISO
  own_pct: string; // Decimal devuelto por Prisma
  shares: { beneficiary_user_id: number; percent: string }[];
};

function fmtDateISOtoYMD(iso: string | null): string {
  if (!iso) return "";
  return toDateKeyInBuenosAires(iso) ?? "";
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className={className}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
      />
    </svg>
  );
}

export default function CommissionsConfig() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);

  const [users, setUsers] = useState<User[]>([]);
  const [selectedOwner, setSelectedOwner] = useState<number>(0);

  const [ownPct, setOwnPct] = useState<string>("100");
  const [validFrom, setValidFrom] = useState<string>("");
  const [rows, setRows] = useState<ShareRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);

  const [history, setHistory] = useState<RuleSet[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const owner = useMemo(
    () => users.find((u) => u.id_user === selectedOwner),
    [users, selectedOwner],
  );

  const availableBeneficiaries = useMemo(
    () => users.filter((u) => u.id_user !== selectedOwner),
    [users, selectedOwner],
  );

  const parsePercent = (value: string) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };
  const isPercentValid = (value: string) =>
    value === "" || Number.isFinite(Number(value));
  const sumShares = rows.reduce((a, b) => a + parsePercent(b.percent), 0);
  const ownerPctValue = parsePercent(ownPct);
  const ownerPctValid = isPercentValid(ownPct);
  const rowsValid = rows.every((row) => isPercentValid(row.percent));
  const totalAssigned = ownerPctValue + sumShares;
  const overLimit = totalAssigned > 100.0001;
  const overage = Math.max(0, totalAssigned - 100);
  const remainder = Math.max(0, 100 - totalAssigned);
  const totalAssignedClamped = Math.min(100, Math.max(0, totalAssigned));
  const hasOwner = selectedOwner > 0;
  const canSave =
    hasOwner && !overLimit && ownerPctValue >= 0 && ownerPctValid && rowsValid;

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        setLoading(true);
        const r = await authFetch("/api/users", { cache: "no-store" }, token);
        if (!r.ok) throw new Error("Error al cargar usuarios");
        const us: User[] = await r.json();
        setUsers(us);
      } catch (e) {
        const err = e as Error;
        toast.error(err.message || "Error");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  useEffect(() => {
    if (!token || !selectedOwner) {
      setHistory([]);
      return;
    }
    (async () => {
      try {
        setLoadingHistory(true);
        const r = await authFetch(
          `/api/commissions?userId=${selectedOwner}`,
          { cache: "no-store" },
          token,
        );
        if (!r.ok) throw new Error("Error al cargar reglas");
        const list: RuleSet[] = await r.json();
        setHistory(list);
      } catch (e) {
        const err = e as Error;
        toast.error(err.message || "Error");
      } finally {
        setLoadingHistory(false);
      }
    })();
  }, [token, selectedOwner]);

  function resetFormToEffective() {
    const effective = history[0];
    if (effective) {
      setOwnPct(String(Number(effective.own_pct)));
      setValidFrom(fmtDateISOtoYMD(effective.valid_from));
      setRows(
        effective.shares.map((s) => ({
          beneficiary_user_id: s.beneficiary_user_id,
          percent: String(Number(s.percent)),
        })),
      );
    } else {
      setOwnPct("100");
      setValidFrom("");
      setRows([]);
    }
    setEditingRuleId(null);
  }

  useEffect(() => {
    if (selectedOwner) resetFormToEffective();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOwner, history.length]);

  async function saveRule() {
    if (!selectedOwner) {
      toast.error("Selecciona un usuario");
      return;
    }
    if (!ownerPctValid || !rowsValid) {
      toast.error("Revisa los porcentajes antes de guardar");
      return;
    }
    if (ownerPctValue < 0) {
      toast.error("El % del duenio no puede ser negativo");
      return;
    }
    if (overLimit) {
      toast.error("La suma de porcentajes no puede superar 100%");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        owner_user_id: selectedOwner,
        own_pct: ownerPctValue,
        valid_from: validFrom || undefined,
        shares: rows
          .map((r) => ({
            beneficiary_user_id: r.beneficiary_user_id,
            percent: parsePercent(r.percent),
          }))
          .filter((r) => r.beneficiary_user_id && r.percent > 0),
      };

      let ok = false;
      if (editingRuleId) {
        const r = await authFetch(
          `/api/commissions/${editingRuleId}`,
          { method: "PUT", body: JSON.stringify(payload) },
          token,
        );
        ok = r.ok;
        if (!r.ok) {
          const er = await r.json().catch(() => ({}));
          throw new Error(er.error || "No se pudo actualizar");
        }
      } else {
        const r = await authFetch(
          "/api/commissions",
          { method: "POST", body: JSON.stringify(payload) },
          token,
        );
        ok = r.ok;
        if (!r.ok) {
          const er = await r.json().catch(() => ({}));
          throw new Error(er.error || "No se pudo guardar");
        }
      }

      if (ok) {
        toast.success(editingRuleId ? "Version actualizada" : "Version creada");
        const rr = await authFetch(
          `/api/commissions?userId=${selectedOwner}`,
          { cache: "no-store" },
          token,
        );
        const list: RuleSet[] = await rr.json();
        setHistory(list);
        setEditingRuleId(null);
      }
    } catch (e) {
      const err = e as Error;
      toast.error(err.message || "Error guardando");
    } finally {
      setSaving(false);
    }
  }

  function startEditVersion(rs: RuleSet) {
    setEditingRuleId(rs.id_rule_set);
    setOwnPct(String(Number(rs.own_pct)));
    setValidFrom(fmtDateISOtoYMD(rs.valid_from));
    setRows(
      rs.shares.map((s) => ({
        beneficiary_user_id: s.beneficiary_user_id,
        percent: String(Number(s.percent)),
      })),
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteVersion(ruleId: number) {
    if (!confirm("Eliminar esta version de la regla?")) return;
    try {
      const r = await authFetch(
        `/api/commissions/${ruleId}`,
        { method: "DELETE" },
        token,
      );
      if (!r.ok) {
        const er = await r.json().catch(() => ({}));
        throw new Error(er.error || "No se pudo eliminar");
      }
      toast.success("Version eliminada");
      setHistory((h) => h.filter((x) => x.id_rule_set !== ruleId));
      if (editingRuleId === ruleId) resetFormToEffective();
    } catch (e) {
      const err = e as Error;
      toast.error(err.message || "Error eliminando");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">Reglas de comision</h2>
          {editingRuleId && (
            <span className="rounded-full border border-amber-200/40 bg-amber-100/20 px-2 py-0.5 text-xs text-amber-900 dark:text-amber-100">
              Editando version
            </span>
          )}
        </div>
        <p className="text-sm opacity-70">
          Define el reparto por duenio de reserva. El resto queda para la
          agencia.
        </p>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block">Usuario (duenio de la reserva)</label>
            <select
              value={selectedOwner}
              onChange={(e) => setSelectedOwner(Number(e.target.value))}
              className="w-full rounded-2xl bg-white/10 px-4 py-2 dark:text-white"
            >
              <option value={0}>Seleccionar...</option>
              {users.map((u) => (
                <option key={u.id_user} value={u.id_user}>
                  {u.first_name} {u.last_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block">Vigente desde (opcional)</label>
            <input
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              disabled={!hasOwner}
              className="w-full rounded-2xl bg-white/10 px-4 py-2 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white"
            />
            <p className="mt-1 text-xs opacity-60">
              Si queda vacio, aplica inmediatamente.
            </p>
          </div>

          <div>
            <label className="mb-1 block">% del duenio</label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              inputMode="decimal"
              value={ownPct}
              onChange={(e) => setOwnPct(e.target.value)}
              disabled={!hasOwner}
              className="w-full rounded-2xl bg-white/10 px-4 py-2 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white"
            />
          </div>
        </div>

        <p className="mt-3 text-xs opacity-70">
          {hasOwner
            ? "El historial se actualiza automaticamente al elegir un usuario."
            : "Selecciona un usuario para comenzar la configuracion."}
        </p>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Lideres de equipo</h3>
            <p className="text-xs opacity-70">
              Usuarios que cobran parte de la comision del duenio seleccionado.
            </p>
          </div>
          <button
            onClick={() =>
              setRows((r) => [...r, { beneficiary_user_id: 0, percent: "" }])
            }
            disabled={!hasOwner}
            className="rounded-full bg-sky-100 px-4 py-2 text-sky-950 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white/10 dark:text-white"
          >
            Agregar Lider de equipo
          </button>
        </div>

        <div className="mt-4 overflow-x-auto rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="p-2 text-left">Usuario</th>
                <th className="p-2 text-left">%</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx}>
                  <td className="p-2">
                    <select
                      value={row.beneficiary_user_id}
                      onChange={(e) => {
                        const id = Number(e.target.value);
                        setRows((rs) =>
                          rs.map((r, i) =>
                            i === idx ? { ...r, beneficiary_user_id: id } : r,
                          ),
                        );
                      }}
                      disabled={!hasOwner}
                      className="w-full rounded-2xl bg-white/10 p-2 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white"
                    >
                      <option value={0}>Seleccionar...</option>
                      {availableBeneficiaries.map((u) => (
                        <option key={u.id_user} value={u.id_user}>
                          {u.first_name} {u.last_name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      inputMode="decimal"
                      value={row.percent}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRows((rs) =>
                          rs.map((r, i) =>
                            i === idx ? { ...r, percent: v } : r,
                          ),
                        );
                      }}
                      disabled={!hasOwner}
                      className="w-full rounded-2xl bg-white/10 p-2 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white"
                    />
                  </td>
                  <td className="p-2 text-right">
                    <button
                      onClick={() =>
                        setRows((rs) => rs.filter((_, i) => i !== idx))
                      }
                      disabled={!hasOwner}
                      className="rounded-full bg-red-600 p-2 text-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label="Eliminar Lider de equipo"
                      title="Eliminar Lider de equipo"
                    >
                      <TrashIcon className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-4 text-center opacity-70">
                    Sin lider de equipo cargados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
            <div className="flex items-center gap-2 text-xs opacity-70">
              <span className="inline-flex size-2 rounded-full bg-amber-400" />
              Duenio
            </div>
            <div className="text-lg font-semibold">
              {ownerPctValue.toFixed(2)}%
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
            <div className="flex items-center gap-2 text-xs opacity-70">
              <span className="inline-flex size-2 rounded-full bg-sky-400" />
              Lideres de equipo
            </div>
            <div className="text-lg font-semibold">{sumShares.toFixed(2)}%</div>
          </div>
          <div
            className={`rounded-2xl border p-3 ${
              overLimit
                ? "border-red-400/40 bg-red-100/20"
                : "border-white/10 bg-white/10"
            }`}
          >
            <div className="flex items-center gap-2 text-xs opacity-70">
              <span className="inline-flex size-2 rounded-full bg-emerald-400" />
              Resto agencia
            </div>
            <div className="text-lg font-semibold">
              {overLimit ? "0.00%" : `${remainder.toFixed(2)}%`}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs opacity-70">
            <span>Total asignado</span>
            <span>{totalAssigned.toFixed(2)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full ${
                overLimit
                  ? "bg-red-500"
                  : totalAssigned >= 100
                    ? "bg-emerald-500"
                    : "bg-sky-400"
              }`}
              style={{ width: `${totalAssignedClamped}%` }}
            />
          </div>
          {overLimit ? (
            <p className="text-xs text-red-600">
              Exceso de {overage.toFixed(2)}%. Ajusta para poder guardar.
            </p>
          ) : (
            <p className="text-xs opacity-70">
              Resto para agencia: {remainder.toFixed(2)}%.
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {editingRuleId && (
            <button
              onClick={resetFormToEffective}
              className="rounded-full bg-white/10 px-6 py-2 dark:text-white"
            >
              Cancelar edicion
            </button>
          )}
          <div className="ml-auto" />
          <button
            onClick={saveRule}
            disabled={saving || !canSave}
            className="rounded-full bg-sky-100 px-6 py-2 text-sky-950 disabled:opacity-60 dark:bg-white/10 dark:text-white"
          >
            {saving ? (
              <Spinner />
            ) : editingRuleId ? (
              "Actualizar version"
            ) : (
              "Guardar version"
            )}
          </button>
        </div>
      </div>

      <div className="space-y-3 rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold">Historial</h3>
          {hasOwner && owner && (
            <span className="text-xs opacity-70">
              Usuario: {owner.first_name} {owner.last_name}
            </span>
          )}
        </div>
        <div className="overflow-x-auto rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
          {loadingHistory ? (
            <div className="flex h-[120px] items-center justify-center">
              <Spinner />
            </div>
          ) : !hasOwner ? (
            <p className="p-2 text-center opacity-70">
              Selecciona un usuario para ver su historial.
            </p>
          ) : history.length === 0 ? (
            <p className="p-2 text-center opacity-70">
              Sin versiones anteriores.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="p-2 text-left">Vigente desde</th>
                  <th className="p-2 text-left">% del duenio</th>
                  <th className="p-2 text-left">Lideres de equipo</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {history.map((rs, idx) => {
                  const isActive = idx === 0;
                  const validLabel =
                    fmtDateISOtoYMD(rs.valid_from) || "Inmediato";
                  return (
                    <tr
                      key={rs.id_rule_set}
                      className={`border-t border-white/10 ${
                        isActive ? "bg-white/5" : ""
                      }`}
                    >
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <span>{validLabel}</span>
                          {isActive && (
                            <span className="rounded-full border border-emerald-200/40 bg-emerald-100/20 px-2 py-0.5 text-[10px] text-emerald-900 dark:text-emerald-100">
                              Actual
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-2">{Number(rs.own_pct).toFixed(2)}%</td>
                      <td className="p-2">
                        {rs.shares.length === 0 ? (
                          <span className="opacity-70">-</span>
                        ) : (
                          <ul className="list-disc pl-5">
                            {rs.shares.map((s, i) => {
                              const u = users.find(
                                (uu) => uu.id_user === s.beneficiary_user_id,
                              );
                              return (
                                <li key={`${rs.id_rule_set}-${i}`}>
                                  {u
                                    ? `${u.first_name} ${u.last_name} (${Number(s.percent).toFixed(2)}%)`
                                    : `N° ${s.beneficiary_user_id} (${Number(s.percent).toFixed(2)}%)`}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => startEditVersion(rs)}
                            className="rounded-full bg-sky-100 px-3 py-2 text-sky-950 dark:bg-white/10 dark:text-white"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => deleteVersion(rs.id_rule_set)}
                            className="rounded-full bg-red-600 p-2 text-red-100"
                            aria-label="Eliminar version"
                            title="Eliminar version"
                          >
                            <TrashIcon className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
