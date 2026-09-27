import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { apiHandler } from "@/lib/api/handler";
import { seesAll } from "@/lib/permisos";
import { guardarVehiculo } from "@/lib/residentes/service";
import { normalizarPlaca } from "@/lib/residentes/calculos";

const vehiculoSchema = z.object({
  unidadId: z.string().min(1),
  placa: z.string().min(2).max(12),
  tipo: z.enum(["CARRO", "MOTO", "BICICLETA", "OTRO"]).default("CARRO"),
  marca: z.string().max(40).nullable().optional(),
  modelo: z.string().max(20).nullable().optional(),
  color: z.string().max(30).nullable().optional(),
  soatVence: z.coerce.date().nullable().optional(),
  tecnomecanicaVence: z.coerce.date().nullable().optional(),
  parqueaderoId: z.string().nullable().optional(),
});

/** GET /api/v1/vehiculos?placa=&unidadId=&tipo=&take=&skip= — búsqueda por placa (normalizada) para portería o cámaras LPR. */
export const GET = apiHandler(
  {
    perm: ["vehiculos.ver", "vehiculos.ver_todos"],
    schema: z.object({
      placa: z.string().max(12).optional(),
      unidadId: z.string().optional(),
      tipo: z.enum(["CARRO", "MOTO", "BICICLETA", "OTRO"]).optional(),
      take: z.coerce.number().int().min(1).max(500).default(100),
      skip: z.coerce.number().int().min(0).default(0),
    }),
  },
  async ({ ctx, input }) => {
    const where: Prisma.VehiculoWhereInput = {
      activo: true,
      ...(input.placa ? { placa: { contains: normalizarPlaca(input.placa) } } : {}),
      ...(input.unidadId ? { unidadId: input.unidadId } : {}),
      ...(input.tipo ? { tipo: input.tipo } : {}),
      ...(seesAll(ctx, "vehiculos") ? {} : { unidadId: { in: ctx.unidadIds } }),
    };
    const [items, total] = await Promise.all([
      ctx.db.vehiculo.findMany({ where, orderBy: { placa: "asc" }, take: input.take, skip: input.skip, include: { unidad: { select: { codigo: true } }, parqueadero: { select: { codigo: true } } } }),
      ctx.db.vehiculo.count({ where }),
    ]);
    return { total, items };
  },
);

/** POST /api/v1/vehiculos — registra un vehículo (placa única por conjunto). */
export const POST = apiHandler({ perm: "vehiculos.crear", schema: vehiculoSchema }, async ({ ctx, input }) => guardarVehiculo(ctx, input));
