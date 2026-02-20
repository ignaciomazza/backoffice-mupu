import type { BillingFallbackProvider } from "@prisma/client";
import { CigQrFallbackProvider } from "@/services/collections/fallback/providers/cigQrProvider";
import { MercadoPagoFallbackProviderStub } from "@/services/collections/fallback/providers/mpStubProvider";
import type { BillingFallbackProviderContract } from "@/services/collections/fallback/providers/types";

const cigProvider = new CigQrFallbackProvider();
const mpProvider = new MercadoPagoFallbackProviderStub();

export function resolveFallbackProvider(
  provider: BillingFallbackProvider,
): BillingFallbackProviderContract {
  if (provider === "MP") return mpProvider;
  if (provider === "CIG_QR") return cigProvider;
  return cigProvider;
}
