import { requirePage } from "@/lib/auth/guard";
import { seesAll } from "@/lib/permisos";
import { spGet, type SP } from "@/lib/pagination";
import { unidadOptions, zonaOptions } from "@/lib/conjunto/options";
import { TIPOS_TICKET } from "@/lib/tickets/reglas";
import { PageHeader } from "@/components/app/page-header";
import { NuevoTicket } from "./nuevo-ticket";

export const metadata = { title: "Reportar o radicar" };

export default async function NuevoTicketPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("tickets.crear");
  const sp = await searchParams;
  const gestion = seesAll(ctx, "tickets");
  const tipo = TIPOS_TICKET.find((t) => t === spGet(sp, "tipo"));
  const activoId = spGet(sp, "activo");
  const [unidades, zonas, activo] = await Promise.all([
    unidadOptions(ctx, { soloPropias: !gestion }),
    zonaOptions(ctx),
    activoId ? ctx.db.activo.findUnique({ where: { id: activoId }, select: { id: true, nombre: true, zonaId: true } }) : null,
  ]);
  return (
    <>
      <PageHeader titulo="Reportar o radicar" volver="/tickets" />
      <NuevoTicket
        unidades={unidades}
        zonas={zonas}
        tipoInicial={activo ? "DANO_ZONA_COMUN" : tipo}
        zonaInicial={activo?.zonaId ?? spGet(sp, "zona")}
        activo={activo ? { id: activo.id, nombre: activo.nombre } : null}
        gestion={gestion}
      />
    </>
  );
}
