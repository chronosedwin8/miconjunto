import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { tiempoRelativo } from "@/lib/format";
import { TIPO_ALERTA_LABEL } from "@/lib/emergencias/service";
import { TabsNav } from "@/components/app/tabs-nav";
import { KioskBar } from "./_components/kiosk-bar";
import { AlertasEmergencia, PorteriaLive } from "./_components/live";

/**
 * Layout de KIOSCO de portería (tablet o teléfono): barra superior fija con buscador universal y escáner QR,
 * tema nocturno, indicador offline, alertas de emergencia en tiempo real y tipografía grande de alto contraste.
 */
export default async function PorteriaLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePage("porteria.ver");
  const alertas = await ctx.db.alertaEmergencia.findMany({ where: { estado: "ACTIVA" }, orderBy: { createdAt: "desc" }, take: 5 });
  const unidades = alertas.some((a) => a.unidadId) ? await ctx.db.unidad.findMany({ where: { id: { in: alertas.map((a) => a.unidadId!).filter(Boolean) } }, select: { id: true, codigo: true } }) : [];
  const uMap = new Map(unidades.map((u) => [u.id, u.codigo]));
  const tabs = [
    { href: "/porteria", label: "Inicio" },
    { href: "/porteria/bitacora", label: "Bitácora" },
    { href: "/porteria/paquetes", label: "Paquetes" },
    { href: "/porteria/turno", label: "Turno" },
    { href: "/porteria/novedades", label: "Novedades" },
    { href: "/porteria/parqueaderos", label: "Parqueaderos" },
    { href: "/porteria/obras", label: "Obras y mudanzas" },
    ...(can(ctx, "porteria.llaves") ? [{ href: "/porteria/llaves", label: "Llaves" }] : []),
    { href: "/porteria/lista-negra", label: "Lista negra" },
    { href: "/porteria/emergencia", label: "Emergencia" },
  ];
  return (
    <div className="porteria-kiosk text-[17px] leading-snug">
      <KioskBar />
      <PorteriaLive />
      <AlertasEmergencia
        alertas={alertas.map((a) => ({
          id: a.id,
          tipo: a.tipo,
          titulo: `🚨 ${TIPO_ALERTA_LABEL[a.tipo]}`,
          unidad: a.unidadId ? (uMap.get(a.unidadId) ?? null) : null,
          mensaje: a.mensaje,
          hace: tiempoRelativo(a.createdAt),
        }))}
      />
      <TabsNav tabs={tabs} />
      {children}
    </div>
  );
}
