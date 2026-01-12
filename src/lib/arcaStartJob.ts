// src/lib/arcaStartJob.ts
import prisma from "@/lib/prisma";
import { setJobSecret } from "@/services/arca/jobSecrets";
import { advanceArcaJob } from "@/services/arca/jobRunner";
import { logArca } from "@/services/arca/logger";

type StartJobInput = {
  agencyId: number;
  action: "connect" | "rotate";
  cuitRepresentado: string;
  cuitLogin: string;
  alias: string;
  services: string[];
  password: string;
};

export async function startArcaJob(input: StartJobInput) {
  logArca("info", "Start ARCA job", {
    agencyId: input.agencyId,
    action: input.action,
    cuitRepresentado: input.cuitRepresentado,
    cuitLogin: input.cuitLogin,
    alias: input.alias,
    services: input.services,
    hasPassword: Boolean(input.password),
    passwordLength: input.password.length,
  });
  await prisma.agencyArcaConfig.upsert({
    where: { agencyId: input.agencyId },
    update: {
      taxIdRepresentado: input.cuitRepresentado,
      taxIdLogin: input.cuitLogin,
      alias: input.alias,
      status: "pending",
      lastError: null,
      authorizedServices: [],
    },
    create: {
      agencyId: input.agencyId,
      taxIdRepresentado: input.cuitRepresentado,
      taxIdLogin: input.cuitLogin,
      alias: input.alias,
      status: "pending",
      authorizedServices: [],
    },
  });

  const job = await prisma.arcaConnectionJob.create({
    data: {
      agencyId: input.agencyId,
      action: input.action,
      status: "running",
      step: "create_cert",
      services: input.services,
      currentServiceIndex: 0,
      taxIdRepresentado: input.cuitRepresentado,
      taxIdLogin: input.cuitLogin,
      alias: input.alias,
    },
  });

  setJobSecret(job.id, input.password);
  logArca("info", "Job created", { jobId: job.id, agencyId: input.agencyId });
  await advanceArcaJob(job.id);

  return prisma.arcaConnectionJob.findUnique({ where: { id: job.id } });
}
