import { defineJob } from "./registry";
import { conjuntosActivos } from "./definitions";
import { conciliarPendientes, expirarPendientes } from "@/lib/pagos/service";
import { campanaAutomaticaMensual, procesarCampanasProgramadas } from "@/lib/pagos/campana";

/** Jobs del módulo de pagos en línea (MICONJUNTO_SPEC §10). */

defineJob({
  name: "pagos-campana-cobro",
  cron: "0 9 * * *",
  descripcion: "Campaña automática de cobro (el día de generación de cuotas de cada conjunto, tras generarlas)",
  handler: async () => {
    const out: string[] = [];
    for (const c of await conjuntosActivos()) {
      try {
        out.push(`${c.nombre}: ${await campanaAutomaticaMensual(c.id)}`);
      } catch (e) {
        out.push(`${c.nombre}: error ${(e as Error).message}`);
      }
    }
    return out.join(" · ");
  },
});

defineJob({
  name: "pagos-campanas-programadas",
  cron: "*/5 * * * *",
  descripcion: "Envío de campañas de cobro programadas",
  handler: async () => `${await procesarCampanasProgramadas()} campañas enviadas`,
});

defineJob({
  name: "pagos-conciliar-pendientes",
  cron: "15 * * * *",
  descripcion: "Conciliación de pagos en línea pendientes consultando a la pasarela y expiración de pendientes > 24 h",
  handler: async () => {
    const c = await conciliarPendientes({ minutos: 10 });
    const e = await expirarPendientes({ horas: 24 });
    return `conciliación ${JSON.stringify(c)} · expirados ${e.expirados}/${e.revisados}`;
  },
});
