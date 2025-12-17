// src/hooks/receipts/useReceiptSearch.ts
"use client";

import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/utils/authFetch";
import type { AttachableReceiptOption } from "@/types/receipts";
import { isObj, toNumberSafe } from "@/utils/receipts/receiptForm";

function getArrayItems(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (isObj(json)) {
    const rec = json as Record<string, unknown>;
    if (Array.isArray(rec.items)) return rec.items;
  }
  return [];
}

function getStr(o: Record<string, unknown>, key: string): string | undefined {
  const v = o[key];
  return typeof v === "string" ? v : undefined;
}

function getUnknown(o: Record<string, unknown>, key: string): unknown {
  return o[key];
}

export function useReceiptSearch(args: {
  token: string | null;
  enabled: boolean;
  searchReceipts?: (q: string) => Promise<AttachableReceiptOption[]>;
}) {
  const { token, enabled, searchReceipts } = args;

  const [receiptQuery, setReceiptQuery] = useState("");
  const [receiptOptions, setReceiptOptions] = useState<
    AttachableReceiptOption[]
  >([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);

  const effectiveSearch = useMemo<
    ((q: string) => Promise<AttachableReceiptOption[]>) | undefined
  >(() => {
    if (searchReceipts) return searchReceipts;
    if (!token) return undefined;

    return async (q: string) => {
      try {
        const url = `/api/receipts?q=${encodeURIComponent(q)}&take=10`;
        const res = await authFetch(
          url,
          { cache: "no-store" },
          token || undefined,
        );
        if (!res.ok) return [];

        const json: unknown = await res.json();
        const items = getArrayItems(json);

        return items
          .map((r): AttachableReceiptOption | null => {
            if (!isObj(r)) return null;
            const rr = r as Record<string, unknown>;

            const id = toNumberSafe(getUnknown(rr, "id_receipt"));
            if (!id || id <= 0) return null;

            const receiptNumberRaw = getUnknown(rr, "receipt_number");
            const numberStr =
              typeof receiptNumberRaw === "string"
                ? receiptNumberRaw
                : String(receiptNumberRaw ?? id);

            const amountCurrencyRaw = getUnknown(rr, "amount_currency");
            const cur =
              typeof amountCurrencyRaw === "string"
                ? amountCurrencyRaw.toUpperCase()
                : "ARS";

            const amt = toNumberSafe(getUnknown(rr, "amount")) ?? 0;

            const issueDate = getStr(rr, "issue_date");
            const dStr =
              issueDate && issueDate.trim()
                ? new Date(issueDate).toLocaleDateString("es-AR")
                : "—";

            let already = false;
            const bookingObj = getUnknown(rr, "booking");
            if (isObj(bookingObj)) {
              const br = bookingObj as Record<string, unknown>;
              const bid = toNumberSafe(getUnknown(br, "id_booking"));
              already = !!bid && bid > 0;
            }

            const label = `#${numberStr} • ${cur} ${amt.toLocaleString(
              "es-AR",
              {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              },
            )} • ${dStr}`;

            const subtitle = already ? "Asociado a reserva" : "Sin reserva";
            return { id_receipt: id, label, subtitle, alreadyLinked: already };
          })
          .filter((x): x is AttachableReceiptOption => x !== null);
      } catch {
        return [];
      }
    };
  }, [searchReceipts, token]);

  useEffect(() => {
    if (!enabled) {
      setReceiptOptions([]);
      return;
    }
    const q = receiptQuery.trim().replace(/^#/, "");
    if (!q) {
      setReceiptOptions([]);
      return;
    }
    if (!effectiveSearch) return;

    let alive = true;
    setLoadingReceipts(true);

    const t = setTimeout(() => {
      effectiveSearch(q)
        .then((opts) => alive && setReceiptOptions(opts || []))
        .finally(() => alive && setLoadingReceipts(false));
    }, 250);

    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [enabled, receiptQuery, effectiveSearch]);

  return { receiptQuery, setReceiptQuery, receiptOptions, loadingReceipts };
}
