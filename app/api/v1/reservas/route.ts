import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { zs } from "@/lib/validation";
import { crearReserva, whereReservas } from "@/lib/reservas/service";
import { toNumber } from "@/lib/format";

const listar = z.object({ zona: z.string().optional(), estado: z.string().optional(), desde: z.string().optional(), hasta: z.string().optional(), q: z.string().optional(), limite: z.coerce.number().int().min(1).max(500).optional() });

/** GET /api/v1/reservas — propias (o todas con `reservas.ver_todos`). Filtros: zona, estado, desde, hasta, q (unidad). */
export const GET = apiHandler({ perm: ["reservas.ver", "reservas.ver_todos"], schema: listar }, async ({ ctx, input }) => {
  const rows = await ctx.db.reserva.findMany({
    where: whereReservas(ctx, input),
    include: { zona: { select: { nombre: true } }, unidad: { select: { codigo: true } } },
    orderBy: { inicio: "desc" },
    take: input.limite ?? 100,
  });
  return rows.map((r) => ({
    id: r.id,
    zonaId: r.zonaId,
    zona: r.zona.nombre,
    unidadId: r.unidadId,
    unidad: r.unidad.codigo,
    inicio: r.inicio,
    fin: r.fin,
    estado: r.estado,
    asistentes: r.asistentes,
    valor: toNumber(r.valor),
    iva: toNumber(r.iva),
    deposito: toNumber(r.deposito),
    pagada: r.pagada,
    cuotaId: r.cuotaId,
  }));
});

const crear = z.object({ zonaId: zs.id(), unidadId: zs.optId(), inicio: z.string(), fin: z.string(), asistentes: z.coerce.number().int().min(1), motivo: zs.optText(300) });

/** POST /api/v1/reservas — { zonaId, unidadId?, inicio (ISO), fin (ISO), asistentes, motivo? }. Devuelve la reserva y el enlace de pago si aplica. */
export const POST = apiHandler({ perm: "reservas.crear", schema: crear }, async ({ ctx, input }) => {
  const r = await crearReserva(ctx, { ...input, inicio: new Date(input.inicio), fin: new Date(input.fin) });
  return { id: r.reserva.id, estado: r.reserva.estado, cuotaIds: r.cuotaIds, requierePago: r.requierePago, enlacePago: r.enlacePago, valores: r.valores };
});
