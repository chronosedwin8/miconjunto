import type { Ctx } from "@/lib/auth/context";
import { can } from "@/lib/permisos";
import { saldoUnidad } from "./core";
import { resumenCartera } from "./tablero";

/** Widget de cartera para administrador / consejo / contador (Inicio). `null` si el rol no ve cartera del conjunto. */
export type CarteraAdminWidget = {
  periodo: string;
  recaudoMes: number;
  esperadoMes: number;
  pctRecaudo: number;
  carteraVencida: number;
  unidadesEnMora: number;
  pctUnidadesMora: number;
  /** Vacío si el rol no tiene `secciones.lista_morosos`. */
  topMorosos: { unidadId: string; codigo: string; vencido: number; diasMora: number }[];
  enlace: string;
};

export async function resumenAdmin(ctx: Ctx): Promise<CarteraAdminWidget | null> {
  const verTodo = can(ctx, "cartera.ver_todos");
  const verRecaudo = verTodo || can(ctx, ["secciones.recaudo_conjunto", "secciones.mora_conjunto"]);
  if (!verRecaudo) return null;
  const r = await resumenCartera(ctx, { top: 5 });
  const verMorosos = verTodo && can(ctx, "secciones.lista_morosos");
  return {
    periodo: r.periodo,
    recaudoMes: r.recaudoMes,
    esperadoMes: r.esperadoMes,
    pctRecaudo: r.pctRecaudo,
    carteraVencida: r.carteraVencida,
    unidadesEnMora: r.unidadesEnMora,
    pctUnidadesMora: r.pctUnidadesMora,
    topMorosos: verMorosos ? r.topMorosos.map((m) => ({ unidadId: m.unidadId, codigo: m.codigo, vencido: m.vencido, diasMora: m.diasMora })) : [],
    enlace: verTodo ? "/cartera" : "/estadisticas",
  };
}

/** Widget del residente/propietario: saldo por unidad propia (o autorizada) y próximos vencimientos. */
export type CarteraResidenteWidget = {
  unidades: { unidadId: string; codigo: string; saldo: number; vencido: number; saldoAFavor: number; diasMora: number }[];
  total: number;
  vencido: number;
  proximos: { cuotaId: string; unidad: string; descripcion: string; fechaVencimiento: Date; saldo: number }[];
  enlacePago: string;
};

export async function resumenResidente(ctx: Ctx): Promise<CarteraResidenteWidget | null> {
  if (!can(ctx, "cartera.ver")) return null;
  // Propietarios ven sus unidades; arrendatarios solo si el propietario autorizó ver la cuenta.
  const autorizadas = await ctx.db.vinculoUnidad.findMany({ where: { personaId: { in: ctx.personaIds }, estado: "ACTIVO", puedeVerCuenta: true }, select: { unidadId: true } });
  const ids = [...new Set([...ctx.unidadesPropias, ...autorizadas.map((a) => a.unidadId)])];
  if (!ids.length) return null;
  const unidades = await ctx.db.unidad.findMany({ where: { id: { in: ids } }, select: { id: true, codigo: true } });
  const out: CarteraResidenteWidget = { unidades: [], total: 0, vencido: 0, proximos: [], enlacePago: "/cuenta" };
  for (const u of unidades) {
    const s = await saldoUnidad(ctx, u.id);
    out.unidades.push({ unidadId: u.id, codigo: u.codigo, saldo: s.neto, vencido: Math.max(0, s.vencido - s.saldoAFavor), saldoAFavor: s.saldoAFavor, diasMora: s.diasMoraMax });
    out.total += Math.max(0, s.neto);
    out.vencido += Math.max(0, s.vencido - s.saldoAFavor);
    out.proximos.push(...s.cuotas.filter((c) => c.diasMora === 0).map((c) => ({ cuotaId: c.id, unidad: u.codigo, descripcion: c.descripcion, fechaVencimiento: c.fechaVencimiento, saldo: c.saldo })));
  }
  out.proximos.sort((a, b) => a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime());
  out.proximos = out.proximos.slice(0, 3);
  return out;
}
