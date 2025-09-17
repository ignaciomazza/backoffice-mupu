//src/app/commissions/page.tsx

"use client";
import React, { useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";

/* ===== tipos ===== */

type User = {
  id_user: number;
  first_name: string;
  last_name: string;
  role: string;
  id_agency: number;
};

type ShareRow = { beneficiary_user_id: number; percent: number };

type RuleSet = {
  id_rule_set: number;
  owner_user_id: number;
  valid_from: string | null; // ISO
  own_pct: string; // Decimal devuelto por Prisma
  shares: { beneficiary_user_id: number; percent: string }[];
};

/* ===== helper UI ===== */

function fmtDateISOtoYMD(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/* ===== componente ===== */

export default function CommissionsPage() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);

  const [users, setUsers] = useState<User[]>([]);
  const [selectedOwner, setSelectedOwner] = useState<number>(0);

  // formulario (crear/editar)
  const [ownPct, setOwnPct] = useState<number>(100);
  const [validFrom, setValidFrom] = useState<string>(""); // YYYY-MM-DD
  const [rows, setRows] = useState<ShareRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);

  // historial del owner seleccionado
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

  const sumShares = rows.reduce((a, b) => a + (Number(b.percent) || 0), 0);
  const remainder = Math.max(0, 100 - (Number(ownPct) || 0) - sumShares);

  /* ===== efectos ===== */

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

  // cargar historial del owner
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
        // API devuelve desc por valid_from: list[0] es la última
        setHistory(list);
      } catch (e) {
        const err = e as Error;
        toast.error(err.message || "Error");
      } finally {
        setLoadingHistory(false);
      }
    })();
  }, [token, selectedOwner]);

  /* ===== acciones ===== */

  function resetFormToEffective() {
    // si existe una versión, prefilleamos con la última (history[0])
    const effective = history[0];
    if (effective) {
      setOwnPct(Number(effective.own_pct));
      setValidFrom(fmtDateISOtoYMD(effective.valid_from));
      setRows(
        effective.shares.map((s) => ({
          beneficiary_user_id: s.beneficiary_user_id,
          percent: Number(s.percent),
        })),
      );
    } else {
      setOwnPct(100);
      setValidFrom("");
      setRows([]);
    }
    setEditingRuleId(null);
  }

  useEffect(() => {
    // cada vez que cambia el owner y llega el history, reseteo form
    if (selectedOwner) resetFormToEffective();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOwner, history.length]);

  async function saveRule() {
    if (!selectedOwner) {
      toast.error("Seleccioná un usuario");
      return;
    }
    if ((Number(ownPct) || 0) < 0) {
      toast.error("El % del dueño no puede ser negativo");
      return;
    }
    if ((Number(ownPct) || 0) + sumShares > 100.0001) {
      toast.error("La suma de porcentajes no puede superar 100%");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        owner_user_id: selectedOwner,
        own_pct: Number(ownPct),
        valid_from: validFrom || undefined,
        shares: rows
          .filter((r) => r.beneficiary_user_id && Number(r.percent) > 0)
          .map((r) => ({
            beneficiary_user_id: r.beneficiary_user_id,
            percent: Number(r.percent),
          })),
      };

      let ok = false;
      if (editingRuleId) {
        // editar versión existente
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
        // crear nueva versión
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
        toast.success(editingRuleId ? "Versión actualizada" : "Versión creada");
        // recargar historial y limpiar edición
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
    setOwnPct(Number(rs.own_pct));
    setValidFrom(fmtDateISOtoYMD(rs.valid_from));
    setRows(
      rs.shares.map((s) => ({
        beneficiary_user_id: s.beneficiary_user_id,
        percent: Number(s.percent),
      })),
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteVersion(ruleId: number) {
    if (!confirm("¿Eliminar esta versión de la regla?")) return;
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
      toast.success("Versión eliminada");
      setHistory((h) => h.filter((x) => x.id_rule_set !== ruleId));
      if (editingRuleId === ruleId) resetFormToEffective();
    } catch (e) {
      const err = e as Error;
      toast.error(err.message || "Error eliminando");
    }
  }

  /* ===== UI ===== */

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Spinner />
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="text-sky-950 dark:text-white">
        <h1 className="mb-6 text-2xl font-semibold">Comisiones por Usuario</h1>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block">Usuario (dueño de la reserva)</label>
            <select
              value={selectedOwner}
              onChange={(e) => setSelectedOwner(Number(e.target.value))}
              className="w-full rounded-2xl bg-white/10 px-4 py-2 dark:text-white"
            >
              <option value={0}>Seleccionar…</option>
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
              className="w-full rounded-2xl bg-white/10 px-4 py-2 dark:text-white"
            />
          </div>

          <div>
            <label className="mb-1 block">% del dueño</label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={ownPct}
              onChange={(e) => setOwnPct(Number(e.target.value))}
              className="w-full rounded-2xl bg-white/10 px-4 py-2 dark:text-white"
            />
          </div>
        </div>

        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            Beneficiarios (cobran de las reservas de{" "}
            {owner ? owner.first_name : "…"})
          </h2>
          <button
            onClick={() =>
              setRows((r) => [...r, { beneficiary_user_id: 0, percent: 0 }])
            }
            className="rounded-full bg-sky-100 px-4 py-2 text-sky-950 dark:bg-white/10 dark:text-white"
          >
            Agregar
          </button>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
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
                      className="w-full rounded-2xl bg-white/10 p-2 dark:text-white"
                    >
                      <option value={0}>Seleccionar…</option>
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
                      value={row.percent}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setRows((rs) =>
                          rs.map((r, i) =>
                            i === idx ? { ...r, percent: v } : r,
                          ),
                        );
                      }}
                      className="w-full rounded-2xl bg-white/10 p-2 dark:text-white"
                    />
                  </td>
                  <td className="p-2 text-right">
                    <button
                      onClick={() =>
                        setRows((rs) => rs.filter((_, i) => i !== idx))
                      }
                      className="rounded-full bg-red-600 px-3 py-2 text-red-100"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-4 opacity-70">
                    Sin beneficiarios
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-sm opacity-80">
          Resto para Agencia: <strong>{remainder.toFixed(2)}%</strong>
        </p>

        <div className="mt-4 flex gap-2">
          {editingRuleId && (
            <button
              onClick={resetFormToEffective}
              className="rounded-full bg-white/10 px-6 py-2 dark:text-white"
            >
              Cancelar edición
            </button>
          )}
          <div className="ml-auto" />
          <button
            onClick={saveRule}
            disabled={saving || !selectedOwner}
            className="rounded-full bg-sky-100 px-6 py-2 text-sky-950 disabled:opacity-60 dark:bg-white/10 dark:text-white"
          >
            {saving ? (
              <Spinner />
            ) : editingRuleId ? (
              "Actualizar versión"
            ) : (
              "Guardar versión"
            )}
          </button>
        </div>

        {/* ===== Historial ===== */}
        <h2 className="mb-3 mt-10 text-xl font-semibold">Historial</h2>
        <div className="overflow-x-auto rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
          {loadingHistory ? (
            <div className="flex h-[120px] items-center justify-center">
              <Spinner />
            </div>
          ) : history.length === 0 ? (
            <p className="p-2 opacity-70">Sin versiones anteriores.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="p-2 text-left">Vigente desde</th>
                  <th className="p-2 text-left">% del dueño</th>
                  <th className="p-2 text-left">Beneficiarios</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {history.map((rs) => (
                  <tr key={rs.id_rule_set} className="border-t border-white/10">
                    <td className="p-2">{fmtDateISOtoYMD(rs.valid_from)}</td>
                    <td className="p-2">{Number(rs.own_pct).toFixed(2)}%</td>
                    <td className="p-2">
                      {rs.shares.length === 0 ? (
                        <span className="opacity-70">—</span>
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
                                  : `#${s.beneficiary_user_id} (${Number(s.percent).toFixed(2)}%)`}
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
                          className="rounded-full bg-red-600 px-3 py-2 text-red-100"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <ToastContainer position="bottom-right" />
      </div>
    </ProtectedRoute>
  );
}
