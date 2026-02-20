import { issueFiscalForCharge } from "@/services/collections/fiscal/issueOnPaid";

function parseBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = String(process.env[name] || "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on", "si"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

export async function maybeAutorunFiscalForPaidCharges(input: {
  chargeIds: number[];
  actorUserId?: number | null;
}): Promise<{
  enabled: boolean;
  issued: number;
  failed: number;
}> {
  const enabled = parseBooleanEnv("BILLING_FISCAL_AUTORUN", false);
  if (!enabled) {
    return {
      enabled: false,
      issued: 0,
      failed: 0,
    };
  }

  const uniqueChargeIds = Array.from(
    new Set(input.chargeIds.filter((id) => Number.isInteger(id) && id > 0)),
  );

  let issued = 0;
  let failed = 0;

  for (const chargeId of uniqueChargeIds) {
    try {
      const fiscal = await issueFiscalForCharge({
        chargeId,
        actorUserId: input.actorUserId ?? null,
      });
      if (fiscal.ok) issued += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }

  return {
    enabled: true,
    issued,
    failed,
  };
}
