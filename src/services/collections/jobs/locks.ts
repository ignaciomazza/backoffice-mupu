import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

export type AcquireBillingJobLockInput = {
  lockKey: string;
  ownerRunId: string;
  ttlSeconds: number;
  metadata?: Record<string, unknown>;
  now?: Date;
};

export type AcquireBillingJobLockResult =
  | {
      acquired: true;
      lockKey: string;
      acquiredAt: Date;
      expiresAt: Date;
    }
  | {
      acquired: false;
      lockKey: string;
      reason: "LOCKED";
    };

function asJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isUniqueViolation(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2002";
  }
  const code =
    error && typeof error === "object" && "code" in error
      ? (error as { code?: unknown }).code
      : null;
  return code === "P2002";
}

export async function acquireBillingJobLock(
  input: AcquireBillingJobLockInput,
): Promise<AcquireBillingJobLockResult> {
  const now = input.now || new Date();
  const acquiredAt = new Date(now);
  const expiresAt = new Date(now.getTime() + Math.max(1, input.ttlSeconds) * 1000);
  const metadata = asJson(input.metadata);

  try {
    await prisma.billingJobLock.create({
      data: {
        lock_key: input.lockKey,
        acquired_at: acquiredAt,
        expires_at: expiresAt,
        owner_run_id: input.ownerRunId,
        metadata,
        released_at: null,
      },
    });

    return {
      acquired: true,
      lockKey: input.lockKey,
      acquiredAt,
      expiresAt,
    };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }

  const refreshed = await prisma.billingJobLock.updateMany({
    where: {
      lock_key: input.lockKey,
      OR: [{ expires_at: { lte: now } }, { released_at: { not: null } }],
    },
    data: {
      acquired_at: acquiredAt,
      expires_at: expiresAt,
      owner_run_id: input.ownerRunId,
      metadata,
      released_at: null,
    },
  });

  if (refreshed.count > 0) {
    return {
      acquired: true,
      lockKey: input.lockKey,
      acquiredAt,
      expiresAt,
    };
  }

  return {
    acquired: false,
    lockKey: input.lockKey,
    reason: "LOCKED",
  };
}

export async function releaseBillingJobLock(input: {
  lockKey: string;
  ownerRunId?: string;
  now?: Date;
}): Promise<boolean> {
  const now = input.now || new Date();
  const where =
    input.ownerRunId && input.ownerRunId.trim()
      ? {
          lock_key: input.lockKey,
          owner_run_id: input.ownerRunId,
          released_at: null,
        }
      : {
          lock_key: input.lockKey,
          released_at: null,
        };

  const updated = await prisma.billingJobLock.updateMany({
    where,
    data: {
      released_at: now,
    },
  });

  return updated.count > 0;
}

export async function getBillingJobLockStatus(input: {
  lockKey: string;
  now?: Date;
}): Promise<{
  exists: boolean;
  active: boolean;
  expiresAt: Date | null;
  releasedAt: Date | null;
}> {
  const lock = await prisma.billingJobLock.findUnique({
    where: { lock_key: input.lockKey },
    select: {
      expires_at: true,
      released_at: true,
    },
  });

  if (!lock) {
    return {
      exists: false,
      active: false,
      expiresAt: null,
      releasedAt: null,
    };
  }

  const now = input.now || new Date();
  const active = !lock.released_at && lock.expires_at.getTime() > now.getTime();

  return {
    exists: true,
    active,
    expiresAt: lock.expires_at,
    releasedAt: lock.released_at,
  };
}
