"use client";

import { useEffect, useMemo, useState } from "react";
import type { GroupFinanceContextOption } from "@/components/groups/finance/contextTypes";

const MIN_SEARCH_LEN = 2;

const toPositiveInt = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
};

const normalizeOption = (
  value: unknown,
): GroupFinanceContextOption | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = toPositiveInt(row.id_context ?? row.id_booking ?? row.id);
  if (!id) return null;
  const agencyId = toPositiveInt(
    row.agency_context_id ?? row.agency_booking_id,
  );
  const label =
    typeof row.label === "string" && row.label.trim().length > 0
      ? row.label.trim()
      : `N° ${agencyId ?? id}`;
  const subtitle =
    typeof row.subtitle === "string" && row.subtitle.trim().length > 0
      ? row.subtitle.trim()
      : undefined;

  return {
    id_context: id,
    agency_context_id: agencyId,
    label,
    subtitle,
  };
};

export function useGroupContextSearch(args: {
  enabled: boolean;
  searchContexts?: (q: string) => Promise<GroupFinanceContextOption[]>;
}) {
  const { enabled, searchContexts } = args;

  const [contextQuery, setContextQuery] = useState("");
  const [contextOptions, setContextOptions] = useState<GroupFinanceContextOption[]>(
    [],
  );
  const [loadingContexts, setLoadingContexts] = useState(false);

  const effectiveSearch = useMemo<
    ((q: string) => Promise<GroupFinanceContextOption[]>) | undefined
  >(() => {
    if (!searchContexts) return undefined;
    return async (query: string) => {
      try {
        const list = await searchContexts(query);
        if (!Array.isArray(list)) return [];
        return list
          .map((item) => normalizeOption(item))
          .filter((item): item is GroupFinanceContextOption => item !== null);
      } catch {
        return [];
      }
    };
  }, [searchContexts]);

  useEffect(() => {
    if (!enabled) {
      setContextOptions([]);
      return;
    }
    if (!effectiveSearch) {
      setContextOptions([]);
      return;
    }

    const normalizedQuery = contextQuery
      .trim()
      .replace(/^(#|n[°º]?\s*)/i, "");
    if (normalizedQuery.length < MIN_SEARCH_LEN) {
      setContextOptions([]);
      return;
    }

    let alive = true;
    setLoadingContexts(true);

    const timer = setTimeout(() => {
      effectiveSearch(normalizedQuery)
        .then((options) => {
          if (!alive) return;
          setContextOptions(options || []);
        })
        .finally(() => {
          if (alive) setLoadingContexts(false);
        });
    }, 250);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [contextQuery, effectiveSearch, enabled]);

  return {
    contextQuery,
    setContextQuery,
    contextOptions,
    loadingContexts,
  };
}
