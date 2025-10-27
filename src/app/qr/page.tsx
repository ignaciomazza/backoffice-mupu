// src/app/qr/page.tsx
/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import Spinner from "@/components/Spinner";
import { authFetch } from "@/utils/authFetch";

/* ===========================
 * Config
 * =========================== */
const WA_NUMBER = process.env.NEXT_PUBLIC_WA_NUMBER ?? "54911XXXXXXXX";
const WA_MSG = encodeURIComponent("Hola, quiero más info sobre Ofistur.");
const WA_URL = `https://wa.me/${WA_NUMBER}?text=${WA_MSG}`;

/* ===========================
 * Pricing helpers (versión simple)
 * =========================== */

type PlanKey = "basico" | "medio" | "pro";

const PLAN_DATA: Record<
  PlanKey,
  { label: string; base: number; short: string }
> = {
  basico: {
    label: "Básico",
    base: 20,
    short: "Facturación, vencimientos, recibos",
  },
  medio: {
    label: "Medio",
    base: 40,
    short: "Calendario, gastos, comisiones",
  },
  pro: {
    label: "Pro",
    base: 50,
    short: "Admin agencia, asesoría",
  },
};

// Usuarios extra (igual que landing):
// - hasta 3 usuarios: incluido
// - 4 a 10: +USD 5 c/u
// - 11+:    +USD 10 c/u
function calcExtraUsersCost(users: number): number {
  if (users <= 3) return 0;
  if (users <= 10) {
    return (users - 3) * 5;
  }
  // >10
  // hasta 10 => 7 * 5 = 35
  // resto => 10 c/u
  return 35 + (users - 10) * 10;
}

// Infraestructura / Nube (igual que landing):
// 1–3 = 0
// 4–7 = 20
// 8–12 = 30
// 13+ = 30 + 10 c/u extra
function calcCloudCost(users: number): number {
  if (users <= 3) return 0;
  if (users <= 7) return 20;
  if (users <= 12) return 30;
  return 30 + (users - 12) * 10;
}

/* ===========================
 * UI Primitives
 * =========================== */

function ButtonPrimary({
  href,
  children,
  onClick,
  type = "button",
  className = "",
  disabled,
}: {
  href?: string;
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  className?: string;
  disabled?: boolean;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full border border-sky-300/50 bg-sky-50 px-4 py-2 text-[15px] font-medium text-sky-950 shadow-sky-950/10 shadow-sm transition-all hover:scale-[0.98] active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-sky-700/30";
  const content = <span className={`${base} ${className}`}>{children}</span>;
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={disabled}
      >
        {content}
      </a>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled}>
      {content}
    </button>
  );
}

function ButtonWhatsApp({
  href,
  children,
  className = "",
  disabled,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full border border-emerald-300/50 bg-emerald-50 px-4 py-2 text-[15px] font-medium text-emerald-950  transition-all hover:scale-[0.98] active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-emerald-700/30";
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-disabled={disabled}
      className={`${base} ${className}`}
    >
      <IconWhatsApp className="size-5" />
      <span>{children}</span>
    </a>
  );
}

/* ===== Inputs con label flotante ===== */
function FloatingInput({
  label,
  name,
  type = "text",
  required,
  placeholder = " ",
  disabled = false,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <input
        name={name}
        type={type}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        className="peer w-full rounded-2xl border border-sky-950/10 bg-white/10 p-4 text-base text-sky-950 outline-none backdrop-blur placeholder:text-transparent focus:border-sky-950/30 focus:ring-1 focus:ring-sky-950/30 disabled:cursor-not-allowed disabled:opacity-60"
      />
      <label
        className={[
          "pointer-events-none absolute left-3 z-10 rounded-lg px-2 py-1 text-[12px] font-medium text-sky-950/80 transition-all duration-200",
          "top-0 -translate-y-1/2 bg-white/60",
          "peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:bg-white/0 peer-placeholder-shown:text-sky-950/50",
          "peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:bg-white/60 peer-focus:text-sky-950",
        ].join(" ")}
      >
        {label}
      </label>
    </div>
  );
}

function FloatingTextarea({
  label,
  name,
  rows = 4,
  placeholder = " ",
  disabled = false,
}: {
  label: string;
  name: string;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <textarea
        name={name}
        rows={rows}
        placeholder={placeholder}
        disabled={disabled}
        className="peer w-full rounded-2xl border border-sky-950/10 bg-white/10 p-4 text-base text-sky-950 outline-none backdrop-blur placeholder:text-transparent focus:border-sky-950/30 focus:ring-1 focus:ring-sky-950/30 disabled:cursor-not-allowed disabled:opacity-60"
      />
      <label
        className={[
          "pointer-events-none absolute left-3 z-10 rounded-lg px-2 py-1 text-[12px] font-medium text-sky-950/80 transition-all duration-200",
          "top-0 -translate-y-1/2 bg-white/60",
          "peer-placeholder-shown:top-3 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:bg-white/0 peer-placeholder-shown:text-sky-950/50",
          "peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:bg-white/60 peer-focus:text-sky-950",
        ].join(" ")}
      >
        {label}
      </label>
    </div>
  );
}

function SelectField({
  label,
  name,
  required,
  disabled = false,
  children,
}: {
  label: string;
  name: string;
  required?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="ml-1 text-[12px] font-medium text-sky-950/80">
        {label}
      </span>
      <div className="relative">
        <select
          name={name}
          required={required}
          disabled={disabled}
          defaultValue=""
          className="relative z-[1] w-full cursor-pointer appearance-none rounded-2xl border border-sky-950/10 bg-white/10 p-4 text-base text-sky-950 outline-none backdrop-blur focus:border-sky-950/30 focus:ring-1 focus:ring-sky-950/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {children}
        </select>
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sky-950/60">
          ▾
        </span>
      </div>
    </div>
  );
}

/* ===========================
 * Mini chips de beneficio
 * =========================== */
function BenefitChip({
  color,
  icon,
  title,
  desc,
}: {
  color: "sky" | "emerald";
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  const map = {
    sky: "border border-sky-300/80 bg-sky-100/80 text-sky-900 shadow-sky-950/10",
    emerald:
      "border border-emerald-300/50 bg-emerald-50/70 text-emerald-900 shadow-emerald-950/10",
  } as const;

  return (
    <div
      className={`flex min-w-0 flex-1 items-start gap-3 rounded-2xl px-4 py-3 text-left text-[13px] leading-snug shadow-sm ${map[color]}`}
    >
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-white/50 text-current shadow-sm shadow-black/10">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <p className="text-[12px] opacity-80">{desc}</p>
      </div>
    </div>
  );
}

/* ===========================
 * Sección cotización rápida (UI compacta)
 * =========================== */
function QuickQuoteBlock({
  plan,
  setPlan,
  users,
  setUsers,
}: {
  plan: PlanKey;
  setPlan: (p: PlanKey) => void;
  users: number;
  setUsers: (n: number) => void;
}) {
  const { label, base } = PLAN_DATA[plan];
  const extraUsers = calcExtraUsersCost(users);
  const cloud = calcCloudCost(users);
  const total = base + extraUsers + cloud;

  return (
    <fieldset>
      <legend className="py-4 text-xs font-medium text-sky-950">
        Cotización rápida (opcional)
      </legend>

      {/* Plan selector */}
      <div className="mb-4">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="mb-1 px-1 text-[12px] font-medium text-sky-950/80">
            Plan
          </span>
          <span className="text-[11px] text-sky-950/50">
            {label}: USD {base} + IVA /mes
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {(Object.keys(PLAN_DATA) as PlanKey[]).map((pKey) => {
            const active = plan === pKey;
            const data = PLAN_DATA[pKey];
            return (
              <button
                key={pKey}
                type="button"
                onClick={() => setPlan(pKey)}
                className={[
                  "flex min-w-[90px] flex-col items-start rounded-xl border px-3 py-2 text-left text-[12px] leading-tight shadow-sm transition-all",
                  active
                    ? "border-sky-400/50 bg-sky-100 text-sky-950 shadow-sky-950/20 ring-1 ring-sky-400/40"
                    : "border-white/20 bg-white/40 text-sky-950/70 shadow-sky-950/10 hover:scale-[0.99]",
                ].join(" ")}
              >
                <span className="font-semibold">{data.label}</span>
                <span className="text-[11px] opacity-70">
                  USD {data.base} + IVA
                </span>
                <span className="mt-1 line-clamp-2 text-[10px] opacity-60">
                  {data.short}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Users selector */}
      <div className="my-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12px] font-medium text-sky-950/80">
            Usuarios totales
          </span>
          <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-sky-950 shadow-sm shadow-sky-950/10 ring-1 ring-sky-900/10">
            {users} {users === 1 ? "usuario" : "usuarios"}
          </span>
        </div>

        <input
          id="usersRange"
          type="range"
          min={1}
          max={20}
          value={users}
          onChange={(e) => setUsers(parseInt(e.target.value, 10))}
          className="my-1 w-full cursor-pointer accent-sky-600/40"
        />

        <div className="my-2 flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={20}
            value={users}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!Number.isNaN(val)) {
                const clamped = Math.min(20, Math.max(1, val));
                setUsers(clamped);
              }
            }}
            className="w-16 rounded-xl border border-sky-950/10 bg-white/70 p-2 text-center text-sm font-semibold text-sky-950 shadow-inner shadow-sky-950/10 outline-none backdrop-blur-sm focus:border-sky-950/30 focus:ring-1 focus:ring-sky-950/30"
          />
          <span className="text-[11px] text-sky-950/60">
            Incluye escritorio y acceso móvil.
          </span>
        </div>
      </div>

      {/* Total block */}
      <div className="rounded-xl border border-white/20 bg-white/60 p-3 text-right text-sky-950 shadow-inner shadow-sky-950/5">
        <div className="text-sm font-semibold">
          Estimado aprox: USD {total.toFixed(2)} / mes
        </div>
        <div className="text-[11px] text-sky-950/60">
          + IVA. Sólo referencia. Puede variar.
        </div>
      </div>
    </fieldset>
  );
}

/* ===========================
 * Formulario rápido
 * =========================== */

function QuickLeadForm() {
  const [sent, setSent] = useState<null | "ok" | "err">(null);
  const [loading, setLoading] = useState(false);

  // cotizador local
  const [plan, setPlan] = useState<PlanKey>("basico");
  const [users, setUsers] = useState<number>(3);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setSent(null);

    const formEl = e.currentTarget;
    const fd = new FormData(formEl);

    const name = String(fd.get("name") ?? "");
    const agency = String(fd.get("agency") ?? "");
    const role = String(fd.get("role") ?? "");
    const email = String(fd.get("email") ?? "");
    const whatsapp = String(fd.get("whatsapp") ?? "");
    const plainMsg = String(fd.get("message") ?? "").trim();
    const refCode = String(fd.get("ref") ?? "").trim();

    // calculamos la estimación actual
    const base = PLAN_DATA[plan].base;
    const extra = calcExtraUsersCost(users);
    const cloud = calcCloudCost(users);
    const totalEst = base + extra + cloud;

    // armamos metadata para el mensaje final que vamos a guardar en la DB
    // (similar a cómo hacíamos [REF:...])
    // Ej:
    // [PLAN:Básico USUARIOS:5 EST_USD:55.00]
    // [REF:Juan]
    const metaPlan = `[PLAN:${PLAN_DATA[plan].label} USUARIOS:${users} EST_USD:${totalEst.toFixed(
      2,
    )}]`;

    const metaRef = refCode ? `[REF:${refCode}]` : "";

    const message = [plainMsg, metaPlan, metaRef]
      .filter((x) => x && x.length > 0)
      .join(" ")
      .trim();

    // payload para /api/leads (endpoint público que ya usás)
    const payload = {
      name,
      agency,
      role,
      size: "", // no lo pedimos acá
      location: "",
      email,
      whatsapp,
      message, // <-- incluye plan, usuarios, estimación y código de referido
    };

    try {
      const res = await authFetch(
        "/api/leads",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
        null, // público
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(
          (errJson as { error?: string }).error || "Error al enviar",
        );
      }

      // éxito
      setSent("ok");
      formEl.reset();
    } catch (err) {
      console.error(err);
      setSent("err");
    } finally {
      setLoading(false);
    }
  }

  // Pantalla "enviado"
  if (sent === "ok") {
    return (
      <div className="rounded-3xl border border-emerald-300/50 bg-emerald-50/70 p-6 text-emerald-900 shadow-md shadow-emerald-950/10 backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="mt-1 rounded-full bg-emerald-600/10 p-2 text-emerald-700 shadow-sm shadow-emerald-900/10">
            <IconCheckCircle className="size-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-semibold leading-tight">
              ¡Listo! Ya tengo tus datos 🙌
            </h3>
            <p className="mt-2 text-sm text-emerald-900/80">
              Te vamos a escribir por WhatsApp o email.
            </p>

            <div className="mt-5 flex flex-col items-start gap-3">
              <ButtonWhatsApp href={WA_URL} className="min-w-[170px]">
                Hablar ahora
              </ButtonWhatsApp>
              <p className="text-[11px] leading-snug text-emerald-900/70">
                Es contacto directo, no bot.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Form normal
  return (
    <form
      onSubmit={onSubmit}
      className="relative rounded-3xl border border-white/10 bg-white/10 p-5 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur md:p-6"
      noValidate
    >
      {/* overlay cargando */}
      {loading && (
        <div className="absolute inset-0 z-20 grid place-items-center rounded-3xl bg-white/50 backdrop-blur-sm">
          <Spinner />
        </div>
      )}

      <div
        className={`grid gap-4 ${loading ? "pointer-events-none opacity-60" : ""}`}
      >
        {/* Nombre */}
        <div>
          <FloatingInput
            label="Nombre y apellido *"
            name="name"
            required
            disabled={loading}
          />
        </div>

        {/* Agencia */}
        <div>
          <FloatingInput
            label="Agencia / Operador *"
            name="agency"
            required
            disabled={loading}
          />
          <p className="mt-1 text-[11px] text-sky-950/50">
            Si sos freelance poné tu nombre comercial.
          </p>
        </div>

        {/* Rol */}
        <div>
          <SelectField label="Tu rol *" name="role" required disabled={loading}>
            <option value="" disabled>
              Seleccionar…
            </option>
            <option>Dueño/Gerente</option>
            <option>Administración</option>
            <option>Líder</option>
            <option>Vendedor</option>
          </SelectField>
        </div>

        {/* WhatsApp */}
        <div>
          <FloatingInput
            label="WhatsApp *"
            name="whatsapp"
            disabled={loading}
            required
          />
          <p className="mt-1 text-[11px] text-sky-950/50">
            Para coordinar rápido.
          </p>
        </div>

        {/* Email */}
        <div>
          <FloatingInput
            label="Email *"
            name="email"
            type="email"
            required
            disabled={loading}
          />
        </div>

        {/* Cotizador simple */}
        <QuickQuoteBlock
          plan={plan}
          setPlan={setPlan}
          users={users}
          setUsers={setUsers}
        />

        {/* Código referidos */}
        <div>
          <FloatingInput
            label="Código de referido (si te lo dieron)"
            name="ref"
            disabled={loading}
          />
          <p className="mt-1 text-[11px] text-sky-950/50">
            Ej: “Stand FIT”, “Juan”, “Grupo X”.
          </p>
        </div>

        {/* Mensaje libre */}
        <div>
          <FloatingTextarea
            label="Notas / interés (opcional)"
            name="message"
            rows={3}
            disabled={loading}
          />
        </div>
      </div>

      <div
        className={`mt-6 flex flex-wrap items-center gap-3 ${loading ? "pointer-events-none opacity-60" : ""}`}
      >
        <ButtonPrimary
          type="submit"
          className="min-w-[160px]"
          disabled={loading}
        >
          {loading ? "Enviando…" : "Enviar mis datos"}
        </ButtonPrimary>

        <ButtonWhatsApp href={WA_URL} className="min-w-[160px]">
          WhatsApp directo
        </ButtonWhatsApp>
      </div>

      {sent === "err" && (
        <p className="mt-3 text-sm text-red-600">
          Hubo un problema. Probá de nuevo o escribinos por WhatsApp.
        </p>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-sky-950/70">
        Al enviar aceptás nuestras{" "}
        <a className="underline" href="/legal/terminos">
          Condiciones
        </a>{" "}
        y{" "}
        <a className="underline" href="/legal/privacidad">
          Privacidad
        </a>
        .
      </p>
    </form>
  );
}

/* ===========================
 * Página QR (para stands/eventos)
 * =========================== */

export default function QRContactPage() {
  return (
    <main className="min-h-dvh bg-[radial-gradient(60%_50%_at_50%_0%,#e0f2fe_0%,transparent_60%)] py-10">
      <div className="mx-auto flex max-w-xl flex-col gap-6 px-4">
        {/* Branding + pitch corto */}
        <header className="space-y-5 text-center text-sky-950">
          {/* Logo / marca */}
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[12px] font-medium text-sky-950/80 shadow-sm shadow-sky-950/10 backdrop-blur">
            <img src="/logo.png" alt="" className="size-6" />
            <span className="font-semibold text-sky-950">Ofistur</span>
            <span className="text-sky-950/60">Demo / Info</span>
          </div>

          <div>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-sky-950">
              ¿Querés que te contactemos?
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-sky-950/70">
              Dejá tus datos, elegí plan y cuántas personas lo usarían, y un
              asesor te escribe por WhatsApp o email.
              <br />
              Sin compromiso.
            </p>
          </div>

          {/* Beneficios destacados */}
          <div className="grid gap-3 sm:grid-cols-2">
            <BenefitChip
              color="sky"
              icon={<IconShield className="size-4" />}
              title="Todo en un solo lugar"
              desc="Reservas, cobros, facturas, comisiones."
            />
            <BenefitChip
              color="emerald"
              icon={<IconCheckCircle className="size-4" />}
              title="Control real"
              desc="Pagos a operadores y caja clara."
            />
          </div>
        </header>

        {/* Formulario */}
        <QuickLeadForm />

        {/* Footer mini */}
        <footer className="space-y-2 text-center">
          <p className="text-[11px] text-sky-950/60">
            ¿Preferís hablar ya mismo?{" "}
            <a
              href={WA_URL}
              className="underline decoration-emerald-400/70 underline-offset-4"
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp directo
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}

/* ===========================
 * Iconos inline
 * =========================== */
function IconWhatsApp(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 464 488"
      fill="none"
      {...props}
    >
      <path
        fill="#064e3b"
        d="M462 228q0 93-66 159t-160 66q-56 0-109-28L2 464l40-120q-32-54-32-116q0-93 66-158.5T236 4t160 65.5T462 228zM236 39q-79 0-134.5 55.5T46 228q0 62 36 111l-24 70l74-23q49 31 104 31q79 0 134.5-55.5T426 228T370.5 94.5T236 39zm114 241q-1-1-10-7q-3-1-19-8.5t-19-8.5q-9-3-13 2q-1 3-4.5 7.5t-7.5 9t-5 5.5q-4 6-12 1q-34-17-45-27q-7-7-13.5-15t-12-15t-5.5-8q-3-7 3-11q4-6 8-10l6-9q2-5-1-10q-4-13-17-41q-3-9-12-9h-11q-9 0-15 7q-19 19-19 45q0 24 22 57l2 3q2 3 4.5 6.5t7 9t9 10.5t10.5 11.5t13 12.5t14.5 11.5t16.5 10t18 8.5q16 6 27.5 10t18 5t9.5 1t7-1t5-1q9-1 21.5-9t15.5-17q8-21 3-26z"
      />
    </svg>
  );
}

function IconCheckCircle(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      strokeWidth={1.8}
      stroke="currentColor"
      fill="none"
      {...props}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 12.5l2.5 2.5L16 9"
      />
    </svg>
  );
}

function IconShield(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      {...props}
    >
      <path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3Z" />
      <path d="M9.5 12.5l2 2 3-3" />
    </svg>
  );
}
