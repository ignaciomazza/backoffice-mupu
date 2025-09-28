// src/lib/agencyUser.ts
"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/utils/authFetch";
import type { Agency, CurrentUser } from "@/types/templates";

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Hook compartido para obtener agencia + usuario actual.
 * - Cachea en estado local del componente.
 * - Sin SWR para mantener dependencias mínimas.
 */
export function useAgencyAndUser(token?: string | null) {
  const [agency, setAgency] = useState<Agency>({});
  const [user, setUser] = useState<CurrentUser>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    if (!token) {
      setAgency({});
      setUser({});
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
        const nextAgency = isObject(agJson) ? (agJson as Agency) : {};
        if (mounted) setAgency(nextAgency);

        const meRes = await authFetch(
          "/api/user/profile",
          { cache: "no-store" },
          token,
        );
        const meJson = (await meRes.json().catch(() => ({}))) as unknown;
        const nextUser = isObject(meJson) ? (meJson as CurrentUser) : {};
        if (mounted) setUser(nextUser);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [token]);

  return { agency, user, loading };
}
