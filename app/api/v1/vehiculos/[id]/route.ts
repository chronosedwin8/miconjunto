import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { notFound } from "@/lib/errors";
import { assertUnidadAccesible, eliminarVehiculo, guardarVehiculo } from "@/lib/residentes/service";

async function cargar(ctx: Parameters<typeof assertUnidadAccesible>[0], id: string) {
  const v = await ctx.db.vehiculo.findUnique({ where: { id }, include: { unidad: { select: { codigo: true } }, parqueadero: { select: { codigo: true } } } });
  if (!v) notFound("El vehículo");
  assertUnidadAccesible(ctx, v.unidadId, "vehiculos");
  return v;
}

/** GET /api/v1/vehiculos/:id */
export const GET = apiHandler({ perm: ["vehiculos.ver", "vehiculos.ver_todos"] }, async ({ ctx, params }) => cargar(ctx, params.id));

/** PATCH /api/v1/vehiculos/:id */
export const PATCH = apiHandler(
  {
    perm: "vehiculos.editar",
    schema: z.object({
      placa: z.string().min(2).max(12).optional(),
      tipo: z.enum(["CARRO", "MOTO", "BICICLETA", "OTRO"]).optional(),
      marca: z.string().max(40).nullable().optional(),
      modelo: z.string().max(20).nullable().optional(),
      color: z.string().max(30).nullable().optional(),
      soatVence: z.coerce.date().nullable().optional(),
      tecnomecanicaVence: z.coerce.date().nullable().optional(),
      parqueaderoId: z.string().nullable().optional(),
    }),
  },
  async ({ ctx, params, input }) => {
    const v = await cargar(ctx, params.id);
    return guardarVehiculo(ctx, {
      id: v.id,
      unidadId: v.unidadId,
      placa: input.placa ?? v.placa,
      tipo: input.tipo ?? v.tipo,
      marca: input.marca === undefined ? v.marca : input.marca,
      modelo: input.modelo === undefined ? v.modelo : input.modelo,
      color: input.color === undefined ? v.color : input.color,
      soatVence: input.soatVence === undefined ? v.soatVence : input.soatVence,
      tecnomecanicaVence: input.tecnomecanicaVence === undefined ? v.tecnomecanicaVence : input.tecnomecanicaVence,
      parqueaderoId: input.parqueaderoId === undefined ? v.parqueaderoId : input.parqueaderoId,
    });
  },
);

/** DELETE /api/v1/vehiculos/:id */
export const DELETE = apiHandler({ perm: "vehiculos.eliminar" }, async ({ ctx, params }) => ({ ok: await eliminarVehiculo(ctx, params.id) }));
