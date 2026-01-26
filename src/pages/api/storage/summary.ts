import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { resolveAuth } from "@/lib/auth";
import {
  calcStorageLimitBytes,
  calcTransferLimitBytes,
  normalizePackCount,
  STORAGE_BASE_GB,
  TRANSFER_BASE_GB,
} from "@/lib/storage/constants";
import { getUsageTotals, resolveStorageContext } from "@/lib/storage/usage";

const WARN_LEVEL = 0.8;
const LIMIT_LEVEL = 1.0;
const BLOCK_LEVEL = 1.1;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const auth = await resolveAuth(req);
  if (!auth) return res.status(401).json({ error: "No autenticado" });

  try {
    const context = await resolveStorageContext(prisma, auth.id_agency);
    const config = context.config;

    const enabled = Boolean(config?.enabled);
    const storagePackCount = normalizePackCount(config?.storage_pack_count ?? 1);
    const transferPackCount = normalizePackCount(config?.transfer_pack_count ?? 1);

    const limits = {
      storage_bytes: enabled ? calcStorageLimitBytes(storagePackCount) : 0,
      transfer_bytes: enabled ? calcTransferLimitBytes(transferPackCount) : 0,
    };

    const usage = await getUsageTotals(prisma, context.memberIds);
    const storagePct = limits.storage_bytes
      ? usage.storageBytes / limits.storage_bytes
      : 0;
    const transferPct = limits.transfer_bytes
      ? usage.transferBytes / limits.transfer_bytes
      : 0;

    const projectedStorage = usage.storageBytes + usage.pendingBytes;
    const blocked =
      enabled &&
      limits.storage_bytes > 0 &&
      projectedStorage >= limits.storage_bytes * BLOCK_LEVEL;

    return res.status(200).json({
      enabled,
      scope: context.scope,
      owner_id: context.ownerId,
      member_count: context.memberIds.length,
      packs: {
        storage: storagePackCount,
        transfer: transferPackCount,
      },
      base_gb: {
        storage: STORAGE_BASE_GB,
        transfer: TRANSFER_BASE_GB,
      },
      limits,
      usage: {
        storage_bytes: usage.storageBytes,
        transfer_bytes: usage.transferBytes,
        pending_bytes: usage.pendingBytes,
        transfer_month: usage.transferMonth,
      },
      percent: {
        storage: storagePct,
        transfer: transferPct,
      },
      thresholds: {
        warn: WARN_LEVEL,
        limit: LIMIT_LEVEL,
        block: BLOCK_LEVEL,
      },
      blocked,
    });
  } catch (error) {
    console.error("[storage/summary]", error);
    return res.status(500).json({ error: "Error al obtener almacenamiento" });
  }
}
