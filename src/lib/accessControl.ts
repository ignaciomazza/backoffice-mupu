import prisma from "@/lib/prisma";
import { isMissingColumnError } from "@/lib/prismaErrors";
import {
  canAccessAnyFinanceSection,
  canAccessBookingComponent,
  canAccessFinanceSection,
  normalizeBookingComponentRules,
  normalizeFinanceSectionRules,
  pickBookingComponentRule,
  pickFinanceSectionRule,
  type BookingComponentKey,
  type FinanceSectionKey,
} from "@/utils/permissions";

export async function getFinanceSectionGrants(
  id_agency?: number | null,
  id_user?: number | null,
): Promise<FinanceSectionKey[]> {
  if (!id_agency || !id_user) return [];
  try {
    const config = await prisma.financeConfig.findFirst({
      where: { id_agency },
      select: { section_access_rules: true },
    });
    const rules = normalizeFinanceSectionRules(config?.section_access_rules);
    const rule = pickFinanceSectionRule(rules, id_user);
    return rule?.sections ?? [];
  } catch (error) {
    if (isMissingColumnError(error, "FinanceConfig.section_access_rules")) {
      return [];
    }
    throw error;
  }
}

export async function getBookingComponentGrants(
  id_agency?: number | null,
  id_user?: number | null,
): Promise<BookingComponentKey[]> {
  if (!id_agency || !id_user) return [];
  try {
    const config = await prisma.serviceCalcConfig.findUnique({
      where: { id_agency },
      select: { booking_access_rules: true },
    });
    const rules = normalizeBookingComponentRules(config?.booking_access_rules);
    const rule = pickBookingComponentRule(rules, id_user);
    return rule?.components ?? [];
  } catch (error) {
    if (isMissingColumnError(error, "ServiceCalcConfig.booking_access_rules")) {
      return [];
    }
    throw error;
  }
}

export async function getFinancePicksAccess(
  id_agency: number,
  id_user: number,
  role: string,
): Promise<{ canRead: boolean; canWrite: boolean }> {
  const financeGrants = await getFinanceSectionGrants(id_agency, id_user);
  const bookingGrants = await getBookingComponentGrants(id_agency, id_user);
  const canRead =
    canAccessAnyFinanceSection(role, financeGrants) ||
    canAccessBookingComponent(role, bookingGrants, "receipts_form") ||
    canAccessBookingComponent(role, bookingGrants, "operator_payments");
  const canWrite = canAccessFinanceSection(
    role,
    financeGrants,
    "finance_config",
  );
  return { canRead, canWrite };
}
