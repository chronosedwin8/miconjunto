import type { Ctx } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/auth/tokens";
import { encrypt } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { ALL_PERMS } from "@/lib/permisos";

/** Token de API por conjunto (Bearer mc_…). El valor completo solo se muestra una vez. */
export async function crearTokenApi(ctx: Ctx, nombre: string, permisos: string[]) {
  const raw = `mc_${randomToken(24)}`;
  const validos = new Set<string>(ALL_PERMS);
  const t = await ctx.db.tokenApi.create({
    data: { conjuntoId: ctx.conjuntoId, nombre, tokenHash: sha256(raw), prefijo: raw.slice(0, 10), permisos: permisos.filter((p) => validos.has(p)), creadoPorId: ctx.userId },
  });
  await audit(ctx, "crear", "TokenApi", t.id, undefined, { nombre, permisos: t.permisos });
  return { id: t.id, token: raw };
}

export async function revocarTokenApi(ctx: Ctx, id: string) {
  await ctx.db.tokenApi.update({ where: { id }, data: { revocado: true } });
  await audit(ctx, "revocar", "TokenApi", id);
}

/** Valida un header Authorization: Bearer y devuelve el token si es válido. */
export async function tokenFromHeader(authorization: string | null) {
  const raw = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : null;
  if (!raw) return null;
  const t = await prisma.tokenApi.findUnique({ where: { tokenHash: sha256(raw) } });
  if (!t || t.revocado || t.deletedAt) return null;
  await prisma.tokenApi.update({ where: { id: t.id }, data: { ultimoUso: new Date() } });
  return t;
}

export async function crearWebhook(ctx: Ctx, url: string, eventos: string[]) {
  const secreto = randomToken(24);
  const w = await ctx.db.webhookSaliente.create({ data: { conjuntoId: ctx.conjuntoId, url, eventos, secreto: encrypt(secreto) } });
  await audit(ctx, "crear", "WebhookSaliente", w.id, undefined, { url, eventos });
  return { id: w.id, secreto };
}

export async function eliminarWebhook(ctx: Ctx, id: string) {
  await ctx.db.webhookSaliente.update({ where: { id }, data: { deletedAt: new Date(), activo: false } });
  await audit(ctx, "eliminar", "WebhookSaliente", id);
}
