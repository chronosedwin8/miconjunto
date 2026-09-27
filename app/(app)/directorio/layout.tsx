import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { PageHeader } from "@/components/app/page-header";
import { TabsNav } from "@/components/app/tabs-nav";

export default async function DirectorioLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePage(["directorio.ver", "directorio.proveedores"]);
  const tabs = [
    ...(can(ctx, "directorio.ver") ? [{ href: "/directorio", label: "Vecinos" }] : []),
    ...(can(ctx, "directorio.proveedores") ? [{ href: "/directorio/proveedores", label: "Proveedores" }] : []),
    ...(ctx.personaIds.length || ctx.unidadIds.length ? [{ href: "/directorio/mi-ficha", label: "Mi ficha" }] : []),
  ];
  return (
    <>
      <PageHeader titulo="Directorio" descripcion="Vecinos que decidieron compartir sus datos y proveedores recomendados para la comunidad" />
      <TabsNav tabs={tabs} exact />
      {children}
    </>
  );
}
