import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { TabsNav } from "@/components/app/tabs-nav";

export default async function ReservasLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePage(["reservas.ver", "reservas.ver_todos", "reservas.checkin"]);
  const tabs = [
    ...(can(ctx, "reservas.crear") ? [{ href: "/reservas", label: "Reservar" }] : []),
    ...(can(ctx, "reservas.ver") && ctx.unidadIds.length ? [{ href: "/reservas/mis", label: "Mis reservas" }] : []),
    ...(can(ctx, "reservas.ver_todos") ? [{ href: "/reservas/admin", label: "Administrar" }] : []),
    ...(can(ctx, "reservas.checkin") ? [{ href: "/reservas/checkin", label: "Portería (hoy)" }] : []),
  ];
  return (
    <>
      {tabs.length > 1 && <TabsNav tabs={tabs} exact />}
      {children}
    </>
  );
}
