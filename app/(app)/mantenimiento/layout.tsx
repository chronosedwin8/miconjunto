import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { vePlanes } from "@/lib/mantenimiento/service";
import { PageHeader } from "@/components/app/page-header";
import { TabsNav } from "@/components/app/tabs-nav";

export default async function MantenimientoLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePage("mantenimiento.ver");
  if (!vePlanes(ctx)) {
    return (
      <>
        <PageHeader titulo="Mis órdenes de trabajo" descripcion={`${ctx.conjunto.nombre} · órdenes asignadas a ti`} />
        {children}
      </>
    );
  }
  const tabs = [
    { href: "/mantenimiento", label: "Órdenes" },
    { href: "/mantenimiento/planes", label: "Plan" },
    { href: "/mantenimiento/calendario", label: "Calendario" },
    { href: "/mantenimiento/vencimientos", label: "Vencimientos" },
    ...(can(ctx, "mantenimiento.ver_todos") ? [{ href: "/mantenimiento/indicadores", label: "Indicadores" }] : []),
  ];
  return (
    <>
      <PageHeader titulo="Mantenimiento" descripcion={can(ctx, "mantenimiento.ver_todos") ? "Órdenes de trabajo, plan preventivo y legal, calendario y vencimientos." : "Tus órdenes asignadas y el plan de mantenimiento."} />
      <TabsNav tabs={tabs} />
      {children}
    </>
  );
}
