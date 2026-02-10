// src/services/afip/manualTotals.ts
export type ManualTotalsInput = {
  total?: number;
  base21?: number;
  iva21?: number;
  base10_5?: number;
  iva10_5?: number;
  exempt?: number;
};

export type ManualTotalsResult = {
  impTotal: number;
  impNeto: number;
  impIVA: number;
  ivaEntries: Array<{ Id: number; BaseImp: number; Importe: number }>;
};

const round2 = (value: number) => Number(value.toFixed(2));

const normalize = (value?: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

export function computeManualTotals(
  input: ManualTotalsInput,
):
  | { ok: true; result: ManualTotalsResult }
  | { ok: false; error: string } {
  const totalInput = input.total;
  const base21 = round2(normalize(input.base21));
  const iva21 = round2(normalize(input.iva21));
  const base10 = round2(normalize(input.base10_5));
  const iva10 = round2(normalize(input.iva10_5));
  const exemptInput = round2(normalize(input.exempt));

  const hasNegative = [
    totalInput,
    base21,
    iva21,
    base10,
    iva10,
    exemptInput,
  ].some((v) => typeof v === "number" && v < 0);
  if (hasNegative) {
    return {
      ok: false,
      error: "Importes manuales: no se permiten valores negativos.",
    };
  }

  const hasAny = [
    totalInput,
    base21,
    iva21,
    base10,
    iva10,
    exemptInput,
  ].some((v) => typeof v === "number" && v > 0);
  if (!hasAny) {
    return { ok: false, error: "Importes manuales vacíos." };
  }

  const ivaSum = round2(iva21 + iva10);
  const baseSum = round2(base21 + base10);
  const totalFromParts = round2(baseSum + exemptInput + ivaSum);

  const hasParts = base21 > 0 || base10 > 0 || ivaSum > 0 || exemptInput > 0;

  if ((base21 > 0 && iva21 <= 0) || (iva21 > 0 && base21 <= 0)) {
    return {
      ok: false,
      error: "Importes manuales: la base e IVA 21% deben cargarse juntos.",
    };
  }

  if ((base10 > 0 && iva10 <= 0) || (iva10 > 0 && base10 <= 0)) {
    return {
      ok: false,
      error: "Importes manuales: la base e IVA 10,5% deben cargarse juntos.",
    };
  }

  if (base21 > 0 && iva21 > 0) {
    const expected = round2(base21 * 0.21);
    if (Math.abs(iva21 - expected) > 0.05) {
      return {
        ok: false,
        error:
          "Importes manuales: el IVA 21% no coincide con la base gravada.",
      };
    }
  }

  if (base10 > 0 && iva10 > 0) {
    const expected = round2(base10 * 0.105);
    if (Math.abs(iva10 - expected) > 0.05) {
      return {
        ok: false,
        error:
          "Importes manuales: el IVA 10,5% no coincide con la base gravada.",
      };
    }
  }

  const total =
    typeof totalInput === "number" &&
    Number.isFinite(totalInput) &&
    totalInput > 0
      ? round2(totalInput)
      : totalFromParts;

  if (total <= 0) {
    return { ok: false, error: "Importe total manual inválido." };
  }

  if (
    typeof totalInput === "number" &&
    Number.isFinite(totalInput) &&
    totalInput > 0 &&
    hasParts &&
    Math.abs(total - totalFromParts) > 0.05
  ) {
    return {
      ok: false,
      error:
        "Importes manuales: el total no coincide con la suma de bases, IVA y exento.",
    };
  }

  if (ivaSum - total > 0.01) {
    return {
      ok: false,
      error: "Importes manuales: el total es menor al IVA.",
    };
  }

  const neto = round2(total - ivaSum);
  if (neto + 0.01 < baseSum) {
    return {
      ok: false,
      error: "Importes manuales: la suma de bases supera el neto.",
    };
  }

  const diff = round2(neto - baseSum - exemptInput);
  if (diff < -0.01) {
    return {
      ok: false,
      error: "Importes manuales: el exento supera el neto.",
    };
  }

  const exempt = round2(exemptInput + Math.max(diff, 0));

  const ivaEntries: Array<{ Id: number; BaseImp: number; Importe: number }> = [];
  if (base21 || iva21) {
    ivaEntries.push({ Id: 5, BaseImp: base21, Importe: iva21 });
  }
  if (base10 || iva10) {
    ivaEntries.push({ Id: 4, BaseImp: base10, Importe: iva10 });
  }
  if (exempt > 0) {
    ivaEntries.push({ Id: 3, BaseImp: exempt, Importe: 0 });
  }

  return {
    ok: true,
    result: {
      impTotal: total,
      impNeto: neto,
      impIVA: ivaSum,
      ivaEntries,
    },
  };
}

export function splitManualTotalsByClient(
  input: ManualTotalsInput,
  count: number,
): ManualTotalsInput[] {
  if (!Number.isFinite(count) || count <= 1) return [input];

  const entries: ManualTotalsInput[] = Array.from({ length: count }, () => ({}));

  const keys: Array<keyof ManualTotalsInput> = [
    "total",
    "base21",
    "iva21",
    "base10_5",
    "iva10_5",
    "exempt",
  ];

  keys.forEach((key) => {
    const raw = input[key];
    if (typeof raw !== "number" || !Number.isFinite(raw)) return;

    const per = round2(raw / count);
    for (let i = 0; i < count; i += 1) {
      entries[i][key] = per;
    }

    const sum = round2(per * count);
    const diff = round2(raw - sum);
    if (Math.abs(diff) >= 0.01) {
      const last = entries[count - 1][key] ?? 0;
      entries[count - 1][key] = round2(last + diff);
    }
  });

  return entries;
}

function normalizeShares(shares: number[]): number[] {
  if (!Array.isArray(shares) || shares.length === 0) return [1];
  const cleaned = shares.map((s) =>
    Number.isFinite(s) && s > 0 ? Number(s) : 0,
  );
  const sum = cleaned.reduce((acc, s) => acc + s, 0);
  if (sum <= 0) {
    const fallback = 1 / cleaned.length;
    return cleaned.map(() => fallback);
  }
  return cleaned.map((s) => s / sum);
}

function splitNumberByShares(value: number, shares: number[]): number[] {
  const normalized = normalizeShares(shares);
  if (normalized.length === 1) return [round2(value)];

  const out = normalized.map((share) => round2(value * share));
  const sum = round2(out.reduce((acc, n) => acc + n, 0));
  const diff = round2(value - sum);
  if (Math.abs(diff) >= 0.01) {
    out[out.length - 1] = round2(out[out.length - 1] + diff);
  }
  return out;
}

export function splitManualTotalsByShares(
  input: ManualTotalsInput,
  shares: number[],
): ManualTotalsInput[] {
  const normalized = normalizeShares(shares);
  if (normalized.length <= 1) return [input];

  const entries: ManualTotalsInput[] = Array.from(
    { length: normalized.length },
    () => ({}),
  );

  const keys: Array<keyof ManualTotalsInput> = [
    "total",
    "base21",
    "iva21",
    "base10_5",
    "iva10_5",
    "exempt",
  ];

  keys.forEach((key) => {
    const raw = input[key];
    if (typeof raw !== "number" || !Number.isFinite(raw)) return;
    const chunks = splitNumberByShares(raw, normalized);
    chunks.forEach((value, idx) => {
      entries[idx][key] = value;
    });
  });

  return entries;
}
