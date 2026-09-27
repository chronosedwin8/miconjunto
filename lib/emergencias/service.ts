import type { RolBrigadista, TipoAlerta } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { prisma } from "@/lib/db";
import { notify, usuariosConPermiso, usuariosConRol } from "@/lib/notificaciones";
import { emit } from "@/lib/events";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { nombreCompleto, edad } from "@/lib/format";

export const TIPO_ALERTA_LABEL: Record<TipoAlerta, string> = {
  PANICO: "Botón de pánico",
  EMERGENCIA_GENERAL: "Emergencia general",
  INCENDIO: "Incendio",
  SISMO: "Sismo",
  MEDICA: "Emergencia médica",
  SEGURIDAD: "Seguridad",
};

/** Activa una alerta: notifica a administración, consejo y portería (y a todos si se configura). */
export async function activarAlerta(
  ctx: Ctx,
  input: { tipo: TipoAlerta; mensaje?: string | null; unidadId?: string | null; origen: "PORTERIA" | "RESIDENTE" | "ADMIN"; aTodos?: boolean },
) {
  const cfg = conjuntoConfig(ctx);
  const unidadId = input.unidadId ?? (input.origen === "RESIDENTE" ? ctx.unidadIds[0] ?? null : null);
  const unidad = unidadId ? await ctx.db.unidad.findFirst({ where: { id: unidadId } }) : null;
  const alcance = input.aTodos || (input.origen !== "RESIDENTE" && cfg.porteria.emergenciaATodos) ? "TODOS" : "ADMIN_CONSEJO";
  const alerta = await ctx.db.alertaEmergencia.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      tipo: input.tipo,
      origen: input.origen,
      unidadId,
      usuarioId: ctx.userId,
      mensaje: input.mensaje ?? null,
      alcance,
    },
  });
  const titulo = `🚨 ${TIPO_ALERTA_LABEL[input.tipo]}${unidad ? ` — ${unidad.codigo}` : ""}`;
  const cuerpo = input.mensaje || (input.origen === "RESIDENTE" ? `${ctx.nombre} activó una alerta desde su unidad.` : "Se activó una alerta en el conjunto.");
  const gestores = new Set([
    ...(await usuariosConRol(ctx.conjuntoId, ["ADMINISTRADOR", "CONSEJO", "PORTERIA", "ASISTENTE_ADMIN"])),
    ...(await usuariosConPermiso(ctx.conjuntoId, ["emergencias.gestionar"])),
  ]);
  await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: [...gestores], titulo, cuerpo, enlace: "/emergencias", tipo: "EMERGENCIA", canales: ["push", "email", "whatsapp"] });
  if (alcance === "TODOS") {
    const todos = await prisma.membresiaConjunto.findMany({ where: { conjuntoId: ctx.conjuntoId, estado: "ACTIVA", deletedAt: null }, select: { usuarioId: true } });
    await notify({
      conjuntoId: ctx.conjuntoId,
      usuarioIds: todos.map((t) => t.usuarioId).filter((id) => !gestores.has(id)),
      titulo,
      cuerpo: `${cuerpo} Sigue las instrucciones del plan de emergencia.`,
      enlace: "/emergencias",
      tipo: "EMERGENCIA",
      canales: ["push"],
    });
  }
  await emit({ tipo: "emergencia.activada", conjuntoId: ctx.conjuntoId, data: { id: alerta.id, tipo: input.tipo, unidad: unidad?.codigo ?? null }, actorId: ctx.userId });
  await audit(ctx, "activar_alerta", "AlertaEmergencia", alerta.id, undefined, alerta);
  return alerta;
}

export async function atenderAlerta(ctx: Ctx, id: string, falsaAlarma = false) {
  const a = await ctx.db.alertaEmergencia.update({
    where: { id },
    data: { estado: falsaAlarma ? "FALSA_ALARMA" : "ATENDIDA", atendidaEn: new Date(), atendidaPorId: ctx.userId },
  });
  await audit(ctx, "atender_alerta", "AlertaEmergencia", id, undefined, a);
  return a;
}

/** Personas que requieren asistencia para evacuar, agrupadas por torre y piso. */
export async function listaEvacuacion(ctx: Ctx) {
  const personas = await ctx.db.persona.findMany({
    where: {
      anonimizada: false,
      OR: [{ movilidadReducida: true }, { requiereAsistenciaEvacuacion: true }],
      vinculos: { some: { estado: "ACTIVO", deletedAt: null, tipo: { in: ["PROPIETARIO", "COPROPIETARIO", "ARRENDATARIO", "RESIDENTE", "FAMILIAR", "CUIDADOR"] } } },
    },
    include: { vinculos: { where: { estado: "ACTIVO", deletedAt: null }, include: { unidad: { include: { torre: true } } } } },
  });
  const unidadesFlag = await ctx.db.unidad.findMany({
    where: { OR: [{ tienePersonaMovilidadReducida: true }, { requiereAsistenciaEvacuacion: true }] },
    include: { torre: true },
  });
  const filas = personas.flatMap((p) =>
    p.vinculos.map((v) => ({
      personaId: p.id,
      nombre: nombreCompleto(p),
      edad: edad(p.fechaNacimiento),
      telefono: p.telefono,
      descripcion: p.movilidadDescripcion,
      contactoEmergencia: [p.contactoEmergenciaNombre, p.contactoEmergenciaTelefono].filter(Boolean).join(" · "),
      unidad: v.unidad.codigo,
      torre: v.unidad.torre?.nombre ?? "Casas",
      piso: v.unidad.piso ?? 0,
    })),
  );
  for (const u of unidadesFlag) {
    if (!filas.some((f) => f.unidad === u.codigo)) {
      filas.push({ personaId: "", nombre: "(Unidad marcada)", edad: null, telefono: null, descripcion: u.notasEstructura, contactoEmergencia: "", unidad: u.codigo, torre: u.torre?.nombre ?? "Casas", piso: u.piso ?? 0 });
    }
  }
  filas.sort((a, b) => a.torre.localeCompare(b.torre) || b.piso - a.piso || a.unidad.localeCompare(b.unidad));
  return filas;
}

// ─────────────────────────── Plan de emergencia (extra 9) ───────────────────────────

export type PuntoEncuentro = { nombre: string; ubicacion?: string };
export type TelefonoEmergencia = { nombre: string; numero: string };

/** Líneas nacionales de emergencia en Colombia (se muestran si el conjunto no ha definido las suyas). */
export const TELEFONOS_DEFECTO: TelefonoEmergencia[] = [
  { nombre: "Línea única de emergencias", numero: "123" },
  { nombre: "Bomberos", numero: "119" },
  { nombre: "Cruz Roja", numero: "132" },
  { nombre: "Defensa Civil", numero: "144" },
  { nombre: "Policía", numero: "112" },
];

export const INSTRUCCIONES_DEFECTO = [
  "Conserva la calma y sigue las indicaciones de los brigadistas.",
  "No uses los ascensores; evacúa por las escaleras, siempre por la derecha.",
  "Si hay humo, desplázate agachado y cubre nariz y boca con un paño húmedo.",
  "Dirígete al punto de encuentro asignado a tu torre y repórtate con el coordinador.",
  "No regreses a tu unidad hasta que la administración o los organismos de socorro lo autoricen.",
].join("\n");

function parseLista<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export async function obtenerPlan(ctx: Ctx) {
  const plan = await ctx.db.planEmergencia.findFirst();
  const puntos = parseLista<PuntoEncuentro>(plan?.puntosEncuentro);
  // El aprovisionamiento guarda { nombre, telefono }; el editor guarda { nombre, numero }.
  const telefonos = parseLista<TelefonoEmergencia & { telefono?: string }>(plan?.telefonosEmergencia)
    .map((t) => ({ nombre: t.nombre, numero: t.numero ?? t.telefono ?? "" }))
    .filter((t) => t.numero);
  return {
    existe: !!plan,
    actualizado: plan?.updatedAt ?? null,
    puntosEncuentro: puntos,
    telefonos: telefonos.length ? telefonos : TELEFONOS_DEFECTO,
    telefonosPropios: telefonos.length > 0,
    instrucciones: plan?.instrucciones || INSTRUCCIONES_DEFECTO,
  };
}

/** Convierte líneas "Nombre | detalle" en pares (formularios móviles sin tablas editables). */
export function parseLineas(texto: string | null | undefined): { a: string; b: string }[] {
  return (texto ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf("|");
      return i >= 0 ? { a: l.slice(0, i).trim(), b: l.slice(i + 1).trim() } : { a: l, b: "" };
    })
    .filter((x) => x.a);
}

export async function guardarPlan(ctx: Ctx, input: { puntosEncuentro: PuntoEncuentro[]; telefonos: TelefonoEmergencia[]; instrucciones?: string | null }) {
  const antes = await ctx.db.planEmergencia.findFirst();
  const data = { puntosEncuentro: input.puntosEncuentro, telefonosEmergencia: input.telefonos, instrucciones: input.instrucciones ?? null };
  const plan = antes ? await ctx.db.planEmergencia.update({ where: { id: antes.id }, data }) : await ctx.db.planEmergencia.create({ data: { ...data, conjuntoId: ctx.conjuntoId } });
  await audit(ctx, antes ? "editar" : "crear", "PlanEmergencia", plan.id, antes ?? undefined, plan);
  return plan;
}

// ── Brigadistas ──
export async function listarBrigadistas(ctx: Ctx) {
  return ctx.db.brigadista.findMany({ orderBy: [{ rol: "asc" }, { nombre: "asc" }] });
}

export async function guardarBrigadista(ctx: Ctx, input: { id?: string | null; personaId?: string | null; nombre?: string | null; rol: RolBrigadista; torreNombre?: string | null; telefono?: string | null }) {
  let nombre = input.nombre?.trim() || "";
  let telefono = input.telefono ?? null;
  if (input.personaId) {
    const p = await ctx.db.persona.findUnique({ where: { id: input.personaId } });
    if (!p || p.anonimizada) throw new AppError("La persona no existe.", 404);
    nombre = nombre || nombreCompleto(p);
    telefono = telefono || p.telefono;
  }
  if (!nombre) throw new AppError("Escribe el nombre o elige un residente.", 400, { nombre: "Obligatorio" });
  const data = { personaId: input.personaId ?? null, nombre, rol: input.rol, torreNombre: input.torreNombre ?? null, telefono };
  if (input.id) {
    const antes = await ctx.db.brigadista.findUnique({ where: { id: input.id } });
    if (!antes) throw new AppError("El brigadista no existe.", 404);
    const b = await ctx.db.brigadista.update({ where: { id: input.id }, data });
    await audit(ctx, "editar", "Brigadista", b.id, antes, b);
    return b;
  }
  const b = await ctx.db.brigadista.create({ data: { ...data, conjuntoId: ctx.conjuntoId } });
  await audit(ctx, "crear", "Brigadista", b.id, undefined, b);
  return b;
}

export async function eliminarBrigadista(ctx: Ctx, id: string) {
  await ctx.db.brigadista.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, "eliminar", "Brigadista", id);
  return true;
}

// ── Simulacros ──
export async function listarSimulacros(ctx: Ctx) {
  return ctx.db.simulacro.findMany({ orderBy: { fecha: "desc" } });
}

export async function guardarSimulacro(ctx: Ctx, input: { id?: string | null; fecha: Date; tipo: string; participantes: number; tiempoEvacuacionMin?: number | null; observaciones?: string | null }) {
  const { id, ...data } = input;
  if (id) {
    const antes = await ctx.db.simulacro.findUnique({ where: { id } });
    if (!antes) throw new AppError("El simulacro no existe.", 404);
    const s = await ctx.db.simulacro.update({ where: { id }, data });
    await audit(ctx, "editar", "Simulacro", id, antes, s);
    return s;
  }
  const s = await ctx.db.simulacro.create({ data: { ...data, conjuntoId: ctx.conjuntoId } });
  await audit(ctx, "crear", "Simulacro", s.id, undefined, s);
  return s;
}

export async function eliminarSimulacro(ctx: Ctx, id: string) {
  await ctx.db.simulacro.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, "eliminar", "Simulacro", id);
  return true;
}

// ── Alertas ──
export async function listarAlertas(ctx: Ctx, opts: { activas?: boolean; take?: number; skip?: number } = {}) {
  const where = opts.activas ? { estado: "ACTIVA" as const } : {};
  const [rows, total] = await Promise.all([
    ctx.db.alertaEmergencia.findMany({ where, orderBy: { createdAt: "desc" }, take: opts.take ?? 30, skip: opts.skip ?? 0 }),
    ctx.db.alertaEmergencia.count({ where }),
  ]);
  const unidadIds = [...new Set(rows.map((r) => r.unidadId).filter(Boolean))] as string[];
  const usuarioIds = [...new Set(rows.flatMap((r) => [r.usuarioId, r.atendidaPorId]).filter(Boolean))] as string[];
  const [unidades, usuarios] = await Promise.all([
    ctx.db.unidad.findMany({ where: { id: { in: unidadIds } }, select: { id: true, codigo: true, piso: true, torre: { select: { nombre: true } } } }),
    prisma.usuario.findMany({ where: { id: { in: usuarioIds } }, select: { id: true, nombre: true, telefono: true } }),
  ]);
  const um = new Map(unidades.map((u) => [u.id, u]));
  const us = new Map(usuarios.map((u) => [u.id, u]));
  return {
    total,
    rows: rows.map((r) => ({
      ...r,
      unidad: r.unidadId ? (um.get(r.unidadId) ?? null) : null,
      usuario: r.usuarioId ? (us.get(r.usuarioId) ?? null) : null,
      atendidaPor: r.atendidaPorId ? (us.get(r.atendidaPorId)?.nombre ?? null) : null,
    })),
  };
}

/** Agrupa la lista de evacuación por torre y piso (mapa de asistencia). */
export function agruparEvacuacion<T extends { torre: string; piso: number }>(filas: T[]) {
  const torres = new Map<string, Map<number, T[]>>();
  for (const f of filas) {
    const t = torres.get(f.torre) ?? new Map<number, T[]>();
    t.set(f.piso, [...(t.get(f.piso) ?? []), f]);
    torres.set(f.torre, t);
  }
  return [...torres.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "es", { numeric: true }))
    .map(([torre, pisos]) => ({
      torre,
      total: [...pisos.values()].reduce((a, l) => a + l.length, 0),
      pisos: [...pisos.entries()].sort(([a], [b]) => b - a).map(([piso, personas]) => ({ piso, personas })),
    }));
}
