import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { CATEGORIAS_DOCUMENTO, guardarDocumento, listarDocumentos } from "@/lib/documentos/service";

/** GET /api/v1/documentos?q=&carpetaId=&categoria=&pendientes=1&take=&skip= — documentos visibles para el usuario. */
export const GET = apiHandler(
  {
    perm: "documentos.ver",
    schema: z.object({
      q: z.string().optional(),
      carpetaId: z.string().optional(),
      categoria: z.string().optional(),
      pendientes: z.string().optional(),
      take: z.coerce.number().int().min(1).max(200).default(50),
      skip: z.coerce.number().int().min(0).default(0),
    }),
  },
  async ({ ctx, input }) => {
    const r = await listarDocumentos(ctx, { ...input, pendientes: input.pendientes === "1" || input.pendientes === "true" });
    return {
      total: r.total,
      items: r.items.map((d) => ({
        id: d.id,
        titulo: d.titulo,
        descripcion: d.descripcion,
        categoria: d.categoria,
        carpeta: d.carpeta?.nombre ?? null,
        versionActual: d.versionActual,
        requiereAcuse: d.requiereAcuse,
        acusado: d.acusado,
        vence: d.vence,
        publicado: d.publicado,
        actualizado: d.updatedAt,
        archivo: d.ultima ? { nombre: d.ultima.nombreArchivo, mime: d.ultima.mime, tamano: d.ultima.tamano, url: `/api/v1/documentos/${d.id}/archivo` } : null,
      })),
    };
  },
);

/** POST /api/v1/documentos — crea un documento (el archivo debe subirse antes a /api/upload). */
export const POST = apiHandler(
  {
    perm: "documentos.crear",
    schema: z.object({
      titulo: z.string().min(3).max(150),
      descripcion: z.string().max(1000).nullish(),
      categoria: z.enum(CATEGORIAS_DOCUMENTO).default("OTRO"),
      carpetaId: z.string().nullish(),
      rolesVisibles: z.array(z.string()).default([]),
      requiereAcuse: z.boolean().default(false),
      vence: z.coerce.date().nullish(),
      publicado: z.boolean().default(true),
      archivoUrl: z.string().min(5),
      notas: z.string().max(500).nullish(),
    }),
  },
  async ({ ctx, input }) => {
    const d = await guardarDocumento(ctx, { ...input, vence: input.vence ?? null });
    return { id: d.id };
  },
);
