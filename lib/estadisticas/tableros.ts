import type { Ctx } from "@/lib/auth/context";
import { can } from "@/lib/permisos";
import { parseLocal, startOfDayBogota, addDays } from "@/lib/format";
import {
  periodoAnterior,
  statsAsambleas,
  statsCartera,
  statsComunidad,
  statsConvivencia,
  statsMantenimiento,
  statsPersonal,
  statsPorteria,
  statsReservas,
  statsTickets,
  type Filtro,
} from "./service";

export const TABLEROS = [
  { key: "cartera", label: "Cartera", perm: "cartera.ver_todos" },
  { key: "reservas", label: "Reservas y zonas", perm: "reservas.ver_todos" },
  { key: "porteria", label: "Portería y paquetes", perm: "porteria.bitacora" },
  { key: "pqrs", label: "PQRS", perm: "tickets.ver_todos" },
  { key: "comunidad", label: "Comunidad", perm: "residentes.ver_todos" },
  { key: "mantenimiento", label: "Mantenimiento", perm: "mantenimiento.ver" },
  { key: "convivencia", label: "Convivencia", perm: "convivencia.ver_todos" },
  { key: "asambleas", label: "Asambleas", perm: "asambleas.ver" },
  { key: "personal", label: "Mi panel", perm: "estadisticas.personal" },
] as const;
export type TableroKey = (typeof TABLEROS)[number]["key"];

export function tablerosVisibles(ctx: Ctx) {
  return TABLEROS.filter((t) => (t.key === "personal" ? ctx.unidadIds.length > 0 || can(ctx, "estadisticas.personal") : can(ctx, "estadisticas.ver") && can(ctx, t.perm as never)));
}

export const PRESETS = [
  { key: "30", label: "Últimos 30 días", dias: 30 },
  { key: "90", label: "Últimos 90 días", dias: 90 },
  { key: "180", label: "Últimos 6 meses", dias: 182 },
  { key: "365", label: "Último año", dias: 365 },
];

export function filtroDesdeParams(sp: Record<string, string | undefined>): Filtro {
  const hoy = new Date();
  const hasta = sp.hasta ? new Date(parseLocal(sp.hasta).getTime() + 86399999) : hoy;
  const dias = Number(sp.rango ?? 180);
  const desde = sp.desde ? parseLocal(sp.desde) : addDays(startOfDayBogota(hoy), -(Number.isFinite(dias) ? dias : 180));
  return { desde, hasta, torreId: sp.torre || null };
}

export async function datosTablero(ctx: Ctx, tab: TableroKey, f: Filtro) {
  switch (tab) {
    case "cartera":
      return { actual: await statsCartera(ctx, f, can(ctx, "secciones.lista_morosos")), anterior: (await statsCartera(ctx, periodoAnterior(f), false)).kpis };
    case "reservas":
      return { actual: await statsReservas(ctx, f), anterior: (await statsReservas(ctx, periodoAnterior(f))).kpis };
    case "porteria":
      return { actual: await statsPorteria(ctx, f), anterior: (await statsPorteria(ctx, periodoAnterior(f))).kpis };
    case "pqrs":
      return { actual: await statsTickets(ctx, f), anterior: (await statsTickets(ctx, periodoAnterior(f))).kpis };
    case "comunidad":
      return { actual: await statsComunidad(ctx, f), anterior: null };
    case "mantenimiento":
      return { actual: await statsMantenimiento(ctx, f), anterior: (await statsMantenimiento(ctx, periodoAnterior(f))).kpis };
    case "convivencia":
      return { actual: await statsConvivencia(ctx, f), anterior: (await statsConvivencia(ctx, periodoAnterior(f))).kpis };
    case "asambleas":
      return { actual: await statsAsambleas(ctx), anterior: null };
    case "personal":
      return { actual: await statsPersonal(ctx, f), anterior: (await statsPersonal(ctx, periodoAnterior(f))).kpis };
  }
}
