// src/services/arca/jobRunner.ts
import prisma from "@/lib/prisma";
import { encryptSecret } from "@/lib/arcaSecrets";
import {
  authWebServiceProd,
  createCertProd,
  extractPemPair,
} from "@/services/arca/automations";
import { clearJobSecret, getJobSecret } from "@/services/arca/jobSecrets";
import { invalidateAfipCache } from "@/services/afip/afipConfig";
import { logArca } from "@/services/arca/logger";

type JobStep = "create_cert" | "auth_ws" | "done";

function sanitizeAutomationDetail(detail?: string): string | null {
  if (!detail) return null;
  let msg = detail.trim();
  if (!msg) return null;
  msg = msg.replace(/\s+/g, " ");
  msg = msg.replace(/password\s*[:=]\s*\S+/gi, "password:[redacted]");
  msg = msg.replace(/clave\s*fiscal\s*[:=]\s*\S+/gi, "clave fiscal:[redacted]");
  msg = msg.replace(/-----BEGIN[\s\S]+?-----END[\s\S]+?-----/g, "[redacted]");
  return msg.slice(0, 320);
}

function sanitizeError(err: unknown): string {
  if (err instanceof Error && err.message) {
    const cleaned = sanitizeAutomationDetail(err.message);
    return cleaned ?? "Error inesperado en ARCA";
  }
  return "Error inesperado en ARCA";
}

function automationError(label: string, detail?: string): string {
  const cleaned = sanitizeAutomationDetail(detail);
  if (!cleaned) return label;
  const lower = cleaned.toLowerCase();
  const hints: string[] = [];
  if (lower.includes("alias")) {
    hints.push("Sugerencia: el alias solo admite letras y números.");
  }
  if (
    lower.includes("password") ||
    lower.includes("clave") ||
    lower.includes("contraseña")
  ) {
    hints.push("Sugerencia: revisá usuario y clave fiscal.");
  }
  if (lower.includes("cuit")) {
    hints.push("Sugerencia: revisá CUIT representado/login.");
  }
  if (
    lower.includes("término") ||
    lower.includes("termino") ||
    lower.includes("acept") ||
    lower.includes("domicilio fiscal")
  ) {
    hints.push("Sugerencia: entrá a ARCA y resolvé avisos pendientes.");
  }
  const hintText = hints.length ? ` ${hints.join(" ")}` : "";
  return `${label} Detalle: ${cleaned}${hintText}`;
}

function uniqueServices(input: string[]): string[] {
  const clean = input
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(clean));
}

async function markJobError(jobId: number, agencyId: number, msg: string) {
  logArca("warn", "Job error", { jobId, agencyId, error: msg });
  await prisma.$transaction([
    prisma.arcaConnectionJob.update({
      where: { id: jobId },
      data: { status: "error", lastError: msg, completedAt: new Date() },
    }),
    prisma.agencyArcaConfig.updateMany({
      where: { agencyId },
      data: { status: "error", lastError: msg },
    }),
  ]);
  clearJobSecret(jobId);
}

async function finalizeJob(jobId: number, agencyId: number) {
  logArca("info", "Job completed", { jobId, agencyId });
  await prisma.$transaction([
    prisma.arcaConnectionJob.update({
      where: { id: jobId },
      data: {
        status: "completed",
        step: "done",
        lastError: null,
        completedAt: new Date(),
      },
    }),
    prisma.agencyArcaConfig.updateMany({
      where: { agencyId },
      data: { status: "connected", lastError: null, lastOkAt: new Date() },
    }),
  ]);
  clearJobSecret(jobId);
}

async function handleCreateCert(jobId: number) {
  const job = await prisma.arcaConnectionJob.findUnique({ where: { id: jobId } });
  if (!job) return null;
  if (job.step !== "create_cert") return job;

  const password = getJobSecret(jobId);
  if (!password) {
    logArca("warn", "Missing password for create-cert", { jobId });
    return prisma.arcaConnectionJob.update({
      where: { id: jobId },
      data: { status: "requires_action", lastError: "Reingresá la clave fiscal para continuar." },
    });
  }

  try {
    logArca("info", "Create-cert request", {
      jobId,
      longJobId: job.longJobId || null,
      hasPassword: Boolean(password),
      passwordLength: password.length,
    });
    const result = await createCertProd({
      cuitRepresentado: job.taxIdRepresentado,
      cuitLogin: job.taxIdLogin,
      alias: job.alias,
      password,
      longJobId: job.longJobId || undefined,
    });

    if (result.status === "pending") {
      logArca("info", "Create-cert pending", {
        jobId,
        longJobId: result.longJobId,
      });
      return prisma.arcaConnectionJob.update({
        where: { id: jobId },
        data: {
          status: "waiting",
          longJobId: result.longJobId,
          lastError: null,
        },
      });
    }

    if (result.status === "error") {
      const msg = automationError(
        "Error creando certificado en ARCA.",
        result.error,
      );
      await markJobError(jobId, job.agencyId, msg);
      return prisma.arcaConnectionJob.findUnique({ where: { id: jobId } });
    }

    const { certPem, keyPem } = extractPemPair(result.data);
    logArca("info", "Create-cert complete", { jobId, hasCert: Boolean(certPem), hasKey: Boolean(keyPem) });
    await prisma.$transaction([
      prisma.agencyArcaConfig.upsert({
        where: { agencyId: job.agencyId },
        update: {
          certEncrypted: encryptSecret(certPem),
          keyEncrypted: encryptSecret(keyPem),
          status: "pending",
          lastError: null,
          taxIdRepresentado: job.taxIdRepresentado,
          taxIdLogin: job.taxIdLogin,
          alias: job.alias,
        },
        create: {
          agencyId: job.agencyId,
          certEncrypted: encryptSecret(certPem),
          keyEncrypted: encryptSecret(keyPem),
          status: "pending",
          taxIdRepresentado: job.taxIdRepresentado,
          taxIdLogin: job.taxIdLogin,
          alias: job.alias,
        },
      }),
      prisma.arcaConnectionJob.update({
        where: { id: jobId },
        data: {
          status: "running",
          step: "auth_ws",
          longJobId: null,
          lastError: null,
        },
      }),
    ]);
    invalidateAfipCache(job.agencyId);

    return handleAuth(jobId);
  } catch (err) {
    const msg = sanitizeError(err);
    await markJobError(jobId, job.agencyId, msg);
    return prisma.arcaConnectionJob.findUnique({ where: { id: jobId } });
  }
}

async function handleAuth(jobId: number) {
  const job = await prisma.arcaConnectionJob.findUnique({ where: { id: jobId } });
  if (!job) return null;
  if (job.step !== "auth_ws") return job;

  const services = uniqueServices(job.services);
  if (services.length === 0) {
    await finalizeJob(jobId, job.agencyId);
    return prisma.arcaConnectionJob.findUnique({ where: { id: jobId } });
  }

  const index = Math.min(job.currentServiceIndex, services.length);
  if (index >= services.length) {
    await finalizeJob(jobId, job.agencyId);
    return prisma.arcaConnectionJob.findUnique({ where: { id: jobId } });
  }

  const password = getJobSecret(jobId);
  if (!password) {
    logArca("warn", "Missing password for auth-ws", { jobId });
    return prisma.arcaConnectionJob.update({
      where: { id: jobId },
      data: { status: "requires_action", lastError: "Reingresá la clave fiscal para continuar." },
    });
  }

  const service = services[index];
  try {
    logArca("info", "Auth-ws request", {
      jobId,
      service,
      index,
      total: services.length,
      longJobId: job.longJobId || null,
      hasPassword: Boolean(password),
      passwordLength: password.length,
    });
    const result = await authWebServiceProd({
      cuitRepresentado: job.taxIdRepresentado,
      cuitLogin: job.taxIdLogin,
      alias: job.alias,
      service,
      password,
      longJobId: job.longJobId || undefined,
    });

    if (result.status === "pending") {
      logArca("info", "Auth-ws pending", {
        jobId,
        service,
        longJobId: result.longJobId,
      });
      return prisma.arcaConnectionJob.update({
        where: { id: jobId },
        data: { status: "waiting", longJobId: result.longJobId, lastError: null },
      });
    }

    if (result.status === "error") {
      const msg = automationError(
        "Error autorizando servicio en ARCA.",
        result.error,
      );
      await markJobError(jobId, job.agencyId, msg);
      return prisma.arcaConnectionJob.findUnique({ where: { id: jobId } });
    }

    logArca("info", "Auth-ws complete", { jobId, service });
    const nextIndex = index + 1;
    const updatedConfig = await prisma.agencyArcaConfig.findUnique({
      where: { agencyId: job.agencyId },
      select: { authorizedServices: true },
    });
    const nextServices = uniqueServices([
      ...(updatedConfig?.authorizedServices ?? []),
      service,
    ]);

    await prisma.$transaction([
      prisma.agencyArcaConfig.updateMany({
        where: { agencyId: job.agencyId },
        data: { authorizedServices: nextServices, lastError: null },
      }),
      prisma.arcaConnectionJob.update({
        where: { id: jobId },
        data: {
          status: "running",
          longJobId: null,
          currentServiceIndex: nextIndex,
          lastError: null,
        },
      }),
    ]);

    if (nextIndex >= services.length) {
      await finalizeJob(jobId, job.agencyId);
    }

    return prisma.arcaConnectionJob.findUnique({ where: { id: jobId } });
  } catch (err) {
    const msg = sanitizeError(err);
    await markJobError(jobId, job.agencyId, msg);
    return prisma.arcaConnectionJob.findUnique({ where: { id: jobId } });
  }
}

export async function advanceArcaJob(jobId: number) {
  const job = await prisma.arcaConnectionJob.findUnique({ where: { id: jobId } });
  if (!job) return null;
  if (job.status === "completed" || job.status === "error") return job;

  logArca("info", "Advance job", {
    jobId,
    status: job.status,
    step: job.step,
    longJobId: job.longJobId || null,
  });
  const step = job.step as JobStep;
  if (step === "create_cert") return handleCreateCert(jobId);
  if (step === "auth_ws") return handleAuth(jobId);
  return job;
}
