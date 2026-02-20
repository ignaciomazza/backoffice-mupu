import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { GetObjectCommand, PutObjectCommand, S3 } from "@aws-sdk/client-s3";

const {
  SPACES_ENDPOINT = "https://nyc3.digitaloceanspaces.com",
  SPACES_REGION = process.env.SPACES_REGION ?? "us-east-1",
  SPACES_SECRET_KEY,
} = process.env;

const SPACES_ACCESS_KEY =
  process.env.SPACES_ACCESS_KEY ?? process.env.SPACES_ACCES_KEY;
const SPACES_FILES_BUCKET =
  process.env.BILLING_BATCHES_BUCKET ??
  process.env.SPACES_FILES_BUCKET ??
  process.env.SPACES_BUCKET;

const LOCAL_ROOT = process.env.BILLING_BATCHES_LOCAL_ROOT || "/tmp/ofistur-billing-batches";

function hasS3Config(): boolean {
  return Boolean(
    SPACES_ACCESS_KEY &&
      SPACES_SECRET_KEY &&
      SPACES_FILES_BUCKET,
  );
}

function getS3Client(): S3 {
  return new S3({
    endpoint: SPACES_ENDPOINT,
    region: SPACES_REGION,
    credentials: {
      accessKeyId: String(SPACES_ACCESS_KEY),
      secretAccessKey: String(SPACES_SECRET_KEY),
    },
    forcePathStyle: true,
  });
}

async function streamToBuffer(input: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input);
  if (typeof input === "string") return Buffer.from(input);

  if (input && typeof (input as { transformToByteArray?: unknown }).transformToByteArray === "function") {
    const data = await (input as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    return Buffer.from(data);
  }

  if (input instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of input) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  throw new Error("No se pudo convertir stream a Buffer");
}

export function sha256OfBuffer(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizeStorageKey(raw: string): string {
  return raw.replace(/^\/+/, "");
}

async function uploadLocal(storageKey: string, bytes: Buffer): Promise<void> {
  const fullPath = join(LOCAL_ROOT, normalizeStorageKey(storageKey));
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, bytes);
}

async function readLocal(storageKey: string): Promise<Buffer> {
  const fullPath = join(LOCAL_ROOT, normalizeStorageKey(storageKey));
  return readFile(fullPath);
}

export async function uploadBatchFile(input: {
  storageKey: string;
  bytes: Buffer;
  contentType: string;
}): Promise<void> {
  if (hasS3Config()) {
    const s3 = getS3Client();
    await s3.send(
      new PutObjectCommand({
        Bucket: String(SPACES_FILES_BUCKET),
        Key: normalizeStorageKey(input.storageKey),
        Body: input.bytes,
        ContentType: input.contentType,
      }),
    );
    return;
  }

  await uploadLocal(input.storageKey, input.bytes);
}

export async function readBatchFile(storageKey: string): Promise<Buffer> {
  if (hasS3Config()) {
    const s3 = getS3Client();
    const output = await s3.send(
      new GetObjectCommand({
        Bucket: String(SPACES_FILES_BUCKET),
        Key: normalizeStorageKey(storageKey),
      }),
    );

    if (!output.Body) {
      throw new Error("Archivo de lote sin contenido");
    }

    return streamToBuffer(output.Body);
  }

  return readLocal(storageKey);
}
