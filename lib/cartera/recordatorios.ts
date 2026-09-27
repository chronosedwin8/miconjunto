import type { Ctx } from "@/lib/auth/context";
import { notify, usuariosConPermiso, usuariosDeUnidad } from "@/lib/notificaciones";
import { cop, fecha, toNumber } from "@/lib/format";
import { diasCubiertos, horarioCobranzaPermitido, intentarGestion, partesBogota } from "./cobranza";
import { estadoTasaMora } from "./mora";

type RCtx = Pick<Ctx, "db" | "conjuntoId" | "conjunto" | "userId" | "nombre">;

const DIA = 86_400_000;
const ymdMas = (ymd: string, dias: number) => partesBogota(new Date(new Date(`${ymd}T12:00:00-05:00`).getTime() + dias * DIA)).ymd;

export const DIAS_ANTES_VENCER = [5, 1] as const;
export const DIAS_MORA_RECORDATORIO = [1, 15, 30] as const;

/**
 * Recordatorios diarios (08:00) respetando la Ley 2300:
 * - Por vencer: 5 y 1 día antes del vencimiento (informativos, solo en días y horas hábiles de cobranza).
 * - En mora: días 1, 15 y 30 de mora; cuentan como gestión de cobro por CORREO (máximo por semana y canal) y se registran.
 * Si el recordatorio caía en domingo/festivo, se envía el siguiente día hábil (diasCubiertos).
 */
export async function enviarRecordatorios(ctx: RCtx, hoy = new Date()) {
  const cubiertos = diasCubiertos(hoy);
  if (!cubiertos.length || !horarioCobranzaPermitido(hoy).ok) return { porVencer: 0, mora: 0, bloqueados: 0, motivo: "Fuera del horario permitido por la Ley 2300" };
  const objetivoVencer = new Map<string, number>();
  for (const d of cubiertos) for (const t of DIAS_ANTES_VENCER) objetivoVencer.set(ymdMas(d, t), t);
  const objetivoMora = new Map<string, number>();
  for (const d of cubiertos) for (const t of DIAS_MORA_RECORDATORIO) objetivoMora.set(ymdMas(d, -t), t);
  const fechas = [...objetivoVencer.keys(), ...objetivoMora.keys()].sort();
  const desde = new Date(`${fechas[0]}T00:00:00-05:00`);
  const hasta = new Date(new Date(`${fechas[fechas.length - 1]}T00:00:00-05:00`).getTime() + DIA);
  const cuotas = await ctx.db.cuota.findMany({
    where: { estado: { in: ["PENDIENTE", "PARCIAL"] }, saldo: { gt: 0 }, fechaVencimiento: { gte: desde, lt: hasta }, concepto: { tipo: { not: "INTERES_MORA" } } },
    select: { id: true, unidadId: true, saldo: true, fechaVencimiento: true, descripcion: true, unidad: { select: { codigo: true } } },
  });
  const porVencer = new Map<string, { codigo: string; cuotas: typeof cuotas; dias: number }>();
  const enMora = new Map<string, { codigo: string; cuotas: typeof cuotas; dias: number }>();
  for (const c of cuotas) {
    const ymd = partesBogota(c.fechaVencimiento).ymd;
    const tV = objetivoVencer.get(ymd);
    const tM = objetivoMora.get(ymd);
    const map = tV !== undefined ? porVencer : tM !== undefined ? enMora : null;
    if (!map) continue;
    const g = map.get(c.unidadId) ?? { codigo: c.unidad.codigo, cuotas: [], dias: (tV ?? tM)! };
    g.cuotas.push(c);
    map.set(c.unidadId, g);
  }
  let nV = 0;
  let nM = 0;
  let bloqueados = 0;
  for (const [unidadId, g] of porVencer) {
    const usuarios = await usuariosDeUnidad(ctx.conjuntoId, unidadId, { soloPropietarios: true, incluirAutorizadosCuenta: true });
    if (!usuarios.length) continue;
    const total = g.cuotas.reduce((a, c) => a + toNumber(c.saldo), 0);
    await notify({
      conjuntoId: ctx.conjuntoId,
      usuarioIds: usuarios,
      titulo: g.dias === 1 ? `Mañana vence tu cuota — ${g.codigo}` : `Tu cuota vence en ${g.dias} días — ${g.codigo}`,
      cuerpo: `${g.cuotas.map((c) => c.descripcion).join(", ")}: ${cop(total)}. Vence el ${fecha(g.cuotas[0].fechaVencimiento)}. Paga a tiempo y evita intereses de mora.`,
      enlace: "/cuenta",
      tipo: "CARTERA",
      canales: ["push", "email"],
    });
    nV++;
  }
  for (const [unidadId, g] of enMora) {
    const usuarios = await usuariosDeUnidad(ctx.conjuntoId, unidadId, { soloPropietarios: true });
    if (!usuarios.length) continue;
    const r = await intentarGestion(ctx, { unidadId, canal: "CORREO", resultado: `Recordatorio automático: ${g.dias} día(s) de mora` }, hoy);
    if (!r.ok) {
      bloqueados++;
      continue;
    }
    const total = g.cuotas.reduce((a, c) => a + toNumber(c.saldo), 0);
    await notify({
      conjuntoId: ctx.conjuntoId,
      usuarioIds: usuarios,
      titulo: `Tienes un saldo vencido — ${g.codigo}`,
      cuerpo: `${g.cuotas.map((c) => c.descripcion).join(", ")} (${cop(total)}) lleva ${g.dias} día(s) vencida. Ponte al día para evitar más intereses o solicita un acuerdo de pago.`,
      enlace: "/cuenta",
      tipo: "CARTERA",
      canales: ["push", "email"],
    });
    nM++;
  }
  return { porVencer: nV, mora: nM, bloqueados };
}

/** Alerta a la administración si la tasa de mora no se ha actualizado este mes (días 1, 5 y 10). */
export async function alertaTasaMora(ctx: RCtx, hoy = new Date()) {
  const dia = partesBogota(hoy).d;
  if (![1, 5, 10].includes(dia)) return false;
  const e = await estadoTasaMora(ctx, hoy);
  if (e.actualizadaEsteMes) return false;
  const ids = await usuariosConPermiso(ctx.conjuntoId, ["cartera.configurar"]);
  await notify({
    conjuntoId: ctx.conjuntoId,
    usuarioIds: ids,
    titulo: "Actualiza la tasa de interés de mora",
    cuerpo: "La Superintendencia Financiera certifica cada mes el interés bancario corriente. Registra la tasa de este mes para liquidar la mora dentro del máximo legal (1,5 × IBC).",
    enlace: "/cartera/tasa-mora",
    tipo: "CARTERA",
  });
  return true;
}
