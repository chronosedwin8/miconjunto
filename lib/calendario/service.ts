import type { TipoEvento } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";
import type { Ctx } from "@/lib/auth/context";
import { can } from "@/lib/permisos";
import { AppError, notFound } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/events";
import { notify } from "@/lib/notificaciones";
import { addDays, parseLocal, TZ } from "@/lib/format";
import { resolverUsuarios } from "@/lib/segmentos";

/**
 * Calendario del conjunto: eventos propios + reservas aprobadas ("Zona X reservada", sin datos del
 * residente salvo que la reserva sea de su unidad) + bloqueos de zonas.
 */
export const TIPOS_EVENTO = ["COMUNITARIO", "ASAMBLEA", "MANTENIMIENTO", "FUMIGACION", "CORTE_SERVICIO", "OTRO"] as const;
export type Vista = "mes" | "semana" | "agenda";

export type ItemCalendario = {
  id: string;
  origen: "EVENTO" | "RESERVA" | "BLOQUEO";
  tipo: string;
  titulo: string;
  descripcion: string | null;
  lugar: string | null;
  inicio: Date;
  fin: Date;
  todoElDia: boolean;
  propia?: boolean;
  editable: boolean;
};

/** Día (yyyy-MM-dd) en Bogotá. */
export const diaKey = (d: Date) => formatInTimeZone(d, TZ, "yyyy-MM-dd");

/** Rango visible según la vista. `fecha` es yyyy-MM-dd (Bogotá). Semanas de lunes a domingo. */
export function rangoVista(vista: Vista, fecha: string): { desde: Date; hasta: Date; dias: string[] } {
  const base = parseLocal(fecha);
  const dow = Number(formatInTimeZone(base, TZ, "i")); // 1 = lunes … 7 = domingo
  if (vista === "semana") {
    const desde = addDays(base, -(dow - 1));
    const dias = Array.from({ length: 7 }, (_, i) => diaKey(addDays(desde, i)));
    return { desde, hasta: addDays(desde, 7), dias };
  }
  if (vista === "agenda") {
    const dias = Array.from({ length: 30 }, (_, i) => diaKey(addDays(base, i)));
    return { desde: base, hasta: addDays(base, 30), dias };
  }
  const [y, m] = fecha.split("-").map(Number);
  const primero = parseLocal(`${y}-${String(m).padStart(2, "0")}-01`);
  const dowPrimero = Number(formatInTimeZone(primero, TZ, "i"));
  const desde = addDays(primero, -(dowPrimero - 1));
  const siguienteMes = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const finMes = parseLocal(siguienteMes);
  const dowFin = Number(formatInTimeZone(addDays(finMes, -1), TZ, "i"));
  const hasta = addDays(finMes, 7 - dowFin);
  const n = Math.round((hasta.getTime() - desde.getTime()) / 86_400_000);
  const dias = Array.from({ length: n }, (_, i) => diaKey(addDays(desde, i)));
  return { desde, hasta, dias };
}

export function puedeGestionarCalendario(ctx: Pick<Ctx, "esSuperAdmin" | "permisos" | "unidadIds" | "userId" | "rolBase">) {
  return can(ctx, ["calendario.crear", "calendario.editar"]);
}

export async function itemsCalendario(ctx: Ctx, desde: Date, hasta: Date, opts?: { tipos?: string[] }): Promise<ItemCalendario[]> {
  const gestor = puedeGestionarCalendario(ctx);
  const solape = { inicio: { lt: hasta }, fin: { gt: desde } };
  const incluir = (o: string) => !opts?.tipos?.length || opts.tipos.includes(o);
  const [eventos, reservas, bloqueos] = await Promise.all([
    incluir("EVENTO") ? ctx.db.eventoCalendario.findMany({ where: { ...solape, ...(gestor ? {} : { visibleResidentes: true }) }, orderBy: { inicio: "asc" } }) : [],
    incluir("RESERVA")
      ? ctx.db.reserva.findMany({ where: { ...solape, estado: { in: ["APROBADA", "CUMPLIDA"] } }, select: { id: true, inicio: true, fin: true, unidadId: true, zona: { select: { nombre: true } } }, orderBy: { inicio: "asc" } })
      : [],
    incluir("BLOQUEO") ? ctx.db.bloqueoZona.findMany({ where: solape, include: { zona: { select: { nombre: true } } }, orderBy: { inicio: "asc" } }) : [],
  ]);
  const zonas = new Map((await ctx.db.zonaComun.findMany({ where: { id: { in: eventos.map((e) => e.zonaId).filter((x): x is string => !!x) } }, select: { id: true, nombre: true } })).map((z) => [z.id, z.nombre]));
  const items: ItemCalendario[] = [
    ...eventos.map((e) => ({
      id: e.id,
      origen: "EVENTO" as const,
      tipo: e.tipo,
      titulo: e.titulo,
      descripcion: e.descripcion,
      lugar: e.lugar ?? (e.zonaId ? zonas.get(e.zonaId) ?? null : null),
      inicio: e.inicio,
      fin: e.fin,
      todoElDia: e.todoElDia,
      editable: gestor,
    })),
    ...reservas.map((r) => {
      const propia = ctx.unidadIds.includes(r.unidadId);
      return {
        id: r.id,
        origen: "RESERVA" as const,
        tipo: "RESERVA",
        titulo: propia ? `Tu reserva: ${r.zona.nombre}` : `${r.zona.nombre} reservada`,
        descripcion: null,
        lugar: r.zona.nombre,
        inicio: r.inicio,
        fin: r.fin,
        todoElDia: false,
        propia,
        editable: false,
      };
    }),
    ...bloqueos.map((b) => ({
      id: b.id,
      origen: "BLOQUEO" as const,
      tipo: "BLOQUEO",
      titulo: `${b.zona.nombre} no disponible`,
      descripcion: b.motivo,
      lugar: b.zona.nombre,
      inicio: b.inicio,
      fin: b.fin,
      todoElDia: b.fin.getTime() - b.inicio.getTime() >= 20 * 3_600_000,
      editable: false,
    })),
  ];
  return items.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
}

/** Agrupa por día (Bogotá). Los eventos de varios días aparecen en cada día que cubren. */
export function agruparPorDia(items: ItemCalendario[], dias: string[]) {
  const map = new Map<string, ItemCalendario[]>(dias.map((d) => [d, []]));
  for (const it of items) {
    const ini = diaKey(it.inicio);
    const fin = diaKey(new Date(it.fin.getTime() - 1));
    for (const d of dias) if (d >= ini && d <= fin) map.get(d)!.push(it);
  }
  return map;
}

export type EventoInput = {
  id?: string | null;
  titulo: string;
  descripcion?: string | null;
  tipo: TipoEvento;
  inicio: Date;
  fin: Date;
  todoElDia?: boolean;
  lugar?: string | null;
  zonaId?: string | null;
  visibleResidentes?: boolean;
  notificar?: boolean;
  bloquearZona?: boolean;
};

export async function guardarEvento(ctx: Ctx, input: EventoInput) {
  let inicio = input.inicio;
  let fin = input.fin;
  if (input.todoElDia) {
    inicio = parseLocal(diaKey(inicio));
    fin = addDays(parseLocal(diaKey(fin)), 1);
  }
  if (fin <= inicio) throw new AppError("La hora de fin debe ser posterior al inicio.", 400, { fin: "Revisa la fecha de fin" });
  if (input.zonaId) {
    const z = await ctx.db.zonaComun.findUnique({ where: { id: input.zonaId } });
    if (!z) notFound("La zona");
  }
  const data = {
    titulo: input.titulo.trim(),
    descripcion: input.descripcion ?? null,
    tipo: input.tipo,
    inicio,
    fin,
    todoElDia: !!input.todoElDia,
    lugar: input.lugar ?? null,
    zonaId: input.zonaId ?? null,
    visibleResidentes: input.visibleResidentes ?? true,
  };
  let e;
  if (input.id) {
    const antes = await ctx.db.eventoCalendario.findUnique({ where: { id: input.id } });
    if (!antes) notFound("El evento");
    e = await ctx.db.eventoCalendario.update({ where: { id: input.id }, data });
    await audit(ctx, "editar", "EventoCalendario", e.id, antes, e);
  } else {
    e = await ctx.db.eventoCalendario.create({ data: { ...data, conjuntoId: ctx.conjuntoId, creadoPorId: ctx.userId } });
    await audit(ctx, "crear", "EventoCalendario", e.id, undefined, e);
    await emit({ tipo: "evento.creado", conjuntoId: ctx.conjuntoId, data: { id: e.id, tipo: e.tipo }, actorId: ctx.userId });
  }
  // Un evento en una zona común puede bloquearla para reservas (mantenimientos, fumigaciones…).
  if (input.bloquearZona && e.zonaId && !input.id) {
    await ctx.db.bloqueoZona.create({ data: { conjuntoId: ctx.conjuntoId, zonaId: e.zonaId, inicio: e.inicio, fin: e.fin, motivo: e.titulo, tipo: e.tipo === "MANTENIMIENTO" || e.tipo === "FUMIGACION" ? "MANTENIMIENTO" : "EVENTO" } });
  }
  if (input.notificar && e.visibleResidentes) await notificarEvento(ctx, e.id, input.id ? "cambio" : "nuevo");
  return e;
}

export async function notificarEvento(ctx: Ctx, id: string, motivo: "nuevo" | "cambio" | "recordatorio") {
  const e = await ctx.db.eventoCalendario.findUnique({ where: { id } });
  if (!e) return 0;
  const usuarios = (await resolverUsuarios(ctx, {})).filter((u) => u !== ctx.userId);
  const cuando = e.todoElDia ? formatInTimeZone(e.inicio, TZ, "dd/MM/yyyy") : formatInTimeZone(e.inicio, TZ, "dd/MM/yyyy h:mm a").replace("AM", "a. m.").replace("PM", "p. m.");
  const pref = motivo === "nuevo" ? "Nuevo evento" : motivo === "cambio" ? "Cambio en evento" : "Recordatorio";
  await notify({
    conjuntoId: ctx.conjuntoId,
    usuarioIds: usuarios,
    titulo: `${pref}: ${e.titulo}`,
    cuerpo: `${cuando}${e.lugar ? ` · ${e.lugar}` : ""}`,
    enlace: `/calendario?fecha=${diaKey(e.inicio)}&vista=agenda`,
    tipo: "CALENDARIO",
    canales: e.tipo === "CORTE_SERVICIO" ? ["push", "whatsapp"] : ["push"],
  });
  return usuarios.length;
}

export async function eliminarEvento(ctx: Ctx, id: string) {
  const e = await ctx.db.eventoCalendario.findUnique({ where: { id } });
  if (!e) notFound("El evento");
  await ctx.db.eventoCalendario.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, "eliminar", "EventoCalendario", id, e);
  return true;
}

/** Eventos visibles que empiezan mañana (Bogotá), para recordatorios diarios. */
export async function eventosDeManana(ctx: Pick<Ctx, "db">, hoy = new Date()) {
  const manana = parseLocal(diaKey(addDays(hoy, 1)));
  return ctx.db.eventoCalendario.findMany({ where: { visibleResidentes: true, inicio: { gte: manana, lt: addDays(manana, 1) } } });
}

export async function proximosEventos(ctx: Ctx, limite = 5) {
  const ahora = new Date();
  return itemsCalendario(ctx, ahora, addDays(ahora, 30), { tipos: ["EVENTO"] }).then((i) => i.filter((x) => x.fin > ahora).slice(0, limite));
}
