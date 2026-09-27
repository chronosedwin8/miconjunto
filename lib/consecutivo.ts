import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";

/** Consecutivo atómico por conjunto/tipo/año (recibos, radicados, órdenes de trabajo). */
export async function nextConsecutivo(conjuntoId: string, tipo: string, anio = 0, db: PrismaClient | Prisma.TransactionClient = prisma) {
  const rows = await db.$queryRaw<{ valor: number }[]>`
    INSERT INTO "Consecutivo" ("id", "conjuntoId", "tipo", "anio", "valor", "createdAt", "updatedAt")
    VALUES (${`c_${conjuntoId}_${tipo}_${anio}`}, ${conjuntoId}, ${tipo}, ${anio}, 1, now(), now())
    ON CONFLICT ("conjuntoId", "tipo", "anio") DO UPDATE SET "valor" = "Consecutivo"."valor" + 1, "updatedAt" = now()
    RETURNING "valor"`;
  return Number(rows[0].valor);
}
