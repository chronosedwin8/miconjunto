import { requirePage } from "@/lib/auth/guard";
import { PageHeader } from "@/components/app/page-header";
import { TabsNav } from "@/components/app/tabs-nav";

export default async function ProveedoresLayout({ children }: { children: React.ReactNode }) {
  await requirePage("proveedores.ver");
  return (
    <>
      <PageHeader titulo="Proveedores y contratos" descripcion="Documentos con vencimiento, contratos, calificación y desempeño." />
      <TabsNav
        tabs={[
          { href: "/proveedores", label: "Proveedores" },
          { href: "/proveedores/contratos", label: "Contratos" },
          { href: "/proveedores/documentos", label: "Documentos" },
          { href: "/proveedores/desempeno", label: "Desempeño" },
        ]}
      />
      {children}
    </>
  );
}
