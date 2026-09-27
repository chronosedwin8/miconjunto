import { systemCtx } from "@/lib/auth/system-ctx";
import { alertasSla, cierreAutomatico } from "@/lib/tickets/service";
import { DIAS_CIERRE_AUTOMATICO } from "@/lib/tickets/reglas";
import { recordatoriosDescargos } from "@/lib/convivencia/service";
import { conjuntosActivos } from "./definitions";
import { defineJob } from "./registry";

/** Recorre los conjuntos activos con contexto de sistema; un error en uno no detiene los demás. */
async function porConjunto(nombre: string, fn: (ctx: Awaited<ReturnType<typeof systemCtx>>) => Promise<string | null>) {
  const out: string[] = [];
  for (const c of await conjuntosActivos()) {
    try {
      const r = await fn(await systemCtx(c.id));
      if (r) out.push(`${c.nombre}: ${r}`);
    } catch (e) {
      console.error(`[jobs:${nombre}] ${c.nombre}:`, (e as Error).message);
      out.push(`${c.nombre}: error ${(e as Error).message}`);
    }
  }
  return out.join(" · ") || "sin cambios";
}

defineJob({
  name: "tickets-sla-diario",
  cron: "0 8 * * *",
  descripcion: "Alertas de SLA de tickets vencidos y por vencer (24 h)",
  handler: () =>
    porConjunto("tickets-sla", async (ctx) => {
      const r = await alertasSla(ctx);
      return r.vencidos + r.porVencer ? `${r.vencidos} vencidos, ${r.porVencer} por vencer` : null;
    }),
});

defineJob({
  name: "tickets-sla-urgentes",
  cron: "0 * * * *",
  descripcion: "Alertas horarias de tickets urgentes por vencer o recién vencidos",
  handler: () =>
    porConjunto("tickets-urgentes", async (ctx) => {
      const r = await alertasSla(ctx, { soloUrgentes: true });
      return r.vencidos + r.porVencer ? `${r.vencidos} vencidos, ${r.porVencer} por vencer` : null;
    }),
});

defineJob({
  name: "tickets-cierre-automatico",
  cron: "30 0 * * *",
  descripcion: `Cierre de tickets resueltos sin respuesta del residente tras ${DIAS_CIERRE_AUTOMATICO} días`,
  handler: () =>
    porConjunto("tickets-cierre", async (ctx) => {
      const n = await cierreAutomatico(ctx, DIAS_CIERRE_AUTOMATICO);
      return n ? `${n} cerrados` : null;
    }),
});

defineJob({
  name: "convivencia-descargos",
  cron: "0 8 * * *",
  descripcion: "Recordatorio de plazos de descargos por vencer y multas listas para decisión",
  handler: () =>
    porConjunto("convivencia-descargos", async (ctx) => {
      const r = await recordatoriosDescargos(ctx);
      return r.recordatorios + r.listasParaDecision ? `${r.recordatorios} recordatorios, ${r.listasParaDecision} para decisión` : null;
    }),
});
