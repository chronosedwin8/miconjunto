import { prisma } from "@/lib/db";
import { processEmailQueue } from "@/lib/email";
import { defineJob } from "./registry";

/** Conjuntos activos (los jobs por tenant los recorren). */
export async function conjuntosActivos() {
  return prisma.conjunto.findMany({ where: { deletedAt: null, estado: "ACTIVO" }, select: { id: true, nombre: true } });
}

defineJob({
  name: "correos-cola",
  cron: "* * * * *",
  descripcion: "Envío de correos en cola (límite por minuto)",
  handler: async () => `${await processEmailQueue(Number(process.env.EMAIL_RATE_PER_MIN ?? 60))} correos procesados`,
});

defineJob({
  name: "limpieza-tokens",
  cron: "30 2 * * *",
  descripcion: "Limpieza de tokens y sesiones vencidas",
  handler: async () => {
    const r = await prisma.tokenVerificacion.deleteMany({ where: { expira: { lt: new Date(Date.now() - 7 * 86400000) } } });
    return `${r.count} tokens eliminados`;
  },
});

// Los módulos registran sus jobs importando su archivo aquí.
import "./modulos";
