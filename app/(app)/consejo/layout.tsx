import { requirePage } from "@/lib/auth/guard";
import { aprobacionesPendientes } from "@/lib/consejo/service";
import { PageHeader } from "@/components/app/page-header";
import { TabsNav } from "@/components/app/tabs-nav";

export default async function ConsejoLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePage("consejo.ver");
  const pend = await aprobacionesPendientes(ctx);
  return (
    <>
      <PageHeader titulo="Consejo de administración" descripcion="Miembros, reuniones con acta y decisiones, y aprobaciones pendientes." />
      <TabsNav
        tabs={[
          { href: "/consejo", label: "Miembros" },
          { href: "/consejo/reuniones", label: "Reuniones" },
          { href: "/consejo/aprobaciones", label: "Aprobaciones pendientes", count: pend.total },
        ]}
      />
      {children}
    </>
  );
}
