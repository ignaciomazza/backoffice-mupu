// src/components/templates/TemplatePdfDownload.tsx
"use client";

import React, { useMemo, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import TemplatePdfDocument from "./TemplatePdfDocument";
import TemplatePdfDocumentMupu from "./TemplatePdfDocumentMupu";
import { useAuth } from "@/context/AuthContext";
import { useAgencyAndUser } from "@/lib/agencyUser";
import {
  mergeConfigWithFormValues,
  normalizeConfig,
  asStringArray,
  getAt,
} from "@/lib/templateConfig";
import type {
  DocType,
  TemplateConfig,
  TemplateFormValues,
  ContentBlock,
} from "@/types/templates";

type Props = {
  cfg: TemplateConfig;
  form?: TemplateFormValues | null;
  docType: DocType;
  docTypeLabel?: string;
  filename?: string;
};

const TemplatePdfDownload: React.FC<Props> = ({
  cfg,
  form = null,
  docType,
  docTypeLabel = "Documento",
  filename = "documento.pdf",
}) => {
  const { token: ctxToken } = useAuth();
  const { agency, user } = useAgencyAndUser(ctxToken ?? null);
  const [downloading, setDownloading] = useState(false);

  // === Runtime config (igual que Preview) ===
  const normalized = useMemo(
    () => normalizeConfig(cfg, docType),
    [cfg, docType],
  );
  const runtime = useMemo(
    () =>
      mergeConfigWithFormValues(normalized, form ?? undefined, agency, user),
    [normalized, form, agency, user],
  );

  const rCfg = runtime.config;
  const rAgency = runtime.agency;
  const rUser = runtime.user;

  const blocks = useMemo<ContentBlock[]>(
    () => (rCfg.content?.blocks ?? []) as ContentBlock[],
    [rCfg.content?.blocks],
  );

  const selectedCoverUrl = form?.cover?.url ?? rCfg.coverImage?.url ?? "";

  const rcfg = rCfg as unknown as Record<string, unknown>;
  const paymentOptions = asStringArray(
    getAt<string[] | undefined>(rcfg, ["paymentOptions"], undefined),
  );
  const paymentIdx =
    form?.payment?.selectedIndex ??
    getAt<number | null>(rcfg, ["payment", "selectedIndex"], null) ??
    null;
  const paymentSelected =
    paymentIdx !== null ? paymentOptions[paymentIdx] || "" : "";

  const labels =
    (rCfg as unknown as { labels?: { docTypeLabel?: string } }).labels || {};
  const docLabel = docTypeLabel ?? labels.docTypeLabel ?? "Documento";

  const handleDownload = async () => {
    if (downloading) return;
    try {
      setDownloading(true);

      const agencyId =
        agency?.id ??
        agency?.id_agency ??
        rAgency?.id ??
        rAgency?.id_agency ??
        null;

      const isMupu = Number(agencyId) === 1;
      const Doc = isMupu ? TemplatePdfDocumentMupu : TemplatePdfDocument;

      // Render -> Blob
      const instance = pdf(
        <Doc
          rCfg={rCfg}
          rAgency={rAgency}
          rUser={rUser}
          blocks={blocks}
          docLabel={docLabel}
          selectedCoverUrl={selectedCoverUrl}
          paymentSelected={paymentSelected}
        />,
      );
      const blob = await instance.toBlob();

      // Descarga
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("[TemplatePdfDownload] download error:", e);
      alert("No se pudo generar el PDF.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={downloading}
      className="flex w-fit items-center gap-2 rounded-full bg-sky-100 px-4 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        fill="currentColor"
        aria-hidden
      >
        <path d="M12 3a1 1 0 011 1v9.586l2.293-2.293 1.414 1.414L12 17.414l-4.707-4.707 1.414-1.414L11 13.586V4a1 1 0 011-1zm-7 14h14v2H5v-2z" />
      </svg>
      {downloading ? "Generando PDF…" : "Descargar PDF"}
    </button>
  );
};

export default TemplatePdfDownload;
