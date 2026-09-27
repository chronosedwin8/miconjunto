import { systemCtx } from "@/lib/auth/system-ctx";
import { generarOrdenesProgramadas } from "@/lib/mantenimiento/service";
import { revisarVencimientos } from "@/lib/mantenimiento/vencimientos";
import { conjuntosActivos } from "./definitions";
import { defineJob } from "./registry";

/** §10: Generar órdenes de mantenimiento — diario 06:00. */
defineJob({
  name: "mantenimiento-generar-ordenes",
  cron: "0 6 * * *",
  descripcion: "Genera las órdenes de trabajo de los planes de mantenimiento que llegan a su fecha (menos la anticipación)",
  handler: async () => {
    let total = 0;
    for (const c of await conjuntosActivos()) {
      try {
        const ctx = await systemCtx(c.id);
        total += (await generarOrdenesProgramadas(ctx)).length;
      } catch (e) {
        console.error(`[mantenimiento] ${c.nombre}:`, (e as Error).message);
      }
    }
    return `${total} órdenes generadas`;
  },
});

/** §10: Vencimientos (garantías, documentos de proveedores, contratos, EPS/ARL, certificaciones legales) — diario 07:00. */
defineJob({
  name: "mantenimiento-vencimientos",
  cron: "0 7 * * *",
  descripcion: "Actualiza contratos (renovación automática) y avisa vencimientos de garantías, pólizas, documentos, EPS/ARL y mantenimientos legales",
  handler: async () => {
    let avisos = 0;
    let renovados = 0;
    for (const c of await conjuntosActivos()) {
      try {
        const ctx = await systemCtx(c.id);
        const r = await revisarVencimientos(ctx);
        avisos += r.avisos;
        renovados += r.renovados;
      } catch (e) {
        console.error(`[vencimientos] ${c.nombre}:`, (e as Error).message);
      }
    }
    return `${avisos} vencimientos avisados, ${renovados} contratos renovados`;
  },
});
