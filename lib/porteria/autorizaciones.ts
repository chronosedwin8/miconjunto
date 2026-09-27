import type { TipoVisitante } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { prisma } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { appUrl } from "@/lib/email";
import { emit } from "@/lib/events";
import { audit } from "@/lib/audit";
import { can, seesAll } from "@/lib/permisos";
import { fechaHora, hora as horaFmt, fecha } from "@/lib/format";
import { label } from "@/lib/labels";
import { evaluarAutorizacion, generarCodigo, generarQrToken, textoDias, urlAccesoVisitante } from "./codigos";
import { idsAnulados, verificarListaNegra } from "./service";

/** Autorizaciones de ingreso creadas por el residente desde su teléfono (código de 6 dígitos + QR). */

export type NuevaAutorizacion = {
  unidadId: string;
  nombreVisitante: string;
  documentoVisitante?: string | null;
  tipo: TipoVisitante;
  fechaInicio: Date;
  fechaFin: Date;
  recurrente?: boolean;
  diasSemana?: number[];
  horaInicio?: string | null;
  horaFin?: string | null;
  placa?: string | null;
  usosPermitidos?: number | null;
  observaciones?: string | null;
  soporteSeguridadSocialUrl?: string | null;
  visitanteId?: string | null;
};

/** Código de 6 dígitos que no choque con otra autorización activa del conjunto. */
export async function codigoDisponible(conjuntoId: string, random: () => number = Math.random) {
  for (let i = 0; i < 20; i++) {
    const c = generarCodigo(random);
    const existe = await prisma.autorizacionIngreso.findFirst({ where: { conjuntoId, codigo: c, estado: "ACTIVA", deletedAt: null }, select: { id: true } });
    if (!existe) return c;
  }
  throw new AppError("No se pudo generar un código. Intenta de nuevo.");
}

export async function crearAutorizacion(ctx: Ctx, input: NuevaAutorizacion) {
  if (!ctx.unidadIds.includes(input.unidadId) && !seesAll(ctx, "visitantes")) throw new AppError("Solo puedes autorizar visitantes de tu unidad.", 403);
  const unidad = await ctx.db.unidad.findFirst({ where: { id: input.unidadId }, select: { id: true, codigo: true } });
  if (!unidad) notFound("La unidad");
  if (input.fechaFin <= input.fechaInicio) throw new AppError("La fecha final debe ser posterior a la inicial.", 400, { fechaFin: "Debe ser posterior al inicio" });
  if (input.fechaFin.getTime() - input.fechaInicio.getTime() > 366 * 86_400_000) throw new AppError("La vigencia máxima es de un año.");
  if (input.fechaFin < new Date()) throw new AppError("La vigencia ya terminó. Revisa las fechas.");
  const recurrente = !!input.recurrente;
  if (recurrente && !(input.diasSemana ?? []).length) throw new AppError("Elige los días de la semana en que puede ingresar.", 400, { diasSemana: "Elige al menos un día" });
  const cfg = conjuntoConfig(ctx);
  if (input.tipo === "CONTRATISTA" && cfg.porteria.exigirSeguridadSocialContratistas && !input.soporteSeguridadSocialUrl) {
    throw new AppError("Para contratistas debes adjuntar el soporte de seguridad social vigente.", 400, { soporteSeguridadSocialUrl: "Adjunta el soporte (planilla PILA)" });
  }
  const negra = await verificarListaNegra(ctx, { documento: input.documentoVisitante, nombre: input.nombreVisitante });
  if (negra) throw new AppError("Esta persona tiene una restricción de ingreso al conjunto. Comunícate con la administración.", 409);

  const a = await ctx.db.autorizacionIngreso.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      unidadId: unidad.id,
      creadaPorId: ctx.userId,
      visitanteId: input.visitanteId ?? null,
      nombreVisitante: input.nombreVisitante.trim(),
      documentoVisitante: input.documentoVisitante?.trim() || null,
      tipo: input.tipo,
      fechaInicio: input.fechaInicio,
      fechaFin: input.fechaFin,
      recurrente,
      diasSemana: recurrente ? [...new Set(input.diasSemana ?? [])].sort() : [],
      horaInicio: input.horaInicio || null,
      horaFin: input.horaFin || null,
      placa: input.placa ? input.placa.toUpperCase().replace(/[^A-Z0-9]/g, "") : null,
      codigo: await codigoDisponible(ctx.conjuntoId),
      qrToken: generarQrToken(),
      usosPermitidos: recurrente ? 0 : Math.max(1, input.usosPermitidos ?? 1),
      observaciones: input.observaciones ?? null,
      soporteSeguridadSocialUrl: input.soporteSeguridadSocialUrl ?? null,
    },
  });
  await emit({ tipo: "visitante.autorizado", conjuntoId: ctx.conjuntoId, data: { id: a.id, unidadId: a.unidadId }, actorId: ctx.userId });
  await audit(ctx, "crear_autorizacion", "AutorizacionIngreso", a.id, undefined, { nombre: a.nombreVisitante, unidad: unidad.codigo, tipo: a.tipo });
  return a;
}

async function propia(ctx: Ctx, id: string) {
  const a = await ctx.db.autorizacionIngreso.findFirst({ where: { id }, include: { unidad: { select: { id: true, codigo: true } } } });
  if (!a) notFound("La autorización");
  if (!ctx.unidadIds.includes(a.unidadId) && !seesAll(ctx, "visitantes") && !can(ctx, "porteria.ver")) notFound("La autorización");
  return a;
}

export async function revocarAutorizacion(ctx: Ctx, id: string) {
  const a = await propia(ctx, id);
  if (!ctx.unidadIds.includes(a.unidadId) && !seesAll(ctx, "visitantes")) throw new AppError("Solo la unidad puede revocar la autorización.", 403);
  if (a.estado !== "ACTIVA") throw new AppError("La autorización ya no está activa.");
  const r = await ctx.db.autorizacionIngreso.update({ where: { id }, data: { estado: "REVOCADA" } });
  await audit(ctx, "revocar_autorizacion", "AutorizacionIngreso", id, { estado: a.estado }, { estado: r.estado });
  return r;
}

/** Datos para compartir: URL pública del pase, mensaje de WhatsApp y texto de vigencia. */
export function datosCompartir(a: { qrToken: string; codigo: string; nombreVisitante: string; fechaInicio: Date; fechaFin: Date; recurrente: boolean; diasSemana: number[]; horaInicio: string | null; horaFin: string | null; usosPermitidos: number }, conjuntoNombre: string, unidadCodigo: string) {
  const url = urlAccesoVisitante(appUrl(""), a.qrToken);
  const vig = textoVigencia(a);
  const mensaje = [
    `Hola ${a.nombreVisitante.split(" ")[0]}, te autoricé el ingreso a ${conjuntoNombre} (${unidadCodigo}).`,
    `🔑 Código de ingreso: *${a.codigo}*`,
    `🗓️ ${vig}`,
    `Muestra este pase con código QR en portería: ${url}`,
  ].join("\n");
  return { url, vigencia: vig, mensaje, whatsapp: `https://wa.me/?text=${encodeURIComponent(mensaje)}` };
}

export function textoVigencia(a: { fechaInicio: Date; fechaFin: Date; recurrente: boolean; diasSemana: number[]; horaInicio: string | null; horaFin: string | null; usosPermitidos?: number }) {
  const horas = a.horaInicio || a.horaFin ? ` de ${a.horaInicio ?? "00:00"} a ${a.horaFin ?? "23:59"}` : "";
  if (a.recurrente) return `${textoDias(a.diasSemana)}${horas}, hasta el ${fecha(a.fechaFin)}`;
  const mismoDia = fecha(a.fechaInicio) === fecha(a.fechaFin);
  const usos = a.usosPermitidos && a.usosPermitidos > 1 ? ` · ${a.usosPermitidos} ingresos` : "";
  if (mismoDia) return `${fecha(a.fechaInicio)} de ${horaFmt(a.fechaInicio)} a ${horaFmt(a.fechaFin)}${horas ? ` (${horas.trim()})` : ""}${usos}`;
  return `Del ${fechaHora(a.fechaInicio)} al ${fechaHora(a.fechaFin)}${horas}${usos}`;
}

/** Autorizaciones de las unidades del residente: activas (vigentes) y pasadas. */
export async function misAutorizaciones(ctx: Ctx) {
  const ahora = new Date();
  const rows = await ctx.db.autorizacionIngreso.findMany({
    where: { unidadId: { in: ctx.unidadIds } },
    include: { unidad: { select: { codigo: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const activas = rows.filter((a) => a.estado === "ACTIVA" && a.fechaFin >= ahora);
  const pasadas = rows.filter((a) => !(a.estado === "ACTIVA" && a.fechaFin >= ahora));
  return { activas: activas.map((a) => ({ ...a, vigencia: textoVigencia(a), evaluacion: evaluarAutorizacion(a, ahora) })), pasadas: pasadas.map((a) => ({ ...a, vigencia: textoVigencia(a) })) };
}

export async function detalleAutorizacion(ctx: Ctx, id: string) {
  const a = await propia(ctx, id);
  const conjunto = await ctx.db.conjunto.findUnique({ where: { id: ctx.conjuntoId }, select: { nombre: true } });
  const ingresos = await ctx.db.registroAcceso.findMany({ where: { autorizacionId: a.id, tipo: "INGRESO" }, orderBy: { hora: "desc" }, take: 20 });
  return { autorizacion: a, compartir: datosCompartir(a, conjunto?.nombre ?? "", a.unidad.codigo), ingresos, evaluacion: evaluarAutorizacion(a) };
}

/** Historial de visitantes recibidos por las unidades del residente. */
export async function historialVisitas(ctx: Ctx, take = 50) {
  if (!ctx.unidadIds.length) return [];
  const rows = await ctx.db.registroAcceso.findMany({
    where: { unidadId: { in: ctx.unidadIds }, tipo: "INGRESO", sujeto: { not: "RESIDENTE" } },
    include: { unidad: { select: { codigo: true } } },
    orderBy: { hora: "desc" },
    take,
  });
  const ids = rows.map((r) => r.id);
  const [salidas, anulados] = await Promise.all([
    ctx.db.registroAcceso.findMany({ where: { tipo: "SALIDA", ingresoId: { in: ids } }, select: { ingresoId: true, hora: true } }),
    idsAnulados(ctx, ids),
  ]);
  const sMap = new Map(salidas.map((s) => [s.ingresoId!, s.hora]));
  return rows.filter((r) => !anulados.has(r.id)).map((r) => ({ id: r.id, nombre: r.nombre, sujeto: r.sujeto, medio: r.medio, unidad: r.unidad?.codigo ?? "", hora: r.hora, salida: sMap.get(r.id) ?? null, placa: r.placa }));
}

/** Página pública del pase: solo datos mínimos (sin datos personales del residente). */
export async function pasePublico(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const a = await prisma.autorizacionIngreso.findFirst({
    where: { qrToken: token, deletedAt: null },
    include: { unidad: { select: { codigo: true, conjunto: { select: { nombre: true, direccion: true, ciudad: true, colorPrimario: true } } } } },
  });
  if (!a) return null;
  return {
    nombreVisitante: a.nombreVisitante,
    tipo: label(a.tipo),
    codigo: a.codigo,
    unidad: a.unidad.codigo,
    conjunto: a.unidad.conjunto,
    vigencia: textoVigencia(a),
    placa: a.placa,
    estado: a.estado,
    evaluacion: evaluarAutorizacion(a),
    url: urlAccesoVisitante(appUrl(""), a.qrToken),
  };
}

/** Job: marca VENCIDAS las autorizaciones activas cuya vigencia terminó. */
export async function expirarAutorizaciones(conjuntoId: string, ahora = new Date()) {
  const r = await prisma.autorizacionIngreso.updateMany({ where: { conjuntoId, estado: "ACTIVA", fechaFin: { lt: ahora }, deletedAt: null }, data: { estado: "VENCIDA" } });
  return r.count;
}
