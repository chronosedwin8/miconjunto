import crypto from "node:crypto";
import type { TipoToken } from "@prisma/client";
import { prisma } from "@/lib/db";

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function createToken(
  tipo: TipoToken,
  opts: { email?: string; usuarioId?: string; conjuntoId?: string; data?: object; ttlMinutes: number },
) {
  const raw = randomToken();
  await prisma.tokenVerificacion.create({
    data: {
      tipo,
      tokenHash: sha256(raw),
      email: opts.email?.toLowerCase(),
      usuarioId: opts.usuarioId,
      conjuntoId: opts.conjuntoId,
      data: (opts.data ?? {}) as object,
      expira: new Date(Date.now() + opts.ttlMinutes * 60_000),
    },
  });
  return raw;
}

/** Consume un token de un solo uso. Devuelve null si no existe, venció o ya se usó. */
export async function consumeToken(tipo: TipoToken, raw: string) {
  const tokenHash = sha256(raw);
  const t = await prisma.tokenVerificacion.findUnique({ where: { tokenHash } });
  if (!t || t.tipo !== tipo || t.usadoEn || t.expira < new Date()) return null;
  const updated = await prisma.tokenVerificacion.updateMany({
    where: { id: t.id, usadoEn: null },
    data: { usadoEn: new Date() },
  });
  if (updated.count !== 1) return null;
  return t;
}

/** Lee un token reutilizable (p. ej. link público de pago) sin consumirlo. */
export async function peekToken(tipo: TipoToken, raw: string) {
  const t = await prisma.tokenVerificacion.findUnique({ where: { tokenHash: sha256(raw) } });
  if (!t || t.tipo !== tipo || t.expira < new Date() || t.deletedAt) return null;
  return t;
}
