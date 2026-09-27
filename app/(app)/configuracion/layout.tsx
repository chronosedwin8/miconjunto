import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { PageHeader } from "@/components/app/page-header";
import { TabsNav } from "@/components/app/tabs-nav";

export default async function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePage("configuracion.ver");
  const tabs = [
    { href: "/configuracion", label: "Datos del conjunto" },
    { href: "/configuracion/parametros", label: "Parámetros" },
    ...(can(ctx, "configuracion.roles")
      ? [
          { href: "/configuracion/usuarios", label: "Usuarios" },
          { href: "/configuracion/roles", label: "Roles y permisos" },
          { href: "/configuracion/visibilidad", label: "Visibilidad" },
        ]
      : []),
    ...(can(ctx, "configuracion.integraciones") ? [{ href: "/configuracion/integraciones", label: "Integraciones" }] : []),
    ...(can(ctx, "configuracion.api") ? [{ href: "/configuracion/api", label: "API y webhooks" }] : []),
    { href: "/configuracion/correos", label: "Buzón de correos" },
  ];
  return (
    <>
      <PageHeader titulo="Configuración" descripcion="Parametrización del conjunto, roles, permisos e integraciones" />
      <TabsNav tabs={tabs} />
      {children}
    </>
  );
}
