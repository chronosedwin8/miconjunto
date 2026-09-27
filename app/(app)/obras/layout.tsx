import { requirePage } from "@/lib/auth/guard";
import { PageHeader } from "@/components/app/page-header";
import { TabsNav } from "@/components/app/tabs-nav";

export default async function ObrasLayout({ children }: { children: React.ReactNode }) {
  await requirePage(["obras.ver", "obras.ver_todos"]);
  return (
    <>
      <PageHeader titulo="Obras y mudanzas" descripcion="Solicitudes de remodelación en unidades y agenda de mudanzas (ascensor y zona de cargue)." />
      <TabsNav
        tabs={[
          { href: "/obras", label: "Obras y remodelaciones" },
          { href: "/obras/mudanzas", label: "Mudanzas" },
        ]}
      />
      {children}
    </>
  );
}
