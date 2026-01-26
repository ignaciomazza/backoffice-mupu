"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import { formatBytes } from "@/lib/storage/constants";
import { normalizeRole } from "@/utils/permissions";

const ROLES = ["gerente", "administrativo", "desarrollador"];

type StorageSummary = {
  enabled: boolean;
  limits: { storage_bytes: number };
  usage: { storage_bytes: number };
  percent: { storage: number };
  blocked: boolean;
};

type Props = { role?: string | null };

export default function StorageUsageBanner({ role }: Props) {
  const { token } = useAuth();
  const [summary, setSummary] = useState<StorageSummary | null>(null);

  const allowed = role ? ROLES.includes(normalizeRole(role)) : false;

  useEffect(() => {
    if (!token || !allowed) return;
    (async () => {
      try {
        const res = await authFetch("/api/storage/summary", {}, token);
        if (!res.ok) return;
        const data = (await res.json()) as StorageSummary;
        setSummary(data);
      } catch (err) {
        console.error("[storage-banner]", err);
      }
    })();
  }, [allowed, token]);

  const status = useMemo(() => {
    if (!summary?.enabled) return null;
    const pct = summary.percent?.storage ?? 0;
    if (pct >= 1.1 || summary.blocked) return "blocked";
    if (pct >= 1) return "full";
    if (pct >= 0.8) return "warn";
    return null;
  }, [summary]);

  if (!allowed || !summary?.enabled || !status) return null;

  const tone =
    status === "blocked"
      ? "border-rose-200/40 bg-rose-50/70 text-rose-900 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-100"
      : status === "full"
        ? "border-amber-200/40 bg-amber-50/70 text-amber-900 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-100"
        : "border-sky-200/40 bg-sky-50/70 text-sky-900 dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-100";

  const headline =
    status === "blocked"
      ? "Almacenamiento bloqueado"
      : status === "full"
        ? "Almacenamiento al 100%"
        : "Almacenamiento al 80%";

  const detail = summary.limits?.storage_bytes
    ? `${formatBytes(summary.usage.storage_bytes)} usados de ${formatBytes(summary.limits.storage_bytes)}`
    : "";

  return (
    <div className={`mb-6 w-full max-w-5xl rounded-2xl border p-4 text-sm ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">{headline}</p>
          <p className="text-xs opacity-80">{detail}</p>
        </div>
        {status === "blocked" && (
          <span className="text-xs font-semibold">
            Se bloquean nuevas subidas hasta ampliar el cupo.
          </span>
        )}
      </div>
    </div>
  );
}
