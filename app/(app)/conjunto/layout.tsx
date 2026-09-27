import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { PageHeader } from "@/components/app/page-header";
import { TabsNav } from "@/components/app/tabs-nav";

export default async function ConjuntoLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePage("conjunto.ver");
  const tabs = [
    { href: "/conjunto", label: "Resumen y plano" },
    { href: "/conjunto/unidades", label: "Unidades" },
    { href: "/conjunto/torres", label: "Torres" },
    { href: "/conjunto/parqueaderos", label: "Parqueaderos" },
    { href: "/conjunto/bodegas", label: "Bodegas" },
    { href: "/conjunto/zonas", label: "Zonas comunes" },
    ...(can(ctx, "conjunto.importar") ? [{ href: "/conjunto/importar", label: "Importar Excel" }] : []),
  ];
  return (
    <>
      <PageHeader titulo="Conjunto y estructura física" descripcion={ctx.conjunto.nombre} />
      <TabsNav tabs={tabs} />
      {children}
    </>
  );
}
