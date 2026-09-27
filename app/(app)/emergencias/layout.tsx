import Link from "next/link";
import { Siren } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { PageHeader } from "@/components/app/page-header";
import { TabsNav } from "@/components/app/tabs-nav";

export default async function EmergenciasLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePage(["emergencias.ver", "emergencias.gestionar"]);
  const gestiona = can(ctx, ["emergencias.gestionar", "porteria.ver"]);
  const activas = gestiona ? await ctx.db.alertaEmergencia.count({ where: { estado: "ACTIVA" } }) : 0;
  const tabs = [
    { href: "/emergencias", label: "Plan" },
    ...(gestiona ? [{ href: "/emergencias/alertas", label: "Alertas", count: activas || undefined }] : []),
    ...(can(ctx, ["emergencias.lista_evacuacion", "campos.persona_salud"]) ? [{ href: "/emergencias/evacuacion", label: "Evacuación asistida" }] : []),
    { href: "/emergencias/brigadistas", label: "Brigadistas" },
    { href: "/emergencias/simulacros", label: "Simulacros" },
  ];
  return (
    <>
      <PageHeader titulo="Emergencias" descripcion="Plan de emergencia y evacuación del conjunto" />
      {activas > 0 && (
        <Link href="/emergencias/alertas" role="alert" className="mb-4 flex items-center gap-3 rounded-xl bg-red-600 p-4 text-white shadow">
          <Siren className="size-6 shrink-0 animate-pulse" />
          <span className="flex-1 font-semibold">
            {activas === 1 ? "Hay 1 alerta activa" : `Hay ${activas} alertas activas`}. Toca para atender.
          </span>
        </Link>
      )}
      <TabsNav tabs={tabs} exact />
      {children}
    </>
  );
}
