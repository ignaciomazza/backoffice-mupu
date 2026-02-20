import { randomUUID } from "node:crypto";
import type { BillingJobRunStatus, BillingJobSource, Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

export type BillingJobName =
  | "run_anchor_daily"
  | "prepare_pd_batch"
  | "export_pd_batch"
  | "reconcile_pd_batch"
  | "fallback_create"
  | "fallback_status_sync";

export type BillingJobCounters = Record<string, number | string | boolean | null>;
export type BillingJobMetadata = Record<string, unknown>;

function asJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function safeObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function startBillingJobRun(input: {
  jobName: BillingJobName;
  source: BillingJobSource;
  targetDateAr?: string | null;
  adapter?: string | null;
  actorUserId?: number | null;
  metadata?: BillingJobMetadata;
  runId?: string;
}): Promise<{
  id: number;
  runId: string;
  startedAt: Date;
}> {
  const runId = input.runId?.trim() || randomUUID();

  const row = await prisma.billingJobRun.create({
    data: {
      job_name: input.jobName,
      run_id: runId,
      source: input.source,
      status: "RUNNING",
      target_date_ar: input.targetDateAr ?? null,
      adapter: input.adapter ?? null,
      metadata_json: asJson(input.metadata),
      created_by: input.actorUserId ?? null,
    },
    select: {
      id_job_run: true,
      run_id: true,
      started_at: true,
    },
  });

  return {
    id: row.id_job_run,
    runId: row.run_id,
    startedAt: row.started_at,
  };
}

export async function finishBillingJobRun(input: {
  id: number;
  status: Exclude<BillingJobRunStatus, "RUNNING">;
  counters?: BillingJobCounters;
  metadata?: BillingJobMetadata;
  errorMessage?: string | null;
  errorStack?: string | null;
  finishedAt?: Date;
}): Promise<void> {
  const existing = await prisma.billingJobRun.findUnique({
    where: { id_job_run: input.id },
    select: {
      id_job_run: true,
      started_at: true,
      metadata_json: true,
    },
  });

  if (!existing) return;

  const finishedAt = input.finishedAt || new Date();
  const durationMs = Math.max(0, finishedAt.getTime() - existing.started_at.getTime());
  const mergedMetadata = {
    ...(safeObject(existing.metadata_json) || {}),
    ...(input.metadata || {}),
  };

  await prisma.billingJobRun.update({
    where: { id_job_run: existing.id_job_run },
    data: {
      status: input.status,
      finished_at: finishedAt,
      duration_ms: durationMs,
      counters_json: asJson(input.counters),
      metadata_json: asJson(mergedMetadata),
      error_message: input.errorMessage ?? null,
      error_stack: input.errorStack ?? null,
    },
  });
}

export async function listRecentBillingJobRuns(input?: {
  limit?: number;
  jobName?: BillingJobName;
}): Promise<
  Array<{
    id_job_run: number;
    job_name: string;
    run_id: string;
    source: BillingJobSource;
    status: BillingJobRunStatus;
    started_at: Date;
    finished_at: Date | null;
    duration_ms: number | null;
    target_date_ar: string | null;
    adapter: string | null;
    counters_json: Record<string, unknown> | null;
    error_message: string | null;
    metadata_json: Record<string, unknown> | null;
  }>
> {
  const limit = Math.min(100, Math.max(1, input?.limit ?? 20));

  const items = await prisma.billingJobRun.findMany({
    where: input?.jobName ? { job_name: input.jobName } : undefined,
    orderBy: [{ started_at: "desc" }, { id_job_run: "desc" }],
    take: limit,
    select: {
      id_job_run: true,
      job_name: true,
      run_id: true,
      source: true,
      status: true,
      started_at: true,
      finished_at: true,
      duration_ms: true,
      target_date_ar: true,
      adapter: true,
      counters_json: true,
      error_message: true,
      metadata_json: true,
    },
  });

  return items.map((item) => ({
    ...item,
    counters_json: safeObject(item.counters_json),
    metadata_json: safeObject(item.metadata_json),
  }));
}
