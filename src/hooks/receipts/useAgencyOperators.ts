// src/hooks/receipts/useAgencyOperators.ts
"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/utils/authFetch";

export type OperatorLite = { id_operator: number; name: string };

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function useAgencyOperators(token: string | null) {
  const [agencyId, setAgencyId] = useState<number | null>(null);
  const [operators, setOperators] = useState<OperatorLite[]>([]);

  useEffect(() => {
    if (!token) return;
    const ac = new AbortController();

    (async () => {
      try {
        const pr = await authFetch(
          "/api/user/profile",
          { cache: "no-store", signal: ac.signal },
          token,
        );
        const pj = (await safeJson<{ id_agency?: number }>(pr)) ?? {};
        const ag = pj?.id_agency ?? null;
        setAgencyId(ag);

        if (ag != null) {
          const or = await authFetch(
            `/api/operators?agencyId=${ag}`,
            { cache: "no-store", signal: ac.signal },
            token,
          );
          if (or.ok) {
            const list = ((await safeJson<OperatorLite[]>(or)) ?? []).sort(
              (a, b) => (a.name || "").localeCompare(b.name || "", "es"),
            );
            setOperators(list);
          } else {
            setOperators([]);
          }
        } else {
          setOperators([]);
        }
      } catch {
        setOperators([]);
      }
    })();

    return () => ac.abort();
  }, [token]);

  return { agencyId, operators };
}
