import prisma from "@/lib/prisma";
import { isMissingColumnError } from "@/lib/prismaErrors";
import {
  canManageResourceSection,
  resolveCalendarVisibility,
  normalizeResourceSectionRules,
  pickResourceSectionRule,
  type CalendarVisibilityMode,
  type ResourceSectionAccessRule,
  type ResourceSectionKey,
} from "@/utils/permissions";

type PrismaKnownRequestError = {
  code?: string;
  message?: string;
};

export type ResourceAccessGrant = {
  rule: ResourceSectionAccessRule | null;
  hasCustomRule: boolean;
};

function isMissingResourceConfigTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as PrismaKnownRequestError;
  if (err.code === "P2021") return true;
  if (typeof err.message !== "string") return false;
  return err.message.includes("ResourceConfig");
}

function isResourceConfigSchemaError(error: unknown): boolean {
  return (
    isMissingResourceConfigTable(error) ||
    isMissingColumnError(error, "ResourceConfig.access_rules")
  );
}

export async function getResourceAccessGrant(
  id_agency?: number | null,
  id_user?: number | null,
): Promise<ResourceAccessGrant> {
  if (!id_agency || !id_user) {
    return { rule: null, hasCustomRule: false };
  }

  try {
    const config = await prisma.resourceConfig.findUnique({
      where: { id_agency },
      select: { access_rules: true },
    });
    const rules = normalizeResourceSectionRules(config?.access_rules);
    const ownRule = pickResourceSectionRule(rules, id_user);
    return {
      rule: ownRule ?? null,
      hasCustomRule: Boolean(ownRule),
    };
  } catch (error) {
    if (isResourceConfigSchemaError(error)) {
      return { rule: null, hasCustomRule: false };
    }
    throw error;
  }
}

export async function canManageResourceSectionByUser(params: {
  id_agency?: number | null;
  id_user?: number | null;
  role?: string | null;
  key: ResourceSectionKey;
}): Promise<boolean> {
  const grant = await getResourceAccessGrant(params.id_agency, params.id_user);
  return canManageResourceSection(
    params.role,
    grant.rule?.sections ?? [],
    params.key,
    grant.hasCustomRule,
  );
}

export async function resolveCalendarVisibilityByUser(params: {
  id_agency?: number | null;
  id_user?: number | null;
  role?: string | null;
}): Promise<CalendarVisibilityMode> {
  const grant = await getResourceAccessGrant(params.id_agency, params.id_user);
  return resolveCalendarVisibility(params.role, grant.rule, grant.hasCustomRule);
}
