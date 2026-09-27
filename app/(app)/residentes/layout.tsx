import Link from "next/link";
import { UserPlus } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { PageHeader } from "@/components/app/page-header";
import { TabsNav } from "@/components/app/tabs-nav";
import { Button } from "@/components/ui/button";

export default async function ResidentesLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePage("residentes.ver_todos");
  const pendientes = can(ctx, "residentes.aprobar") ? await ctx.db.vinculoUnidad.count({ where: { estado: "PENDIENTE_APROBACION" } }) : 0;
  const tabs = [
    { href: "/residentes", label: "Personas" },
    ...(can(ctx, "residentes.aprobar") ? [{ href: "/residentes/aprobaciones", label: "Por aprobar", count: pendientes }] : []),
    ...(can(ctx, "vehiculos.ver_todos") ? [{ href: "/residentes/vehiculos", label: "Vehículos" }, { href: "/residentes/mascotas", label: "Mascotas" }] : []),
    { href: "/residentes/indicadores", label: "Indicadores" },
  ];
  return (
    <>
      <PageHeader
        titulo="Residentes"
        descripcion="Propietarios, arrendatarios, familias, empleados y autorizados de cada unidad"
        acciones={
          can(ctx, "residentes.crear") ? (
            <Button render={<Link href="/residentes/nueva" />}>
              <UserPlus /> Registrar persona
            </Button>
          ) : undefined
        }
      />
      <TabsNav tabs={tabs} exact />
      {children}
    </>
  );
}
