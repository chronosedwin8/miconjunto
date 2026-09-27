import { apiHandler } from "@/lib/api/handler";
import { bloquesParaMostrar } from "@/lib/muro/contenido";
import { detallePublicacion, eliminarPublicacion, registrarLectura } from "@/lib/muro/service";

/** GET /api/v1/publicaciones/:id — detalle con bloques (HTML sanitizado), reacciones y comentarios. Registra la lectura. */
export const GET = apiHandler({ perm: ["comunicaciones.ver", "clasificados.ver"] }, async ({ ctx, params }) => {
  const d = await detallePublicacion(ctx, params.id);
  if (d.publicacion.estado === "PUBLICADA") await registrarLectura(ctx, params.id);
  const p = d.publicacion;
  return {
    id: p.id,
    titulo: p.titulo,
    categoria: p.categoria,
    estado: p.estado,
    fijada: p.fijada,
    autor: p.autor.nombre,
    createdAt: p.createdAt,
    venceEn: p.venceEn,
    precio: p.precio,
    imagenes: p.imagenes,
    contenido: bloquesParaMostrar(p.contenido),
    reacciones: d.reacciones,
    miReaccion: d.miReaccion,
    lecturas: d.lecturas,
    comentarios: d.comentarios.map((c) => ({ id: c.id, autor: c.autorNombre, contenido: c.contenido, oculto: c.oculto, createdAt: c.createdAt })),
  };
});

/** DELETE /api/v1/publicaciones/:id — elimina (autor o moderación). */
export const DELETE = apiHandler({ perm: ["comunicaciones.ver", "clasificados.ver"] }, async ({ ctx, params }) => eliminarPublicacion(ctx, params.id));
