import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { TabsNav } from "@/components/app/tabs-nav";

export default async function FacturacionLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePage("facturacion.ver");
  const tabs = [{ href: "/facturacion", label: "Documentos" }, ...(can(ctx, "facturacion.exportar") ? [{ href: "/facturacion/reporte", label: "Reporte para el contador" }] : [])];
  return (
    <>
      {tabs.length > 1 && <TabsNav tabs={tabs} exact />}
      {children}
    </>
  );
}
