import { requirePage } from "@/lib/auth/guard";
import { zonaOptions } from "@/lib/conjunto/options";
import { proveedorOptions } from "@/lib/mantenimiento/service";
import { PageHeader } from "@/components/app/page-header";
import { ActivoForm } from "../activo-form";

export const metadata = { title: "Nuevo activo" };

export default async function NuevoActivoPage() {
  const ctx = await requirePage("activos.crear");
  const [zonas, proveedores] = await Promise.all([zonaOptions(ctx), proveedorOptions(ctx)]);
  return (
    <>
      <PageHeader titulo="Nuevo activo" volver="/activos" descripcion="Al guardarlo se genera su código QR para la etiqueta." />
      <div className="rounded-xl border bg-card p-4">
        <ActivoForm zonas={zonas} proveedores={proveedores} />
      </div>
    </>
  );
}
