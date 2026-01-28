"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import TemplatePdfDownload from "@/components/templates/TemplatePdfDownload";
import type { OrderedBlock, BlockType, Density } from "@/types/templates";
import BlocksCanvas from "@/components/templates/BlocksCanvas";
import { nanoid } from "nanoid/non-secure";
import { normalizeConfig, getAt } from "@/lib/templateConfig";
import type { Booking, Client, Service, Operator } from "@/types";
import type { Agency as TemplateAgency, ContentBlock } from "@/types/templates";

type ServiceWithOperator = Service & { operator?: Operator | null };
type BookingPayload = Booking & { services?: ServiceWithOperator[] };

/* eslint-disable @next/next/no-img-element */
const PAGE_TITLE = "Voucher de servicios";

const cx = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

function useUiTokens(cfg: Record<string, unknown>) {
  const radius = getAt<string>(cfg, ["styles", "ui", "radius"], "2xl");
  const innerRadiusClass =
    radius === "sm"
      ? "rounded"
      : radius === "md"
        ? "rounded-md"
        : radius === "lg"
          ? "rounded-lg"
          : radius === "xl"
            ? "rounded-xl"
            : "rounded-2xl";

  const densityRaw = getAt<string>(
    cfg,
    ["styles", "ui", "density"],
    "comfortable",
  );
  const density: Density =
    densityRaw === "compact" || densityRaw === "relaxed"
      ? densityRaw
      : "comfortable";

  const padX =
    density === "compact" ? "px-4" : density === "relaxed" ? "px-7" : "px-6";
  const padY =
    density === "compact" ? "py-3" : density === "relaxed" ? "py-6" : "py-5";

  const gapBlocks =
    density === "compact"
      ? "space-y-2"
      : density === "relaxed"
        ? "space-y-5"
        : "space-y-3";
  const gapGrid =
    density === "compact" ? "gap-2" : density === "relaxed" ? "gap-4" : "gap-3";
  const listSpace =
    density === "compact"
      ? "space-y-0.5"
      : density === "relaxed"
        ? "space-y-2"
        : "space-y-1";

  const contentWidth = getAt<string>(
    cfg,
    ["styles", "ui", "contentWidth"],
    "normal",
  );
  const contentMaxW =
    contentWidth === "narrow"
      ? "max-w-2xl"
      : contentWidth === "wide"
        ? "max-w-5xl"
        : "max-w-3xl";

  const dividers = getAt<boolean>(cfg, ["styles", "ui", "dividers"], true);

  return {
    innerRadiusClass,
    padX,
    padY,
    gapBlocks,
    gapGrid,
    listSpace,
    contentMaxW,
    density,
    dividers,
  };
}

function formatDate(dateString?: string | null) {
  if (!dateString) return "—";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-AR", { timeZone: "UTC" });
}

function formatMoney(amount: number | null | undefined, currency?: string | null) {
  if (amount == null || !Number.isFinite(Number(amount))) return "—";
  const c = (currency || "ARS").toUpperCase();
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: c,
      minimumFractionDigits: 2,
    }).format(Number(amount));
  } catch {
    return `${Number(amount).toFixed(2)} ${c}`;
  }
}

function joinPieces(items: Array<string | null | undefined>) {
  return items.filter((item) => item && String(item).trim()).join(" | ");
}

function formatPassenger(p: Client) {
  const name = `${p.last_name || ""}, ${p.first_name || ""}`.trim();
  const birth = p.birth_date ? formatDate(p.birth_date) : "—";
  const extra = joinPieces([
    p.dni_number ? `DNI: ${p.dni_number}` : "",
    p.passport_number ? `Pasaporte: ${p.passport_number}` : "",
  ]);
  return {
    name: name || "Pasajero",
    birth,
    extra: extra || "—",
  };
}

function buildTotalPriceValue(
  booking: BookingPayload | null,
  services: ServiceWithOperator[],
): string {
  if (booking?.totalSale != null) {
    return formatMoney(booking.totalSale, "ARS");
  }

  const sums: Record<string, number> = {};
  services.forEach((service) => {
    const amount = Number(service.sale_price);
    if (!Number.isFinite(amount)) return;
    const cur = (service.currency || "ARS").toUpperCase();
    sums[cur] = (sums[cur] || 0) + amount;
  });

  const entries = Object.entries(sums);
  if (entries.length === 0) return "—";
  if (entries.length === 1) {
    const [cur, total] = entries[0]!;
    return formatMoney(total, cur);
  }
  return entries
    .map(([cur, total]) => `${cur} ${formatMoney(total, cur).replace(cur, "").trim()}`)
    .join(" + ");
}

function contentBlockToOrdered(b: ContentBlock, forceEditable = false): OrderedBlock {
  const base = {
    id: b.id,
    origin: forceEditable ? "form" : b.mode === "form" ? "form" : "fixed",
    type: b.type,
    label: b.label,
  } as const;

  switch (b.type) {
    case "heading":
      return {
        ...base,
        type: "heading",
        value: { type: "heading", text: b.text ?? "", level: b.level ?? 1 },
      };
    case "subtitle":
      return {
        ...base,
        type: "subtitle",
        value: { type: "subtitle", text: b.text ?? "" },
      };
    case "paragraph":
      return {
        ...base,
        type: "paragraph",
        value: { type: "paragraph", text: b.text ?? "" },
      };
    case "list":
      return {
        ...base,
        type: "list",
        value: { type: "list", items: Array.isArray(b.items) ? b.items : [] },
      };
    case "keyValue":
      return {
        ...base,
        type: "keyValue",
        value: {
          type: "keyValue",
          pairs: Array.isArray(b.pairs) ? b.pairs : [],
        },
      };
    case "twoColumns":
      return {
        ...base,
        type: "twoColumns",
        value: {
          type: "twoColumns",
          left: b.left ?? "",
          right: b.right ?? "",
        },
      };
    case "threeColumns":
      return {
        ...base,
        type: "threeColumns",
        value: {
          type: "threeColumns",
          left: b.left ?? "",
          center: b.center ?? "",
          right: b.right ?? "",
        },
      };
  }
}

function makeNewBlock(type: BlockType): OrderedBlock {
  const id = nanoid();
  switch (type) {
    case "heading":
      return {
        id,
        origin: "extra",
        type,
        value: { type: "heading", text: "Título", level: 1 },
      };
    case "subtitle":
      return {
        id,
        origin: "extra",
        type,
        value: { type: "subtitle", text: "Subtítulo" },
      };
    case "paragraph":
      return {
        id,
        origin: "extra",
        type,
        value: { type: "paragraph", text: "Texto del párrafo" },
      };
    case "list":
      return {
        id,
        origin: "extra",
        type,
        value: { type: "list", items: ["Ítem 1", "Ítem 2"] },
      };
    case "keyValue":
      return {
        id,
        origin: "extra",
        type,
        value: { type: "keyValue", pairs: [{ key: "Clave", value: "Valor" }] },
      };
    case "twoColumns":
      return {
        id,
        origin: "extra",
        type,
        value: { type: "twoColumns", left: "Izquierda", right: "Derecha" },
      };
    case "threeColumns":
      return {
        id,
        origin: "extra",
        type,
        value: {
          type: "threeColumns",
          left: "Izquierda",
          center: "Centro",
          right: "Derecha",
        },
      };
  }
}

function normalizeAgencyForPdf(agency?: Booking["agency"]): TemplateAgency {
  if (!agency) return {};
  const emails =
    Array.isArray((agency as { emails?: string[] }).emails)
      ? ((agency as { emails?: string[] }).emails as string[])
      : agency.email
        ? [agency.email]
        : [];
  const phones = Array.isArray(agency.phones) ? agency.phones : [];
  const socials =
    (agency as { socials?: TemplateAgency["socials"] }).socials ??
    (agency as { social?: TemplateAgency["social"] }).social ??
    undefined;

  return {
    id: agency.id_agency,
    id_agency: agency.id_agency,
    name: agency.name,
    legal_name: agency.legal_name,
    logo_url: agency.logo_url,
    address: agency.address,
    website: agency.website,
    phone: agency.phone,
    phones,
    emails,
    socials,
    social: socials,
  };
}

export default function BookingVoucherPage() {
  const params = useParams();
  const id = params?.id ? String(params.id) : null;
  const { token } = useAuth();

  const [booking, setBooking] = useState<BookingPayload | null>(null);
  const [cfgRaw, setCfgRaw] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [includeSignature, setIncludeSignature] = useState(false);
  const [includePaxSignature, setIncludePaxSignature] = useState(true);
  const [includeAgencySignature, setIncludeAgencySignature] = useState(true);
  const [includeClarification, setIncludeClarification] = useState(true);
  const [includeDni, setIncludeDni] = useState(true);

  useEffect(() => {
    if (!token || !id) return;
    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const [bookingRes, cfgRes] = await Promise.all([
          authFetch(`/api/bookings/${id}`, { cache: "no-store", signal: controller.signal }, token),
          authFetch(
            "/api/template-config/voucher?resolved=1",
            { cache: "no-store", signal: controller.signal },
            token,
          ),
        ]);

        const bookingJson = (await bookingRes.json()) as BookingPayload;
        const cfgJson = (await cfgRes.json()) as { config?: Record<string, unknown> };

        if (!bookingRes.ok) {
          throw new Error(
            (bookingJson as { error?: string })?.error || "Error al obtener la reserva",
          );
        }
        if (!cfgRes.ok) {
          throw new Error(
            (cfgJson as { error?: string })?.error || "Error al obtener el template",
          );
        }

        setBooking(bookingJson);
        setCfgRaw(cfgJson.config ?? {});
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        const msg = err instanceof Error ? err.message : "Error al cargar";
        setError(msg);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [token, id]);

  const rCfg = useMemo(() => normalizeConfig(cfgRaw, "voucher"), [cfgRaw]);
  const selectedCoverUrl =
    rCfg.coverImage?.mode === "url" ? rCfg.coverImage?.url || "" : "";

  const uiTokens = useUiTokens(rCfg as Record<string, unknown>);
  const accent = rCfg?.styles?.colors?.accent ?? "#6B7280";
  const bg = rCfg?.styles?.colors?.background ?? "#ffffff";
  const text = rCfg?.styles?.colors?.text ?? "#111111";
  const dividerColor =
    bg.toLowerCase() === "#ffffff" || bg.toLowerCase() === "#fff"
      ? "rgba(0,0,0,0.08)"
      : "rgba(255,255,255,0.10)";
  const panelBgStrong =
    bg.toLowerCase() === "#ffffff" || bg.toLowerCase() === "#fff"
      ? "rgba(0,0,0,0.04)"
      : "rgba(255,255,255,0.06)";
  const headingFont = "Poppins";
  const headingWeight = 600;

  const services = useMemo(
    () => (Array.isArray(booking?.services) ? booking?.services : []),
    [booking],
  );

  const coreBlocks = useMemo<ContentBlock[]>(() => {
    if (!booking) return [];
    const blocks: ContentBlock[] = [];
    const makeId = (suffix: string) => `v_${suffix}`;

    blocks.push({
      id: makeId("title"),
      type: "heading",
      mode: "fixed",
      text: PAGE_TITLE,
      level: 1,
    });
    // Se omite el subtítulo con número de reserva por pedido
    blocks.push({
      id: makeId("summary_title"),
      type: "subtitle",
      mode: "fixed",
      text: "Detalle de la reserva",
    });
    blocks.push({
      id: makeId("summary_list"),
      type: "list",
      mode: "fixed",
      items: [
        `Titular: ${
          `${booking.titular?.first_name || ""} ${booking.titular?.last_name || ""}`.trim() ||
          "—"
        }`,
        `Salida: ${formatDate(booking.departure_date)}`,
        `Regreso: ${formatDate(booking.return_date)}`,
      ],
    });

    if (booking.details) {
      blocks.push({
        id: makeId("details"),
        type: "paragraph",
        mode: "fixed",
        text: booking.details,
      });
    }

    if (booking.observation) {
      blocks.push({
        id: makeId("obs_title"),
        type: "subtitle",
        mode: "fixed",
        text: "Observaciones",
      });
      blocks.push({
        id: makeId("obs"),
        type: "paragraph",
        mode: "fixed",
        text: booking.observation,
      });
    }

    blocks.push({
      id: makeId("pax_title"),
      type: "heading",
      mode: "fixed",
      text: "Pasajeros",
      level: 2,
    });
    blocks.push({
      id: makeId("pax_count"),
      type: "paragraph",
      mode: "fixed",
      text: `Cantidad de pasajeros: ${
        Number.isFinite(Number(booking.pax_count)) ? String(booking.pax_count) : "—"
      }`,
    });

    const paxItems = Array.isArray(booking.clients)
      ? booking.clients.map(formatPassenger)
      : [];
    if (paxItems.length === 0) {
      blocks.push({
        id: makeId("pax_empty"),
        type: "paragraph",
        mode: "fixed",
        text: "Sin pasajeros cargados.",
      });
    } else {
      paxItems.forEach((pax, idx) => {
        blocks.push({
          id: makeId(`pax_${idx}`),
          type: "threeColumns",
          mode: "fixed",
          left: pax.name,
          center: pax.birth,
          right: pax.extra,
        });
      });
    }

    blocks.push({
      id: makeId("srv_title"),
      type: "heading",
      mode: "fixed",
      text: "Servicios",
      level: 2,
    });

    if (services.length === 0) {
      blocks.push({
        id: makeId("srv_empty"),
        type: "paragraph",
        mode: "fixed",
        text: "Sin servicios cargados.",
      });
    } else {
      const descriptions = services
        .map((s) => s.description || "")
        .map((s) => s.trim())
        .filter(Boolean);
      if (descriptions.length) {
        blocks.push({
          id: makeId("srv_desc_title"),
          type: "subtitle",
          mode: "fixed",
          text: "Descripción de servicios",
        });
        blocks.push({
          id: makeId("srv_desc_list"),
          type: "list",
          mode: "fixed",
          items: descriptions,
        });
      }
    }

    blocks.push({
      id: makeId("total_price"),
      type: "keyValue",
      mode: "fixed",
      pairs: [
        {
          key: "Precio final",
          value: buildTotalPriceValue(booking, services),
        },
      ],
    });

    return blocks;
  }, [booking, services]);

  const signatureBlocks = useMemo<ContentBlock[]>(() => {
    if (!includeSignature) return [];
    if (!includePaxSignature && !includeAgencySignature) return [];
    const blocks: ContentBlock[] = [];
    const makeId = (suffix: string) => `v_sig_${suffix}`;

    const buildSignatureText = (label: string) => {
      const lines = [`Firma ${label}: ________________________________`];
      if (includeClarification) {
        lines.push("Aclaración: ______________________________");
      }
      if (includeDni) {
        lines.push("DNI: ______________________________");
      }
      return lines.join("\n");
    };

    blocks.push({
      id: makeId("title"),
      type: "heading",
      mode: "fixed",
      text: "Firmas",
      level: 2,
    });

    const left = includePaxSignature ? buildSignatureText("Pax") : "";
    const right = includeAgencySignature ? buildSignatureText("Agencia") : "";

    if (includePaxSignature && includeAgencySignature) {
      blocks.push({
        id: makeId("cols"),
        type: "twoColumns",
        mode: "fixed",
        left,
        right,
      });
    } else {
      blocks.push({
        id: makeId("single"),
        type: "paragraph",
        mode: "fixed",
        text: left || right,
      });
    }

    return blocks;
  }, [
    includeSignature,
    includePaxSignature,
    includeAgencySignature,
    includeClarification,
    includeDni,
  ]);

  const appendedBlocks = useMemo(() => {
    const cfgBlocks = Array.isArray(rCfg.content?.blocks)
      ? (rCfg.content?.blocks as ContentBlock[])
      : [];
    return [...cfgBlocks, ...signatureBlocks];
  }, [rCfg, signatureBlocks]);

  const previewBlocks = useMemo(
    () => coreBlocks.concat(appendedBlocks),
    [coreBlocks, appendedBlocks],
  );

  const [editableBlocks, setEditableBlocks] = useState<OrderedBlock[]>([]);
  const lockedIds = useMemo(() => {
    const ids = editableBlocks
      .filter((b) => b.origin === "fixed")
      .map((b) => b.id);
    return new Set<string>(ids);
  }, [editableBlocks]);
  const previewKey = useMemo(
    () => previewBlocks.map((b) => b.id).join("|"),
    [previewBlocks],
  );

  useEffect(() => {
    setEditableBlocks((prev) => {
      const byId = new Map(prev.map((b) => [b.id, b]));
      return previewBlocks.map(
        (b) => byId.get(b.id) ?? contentBlockToOrdered(b, false),
      );
    });
  }, [previewKey, previewBlocks]);

  const agencyForPdf = useMemo(
    () => normalizeAgencyForPdf(booking?.agency),
    [booking],
  );

  const contactLine = useMemo(() => {
    const items = Array.isArray(rCfg.contactItems) ? rCfg.contactItems : [];
    const out: Array<{ label: string; value: string }> = [];
    const phones = Array.isArray(agencyForPdf.phones) ? agencyForPdf.phones : [];
    const emails = Array.isArray(agencyForPdf.emails) ? agencyForPdf.emails : [];
    const website = agencyForPdf.website || "";
    const address = agencyForPdf.address || "";
    const phone = phones[0] || agencyForPdf.phone || "";
    const email = emails[0] || "";

    if (items.includes("website") && website)
      out.push({ label: "Web", value: website });
    if (items.includes("address") && address)
      out.push({ label: "Dirección", value: address });
    if (items.includes("phones") && phone)
      out.push({ label: "Tel", value: phone });
    if (items.includes("email") && email)
      out.push({ label: "Mail", value: email });

    return out;
  }, [agencyForPdf, rCfg]);

  const userForPdf = useMemo(
    () =>
      booking?.user
        ? {
            first_name: booking.user.first_name,
            last_name: booking.user.last_name,
            email: booking.user.email,
          }
        : {},
    [booking],
  );

  const bookingId = booking?.agency_booking_id ?? booking?.id_booking ?? "";

  return (
    <ProtectedRoute>
      <section className="mx-auto max-w-5xl p-6 text-slate-950 dark:text-white">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{PAGE_TITLE}</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
              Generá el voucher con los datos de la reserva y el template
              configurado.
            </p>
          </div>
          <Link
            href={`/bookings/services/${id}`}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white px-4 py-2 text-sm shadow-sm shadow-slate-900/5 transition hover:scale-[0.98] dark:border-white/10 dark:bg-white/5"
          >
            Volver a la reserva
          </Link>
        </div>

        {loading ? (
          <div className="flex min-h-[50vh] items-center justify-center">
            <Spinner />
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-500/20 bg-rose-500/10 p-6 text-rose-700 dark:text-rose-200">
            {error}
          </div>
        ) : !booking ? (
          <div className="rounded-3xl border border-slate-200/70 bg-white p-6 text-slate-700 shadow-sm shadow-slate-900/5 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
            No se encontró la reserva.
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/10 p-5 shadow-md shadow-sky-950/10 backdrop-blur">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-wide text-slate-500 dark:text-slate-300">
                    Reserva
                  </p>
                  <p className="text-lg font-semibold">
                    Nro {bookingId}
                  </p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                    Salida: {formatDate(booking.departure_date)} · Regreso:{" "}
                    {formatDate(booking.return_date)}
                  </p>
                </div>
                <TemplatePdfDownload
                  cfg={rCfg}
                  agency={agencyForPdf}
                  user={userForPdf}
                  blocks={editableBlocks}
                  docLabel="Voucher"
                  selectedCoverUrl={selectedCoverUrl}
                  fileName={`voucher-${bookingId || "reserva"}.pdf`}
                  className="inline-flex items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15 px-5 py-2 text-sm font-medium text-emerald-900 shadow-sm shadow-emerald-900/10 transition hover:scale-[0.98] dark:text-emerald-200"
                >
                  Descargar PDF
                </TemplatePdfDownload>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/10 p-5 shadow-md shadow-sky-950/10 backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">Firmas</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-300">
                    Activá o desactivá la sección de firmas en el voucher.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={includeSignature}
                    onChange={(e) => setIncludeSignature(e.target.checked)}
                    className="size-4"
                  />
                  Incluir firmas
                </label>
              </div>

              {includeSignature && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={includePaxSignature}
                      onChange={(e) => setIncludePaxSignature(e.target.checked)}
                      className="size-4"
                    />
                    Firma Pax
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={includeAgencySignature}
                      onChange={(e) => setIncludeAgencySignature(e.target.checked)}
                      className="size-4"
                    />
                    Firma Agencia
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={includeClarification}
                      onChange={(e) => setIncludeClarification(e.target.checked)}
                      className="size-4"
                    />
                    Aclaración
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={includeDni}
                      onChange={(e) => setIncludeDni(e.target.checked)}
                      className="size-4"
                    />
                    DNI
                  </label>
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/10 p-5 shadow-md shadow-sky-950/10 backdrop-blur">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">Vista previa editable</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-300">
                    Editá, reordená y agregá bloques antes de descargar.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      { type: "heading", label: "Título" },
                      { type: "subtitle", label: "Subtítulo" },
                      { type: "paragraph", label: "Párrafo" },
                      { type: "list", label: "Lista" },
                      { type: "keyValue", label: "Clave/Valor" },
                      { type: "twoColumns", label: "2 columnas" },
                      { type: "threeColumns", label: "3 columnas" },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() =>
                        setEditableBlocks((prev) => [
                          ...prev,
                          makeNewBlock(item.type as BlockType),
                        ])
                      }
                      className="rounded-full border border-white/30 bg-white/40 px-3 py-1 text-xs font-medium text-sky-950 shadow-sm shadow-sky-950/10 transition hover:scale-[0.98] dark:border-white/10 dark:bg-white/10 dark:text-white"
                    >
                      + {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div
                className={cx(
                  "rounded-3xl border border-white/10 bg-white/40 shadow-inner shadow-sky-950/5 dark:border-white/10 dark:bg-white/5",
                  uiTokens.padY,
                )}
                style={{ backgroundColor: bg, color: text }}
              >
                <div className={cx(uiTokens.padX, "pb-6")}>
                  <div className={cx("mx-auto", uiTokens.contentMaxW, "w-full")}>
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <h3
                          className="text-2xl font-semibold"
                          style={{ color: text, fontFamily: headingFont }}
                        >
                          {agencyForPdf.name || "Agencia"}
                        </h3>
                        <div
                          className="mt-1 h-[2px] w-24"
                          style={{ backgroundColor: accent }}
                        />
                      </div>
                      <span
                        className="rounded-full border px-3 py-1 text-xs font-semibold uppercase"
                        style={{
                          borderColor: dividerColor,
                          color: accent,
                        }}
                      >
                        Voucher
                      </span>
                    </div>

                    {contactLine.length > 0 && (
                      <div
                        className={cx(
                          "mb-4 flex flex-wrap gap-2 border p-2 text-xs",
                          uiTokens.innerRadiusClass,
                        )}
                        style={{ borderColor: dividerColor, backgroundColor: panelBgStrong }}
                      >
                        {contactLine.map((item) => (
                          <span
                            key={`${item.label}-${item.value}`}
                            className={cx("rounded-full px-2 py-1", uiTokens.innerRadiusClass)}
                            style={{ backgroundColor: dividerColor, color: text }}
                          >
                            <strong style={{ color: accent }}>{item.label}:</strong>{" "}
                            {item.value}
                          </span>
                        ))}
                      </div>
                    )}

                    {selectedCoverUrl ? (
                      <img
                        src={selectedCoverUrl}
                        alt="Portada voucher"
                        className={cx("w-full object-cover", uiTokens.innerRadiusClass)}
                        style={{
                          height:
                            uiTokens.density === "compact"
                              ? 144
                              : uiTokens.density === "relaxed"
                                ? 220
                                : 184,
                        }}
                      />
                    ) : null}

                    <div className={cx("mt-4", uiTokens.gapBlocks)}>
                      {editableBlocks.length === 0 ? (
                        <p className="text-sm opacity-70">
                          No hay contenido para mostrar.
                        </p>
                      ) : (
                        <BlocksCanvas
                          blocks={editableBlocks}
                          onChange={setEditableBlocks}
                          lockedIds={lockedIds}
                          showMeta
                          getMode={(b) => (b.origin === "fixed" ? "fixed" : "form")}
                          onToggleMode={(id, nextMode) => {
                            setEditableBlocks((prev) =>
                              prev.map((b) =>
                                b.id === id
                                  ? {
                                      ...b,
                                      origin: nextMode === "fixed" ? "fixed" : "form",
                                    }
                                  : b,
                              ),
                            );
                          }}
                          options={{
                            dividerColor: uiTokens.dividers ? dividerColor : "transparent",
                            panelBgStrong,
                            innerRadiusClass: uiTokens.innerRadiusClass,
                            gapGridClass: uiTokens.gapGrid,
                            listSpaceClass: uiTokens.listSpace,
                            accentColor: accent,
                            headingFont,
                            headingWeight,
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </ProtectedRoute>
  );
}
