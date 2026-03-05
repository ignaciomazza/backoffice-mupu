import type { Service } from "@/types";

export type GroupFinanceContextClient = {
  id_client: number;
  agency_client_id?: number | null;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
};

export type GroupFinanceContext = {
  id_context?: number | null;
  id_booking: number;
  agency_context_id?: number | null;
  agency_booking_id?: number | null;
  titular?: GroupFinanceContextClient | null;
  clients?: GroupFinanceContextClient[];
  services?: Service[];
};

export type GroupFinanceContextOption = {
  id_context: number;
  agency_context_id?: number | null;
  label: string;
  subtitle?: string;
};

export function resolveGroupFinanceContextId(
  context?: GroupFinanceContext | null,
): number | null {
  const value = Number(context?.id_context ?? context?.id_booking ?? 0);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.trunc(value);
}

export function resolveGroupFinanceContextAgencyId(
  context?: GroupFinanceContext | null,
): number | null {
  const value = Number(
    context?.agency_context_id ?? context?.agency_booking_id ?? 0,
  );
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.trunc(value);
}
