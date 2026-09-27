import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { PageHeader } from "@/components/app/page-header";
import { TabsNav } from "@/components/app/tabs-nav";

export default async function PresupuestoLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePage("presupuesto.ver");
  return (
    <>
      <PageHeader titulo="Presupuesto y gastos" descripcion="Presupuesto anual, ejecución, gastos con aprobación y exportación contable." />
      <TabsNav
        tabs={[
          { href: "/presupuesto", label: "Ejecución" },
          { href: "/presupuesto/rubros", label: "Rubros" },
          { href: "/presupuesto/gastos", label: "Gastos" },
          ...(can(ctx, "presupuesto.exportar") ? [{ href: "/presupuesto/exportacion", label: "Exportación contable" }] : []),
        ]}
      />
      {children}
    </>
  );
}
