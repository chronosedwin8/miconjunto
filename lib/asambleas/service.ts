import type { Asamblea, Prisma } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { AppError, notFound } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { emit, publishRealtime } from "@/lib/events";
import { notify } from "@/lib/notificaciones";
import { appUrl, queueBrandedEmail } from "@/lib/email";
import { prisma } from "@/lib/db";
import { fechaHora, fechaLarga, hora, toNumber } from "@/lib/format";
import { calcularQuorum, parseCompromisos, parseOrdenDelDia, validarAntelacion, type Compromiso, type EstadoCompromiso, type PuntoOrden, type QuorumResultado } from "@/lib/votaciones/calculos";
import { abrirVotacion, cerrarVotacion, crearVotacion, totalesConjunto, usuariosVotantes, type CrearVotacionInput } from "@/lib/votaciones/service";

/**
 * Asambleas de copropietarios (Ley 675 de 2001): convocatoria con validación de antelación, orden del
 * día con votaciones por punto, asistencia por QR o desde la app, quórum en vivo, poderes, acta con
 * firmas y publicación en documentos, y seguimiento de compromisos.
 */

type Db = Pick<Ctx, "db">;
const MODALIDAD: Record<string, string> = { PRESENCIAL: "presencial", VIRTUAL: "virtual", MIXTA: "mixta (presencial y virtual)" };

export async function obtenerAsamblea(ctx: Db, id: string) {
  const a = await ctx.db.asamblea.findUnique({ where: { id } });
  if (!a) notFound("La asamblea");
  return a;
}

export async function listarAsambleas(ctx: Ctx) {
  return ctx.db.asamblea.findMany({
    orderBy: { fecha: "desc" },
    take: 100,
    include: { _count: { select: { asistencias: { where: { deletedAt: null, salidaEn: null } }, votaciones: { where: { deletedAt: null } } } } },
  });
}

// ───────────────────────────── CREAR / EDITAR ─────────────────────────────

export type AsambleaInput = {
  id?: string | null;
  titulo: string;
  tipo: "ORDINARIA" | "EXTRAORDINARIA";
  modalidad: "PRESENCIAL" | "VIRTUAL" | "MIXTA";
  fecha: Date;
  lugar?: string | null;
  enlace?: string | null;
  quorumRequerido?: number | null;
  limitePoderes?: number | null;
  convocatoriaTexto?: string | null;
};

export async function guardarAsamblea(ctx: Ctx, input: AsambleaInput) {
  if (input.modalidad !== "PRESENCIAL" && !input.enlace) throw new AppError("Las asambleas virtuales o mixtas requieren el enlace de videoconferencia (Zoom, Meet…).", 400, { enlace: "Obligatorio" });
  if (input.modalidad !== "VIRTUAL" && !input.lugar) throw new AppError("Indica el lugar de la reunión presencial.", 400, { lugar: "Obligatorio" });
  if (input.enlace && !/^https:\/\//i.test(input.enlace)) throw new AppError("El enlace debe empezar por https://", 400, { enlace: "Enlace no válido" });
  const data = {
    titulo: input.titulo,
    tipo: input.tipo,
    modalidad: input.modalidad,
    fecha: input.fecha,
    lugar: input.lugar ?? null,
    enlace: input.enlace ?? null,
    quorumRequerido: input.quorumRequerido ?? 50.000001,
    limitePoderes: input.limitePoderes ?? 2,
    convocatoriaTexto: input.convocatoriaTexto ?? null,
  };
  if (input.id) {
    const antes = await obtenerAsamblea(ctx, input.id);
    if (antes.estado === "FINALIZADA" || antes.estado === "CANCELADA") throw new AppError("La asamblea ya no se puede editar.");
    if (antes.estado !== "BORRADOR" && antes.fecha.getTime() !== input.fecha.getTime()) {
      const v = validarAntelacion({ tipo: input.tipo, fechaAsamblea: input.fecha, fechaEnvio: antes.convocatoriaEnviadaEn ?? new Date() });
      if (v.bloquea) throw new AppError(`${v.mensaje} Para cambiar la fecha de una asamblea ya convocada, cancélala y convoca de nuevo.`);
    }
    const a = await ctx.db.asamblea.update({ where: { id: input.id }, data });
    await audit(ctx, "editar", "Asamblea", a.id, antes, a);
    return a;
  }
  const a = await ctx.db.asamblea.create({ data: { ...data, conjuntoId: ctx.conjuntoId, estado: "BORRADOR", ordenDelDia: ordenDelDiaSugerido(input.tipo) as Prisma.InputJsonValue } });
  if (!a.convocatoriaTexto) {
    await ctx.db.asamblea.update({ where: { id: a.id }, data: { convocatoriaTexto: plantillaConvocatoria(ctx.conjunto.nombre, a) } });
  }
  await audit(ctx, "crear", "Asamblea", a.id, undefined, a);
  return a;
}

/** Orden del día sugerido (Ley 675 y práctica usual). */
export function ordenDelDiaSugerido(tipo: "ORDINARIA" | "EXTRAORDINARIA"): PuntoOrden[] {
  const base = ["Verificación del quórum", "Lectura y aprobación del orden del día", "Elección de presidente y secretario de la asamblea", "Designación de la comisión verificadora del acta"];
  const ord = ["Informe de gestión de la administración y del consejo", "Presentación y aprobación de estados financieros", "Aprobación del presupuesto del año", "Elección del consejo de administración y revisor fiscal", "Proposiciones y varios"];
  const extra = ["Asunto que motiva la convocatoria", "Proposiciones y varios"];
  return [...base, ...(tipo === "ORDINARIA" ? ord : extra)].map((titulo, i) => ({ orden: i + 1, titulo, descripcion: null, votacionId: null }));
}

export function plantillaConvocatoria(conjunto: string, a: Pick<Asamblea, "tipo" | "modalidad" | "fecha" | "lugar" | "enlace" | "ordenDelDia">) {
  const puntos = parseOrdenDelDia(a.ordenDelDia);
  return [
    `CONVOCATORIA A ASAMBLEA GENERAL ${a.tipo === "ORDINARIA" ? "ORDINARIA" : "EXTRAORDINARIA"} DE COPROPIETARIOS`,
    ``,
    `La administración de ${conjunto}, en cumplimiento de la Ley 675 de 2001 y del reglamento de propiedad horizontal, convoca a todos los propietarios a la asamblea general ${a.tipo === "ORDINARIA" ? "ordinaria" : "extraordinaria"} que se realizará el ${fechaLarga(a.fecha)} a las ${hora(a.fecha)}, en modalidad ${MODALIDAD[a.modalidad]}.`,
    a.lugar ? `Lugar: ${a.lugar}.` : "",
    a.enlace ? `Enlace de conexión: ${a.enlace}. Las votaciones se realizan en la app Conjunto360.` : "",
    ``,
    `Orden del día propuesto:`,
    ...puntos.map((p) => `${p.orden}. ${p.titulo}`),
    ``,
    `Si no puede asistir, puede otorgar poder por escrito a otra persona desde la app (sección Asambleas) o entregándolo en la administración. Si no hay quórum, se convocará a una reunión de segunda convocatoria según el artículo 41 de la Ley 675 de 2001.`,
    ``,
    `Atentamente,`,
    `La administración`,
  ]
    .filter((l, i, arr) => l !== "" || arr[i - 1] !== "")
    .join("\n");
}

// ───────────────────────────── CONVOCATORIA ─────────────────────────────

export async function guardarTextoConvocatoria(ctx: Ctx, id: string, texto: string | null) {
  const a = await obtenerAsamblea(ctx, id);
  const t = texto?.trim() || plantillaConvocatoria(ctx.conjunto.nombre, a);
  const u = await ctx.db.asamblea.update({ where: { id }, data: { convocatoriaTexto: t } });
  await audit(ctx, "editar_convocatoria", "Asamblea", id, { largo: a.convocatoriaTexto?.length ?? 0 }, { largo: t.length });
  return u;
}


/** Correos y usuarios de los propietarios (personas con vínculo PROPIETARIO/COPROPIETARIO activo). */
export async function propietariosDestinatarios(conjuntoId: string) {
  const vinculos = await prisma.vinculoUnidad.findMany({
    where: { conjuntoId, estado: "ACTIVO", deletedAt: null, tipo: { in: ["PROPIETARIO", "COPROPIETARIO"] }, persona: { deletedAt: null, anonimizada: false } },
    select: { persona: { select: { email: true, nombres: true, usuarioId: true, usuario: { select: { email: true, deletedAt: true } } } } },
  });
  const usuarios = new Set<string>();
  const correos = new Map<string, string>();
  for (const v of vinculos) {
    if (v.persona.usuarioId) usuarios.add(v.persona.usuarioId);
    const email = (v.persona.usuario && !v.persona.usuario.deletedAt ? v.persona.usuario.email : null) ?? v.persona.email;
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) correos.set(email.toLowerCase(), v.persona.nombres);
  }
  return { usuarioIds: [...usuarios], correos: [...correos.entries()].map(([email, nombre]) => ({ email, nombre })) };
}

export function revisarAntelacion(a: Pick<Asamblea, "tipo" | "fecha">, fechaEnvio = new Date()) {
  return validarAntelacion({ tipo: a.tipo, fechaAsamblea: a.fecha, fechaEnvio });
}

/**
 * Envía la convocatoria: valida la antelación (bloquea ordinarias con menos de 15 días calendario),
 * cambia a CONVOCADA y notifica a todos los propietarios (notificación en la app + push + correo).
 */
export async function enviarConvocatoria(ctx: Ctx, id: string) {
  const a = await obtenerAsamblea(ctx, id);
  if (!["BORRADOR", "CONVOCADA"].includes(a.estado)) throw new AppError("La asamblea ya inició o terminó.");
  const ant = revisarAntelacion(a);
  if (ant.bloquea) throw new AppError(ant.mensaje);
  const texto = a.convocatoriaTexto?.trim() || plantillaConvocatoria(ctx.conjunto.nombre, a);
  const u = await ctx.db.asamblea.update({ where: { id }, data: { estado: "CONVOCADA", convocatoriaEnviadaEn: new Date(), convocatoriaTexto: texto } });
  const dest = await propietariosDestinatarios(ctx.conjuntoId);
  const titulo = `Convocatoria: ${a.titulo}`;
  const cuerpo = `Asamblea ${a.tipo === "ORDINARIA" ? "ordinaria" : "extraordinaria"} el ${fechaHora(a.fecha)} (${MODALIDAD[a.modalidad]}).`;
  await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: dest.usuarioIds, titulo, cuerpo, enlace: `/asambleas/${id}`, tipo: "ASAMBLEA", canales: ["push"] });
  for (const d of dest.correos) {
    await queueBrandedEmail(
      d.email,
      titulo,
      {
        conjuntoNombre: ctx.conjunto.nombre,
        color: ctx.conjunto.colorPrimario ?? undefined,
        parrafos: [`Hola, ${d.nombre}:`, ...texto.split(/\n+/).filter(Boolean)],
        boton: { texto: "Ver convocatoria y otorgar poder", url: appUrl(`/asambleas/${id}`) },
      },
      { conjuntoId: ctx.conjuntoId },
    );
  }
  await audit(ctx, a.convocatoriaEnviadaEn ? "reenviar_convocatoria" : "convocar", "Asamblea", id, { estado: a.estado }, { estado: "CONVOCADA", antelacionDias: ant.dias, destinatarios: dest.correos.length });
  await emit({ tipo: "asamblea.convocada", conjuntoId: ctx.conjuntoId, data: { id, fecha: a.fecha.toISOString() }, actorId: ctx.userId });
  return { asamblea: u, destinatarios: dest.correos.length, usuarios: dest.usuarioIds.length, advertencia: ant.ok && ant.dias < ant.minimo ? ant.mensaje : null };
}

// ───────────────────────────── ORDEN DEL DÍA ─────────────────────────────

async function guardarOrden(ctx: Ctx, a: Asamblea, puntos: PuntoOrden[]) {
  const orden = puntos.map((p, i) => ({ ...p, orden: i + 1 }));
  await ctx.db.asamblea.update({ where: { id: a.id }, data: { ordenDelDia: orden as Prisma.InputJsonValue } });
  // Mantiene el número de punto de las votaciones asociadas
  for (const p of orden) if (p.votacionId) await ctx.db.votacion.update({ where: { id: p.votacionId }, data: { puntoOrden: p.orden } }).catch(() => undefined);
  await publishRealtime({ conjuntoId: ctx.conjuntoId, canal: `asamblea:${a.id}`, tipo: "orden", data: {} });
  return orden;
}

export type PuntoInput = {
  titulo: string;
  descripcion?: string | null;
  conVotacion: boolean;
  pregunta?: string | null;
  opciones?: string[];
  tipoMayoria?: CrearVotacionInput["tipoMayoria"];
  ponderacion?: CrearVotacionInput["ponderacion"];
  quienVota?: CrearVotacionInput["quienVota"];
  secreto?: boolean;
};

export async function agregarPunto(ctx: Ctx, asambleaId: string, input: PuntoInput) {
  const a = await obtenerAsamblea(ctx, asambleaId);
  if (a.estado === "FINALIZADA" || a.estado === "CANCELADA") throw new AppError("La asamblea ya terminó.");
  const puntos = parseOrdenDelDia(a.ordenDelDia);
  let votacionId: string | null = null;
  if (input.conVotacion) {
    const v = await crearVotacion(ctx, {
      pregunta: input.pregunta?.trim() || input.titulo,
      descripcion: input.descripcion ?? null,
      opciones: input.opciones?.length ? input.opciones : ["Sí, apruebo", "No apruebo", "Me abstengo"],
      tipoMayoria: input.tipoMayoria ?? "SIMPLE",
      ponderacion: input.ponderacion ?? "COEFICIENTE",
      quienVota: input.quienVota ?? "PROPIETARIOS",
      secreto: input.secreto ?? false,
      inicio: a.fecha,
      fin: new Date(a.fecha.getTime() + 12 * 3_600_000),
      asambleaId,
      puntoOrden: puntos.length + 1,
      estado: "BORRADOR",
      notificar: false,
    });
    votacionId = v.id;
  }
  const orden = await guardarOrden(ctx, a, [...puntos, { orden: puntos.length + 1, titulo: input.titulo, descripcion: input.descripcion ?? null, votacionId }]);
  await audit(ctx, "agregar_punto", "Asamblea", asambleaId, undefined, { titulo: input.titulo, votacionId });
  return orden;
}

export async function asociarVotacionPunto(ctx: Ctx, asambleaId: string, orden: number, input: Omit<PuntoInput, "titulo" | "conVotacion">) {
  const a = await obtenerAsamblea(ctx, asambleaId);
  const puntos = parseOrdenDelDia(a.ordenDelDia);
  const p = puntos.find((x) => x.orden === orden);
  if (!p) notFound("El punto");
  if (p.votacionId) throw new AppError("Este punto ya tiene una votación.");
  const v = await crearVotacion(ctx, {
    pregunta: input.pregunta?.trim() || p.titulo,
    descripcion: input.descripcion ?? p.descripcion ?? null,
    opciones: input.opciones?.length ? input.opciones : ["Sí, apruebo", "No apruebo", "Me abstengo"],
    tipoMayoria: input.tipoMayoria ?? "SIMPLE",
    ponderacion: input.ponderacion ?? "COEFICIENTE",
    quienVota: input.quienVota ?? "PROPIETARIOS",
    secreto: input.secreto ?? false,
    inicio: a.fecha,
    fin: new Date(Math.max(a.fecha.getTime(), Date.now()) + 12 * 3_600_000),
    asambleaId,
    puntoOrden: orden,
    estado: "BORRADOR",
    notificar: false,
  });
  p.votacionId = v.id;
  await guardarOrden(ctx, a, puntos);
  return v;
}

export async function moverPunto(ctx: Ctx, asambleaId: string, orden: number, dir: "arriba" | "abajo") {
  const a = await obtenerAsamblea(ctx, asambleaId);
  const puntos = parseOrdenDelDia(a.ordenDelDia);
  const i = puntos.findIndex((p) => p.orden === orden);
  const j = dir === "arriba" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= puntos.length) return puntos;
  [puntos[i], puntos[j]] = [puntos[j], puntos[i]];
  return guardarOrden(ctx, a, puntos);
}

export async function eliminarPunto(ctx: Ctx, asambleaId: string, orden: number) {
  const a = await obtenerAsamblea(ctx, asambleaId);
  const puntos = parseOrdenDelDia(a.ordenDelDia);
  const p = puntos.find((x) => x.orden === orden);
  if (!p) notFound("El punto");
  if (p.votacionId) {
    const v = await ctx.db.votacion.findUnique({ where: { id: p.votacionId }, include: { _count: { select: { votos: true } } } });
    if (v && v._count.votos > 0) throw new AppError("El punto tiene votos registrados: no se puede eliminar.");
    if (v) await ctx.db.votacion.update({ where: { id: v.id }, data: { deletedAt: new Date() } });
  }
  await audit(ctx, "eliminar_punto", "Asamblea", asambleaId, p);
  return guardarOrden(ctx, a, puntos.filter((x) => x.orden !== orden));
}

// ───────────────────────────── CONDUCCIÓN ─────────────────────────────

async function cambiarEstado(ctx: Ctx, id: string, estado: Asamblea["estado"], extra: Prisma.AsambleaUpdateInput = {}) {
  const a = await obtenerAsamblea(ctx, id);
  const u = await ctx.db.asamblea.update({ where: { id }, data: { estado, ...extra } });
  await audit(ctx, `estado_${estado.toLowerCase()}`, "Asamblea", id, { estado: a.estado }, { estado });
  await publishRealtime({ conjuntoId: ctx.conjuntoId, canal: `asamblea:${id}`, tipo: "estado", data: { estado } });
  await emit({ tipo: `asamblea.${estado.toLowerCase()}`, conjuntoId: ctx.conjuntoId, data: { id }, actorId: ctx.userId });
  return u;
}

export async function iniciarAsamblea(ctx: Ctx, id: string) {
  const a = await obtenerAsamblea(ctx, id);
  if (a.estado !== "CONVOCADA") throw new AppError("Solo se puede iniciar una asamblea convocada.");
  return cambiarEstado(ctx, id, "EN_CURSO", { iniciadaEn: new Date() });
}

export async function finalizarAsamblea(ctx: Ctx, id: string) {
  const a = await obtenerAsamblea(ctx, id);
  if (a.estado !== "EN_CURSO") throw new AppError("La asamblea no está en curso.");
  const abiertas = await ctx.db.votacion.findMany({ where: { asambleaId: id, estado: "ABIERTA" }, select: { id: true } });
  for (const v of abiertas) await cerrarVotacion(ctx, v.id);
  const u = await cambiarEstado(ctx, id, "FINALIZADA", { finalizadaEn: new Date() });
  if (!u.actaTexto) await ctx.db.asamblea.update({ where: { id }, data: { actaTexto: await generarTextoActa(ctx, id) } });
  return u;
}

export async function cancelarAsamblea(ctx: Ctx, id: string, motivo: string) {
  const a = await obtenerAsamblea(ctx, id);
  if (a.estado === "FINALIZADA") throw new AppError("La asamblea ya finalizó.");
  const u = await cambiarEstado(ctx, id, "CANCELADA");
  if (a.estado === "CONVOCADA") {
    const dest = await propietariosDestinatarios(ctx.conjuntoId);
    await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: dest.usuarioIds, titulo: `Asamblea cancelada: ${a.titulo}`, cuerpo: motivo, enlace: `/asambleas/${id}`, tipo: "ASAMBLEA", canales: ["push", "email"] });
  }
  await audit(ctx, "cancelar", "Asamblea", id, undefined, { motivo });
  return u;
}

export async function abrirVotacionPunto(ctx: Ctx, votacionId: string, minutos: number) {
  return abrirVotacion(ctx, votacionId, minutos);
}

export async function cerrarVotacionPunto(ctx: Ctx, votacionId: string) {
  return cerrarVotacion(ctx, votacionId);
}

// ───────────────────────────── ASISTENCIA Y QUÓRUM ─────────────────────────────

export type QuorumAsamblea = QuorumResultado & {
  totalCoeficientes: number;
  totalUnidades: number;
  presenciales: number;
  virtuales: number;
  porPoder: number;
  coefPoder: number;
};

export async function quorumAsamblea(ctx: Db, a: Pick<Asamblea, "id" | "quorumRequerido">): Promise<QuorumAsamblea> {
  const [asist, totales] = await Promise.all([
    ctx.db.asistenciaAsamblea.findMany({ where: { asambleaId: a.id, salidaEn: null }, select: { unidadId: true, coeficiente: true, tipo: true } }),
    totalesConjunto(ctx),
  ]);
  const q = calcularQuorum({
    presentes: asist.map((x) => ({ unidadId: x.unidadId, coeficiente: toNumber(x.coeficiente) })),
    totalCoeficientes: totales.totalCoeficientes,
    totalUnidades: totales.totalUnidades,
    requerido: toNumber(a.quorumRequerido),
  });
  return {
    ...q,
    ...totales,
    presenciales: asist.filter((x) => x.tipo === "PRESENCIAL").length,
    virtuales: asist.filter((x) => x.tipo === "VIRTUAL").length,
    porPoder: asist.filter((x) => x.tipo === "PODER").length,
    coefPoder: Math.round(asist.filter((x) => x.tipo === "PODER").reduce((s, x) => s + toNumber(x.coeficiente), 0) * 1e6) / 1e6,
  };
}

async function publicarQuorum(ctx: Ctx, a: Asamblea) {
  const q = await quorumAsamblea(ctx, a);
  await publishRealtime({ conjuntoId: ctx.conjuntoId, canal: `asamblea:${a.id}`, tipo: "asistencia", data: { porcentaje: q.porcentaje, unidades: q.unidadesPresentes, hayQuorum: q.hayQuorum } });
  return q;
}

/** ¿Se puede registrar asistencia ahora? (en curso, o convocada desde 2 horas antes). */
export function ventanaAsistencia(a: Pick<Asamblea, "estado" | "fecha">, ahora = new Date()): { ok: boolean; motivo: string | null } {
  if (a.estado === "EN_CURSO") return { ok: true, motivo: null };
  if (a.estado === "CONVOCADA" && ahora.getTime() >= a.fecha.getTime() - 2 * 3_600_000) return { ok: true, motivo: null };
  return {
    ok: false,
    motivo: a.estado === "CONVOCADA" ? `El registro de asistencia se habilita 2 horas antes de la asamblea (${fechaHora(a.fecha)}).` : "La asamblea no está abierta para registrar asistencia.",
  };
}

function puedeRegistrarAsistencia(a: Asamblea, ahora = new Date()) {
  const v = ventanaAsistencia(a, ahora);
  if (!v.ok) throw new AppError(v.motivo!);
}

/** Unidades que el usuario representa en la asamblea: propias (sin poder otorgado) + poderes aprobados a su favor. */
export async function misUnidadesAsamblea(ctx: Ctx, asambleaId: string) {
  const poderes = await ctx.db.poderAsamblea.findMany({ where: { asambleaId, estado: "APROBADO" } });
  const delegadas = new Set(poderes.filter((p) => p.apoderadoUsuarioId !== ctx.userId).map((p) => p.unidadId));
  const representadas = poderes.filter((p) => p.apoderadoUsuarioId === ctx.userId);
  const propias = ctx.unidadesPropias.filter((u) => !delegadas.has(u));
  const ids = [...new Set([...propias, ...representadas.map((p) => p.unidadId)])];
  const [unidades, asist] = await Promise.all([
    ctx.db.unidad.findMany({ where: { id: { in: ids } }, select: { id: true, codigo: true, coeficiente: true }, orderBy: { codigo: "asc" } }),
    ctx.db.asistenciaAsamblea.findMany({ where: { asambleaId, unidadId: { in: ids } } }),
  ]);
  return unidades.map((u) => {
    const poder = representadas.find((p) => p.unidadId === u.id);
    const as = asist.find((x) => x.unidadId === u.id);
    return {
      unidadId: u.id,
      codigo: u.codigo,
      coeficiente: toNumber(u.coeficiente),
      poderId: poder?.id ?? null,
      otorgante: poder?.otorganteNombre ?? null,
      registrada: !!as && !as.salidaEn,
      tipo: as?.tipo ?? null,
      delegadaA: null as string | null,
    };
  });
}

/**
 * Registro de asistencia del propio usuario (QR o app): registra todas sus unidades y las representadas
 * por poder. PRESENCIAL exige el código de asistencia (el QR proyectado en la sala); VIRTUAL solo en
 * asambleas virtuales o mixtas.
 */
export async function registrarAsistenciaPropia(ctx: Ctx, asambleaId: string, input: { tipo: "PRESENCIAL" | "VIRTUAL"; codigo?: string | null }) {
  const a = await obtenerAsamblea(ctx, asambleaId);
  puedeRegistrarAsistencia(a);
  if (input.tipo === "PRESENCIAL" && input.codigo !== a.codigoAsistencia) throw new AppError("El código de asistencia no es válido. Escanea el QR que se muestra en la sala.");
  if (input.tipo === "VIRTUAL" && a.modalidad === "PRESENCIAL") throw new AppError("Esta asamblea es presencial: escanea el QR en la sala.");
  const mias = await misUnidadesAsamblea(ctx, asambleaId);
  if (!mias.length) throw new AppError("No tienes unidades para representar en esta asamblea. Si te otorgaron un poder, debe estar aprobado por la administración.", 403);
  let n = 0;
  for (const u of mias) {
    if (u.registrada) continue;
    await ctx.db.asistenciaAsamblea.upsert({
      where: { asambleaId_unidadId: { asambleaId, unidadId: u.unidadId } },
      create: {
        conjuntoId: ctx.conjuntoId,
        asambleaId,
        unidadId: u.unidadId,
        usuarioId: ctx.userId,
        personaNombre: ctx.nombre,
        tipo: u.poderId ? "PODER" : input.tipo,
        coeficiente: u.coeficiente,
        poderId: u.poderId,
      },
      update: { salidaEn: null, registradaEn: new Date(), usuarioId: ctx.userId, personaNombre: ctx.nombre, tipo: u.poderId ? "PODER" : input.tipo, poderId: u.poderId },
    });
    n++;
  }
  await audit(ctx, "registrar_asistencia", "Asamblea", asambleaId, undefined, { tipo: input.tipo, unidades: mias.map((m) => m.codigo) });
  const q = await publicarQuorum(ctx, a);
  return { registradas: n, unidades: mias.map((m) => m.codigo), quorum: q.porcentaje };
}

/** Registro manual por la administración (buscando la unidad). */
export async function registrarAsistenciaManual(ctx: Ctx, input: { asambleaId: string; unidadId: string; tipo: "PRESENCIAL" | "VIRTUAL" | "PODER"; personaNombre?: string | null }) {
  const a = await obtenerAsamblea(ctx, input.asambleaId);
  puedeRegistrarAsistencia(a);
  const unidad = await ctx.db.unidad.findUnique({ where: { id: input.unidadId } });
  if (!unidad) notFound("La unidad");
  let poderId: string | null = null;
  let nombre = input.personaNombre ?? null;
  const poder = await ctx.db.poderAsamblea.findFirst({ where: { asambleaId: a.id, unidadId: unidad.id, estado: "APROBADO" } });
  if (input.tipo === "PODER") {
    if (!poder) throw new AppError(`La unidad ${unidad.codigo} no tiene un poder aprobado para esta asamblea.`);
    poderId = poder.id;
    nombre = nombre ?? poder.apoderadoNombre;
  }
  if (!nombre) {
    const v = await ctx.db.vinculoUnidad.findFirst({ where: { unidadId: unidad.id, estado: "ACTIVO", tipo: { in: ["PROPIETARIO", "COPROPIETARIO"] } }, include: { persona: true }, orderBy: { principal: "desc" } });
    nombre = v ? `${v.persona.nombres} ${v.persona.apellidos}` : null;
  }
  await ctx.db.asistenciaAsamblea.upsert({
    where: { asambleaId_unidadId: { asambleaId: a.id, unidadId: unidad.id } },
    create: { conjuntoId: ctx.conjuntoId, asambleaId: a.id, unidadId: unidad.id, tipo: input.tipo, personaNombre: nombre, coeficiente: unidad.coeficiente, poderId },
    update: { tipo: input.tipo, personaNombre: nombre, poderId, salidaEn: null, registradaEn: new Date() },
  });
  await audit(ctx, "registrar_asistencia_manual", "Asamblea", a.id, undefined, { unidad: unidad.codigo, tipo: input.tipo, nombre });
  return publicarQuorum(ctx, a);
}

/** Registra la salida de una unidad (deja de contar para el quórum y para las votaciones siguientes). */
export async function registrarSalida(ctx: Ctx, asambleaId: string, unidadId: string) {
  const a = await obtenerAsamblea(ctx, asambleaId);
  const as = await ctx.db.asistenciaAsamblea.findFirst({ where: { asambleaId, unidadId } });
  if (!as) notFound("La asistencia");
  await ctx.db.asistenciaAsamblea.update({ where: { id: as.id }, data: { salidaEn: new Date() } });
  await audit(ctx, "registrar_salida", "Asamblea", asambleaId, undefined, { unidadId });
  return publicarQuorum(ctx, a);
}

export async function listarAsistencia(ctx: Db, asambleaId: string) {
  return ctx.db.asistenciaAsamblea.findMany({ where: { asambleaId }, include: { unidad: { select: { codigo: true } } }, orderBy: { registradaEn: "desc" } });
}

// ───────────────────────────── PODERES ─────────────────────────────

export type PoderInput = { asambleaId: string; unidadId: string; apoderadoNombre: string; apoderadoDocumento?: string | null; apoderadoEmail?: string | null; documentoUrl?: string | null };

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

async function resolverApoderado(ctx: Ctx, input: Pick<PoderInput, "apoderadoDocumento" | "apoderadoEmail">) {
  if (input.apoderadoEmail) {
    const m = await ctx.db.membresiaConjunto.findFirst({ where: { estado: "ACTIVA", usuario: { email: input.apoderadoEmail.toLowerCase(), deletedAt: null } }, select: { usuarioId: true } });
    if (m) return m.usuarioId;
  }
  if (input.apoderadoDocumento) {
    const p = await ctx.db.persona.findFirst({ where: { numeroDocumento: input.apoderadoDocumento.replace(/\D/g, ""), usuarioId: { not: null } }, select: { usuarioId: true } });
    if (p?.usuarioId) return p.usuarioId;
  }
  return null;
}

/** Poderes vigentes (no rechazados) del mismo apoderado en la asamblea. */
async function poderesDelApoderado(ctx: Ctx, asambleaId: string, ap: { usuarioId: string | null; documento?: string | null; nombre: string }, estados: ("PENDIENTE" | "APROBADO")[]) {
  const todos = await ctx.db.poderAsamblea.findMany({ where: { asambleaId, estado: { in: estados } } });
  return todos.filter(
    (p) =>
      (ap.usuarioId && p.apoderadoUsuarioId === ap.usuarioId) ||
      (ap.documento && p.apoderadoDocumento && p.apoderadoDocumento.replace(/\D/g, "") === ap.documento.replace(/\D/g, "")) ||
      normalizar(p.apoderadoNombre) === normalizar(ap.nombre),
  );
}

/**
 * El propietario (o la administración) registra un poder con documento adjunto. Valida el límite de
 * poderes por apoderado de la asamblea. Queda PENDIENTE hasta que la administración lo apruebe.
 */
export async function registrarPoder(ctx: Ctx, input: PoderInput, opts: { esAdmin: boolean }) {
  const a = await obtenerAsamblea(ctx, input.asambleaId);
  if (!["BORRADOR", "CONVOCADA", "EN_CURSO"].includes(a.estado)) throw new AppError("La asamblea ya no recibe poderes.");
  if (!opts.esAdmin && !ctx.unidadesPropias.includes(input.unidadId)) throw new AppError("Solo el propietario de la unidad puede otorgar el poder.", 403);
  const unidad = await ctx.db.unidad.findUnique({ where: { id: input.unidadId } });
  if (!unidad) notFound("La unidad");
  if (!opts.esAdmin && !input.documentoUrl) throw new AppError("Adjunta el poder firmado (foto o PDF).", 400, { documentoUrl: "Obligatorio" });
  const existente = await ctx.db.poderAsamblea.findFirst({ where: { asambleaId: a.id, unidadId: unidad.id } });
  if (existente && existente.estado !== "RECHAZADO") throw new AppError(`La unidad ${unidad.codigo} ya tiene un poder ${existente.estado === "APROBADO" ? "aprobado" : "en revisión"} para esta asamblea.`);
  const apoderadoUsuarioId = await resolverApoderado(ctx, input);
  if (apoderadoUsuarioId && apoderadoUsuarioId === ctx.userId && !opts.esAdmin) throw new AppError("No puedes otorgarte un poder a ti mismo.");
  const vigentes = await poderesDelApoderado(ctx, a.id, { usuarioId: apoderadoUsuarioId, documento: input.apoderadoDocumento, nombre: input.apoderadoNombre }, ["PENDIENTE", "APROBADO"]);
  if (vigentes.length >= a.limitePoderes) throw new AppError(`${input.apoderadoNombre} ya alcanzó el límite de ${a.limitePoderes} poder(es) para esta asamblea.`);
  let otorgante = ctx.nombre;
  if (opts.esAdmin || !ctx.unidadesPropias.includes(unidad.id)) {
    const v = await ctx.db.vinculoUnidad.findFirst({ where: { unidadId: unidad.id, estado: "ACTIVO", tipo: { in: ["PROPIETARIO", "COPROPIETARIO"] } }, include: { persona: true }, orderBy: { principal: "desc" } });
    otorgante = v ? `${v.persona.nombres} ${v.persona.apellidos}` : `Propietario de ${unidad.codigo}`;
  }
  const data = {
    otorganteNombre: otorgante,
    apoderadoNombre: input.apoderadoNombre,
    apoderadoDocumento: input.apoderadoDocumento ?? null,
    apoderadoUsuarioId,
    documentoUrl: input.documentoUrl ?? null,
    estado: "PENDIENTE" as const,
  };
  const p = existente
    ? await ctx.db.poderAsamblea.update({ where: { id: existente.id }, data })
    : await ctx.db.poderAsamblea.create({ data: { ...data, conjuntoId: ctx.conjuntoId, asambleaId: a.id, unidadId: unidad.id } });
  await audit(ctx, "registrar_poder", "PoderAsamblea", p.id, undefined, { unidad: unidad.codigo, apoderado: p.apoderadoNombre, documento: p.apoderadoDocumento });
  return p;
}

export async function decidirPoder(ctx: Ctx, poderId: string, estado: "APROBADO" | "RECHAZADO") {
  const p = await ctx.db.poderAsamblea.findUnique({ where: { id: poderId }, include: { asamblea: true } });
  if (!p) notFound("El poder");
  if (estado === "APROBADO") {
    const aprobados = await poderesDelApoderado(ctx, p.asambleaId, { usuarioId: p.apoderadoUsuarioId, documento: p.apoderadoDocumento, nombre: p.apoderadoNombre }, ["APROBADO"]);
    if (aprobados.filter((x) => x.id !== p.id).length >= p.asamblea.limitePoderes) throw new AppError(`El apoderado ya tiene ${p.asamblea.limitePoderes} poder(es) aprobados (límite de la asamblea).`);
  }
  const u = await ctx.db.poderAsamblea.update({ where: { id: poderId }, data: { estado } });
  // Si se rechaza un poder ya usado para asistir, la unidad deja de estar representada.
  if (estado === "RECHAZADO") await ctx.db.asistenciaAsamblea.updateMany({ where: { asambleaId: p.asambleaId, poderId: p.id, salidaEn: null }, data: { salidaEn: new Date() } });
  await audit(ctx, estado === "APROBADO" ? "aprobar_poder" : "rechazar_poder", "PoderAsamblea", poderId, { estado: p.estado }, { estado });
  const avisar = [p.apoderadoUsuarioId].filter((x): x is string => !!x);
  if (avisar.length && estado === "APROBADO") {
    await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: avisar, titulo: "Poder aprobado", cuerpo: `Representarás a ${p.otorganteNombre} en «${p.asamblea.titulo}».`, enlace: `/asambleas/${p.asambleaId}`, tipo: "ASAMBLEA", canales: ["push"] });
  }
  await publishRealtime({ conjuntoId: ctx.conjuntoId, canal: `asamblea:${p.asambleaId}`, tipo: "poder", data: { estado } });
  return u;
}

export async function listarPoderes(ctx: Db, asambleaId: string) {
  const poderes = await ctx.db.poderAsamblea.findMany({ where: { asambleaId }, orderBy: [{ estado: "asc" }, { createdAt: "desc" }] });
  const unidades = await ctx.db.unidad.findMany({ where: { id: { in: poderes.map((p) => p.unidadId) } }, select: { id: true, codigo: true, coeficiente: true } });
  return poderes.map((p) => ({ ...p, unidad: unidades.find((u) => u.id === p.unidadId) ?? null }));
}

// ───────────────────────────── ACTA ─────────────────────────────

/** Texto del acta con la plantilla y los resultados de las votaciones insertados automáticamente. */
export async function generarTextoActa(ctx: Ctx, asambleaId: string) {
  const a = await obtenerAsamblea(ctx, asambleaId);
  const [q, votaciones, poderes] = await Promise.all([
    quorumAsamblea(ctx, a),
    ctx.db.votacion.findMany({ where: { asambleaId, estado: { in: ["CERRADA", "ABIERTA"] } }, orderBy: { puntoOrden: "asc" } }),
    ctx.db.poderAsamblea.count({ where: { asambleaId, estado: "APROBADO" } }),
  ]);
  const puntos = parseOrdenDelDia(a.ordenDelDia);
  const compromisos = parseCompromisos(a.compromisos);
  const lineas: string[] = [
    `# ACTA DE ASAMBLEA GENERAL ${a.tipo} DE COPROPIETARIOS`,
    `${ctx.conjunto.nombre}`,
    ``,
    `En la ciudad de ${ctx.conjunto.ciudad ?? "—"}, el ${fechaLarga(a.fecha)} a las ${hora(a.iniciadaEn ?? a.fecha)}, se reunió en modalidad ${MODALIDAD[a.modalidad]}${a.lugar ? ` en ${a.lugar}` : ""} la asamblea general ${a.tipo === "ORDINARIA" ? "ordinaria" : "extraordinaria"} de copropietarios, previa convocatoria enviada el ${a.convocatoriaEnviadaEn ? fechaHora(a.convocatoriaEnviadaEn) : "—"} conforme al artículo 39 de la Ley 675 de 2001.`,
    ``,
    `## Verificación del quórum`,
    `Se registraron ${q.unidadesPresentes} de ${q.totalUnidades} unidades (${q.presenciales} presenciales, ${q.virtuales} virtuales y ${q.porPoder} representadas por ${poderes} poder(es) aprobados), que suman ${q.porcentaje.toLocaleString("es-CO", { maximumFractionDigits: 4 })} % de los coeficientes de copropiedad. ${q.hayQuorum ? "Hay quórum deliberatorio y decisorio (más de la mitad de los coeficientes, art. 45 Ley 675)." : "No se alcanzó el quórum requerido."}`,
    ``,
    `## Orden del día`,
    ...puntos.map((p) => `${p.orden}. ${p.titulo}`),
    ``,
    `## Desarrollo`,
  ];
  for (const p of puntos) {
    lineas.push(``, `### ${p.orden}. ${p.titulo}`);
    if (p.descripcion) lineas.push(p.descripcion);
    const v = votaciones.find((x) => x.id === p.votacionId);
    if (v?.resultado) {
      const r = v.resultado as { opciones: { texto: string; votos: number; pctCoeficiente: number; pctParticipacion: number }[]; decision: string; participacionCoeficiente: number; totalVotos: number };
      lineas.push(`Se sometió a votación: «${v.pregunta}» (${v.tipoMayoria === "CALIFICADA_70" ? "mayoría calificada del 70 %" : v.tipoMayoria === "UNANIME" ? "unanimidad" : "mayoría simple"}, ${v.ponderacion === "COEFICIENTE" ? "por coeficiente" : "por unidad"}, voto ${v.secreto ? "secreto" : "nominal"}). Votaron ${r.totalVotos} unidades (${r.participacionCoeficiente.toLocaleString("es-CO")} % de coeficientes).`);
      for (const o of r.opciones) lineas.push(`- ${o.texto}: ${o.votos} voto(s), ${o.pctCoeficiente.toLocaleString("es-CO")} % del coeficiente total (${o.pctParticipacion.toLocaleString("es-CO")} % de lo emitido)`);
      lineas.push(`${r.decision}. Código de verificación: ${v.codigoActa ?? "—"}.`);
    } else {
      lineas.push(`[Escriba aquí lo tratado en este punto]`);
    }
  }
  if (compromisos.length) {
    lineas.push(``, `## Compromisos`);
    for (const c of compromisos) lineas.push(`- ${c.tarea} — responsable: ${c.responsable}${c.fecha ? `, fecha: ${c.fecha}` : ""}`);
  }
  lineas.push(
    ``,
    `## Cierre`,
    `Agotado el orden del día, se levantó la sesión a las ${a.finalizadaEn ? hora(a.finalizadaEn) : "—"}. En constancia firman el presidente y el secretario de la asamblea.`,
  );
  return lineas.join("\n");
}

export async function guardarActa(ctx: Ctx, input: { asambleaId: string; actaTexto: string; presidenteNombre?: string | null; secretarioNombre?: string | null }) {
  const a = await obtenerAsamblea(ctx, input.asambleaId);
  const cambiaTexto = a.actaTexto !== input.actaTexto;
  const u = await ctx.db.asamblea.update({
    where: { id: a.id },
    data: {
      actaTexto: input.actaTexto,
      presidenteNombre: input.presidenteNombre ?? a.presidenteNombre,
      secretarioNombre: input.secretarioNombre ?? a.secretarioNombre,
      // Si el texto cambia, las firmas anteriores ya no corresponden a lo firmado.
      ...(cambiaTexto && (a.firmaPresidente || a.firmaSecretario) ? { firmaPresidente: null, firmaSecretario: null } : {}),
    },
  });
  await audit(ctx, "editar_acta", "Asamblea", a.id, { presidente: a.presidenteNombre, secretario: a.secretarioNombre, largo: a.actaTexto?.length ?? 0 }, { presidente: u.presidenteNombre, secretario: u.secretarioNombre, largo: u.actaTexto?.length ?? 0, firmasReiniciadas: cambiaTexto && !!(a.firmaPresidente || a.firmaSecretario) });
  return u;
}

export async function firmarActa(ctx: Ctx, input: { asambleaId: string; rol: "PRESIDENTE" | "SECRETARIO"; nombre: string; firma: string }) {
  const a = await obtenerAsamblea(ctx, input.asambleaId);
  if (!a.actaTexto) throw new AppError("Redacta el acta antes de firmarla.");
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(input.firma) || input.firma.length > 400_000) throw new AppError("La firma no es válida. Vuelve a firmar.");
  const data = input.rol === "PRESIDENTE" ? { firmaPresidente: input.firma, presidenteNombre: input.nombre } : { firmaSecretario: input.firma, secretarioNombre: input.nombre };
  const u = await ctx.db.asamblea.update({ where: { id: a.id }, data });
  await audit(ctx, "firmar_acta", "Asamblea", a.id, undefined, { rol: input.rol, nombre: input.nombre });
  return u;
}

export async function guardarCompromisos(ctx: Ctx, asambleaId: string, compromisos: Compromiso[]) {
  const a = await obtenerAsamblea(ctx, asambleaId);
  const u = await ctx.db.asamblea.update({ where: { id: asambleaId }, data: { compromisos: compromisos as unknown as Prisma.InputJsonValue } });
  await audit(ctx, "compromisos", "Asamblea", asambleaId, a.compromisos, compromisos);
  return u;
}

export async function agregarCompromiso(ctx: Ctx, asambleaId: string, c: Omit<Compromiso, "id" | "estado">) {
  const a = await obtenerAsamblea(ctx, asambleaId);
  const lista = parseCompromisos(a.compromisos);
  const id = `c${Date.now().toString(36)}`;
  return guardarCompromisos(ctx, asambleaId, [...lista, { ...c, id, estado: "PENDIENTE" }]);
}

export async function cambiarEstadoCompromiso(ctx: Ctx, asambleaId: string, compromisoId: string, estado: EstadoCompromiso | "ELIMINAR") {
  const a = await obtenerAsamblea(ctx, asambleaId);
  const lista = parseCompromisos(a.compromisos);
  const next = estado === "ELIMINAR" ? lista.filter((c) => c.id !== compromisoId) : lista.map((c) => (c.id === compromisoId ? { ...c, estado } : c));
  return guardarCompromisos(ctx, asambleaId, next);
}

// ───────────────────────────── CUOTAS EXTRAORDINARIAS ─────────────────────────────

export async function cuotasExtraordinarias(ctx: Db, asambleaId: string) {
  return ctx.db.cuotaExtraordinaria.findMany({ where: { asambleaId }, orderBy: { createdAt: "desc" } });
}

export async function cuotasSinAsamblea(ctx: Db) {
  return ctx.db.cuotaExtraordinaria.findMany({ where: { asambleaId: null }, orderBy: { createdAt: "desc" }, take: 50 });
}

/** Enlaza una cuota extraordinaria (creada en /cartera/extraordinarias) con la asamblea que la aprobó. */
export async function vincularCuotaExtraordinaria(ctx: Ctx, asambleaId: string, cuotaExtraordinariaId: string) {
  await obtenerAsamblea(ctx, asambleaId);
  const c = await ctx.db.cuotaExtraordinaria.findUnique({ where: { id: cuotaExtraordinariaId } });
  if (!c) notFound("La cuota extraordinaria");
  await ctx.db.cuotaExtraordinaria.update({ where: { id: c.id }, data: { asambleaId } });
  await audit(ctx, "vincular_asamblea", "CuotaExtraordinaria", c.id, { asambleaId: c.asambleaId }, { asambleaId });
  return true;
}

// ───────────────────────────── RECORDATORIOS (job) ─────────────────────────────

async function yaRecordado(tipo: string, enlace: string) {
  return !!(await prisma.notificacion.findFirst({ where: { tipo, enlace }, select: { id: true } }));
}

/**
 * Recordatorios de asambleas (1 día y 1 hora antes) y de votaciones por cerrar (menos de 24 h, a quien
 * aún no ha votado). Se deduplican por tipo + enlace en `Notificacion`.
 */
export async function enviarRecordatorios(ahora = new Date()) {
  let enviados = 0;
  const proximas = await prisma.asamblea.findMany({
    where: { deletedAt: null, estado: "CONVOCADA", fecha: { gt: ahora, lte: new Date(ahora.getTime() + 24 * 3_600_000) } },
  });
  for (const a of proximas) {
    const enlace = `/asambleas/${a.id}`;
    const falta = a.fecha.getTime() - ahora.getTime();
    const tipo = falta <= 3_600_000 ? "ASAMBLEA_1H" : "ASAMBLEA_1D";
    if (await yaRecordado(tipo, enlace)) continue;
    const dest = await propietariosDestinatarios(a.conjuntoId);
    await notify({
      conjuntoId: a.conjuntoId,
      usuarioIds: dest.usuarioIds,
      titulo: tipo === "ASAMBLEA_1H" ? `La asamblea empieza en menos de una hora` : `Mañana: ${a.titulo}`,
      cuerpo: `${a.titulo} — ${fechaHora(a.fecha)}${a.enlace ? ". Conéctate y vota desde la app." : a.lugar ? `. Lugar: ${a.lugar}.` : ""}`,
      enlace,
      tipo,
      canales: tipo === "ASAMBLEA_1D" ? ["push", "email"] : ["push"],
    });
    enviados++;
  }

  const porCerrar = await prisma.votacion.findMany({
    where: { deletedAt: null, estado: "ABIERTA", asambleaId: null, fin: { gt: ahora, lte: new Date(ahora.getTime() + 24 * 3_600_000) } },
    include: { votos: { where: { deletedAt: null }, select: { unidadId: true } } },
  });
  for (const v of porCerrar) {
    const enlace = `/votaciones/${v.id}`;
    if (await yaRecordado("VOTACION_POR_CERRAR", enlace)) continue;
    const votaron = v.votos.map((x) => x.unidadId);
    const ids = await usuariosVotantes({ conjuntoId: v.conjuntoId }, v.quienVota, votaron);
    await notify({ conjuntoId: v.conjuntoId, usuarioIds: ids, titulo: "Votación por cerrar", cuerpo: `Aún no has votado: ${v.pregunta}. Cierra el ${fechaHora(v.fin)}.`, enlace, tipo: "VOTACION_POR_CERRAR", canales: ["push"] });
    enviados++;
  }
  return enviados;
}
