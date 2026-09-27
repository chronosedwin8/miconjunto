import crypto from "node:crypto";

function key() {
  const k = process.env.APP_ENCRYPTION_KEY;
  if (!k) throw new Error("APP_ENCRYPTION_KEY no está configurada");
  return crypto.createHash("sha256").update(k).digest();
}

/** Cifra con AES-256-GCM. Formato: iv.tag.data (base64url). */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, data].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(payload: string): string {
  const [iv, tag, data] = payload.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function encryptJson(obj: unknown) {
  return encrypt(JSON.stringify(obj));
}

export function decryptJson<T = Record<string, string>>(payload: string): T {
  return JSON.parse(decrypt(payload)) as T;
}

export function hmacSha256Hex(secret: string, data: string) {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

export function sha256Hex(data: string) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function timingSafeEqualHex(a: string, b: string) {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** Código numérico aleatorio de n dígitos. */
export function numericCode(n = 6) {
  let s = "";
  for (let i = 0; i < n; i++) s += crypto.randomInt(0, 10).toString();
  return s;
}

export function shortCode(n = 10) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < n; i++) s += alphabet[crypto.randomInt(0, alphabet.length)];
  return s;
}
