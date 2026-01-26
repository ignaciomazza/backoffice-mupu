import type { Prisma, PrismaClient } from "@prisma/client";

export type PrismaLike = PrismaClient | Prisma.TransactionClient;
export type StorageScope = "agency" | "group";

export type StorageConfigInfo = {
  id_agency: number;
  enabled: boolean;
  scope: StorageScope;
  storage_pack_count: number;
  transfer_pack_count: number;
  notes?: string | null;
};

export type StorageContext = {
  config: StorageConfigInfo | null;
  scope: StorageScope;
  ownerId: number;
  memberIds: number[];
};

function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

async function getBillingMemberIds(db: PrismaLike, ownerId: number) {
  const members = await db.agency.findMany({
    where: {
      OR: [{ id_agency: ownerId }, { billing_owner_agency_id: ownerId }],
    },
    select: { id_agency: true },
  });
  return members.map((m) => m.id_agency);
}

function normalizeScope(scope?: string | null): StorageScope {
  return scope === "group" ? "group" : "agency";
}

function toStorageConfig(
  config: StorageConfigInfo | null,
): StorageConfigInfo | null {
  if (!config) return null;
  return {
    ...config,
    scope: normalizeScope(config.scope),
  };
}

export async function resolveStorageContext(
  db: PrismaLike,
  agencyId: number,
): Promise<StorageContext> {
  const agency = await db.agency.findUnique({
    where: { id_agency: agencyId },
    select: { id_agency: true, billing_owner_agency_id: true },
  });
  if (!agency) {
    return { config: null, scope: "agency", ownerId: agencyId, memberIds: [agencyId] };
  }

  const ownerId = agency.billing_owner_agency_id ?? agency.id_agency;

  const [ownConfigRaw, ownerConfigRaw] = await Promise.all([
    db.agencyStorageConfig.findUnique({ where: { id_agency: agencyId } }),
    ownerId !== agencyId
      ? db.agencyStorageConfig.findUnique({ where: { id_agency: ownerId } })
      : Promise.resolve(null),
  ]);
  const ownConfig = toStorageConfig(ownConfigRaw as StorageConfigInfo | null);
  const ownerConfig = toStorageConfig(
    ownerConfigRaw as StorageConfigInfo | null,
  );

  if (ownConfig && ownConfig.scope === "agency") {
    return {
      config: ownConfig,
      scope: "agency",
      ownerId,
      memberIds: [agencyId],
    };
  }

  if (ownConfig && ownConfig.scope === "group") {
    const members = await getBillingMemberIds(db, ownerId);
    return {
      config: ownConfig,
      scope: "group",
      ownerId,
      memberIds: members,
    };
  }

  if (ownerConfig && ownerConfig.scope === "group") {
    const members = await getBillingMemberIds(db, ownerId);
    return {
      config: ownerConfig,
      scope: "group",
      ownerId,
      memberIds: members,
    };
  }

  if (ownerConfig && ownerId === agencyId) {
    return {
      config: ownerConfig,
      scope: ownerConfig.scope === "group" ? "group" : "agency",
      ownerId,
      memberIds: [agencyId],
    };
  }

  return { config: null, scope: "agency", ownerId, memberIds: [agencyId] };
}

export async function ensureStorageUsage(
  db: PrismaLike,
  agencyId: number,
  now = new Date(),
) {
  const month = monthStart(now);
  const usage = await db.agencyStorageUsage.findUnique({
    where: { id_agency: agencyId },
  });

  if (!usage) {
    return db.agencyStorageUsage.create({
      data: {
        id_agency: agencyId,
        transfer_month: month,
      },
    });
  }

  if (usage.transfer_month < month) {
    return db.agencyStorageUsage.update({
      where: { id_agency: agencyId },
      data: { transfer_month: month, transfer_bytes: 0 },
    });
  }

  return usage;
}

export async function getUsageTotals(
  db: PrismaLike,
  agencyIds: number[],
  now = new Date(),
  pendingTtlHours = 24,
) {
  let storageBytes = 0;
  let transferBytes = 0;
  let transferMonth: Date | null = null;

  for (const id of agencyIds) {
    const usage = await ensureStorageUsage(db, id, now);
    storageBytes += Number(usage.storage_bytes ?? 0);
    transferBytes += Number(usage.transfer_bytes ?? 0);
    if (!transferMonth || usage.transfer_month < transferMonth) {
      transferMonth = usage.transfer_month;
    }
  }

  const cutoff = new Date(now.getTime() - pendingTtlHours * 60 * 60 * 1000);
  const pending = await db.fileAsset.aggregate({
    where: {
      id_agency: { in: agencyIds },
      status: "pending",
      created_at: { gte: cutoff },
    },
    _sum: { size_bytes: true },
  });

  const pendingBytes = Number(pending._sum.size_bytes ?? 0);

  return {
    storageBytes,
    transferBytes,
    pendingBytes,
    transferMonth: transferMonth ?? monthStart(now),
  };
}

export function isValidScope(value: unknown): value is StorageScope {
  return value === "agency" || value === "group";
}
