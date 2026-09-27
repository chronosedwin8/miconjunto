import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { unidadOptions } from "@/lib/conjunto/options";
import { isoDate } from "@/lib/format";
import { PageHeader, Section } from "@/components/app/page-header";
import { UnidadJump } from "./unidad-jump";

export const metadata = { title: "Informes" };

export default async function InformesPage() {
  const ctx = await requirePage(["informes.historial_unidad", "informes.empalme"]);
  const hoy = new Date();
  const hace = new Date(hoy.getFullYear() - 1, hoy.getMonth(), hoy.getDate());
  return (
    <>
      <PageHeader titulo="Informes" descripcion="Historial de unidades e informe de gestión para empalme de administración." />
      <div className="grid gap-4 md:grid-cols-2">
        {can(ctx, "informes.historial_unidad") && (
          <Section titulo="Historial de una unidad">
            <div className="rounded-xl border bg-card p-4">
              <p className="mb-3 text-sm text-muted-foreground">Línea de tiempo de propietarios, arrendatarios, pagos, multas, PQRS, reservas, obras y mudanzas. Útil en ventas y cambios de administración.</p>
              <UnidadJump unidades={await unidadOptions(ctx)} />
            </div>
          </Section>
        )}
        {can(ctx, "informes.empalme") && (
          <Section titulo="Informe de gestión / empalme">
            <form action="/informes/empalme" className="space-y-3 rounded-xl border bg-card p-4">
              <p className="text-sm text-muted-foreground">Rendición de cuentas (Ley 675 de 2001): estructura, cartera, recaudo, gastos, PQRS, mantenimiento, contratos, pólizas, asambleas y pendientes.</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm">
                  Desde
                  <input type="date" name="desde" defaultValue={isoDate(hace)} className="mt-1 h-11 w-full rounded-lg border bg-background px-2" />
                </label>
                <label className="text-sm">
                  Hasta
                  <input type="date" name="hasta" defaultValue={isoDate(hoy)} className="mt-1 h-11 w-full rounded-lg border bg-background px-2" />
                </label>
              </div>
              <button className="h-11 w-full rounded-lg bg-primary font-medium text-primary-foreground">Generar informe</button>
            </form>
          </Section>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        También puedes ver el <Link className="text-primary" href="/estadisticas">tablero de estadísticas</Link>.
      </p>
    </>
  );
}
