import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";
import { can, seesAll } from "@/lib/permisos";
import { unidadOptions } from "@/lib/conjunto/options";
import { disponibilidad } from "@/lib/reservas/service";
import { fechaLocal, sumarDias } from "@/lib/reservas/reglas";
import { PageHeader } from "@/components/app/page-header";
import { CalendarioZona } from "./calendario";

export const metadata = { title: "Calendario de la zona" };

export default async function ZonaCalendarioPage({ params, searchParams }: { params: Promise<{ zonaId: string }>; searchParams: Promise<{ fecha?: string }> }) {
  const ctx = await requirePage(["reservas.ver", "reservas.ver_todos", "reservas.checkin"]);
  const { zonaId } = await params;
  const sp = await searchParams;
  const zona = await ctx.db.zonaComun.findUnique({ where: { id: zonaId }, select: { id: true, anticipacionMinimaHoras: true } });
  if (!zona) notFound();
  const hoy = fechaLocal(new Date());
  // Sin fecha elegida se abre el primer día que cumple la anticipación mínima.
  const primero = fechaLocal(new Date(Date.now() + zona.anticipacionMinimaHoras * 3_600_000));
  const fecha = sp.fecha && /^\d{4}-\d{2}-\d{2}$/.test(sp.fecha) && sp.fecha >= hoy ? sp.fecha : primero;
  const data = await disponibilidad(ctx, zonaId, fecha, sumarDias(fecha, 13));
  const verTodo = seesAll(ctx, "reservas");
  const unidades = verTodo ? await unidadOptions(ctx) : await unidadOptions(ctx, { soloPropias: true });
  return (
    <>
      <PageHeader titulo={data.zona.nombre} volver="/reservas" />
      <CalendarioZona inicial={data} fechaInicial={fecha} hoy={hoy} unidades={unidades} puedeReservar={can(ctx, "reservas.crear") && (unidades.length > 0)} verTodo={verTodo} />
    </>
  );
}
