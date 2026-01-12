// src/services/arca/automations.ts
import { logArca } from "@/services/arca/logger";
type AutomationApiResponse = {
  status?: string;
  data?: unknown;
  long_job_id?: string;
  id?: string;
  job_id?: string;
  message?: string;
  error?: string;
  detail?: string;
  errors?: unknown;
};

type AutomationResult =
  | { status: "complete"; data: unknown }
  | { status: "pending"; longJobId: string }
  | { status: "error"; error: string };

const BASE_URL = "https://app.afipsdk.com/api/";
const SDK_VERSION = "1.1.1";
const SDK_LIBRARY = "javascript";
const MAX_ERROR_LENGTH = 320;

function getAccessToken(): string {
  const token =
    process.env.AFIP_SDK_ACCESS_TOKEN || process.env.ACCESS_TOKEN || "";
  if (!token) throw new Error("Falta token de Afip SDK (ACCESS_TOKEN)");
  return token;
}

async function postAutomation(
  path: string,
  body: Record<string, unknown>,
): Promise<AutomationResult> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const passwordValue = typeof body.password === "string" ? body.password : "";
    logArca("info", "Afip SDK request", {
      path,
      payload: body,
      hasPassword: Boolean(passwordValue),
      passwordLength: passwordValue.length,
      hasLongJobId: Boolean(body.long_job_id),
      service: body.wsid ?? null,
    });
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAccessToken()}`,
        "sdk-version-number": SDK_VERSION,
        "sdk-library": SDK_LIBRARY,
        "sdk-environment": "prod",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    const json = (await res.json().catch(() => ({}))) as AutomationApiResponse;
    logArca("info", "Afip SDK response", {
      path,
      httpStatus: res.status,
      body: json,
    });
    if (!res.ok) {
      const errMsg = buildErrorMessage(res.status, json);
      logArca("warn", "Afip SDK error response", {
        path,
        status: res.status,
        error: errMsg,
      });
      return { status: "error", error: errMsg };
    }

    const status = typeof json?.status === "string" ? json.status : "";
    const longJobId = extractLongJobId(json, body);
    if (status === "complete") {
      logArca("info", "Afip SDK complete", { path, status: json.status });
      return { status: "complete", data: json?.data };
    }
    if (status === "error") {
      const errMsg = buildErrorMessage(res.status, json);
      logArca("warn", "Afip SDK error status", {
        path,
        status: json.status,
        error: errMsg,
      });
      return { status: "error", error: buildErrorMessage(res.status, json) };
    }
    if (status === "in_process" || status === "pending" || longJobId) {
      if (!longJobId) {
        logArca("warn", "Afip SDK pending without long_job_id", {
          path,
          status,
        });
        return {
          status: "error",
          error: "Afip SDK devolvió en proceso sin identificador",
        };
      }
      logArca("info", "Afip SDK pending", {
        path,
        longJobId,
      });
      return { status: "pending", longJobId };
    }

    logArca("warn", "Afip SDK unexpected response", {
      path,
      status: json?.status ?? null,
    });
    return { status: "error", error: "Respuesta inesperada de Afip SDK" };
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizeErrorText(input: string): string {
  return input
    .replace(/\s+/g, " ")
    .replace(/password\s*[:=]\s*\S+/gi, "password:[redacted]")
    .replace(/clave\s*fiscal\s*[:=]\s*\S+/gi, "clave fiscal:[redacted]")
    .replace(/-----BEGIN[\s\S]+?-----END[\s\S]+?-----/g, "[redacted]")
    .slice(0, MAX_ERROR_LENGTH);
}

function extractErrorDetail(json: AutomationApiResponse): string | null {
  const data = json?.data;
  if (data && typeof data === "object") {
    const msg = pickString(data as StringRecord, [
      "message",
      "error",
      "detail",
      "status",
    ]);
    if (msg) return msg;
  }
  if (typeof data === "string" && data.trim()) return data;
  return null;
}

function extractLongJobId(
  json: AutomationApiResponse,
  body: Record<string, unknown>,
): string | null {
  const direct = pickString(json as StringRecord, [
    "long_job_id",
    "id",
    "job_id",
  ]);
  if (direct) return direct;
  const data = json?.data;
  if (data && typeof data === "object") {
    const fromData = pickString(data as StringRecord, [
      "long_job_id",
      "id",
      "job_id",
    ]);
    if (fromData) return fromData;
  }
  const fallback = body.long_job_id;
  return typeof fallback === "string" && fallback.trim() ? fallback : null;
}

function buildErrorMessage(
  status: number,
  json: AutomationApiResponse,
): string {
  const dataDetail = extractErrorDetail(json);
  const raw = [
    json?.message,
    json?.error,
    json?.detail,
    dataDetail,
    json?.errors ? JSON.stringify(json.errors) : "",
    json?.data
      ? typeof json.data === "string"
        ? json.data
        : JSON.stringify(json.data)
      : "",
    Object.keys(json || {}).length > 0 ? JSON.stringify(json) : "",
  ].find((value) => typeof value === "string" && value.trim());

  if (raw) {
    return sanitizeErrorText(raw);
  }
  return `Error ${status} en Afip SDK`;
}

export async function createCertProd(input: {
  cuitRepresentado: string;
  cuitLogin: string;
  alias: string;
  password?: string;
  longJobId?: string;
}): Promise<AutomationResult> {
  const payload: Record<string, unknown> = {
    environment: "prod",
    cuit: input.cuitRepresentado,
    tax_id: input.cuitRepresentado,
    username: input.cuitLogin,
    alias: input.alias,
  };

  if (input.longJobId) {
    payload.long_job_id = input.longJobId;
  }
  if (input.password) {
    payload.password = input.password;
  }
  if (!payload.password && !payload.long_job_id) {
    return { status: "error", error: "Falta clave fiscal" };
  }

  return postAutomation("v1/afip/certs", payload);
}

export async function authWebServiceProd(input: {
  cuitRepresentado: string;
  cuitLogin: string;
  alias: string;
  service: string;
  password?: string;
  longJobId?: string;
}): Promise<AutomationResult> {
  const payload: Record<string, unknown> = {
    environment: "prod",
    cuit: input.cuitRepresentado,
    tax_id: input.cuitRepresentado,
    username: input.cuitLogin,
    wsid: input.service,
    alias: input.alias,
  };

  if (input.longJobId) {
    payload.long_job_id = input.longJobId;
  }
  if (input.password) {
    payload.password = input.password;
  }
  if (!payload.password && !payload.long_job_id) {
    return { status: "error", error: "Falta clave fiscal" };
  }

  return postAutomation("v1/afip/ws-auths", payload);
}

type StringRecord = Record<string, unknown>;

function pickString(obj: StringRecord, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

export function extractPemPair(data: unknown): {
  certPem: string;
  keyPem: string;
} {
  const record = (data ?? {}) as StringRecord;
  const cert = pickString(record, [
    "cert",
    "certificate",
    "cert_pem",
    "certPem",
    "crt",
  ]);
  const key = pickString(record, [
    "key",
    "private_key",
    "privateKey",
    "key_pem",
    "keyPem",
  ]);

  if (!cert || !key) {
    throw new Error("Afip SDK no devolvió cert/key");
  }

  return { certPem: cert, keyPem: key };
}
