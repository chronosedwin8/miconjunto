import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { CATEGORIAS_OBJETO } from "@/lib/objetos-perdidos/reglas";
import { aPublico, listarObjetos, reportarObjeto } from "@/lib/objetos-perdidos/service";

/** GET /api/v1/objetos-perdidos?vista=abiertos|perdidos|encontrados|custodia|mis|historial&q=&categoria=&tipo=&estado=&zonaId=&dias=&take=&skip= — reportes visibles (sin rasgos privados ajenos). */
export const GET = apiHandler(
  {
    perm: "objetos.ver",
    schema: z.object({
      vista: z.string().optional(),
      q: z.string().optional(),
      categoria: z.string().optional(),
      tipo: z.enum(["PERDIDO", "ENCONTRADO"]).optional(),
      estado: z.string().optional(),
      zonaId: z.string().optional(),
      dias: z.coerce.number().int().min(1).max(3650).optional(),
      take: z.coerce.number().int().min(1).max(200).default(50),
      skip: z.coerce.number().int().min(0).default(0),
    }),
  },
  async ({ ctx, input }) => {
    const r = await listarObjetos(ctx, input);
    return { total: r.total, items: r.items.map((o) => aPublico(ctx, o)) };
  },
);

/** POST /api/v1/objetos-perdidos — reporta un objeto. Cuerpo: { tipo, categoria, titulo, descripcion, rasgosPrivados?, color?, marca?, lugar?, zonaId?, fecha?, fotos?, contacto?, recompensa?, custodia? }. Las fotos se suben antes a /api/upload. */
export const POST = apiHandler(
  {
    perm: "objetos.reportar",
    schema: z.object({
      tipo: z.enum(["PERDIDO", "ENCONTRADO"]),
      categoria: z.enum(CATEGORIAS_OBJETO).default("OTRO"),
      titulo: z.string().trim().min(3).max(80),
      descripcion: z.string().trim().min(5).max(600),
      rasgosPrivados: z.string().max(600).nullish(),
      color: z.string().max(40).nullish(),
      marca: z.string().max(60).nullish(),
      lugar: z.string().max(120).nullish(),
      zonaId: z.string().nullish(),
      fecha: z.coerce.date().nullish(),
      fotos: z.array(z.string()).max(6).default([]),
      contacto: z.string().max(120).nullish(),
      recompensa: z.string().max(120).nullish(),
      custodia: z.string().max(120).nullish(),
    }),
  },
  async ({ ctx, input }) => {
    const o = await reportarObjeto(ctx, input);
    return { id: o.id, codigo: o.codigo, estado: o.estado, coincidencias: o.coincidencias };
  },
);
