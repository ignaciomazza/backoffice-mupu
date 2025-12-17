// src/hooks/receipts/useFinancePicks.ts
"use client";

import { useEffect, useMemo, useState } from "react";
import { loadFinancePicks } from "@/utils/loadFinancePicks";
import type { FinancePicks, FinanceAccount, FinanceCurrency, FinancePaymentMethod } from "@/types/receipts";

export function useFinancePicks(token: string | null) {
  const [picks, setPicks] = useState<FinancePicks>({
    accounts: [],
    paymentMethods: [],
    currencies: [],
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setPicks({ accounts: [], paymentMethods: [], currencies: [] });
      return;
    }
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const raw = await loadFinancePicks(token);
        if (!alive) return;
        setPicks({
          accounts: raw?.accounts ?? [],
          paymentMethods: raw?.paymentMethods ?? [],
          currencies: raw?.currencies ?? [],
        });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  const paymentMethods = useMemo(
    () => (picks.paymentMethods ?? []) as FinancePaymentMethod[],
    [picks.paymentMethods],
  );
  const accounts = useMemo(
    () => (picks.accounts ?? []) as FinanceAccount[],
    [picks.accounts],
  );
  const currencies = useMemo(
    () => (picks.currencies ?? []) as FinanceCurrency[],
    [picks.currencies],
  );

  return { picks, loading, paymentMethods, accounts, currencies };
}
