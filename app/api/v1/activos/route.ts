import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { zs } from "@/lib/validation";
import { guardarActivo, listarActivos } from "@/lib/activos/service";

/** GET /api/v1/activos?q=&categoria=&estado=&take=&skip= — inventario de activos. */
export const GET = apiHandler(
  {
    perm: "activos.ver",
    schema: z.object({
      q: z.string().optional(),
      categoria: z.string().optional(),
      estado: z.string().optional(),
      take: z.coerce.number().int().min(1).max(500).default(100),
      skip: z.coerce.number().int().min(0).default(0),
    }),
  },
  async ({ ctx, input }) => listarActivos(ctx, input, { take: input.take, skip: input.skip }),
);

/** POST /api/v1/activos — crea un activo. Fechas en formato AAAA-MM-DD. */
export const POST = apiHandler(
  {
    perm: "activos.crear",
    schema: z.object({
      nombre: zs.text(1, 120),
      categoria: zs.text(1, 60),
      ubicacion: zs.optText(120),
      zonaId: zs.optId(),
      marca: zs.optText(60),
      modelo: zs.optText(60),
      serie: zs.optText(80),
      fechaCompra: zs.optDate(),
      valor: zs.optMoney(),
      vidaUtilAnios: zs.optInt(),
      proveedorId: zs.optId(),
      garantiaVence: zs.optDate(),
      estado: z.enum(["OPERATIVO", "EN_MANTENIMIENTO", "FUERA_SERVICIO", "DADO_DE_BAJA"]).default("OPERATIVO"),
      notas: zs.optText(2000),
    }),
  },
  async ({ ctx, input }) => guardarActivo(ctx, input),
);
