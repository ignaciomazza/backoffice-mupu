"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";

export type Config = Record<string, unknown>;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function getAt<T>(
  obj: Record<string, unknown>,
  path: string[],
  fallback: T,
): T {
  let cur: unknown = obj;
  for (const k of path) {
    if (!isObject(cur)) return fallback;
    cur = (cur as Record<string, unknown>)[k];
  }
  return (cur as T) ?? fallback;
}
function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}

/** ===== Content Blocks ===== */
type BlockType = "heading" | "paragraph" | "list" | "keyValue" | "twoColumns";
type BlockMode = "fixed" | "form";
type BaseBlock = {
  id: string;
  type: BlockType;
  mode: BlockMode;
  label?: string;
  fieldKey?: string;
};
type HeadingBlock = BaseBlock & {
  type: "heading";
  text?: string;
  level?: 1 | 2 | 3;
};
type ParagraphBlock = BaseBlock & { type: "paragraph"; text?: string };
type ListBlock = BaseBlock & { type: "list"; items?: string[] };
type KeyValueBlock = BaseBlock & {
  type: "keyValue";
  pairs?: { key: string; value: string }[];
};
type TwoColumnsBlock = BaseBlock & {
  type: "twoColumns";
  left?: string;
  right?: string;
};
type ContentBlock =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | KeyValueBlock
  | TwoColumnsBlock;

function isBlock(v: unknown): v is ContentBlock {
  if (!isObject(v)) return false;
  const t = (v as Record<string, unknown>)["type"];
  return (
    t === "heading" ||
    t === "paragraph" ||
    t === "list" ||
    t === "keyValue" ||
    t === "twoColumns"
  );
}

/** ===== Agency & User Types (flexibles) ===== */
type Agency = {
  name?: string;
  legal_name?: string; // si existe en tu API
  logo_url?: string;
  address?: string;
  website?: string;
  phones?: string[];
  emails?: string[];
  socials?: Partial<{
    instagram: string;
    facebook: string;
    twitter: string;
    tiktok: string;
  }>;
};

type CurrentUser = {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string | null;
};

type Props = {
  cfg: Config;
  /** Etiqueta de tipo de documento para el chip del header (ej.: "Cotización" | "Confirmación"). Opcional */
  docTypeLabel?: string;
};

const TemplateConfigPreview: React.FC<Props> = ({
  cfg,
  docTypeLabel = "Documento",
}) => {
  const { token } = useAuth();

  // ======= UI/Styles desde config =======
  const bg = getAt<string>(cfg, ["styles", "colors", "background"], "#111827");
  const text = getAt<string>(cfg, ["styles", "colors", "text"], "#ffffff");
  const accent = getAt<string>(cfg, ["styles", "colors", "accent"], "#22C55E");
  const headingFont = getAt<string>(
    cfg,
    ["styles", "fonts", "heading"],
    "Poppins",
  );
  const bodyFont = getAt<string>(cfg, ["styles", "fonts", "body"], "Poppins");

  const coverMode = getAt<string>(cfg, ["coverImage", "mode"], "logo");
  const coverUrl = getAt<string>(cfg, ["coverImage", "url"], "");

  const contactItems = asStringArray(cfg["contactItems"]);
  const blocks = useMemo(
    () =>
      (getAt<unknown[]>(cfg, ["content", "blocks"], []) || []).filter(
        isBlock,
      ) as ContentBlock[],
    [cfg],
  );

  // ======= Data real: agency + current user =======
  const [agency, setAgency] = useState<Agency>({});
  const [me, setMe] = useState<CurrentUser>({});
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    if (!token) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        setLoading(true);
        const agRes = await authFetch(
          "/api/agency",
          { cache: "no-store" },
          token,
        );
        const agJson = (await agRes.json().catch(() => ({}))) as unknown;
        const ag = isObject(agJson) ? (agJson as Agency) : {};
        if (mounted) setAgency(ag);

        const meRes = await authFetch(
          "/api/user/profile",
          { cache: "no-store" },
          token,
        );
        const meJson = (await meRes.json().catch(() => ({}))) as unknown;
        const usr = isObject(meJson) ? (meJson as CurrentUser) : {};
        if (mounted) setMe(usr);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token]);

  // ======= Derivados de agencia/usuario =======
  const agencyName = agency.name || "Nombre de la agencia";
  const legalName = agency.legal_name || agency.name || "Razón social";
  const agencyLogo = agency.logo_url || "";
  const agencyAddress = agency.address || "Dirección de la agencia";
  const agencyWebsite = agency.website || "";
  const agencyPhone =
    (Array.isArray(agency.phones) && agency.phones[0]) || "Teléfono";
  const agencyEmail =
    (Array.isArray(agency.emails) && agency.emails[0]) || "info@agencia.com";

  const sellerName =
    [me.first_name, me.last_name].filter(Boolean).join(" ") || "Vendedor/a";
  const sellerEmail = me.email || "vendedor@agencia.com";

  // ======= Header: fila corporativa arriba =======
  const corporateLine = useMemo(() => {
    const items: Array<{ label: string; value: string }> = [];
    if (contactItems.includes("website") && agencyWebsite)
      items.push({ label: "Web", value: agencyWebsite });
    if (contactItems.includes("address") && agencyAddress)
      items.push({ label: "Dirección", value: agencyAddress });
    if (contactItems.includes("phones") && agencyPhone)
      items.push({ label: "Tel", value: agencyPhone });
    if (contactItems.includes("email") && agencyEmail)
      items.push({ label: "Mail", value: agencyEmail });
    return items;
  }, [contactItems, agencyWebsite, agencyAddress, agencyPhone, agencyEmail]);

  // ======= Estilos utilitarios =======
  const panelBorder = "1px solid rgba(255,255,255,0.08)";
  const chipStyle: React.CSSProperties = {
    border: panelBorder,
    backgroundColor: "rgba(255,255,255,0.06)",
    color: accent,
  };

  return (
    <div
      className="col-span-2 h-fit rounded-2xl border border-slate-900/10"
      style={{ backgroundColor: bg, color: text, fontFamily: bodyFont }}
    >
      {/* COVER */}
      {coverMode === "url" && coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverUrl}
          alt="cover"
          className="h-80 w-full rounded-t-2xl object-cover"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={agencyLogo}
          alt="logo pequeño"
          className="m-auto mt-6 h-8 w-auto object-contain opacity-90"
        />
      )}

      {/* HEADER PRINCIPAL */}
      <div className="px-6 pt-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1
              className="text-2xl font-semibold"
              style={{ fontFamily: headingFont }}
            >
              {agencyName}
            </h1>
            <div
              className="mt-1 h-[2px] w-2/3 rounded-full"
              style={{ backgroundColor: accent }}
            />
          </div>

          <span
            className="mt-2 inline-flex w-max items-center rounded-lg px-3 py-1 text-sm uppercase tracking-wide"
            style={chipStyle}
          >
            {docTypeLabel}
          </span>
        </div>

        {/* Línea corporativa */}
        {corporateLine.length > 0 || loading ? (
          <div
            className="mt-4 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm"
            style={{
              border: panelBorder,
              backgroundColor: "rgba(255,255,255,0.04)",
            }}
          >
            {corporateLine.map((it, i) => (
              <span
                key={`${it.label}-${i}`}
                className="rounded-md px-2 py-0.5"
                style={{ backgroundColor: "rgba(0,0,0,0.15)" }}
              >
                <b style={{ color: accent }}>{it.label}:</b>{" "}
                <span className="opacity-90" style={{ color: text }}>
                  {it.value}
                </span>
              </span>
            ))}
            {loading && <span className="opacity-70">Cargando datos…</span>}
          </div>
        ) : null}
      </div>

      {/* CONTENIDO */}
      <div className="space-y-4 p-6">
        {(getAt<string>(cfg, ["styles", "note"], "") || "").length > 0 && (
          <div
            className="rounded-xl p-3 text-sm"
            style={{
              border: panelBorder,
              backgroundColor: "rgba(255,255,255,0.04)",
            }}
          >
            {getAt<string>(cfg, ["styles", "note"], "")}
          </div>
        )}

        <div className="space-y-3">
          {blocks.map((b) => {
            const placeholder =
              b.mode === "form" ? (
                <span className="opacity-70">{`{${b.fieldKey || "campo"}}`}</span>
              ) : null;

            if (b.type === "heading") {
              const lvl = (b as HeadingBlock).level ?? 1;
              const textValue = (b as HeadingBlock).text ?? "";
              const size =
                lvl === 1 ? "text-2xl" : lvl === 2 ? "text-xl" : "text-lg";
              return (
                <h3
                  key={b.id}
                  className={`${size} font-semibold`}
                  style={{ fontFamily: headingFont, color: accent }}
                >
                  {b.mode === "form" ? placeholder : textValue}
                </h3>
              );
            }

            if (b.type === "paragraph") {
              const t = (b as ParagraphBlock).text ?? "";
              return (
                <p key={b.id} className="leading-relaxed">
                  {b.mode === "form" ? placeholder : t}
                </p>
              );
            }

            if (b.type === "list") {
              const items = (b as ListBlock).items ?? [];
              return (
                <ul key={b.id} className="list-inside list-disc space-y-1">
                  {b.mode === "form" ? (
                    <li>{placeholder}</li>
                  ) : (
                    items.map((it, i) => <li key={i}>{it}</li>)
                  )}
                </ul>
              );
            }

            if (b.type === "keyValue") {
              const pairs = (b as KeyValueBlock).pairs ?? [];
              return (
                <div key={b.id} className="grid gap-2">
                  {b.mode === "form" ? (
                    <div
                      className="flex items-center justify-between rounded-lg p-2"
                      style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                    >
                      <span className="opacity-70">{placeholder}</span>
                      <span className="opacity-70">{placeholder}</span>
                    </div>
                  ) : (
                    pairs.map((p, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-lg p-2"
                        style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                      >
                        <span className="opacity-90">{p.key}</span>
                        <span className="opacity-90">{p.value}</span>
                      </div>
                    ))
                  )}
                </div>
              );
            }

            // twoColumns
            const left = (b as TwoColumnsBlock).left ?? "";
            const right = (b as TwoColumnsBlock).right ?? "";
            return (
              <div key={b.id} className="grid gap-3 md:grid-cols-2">
                <div
                  className="rounded-lg p-3"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                >
                  {b.mode === "form" ? placeholder : left}
                </div>
                <div
                  className="rounded-lg p-3"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                >
                  {b.mode === "form" ? placeholder : right}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* FOOTER: vendedor + logo pequeño + razón social */}
      <div className="mt-4 border-t border-white/10 px-6 py-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          {/* Vendedor */}
          <div
            className="rounded-xl p-3 text-sm"
            style={{
              border: panelBorder,
              backgroundColor: "rgba(255,255,255,0.04)",
            }}
          >
            <div className="font-medium" style={{ color: accent }}>
              {sellerName}
            </div>
            <div className="opacity-90">{sellerEmail}</div>
          </div>

          {/* Logo + razón social */}
          <div className="flex items-center gap-3 self-end md:self-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={agencyLogo}
              alt="logo pequeño"
              className="h-8 w-auto object-contain opacity-90"
            />
            <div className="text-xs opacity-80">{legalName}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemplateConfigPreview;
