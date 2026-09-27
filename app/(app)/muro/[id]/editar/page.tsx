import { notFound, redirect } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";
import { isoDate } from "@/lib/format";
import { esGestorMuro } from "@/lib/muro/service";
import { PageHeader } from "@/components/app/page-header";
import { contarSegmentoAction } from "@/app/(app)/comunicaciones/segmentos/actions";
import { PublicacionForm } from "../../_components/publicacion-form";
import { datosFormularioPublicacion } from "../../_components/datos-form";
import { guardarPublicacionAction } from "../../actions";

export const metadata = { title: "Editar publicación" };

export default async function EditarPublicacionPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("comunicaciones.ver");
  const { id } = await params;
  const p = await ctx.db.publicacion.findUnique({ where: { id } });
  if (!p) notFound();
  if (p.categoria === "CLASIFICADO") redirect(`/clasificados/${id}/editar`);
  if (!esGestorMuro(ctx)) redirect("/sin-permiso");
  const datos = await datosFormularioPublicacion(ctx);
  return (
    <div className="max-w-2xl">
      <PageHeader volver={`/muro/${id}`} titulo="Editar publicación" />
      <PublicacionForm
        guardar={guardarPublicacionAction}
        contar={contarSegmentoAction}
        {...datos}
        inicial={{ id: p.id, titulo: p.titulo, categoria: p.categoria, contenido: p.contenido, fijada: p.fijada, permiteComentarios: p.permiteComentarios, venceEn: isoDate(p.venceEn), segmentoId: p.segmentoId, audiencia: p.audiencia }}
      />
    </div>
  );
}
