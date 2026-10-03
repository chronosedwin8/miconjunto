import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { PageHeader } from "@/components/app/page-header";
import { TabsNav } from "@/components/app/tabs-nav";

export default async function ClasificadosLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePage(["clasificados.ver", "clasificados.moderar"]);
  const pendientes = can(ctx, ["clasificados.moderar", "comunicaciones.moderar"]) ? await ctx.db.publicacion.count({ where: { estado: "PENDIENTE_MODERACION" } }) : null;
  const tabs = [
    { href: "/clasificados", label: "Clasificados" },
    ...(pendientes !== null ? [{ href: "/clasificados/moderacion", label: "Moderación", count: pendientes }] : []),
  ];
  return (
    <>
      <PageHeader titulo="Clasificados" descripcion="Marketplace vecinal moderado" />
      <TabsNav tabs={tabs} />
      {children}
    </>
  );
}
