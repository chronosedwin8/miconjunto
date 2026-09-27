import { systemCtx } from "@/lib/auth/system-ctx";
import { enviarProgramadas } from "@/lib/comunicaciones/correo-masivo";
import { documentosPorVencer } from "@/lib/documentos/service";
import { eventosDeManana, notificarEvento } from "@/lib/calendario/service";
import { notify, usuariosConPermiso } from "@/lib/notificaciones";
import { diffDays, fecha, startOfDayBogota } from "@/lib/format";
import { label } from "@/lib/labels";
import { conjuntosActivos } from "./definitions";
import { defineJob } from "./registry";

/** Jobs de comunicaciones, documentos y calendario (Fase 8). Un error en un conjunto no detiene los demás. */
async function porConjunto(fn: (conjuntoId: string) => Promise<void>) {
  for (const c of await conjuntosActivos()) {
    try {
      await fn(c.id);
    } catch (e) {
      console.error(`[jobs/comunicaciones] conjunto ${c.id}:`, (e as Error).message);
    }
  }
}

defineJob({
  name: "correo-masivo-programado",
  cron: "*/5 * * * *",
  descripcion: "Envía las campañas de correo generales programadas",
  handler: async () => {
    let campanas = 0;
    let correos = 0;
    await porConjunto(async (id) => {
      const r = await enviarProgramadas(await systemCtx(id));
      campanas += r.campanas;
      correos += r.correos;
    });
    return `${campanas} campañas, ${correos} correos encolados`;
  },
});

/** Avisos a 30, 15, 7 y 1 día del vencimiento, el mismo día y cada 7 días después de vencido. */
export function debeAvisarVencimiento(dias: number) {
  return [30, 15, 7, 1, 0].includes(dias) || (dias < 0 && dias % 7 === 0);
}

defineJob({
  name: "documentos-vencimientos",
  cron: "0 7 * * *",
  descripcion: "Alerta a la administración sobre pólizas, contratos y documentos por vencer",
  handler: async () => {
    let avisos = 0;
    const hoy = startOfDayBogota();
    await porConjunto(async (conjuntoId) => {
      const ctx = await systemCtx(conjuntoId);
      const docs = (await documentosPorVencer(ctx, 30)).filter((d) => debeAvisarVencimiento(diffDays(startOfDayBogota(d.vence!), hoy)));
      if (!docs.length) return;
      const admins = await usuariosConPermiso(conjuntoId, ["documentos.editar"]);
      for (const d of docs) {
        const dias = diffDays(startOfDayBogota(d.vence!), hoy);
        await notify({
          conjuntoId,
          usuarioIds: admins,
          titulo: dias < 0 ? `${label(d.categoria)} vencida: ${d.titulo}` : dias === 0 ? `${label(d.categoria)} vence hoy: ${d.titulo}` : `${label(d.categoria)} vence en ${dias} días`,
          cuerpo: `${d.titulo} · vence el ${fecha(d.vence)}. Renueva y sube la nueva versión.`,
          enlace: `/documentos/${d.id}`,
          tipo: "VENCIMIENTO",
          canales: dias <= 7 ? ["push", "email"] : ["push"],
        });
        avisos++;
      }
    });
    return `${avisos} avisos de vencimiento`;
  },
});

defineJob({
  name: "calendario-recordatorios",
  cron: "0 18 * * *",
  descripcion: "Recuerda a los residentes los eventos del día siguiente",
  handler: async () => {
    let n = 0;
    await porConjunto(async (id) => {
      const ctx = await systemCtx(id);
      for (const e of await eventosDeManana(ctx)) {
        await notificarEvento(ctx, e.id, "recordatorio");
        n++;
      }
    });
    return `${n} recordatorios de eventos`;
  },
});
