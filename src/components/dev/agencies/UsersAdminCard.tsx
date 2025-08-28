// src/components/dev/agencies/UsersAdminCard.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";

type DevUser = {
  id_user: number;
  email: string;
  first_name: string;
  last_name: string;
  position: string | null;
  role: string;
  id_agency: number;
  creation_date: string;
};

type ListResponse =
  | { items: DevUser[]; nextCursor: number | null } // si tu API devuelve paginado
  | DevUser[]; // o lista simple (compat)

const PAGE_SIZE = 12;
const ROLES = [
  "desarrollador",
  "gerente",
  "lider",
  "vendedor",
  "administrativo",
  "marketing",
] as const;

function isStrongPassword(pw: string) {
  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasNum = /[0-9]/.test(pw);
  const hasSym = /[^A-Za-z0-9]/.test(pw);
  return pw.length >= 8 && hasLower && hasUpper && hasNum && hasSym;
}

function genPassword(len = 12) {
  const pool =
    "ABCDEFGHJKLMNPQRSTUVXYZabcdefghijkmnopqrstuvwxyz0123456789!@#$%^&*()-_=+";
  let out = "";
  for (let i = 0; i < len; i++)
    out += pool[Math.floor(Math.random() * pool.length)];
  return out;
}

type Props = { agencyId: number };

export default function UsersAdminCard({ agencyId }: Props) {
  const { token } = useAuth();

  // list
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [items, setItems] = useState<DevUser[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // search
  const [q, setQ] = useState("");
  const qRef = useRef<HTMLInputElement>(null);

  // form
  const [openForm, setOpenForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{
    email: string;
    first_name: string;
    last_name: string;
    position: string;
    role: (typeof ROLES)[number];
    password: string; // solo crear / reset
  }>({
    email: "",
    first_name: "",
    last_name: "",
    position: "",
    role: "vendedor",
    password: "",
  });

  const canSubmit = useMemo(() => {
    if (!form.email.trim() || !form.first_name.trim() || !form.last_name.trim())
      return false;
    if (!editingId && !isStrongPassword(form.password)) return false;
    return true;
  }, [form, editingId]);

  // -------- load list
  async function fetchList(init = false, search = "") {
    if (!token) return;
    try {
      if (init) setLoading(true);
      const url = new URL(
        `/api/dev/agencies/${agencyId}/users`,
        window.location.origin,
      );
      url.searchParams.set("limit", String(PAGE_SIZE));
      if (search) url.searchParams.set("q", search);

      const res = await authFetch(url.toString(), {}, token);
      if (res.status === 403) {
        setForbidden(true);
        setItems([]);
        setNextCursor(null);
        return;
      }
      if (!res.ok) throw new Error("No se pudieron cargar usuarios");
      const data = (await res.json()) as ListResponse;

      if (Array.isArray(data)) {
        setItems(data);
        setNextCursor(null);
      } else {
        setItems(data.items);
        setNextCursor(data.nextCursor);
      }
    } catch (e) {
      console.error(e);
      toast.error("Error cargando usuarios");
    } finally {
      if (init) setLoading(false);
    }
  }

  useEffect(() => {
    if (!token || !agencyId) return;
    fetchList(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, agencyId]);

  // -------- paging
  async function loadMore() {
    if (!token || nextCursor == null || loadingMore) return;
    setLoadingMore(true);
    try {
      const url = new URL(
        `/api/dev/agencies/${agencyId}/users`,
        window.location.origin,
      );
      url.searchParams.set("limit", String(PAGE_SIZE));
      url.searchParams.set("cursor", String(nextCursor));
      if (q.trim()) url.searchParams.set("q", q.trim());

      const res = await authFetch(url.toString(), {}, token);
      if (!res.ok) throw new Error("No se pudo cargar más");
      const data = (await res.json()) as ListResponse;

      if (Array.isArray(data)) {
        // si la API no tiene cursor, ya teníamos todo
        setNextCursor(null);
      } else {
        setItems((p) => [...p, ...data.items]);
        setNextCursor(data.nextCursor);
      }
    } catch (e) {
      console.error(e);
      toast.error("Error al cargar más");
    } finally {
      setLoadingMore(false);
    }
  }

  // -------- open create/edit
  function openCreate() {
    setEditingId(null);
    setForm({
      email: "",
      first_name: "",
      last_name: "",
      position: "",
      role: "vendedor",
      password: "",
    });
    setOpenForm(true);
  }
  function openEdit(u: DevUser) {
    setEditingId(u.id_user);
    setForm({
      email: u.email,
      first_name: u.first_name,
      last_name: u.last_name,
      position: u.position ?? "",
      role: (u.role as (typeof ROLES)[number]) ?? "vendedor",
      password: "", // no se edita aquí
    });
    setOpenForm(true);
  }

  // -------- submit create/update
  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!token) return;
    setSaving(true);
    try {
      if (editingId) {
        const res = await authFetch(
          `/api/dev/agencies/${agencyId}/users/${editingId}`,
          {
            method: "PUT",
            body: JSON.stringify({
              email: form.email.trim(),
              first_name: form.first_name.trim(),
              last_name: form.last_name.trim(),
              position: form.position.trim() || null,
              role: form.role,
            }),
          },
          token,
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || "No se pudo actualizar");
        }
        const updated = (await res.json()) as DevUser;
        setItems((p) =>
          p.map((x) => (x.id_user === updated.id_user ? updated : x)),
        );
        toast.success("Usuario actualizado");
      } else {
        const res = await authFetch(
          `/api/dev/agencies/${agencyId}/users`,
          {
            method: "POST",
            body: JSON.stringify({
              email: form.email.trim(),
              password: form.password,
              first_name: form.first_name.trim(),
              last_name: form.last_name.trim(),
              position: form.position.trim() || null,
              role: form.role,
            }),
          },
          token,
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || "No se pudo crear");
        }
        const created = (await res.json()) as DevUser;
        setItems((p) => [created, ...p]);
        toast.success("Usuario creado");
      }
      setOpenForm(false);
      setEditingId(null);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Error guardando");
    } finally {
      setSaving(false);
    }
  }

  // -------- delete
  async function onDelete(id: number) {
    if (!token) return;
    if (!confirm("¿Eliminar este usuario?")) return;
    try {
      const res = await authFetch(
        `/api/dev/agencies/${agencyId}/users/${id}`,
        { method: "DELETE" },
        token,
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "No se pudo eliminar");
      }
      setItems((p) => p.filter((x) => x.id_user !== id));
      toast.success("Usuario eliminado");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Error eliminando");
    }
  }

  // -------- reset password (solo dev/gerente)
  async function onResetPassword(id: number) {
    if (!token) return;
    const newPw = genPassword(12);
    if (
      !confirm(
        "Se generará una contraseña aleatoria y se aplicará de inmediato. ¿Continuar?",
      )
    )
      return;
    try {
      const res = await authFetch(
        `/api/dev/agencies/${agencyId}/users/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            action: "changePassword",
            newPassword: newPw,
            confirmPassword: newPw,
          }),
        },
        token,
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "No se pudo resetear la contraseña");
      }
      toast.success("Contraseña reseteada");
      // Mostramos la pass una sola vez
      navigator.clipboard
        .writeText(newPw)
        .then(() => toast.info("Nueva contraseña copiada al portapapeles"))
        .catch(() =>
          toast.info(`Nueva contraseña: ${newPw} (copiala ahora mismo)`),
        );
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Error reseteando pass");
    }
  }

  // -------- render
  return (
    <div className="space-y-4 rounded-3xl border border-white/10 bg-white/10 p-6 shadow-md shadow-sky-950/10 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-medium">Usuarios de la agencia</h3>

        <div className="flex items-center gap-2">
          <input
            ref={qRef}
            type="search"
            placeholder="Buscar por nombre o email"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="rounded-2xl border border-white/10 bg-white/50 px-3 py-2 text-sm outline-none dark:bg-white/10 dark:text-white"
          />
          <button
            type="button"
            onClick={() => fetchList(true, q.trim())}
            className="rounded-full bg-white/0 px-4 py-2 text-sky-950 shadow-sm ring-1 ring-sky-950/10 transition-transform hover:scale-95 active:scale-90 dark:text-white dark:ring-white/10"
          >
            Buscar
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-full bg-sky-100 px-4 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white"
          >
            Nuevo usuario
          </button>
        </div>
      </div>

      {forbidden ? (
        <p className="text-sm text-sky-950/70 dark:text-white/70">
          No tenés permisos para ver/editar usuarios.
        </p>
      ) : loading ? (
        <div> Cargando… </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
          No hay usuarios.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {items.map((u) => (
              <div
                key={u.id_user}
                className="space-y-2 rounded-2xl border border-white/10 bg-white/10 p-4 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {u.first_name} {u.last_name}
                  </p>
                  <p className="truncate text-xs text-sky-950/70 dark:text-white/60">
                    {u.email}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide text-sky-950/60 dark:text-white/60">
                      Rol
                    </span>
                    <span className="font-medium">{u.role}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide text-sky-950/60 dark:text-white/60">
                      Puesto
                    </span>
                    <span className="font-medium">
                      {u.position?.trim() || "—"}
                    </span>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap justify-end gap-2">
                  <button
                    onClick={() => openEdit(u)}
                    className="rounded-full bg-sky-100 px-4 py-1.5 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => onResetPassword(u.id_user)}
                    className="rounded-full bg-amber-500/90 px-4 py-1.5 text-amber-50 shadow-sm transition-transform hover:scale-95 active:scale-90"
                  >
                    Reset pass
                  </button>
                  <button
                    onClick={() => onDelete(u.id_user)}
                    className="rounded-full bg-red-600/90 px-4 py-1.5 text-red-50 shadow-sm transition-transform hover:scale-95 active:scale-90"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-center">
            {nextCursor != null ? (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-full bg-sky-100 px-5 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 disabled:opacity-60 dark:bg-white/10 dark:text-white"
              >
                {loadingMore ? "Cargando..." : "Ver más"}
              </button>
            ) : (
              <span className="text-sm text-sky-950/60 dark:text-white/60">
                Fin de la lista
              </span>
            )}
          </div>
        </>
      )}

      {/* Form */}
      {openForm && (
        <form
          onSubmit={onSubmit}
          className="space-y-3 rounded-2xl border border-white/10 bg-white/10 p-4"
        >
          <h4 className="text-base font-medium">
            {editingId ? "Editar usuario" : "Crear usuario"}
          </h4>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs">Nombre</label>
              <input
                value={form.first_name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, first_name: e.target.value }))
                }
                required
                className="w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 outline-none dark:bg-white/10 dark:text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs">Apellido</label>
              <input
                value={form.last_name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, last_name: e.target.value }))
                }
                required
                className="w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 outline-none dark:bg-white/10 dark:text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((p) => ({ ...p, email: e.target.value }))
                }
                required
                className="w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 outline-none dark:bg-white/10 dark:text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs">Rol</label>
              <select
                value={form.role}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    role: e.target.value as (typeof ROLES)[number],
                  }))
                }
                className="w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 outline-none dark:bg-white/10 dark:text-white"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-xs">Puesto (opcional)</label>
              <input
                value={form.position}
                onChange={(e) =>
                  setForm((p) => ({ ...p, position: e.target.value }))
                }
                className="w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 outline-none dark:bg-white/10 dark:text-white"
              />
            </div>

            {!editingId && (
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs">
                  Contraseña (mín. 8, con mayúscula, minúscula, número y
                  símbolo)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.password}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, password: e.target.value }))
                    }
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 outline-none dark:bg-white/10 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setForm((p) => ({ ...p, password: genPassword(12) }))
                    }
                    className="rounded-full bg-white/0 px-4 py-2 text-sky-950 shadow-sm ring-1 ring-sky-950/10 transition-transform hover:scale-95 active:scale-90 dark:text-white dark:ring-white/10"
                  >
                    Generar
                  </button>
                </div>
                {!isStrongPassword(form.password) && (
                  <p className="text-xs text-sky-950/70 dark:text-white/60">
                    Debe incluir mayúscula, minúscula, número y símbolo.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setOpenForm(false);
                setEditingId(null);
              }}
              className="rounded-full bg-white/0 px-6 py-2 text-sky-950 shadow-sm ring-1 ring-sky-950/10 transition-transform hover:scale-95 active:scale-90 dark:text-white dark:ring-white/10"
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!canSubmit || saving}
              className="rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 disabled:opacity-60 dark:bg-white/10 dark:text-white"
            >
              {saving ? "Guardando..." : editingId ? "Guardar" : "Crear"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
