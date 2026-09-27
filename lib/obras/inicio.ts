import type { Ctx } from "@/lib/auth/context";
import { startOfDayBogota } from "@/lib/format";
import { autorizadasDelDia, whereMudanzas, whereObras } from "./service";

/** Widgets de obras y mudanzas para el Inicio. */

export type ResumenObrasResidente = { obrasActivas: number; mudanzasProximas: { id: string; fecha: Date; tipo: string; estado: string; href: string }[]; href: string };
export type ResumenObrasGestion = { obrasPorAprobar: number; mudanzasPorAprobar: number; obrasHoy: number; mudanzasHoy: number; href: string };

export async function resumenObrasResidente(ctx: Ctx): Promise<ResumenObrasResidente> {
  const hoy = startOfDayBogota();
  const [obrasActivas, mudanzas] = await Promise.all([
    ctx.db.solicitudObra.count({ where: { AND: [whereObras(ctx), { estado: { in: ["SOLICITADA", "APROBADA", "EN_CURSO"] } }] } }),
    ctx.db.mudanza.findMany({ where: { AND: [whereMudanzas(ctx), { fecha: { gte: hoy }, estado: { in: ["SOLICITADA", "APROBADA"] } }] }, orderBy: { fecha: "asc" }, take: 3 }),
  ]);
  return { obrasActivas, mudanzasProximas: mudanzas.map((m) => ({ id: m.id, fecha: m.fecha, tipo: m.tipo, estado: m.estado, href: `/obras/mudanzas/${m.id}` })), href: "/obras" };
}

export async function resumenObrasGestion(ctx: Ctx): Promise<ResumenObrasGestion> {
  const [obrasPorAprobar, mudanzasPorAprobar, hoy] = await Promise.all([
    ctx.db.solicitudObra.count({ where: { estado: "SOLICITADA" } }),
    ctx.db.mudanza.count({ where: { estado: "SOLICITADA" } }),
    autorizadasDelDia(ctx),
  ]);
  return { obrasPorAprobar, mudanzasPorAprobar, obrasHoy: hoy.obras.length, mudanzasHoy: hoy.mudanzas.length, href: "/obras" };
}
