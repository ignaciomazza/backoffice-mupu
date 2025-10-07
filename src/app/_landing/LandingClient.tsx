// src/app/_landing/LandingClient.tsx
"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  type TooltipProps,
} from "recharts";

/* ===========================
 * Config
 * =========================== */
const WA_NUMBER = process.env.NEXT_PUBLIC_WA_NUMBER ?? "54911XXXXXXXX";
const WA_MSG = encodeURIComponent("Hola, quiero más info sobre Ofistur.");
const WA_URL = `https://wa.me/${WA_NUMBER}?text=${WA_MSG}`;

/* ===========================
 * Motion presets (más veloces y suaves)
 * =========================== */
const viewPreset = {
  initial: { opacity: 0, y: 8, scale: 0.995 },
  whileInView: { opacity: 1, y: 0, scale: 1 },
  viewport: { once: true, margin: "-15%" },
  transition: { duration: 0.3, ease: "easeOut" },
} as const;

const hoverPreset = {
  whileHover: { y: -4, scale: 1.01 },
  whileTap: { scale: 0.995 },
  transition: { type: "spring", stiffness: 320, damping: 22 },
} as const;

/* ===========================
 * Primitives (alineadas al resto del proyecto)
 * =========================== */
type BtnSize = "sm" | "md";
function ButtonPrimary({
  href,
  children,
  onClick,
  type = "button",
  className = "",
  size = "sm",
  variant,
}: {
  href?: string;
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  className?: string;
  size?: BtnSize;
  variant?: "emerald";
}) {
  const sizing =
    size === "sm" ? "px-4 py-2 text-sm" : "px-5 py-2.5 text-[15px]";
  const base =
    "rounded-full bg-sky-100 text-sky-950 " +
    "transition-all hover:scale-[0.98] active:scale-95 disabled:opacity-60 " +
    "focus:outline-none focus:ring-1 focus:ring-sky-950/40 " +
    "dark:bg-white/10 dark:text-white dark:backdrop-blur";
  const content = (
    <motion.span
      {...hoverPreset}
      className={`${base} ${sizing} ${className} ${variant === "emerald" ? "border border-emerald-300/50 bg-emerald-50/70 text-emerald-900 shadow-sm shadow-emerald-950/5" : "shadow-sm shadow-sky-950/20"}`}
    >
      {children}
    </motion.span>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }
  return (
    <button type={type} onClick={onClick}>
      {content}
    </button>
  );
}

function ButtonGhost({
  href,
  children,
  className = "",
  size = "sm",
}: {
  href?: string;
  children: React.ReactNode;
  className?: string;
  size?: BtnSize;
}) {
  const sizing =
    size === "sm" ? "px-4 py-2 text-sm" : "px-5 py-2.5 text-[15px]";
  const base =
    "rounded-full border border-white/10 bg-white/10 text-sky-950 " +
    "shadow-sm shadow-sky-950/10 transition-all hover:scale-[0.98] active:scale-95 " +
    "focus:outline-none focus:ring-1 focus:ring-sky-950/30 " +
    "dark:text-white dark:bg-white/10 dark:backdrop-blur";
  const content = (
    <motion.span {...hoverPreset} className={`${base} ${sizing} ${className}`}>
      {children}
    </motion.span>
  );
  if (href) return <a href={href}>{content}</a>;
  return <span>{content}</span>;
}

function Card({
  className = "",
  children,
  animated = true,
}: {
  className?: string;
  children: React.ReactNode;
  animated?: boolean;
}) {
  const classes =
    "rounded-3xl border border-white/10 bg-white/10 p-7 sm:p-8 text-sky-950 " +
    "shadow-md shadow-sky-950/10 backdrop-blur dark:text-white " +
    className;
  if (!animated) return <div className={classes}>{children}</div>;
  return (
    <motion.div className={classes} {...viewPreset} {...hoverPreset}>
      {children}
    </motion.div>
  );
}

/* ===== Chips con variantes (bordes de misma gama) ===== */
function Chip({
  children,
  variant = "sky",
}: {
  children: React.ReactNode;
  variant?: "sky" | "amber" | "emerald";
}) {
  const map = {
    sky: "border border-sky-300/80 bg-sky-100/80 text-sky-900",
    amber: "border border-amber-300/80 bg-amber-100/80 text-amber-900",
    emerald: "border border-emerald-300/50 bg-emerald-50/70 text-emerald-900",
  } as const;
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${map[variant]}`}
    >
      {children}
    </span>
  );
}

/* ===== Inputs con label flotante (glass) ===== */
function FloatingInput({
  label,
  name,
  type = "text",
  required,
  placeholder = " ",
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="peer w-full rounded-2xl border border-sky-950/10 bg-white/10 p-3 text-sky-950 outline-none backdrop-blur placeholder:text-transparent focus:border-sky-950/30 focus:ring-1 focus:ring-sky-950/30 dark:border-white/10 dark:bg-white/10 dark:text-white"
      />
      <label className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-lg bg-white/60 px-2 py-1 text-xs text-sky-950/80 transition-all duration-200 peer-placeholder-shown:top-1/2 peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:text-sky-950 dark:bg-white/10 dark:text-white/80">
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
}: {
  label: string;
  name: string;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <textarea
        name={name}
        rows={rows}
        placeholder={placeholder}
        className="peer w-full rounded-2xl border border-sky-950/10 bg-white/10 p-3 text-sky-950 outline-none backdrop-blur placeholder:text-transparent focus:border-sky-950/30 focus:ring-1 focus:ring-sky-950/30 dark:border-white/10 dark:bg-white/10 dark:text-white"
      />
      <label className="pointer-events-none absolute left-3 top-3 z-10 bg-white/60 px-1 text-xs text-sky-950/80 transition-all duration-200 peer-placeholder-shown:top-3 peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:text-sky-950 dark:bg-white/10 dark:text-white/80">
        {label}
      </label>
    </div>
  );
}

function SelectField({
  label,
  name,
  children,
  required,
}: {
  label: string;
  name: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="ml-1 text-xs font-medium text-sky-950/80 dark:text-white/80">
        {label}
      </span>
      <div className="relative">
        <select
          name={name}
          required={required}
          className="w-full cursor-pointer appearance-none rounded-2xl border border-sky-950/10 bg-white/10 p-3 text-sky-950 outline-none backdrop-blur focus:border-sky-950/30 focus:ring-1 focus:ring-sky-950/30 dark:border-white/10 dark:bg-white/10 dark:text-white"
          defaultValue=""
        >
          {children}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sky-950/60 dark:text-white/60">
          ▾
        </span>
      </div>
    </label>
  );
}

/* ===========================
 * Helpers de sección
 * =========================== */
function Section({
  id,
  title,
  eyebrow,
  children,
}: {
  id?: string;
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-5">
        <motion.header {...viewPreset}>
          {eyebrow && (
            <div className="mb-3 inline-flex rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium text-sky-950/80 backdrop-blur dark:text-white/80">
              {eyebrow}
            </div>
          )}
          <h2 className="text-2xl font-semibold text-sky-950 dark:text-white sm:text-3xl">
            {title}
          </h2>
        </motion.header>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

function FeatureCard({
  title,
  desc,
  icon,
}: {
  title: string;
  desc: string;
  icon: React.ReactNode;
}) {
  return (
    <motion.div
      className="rounded-3xl border border-white/10 bg-white/10 p-6 shadow-md shadow-sky-950/10 backdrop-blur"
      {...viewPreset}
      {...hoverPreset}
    >
      <div className="mb-4 inline-flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-full bg-sky-100 text-sky-950 shadow-sm shadow-sky-950/20 dark:bg-white/10 dark:text-white">
          {icon}
        </span>
        <h3 className="text-base font-semibold text-sky-950 dark:text-white">
          {title}
        </h3>
      </div>
      <p className="text-[15px] leading-relaxed text-sky-950/80 dark:text-white/80">
        {desc}
      </p>
    </motion.div>
  );
}

function GalleryCard({ title }: { title: string }) {
  return (
    <motion.div
      className="overflow-hidden rounded-3xl border border-white/10 bg-white/10 shadow-md shadow-sky-950/10 backdrop-blur"
      {...viewPreset}
      {...hoverPreset}
    >
      <div className="relative aspect-video w-full bg-gradient-to-b from-white/30 to-white/10" />
      <div className="px-5 py-4">
        <p className="text-sm font-medium text-sky-950 dark:text-white">
          {title}
        </p>
        <p className="text-xs text-sky-950/70 dark:text-white/70">
          Reemplazar por captura real
        </p>
      </div>
    </motion.div>
  );
}

function RoleCard({ title, bullets }: { title: string; bullets: string[] }) {
  return (
    <motion.div
      className="rounded-3xl border border-white/10 bg-white/10 p-6 shadow-md shadow-sky-950/10 backdrop-blur"
      {...viewPreset}
      {...hoverPreset}
    >
      <h3 className="text-base font-semibold text-sky-950 dark:text-white">
        {title}
      </h3>
      <ul className="mt-4 space-y-2 text-sm text-sky-950/80 dark:text-white/80">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sky-500" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

/* ===========================
 * Charts utils (SSR-safe) + Glass Tooltip
 * =========================== */
function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      className="rounded-3xl border border-white/10 bg-white/10 p-5 shadow-md shadow-sky-950/10 backdrop-blur"
      {...viewPreset}
      {...hoverPreset}
    >
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-sky-950 dark:text-white">
          {title}
        </p>
        {subtitle && (
          <span className="text-[11px] text-sky-950/70 dark:text-white/70">
            {subtitle}
          </span>
        )}
      </div>
      <div className="mt-3 h-40 w-full">{children}</div>
    </motion.div>
  );
}

function GlassTooltip(props: TooltipProps<number, string>) {
  const { active, label, payload } = props;
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-3 text-sky-950 shadow-md backdrop-blur dark:bg-sky-950/10 dark:text-white">
      {label && <p className="mb-1 text-xs opacity-70">{label}</p>}
      <div className="space-y-1">
        {payload.map((p, i) => (
          <p key={i} className="text-sm">
            <span className="font-medium">{p.name || p.dataKey}:</span>{" "}
            {p.value}
          </p>
        ))}
      </div>
    </div>
  );
}

/* ===========================
 * Landing
 * =========================== */
export default function LandingClient() {
  return (
    <>
      {/* Hero minimal con resaltado "marcatexto" ámbar */}
      <section className="relative overflow-hidden py-24 sm:py-40">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,#e0f2fe_0%,transparent_60%)]"
        />
        <div className="mx-auto max-w-6xl px-5">
          <Card className="max-w-4xl bg-white/20" animated={false}>
            <motion.h1
              className="text-4xl font-semibold leading-tight tracking-tight text-sky-950 dark:text-white sm:text-6xl"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              La gestión completa para{" "}
              <span className="relative inline-block">
                <span className="relative z-10">agencias de viajes</span>
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-1 h-3 rounded-sm bg-amber-200/70"
                />
              </span>
              , en un solo lugar.
            </motion.h1>

            <motion.p
              className="mt-6 max-w-2xl text-lg text-sky-950/80 dark:text-white/80"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: "easeOut", delay: 0.06 }}
            >
              Centralizá procesos, documentos y finanzas. Disponible en
              Argentina.
            </motion.p>

            <motion.div
              className="mt-8 flex flex-wrap items-center gap-2 sm:gap-3"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: "easeOut", delay: 0.12 }}
            >
              <ButtonPrimary variant="emerald" href={WA_URL} size="sm">
                Escribinos por WhatsApp
              </ButtonPrimary>
              <ButtonGhost href="#contacto" size="sm">
                Dejar mis datos
              </ButtonGhost>
            </motion.div>

            <div className="mt-7 flex flex-wrap items-center gap-2 text-xs">
              <Chip>AFIP</Chip>
              <Chip>Copias de seguridad</Chip>
              <Chip>Accesos por rol</Chip>
              <Chip>Soporte Tecnico</Chip>
            </div>
          </Card>
        </div>
      </section>

      {/* Pilares + Charts */}
      <Section id="producto" title="Qué resuelve" eyebrow="Producto">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <FeatureCard
            title="Operativa"
            desc="Reservas y servicios, cotizaciones, confirmaciones, calendario y recursos."
            icon={<IconCalendar className="size-5" aria-hidden />}
          />
          <FeatureCard
            title="Finanzas"
            desc="AFIP, recibos, notas de crédito y caja simple."
            icon={<IconInvoice className="size-5" aria-hidden />}
          />
          <FeatureCard
            title="Control"
            desc="Comisiones por equipo/vendedor, reportes, permisos."
            icon={<IconShield className="size-5" aria-hidden />}
          />
          <FeatureCard
            title="Productividad"
            desc="Bloques reutilizables para reducir errores y retrabajo."
            icon={<IconZap className="size-5" aria-hidden />}
          />
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <ChartAhorroTiempo />
          <ChartErrores />
          <ChartAdopcionSimple />
        </div>
      </Section>

      {/* Galería */}
      <Section title="Conocé la plataforma" eyebrow="Capturas">
        <p className="text-sm text-sky-950/80 dark:text-white/80">
          Reemplazaremos estas vistas por capturas reales (sin datos sensibles).
        </p>
        <div className="mt-7 grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
          {[
            "Generador de cotizaciones y confirmaciones (PDF)",
            "Reservas y Servicios",
            "Facturación / Recibos / Notas de Credito",
            "Calendario / Recursos",
            "Comisiones / Reportes",
            "Configuraciones",
          ].map((t) => (
            <GalleryCard key={t} title={t} />
          ))}
        </div>
      </Section>

      {/* Roles */}
      <Section id="roles" title="Valor por rol" eyebrow="Perfiles">
        <div className="grid gap-6 md:grid-cols-2">
          <RoleCard
            title="Dueño / Gerente"
            bullets={[
              "Visión por equipo",
              "Comisiones y caja claras",
              "Indicadores sin planillas",
            ]}
          />
          <RoleCard
            title="Administración"
            bullets={[
              "Facturación sin fricción",
              "Recibos/Notas de Credito ordenados",
              "Menos errores y retrabajo",
            ]}
          />
          <RoleCard
            title="Líder"
            bullets={[
              "Seguimiento de ventas",
              "Objetivos y pipeline simple",
              "Documentación prolija",
            ]}
          />
          <RoleCard
            title="Vendedor"
            bullets={[
              "Cotizar rápido",
              "Confirmar fácil",
              "Docs prolijos para enviar",
            ]}
          />
        </div>
      </Section>

      {/* Seguridad */}
      <Section
        id="seguridad"
        title="Seguridad e integraciones"
        eyebrow="Confianza"
      >
        <ul className="mt-3 grid list-disc gap-2 pl-6 text-sm text-sky-950/80 dark:text-white/80 sm:grid-cols-2">
          <li>Integración AFIP</li>
          <li>Copias de seguridad automáticas</li>
          <li>Cifrado en tránsito y en reposo</li>
          <li>Accesos por rol y registro de cambios</li>
        </ul>
      </Section>

      {/* FAQ con animación de desplegado */}
      <Section id="faq" title="Preguntas frecuentes" eyebrow="FAQ">
        <motion.div className="rounded-3xl border border-white/10 bg-white/10 p-1 shadow-md shadow-sky-950/10 backdrop-blur">
          {FAQ_ITEMS.map(([q, a], i) => (
            <FAQItem key={i} question={q} answer={a} />
          ))}
        </motion.div>
      </Section>

      {/* Contacto */}
      <Section id="contacto" title="Dejá tus datos" eyebrow="Contacto">
        <div className="grid gap-7 md:grid-cols-[1fr,1.2fr]">
          {/* CTA card */}
          <Card>
            <h3 className="text-lg font-semibold">¿Preferís hablar directo?</h3>
            <p className="mt-2 text-sm text-sky-950/80 dark:text-white/80">
              Te respondemos por WhatsApp. Contanos brevemente tu caso.
            </p>
            <div className="mt-4">
              <ButtonPrimary href={WA_URL} size="sm">
                Abrir WhatsApp
              </ButtonPrimary>
            </div>
            <div className="mt-6 text-xs text-sky-950/70 dark:text-white/70">
              También podés completar el formulario y te contactamos por
              WhatsApp y email.
            </div>
          </Card>

          {/* Lead form */}
          <LeadForm />
        </div>
      </Section>

      {/* Footer mini */}
      <footer className="border-t border-white/10 py-10 text-center text-sm text-sky-950/70 dark:text-white/70">
        © {new Date().getFullYear()} Ofistur ·{" "}
        <a href="/legal/terminos" className="underline">
          Términos
        </a>{" "}
        ·{" "}
        <a href="/legal/privacidad" className="underline">
          Privacidad
        </a>
      </footer>

      {/* Botón flotante WhatsApp */}
      <a
        href={WA_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Escribir por WhatsApp"
        className="fixed bottom-5 right-5 z-[60] inline-flex size-12 items-center justify-center rounded-full bg-sky-100 text-sky-950 shadow-lg shadow-sky-950/20 transition hover:scale-105 active:scale-95 dark:bg-white/10 dark:text-white"
      >
        <IconWhatsApp className="size-6" />
      </a>
    </>
  );
}

/* ===========================
 * FAQ item (animado)
 * =========================== */
const FAQ_ITEMS: [string, string][] = [
  [
    "¿Hacen la migración de datos?",
    "Para este lanzamiento no ofrecemos migración ni guías ni planillas. Cada equipo gestiona su propia migración.",
  ],
  [
    "¿Cuánto dura el onboarding?",
    "Depende del tamaño. En general, días (no semanas).",
  ],
  ["¿Qué soporte incluyen?", "Soporte en español por canales directos."],
  [
    "¿Cómo protegen mis datos?",
    "Cifrado, copias de seguridad y control de acceso por roles.",
  ],
  ["¿Puedo cancelar cuando quiera?", "Sí. Sin períodos mínimos."],
];

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/10 first:rounded-t-3xl last:rounded-b-3xl">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sky-950 dark:text-white"
      >
        <span className="font-medium">{question}</span>
        <span
          className={`rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-900 transition dark:bg-white/10 dark:text-white/80 ${open ? "rotate-45" : ""}`}
        >
          +
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden px-5"
          >
            <p className="pb-4 text-sm text-sky-950/80 dark:text-white/80">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ===========================
 * Form
 * =========================== */
function LeadForm() {
  const [sent, setSent] = useState<null | "ok" | "err">(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setSent(null);
    try {
      // TODO: POST real a /api/leads
      await new Promise((r) => setTimeout(r, 700));
      setSent("ok");
      (e.currentTarget as HTMLFormElement).reset();
    } catch {
      setSent("err");
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.form
      onSubmit={onSubmit}
      className="rounded-3xl border border-white/10 bg-white/10 p-7 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white"
      {...viewPreset}
    >
      <div className="grid gap-5 md:grid-cols-2">
        <FloatingInput label="Nombre y apellido *" name="name" required />
        <FloatingInput label="Agencia / Operador *" name="agency" required />
        <SelectField label="Rol *" name="role" required>
          <option value="" disabled>
            Seleccionar…
          </option>
          <option>Dueño/Gerente</option>
          <option>Administración</option>
          <option>Líder</option>
          <option>Vendedor</option>
        </SelectField>
        <SelectField label="Tamaño" name="size">
          <option value="" disabled>
            Seleccionar…
          </option>
          <option>Freelancer</option>
          <option>2–5</option>
          <option>6–15</option>
          <option>16–30</option>
          <option>30+</option>
        </SelectField>
        <FloatingInput label="País / Ciudad" name="location" />
        <FloatingInput label="Email *" name="email" type="email" required />
        <FloatingInput label="WhatsApp (opcional)" name="whatsapp" />
        <div className="md:col-span-2">
          <FloatingTextarea
            label="Mensaje (opcional)"
            name="message"
            rows={4}
          />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <ButtonPrimary type="submit" size="sm" className="min-w-[120px]">
          {loading ? "Enviando…" : "Enviar"}
        </ButtonPrimary>
        <ButtonGhost href={WA_URL} size="sm">
          WhatsApp
        </ButtonGhost>
        <p className="text-xs text-sky-950/70 dark:text-white/70">
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
      </div>

      {sent === "ok" && (
        <motion.p
          className="mt-3 text-sm text-emerald-700 dark:text-emerald-300"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
        >
          ¡Gracias! Te vamos a escribir por WhatsApp y email.
        </motion.p>
      )}
      {sent === "err" && (
        <motion.p
          className="mt-3 text-sm text-red-600 dark:text-red-300"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
        >
          Hubo un error. Probá de nuevo o escribinos por WhatsApp.
        </motion.p>
      )}
    </motion.form>
  );
}

/* ===========================
 * Charts (con tooltips glass)
 * =========================== */
function Skeleton() {
  return <div className="size-full animate-pulse rounded-xl bg-white/20" />;
}

function ChartAhorroTiempo() {
  const mounted = useMounted();
  const data = [
    { m: "Ene", v: 100 },
    { m: "Feb", v: 96 },
    { m: "Mar", v: 88 },
    { m: "Abr", v: 80 },
    { m: "May", v: 72 },
    { m: "Jun", v: 62 },
  ];
  return (
    <ChartCard
      title="Ahorro de tiempo"
      subtitle="–38% en 6 meses (ilustrativo)"
    >
      {mounted ? (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.45} />
                <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.08} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#e5eef7" />
            <XAxis dataKey="m" tickLine={false} axisLine={false} />
            <YAxis hide />
            <Tooltip content={<GlassTooltip />} />
            <Area
              type="monotone"
              dataKey="v"
              name="Tiempo"
              stroke="#0ea5e9"
              fill="url(#g1)"
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <Skeleton />
      )}
    </ChartCard>
  );
}

function ChartErrores() {
  const mounted = useMounted();
  const data = [
    { m: "Ene", err: 22 },
    { m: "Feb", err: 18 },
    { m: "Mar", err: 15 },
    { m: "Abr", err: 12 },
    { m: "May", err: 10 },
    { m: "Jun", err: 8 },
  ];
  return (
    <ChartCard title="Errores de facturación" subtitle="–62% (ilustrativo)">
      {mounted ? (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid vertical={false} stroke="#e5eef7" />
            <XAxis dataKey="m" tickLine={false} axisLine={false} />
            <YAxis hide />
            <Tooltip content={<GlassTooltip />} />
            <Bar
              dataKey="err"
              name="Errores"
              radius={[8, 8, 0, 0]}
              fill="#38bdf8"
            />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <Skeleton />
      )}
    </ChartCard>
  );
}

function ChartAdopcionSimple() {
  const mounted = useMounted();
  const pct = 90;
  const pie = [
    { name: "Usando", value: pct },
    { name: "Pendiente", value: 100 - pct },
  ];
  const colors = ["#0ea5e9", "#e2e8f0"];

  return (
    <ChartCard title="Adopción del equipo" subtitle="90 días (ilustrativo)">
      {mounted ? (
        <div className="relative size-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip content={<GlassTooltip />} />
              <Pie
                data={pie}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={64}
                startAngle={90}
                endAngle={-270}
                stroke="none"
              >
                {pie.map((_, i) => (
                  <Cell key={i} fill={colors[i]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="text-center">
              <div className="text-2xl font-semibold text-sky-950 dark:text-white">
                {pct}%
              </div>
              <div className="text-[11px] text-sky-950/70 dark:text-white/70">
                equipos usando
              </div>
            </div>
          </div>
        </div>
      ) : (
        <Skeleton />
      )}
    </ChartCard>
  );
}

/* ===========================
 * Iconos inline
 * =========================== */
function IconCalendar(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      {...props}
    >
      <path d="M8 2v3M16 2v3M3 10h18M5 6h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
    </svg>
  );
}
function IconInvoice(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      {...props}
    >
      <path d="M7 3h7l4 4v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M14 3v4h4M8 13h8M8 17h6M8 9h3" />
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
function IconZap(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      {...props}
    >
      <path d="M13 2L3 14h7l-1 8 11-14h-7l1-6z" />
    </svg>
  );
}
function IconWhatsApp(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" {...props}>
      <path d="M19.11 17.18c-.28-.14-1.64-.81-1.89-.9-.26-.1-.45-.14-.64.14-.19.28-.73.9-.9 1.09-.17.19-.33.21-.61.07-.28-.14-1.18-.43-2.25-1.37-.83-.74-1.39-1.65-1.56-1.93-.17-.28-.02-.43.13-.57.13-.13.28-.33.42-.5.14-.17.19-.28.28-.47.09-.19.05-.36-.02-.5-.07-.14-.64-1.54-.87-2.11-.23-.55-.47-.47-.64-.47-.17 0-.36-.02-.55-.02s-.5.07-.76.36c-.26.28-.99.97-.99 2.37 0 1.4 1.02 2.75 1.17 2.94.14.19 2 3.05 4.84 4.27.68.29 1.2.46 1.61.59.68.21 1.31.18 1.8.11.55-.08 1.64-.67 1.87-1.34.23-.67.23-1.24.16-1.36-.07-.11-.25-.18-.53-.32z" />
      <path d="M26.49 5.51C23.7 2.73 20.02 1.2 16.08 1.2 8.2 1.2 1.86 7.54 1.86 15.42c0 2.51.66 4.95 1.92 7.1L1.2 30.8l8.5-2.27c2.06 1.12 4.39 1.7 6.77 1.7h.01c7.88 0 14.22-6.34 14.22-14.22 0-3.94-1.53-7.62-4.21-10.5zm-10.21 22.6h-.01c-2.16 0-4.27-.58-6.13-1.67l-.44-.26-5.05 1.35 1.35-4.92-.29-.5a12.7 12.7 0 01-1.86-6.64c0-7.02 5.71-12.73 12.73-12.73 3.4 0 6.6 1.32 9 3.72a12.65 12.65 0 013.72 9c0 7.03-5.71 12.73-12.72 12.73z" />
    </svg>
  );
}
