import { requirePage } from "@/lib/auth/guard";
import { torreOptions } from "@/lib/conjunto/options";
import { PageHeader } from "@/components/app/page-header";
import { EncuestaForm } from "./encuesta-form";

export const metadata = { title: "Nueva encuesta" };

export default async function NuevaEncuestaPage() {
  const ctx = await requirePage("encuestas.crear");
  const [torres, segmentos] = await Promise.all([torreOptions(ctx), ctx.db.segmento.findMany({ orderBy: { nombre: "asc" }, select: { id: true, nombre: true } })]);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader titulo="Nueva encuesta" volver="/encuestas" descripcion="Se publica de inmediato, se avisa a la audiencia y cierra sola en la fecha indicada." />
      <EncuestaForm torres={torres} segmentos={segmentos.map((s) => ({ value: s.id, label: s.nombre }))} />
    </div>
  );
}
