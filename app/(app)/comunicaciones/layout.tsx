import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { PageHeader } from "@/components/app/page-header";
import { TabsNav } from "@/components/app/tabs-nav";

export default async function ComunicacionesLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePage(["comunicaciones.correo_masivo", "comunicaciones.segmentos"]);
  const tabs = [
    ...(can(ctx, "comunicaciones.correo_masivo") ? [{ href: "/comunicaciones", label: "Campañas" }] : []),
    ...(can(ctx, "comunicaciones.segmentos") ? [{ href: "/comunicaciones/segmentos", label: "Segmentos" }] : []),
  ];
  return (
    <>
      <PageHeader titulo="Correo masivo" descripcion="Campañas por segmento con vista previa, programación y métricas" />
      <TabsNav tabs={tabs} exact={false} />
      {children}
    </>
  );
}
