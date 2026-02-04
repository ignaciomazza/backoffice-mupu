import type {
  CommissionOverrides,
  CommissionRule,
  CommissionScope,
} from "@/types/commission";

const round2 = (n: number) => Math.round(n * 100) / 100;
const clampPct = (n: number) => Math.min(Math.max(n, 0), 100);

type ToPctFn = (value: unknown) => number | null;

function toPctStrict(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const raw =
    typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
  if (!Number.isFinite(raw)) return null;
  if (raw < 0 || raw > 100) return null;
  return round2(raw);
}

function toPctClamped(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const raw =
    typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
  if (!Number.isFinite(raw)) return null;
  return round2(clampPct(raw));
}

function normalizeLeaders(
  raw: unknown,
  toPctFn: ToPctFn,
): Record<string, number> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [keyRaw, val] of Object.entries(obj)) {
    const key = String(keyRaw || "").trim();
    if (!key) continue;
    const pct = toPctFn(val);
    if (pct == null) continue;
    out[key] = pct;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeScope(raw: unknown, toPctFn: ToPctFn): CommissionScope | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const sellerPct = toPctFn(
    obj.seller_pct ??
      obj.sellerPct ??
      obj.seller ??
      obj.owner_pct ??
      obj.ownerPct,
  );
  const leaders = normalizeLeaders(obj.leaders ?? obj.leader_pcts, toPctFn);
  if (sellerPct == null && !leaders) return null;
  return {
    ...(sellerPct != null ? { sellerPct } : {}),
    ...(leaders ? { leaders } : {}),
  };
}

function normalizeScopeMap(
  raw: unknown,
  kind: "currency" | "service",
  toPctFn: ToPctFn,
): Record<string, CommissionScope> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  const out: Record<string, CommissionScope> = {};
  for (const [keyRaw, val] of Object.entries(obj)) {
    const scope = normalizeScope(val, toPctFn);
    if (!scope) continue;
    if (kind === "currency") {
      const key = String(keyRaw || "").trim().toUpperCase();
      if (!key) continue;
      out[key] = scope;
    } else {
      const id = Number(keyRaw);
      if (!Number.isFinite(id) || id <= 0) continue;
      out[String(id)] = scope;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeCommissionOverridesInternal(
  raw: unknown,
  toPctFn: ToPctFn,
): CommissionOverrides | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const booking = normalizeScope(
    obj.booking ?? obj.general ?? obj.reserva,
    toPctFn,
  );
  const currency = normalizeScopeMap(obj.currency, "currency", toPctFn);
  const service = normalizeScopeMap(obj.service, "service", toPctFn);

  if (!booking && !currency && !service) return null;
  return {
    ...(booking ? { booking } : {}),
    ...(currency ? { currency } : {}),
    ...(service ? { service } : {}),
  };
}

export function normalizeCommissionOverrides(
  raw: unknown,
): CommissionOverrides | null {
  return normalizeCommissionOverridesInternal(raw, toPctStrict);
}

export function normalizeCommissionOverridesLenient(
  raw: unknown,
): CommissionOverrides | null {
  return normalizeCommissionOverridesInternal(raw, toPctClamped);
}

function sanitizeScope(scope?: CommissionScope): CommissionScope | null {
  if (!scope) return null;
  const sellerRaw =
    typeof scope.sellerPct === "number" && Number.isFinite(scope.sellerPct)
      ? scope.sellerPct
      : null;
  const sellerPct = sellerRaw != null ? round2(clampPct(sellerRaw)) : null;
  const leadersRaw = scope.leaders || {};
  const leaders: Record<string, number> = {};
  for (const [key, val] of Object.entries(leadersRaw)) {
    const raw = Number(val);
    if (!Number.isFinite(raw)) continue;
    leaders[String(key)] = round2(clampPct(raw));
  }
  const hasLeaders = Object.keys(leaders).length > 0;
  if (sellerPct == null && !hasLeaders) return null;

  const sellerForSum = sellerPct ?? 0;
  let leadersSum = Object.values(leaders).reduce((sum, pct) => sum + pct, 0);
  if (sellerForSum + leadersSum > 100.0001 && leadersSum > 0) {
    const available = Math.max(0, 100 - sellerForSum);
    const factor = available / leadersSum;
    const keys = Object.keys(leaders);
    let scaledSum = 0;
    keys.forEach((k) => {
      const scaled = round2(leaders[k] * factor);
      leaders[k] = scaled;
      scaledSum += scaled;
    });
    const newTotal = sellerForSum + scaledSum;
    if (newTotal > 100.0001 && keys.length > 0) {
      const lastKey = keys[keys.length - 1];
      const diff = newTotal - 100;
      leaders[lastKey] = round2(Math.max(0, leaders[lastKey] - diff));
    }
    leadersSum = Object.values(leaders).reduce((sum, pct) => sum + pct, 0);
  }

  return {
    ...(sellerPct != null ? { sellerPct } : {}),
    ...(Object.keys(leaders).length > 0 ? { leaders } : {}),
  };
}

export function sanitizeCommissionOverrides(
  overrides: CommissionOverrides | null,
): CommissionOverrides | null {
  if (!overrides) return null;
  const booking = sanitizeScope(overrides.booking);
  const currency = overrides.currency
    ? Object.fromEntries(
        Object.entries(overrides.currency)
          .map(([cur, scope]) => [cur, sanitizeScope(scope)])
          .filter(([, scope]) => scope),
      )
    : undefined;
  const service = overrides.service
    ? Object.fromEntries(
        Object.entries(overrides.service)
          .map(([sid, scope]) => [sid, sanitizeScope(scope)])
          .filter(([, scope]) => scope),
      )
    : undefined;

  const hasCurrency = currency && Object.keys(currency).length > 0;
  const hasService = service && Object.keys(service).length > 0;
  if (!booking && !hasCurrency && !hasService) return null;
  return {
    ...(booking ? { booking } : {}),
    ...(hasCurrency ? { currency } : {}),
    ...(hasService ? { service } : {}),
  };
}

export function pruneOverridesByLeaderIds(
  overrides: CommissionOverrides | null,
  leaderIds: number[],
): CommissionOverrides | null {
  if (!overrides) return null;
  const allowed = new Set(leaderIds.map((id) => String(id)));

  const pruneScope = (scope?: CommissionScope): CommissionScope | null => {
    if (!scope) return null;
    const sellerPct =
      typeof scope.sellerPct === "number" ? scope.sellerPct : null;
    const leadersRaw = scope.leaders || {};
    const leaders: Record<string, number> = {};
    for (const [key, val] of Object.entries(leadersRaw)) {
      if (!allowed.has(String(key))) continue;
      if (typeof val === "number" && Number.isFinite(val)) leaders[key] = val;
    }
    const hasLeaders = Object.keys(leaders).length > 0;
    if (sellerPct == null && !hasLeaders) return null;
    return {
      ...(sellerPct != null ? { sellerPct } : {}),
      ...(hasLeaders ? { leaders } : {}),
    };
  };

  const booking = pruneScope(overrides.booking);
  const currency = overrides.currency
    ? Object.fromEntries(
        Object.entries(overrides.currency)
          .map(([cur, scope]) => [cur, pruneScope(scope)])
          .filter(([, scope]) => scope),
      )
    : undefined;
  const service = overrides.service
    ? Object.fromEntries(
        Object.entries(overrides.service)
          .map(([sid, scope]) => [sid, pruneScope(scope)])
          .filter(([, scope]) => scope),
      )
    : undefined;

  const hasCurrency = currency && Object.keys(currency).length > 0;
  const hasService = service && Object.keys(service).length > 0;

  if (!booking && !hasCurrency && !hasService) return null;
  return {
    ...(booking ? { booking } : {}),
    ...(hasCurrency ? { currency } : {}),
    ...(hasService ? { service } : {}),
  };
}

export function resolveCommissionForContext(args: {
  rule: CommissionRule;
  overrides?: CommissionOverrides | null;
  currency?: string | null;
  serviceId?: number | string | null;
  allowService?: boolean;
}): { sellerPct: number; leaderPcts: Record<number, number> } {
  const { rule, overrides, currency, serviceId, allowService } = args;
  const chain: CommissionScope[] = [];

  if (allowService !== false && serviceId != null && overrides?.service) {
    const key = String(serviceId);
    const scope = overrides.service[key];
    if (scope) chain.push(scope);
  }
  if (currency && overrides?.currency) {
    const key = String(currency).trim().toUpperCase();
    const scope = overrides.currency[key];
    if (scope) chain.push(scope);
  }
  if (overrides?.booking) chain.push(overrides.booking);

  let sellerPct = rule.sellerPct;
  for (const scope of chain) {
    if (typeof scope.sellerPct === "number" && Number.isFinite(scope.sellerPct)) {
      sellerPct = scope.sellerPct;
      break;
    }
  }

  const leaderPcts: Record<number, number> = {};
  for (const leader of rule.leaders) {
    let pct: number | null = null;
    for (const scope of chain) {
      const raw = scope.leaders?.[String(leader.userId)];
      if (typeof raw === "number" && Number.isFinite(raw)) {
        pct = raw;
        break;
      }
    }
    leaderPcts[leader.userId] = pct != null ? pct : leader.pct;
  }

  return { sellerPct, leaderPcts };
}
