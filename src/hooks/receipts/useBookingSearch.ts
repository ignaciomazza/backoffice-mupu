// src/hooks/receipts/useBookingSearch.ts
"use client";

import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/utils/authFetch";
import type { BookingOption } from "@/types/receipts";
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

export function useBookingSearch(args: {
  token: string | null;
  enabled: boolean;
  searchBookings?: (q: string) => Promise<BookingOption[]>;
}) {
  const { token, enabled, searchBookings } = args;

  const [bookingQuery, setBookingQuery] = useState("");
  const [options, setOptions] = useState<BookingOption[]>([]);
  const [loading, setLoading] = useState(false);

  const effectiveSearch = useMemo<
    ((q: string) => Promise<BookingOption[]>) | undefined
  >(() => {
    if (searchBookings) return searchBookings;
    if (!token) return undefined;

    return async (q: string) => {
      try {
        const res = await authFetch(
          `/api/bookings?q=${encodeURIComponent(q)}&take=20`,
          { cache: "no-store" },
          token || undefined,
        );
        if (!res.ok) return [];

        const json: unknown = await res.json();
        const items = getArrayItems(json);

        return items
          .map((b): BookingOption | null => {
            if (!isObj(b)) return null;
            const br = b as Record<string, unknown>;

            const rawId = getUnknown(br, "id_booking") ?? getUnknown(br, "id");
            const idNum = toNumberSafe(rawId);
            if (!idNum || idNum <= 0) return null;

            const rawAgencyId = getUnknown(br, "agency_booking_id");
            const agencyId = toNumberSafe(rawAgencyId);
            const displayId = agencyId || idNum;

            const titularObj = getUnknown(br, "titular");
            let titular = "";

            if (isObj(titularObj)) {
              const tr = titularObj as Record<string, unknown>;
              const first = getStr(tr, "first_name") ?? "";
              const last = getStr(tr, "last_name") ?? "";
              titular = `${first} ${last}`.trim();
            } else {
              titular = getStr(br, "titular_name") ?? "";
            }

            const label = `N° ${displayId}${
              titular ? ` • ${titular}` : ""
            }`.trim();
            const subtitle =
              getStr(br, "details") ?? getStr(br, "title") ?? undefined;

            return {
              id_booking: idNum,
              agency_booking_id: agencyId ?? undefined,
              label,
              subtitle,
            };
          })
          .filter((x): x is BookingOption => x !== null);
      } catch {
        return [];
      }
    };
  }, [searchBookings, token]);

  useEffect(() => {
    if (!enabled) {
      setOptions([]);
      return;
    }
    if (!effectiveSearch) return;

    const raw = bookingQuery
      .trim()
      .replace(/^(#|n[°º]?\s*)/i, "");
    if (raw.length < 2) {
      setOptions([]);
      return;
    }

    let alive = true;
    setLoading(true);

    const t = setTimeout(() => {
      effectiveSearch(raw)
        .then((res) => alive && setOptions(res || []))
        .finally(() => alive && setLoading(false));
    }, 250);

    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [enabled, bookingQuery, effectiveSearch]);

  return {
    bookingQuery,
    setBookingQuery,
    bookingOptions: options,
    loadingBookings: loading,
  };
}
