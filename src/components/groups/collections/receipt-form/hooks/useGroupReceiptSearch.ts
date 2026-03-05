"use client";

import { useEffect, useMemo, useState } from "react";
import type { AttachableReceiptOption } from "@/types/receipts";
import { authFetch } from "@/utils/authFetch";

const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const toPositiveInt = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
};

const toAmount = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function buildAttachableOption(value: unknown): AttachableReceiptOption | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = toPositiveInt(row.id_receipt ?? row.id);
  if (!id) return null;

  const receiptNumberRaw = row.receipt_number;
  const receiptNumber =
    typeof receiptNumberRaw === "string" && receiptNumberRaw.trim().length > 0
      ? receiptNumberRaw.trim()
      : String(id);
  const amountCurrencyRaw = row.amount_currency;
  const amountCurrency =
    typeof amountCurrencyRaw === "string" && amountCurrencyRaw.trim().length > 0
      ? amountCurrencyRaw.trim().toUpperCase()
      : "ARS";
  const amount = toAmount(row.amount);
  const issueDateRaw =
    typeof row.issue_date === "string" ? row.issue_date.trim() : "";
  const dateLabel = issueDateRaw
    ? new Date(issueDateRaw).toLocaleDateString("es-AR")
    : "—";
  const linkedContextId = toPositiveInt(
    (row.context as Record<string, unknown> | undefined)?.id_context ??
      (row.booking as Record<string, unknown> | undefined)?.id_booking ??
      row.bookingId_booking,
  );
  const subtitle = linkedContextId
    ? "Asociado a contexto"
    : "Sin contexto";

  const label = `N° ${receiptNumber} • ${amountCurrency} ${amount.toLocaleString(
    "es-AR",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  )} • ${dateLabel}`;

  return {
    id_receipt: id,
    label,
    subtitle,
    alreadyLinked: !!linkedContextId,
  };
}

function getItemsFromResponse(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== "object") return [];
  const payload = json as Record<string, unknown>;
  if (Array.isArray(payload.receipts)) return payload.receipts;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

export function useGroupReceiptSearch(args: {
  token: string | null;
  groupId?: string;
  groupPassengerId?: number | null;
  enabled: boolean;
  searchReceipts?: (q: string) => Promise<AttachableReceiptOption[]>;
}) {
  const { token, groupId, groupPassengerId, enabled, searchReceipts } = args;

  const [receiptQuery, setReceiptQuery] = useState("");
  const [receiptOptions, setReceiptOptions] = useState<AttachableReceiptOption[]>(
    [],
  );
  const [loadingReceipts, setLoadingReceipts] = useState(false);

  const effectiveSearch = useMemo<
    ((query: string) => Promise<AttachableReceiptOption[]>) | undefined
  >(() => {
    if (searchReceipts) return searchReceipts;
    if (!token || !groupId) return undefined;

    return async (query: string) => {
      const params = new URLSearchParams();
      if (groupPassengerId && groupPassengerId > 0) {
        params.set("passengerId", String(groupPassengerId));
      }
      const endpoint = `/api/groups/${encodeURIComponent(groupId)}/finance/receipts${
        params.toString() ? `?${params.toString()}` : ""
      }`;
      try {
        const res = await authFetch(
          endpoint,
          { cache: "no-store" },
          token,
        );
        if (!res.ok) return [];
        const json = await res.json();
        const normalizedQuery = normalizeText(query);
        return getItemsFromResponse(json)
          .map((item) => buildAttachableOption(item))
          .filter((item): item is AttachableReceiptOption => item !== null)
          .filter((option) => normalizeText(option.label).includes(normalizedQuery));
      } catch {
        return [];
      }
    };
  }, [groupId, groupPassengerId, searchReceipts, token]);

  useEffect(() => {
    if (!enabled) {
      setReceiptOptions([]);
      return;
    }
    if (!effectiveSearch) {
      setReceiptOptions([]);
      return;
    }
    const query = receiptQuery.trim().replace(/^(#|n[°º]?\s*)/i, "");
    if (!query) {
      setReceiptOptions([]);
      return;
    }

    let alive = true;
    setLoadingReceipts(true);
    const timer = setTimeout(() => {
      effectiveSearch(query)
        .then((options) => {
          if (!alive) return;
          setReceiptOptions(options || []);
        })
        .finally(() => {
          if (alive) setLoadingReceipts(false);
        });
    }, 250);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [effectiveSearch, enabled, receiptQuery]);

  return {
    receiptQuery,
    setReceiptQuery,
    receiptOptions,
    loadingReceipts,
  };
}
