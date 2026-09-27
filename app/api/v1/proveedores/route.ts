import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { zs } from "@/lib/validation";
import { guardarProveedor, listarProveedores } from "@/lib/proveedores/service";

/** GET /api/v1/proveedores?q=&categoria=&directorio=si|no&estado=inactivos|todos — proveedores con alertas de documentos. */
export const GET = apiHandler(
  {
    perm: "proveedores.ver",
    schema: z.object({
      q: z.string().optional(),
      categoria: z.string().optional(),
      directorio: z.string().optional(),
      estado: z.string().optional(),
      take: z.coerce.number().int().min(1).max(500).default(100),
      skip: z.coerce.number().int().min(0).default(0),
    }),
  },
  async ({ ctx, input }) => listarProveedores(ctx, input, { take: input.take, skip: input.skip }),
);

/** POST /api/v1/proveedores — crea un proveedor (NIT único por conjunto). */
export const POST = apiHandler(
  {
    perm: "proveedores.crear",
    schema: z.object({
      nit: z.string().regex(/^\d{5,12}(-\d)?$/, "NIT no válido"),
      razonSocial: zs.text(2, 150),
      categoria: zs.text(2, 60),
      contactoNombre: zs.optText(100),
      telefono: zs.optText(30),
      email: zs.optEmail(),
      direccion: zs.optText(150),
      tarifas: zs.optText(2000),
      directorioComunitario: z.boolean().default(false),
      beneficioComunidad: zs.optText(500),
      activo: z.boolean().default(true),
    }),
  },
  async ({ ctx, input }) => guardarProveedor(ctx, input),
);
