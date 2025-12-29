// src/components/agency/AgencyForm.tsx
"use client";

import * as React from "react";

export type AgencySocialInput = {
  instagram?: string | null;
  facebook?: string | null;
  twitter?: string | null;
  tiktok?: string | null;
};

export type AgencyDTO = {
  id_agency: number;
  name: string;
  legal_name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  tax_id: string;
  website?: string | null;
  foundation_date?: string | null; // ISO o YYYY-MM-DD
  logo_url?: string | null;
  social?: AgencySocialInput | null;
};

export type AgencyUpdateInput = {
  name: string;
  legal_name: string;
  tax_id: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  foundation_date?: string | null; // YYYY-MM-DD o null
  logo_url?: string | null;
  social?: AgencySocialInput | null;
};

interface AgencyFormProps {
  initial: AgencyDTO | null;
  isSaving?: boolean;
  onSubmit: (data: AgencyUpdateInput) => void | Promise<void>;
  onCancel?: () => void;
}

type Errors = Partial<Record<keyof AgencyUpdateInput, string>>;

function toYMD(dateLike?: string | null): string {
  if (!dateLike) return "";
  // ya viene YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateLike)) return dateLike;
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// Validaciones (alineadas con el backend)
function isValidEmail(v?: string | null): boolean {
  if (!v) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}
function isValidUrl(v?: string | null): boolean {
  if (!v) return true;
  return /^https?:\/\//i.test(v.trim());
}
function isValidYMD(v?: string | null): boolean {
  if (!v) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v);
  return !Number.isNaN(d.getTime());
}
// CUIT con dígito verificador
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

export default function AgencyForm({
  initial,
  isSaving = false,
  onSubmit,
  onCancel,
}: AgencyFormProps) {
  const [values, setValues] = React.useState<AgencyUpdateInput>({
    name: initial?.name ?? "",
    legal_name: initial?.legal_name ?? "",
    tax_id: initial?.tax_id ?? "",
    address: initial?.address ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    website: initial?.website ?? "",
    foundation_date: toYMD(initial?.foundation_date ?? null),
    logo_url: initial?.logo_url ?? "",
    social: {
      instagram: initial?.social?.instagram ?? "",
      facebook: initial?.social?.facebook ?? "",
      twitter: initial?.social?.twitter ?? "",
      tiktok: initial?.social?.tiktok ?? "",
    },
  });

  const [errors, setErrors] = React.useState<Errors>({});

  React.useEffect(() => {
    if (!initial) return;
    setValues({
      name: initial.name ?? "",
      legal_name: initial.legal_name ?? "",
      tax_id: initial.tax_id ?? "",
      address: initial.address ?? "",
      phone: initial.phone ?? "",
      email: initial.email ?? "",
      website: initial.website ?? "",
      foundation_date: toYMD(initial.foundation_date ?? null),
      logo_url: initial.logo_url ?? "",
      social: {
        instagram: initial.social?.instagram ?? "",
        facebook: initial.social?.facebook ?? "",
        twitter: initial.social?.twitter ?? "",
        tiktok: initial.social?.tiktok ?? "",
      },
    });
  }, [initial]);

  const setField =
    (field: keyof AgencyUpdateInput) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      // Normalizamos tax_id a dígitos (permitimos guiones al tipear, pero guardamos sin formatear)
      if (field === "tax_id") {
        const onlyNums = v.replace(/\D/g, "");
        setValues((prev) => ({ ...prev, tax_id: onlyNums }));
        if (errors.tax_id) setErrors((prev) => ({ ...prev, tax_id: "" }));
        return;
      }
      setValues((prev) => ({ ...prev, [field]: v }));
      if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
    };

  const setSocialField =
    (field: keyof AgencySocialInput) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setValues((prev) => ({
        ...prev,
        social: { ...(prev.social ?? {}), [field]: v },
      }));
    };

  function validate(current: AgencyUpdateInput): Errors {
    const e: Errors = {};
    if (!current.name.trim()) e.name = "Obligatorio";
    if (!current.legal_name.trim()) e.legal_name = "Obligatorio";

    const cuit = current.tax_id.trim();
    if (!cuit) e.tax_id = "Obligatorio";
    else if (!isValidCUIT(cuit)) e.tax_id = "CUIT inválido";

    if (!isValidEmail(current.email ?? "")) e.email = "Email inválido";
    if (!isValidUrl(current.website ?? ""))
      e.website = "Debe empezar con http(s)://";
    if (!isValidYMD(current.foundation_date ?? "")) {
      e.foundation_date = "Fecha inválida (YYYY-MM-DD)";
    }
    return e;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned: AgencyUpdateInput = {
      name: values.name.trim(),
      legal_name: values.legal_name.trim(),
      tax_id: values.tax_id.trim(),
      address: values.address?.trim() || null,
      phone: values.phone?.trim() || null,
      email: values.email?.trim() || null,
      website: values.website?.trim() || null,
      foundation_date: values.foundation_date?.trim()
        ? values.foundation_date
        : null,
      logo_url: values.logo_url?.trim() || null,
      social: {
        instagram: values.social?.instagram?.trim() || undefined,
        facebook: values.social?.facebook?.trim() || undefined,
        twitter: values.social?.twitter?.trim() || undefined,
        tiktok: values.social?.tiktok?.trim() || undefined,
      },
    };

    const hasSocial = Object.values(cleaned.social ?? {}).some(Boolean);
    if (!hasSocial) cleaned.social = null;

    const v = validate(cleaned);
    setErrors(v);
    if (Object.values(v).some(Boolean)) {
      // focus al primer error (tipado)
      const firstKey = (Object.keys(v) as Array<keyof Errors>).find((k) =>
        Boolean(v[k]),
      );
      if (firstKey) {
        const el = document.querySelector<HTMLInputElement>(
          `[name="${String(firstKey)}"]`,
        );
        el?.focus();
      }
      return;
    }

    await onSubmit(cleaned);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 gap-4 rounded-3xl border border-white/10 bg-white/10 p-6 shadow-md shadow-sky-950/10 backdrop-blur md:grid-cols-2"
      noValidate
    >
      {/* Nombre */}
      <div className="space-y-1">
        <label className="ml-1 block text-sm">
          Nombre <span className="text-red-600">*</span>
        </label>
        <input
          name="name"
          type="text"
          value={values.name}
          onChange={setField("name")}
          required
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "err-name" : undefined}
          className="w-full rounded-2xl border border-sky-950/10 bg-white/50 px-3 py-2 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
          placeholder="Mi Agencia SRL"
          disabled={isSaving}
        />
        {errors.name && (
          <p id="err-name" className="text-xs text-red-600">
            {errors.name}
          </p>
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
          value={values.legal_name}
          onChange={setField("legal_name")}
          required
          aria-invalid={!!errors.legal_name}
          aria-describedby={errors.legal_name ? "err-legal" : undefined}
          className="w-full rounded-2xl border border-sky-950/10 bg-white/50 px-3 py-2 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
          placeholder="Mi Agencia SRL"
          disabled={isSaving}
        />
        {errors.legal_name && (
          <p id="err-legal" className="text-xs text-red-600">
            {errors.legal_name}
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
          value={values.tax_id}
          onChange={setField("tax_id")}
          required
          aria-invalid={!!errors.tax_id}
          aria-describedby={errors.tax_id ? "err-cuit" : undefined}
          className="w-full rounded-2xl border border-sky-950/10 bg-white/50 px-3 py-2 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
          placeholder="20123456789"
          disabled={isSaving}
        />
        {errors.tax_id && (
          <p id="err-cuit" className="text-xs text-red-600">
            {errors.tax_id}
          </p>
        )}
      </div>

      {/* Teléfono */}
      <div className="space-y-1">
        <label className="ml-1 block text-sm">Teléfono</label>
        <input
          name="phone"
          type="tel"
          value={values.phone ?? ""}
          onChange={setField("phone")}
          className="w-full rounded-2xl border border-sky-950/10 bg-white/50 px-3 py-2 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
          placeholder="+54 11 1234-5678"
          disabled={isSaving}
        />
      </div>

      {/* Correo */}
      <div className="space-y-1">
        <label className="ml-1 block text-sm">Email</label>
        <input
          name="email"
          type="email"
          value={values.email ?? ""}
          onChange={setField("email")}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "err-email" : undefined}
          className="w-full rounded-2xl border border-sky-950/10 bg-white/50 px-3 py-2 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
          placeholder="contacto@agencia.com"
          disabled={isSaving}
        />
        {errors.email && (
          <p id="err-email" className="text-xs text-red-600">
            {errors.email}
          </p>
        )}
      </div>

      {/* Dirección */}
      <div className="space-y-1 md:col-span-2">
        <label className="ml-1 block text-sm">Dirección</label>
        <input
          name="address"
          type="text"
          value={values.address ?? ""}
          onChange={setField("address")}
          className="w-full rounded-2xl border border-sky-950/10 bg-white/50 px-3 py-2 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
          placeholder="Calle 123, Piso X, Ciudad"
          disabled={isSaving}
        />
      </div>

      {/* Sitio web */}
      <div className="space-y-1 md:col-span-1">
        <label className="ml-1 block text-sm">Sitio web</label>
        <input
          name="website"
          type="url"
          value={values.website ?? ""}
          onChange={setField("website")}
          aria-invalid={!!errors.website}
          aria-describedby={errors.website ? "err-web" : undefined}
          className="w-full rounded-2xl border border-sky-950/10 bg-white/50 px-3 py-2 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
          placeholder="https://tu-sitio.com"
          disabled={isSaving}
        />
        {errors.website && (
          <p id="err-web" className="text-xs text-red-600">
            {errors.website}
          </p>
        )}
      </div>

      {/* Redes sociales */}
      <div className="space-y-1 md:col-span-2">
        <p className="ml-1 block text-sm">Redes sociales</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-xs">
            Instagram
            <input
              name="instagram"
              type="text"
              value={values.social?.instagram ?? ""}
              onChange={setSocialField("instagram")}
              className="mt-1 w-full rounded-2xl border border-sky-950/10 bg-white/50 px-3 py-2 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
              placeholder="@miagencia"
              disabled={isSaving}
            />
          </label>
          <label className="text-xs">
            Facebook
            <input
              name="facebook"
              type="text"
              value={values.social?.facebook ?? ""}
              onChange={setSocialField("facebook")}
              className="mt-1 w-full rounded-2xl border border-sky-950/10 bg-white/50 px-3 py-2 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
              placeholder="facebook.com/miagencia"
              disabled={isSaving}
            />
          </label>
          <label className="text-xs">
            Twitter
            <input
              name="twitter"
              type="text"
              value={values.social?.twitter ?? ""}
              onChange={setSocialField("twitter")}
              className="mt-1 w-full rounded-2xl border border-sky-950/10 bg-white/50 px-3 py-2 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
              placeholder="@miagencia"
              disabled={isSaving}
            />
          </label>
          <label className="text-xs">
            TikTok
            <input
              name="tiktok"
              type="text"
              value={values.social?.tiktok ?? ""}
              onChange={setSocialField("tiktok")}
              className="mt-1 w-full rounded-2xl border border-sky-950/10 bg-white/50 px-3 py-2 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
              placeholder="@miagencia"
              disabled={isSaving}
            />
          </label>
        </div>
      </div>

      {/* Fundación */}
      <div className="space-y-1 md:col-span-1">
        <label className="ml-1 block text-sm">Fecha de fundación</label>
        <input
          name="foundation_date"
          type="date"
          value={values.foundation_date ?? ""}
          onChange={setField("foundation_date")}
          aria-invalid={!!errors.foundation_date}
          aria-describedby={errors.foundation_date ? "err-found" : undefined}
          className="w-full rounded-2xl border border-sky-950/10 bg-white/50 px-3 py-2 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
          disabled={isSaving}
        />
        {errors.foundation_date && (
          <p id="err-found" className="text-xs text-red-600">
            {errors.foundation_date}
          </p>
        )}
      </div>

      {/* Acciones */}
      <div className="mt-2 flex justify-end gap-2 md:col-span-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full bg-white/0 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/10 ring-1 ring-sky-950/10 transition-transform hover:scale-95 active:scale-90 dark:text-white dark:ring-white/10"
            disabled={isSaving}
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          className="rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white"
          disabled={isSaving}
          aria-busy={isSaving}
        >
          {isSaving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
