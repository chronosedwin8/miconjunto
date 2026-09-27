import zlib from "node:zlib";
import { Prisma } from "@prisma/client";
import { prisma, TENANT_MODELS } from "@/lib/db";
import { saveFile, storage, keyFromUrl } from "@/lib/storage";

const RETENCION_DIAS = Number(process.env.BACKUP_RETENTION_DAYS ?? 14);

function delegate(model: string) {
  const key = model.charAt(0).toLowerCase() + model.slice(1);
  return (prisma as unknown as Record<string, { findMany: (a: object) => Promise<unknown[]> }>)[key];
}

/** Backup lógico por tenant: todas las tablas con conjuntoId, en JSON comprimido, al almacenamiento del conjunto. */
export async function backupConjunto(conjuntoId: string) {
  const data: Record<string, unknown[]> = {};
  let registros = 0;
  for (const m of Prisma.dmmf.datamodel.models) {
    if (!TENANT_MODELS.has(m.name) && m.name !== "Conjunto") continue;
    const rows = m.name === "Conjunto" ? await delegate(m.name).findMany({ where: { id: conjuntoId } }) : await delegate(m.name).findMany({ where: { conjuntoId } });
    data[m.name] = rows;
    registros += rows.length;
  }
  const json = JSON.stringify({ version: 1, conjuntoId, generado: new Date().toISOString(), data }, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  const gz = zlib.gzipSync(Buffer.from(json));
  const nombre = `backup-${new Date().toISOString().slice(0, 10)}.json.gz`;
  const saved = await saveFile({ conjuntoId, folder: "backups", body: gz, filename: nombre, mime: "application/gzip" });
  const b = await prisma.backup.create({ data: { conjuntoId, archivoUrl: saved.url, tamano: gz.length, registros } });
  // Retención
  const viejos = await prisma.backup.findMany({ where: { conjuntoId, createdAt: { lt: new Date(Date.now() - RETENCION_DIAS * 86400000) } } });
  for (const v of viejos) {
    const k = keyFromUrl(v.archivoUrl);
    if (k) await storage().remove(k).catch(() => undefined);
    await prisma.backup.delete({ where: { id: v.id } });
  }
  return b;
}
