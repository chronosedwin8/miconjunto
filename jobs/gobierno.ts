import { systemCtx } from "@/lib/auth/system-ctx";
import { cerrarVotacionesVencidas } from "@/lib/votaciones/service";
import { cerrarEncuestasVencidas } from "@/lib/encuestas/service";
import { enviarRecordatorios } from "@/lib/asambleas/service";
import { defineJob } from "./registry";

/** Jobs de gobierno: cierre automático de votaciones y encuestas, y recordatorios (sección 10). */

defineJob({
  name: "gobierno-cierre",
  cron: "*/5 * * * *",
  descripcion: "Cierre automático de votaciones y encuestas vencidas (calcula resultado y código de acta)",
  handler: async () => {
    const v = await cerrarVotacionesVencidas((id) => systemCtx(id));
    const e = await cerrarEncuestasVencidas((id) => systemCtx(id));
    return `${v} votaciones y ${e} encuestas cerradas`;
  },
});

defineJob({
  name: "gobierno-recordatorios",
  cron: "*/5 * * * *",
  descripcion: "Recordatorios de asamblea (1 día y 1 hora antes) y de votaciones por cerrar",
  handler: async () => `${await enviarRecordatorios()} recordatorios enviados`,
});
