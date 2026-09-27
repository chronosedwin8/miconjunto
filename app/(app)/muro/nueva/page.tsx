import { requirePage } from "@/lib/auth/guard";
import { PageHeader } from "@/components/app/page-header";
import { contarSegmentoAction } from "@/app/(app)/comunicaciones/segmentos/actions";
import { PublicacionForm } from "../_components/publicacion-form";
import { datosFormularioPublicacion } from "../_components/datos-form";
import { guardarPublicacionAction } from "../actions";

export const metadata = { title: "Nueva publicación" };

export default async function NuevaPublicacionPage() {
  const ctx = await requirePage("comunicaciones.publicar");
  const datos = await datosFormularioPublicacion(ctx);
  return (
    <div className="max-w-2xl">
      <PageHeader volver="/muro" titulo="Nueva publicación" descripcion="Arma el contenido por bloques: texto, fotos, video, adjuntos o una encuesta." />
      <PublicacionForm guardar={guardarPublicacionAction} contar={contarSegmentoAction} {...datos} />
    </div>
  );
}
