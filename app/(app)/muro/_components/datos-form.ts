import type { Ctx } from "@/lib/auth/context";
import { listarSegmentos, opcionesSegmento } from "@/lib/segmentos";

/** Datos que necesita el formulario de publicación (segmentos, opciones y encuestas abiertas). */
export async function datosFormularioPublicacion(ctx: Ctx) {
  const [opciones, segmentos, encuestas] = await Promise.all([
    opcionesSegmento(ctx),
    listarSegmentos(ctx),
    ctx.db.encuesta.findMany({ where: { estado: { in: ["ABIERTA", "BORRADOR"] } }, select: { id: true, titulo: true }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return {
    opciones,
    segmentos: segmentos.map((s) => ({ value: s.id, label: s.nombre })),
    encuestas: encuestas.map((e) => ({ value: e.id, label: e.titulo })),
  };
}
