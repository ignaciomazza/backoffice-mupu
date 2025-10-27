// src/app/_landing/LandingClient.tsx
"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Area,
  AreaChart,
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
import Spinner from "@/components/Spinner";
import { authFetch } from "@/utils/authFetch";

/* ===========================
 * Config
 * =========================== */
const WA_NUMBER = process.env.NEXT_PUBLIC_WA_NUMBER ?? "54911XXXXXXXX";
const WA_MSG = encodeURIComponent("Hola, quiero más info sobre Ofistur.");
const WA_URL = `https://wa.me/${WA_NUMBER}?text=${WA_MSG}`;

/* ===========================
 * Motion presets
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
 * Primitives
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
  disabled,
}: {
  href?: string;
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  className?: string;
  size?: BtnSize;
  variant?: "emerald";
  disabled?: boolean;
}) {
  const sizing =
    size === "sm" ? "px-4 py-2 text-sm" : "px-5 py-2.5 text-[15px]";
  const base =
    "rounded-full transition-all hover:scale-[0.98] active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none";
  const content = (
    <motion.span
      {...hoverPreset}
      className={[
        base,
        sizing,
        className,
        variant === "emerald"
          ? "border border-emerald-300/50 bg-emerald-50/70 text-emerald-900 shadow-sm shadow-emerald-950/5"
          : "bg-sky-100 text-sky-950 shadow-sm shadow-sky-950/20 focus:ring-1 focus:ring-sky-950/40",
      ].join(" ")}
    >
      {children}
    </motion.span>
  );
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
    "rounded-full border border-white/10 bg-white/10 text-sky-950 shadow-sm shadow-sky-950/10 transition-all hover:scale-[0.98] active:scale-95 focus:outline-none focus:ring-1 focus:ring-sky-950/30";
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
    "min-w-0 rounded-3xl border border-white/10 bg-white/10 p-6 sm:p-8 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur " +
    className;
  if (!animated) return <div className={classes}>{children}</div>;
  return (
    <motion.div className={classes} {...viewPreset} {...hoverPreset}>
      {children}
    </motion.div>
  );
}

/* ===== Chips con variantes ===== */
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

/* ===== Inputs con label flotante =====
   Ajuste: el label queda "arriba" por defecto.
   Sólo baja cuando el campo está vacío (placeholder-shown).
   Si hay valor (o foco), vuelve y se queda arriba.
*/
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
        className="peer w-full rounded-2xl border border-sky-950/10 bg-white/10 p-3 text-sky-950 outline-none backdrop-blur placeholder:text-transparent focus:border-sky-950/30 focus:ring-1 focus:ring-sky-950/30 disabled:cursor-not-allowed disabled:opacity-60"
      />
      <label
        className={[
          "pointer-events-none absolute left-3 z-10 rounded-lg px-2 py-1 text-[11px] font-medium text-sky-950/80 transition-all duration-200",
          // Estado "flotante" (default): va arriba del input
          "top-0 -translate-y-1/2 bg-white/60",
          // Si el input está vacío (placeholder-shown): baja al centro
          "peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:bg-white/0 peer-placeholder-shown:text-sky-950/50",
          // Con foco siempre vuelve flotante
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
        className="peer w-full rounded-2xl border border-sky-950/10 bg-white/10 p-3 text-sky-950 outline-none backdrop-blur placeholder:text-transparent focus:border-sky-950/30 focus:ring-1 focus:ring-sky-950/30 disabled:cursor-not-allowed disabled:opacity-60"
      />
      <label
        className={[
          "pointer-events-none absolute left-3 z-10 rounded-lg px-2 py-1 text-[11px] font-medium text-sky-950/80 transition-all duration-200",
          // flotante por defecto, bien arriba del textarea
          "top-0 -translate-y-1/2 bg-white/60",
          // cuando está vacío: que baje un poco dentro del textarea
          "peer-placeholder-shown:top-3 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:bg-white/0 peer-placeholder-shown:text-sky-950/50",
          // en foco vuelve flotante arriba
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
  children,
  required,
  disabled = false,
}: {
  label: string;
  name: string;
  children: React.ReactNode;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="ml-1 text-xs font-medium text-sky-950/80">{label}</span>
      <div className="relative">
        <select
          name={name}
          required={required}
          disabled={disabled}
          className="relative z-[1] w-full cursor-pointer appearance-none rounded-2xl border border-sky-950/10 bg-white/10 p-3 text-sky-950 outline-none backdrop-blur focus:border-sky-950/30 focus:ring-1 focus:ring-sky-950/30 disabled:cursor-not-allowed disabled:opacity-60"
          defaultValue=""
        >
          {children}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sky-950/60">
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
      <div className="mx-auto max-w-7xl px-1 md:px-8">
        <motion.header {...viewPreset}>
          {eyebrow && (
            <div className="mb-3 inline-flex rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium text-sky-950/80 backdrop-blur">
              {eyebrow}
            </div>
          )}
          <h2 className="text-2xl font-semibold text-sky-950 sm:text-3xl">
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
        <span className="grid size-9 place-items-center rounded-full bg-sky-100 text-sky-950 shadow-sm shadow-sky-950/20">
          {icon}
        </span>
        <h3 className="text-base font-semibold text-sky-950">{title}</h3>
      </div>
      <p className="text-[15px] leading-relaxed text-sky-950/80">{desc}</p>
    </motion.div>
  );
}

/* =========================================
 * Videos Tutorial
 * ========================================= */

/**
 * Convierte cualquier link común de YouTube en un embed listo.
 */
function getYouTubeEmbed(rawUrl: string): string {
  if (!rawUrl) return "";
  try {
    const u = new URL(rawUrl);

    // Caso share corto: https://youtu.be/VIDEOID?si=...
    if (u.hostname.includes("youtu.be")) {
      const idFromPath = u.pathname.replace("/", ""); // "VIDEOID"
      if (idFromPath) {
        return `https://www.youtube.com/embed/${idFromPath}?rel=0`;
      }
    }

    // Caso normal: https://www.youtube.com/watch?v=VIDEOID&...
    if (u.hostname.includes("youtube.com")) {
      // Si ya viene /embed/ lo dejamos
      if (u.pathname.startsWith("/embed/")) {
        return rawUrl;
      }
      const v = u.searchParams.get("v");
      if (v) {
        return `https://www.youtube.com/embed/${v}?rel=0`;
      }
    }
  } catch {
    return rawUrl;
  }
  return rawUrl;
}

type TutorialVideo = {
  title: string;
  desc: string;
  videoUrl: string;
};

function TutorialVideoCard({ title, desc, videoUrl }: TutorialVideo) {
  const finalUrl = getYouTubeEmbed(videoUrl);

  return (
    <motion.div
      className="flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/10 shadow-md shadow-sky-950/10 backdrop-blur"
      {...viewPreset}
      {...hoverPreset}
    >
      <div className="relative aspect-video w-full">
        {finalUrl ? (
          <iframe
            className="absolute inset-0 size-full rounded-t-3xl"
            src={finalUrl}
            title={title}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-[11px] tracking-wide text-white/60">
            VIDEO
          </div>
        )}
      </div>
      <div className="flex flex-col px-5 py-4">
        <p className="text-sm font-semibold text-sky-950">{title}</p>
        <p className="mt-2 text-xs leading-relaxed text-sky-950/70">{desc}</p>
      </div>
    </motion.div>
  );
}

/* Roles / valor por perfil */
function RoleCard({ title, bullets }: { title: string; bullets: string[] }) {
  return (
    <motion.div
      className="rounded-3xl border border-white/10 bg-white/10 p-6 shadow-md shadow-sky-950/10 backdrop-blur"
      {...viewPreset}
      {...hoverPreset}
    >
      <h3 className="text-base font-semibold text-sky-950">{title}</h3>
      <ul className="mt-4 space-y-2 text-sm text-sky-950/80">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sky-800" />
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
        <p className="text-sm font-semibold text-sky-950">{title}</p>
        {subtitle && (
          <span className="text-[11px] text-sky-950/70">{subtitle}</span>
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
    <div className="rounded-2xl border border-white/10 bg-white/10 p-3 text-sky-950 shadow-md backdrop-blur">
      {label && <p className="mb-1 text-xs opacity-70">{label}</p>}
      <div className="space-y-1 text-sky-950">
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
 * Charts marketing
 * =========================== */

function ChartVentasUp() {
  const mounted = useMounted();
  const data = [
    { m: "Ene", v: 40 },
    { m: "Feb", v: 48 },
    { m: "Mar", v: 55 },
    { m: "Abr", v: 63 },
    { m: "May", v: 70 },
    { m: "Jun", v: 82 },
  ];
  return (
    <ChartCard title="Más tiempo vendiendo" subtitle="+42% foco comercial">
      {mounted ? (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="gVentas" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#e5eef7" />
            <XAxis
              dataKey="m"
              tickLine={false}
              axisLine={false}
              stroke="#475569"
              fontSize={12}
            />
            <YAxis hide />
            <Tooltip content={<GlassTooltip />} />
            <Area
              type="monotone"
              dataKey="v"
              name="Horas útiles en ventas"
              stroke="#0ea5e9"
              strokeWidth={2}
              fill="url(#gVentas)"
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <Skeleton />
      )}
    </ChartCard>
  );
}

function ChartAdminDown() {
  const mounted = useMounted();
  const data = [
    { m: "Ene", v: 40 },
    { m: "Feb", v: 36 },
    { m: "Mar", v: 30 },
    { m: "Abr", v: 26 },
    { m: "May", v: 22 },
    { m: "Jun", v: 18 },
  ];
  return (
    <ChartCard
      title="Menos trabajo repetitivo"
      subtitle="-55% tareas operativas"
    >
      {mounted ? (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="gAdmin" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#e5eef7" />
            <XAxis
              dataKey="m"
              tickLine={false}
              axisLine={false}
              stroke="#475569"
              fontSize={12}
            />
            <YAxis hide />
            <Tooltip content={<GlassTooltip />} />
            <Area
              type="monotone"
              dataKey="v"
              name="Horas en planillas / correcciones"
              stroke="#64748b"
              strokeWidth={2}
              fill="url(#gAdmin)"
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <Skeleton />
      )}
    </ChartCard>
  );
}

function ChartControlEquipo() {
  const mounted = useMounted();
  const pct = 92;
  const pie = [
    { name: "Equipo alineado", value: pct },
    { name: "Caos / retrabajo", value: 100 - pct },
  ];
  const colors = ["#0ea5e9", "#e2e8f0"];

  return (
    <ChartCard title="Equipo alineado" subtitle="Visibilidad en tiempo real">
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
              <div className="text-2xl font-semibold text-sky-950">{pct}%</div>
              <div className="text-[11px] text-sky-950/70">
                claridad operativa
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
 * Tutorial videos data
 * =========================== */
const VIDEOS: TutorialVideo[] = [
  {
    title: "Ofistur #1: Presentación, Login y Dashboard",
    desc: "Conocé Ofistur desde cero: landing, inicio de sesión y el panel que centraliza todo en 2 clics. Ideal si venís de un “sistema prehistórico” y querés ver métricas, alertas y accesos rápidos hechos por y para agencias de viaje. Más información.",
    videoUrl: "https://youtu.be/p3Lzg1y2D7Y",
  },
  {
    title: "Ofistur #2: Clientes — Alta, Edición, Baja y KPIs rápidos",
    desc: "Cargá, editá y eliminá clientes sin vueltas. Vemos fichas, búsquedas, segmentación y estadísticas clave (deuda, historial, valor). Todo listo para cotizar y confirmar más rápido. Más información.",
    videoUrl: "https://youtu.be/-Ps3wLSCVDg",
  },
  {
    title: "Ofistur #3: Reservas — Flujo básico y primer vistazo a Servicios",
    desc: "Creá tu primera reserva, editála, eliminála y conectála con el titular. Además, te muestro la primera pantalla de Servicios para entender cómo se arma cada viaje paso a paso. Más información.",
    videoUrl: "https://youtu.be/uhR4D87JbWo",
  },
  {
    title: "Ofistur #4: Servicios — CRUD completo y resumen con estadísticas",
    desc: "Alta/edición/baja de servicios dentro de la reserva y un tablero de resumen con importes, comisiones e impuestos automáticos. Visualizá en 2 clics el estado global de cada viaje. Más información.",
    videoUrl: "https://youtu.be/UNYCNBVi528",
  },
  {
    title:
      "Ofistur #5: Servicios a fondo — Planes de pago, Recibos y Operadores",
    desc: "Definí planes de pago, emití recibos, gestioná vencimientos y registrá pagos al operador. Controlá el estado de la reserva y evitá olvidos con avisos claros para el equipo. Más información.",
    videoUrl: "https://youtu.be/uK4dy_c-n2c",
  },
  {
    title: "Ofistur #6: Facturas y Notas de Crédito — Flujo y Estadísticas",
    desc: "Emití facturas y notas de crédito, vinculalas a servicios y seguí su impacto en la rentabilidad. Cerramos con un tablero de métricas de facturación para decisiones en tiempo real. Más información.",
    videoUrl: "https://youtu.be/QWPOFHY7za4",
  },
  {
    title: "Ofistur #7: Finanzas — Gastos, Saldos, Ganancias y Configuración",
    desc: "Inversiones (gastos), pagos al operador, recibos, saldos de reservas y cálculo automático de comisiones (vendedor/líder/agencia). Además, configuración de monedas, cuentas, métodos y categorías. Más información.",
    videoUrl: "https://youtu.be/XQWpJ1J4JcE",
  },
  {
    title:
      "Ofistur #8: Recursos del Equipo — Notas, Calendario y Templates PDF",
    desc: "Organizá al equipo con anotaciones colaborativas, calendario de clientes y plantillas listas para cotización y confirmación en PDF. Centralizá comunicación y documentación en un solo lugar. Más información.",
    videoUrl: "https://youtu.be/xJFyNUfTDjc",
  },
  {
    title:
      "Ofistur #9: Agencia — Identidad, AFIP, Operadores, Usuarios y Roles",
    desc: "Ajustá datos de la agencia (logo, certificados AFIP, costos por transferencia), gestioná Operadores, Usuarios y Equipos de ventas, y administrá roles y contraseñas con control fino de permisos. Más información.",
    videoUrl: "https://youtu.be/3hXinQcW1ck",
  },
  {
    title: "Ofistur #10: Cierre del Tutorial",
    desc: "Pedí una demo, migrá a Ofistur y trabajá desde Mac/Windows/iOS/Android. Todo centralizado y en 2 clics. Más información.",
    videoUrl: "https://youtu.be/7RmdJWiiEIQ",
  },
];

/* ===========================
 * Formulario de leads
 * =========================== */

function LeadForm() {
  const [sent, setSent] = useState<null | "ok" | "err">(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setSent(null);

    const formEl = e.currentTarget;
    const formData = new FormData(formEl);

    // payload para /api/leads
    const payload = {
      name: String(formData.get("name") ?? ""),
      agency: String(formData.get("agency") ?? ""),
      role: String(formData.get("role") ?? ""),
      size: String(formData.get("size") ?? ""),
      location: String(formData.get("location") ?? ""),
      email: String(formData.get("email") ?? ""),
      whatsapp: String(formData.get("whatsapp") ?? ""),
      message: String(formData.get("message") ?? ""),
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
        console.error("[lead][submit] error:", errJson);
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

  // Mensaje de confirmación total
  if (sent === "ok") {
    return (
      <motion.div
        className="rounded-3xl border border-emerald-300/50 bg-emerald-50/70 p-6 text-emerald-900 shadow-md shadow-emerald-950/10 backdrop-blur md:p-7"
        {...viewPreset}
      >
        <div className="flex items-start gap-3">
          <div className="mt-1 rounded-full bg-emerald-600/10 p-2 text-emerald-700 shadow-sm shadow-emerald-900/10">
            <IconCheckCircle className="size-5" />
          </div>
          <div className="flex-1">
            <h4 className="text-lg font-semibold leading-tight">
              ¡Listo! Ya recibimos tus datos
            </h4>
            <p className="mt-2 text-sm text-emerald-900/80">
              Te vamos a escribir por WhatsApp y email para coordinar la demo /
              onboarding. También podés hablarnos directo ahora 👇
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-4">
              <ButtonPrimary variant="emerald" href={WA_URL} size="sm">
                Abrir WhatsApp
              </ButtonPrimary>
              <p className="text-[11px] leading-snug text-emerald-900/70">
                Respuesta humana real, no bot.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.form
      onSubmit={onSubmit}
      className="relative rounded-3xl border border-white/10 bg-white/10 px-3 py-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur md:p-7"
      {...viewPreset}
      noValidate
    >
      {/* overlay cargando */}
      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-3xl bg-white/50 backdrop-blur-sm">
          <Spinner />
        </div>
      )}

      <div
        className={`grid gap-5 md:grid-cols-2 ${loading ? "pointer-events-none opacity-60" : ""}`}
      >
        <FloatingInput
          label="Nombre y apellido *"
          name="name"
          required
          disabled={loading}
        />
        <FloatingInput
          label="Agencia / Operador *"
          name="agency"
          required
          disabled={loading}
        />

        <SelectField label="Rol *" name="role" required disabled={loading}>
          <option value="" disabled>
            Seleccionar…
          </option>
          <option>Dueño/Gerente</option>
          <option>Administración</option>
          <option>Líder</option>
          <option>Vendedor</option>
        </SelectField>

        <SelectField label="Tamaño" name="size" disabled={loading}>
          <option value="" disabled>
            Seleccionar…
          </option>
          <option>Freelancer</option>
          <option>2–5</option>
          <option>6–15</option>
          <option>16–30</option>
          <option>30+</option>
        </SelectField>

        <FloatingInput
          label="País / Ciudad"
          name="location"
          disabled={loading}
        />
        <FloatingInput
          label="Email *"
          name="email"
          type="email"
          required
          disabled={loading}
        />
        <FloatingInput
          label="WhatsApp"
          name="whatsapp"
          required
          disabled={loading}
        />

        <div className="md:col-span-2">
          <FloatingTextarea
            label="Mensaje (opcional)"
            name="message"
            rows={4}
            disabled={loading}
          />
        </div>
      </div>

      <div
        className={`mt-6 flex flex-wrap items-center gap-3 ${loading ? "pointer-events-none opacity-60" : ""}`}
      >
        <ButtonPrimary
          type="submit"
          size="sm"
          className="min-w-[120px]"
          disabled={loading}
        >
          {loading ? "Enviando…" : "Enviar"}
        </ButtonPrimary>

        <ButtonPrimary variant="emerald" href={WA_URL} size="sm">
          WhatsApp
        </ButtonPrimary>

        <p className="text-xs text-sky-950/70">
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

      {sent === "err" && (
        <motion.p
          className="mt-3 text-sm text-red-600"
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
 * Landing
 * =========================== */
export default function LandingClient() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden py-24 sm:py-40">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,#e0f2fe_0%,transparent_60%)]"
        />
        <div className="mx-auto max-w-7xl px-1 md:px-8">
          <Card className="max-w-4xl bg-white/20" animated={false}>
            <motion.h1
              className="text-4xl font-semibold leading-tight tracking-tight text-sky-950 sm:text-6xl"
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
              className="mt-6 max-w-2xl text-lg text-sky-950/80"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: "easeOut", delay: 0.06 }}
            >
              Centralizá procesos, documentos y finanzas. Disponible en
              Argentina.
            </motion.p>

            <motion.div
              className="mt-8 flex flex-wrap items-center gap-6 sm:gap-3"
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
              <Chip>Soporte técnico</Chip>
            </div>
          </Card>
        </div>
      </section>

      {/* Pilares + Charts */}
      <Section id="producto" title="Qué resuelve" eyebrow="Producto">
        <div className="grid grid-cols-1 gap-5 sm:gap-6 md:[grid-template-columns:repeat(auto-fit,minmax(220px,1fr))] lg:gap-7">
          <FeatureCard
            title="Operativa"
            desc="Reservas y servicios, cotizaciones, confirmaciones, calendario y recursos (pasajeros, salidas, hoteles, cuentas bancarias)."
            icon={<IconCalendar className="size-5" aria-hidden />}
          />
          <FeatureCard
            title="Finanzas"
            desc="AFIP, facturación clara, recibos, notas de crédito, caja simple y comisiones al día."
            icon={<IconInvoice className="size-5" aria-hidden />}
          />
          <FeatureCard
            title="Control"
            desc="Visibilidad de todo el equipo (incluida coordinación). Cada rol con lo que tiene que ver, nada más."
            icon={<IconShield className="size-5" aria-hidden />}
          />
          <FeatureCard
            title="Productividad"
            desc="Templates listos, PDFs prolijos, menos retrabajo. Funciona también desde el celu."
            icon={<IconZap className="size-5" aria-hidden />}
          />
        </div>

        {/* Charts marketing */}
        <div className="mt-10 grid grid-cols-1 gap-5 sm:gap-6 md:[grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] lg:gap-7">
          <ChartVentasUp />
          <ChartAdminDown />
          <ChartControlEquipo />
        </div>
      </Section>

      {/* Tutorial en video */}
      <Section
        id="videos"
        title="Tutorial completo (10 videos cortos)"
        eyebrow="Videos"
      >
        <p className="text-sm text-sky-950/80">
          Mirá el flujo real de trabajo: alta de clientes, reservas, servicios,
          finanzas, facturación y permisos. Son pantallas reales, tal cual las
          usa tu agencia hoy.
        </p>

        <div className="mt-7 grid grid-cols-1 gap-6 sm:gap-7 md:[grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
          {VIDEOS.map((v, i) => (
            <TutorialVideoCard
              key={i}
              title={v.title}
              desc={v.desc}
              videoUrl={v.videoUrl}
            />
          ))}
        </div>
      </Section>

      {/* Roles */}
      <Section id="roles" title="Valor por rol" eyebrow="Perfiles">
        <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
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
              "Recibos / Notas de crédito ordenados",
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
        <ul className="mt-3 list-disc gap-2 pl-6 text-sm text-sky-950/80">
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
        <div className="grid gap-6 sm:gap-7 md:grid-cols-[1fr,1.2fr] lg:grid-cols-[1fr,1.3fr]">
          {/* CTA card */}
          <Card>
            <h3 className="text-lg font-semibold">¿Preferís hablar directo?</h3>
            <p className="mt-2 text-sm text-sky-950/80">
              Te respondemos por WhatsApp. Contanos brevemente tu caso.
            </p>
            <div className="mt-4">
              <ButtonPrimary variant="emerald" href={WA_URL} size="sm">
                Abrir WhatsApp
              </ButtonPrimary>
            </div>
            <div className="mt-6 text-xs text-sky-950/70">
              También podés completar el formulario y te contactamos por
              WhatsApp y email.
            </div>
          </Card>

          {/* Lead form */}
          <LeadForm />
        </div>
      </Section>

      {/* Footer mini */}
      <footer className="border-t border-white/10 py-10 text-center text-sm text-sky-950/70">
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
        className="fixed bottom-5 right-5 z-[60] inline-flex size-12 items-center justify-center rounded-full border border-emerald-300/50 bg-emerald-50 text-emerald-950 shadow-lg shadow-emerald-950/20 transition hover:scale-105 active:scale-95"
      >
        <IconWhatsApp className="size-6" />
      </a>
    </>
  );
}

/* ===========================
 * FAQ item (animado)
 * =========================== */

/**
 * Nueva FAQ, orientada a dolores reales:
 * - “Tengo todo en Excel y WhatsApp”
 * - tiempo operativo
 * - AFIP/facturación
 * - adopción del equipo
 * - permanencia / riesgo
 */
const FAQ_ITEMS: [string, string][] = [
  [
    "Hoy tengo todo en Excel y WhatsApp. ¿Me sirve igual?",
    "Sí. Ese es justamente el caso más común: reservas en un Excel, audios con precios, PDFs sueltos. Ofistur junta clientes, reservas, vencimientos, facturas y cobranzas en un solo lugar para que no dependas de mil chats y planillas.",
  ],
  [
    "¿Cuánto tiempo le ahorra a mi equipo?",
    "La mayoría del tiempo perdido es repetir datos, corregir facturas, perseguir saldos o pedir info al vendedor. En Ofistur ya está cargado una sola vez y lo ve todo el equipo. Eso baja mucho las horas de administración y retrabajo interno.",
  ],
  [
    "¿Necesito alguien técnico para usarlo?",
    "No. Está pensado para equipos de viaje, no para contadores ni programadores. Los permisos por rol hacen que cada persona solo vea/edite lo que necesita (ventas, caja, AFIP, etc.) sin miedo a “romper” algo.",
  ],
  [
    "¿Me ayuda con AFIP y la facturación?",
    "Sí. Podés emitir comprobantes, notas de crédito y tenerlos ligados a cada reserva/servicio. Además se ve la rentabilidad y las comisiones sin tener que armar reportes a mano.",
  ],
  [
    "¿Estoy atado a un contrato largo?",
    "No. Podés dejar de usar la plataforma cuando quieras. Si después decidís volver a tus planillas, lo hacés. No hay permanencia mínima.",
  ],
];

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  const id = question.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="border-b border-white/10 first:rounded-t-3xl last:rounded-b-3xl">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sky-950"
      >
        <span className="font-medium">{question}</span>
        <span
          className={`rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-900 transition ${open ? "rotate-45" : ""}`}
        >
          +
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={`${id}-panel`}
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden px-5"
          >
            <p className="pb-4 text-sm text-sky-950/80">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ===========================
 * Skeleton chart
 * =========================== */
function Skeleton() {
  return <div className="size-full animate-pulse rounded-xl bg-white/20" />;
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
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 464 488"
      {...props}
    >
      <path
        fill="#064e3b"
        d="M462 228q0 93-66 159t-160 66q-56 0-109-28L2 464l40-120q-32-54-32-116q0-93 66-158.5T236 4t160 65.5T462 228zM236 39q-79 0-134.5 55.5T46 228q0 62 36 111l-24 70l74-23q49 31 104 31q79 0 134.5-55.5T426 228T370.5 94.5T236 39zm114 241q-1-1-10-7q-3-1-19-8.5t-19-8.5q-9-3-13 2q-1 3-4.5 7.5t-7.5 9t-5 5.5q-4 6-12 1q-34-17-45-27q-7-7-13.5-15t-12-15t-5.5-8q-3-7 3-11q4-6 8-10l6-9q2-5-1-10q-4-13-17-41q-3-9-12-9h-11q-9 0-15 7q-19 19-19 45q0 24 22 57l2 3q2 3 4.5 6.5t7 9t9 10.5t10.5 11.5t13 12.5t14.5 11.5t16.5 10t18 8.5q16 6 27.5 10t18 5t9.5 1t7-1t5-1q9-1 21.5-9t15.5-17q8-21 3-26z"
      ></path>
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
