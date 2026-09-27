/** Jobs de reservas y facturación electrónica (spec §10). */
import { defineJob } from "./registry";
import { conjuntosActivos } from "./definitions";
import { cerrarReservasVencidas, enviarRecordatorios } from "@/lib/reservas/service";
import { procesarPendientes } from "@/lib/facturacion/service";

defineJob({
  name: "reservas-recordatorios",
  cron: "0 * * * *",
  descripcion: "Recordatorio de reservas 24 horas antes (cada hora)",
  handler: async () => {
    let n = 0;
    for (const c of await conjuntosActivos()) n += await enviarRecordatorios(c.id);
    return `${n} recordatorios enviados`;
  },
});

defineJob({
  name: "reservas-cierre",
  cron: "15 * * * *",
  descripcion: "Marca reservas cumplidas / no se presentó y cancela solicitudes vencidas sin pago",
  handler: async () => {
    const t = { canceladas: 0, cumplidas: 0, noShow: 0 };
    for (const c of await conjuntosActivos()) {
      const r = await cerrarReservasVencidas(c.id);
      t.canceladas += r.canceladas;
      t.cumplidas += r.cumplidas;
      t.noShow += r.noShow;
    }
    return `${t.cumplidas} cumplidas, ${t.noShow} no se presentó, ${t.canceladas} canceladas`;
  },
});

defineJob({
  name: "facturacion-pendiente",
  cron: "*/5 * * * *",
  descripcion: "Emite facturas electrónicas pendientes y reintenta errores con backoff",
  handler: async () => {
    const r = await procesarPendientes();
    return `${r.validadas} validadas, ${r.errores} con error`;
  },
});
