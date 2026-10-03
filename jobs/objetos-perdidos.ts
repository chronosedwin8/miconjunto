import { systemCtx } from "@/lib/auth/system-ctx";
import { procesarVencimientos } from "@/lib/objetos-perdidos/service";
import { conjuntosActivos } from "./definitions";
import { defineJob } from "./registry";

/**
 * Objetos perdidos: una vez al día avisa a los dueños de pérdidas que se cerrarán en 7 días, cierra las
 * vencidas (90 días por defecto) y pide a la administración disponer de lo que superó el plazo de custodia.
 */
defineJob({
  name: "objetos-perdidos-vencimientos",
  cron: "0 8 * * *",
  descripcion: "Cierre automático de pérdidas y aviso de objetos en custodia vencidos",
  handler: async () => {
    const total = { avisos: 0, cerrados: 0, disposicion: 0 };
    for (const c of await conjuntosActivos()) {
      try {
        const r = await procesarVencimientos(await systemCtx(c.id));
        total.avisos += r.avisos;
        total.cerrados += r.cerrados;
        total.disposicion += r.disposicion;
      } catch (e) {
        console.error(`[jobs/objetos-perdidos] conjunto ${c.id}:`, (e as Error).message);
      }
    }
    return `${total.avisos} avisos, ${total.cerrados} reportes cerrados, ${total.disposicion} por disponer`;
  },
});
