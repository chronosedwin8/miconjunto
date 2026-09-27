import { requirePage } from "@/lib/auth/guard";
import { opcionesSegmento, listarSegmentos } from "@/lib/segmentos";
import { VARIABLES_CORREO } from "@/lib/comunicaciones/correo-masivo";
import { Section } from "@/components/app/page-header";
import { CampanaForm } from "../_components/campana-form";
import { guardarCampanaAction, vistaPreviaCorreoAction } from "../actions";
import { contarSegmentoAction } from "../segmentos/actions";

export const metadata = { title: "Nueva campaña" };

export default async function NuevaCampanaPage() {
  const ctx = await requirePage("comunicaciones.correo_masivo");
  const [opciones, segmentos] = await Promise.all([opcionesSegmento(ctx), listarSegmentos(ctx)]);
  return (
    <Section titulo="Nueva campaña">
      <div className="max-w-2xl">
        <CampanaForm
          guardar={guardarCampanaAction}
          previa={vistaPreviaCorreoAction}
          contar={contarSegmentoAction}
          opciones={opciones}
          segmentos={segmentos.map((s) => ({ value: s.id, label: s.nombre }))}
          variables={[...VARIABLES_CORREO]}
        />
      </div>
    </Section>
  );
}
