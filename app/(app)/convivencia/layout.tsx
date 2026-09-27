import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { esGestor } from "@/lib/convivencia/service";
import { PageHeader } from "@/components/app/page-header";
import { TabsNav } from "@/components/app/tabs-nav";

export default async function ConvivenciaLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePage(["convivencia.ver", "convivencia.ver_todos"]);
  if (!esGestor(ctx)) {
    return (
      <>
        <PageHeader titulo="Mis llamados y multas" descripcion="Comunicaciones de convivencia de tus unidades. Solo tú y la administración pueden verlas." />
        {children}
      </>
    );
  }
  const tabs = [
    { href: "/convivencia", label: "Llamados de atención" },
    { href: "/convivencia/multas", label: "Multas" },
    { href: "/convivencia/incidentes", label: "Incidentes" },
    ...(can(ctx, "convivencia.infracciones") ? [{ href: "/convivencia/catalogo", label: "Catálogo de infracciones" }] : []),
  ];
  return (
    <>
      <PageHeader titulo="Convivencia" descripcion="Llamados de atención, multas con debido proceso (Ley 675, art. 59) e incidentes entre vecinos." />
      <TabsNav tabs={tabs} />
      {children}
    </>
  );
}
