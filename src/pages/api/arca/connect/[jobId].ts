// src/pages/api/arca/connect/[jobId].ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { getAuthContext, hasArcaAccess } from "@/lib/arcaAuth";
import { advanceArcaJob } from "@/services/arca/jobRunner";
import { setJobSecret } from "@/services/arca/jobSecrets";
import { logArca } from "@/services/arca/logger";

function parseJobId(raw: string | string[] | undefined): number {
  const val = Array.isArray(raw) ? raw[0] : raw;
  return val ? parseInt(val, 10) : 0;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const auth = await getAuthContext(req);
  if (!auth?.id_agency) {
    return res.status(401).json({ error: "No autenticado" });
  }
  if (!hasArcaAccess(auth.role)) {
    return res.status(403).json({ error: "No autorizado" });
  }

  const jobId = parseJobId(req.query.jobId);
  if (!jobId) return res.status(400).json({ error: "jobId inválido" });

  const job = await prisma.arcaConnectionJob.findUnique({ where: { id: jobId } });
  if (!job || job.agencyId !== auth.id_agency) {
    return res.status(404).json({ error: "Job no encontrado" });
  }

  if (req.method === "POST") {
    const password = String((req.body ?? {}).password ?? "").trim();
    if (!password) {
      return res.status(400).json({ error: "Clave fiscal requerida" });
    }
    logArca("info", "API resume job", {
      jobId,
      agencyId: auth.id_agency,
      hasPassword: Boolean(password),
      passwordLength: password.length,
    });
    setJobSecret(jobId, password);
    await advanceArcaJob(jobId);
  } else if (req.method === "GET") {
    if (
      ["pending", "running", "waiting", "requires_action"].includes(job.status)
    ) {
      logArca("info", "API poll job", {
        jobId,
        agencyId: auth.id_agency,
        status: job.status,
        step: job.step,
      });
      await advanceArcaJob(jobId);
    }
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Método ${req.method} no permitido`);
  }

  const updated = await prisma.arcaConnectionJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      status: true,
      step: true,
      services: true,
      currentServiceIndex: true,
      lastError: true,
      createdAt: true,
      updatedAt: true,
      completedAt: true,
    },
  });

  return res.status(200).json({ job: updated });
}
