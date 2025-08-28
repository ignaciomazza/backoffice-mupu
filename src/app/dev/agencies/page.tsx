// src/app/dev/agencies/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import { toast, ToastContainer } from "react-toastify";
import { useRouter } from "next/navigation";
import "react-toastify/dist/ReactToastify.css";

/** =========================
 *  Tipos / helpers
 *  ========================= */
type Maybe<T> = T | null | undefined;

type DevAgency = {
  id_agency: number;
  name: string;
  legal_name: string;
  tax_id: string;
  address?: Maybe<string>;
  phone?: Maybe<string>;
  email?: Maybe<string>;
  website?: Maybe<string>;
  foundation_date?: Maybe<string | Date>;
};

type DevAgencyInput = {
  name: string;
  legal_name: string;
  tax_id: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  foundation_date?: string | null; // YYYY-MM-DD
};

type ListResponse = {
  items: DevAgency[];
  nextCursor: number | null;
};

const PAGE_SIZE = 12;

function formatDateDMY(value?: string | Date | null): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yy = d.getUTCFullYear();
  return `${dd}/${mm}/${yy}`;
}
function toYMD(value?: string | Date | null): string {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** Validaciones simples (alineadas con la API) */
function isValidEmail(v?: string | null): boolean {
  if (!v) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}
function isValidUrl(v?: string | null): boolean {
  if (!v) return true;
  return /^https?:\/\//i.test(v.trim());
}
function isValidCUIT(raw: string): boolean {
  const c = (raw || "").replace(/\D/g, "");
  if (c.length !== 11) return false;
  const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const digits = c.split("").map(Number);
  const dv = digits.pop()!;
  const sum = digits.reduce((acc, d, i) => acc + d * mult[i], 0);
  let mod = 11 - (sum % 11);
  if (mod === 11) mod = 0;
  if (mod === 10) mod = 9;
  return dv === mod;
}

/** =========================
 *  Página
 *  ========================= */
export default function DevAgenciesPage() {
  const { token } = useAuth();
  const router = useRouter();

  // Lista
  const [items, setItems] = useState<DevAgency[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [forbidden, setForbidden] = useState<boolean>(false);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  // Form
  const [openForm, setOpenForm] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const formRef = useRef<HTMLDivElement>(null);

  const [formValues, setFormValues] = useState<DevAgencyInput>({
    name: "",
    legal_name: "",
    tax_id: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    foundation_date: "",
  });
  const [formErrors, setFormErrors] = useState<
    Partial<Record<keyof DevAgencyInput, string>>
  >({});

  /** Cargar inicial */
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const res = await authFetch(
          `/api/dev/agencies?limit=${PAGE_SIZE}`,
          { signal: controller.signal },
          token,
        );
        if (res.status === 403) {
          setForbidden(true);
          setItems([]);
          setNextCursor(null);
          return;
        }
        if (!res.ok) throw new Error("No se pudo cargar agencias");
        const data = (await res.json()) as ListResponse;
        setItems(data.items);
        setNextCursor(data.nextCursor);
      } catch (err: unknown) {
        if ((err as DOMException)?.name !== "AbortError") {
          console.error(err);
          toast.error("Error cargando agencias");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [token]);

  /** Ver más */
  const loadMore = async () => {
    if (!token || nextCursor == null || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await authFetch(
        `/api/dev/agencies?limit=${PAGE_SIZE}&cursor=${nextCursor}`,
        {},
        token,
      );
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(
          (errJson as { error?: string }).error || "No se pudo cargar más",
        );
      }
      const data = (await res.json()) as ListResponse;
      setItems((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor);
    } catch (err: unknown) {
      console.error(err);
      toast.error("Error al cargar más agencias");
    } finally {
      setLoadingMore(false);
    }
  };

  /** Abrir crear / editar */
  const openCreate = () => {
    setEditingId(null);
    setFormValues({
      name: "",
      legal_name: "",
      tax_id: "",
      address: "",
      phone: "",
      email: "",
      website: "",
      foundation_date: "",
    });
    setFormErrors({});
    setOpenForm(true);
    scrollToForm();
  };
  const openEdit = (id: number) => {
    const a = items.find((x) => x.id_agency === id);
    if (!a) return;
    setEditingId(id);
    setFormValues({
      name: a.name ?? "",
      legal_name: a.legal_name ?? "",
      tax_id: (a.tax_id ?? "").replace(/\D/g, ""),
      address: a.address ?? "",
      phone: a.phone ?? "",
      email: a.email ?? "",
      website: a.website ?? "",
      foundation_date: toYMD(a.foundation_date ?? null),
    });
    setFormErrors({});
    setOpenForm(true);
    scrollToForm();
  };
  const scrollToForm = () =>
    setTimeout(
      () =>
        formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      0,
    );

  /** Handlers form */
  const setField =
    (field: keyof DevAgencyInput) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (field === "tax_id") {
        const only = value.replace(/\D/g, "");
        setFormValues((p) => ({ ...p, tax_id: only }));
      } else {
        setFormValues((p) => ({ ...p, [field]: value }));
      }
      if (formErrors[field]) setFormErrors((p) => ({ ...p, [field]: "" }));
    };

  const validate = (v: DevAgencyInput) => {
    const e: Partial<Record<keyof DevAgencyInput, string>> = {};
    if (!v.name.trim()) e.name = "Obligatorio";
    if (!v.legal_name.trim()) e.legal_name = "Obligatorio";
    if (!v.tax_id.trim()) e.tax_id = "Obligatorio";
    else if (!isValidCUIT(v.tax_id.trim())) e.tax_id = "CUIT inválido";
    if (!isValidEmail(v.email)) e.email = "Email inválido";
    if (!isValidUrl(v.website)) e.website = "Debe empezar con http(s)://";
    return e;
  };

  const onSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const payload: DevAgencyInput = {
      name: formValues.name.trim(),
      legal_name: formValues.legal_name.trim(),
      tax_id: formValues.tax_id.trim(),
      address: formValues.address?.trim() || undefined,
      phone: formValues.phone?.trim() || undefined,
      email: formValues.email?.trim() || undefined,
      website: formValues.website?.trim() || undefined,
      foundation_date: formValues.foundation_date?.trim()
        ? formValues.foundation_date
        : null,
    };
    const errors = validate(payload);
    setFormErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    if (!token) return;
    setSaving(true);
    try {
      if (editingId) {
        // Update
        const res = await authFetch(
          `/api/dev/agencies/${editingId}`,
          { method: "PUT", body: JSON.stringify(payload) },
          token,
        );
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(
            (errJson as { error?: string }).error || "No se pudo actualizar",
          );
        }
        const updated = (await res.json()) as DevAgency;
        setItems((prev) =>
          prev.map((x) => (x.id_agency === editingId ? updated : x)),
        );
        toast.success("Agencia actualizada");
      } else {
        // Create
        const res = await authFetch(
          `/api/dev/agencies`,
          { method: "POST", body: JSON.stringify(payload) },
          token,
        );
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(
            (errJson as { error?: string }).error || "No se pudo crear",
          );
        }
        const created = (await res.json()) as DevAgency;
        setItems((prev) => [created, ...prev]);
        toast.success("Agencia creada");
      }
      setOpenForm(false);
      setEditingId(null);
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Error guardando");
    } finally {
      setSaving(false);
    }
  };

  /** Eliminar */
  const onDelete = async (id: number) => {
    if (!token) return;
    if (!confirm("¿Eliminar esta agencia?")) return;
    try {
      const res = await authFetch(
        `/api/dev/agencies/${id}`,
        { method: "DELETE" },
        token,
      );
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(
          (errJson as { error?: string }).error || "No se pudo eliminar",
        );
      }
      setItems((prev) => prev.filter((x) => x.id_agency !== id));
      toast.success("Agencia eliminada");
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Error eliminando");
    }
  };

  /** Ir al detalle */
  const goDetail = (id: number) => router.push(`/dev/agencies/${id}`);

  return (
    <ProtectedRoute>
      <section className="text-sky-950 dark:text-white">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Agencias (Dev)</h1>
          <button
            onClick={openCreate}
            className="rounded-full bg-sky-100 px-5 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white"
          >
            Nueva agencia
          </button>
        </div>

        {forbidden && (
          <p className="mb-4 text-sm text-sky-950/70 dark:text-white/70">
            No tenés permisos para este panel.
          </p>
        )}

        {/* Form colapsable */}
        {openForm && (
          <div ref={formRef} className="mb-6">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-medium">
                {editingId ? "Editar agencia" : "Crear agencia"}
              </h2>
              <button
                onClick={() => {
                  setOpenForm(false);
                  setEditingId(null);
                }}
                className="rounded-full bg-white/0 px-4 py-2 text-sky-950 shadow-sm ring-1 ring-sky-950/10 transition-transform hover:scale-95 active:scale-90 dark:text-white dark:ring-white/10"
              >
                Cerrar
              </button>
            </div>

            <form
              onSubmit={onSubmit}
              noValidate
              className="grid grid-cols-1 gap-4 rounded-3xl border border-white/10 bg-white/10 p-6 shadow-md shadow-sky-950/10 backdrop-blur md:grid-cols-2"
            >
              {/* Nombre */}
              <div className="space-y-1">
                <label className="ml-1 block text-sm">
                  Nombre <span className="text-red-600">*</span>
                </label>
                <input
                  name="name"
                  type="text"
                  value={formValues.name}
                  onChange={setField("name")}
                  required
                  aria-invalid={!!formErrors.name}
                  className="w-full rounded-2xl border border-sky-950/10 bg-white/50 px-3 py-2 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
                  placeholder="Mi Agencia"
                  disabled={saving}
                />
                {formErrors.name && (
                  <p className="text-xs text-red-600">{formErrors.name}</p>
                )}
              </div>

              {/* Razón social */}
              <div className="space-y-1">
                <label className="ml-1 block text-sm">
                  Razón social <span className="text-red-600">*</span>
                </label>
                <input
                  name="legal_name"
                  type="text"
                  value={formValues.legal_name}
                  onChange={setField("legal_name")}
                  required
                  aria-invalid={!!formErrors.legal_name}
                  className="w-full rounded-2xl border border-sky-950/10 bg-white/50 px-3 py-2 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
                  placeholder="Mi Agencia SRL"
                  disabled={saving}
                />
                {formErrors.legal_name && (
                  <p className="text-xs text-red-600">
                    {formErrors.legal_name}
                  </p>
                )}
              </div>

              {/* CUIT */}
              <div className="space-y-1">
                <label className="ml-1 block text-sm">
                  CUIT <span className="text-red-600">*</span>
                </label>
                <input
                  name="tax_id"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={formValues.tax_id}
                  onChange={setField("tax_id")}
                  required
                  aria-invalid={!!formErrors.tax_id}
                  className="w-full rounded-2xl border border-sky-950/10 bg-white/50 px-3 py-2 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
                  placeholder="20123456789"
                  disabled={saving}
                />
                {formErrors.tax_id && (
                  <p className="text-xs text-red-600">{formErrors.tax_id}</p>
                )}
              </div>

              {/* Teléfono */}
              <div className="space-y-1">
                <label className="ml-1 block text-sm">Teléfono</label>
                <input
                  name="phone"
                  type="tel"
                  value={formValues.phone ?? ""}
                  onChange={setField("phone")}
                  className="w-full rounded-2xl border border-sky-950/10 bg-white/50 px-3 py-2 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
                  placeholder="+54 11 1234-5678"
                  disabled={saving}
                />
              </div>

              {/* Email */}
              <div className="space-y-1">
                <label className="ml-1 block text-sm">Email</label>
                <input
                  name="email"
                  type="email"
                  value={formValues.email ?? ""}
                  onChange={setField("email")}
                  aria-invalid={!!formErrors.email}
                  className="w-full rounded-2xl border border-sky-950/10 bg-white/50 px-3 py-2 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
                  placeholder="contacto@agencia.com"
                  disabled={saving}
                />
                {formErrors.email && (
                  <p className="text-xs text-red-600">{formErrors.email}</p>
                )}
              </div>

              {/* Dirección */}
              <div className="space-y-1 md:col-span-2">
                <label className="ml-1 block text-sm">Dirección</label>
                <input
                  name="address"
                  type="text"
                  value={formValues.address ?? ""}
                  onChange={setField("address")}
                  className="w-full rounded-2xl border border-sky-950/10 bg-white/50 px-3 py-2 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
                  placeholder="Calle 123, Ciudad"
                  disabled={saving}
                />
              </div>

              {/* Sitio web */}
              <div className="space-y-1">
                <label className="ml-1 block text-sm">Sitio web</label>
                <input
                  name="website"
                  type="url"
                  value={formValues.website ?? ""}
                  onChange={setField("website")}
                  aria-invalid={!!formErrors.website}
                  className="w-full rounded-2xl border border-sky-950/10 bg-white/50 px-3 py-2 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
                  placeholder="https://tu-sitio.com"
                  disabled={saving}
                />
                {formErrors.website && (
                  <p className="text-xs text-red-600">{formErrors.website}</p>
                )}
              </div>

              {/* Fundación */}
              <div className="space-y-1">
                <label className="ml-1 block text-sm">Fecha de fundación</label>
                <input
                  name="foundation_date"
                  type="date"
                  value={formValues.foundation_date ?? ""}
                  onChange={setField("foundation_date")}
                  className="w-full rounded-2xl border border-sky-950/10 bg-white/50 px-3 py-2 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
                  disabled={saving}
                />
              </div>

              {/* Acciones */}
              <div className="mt-2 flex justify-end gap-2 md:col-span-2">
                <button
                  type="button"
                  onClick={() => {
                    setOpenForm(false);
                    setEditingId(null);
                  }}
                  className="rounded-full bg-white/0 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/10 ring-1 ring-sky-950/10 transition-transform hover:scale-95 active:scale-90 dark:text-white dark:ring-white/10"
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white"
                >
                  {saving
                    ? "Guardando..."
                    : editingId
                      ? "Guardar cambios"
                      : "Crear"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/10 p-6">
            No hay agencias.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {items.map((a) => (
                <div
                  key={a.id_agency}
                  className="space-y-3 rounded-3xl border border-white/10 bg-white/10 p-6 shadow-md shadow-sky-950/10 backdrop-blur"
                >
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-semibold">{a.name}</h3>
                    <p className="truncate text-sm font-light">
                      {a.legal_name}
                    </p>
                    <p className="text-xs text-sky-950/70 dark:text-white/60">
                      CUIT: <span className="font-medium">{a.tax_id}</span>
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-sky-950/60 dark:text-white/60">
                        Email
                      </p>
                      <p className="break-all font-medium">
                        {a.email?.trim() || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-sky-950/60 dark:text-white/60">
                        Teléfono
                      </p>
                      <p className="font-medium">{a.phone?.trim() || "—"}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs uppercase tracking-wide text-sky-950/60 dark:text-white/60">
                        Fundación
                      </p>
                      <p className="font-medium">
                        {a.foundation_date
                          ? formatDateDMY(a.foundation_date)
                          : "—"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    <button
                      onClick={() => openEdit(a.id_agency)}
                      className="rounded-full bg-sky-100 px-4 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => goDetail(a.id_agency)}
                      className="rounded-full bg-white/0 px-4 py-2 text-sky-950 shadow-sm ring-1 ring-sky-950/10 transition-transform hover:scale-95 active:scale-90 dark:text-white dark:ring-white/10"
                    >
                      Ver
                    </button>
                    <button
                      onClick={() => onDelete(a.id_agency)}
                      className="rounded-full bg-red-600/90 px-4 py-2 text-red-50 shadow-sm shadow-red-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-red-800"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Ver más */}
            <div className="mt-6 flex justify-center">
              {nextCursor != null ? (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 disabled:opacity-60 dark:bg-white/10 dark:text-white"
                >
                  {loadingMore ? "Cargando..." : "Ver más"}
                </button>
              ) : (
                <span className="text-sm text-sky-950/60 dark:text-white/60">
                  No hay más resultados
                </span>
              )}
            </div>
          </>
        )}

        <ToastContainer />
      </section>
    </ProtectedRoute>
  );
}
