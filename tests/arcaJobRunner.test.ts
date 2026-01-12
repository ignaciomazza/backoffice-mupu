import { beforeEach, describe, expect, it, vi } from "vitest";

let jobStore: Record<string, unknown>;
let configStore: Record<string, unknown> | null;

const createCertProdMock = vi.fn();
const authWebServiceProdMock = vi.fn();
const extractPemPairMock = vi.fn();
const getJobSecretMock = vi.fn();
const clearJobSecretMock = vi.fn();

vi.mock("@/services/arca/automations", () => ({
  createCertProd: createCertProdMock,
  authWebServiceProd: authWebServiceProdMock,
  extractPemPair: extractPemPairMock,
}));

vi.mock("@/services/arca/jobSecrets", () => ({
  getJobSecret: getJobSecretMock,
  clearJobSecret: clearJobSecretMock,
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    arcaConnectionJob: {
      findUnique: vi.fn(({ where }) =>
        where?.id === jobStore.id ? { ...jobStore } : null,
      ),
      update: vi.fn(({ where, data }) => {
        if (where?.id !== jobStore.id) return null;
        jobStore = { ...jobStore, ...data };
        return { ...jobStore };
      }),
    },
    agencyArcaConfig: {
      upsert: vi.fn(({ create, update }) => {
        configStore = configStore ? { ...configStore, ...update } : { ...create };
        if (!configStore?.authorizedServices) {
          configStore = { ...configStore, authorizedServices: [] };
        }
        return configStore;
      }),
      updateMany: vi.fn(({ data }) => {
        configStore = configStore ? { ...configStore, ...data } : { ...data };
        return { count: 1 };
      }),
      findUnique: vi.fn(() => (configStore ? { ...configStore } : null)),
    },
    $transaction: (ops: Array<Promise<unknown>>) => Promise.all(ops),
  },
}));

describe("advanceArcaJob", () => {
  beforeEach(() => {
    jobStore = {
      id: 1,
      agencyId: 99,
      action: "connect",
      status: "running",
      step: "create_cert",
      services: ["wsfe"],
      currentServiceIndex: 0,
      longJobId: null,
      taxIdRepresentado: "20123456789",
      taxIdLogin: "20123456789",
      alias: "ofistur-20123456789",
      lastError: null,
    };
    configStore = null;
    process.env.ARCA_SECRETS_KEY = Buffer.from(
      "01234567890123456789012345678901",
    ).toString("base64");

    createCertProdMock.mockResolvedValue({
      status: "complete",
      data: { cert: "CERT", key: "KEY" },
    });
    extractPemPairMock.mockReturnValue({ certPem: "CERT", keyPem: "KEY" });
    authWebServiceProdMock.mockResolvedValue({ status: "complete", data: {} });
    getJobSecretMock.mockReturnValue("clave");
    clearJobSecretMock.mockClear();
  });

  it("completes job when automations succeed", async () => {
    const { advanceArcaJob } = await import("@/services/arca/jobRunner");
    const updated = await advanceArcaJob(1);

    expect(updated?.status).toBe("completed");
    const services = (configStore?.authorizedServices ?? []) as string[];
    expect(services).toContain("wsfe");
    expect(clearJobSecretMock).toHaveBeenCalled();
  });
});
