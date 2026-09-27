import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { buscarAutorizacion } from "@/lib/porteria/service";

/** GET /api/v1/porteria/autorizaciones/validar?codigo=123456 | ?token=… — valida sin registrar (p. ej. lector QR de una cerradura). */
export const GET = apiHandler(
  { perm: "porteria.ver", schema: z.object({ codigo: z.string().regex(/^\d{6}$/).optional(), token: z.string().max(64).optional() }) },
  async ({ ctx, input }) => {
    const r = await buscarAutorizacion(ctx, input);
    if (!r) return { valida: false, motivo: "No existe una autorización con ese código." };
    const a = r.autorizacion;
    return {
      valida: r.evaluacion.ok && r.alertas.length === 0,
      motivo: r.evaluacion.ok ? (r.alertas[0] ?? null) : r.evaluacion.motivo,
      autorizacion: { id: a.id, nombreVisitante: a.nombreVisitante, unidad: a.unidad.codigo, tipo: a.tipo, placa: a.placa, fechaInicio: a.fechaInicio, fechaFin: a.fechaFin, usos: a.usos, usosPermitidos: a.usosPermitidos },
    };
  },
);
