import type { NextApiRequest, NextApiResponse } from "next";
import { isBillingAdminRole, resolveBillingAuth } from "@/lib/billingAuth";
import { importResponseBatch } from "@/services/collections/galicia/direct-debit/batches";

export const config = {
  api: {
    bodyParser: false,
  },
};

type UploadedFile = {
  fileName: string;
  bytes: Buffer;
  contentType?: string;
};

function parseBatchId(req: NextApiRequest): number | null {
  const raw = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const id = Number.parseInt(String(raw || ""), 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function parseBoundary(contentType: string): string | null {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  return (match?.[1] || match?.[2] || "").trim() || null;
}

async function readRequestBody(req: NextApiRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function parseMultipartFile(body: Buffer, boundary: string): UploadedFile {
  const boundaryToken = `--${boundary}`;
  const rawParts = body
    .toString("latin1")
    .split(boundaryToken)
    .slice(1, -1)
    .map((part) => part.replace(/^\r\n/, "").replace(/\r\n$/, ""));

  for (const rawPart of rawParts) {
    const separatorIdx = rawPart.indexOf("\r\n\r\n");
    if (separatorIdx < 0) continue;

    const rawHeaders = rawPart.slice(0, separatorIdx);
    const rawContent = rawPart.slice(separatorIdx + 4).replace(/\r\n$/, "");

    const headers = rawHeaders
      .split("\r\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const disposition = headers.find((line) =>
      line.toLowerCase().startsWith("content-disposition:"),
    );
    if (!disposition) continue;

    const filenameMatch = disposition.match(/filename="([^"]*)"/i);
    if (!filenameMatch || !filenameMatch[1]) continue;

    const contentTypeLine = headers.find((line) =>
      line.toLowerCase().startsWith("content-type:"),
    );

    return {
      fileName: filenameMatch[1],
      bytes: Buffer.from(rawContent, "latin1"),
      contentType: contentTypeLine
        ? contentTypeLine.split(":").slice(1).join(":").trim()
        : undefined,
    };
  }

  throw new Error("No se encontró archivo en multipart/form-data");
}

function parseJsonFile(buffer: Buffer): UploadedFile {
  const raw = buffer.toString("utf8");
  const json = JSON.parse(raw) as {
    fileName?: unknown;
    base64?: unknown;
    contentType?: unknown;
  };

  const fileName = String(json.fileName || "respuesta.csv").trim() || "respuesta.csv";
  const base64 = String(json.base64 || "").trim();
  if (!base64) {
    throw new Error("body JSON inválido: falta base64");
  }

  return {
    fileName,
    bytes: Buffer.from(base64, "base64"),
    contentType: typeof json.contentType === "string" ? json.contentType : "text/csv",
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const auth = await resolveBillingAuth(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  if (!isBillingAdminRole(auth.role)) {
    return res.status(403).json({ error: "Sin permisos" });
  }

  const idBatch = parseBatchId(req);
  if (!idBatch) {
    return res.status(400).json({ error: "id inválido" });
  }

  try {
    const contentType = String(req.headers["content-type"] || "");
    const body = await readRequestBody(req);

    let uploadedFile: UploadedFile;
    if (contentType.toLowerCase().includes("multipart/form-data")) {
      const boundary = parseBoundary(contentType);
      if (!boundary) {
        throw new Error("multipart/form-data inválido: falta boundary");
      }
      uploadedFile = parseMultipartFile(body, boundary);
    } else if (contentType.toLowerCase().includes("application/json")) {
      uploadedFile = parseJsonFile(body);
    } else {
      uploadedFile = {
        fileName: `respuesta-lote-${idBatch}.csv`,
        bytes: body,
        contentType: contentType || "text/csv",
      };
    }

    if (!uploadedFile.bytes.length) {
      throw new Error("El archivo de respuesta está vacío");
    }

    const imported = await importResponseBatch({
      outboundBatchId: idBatch,
      uploadedFile,
      actorUserId: auth.id_user,
    });

    return res.status(200).json(imported);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo importar la respuesta";
    return res.status(400).json({ error: message });
  }
}
