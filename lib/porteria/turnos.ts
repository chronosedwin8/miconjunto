import type { Severidad, TipoElemento, TipoNovedad, TipoTicket, PrioridadTicket } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { AppError, notFound } from "@/lib/errors";
import { emit } from "@/lib/events";
import { audit } from "@/lib/audit";
import { nextConsecutivo } from "@/lib/consecutivo";
import { notify, usuariosConPermiso, usuariosConRol } from "@/lib/notificaciones";
import { label } from "@/lib/labels";
import { nowBogota, startOfDayBogota, addDays } from "@/lib/format";
import { idsAnulados, registrarIngreso } from "./service";
import { sumarDiasHabiles } from "./reglas";

/** Turnos de portería (apertura/cierre con checklist y firma), novedades, llaves y elementos, obras y mudanzas de hoy. */

export type ItemChecklist = { elemento: string; ok: boolean; nota?: string | null };

export async function turnoAbierto(ctx: Ctx, porteroId = ctx.userId) {
  return ctx.db.turnoPorteria.findFirst({ where: { porteroId, estado: "ABIERTO" }, orderBy: { apertura: "desc" } });
}

/** Turno abierto de cualquier portero (para mostrar quién está de turno). */
export async function turnosAbiertos(ctx: Ctx) {
  return ctx.db.turnoPorteria.findMany({ where: { estado: "ABIERTO" }, include: { portero: { select: { nombre: true } } }, orderBy: { apertura: "desc" } });
}

const FIRMA_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

function validarFirma(firma: string | null | undefined, requerida: boolean) {
  if (!firma) {
    if (requerida) throw new AppError("Firma en la pantalla para continuar.", 400, { firma: "La firma es obligatoria" });
    return null;
  }
  if (!FIRMA_RE.test(firma) || firma.length > 400_000) throw new AppError("La firma no es válida. Vuelve a firmar.", 400, { firma: "Firma no válida" });
  return firma;
}

export async function abrirTurno(ctx: Ctx, input: { checklist: ItemChecklist[]; novedades?: string | null; firma: string }) {
  if (await turnoAbierto(ctx)) throw new AppError("Ya tienes un turno abierto. Ciérralo antes de abrir otro.");
  const t = await ctx.db.turnoPorteria.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      porteroId: ctx.userId,
      checklistApertura: input.checklist,
      novedadesApertura: input.novedades ?? null,
      firmaApertura: validarFirma(input.firma, true),
    },
  });
  const faltantes = input.checklist.filter((i) => !i.ok);
  await emit({ tipo: "porteria.turno_abierto", conjuntoId: ctx.conjuntoId, data: { id: t.id }, actorId: ctx.userId });
  await audit(ctx, "abrir_turno", "TurnoPorteria", t.id, undefined, { checklist: input.checklist, novedades: input.novedades });
  return { turno: t, faltantes: faltantes.length };
}

export async function cerrarTurno(ctx: Ctx, input: { checklist: ItemChecklist[]; novedades?: string | null; firma: string }) {
  const t = await turnoAbierto(ctx);
  if (!t) throw new AppError("No tienes un turno abierto.");
  const c = await ctx.db.turnoPorteria.update({
    where: { id: t.id },
    data: { estado: "CERRADO", cierre: new Date(), checklistCierre: input.checklist, novedadesCierre: input.novedades ?? null, firmaCierre: validarFirma(input.firma, true) },
  });
  const faltantes = input.checklist.filter((i) => !i.ok);
  if (faltantes.length) {
    const admins = await usuariosConRol(ctx.conjuntoId, ["ADMINISTRADOR"]);
    await notify({
      conjuntoId: ctx.conjuntoId,
      usuarioIds: admins,
      titulo: "Cierre de turno con elementos faltantes",
      cuerpo: `${ctx.nombre} cerró el turno sin: ${faltantes.map((f) => f.elemento).join(", ")}.`,
      enlace: `/porteria/turno?id=${t.id}`,
      tipo: "PORTERIA",
    });
  }
  await emit({ tipo: "porteria.turno_cerrado", conjuntoId: ctx.conjuntoId, data: { id: t.id }, actorId: ctx.userId });
  await audit(ctx, "cerrar_turno", "TurnoPorteria", t.id, undefined, { checklist: input.checklist, novedades: input.novedades });
  return c;
}

/** Minuta del turno: registros de bitácora, novedades y paquetes entre la apertura y el cierre. */
export async function minutaTurno(ctx: Ctx, turnoId: string) {
  const t = await ctx.db.turnoPorteria.findFirst({ where: { id: turnoId }, include: { portero: { select: { nombre: true } } } });
  if (!t) notFound("El turno");
  const hasta = t.cierre ?? new Date();
  const [registros, novedades, recibidos, entregados] = await Promise.all([
    ctx.db.registroAcceso.findMany({ where: { hora: { gte: t.apertura, lte: hasta } }, include: { unidad: { select: { codigo: true } } }, orderBy: { hora: "asc" }, take: 1000 }),
    ctx.db.novedad.findMany({ where: { OR: [{ turnoId: t.id }, { createdAt: { gte: t.apertura, lte: hasta } }] }, orderBy: { createdAt: "asc" } }),
    ctx.db.paquete.count({ where: { llegadaEn: { gte: t.apertura, lte: hasta } } }),
    ctx.db.paquete.count({ where: { entregadoEn: { gte: t.apertura, lte: hasta } } }),
  ]);
  const anulados = await idsAnulados(ctx, registros.map((r) => r.id));
  return {
    turno: t,
    registros: registros.map((r) => ({ ...r, anulado: anulados.has(r.id) })),
    novedades,
    resumen: {
      ingresos: registros.filter((r) => r.tipo === "INGRESO" && !anulados.has(r.id)).length,
      salidas: registros.filter((r) => r.tipo === "SALIDA" && !anulados.has(r.id)).length,
      anulaciones: registros.filter((r) => r.tipo === "ANULACION").length,
      novedades: novedades.length,
      paquetesRecibidos: recibidos,
      paquetesEntregados: entregados,
    },
  };
}

export async function turnosRecientes(ctx: Ctx, take = 15) {
  return ctx.db.turnoPorteria.findMany({ include: { portero: { select: { nombre: true } } }, orderBy: { apertura: "desc" }, take });
}

// ───────────────────────── novedades ─────────────────────────

const TICKET_TIPO: Record<TipoNovedad, TipoTicket> = {
  RUIDO: "RUIDO",
  DANO: "DANO_ZONA_COMUN",
  EMERGENCIA: "SEGURIDAD",
  INCIDENTE: "OTRO",
  SEGURIDAD: "SEGURIDAD",
  SERVICIOS: "DANO_ZONA_COMUN",
  OTRO: "OTRO",
};
const PRIORIDAD: Record<Severidad, PrioridadTicket> = { BAJA: "BAJA", MEDIA: "MEDIA", ALTA: "ALTA", CRITICA: "URGENTE" };

export type NovedadInput = {
  tipo: TipoNovedad;
  severidad: Severidad;
  descripcion: string;
  fotos?: string[];
  unidadId?: string | null;
  crearTicket?: boolean;
  clienteId?: string | null;
};

/** Crea un ticket (PQRS/daño) desde una novedad de portería. Radicado AAAA-0001. */
export async function ticketDesdeNovedad(ctx: Ctx, n: { id: string; tipo: TipoNovedad; severidad: Severidad; descripcion: string; fotos: string[]; unidadId: string | null }) {
  const ahora = new Date();
  const anio = nowBogota(ahora).year;
  const seq = await nextConsecutivo(ctx.conjuntoId, "RADICADO", anio);
  const t = await ctx.db.ticket.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      radicado: `${anio}-${String(seq).padStart(4, "0")}`,
      tipo: TICKET_TIPO[n.tipo],
      unidadId: n.unidadId,
      solicitanteId: ctx.userId.startsWith("api:") || ctx.userId === "sistema" ? null : ctx.userId,
      solicitanteNombre: `Portería · ${ctx.nombre}`,
      titulo: `Novedad de portería: ${label(n.tipo)}`.slice(0, 120),
      descripcion: n.descripcion,
      adjuntos: n.fotos,
      prioridad: PRIORIDAD[n.severidad],
      origen: "NOVEDAD",
      fechaLimite: sumarDiasHabiles(ahora, 15),
    },
  });
  await emit({ tipo: "ticket.creado", conjuntoId: ctx.conjuntoId, data: { id: t.id, radicado: t.radicado, origen: "NOVEDAD" }, actorId: ctx.userId });
  return t;
}

export async function crearNovedad(ctx: Ctx, input: NovedadInput) {
  if (input.clienteId) {
    const prev = await ctx.db.novedad.findFirst({ where: { clienteId: input.clienteId } });
    if (prev) return prev;
  }
  const turno = await turnoAbierto(ctx);
  let n = await ctx.db.novedad.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      turnoId: turno?.id ?? null,
      tipo: input.tipo,
      severidad: input.severidad,
      descripcion: input.descripcion,
      fotos: input.fotos ?? [],
      unidadId: input.unidadId ?? null,
      reportadoPorId: ctx.userId.startsWith("api:") ? null : ctx.userId,
      clienteId: input.clienteId ?? null,
    },
  });
  if (input.severidad === "ALTA" || input.severidad === "CRITICA") {
    const admins = new Set([...(await usuariosConRol(ctx.conjuntoId, ["ADMINISTRADOR"])), ...(await usuariosConPermiso(ctx.conjuntoId, ["emergencias.gestionar"]))]);
    await notify({
      conjuntoId: ctx.conjuntoId,
      usuarioIds: [...admins],
      titulo: `${input.severidad === "CRITICA" ? "🚨" : "⚠️"} Novedad ${label(input.severidad).toLowerCase()} en portería: ${label(input.tipo)}`,
      cuerpo: input.descripcion.slice(0, 240),
      enlace: "/porteria/novedades",
      tipo: "NOVEDAD",
      canales: input.severidad === "CRITICA" ? ["push", "email", "whatsapp"] : ["push", "email"],
    });
    n = await ctx.db.novedad.update({ where: { id: n.id }, data: { notificada: true } });
  }
  if (input.crearTicket) {
    const t = await ticketDesdeNovedad(ctx, n);
    n = await ctx.db.novedad.update({ where: { id: n.id }, data: { ticketId: t.id } });
  }
  await emit({ tipo: "porteria.novedad", conjuntoId: ctx.conjuntoId, data: { id: n.id, severidad: n.severidad }, actorId: ctx.userId });
  await audit(ctx, "crear_novedad", "Novedad", n.id, undefined, { tipo: n.tipo, severidad: n.severidad });
  return n;
}

export async function crearTicketDeNovedad(ctx: Ctx, novedadId: string) {
  const n = await ctx.db.novedad.findFirst({ where: { id: novedadId } });
  if (!n) notFound("La novedad");
  if (n.ticketId) throw new AppError("Esta novedad ya tiene un ticket.");
  const t = await ticketDesdeNovedad(ctx, n);
  await ctx.db.novedad.update({ where: { id: n.id }, data: { ticketId: t.id } });
  return t;
}

// ───────────────────────── llaves y elementos ─────────────────────────

export async function guardarElemento(ctx: Ctx, input: { id?: string | null; nombre: string; tipo: TipoElemento; codigo?: string | null; ubicacion?: string | null; notas?: string | null; estado?: "DISPONIBLE" | "PRESTADO" | "PERDIDO" | null }) {
  const data = { nombre: input.nombre, tipo: input.tipo, codigo: input.codigo ?? null, ubicacion: input.ubicacion ?? null, notas: input.notas ?? null };
  if (input.id) {
    const antes = await ctx.db.llaveElemento.findFirst({ where: { id: input.id } });
    if (!antes) notFound("El elemento");
    const e = await ctx.db.llaveElemento.update({ where: { id: input.id }, data: { ...data, ...(input.estado ? { estado: input.estado } : {}) } });
    await audit(ctx, "editar_elemento", "LlaveElemento", e.id, antes, e);
    return e;
  }
  return ctx.db.llaveElemento.create({ data: { conjuntoId: ctx.conjuntoId, ...data } });
}

export async function prestarElemento(ctx: Ctx, input: { elementoId: string; prestadoA: string; unidadId?: string | null; observaciones?: string | null }) {
  const e = await ctx.db.llaveElemento.findFirst({ where: { id: input.elementoId } });
  if (!e) notFound("El elemento");
  if (e.estado !== "DISPONIBLE") throw new AppError(`${e.nombre} no está disponible (${label(e.estado).toLowerCase()}).`);
  const r = await ctx.db.llaveElemento.updateMany({ where: { id: e.id, estado: "DISPONIBLE" }, data: { estado: "PRESTADO" } });
  if (r.count !== 1) throw new AppError("El elemento acaba de ser prestado.");
  const p = await ctx.db.prestamoElemento.create({
    data: { conjuntoId: ctx.conjuntoId, elementoId: e.id, prestadoA: input.prestadoA, unidadId: input.unidadId ?? null, porteroId: ctx.userId, observaciones: input.observaciones ?? null },
  });
  await audit(ctx, "prestar_elemento", "PrestamoElemento", p.id, undefined, { elemento: e.nombre, prestadoA: input.prestadoA });
  return p;
}

export async function devolverElemento(ctx: Ctx, input: { prestamoId: string; observaciones?: string | null; perdido?: boolean }) {
  const p = await ctx.db.prestamoElemento.findFirst({ where: { id: input.prestamoId } });
  if (!p) notFound("El préstamo");
  if (p.devueltoEn) throw new AppError("Ese elemento ya fue devuelto.");
  await ctx.db.prestamoElemento.update({ where: { id: p.id }, data: { devueltoEn: new Date(), observaciones: [p.observaciones, input.observaciones].filter(Boolean).join(" · ") || null } });
  await ctx.db.llaveElemento.update({ where: { id: p.elementoId }, data: { estado: input.perdido ? "PERDIDO" : "DISPONIBLE" } });
  await audit(ctx, "devolver_elemento", "PrestamoElemento", p.id, undefined, { perdido: !!input.perdido });
  return true;
}

export async function inventarioElementos(ctx: Ctx) {
  const elementos = await ctx.db.llaveElemento.findMany({
    include: { prestamos: { where: { devueltoEn: null, deletedAt: null }, orderBy: { prestadoEn: "desc" }, take: 1 } },
    orderBy: [{ tipo: "asc" }, { nombre: "asc" }],
  });
  const historial = await ctx.db.prestamoElemento.findMany({ include: { elemento: { select: { nombre: true } } }, orderBy: { prestadoEn: "desc" }, take: 30 });
  return { elementos, historial };
}

// ───────────────────────── obras y mudanzas de hoy (solo lectura) ─────────────────────────

/** Ingreso de un contratista autorizado en una obra aprobada (verifica seguridad social vigente si se exige). */
export async function ingresoContratista(ctx: Ctx, input: { obraId: string; indice: number; clienteId?: string | null }) {
  const { obras, exigirSeguridadSocial } = await obrasYMudanzasHoy(ctx);
  const obra = obras.find((o) => o.id === input.obraId);
  if (!obra) throw new AppError("La obra no está aprobada para hoy.");
  const c = obra.contratistas[input.indice];
  if (!c) notFound("El contratista");
  if (exigirSeguridadSocial && !c.vigente) throw new AppError(`${c.nombre} no tiene seguridad social vigente: no puede ingresar.`);
  return registrarIngreso(ctx, {
    clienteId: input.clienteId,
    sujeto: "PROVEEDOR",
    tipoVisitante: "CONTRATISTA",
    nombre: c.nombre,
    documento: c.documento ?? null,
    unidadId: obra.unidadId,
    medio: "MANUAL",
    observaciones: `Contratista de obra aprobada (${obra.tipo.toLowerCase()}): ${obra.descripcion.slice(0, 120)}`,
  });
}

export type Contratista = { nombre: string; documento?: string; seguridadSocialUrl?: string; vence?: string };

export async function obrasYMudanzasHoy(ctx: Ctx, ahora = new Date()) {
  const inicio = startOfDayBogota(ahora);
  const fin = addDays(inicio, 1);
  const [obras, mudanzas] = await Promise.all([
    ctx.db.solicitudObra.findMany({
      where: { estado: { in: ["APROBADA", "EN_CURSO"] }, fechaInicio: { lt: fin }, fechaFin: { gte: inicio } },
      include: { unidad: { select: { id: true, codigo: true } } },
      orderBy: { fechaInicio: "asc" },
    }),
    ctx.db.mudanza.findMany({
      where: { estado: { in: ["APROBADA", "EN_CURSO"] }, fecha: { gte: inicio, lt: fin } },
      include: { unidad: { select: { id: true, codigo: true } } },
      orderBy: { horaInicio: "asc" },
    }),
  ]);
  const cfg = conjuntoConfig(ctx);
  return {
    exigirSeguridadSocial: cfg.porteria.exigirSeguridadSocialContratistas,
    obras: obras.map((o) => ({
      ...o,
      contratistas: (Array.isArray(o.contratistas) ? (o.contratistas as Contratista[]) : []).map((c) => {
        const vence = c.vence ? new Date(c.vence) : null;
        const vigente = !!c.seguridadSocialUrl && (!vence || vence >= inicio);
        return { ...c, vigente };
      }),
    })),
    mudanzas: mudanzas.map((m) => ({ ...m, enseres: Array.isArray(m.enseres) ? (m.enseres as unknown[]).map((e) => (typeof e === "string" ? e : ((e as { nombre?: string; descripcion?: string }).nombre ?? (e as { descripcion?: string }).descripcion ?? JSON.stringify(e)))) : [] })),
  };
}
