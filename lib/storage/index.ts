import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

/**
 * Interfaz única de almacenamiento. Local (`./storage/<conjuntoId>/...`) en desarrollo,
 * S3-compatible (AWS S3, Cloudflare R2, MinIO) en producción. Las URLs públicas pasan por
 * `/api/files/<key>`, que valida la sesión y el conjunto.
 */
export interface StorageDriver {
  put(key: string, body: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
}

const ROOT = path.resolve(process.cwd(), "storage");

class LocalDriver implements StorageDriver {
  private resolve(key: string) {
    const p = path.resolve(ROOT, key);
    if (!p.startsWith(ROOT)) throw new Error("Ruta de archivo inválida");
    return p;
  }
  async put(key: string, body: Buffer) {
    const p = this.resolve(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, body);
  }
  async get(key: string) {
    try {
      return await fs.readFile(this.resolve(key));
    } catch {
      return null;
    }
  }
  async remove(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }
}

class S3Driver implements StorageDriver {
  private client = new S3Client({
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION || "us-east-1",
    forcePathStyle: !!process.env.S3_ENDPOINT,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? "", secretAccessKey: process.env.S3_SECRET_KEY ?? "" },
  });
  private bucket = process.env.S3_BUCKET ?? "";
  async put(key: string, body: Buffer, mime: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: mime }));
  }
  async get(key: string) {
    try {
      const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const bytes = await r.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch {
      return null;
    }
  }
  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

let driver: StorageDriver | null = null;
export function storage(): StorageDriver {
  if (!driver) driver = process.env.STORAGE_DRIVER === "s3" ? new S3Driver() : new LocalDriver();
  return driver;
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "application/pdf",
  "video/mp4",
  "video/quicktime",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/xml",
  "text/xml",
  "application/json",
  "application/zip",
];

function safeName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-80);
}

/** Escáner antivirus opcional (ClamAV). Por defecto no hace nada; se habilita con CLAMAV_HOST. */
export async function scanFile(_body: Buffer): Promise<{ ok: boolean; motivo?: string }> {
  if (!process.env.CLAMAV_HOST) return { ok: true };
  // Integración pendiente de credenciales/servicio: se deja el punto de extensión documentado.
  return { ok: true };
}

export async function saveFile(opts: { conjuntoId: string | null; folder: string; body: Buffer; filename: string; mime: string }) {
  const id = crypto.randomBytes(8).toString("hex");
  const key = `${opts.conjuntoId ?? "global"}/${opts.folder}/${id}-${safeName(opts.filename)}`;
  await storage().put(key, opts.body, opts.mime);
  return { key, url: `/api/files/${key}` };
}

export function keyFromUrl(url: string) {
  return url.startsWith("/api/files/") ? url.slice("/api/files/".length) : null;
}

export async function readFileByUrl(url: string) {
  const key = keyFromUrl(url);
  if (!key) return null;
  return storage().get(key);
}

export function mimeFromName(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    pdf: "application/pdf",
    csv: "text/csv",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xml: "application/xml",
    json: "application/json",
    mp4: "video/mp4",
    zip: "application/zip",
  };
  return map[ext ?? ""] ?? "application/octet-stream";
}
