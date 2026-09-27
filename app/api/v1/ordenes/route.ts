import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { zs } from "@/lib/validation";
import { guardarOrden, listarOrdenes } from "@/lib/mantenimiento/service";

/**
 * GET /api/v1/ordenes?vista=abiertas|atrasadas|cerradas|todas&estado=&origen=&activoId=&q=
 * Sin `mantenimiento.ver_todos` devuelve solo las órdenes asignadas al usuario o a su proveedor.
 */
export const GET = apiHandler(
  {
    perm: "mantenimiento.ver",
    schema: z.object({
      q: z.string().optional(),
      vista: z.enum(["abiertas", "atrasadas", "cerradas", "todas"]).optional(),
      estado: z.string().optional(),
      origen: z.string().optional(),
      activoId: z.string().optional(),
      proveedorId: z.string().optional(),
      take: z.coerce.number().int().min(1).max(500).default(100),
      skip: z.coerce.number().int().min(0).default(0),
    }),
  },
  async ({ ctx, input }) => listarOrdenes(ctx, input, { take: input.take, skip: input.skip }),
);

/** POST /api/v1/ordenes — crea una orden manual. `checklist` es un arreglo de textos. */
export const POST = apiHandler(
  {
    perm: ["mantenimiento.crear", "mantenimiento.gestionar"],
    schema: z.object({
      titulo: zs.text(3, 150),
      descripcion: zs.optText(3000),
      activoId: zs.optId(),
      zonaId: zs.optId(),
      proveedorId: zs.optId(),
      asignadoAId: zs.optId(),
      fechaProgramada: zs.date(),
      checklist: z.array(z.string().min(1)).optional(),
      costo: zs.optMoney(),
    }),
  },
  async ({ ctx, input }) => guardarOrden(ctx, input),
);
