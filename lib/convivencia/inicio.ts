import type { Ctx } from "@/lib/auth/context";
import { toNumber } from "@/lib/format";

/** Widgets de convivencia para el Inicio. */

export type ResumenConvivenciaResidente = {
  llamadosSinLeer: number;
  multasEnDescargos: { id: string; valor: number; plazoDescargos: Date | null; href: string }[];
  multasPorPagar: { id: string; valor: number; cuotaId: string | null; href: string }[];
  href: string;
};

export type ResumenConvivenciaGestion = {
  llamadosSinRespuesta: number;
  multasPorNotificar: number;
  multasPorDecidir: number;
  incidentesAbiertos: number;
  href: string;
};

export async function resumenConvivenciaResidente(ctx: Ctx): Promise<ResumenConvivenciaResidente> {
  const unidades = { unidadId: { in: ctx.unidadIds } };
  const [llamadosSinLeer, descargos, porPagar] = await Promise.all([
    ctx.db.llamadoAtencion.count({ where: { ...unidades, estado: "ENVIADO" } }),
    ctx.db.multa.findMany({ where: { ...unidades, estado: "NOTIFICADA" }, select: { id: true, valor: true, plazoDescargos: true } }),
    ctx.db.multa.findMany({ where: { ...unidades, estado: "RATIFICADA" }, select: { id: true, valor: true, cuotaId: true } }),
  ]);
  return {
    llamadosSinLeer,
    multasEnDescargos: descargos.map((m) => ({ id: m.id, valor: toNumber(m.valor), plazoDescargos: m.plazoDescargos, href: `/convivencia/multas/${m.id}` })),
    multasPorPagar: porPagar.map((m) => ({ id: m.id, valor: toNumber(m.valor), cuotaId: m.cuotaId, href: `/convivencia/multas/${m.id}` })),
    href: "/convivencia",
  };
}

/** Administración y consejo: pendientes del debido proceso e incidentes abiertos. */
export async function resumenConvivenciaGestion(ctx: Ctx, ahora = new Date()): Promise<ResumenConvivenciaGestion> {
  const [llamadosSinRespuesta, multasPorNotificar, enDescargos, vencidas, incidentesAbiertos] = await Promise.all([
    ctx.db.llamadoAtencion.count({ where: { estado: { in: ["ENVIADO", "LEIDO"] } } }),
    ctx.db.multa.count({ where: { estado: "PROPUESTA" } }),
    ctx.db.multa.count({ where: { estado: "EN_DESCARGOS" } }),
    ctx.db.multa.count({ where: { estado: "NOTIFICADA", plazoDescargos: { lt: ahora } } }),
    ctx.db.incidenteConvivencia.count({ where: { estado: { in: ["ABIERTO", "EN_MEDIACION"] } } }),
  ]);
  return { llamadosSinRespuesta, multasPorNotificar, multasPorDecidir: enDescargos + vencidas, incidentesAbiertos, href: "/convivencia" };
}
