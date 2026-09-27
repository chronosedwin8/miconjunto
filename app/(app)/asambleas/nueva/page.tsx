import { requirePage } from "@/lib/auth/guard";
import { PageHeader } from "@/components/app/page-header";
import { AsambleaForm } from "../asamblea-form";

export const metadata = { title: "Nueva asamblea" };

export default async function NuevaAsambleaPage() {
  await requirePage("asambleas.crear");
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader titulo="Nueva asamblea" volver="/asambleas" descripcion="Se crea en borrador con un orden del día sugerido. Luego revisas la convocatoria y la envías." />
      <AsambleaForm />
    </div>
  );
}
