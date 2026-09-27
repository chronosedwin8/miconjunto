import type { Prisma, TipoPaquete } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { AppError, notFound } from "@/lib/errors";
import { emit } from "@/lib/events";
import { audit } from "@/lib/audit";
import { notify, usuariosDeUnidad } from "@/lib/notificaciones";
import { can, seesAll } from "@/lib/permisos";
import { label } from "@/lib/labels";
import { edad, nombreCompleto, startOfDayBogota } from "@/lib/format";
import { diasEnPorteria, EDAD_MINIMA_RECOGER, TIPOS_RECOGEN_PAQUETES } from "@/lib/porteria/reglas";

/**
 * Paquetería: recepción con fotos, notificación inmediata a la unidad (push + correo + WhatsApp),
 * entrega SOLO a personas autorizadas de la unidad con firma o foto, devoluciones y alertas.
 */

export type RecibirInput = {
  clienteId?: string | null;
  unidadId: string;
  destinatario?: string | null;
  transportadora?: string | null;
  guia?: string | null;
  tipo: TipoPaquete;
  fotoUrl?: string | null;
  fotoGuiaUrl?: string | null;
  observaciones?: string | null;
  llegadaEn?: Date | string | null;
};

export async function recibirPaquete(ctx: Ctx, input: RecibirInput) {
  if (input.clienteId) {
    const prev = await ctx.db.paquete.findFirst({ where: { clienteId: input.clienteId } });
    if (prev) return prev;
  }
  const unidad = await ctx.db.unidad.findFirst({ where: { id: input.unidadId }, select: { id: true, codigo: true } });
  if (!unidad) notFound("La unidad");
  const llegada = input.llegadaEn ? new Date(input.llegadaEn) : new Date();
  const p = await ctx.db.paquete.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      unidadId: unidad.id,
      destinatario: input.destinatario ?? null,
      transportadora: input.transportadora ?? null,
      guia: input.guia ?? null,
      tipo: input.tipo,
      fotoUrl: input.fotoUrl ?? null,
      fotoGuiaUrl: input.fotoGuiaUrl ?? null,
      observaciones: input.observaciones ?? null,
      llegadaEn: Number.isNaN(llegada.getTime()) || llegada > new Date() ? new Date() : llegada,
      recibidoPorId: ctx.userId.startsWith("api:") ? null : ctx.userId,
      clienteId: input.clienteId ?? null,
    },
  });
  const usuarios = await usuariosDeUnidad(ctx.conjuntoId, unidad.id);
  await notify({
    conjuntoId: ctx.conjuntoId,
    usuarioIds: usuarios,
    titulo: `📦 Llegó un paquete para ${unidad.codigo}`,
    cuerpo: `${label(p.tipo)}${p.transportadora ? ` de ${p.transportadora}` : ""}${p.destinatario ? ` para ${p.destinatario}` : ""}. Recógelo en portería.`,
    enlace: "/paquetes",
    tipo: "PAQUETE",
    canales: ["push", "email", "whatsapp"],
    data: { paqueteId: p.id },
  });
  const notificado = await ctx.db.paquete.update({ where: { id: p.id }, data: { notificadoEn: new Date() } });
  await emit({ tipo: "paquete.recibido", conjuntoId: ctx.conjuntoId, data: { id: p.id, unidadId: unidad.id, tipo: p.tipo, transportadora: p.transportadora }, actorId: ctx.userId });
  return notificado;
}

export type Autorizado = { personaId: string; nombre: string; tipo: string; fotoUrl: string | null; documento: string | null };

/** Personas que pueden recoger paquetes de la unidad: residentes (mayores de 14) y autorizados para paquetes. */
export async function autorizadosRecoger(ctx: Ctx, unidadId: string): Promise<Autorizado[]> {
  const vinculos = await ctx.db.vinculoUnidad.findMany({
    where: { unidadId, estado: "ACTIVO", tipo: { in: [...TIPOS_RECOGEN_PAQUETES] }, persona: { deletedAt: null, anonimizada: false } },
    include: { persona: { select: { id: true, nombres: true, apellidos: true, fotoUrl: true, numeroDocumento: true, fechaNacimiento: true } } },
    orderBy: [{ principal: "desc" }, { tipo: "asc" }],
  });
  const verDoc = can(ctx, ["porteria.ver", "campos.persona_documento"]);
  const seen = new Set<string>();
  return vinculos
    .filter((v) => (edad(v.persona.fechaNacimiento) ?? 99) >= EDAD_MINIMA_RECOGER)
    .filter((v) => (seen.has(v.personaId) ? false : (seen.add(v.personaId), true)))
    .map((v) => ({ personaId: v.personaId, nombre: nombreCompleto(v.persona), tipo: v.tipo, fotoUrl: v.persona.fotoUrl, documento: verDoc ? v.persona.numeroDocumento : null }));
}

export async function entregarPaquetes(ctx: Ctx, input: { paqueteIds: string[]; personaId: string; firma?: string | null; fotoEntregaUrl?: string | null; observaciones?: string | null }) {
  if (!input.paqueteIds.length) throw new AppError("Selecciona al menos un paquete.");
  if (!input.firma && !input.fotoEntregaUrl) throw new AppError("Pide la firma en pantalla o toma una foto de la entrega.", 400, { firma: "Firma o foto obligatoria" });
  if (input.firma && (!/^data:image\/(png|jpeg|webp);base64,/.test(input.firma) || input.firma.length > 400_000)) throw new AppError("La firma no es válida. Vuelve a firmar.");
  const paquetes = await ctx.db.paquete.findMany({ where: { id: { in: input.paqueteIds } } });
  if (paquetes.length !== input.paqueteIds.length) notFound("Uno de los paquetes");
  const unidades = new Set(paquetes.map((p) => p.unidadId));
  if (unidades.size !== 1) throw new AppError("Entrega paquetes de una sola unidad a la vez.");
  const unidadId = paquetes[0].unidadId;
  const noDisponibles = paquetes.filter((p) => p.estado !== "EN_PORTERIA");
  if (noDisponibles.length) throw new AppError("Uno de los paquetes ya fue entregado o devuelto.");
  const autorizados = await autorizadosRecoger(ctx, unidadId);
  const persona = autorizados.find((a) => a.personaId === input.personaId);
  if (!persona) throw new AppError("Esa persona no está autorizada para recoger paquetes de la unidad.", 403);
  const ahora = new Date();
  const r = await ctx.db.paquete.updateMany({
    where: { id: { in: input.paqueteIds }, estado: "EN_PORTERIA" },
    data: {
      estado: "ENTREGADO",
      entregadoEn: ahora,
      entregadoPorId: ctx.userId.startsWith("api:") ? null : ctx.userId,
      recogidoPor: persona.nombre,
      recogidoPorPersonaId: persona.personaId,
      firmaEntrega: input.firma ?? null,
      fotoEntregaUrl: input.fotoEntregaUrl ?? null,
      ...(input.observaciones ? { observaciones: input.observaciones } : {}),
    },
  });
  if (r.count !== input.paqueteIds.length) throw new AppError("Uno de los paquetes acaba de ser entregado por otro portero.");
  for (const p of paquetes) await emit({ tipo: "paquete.entregado", conjuntoId: ctx.conjuntoId, data: { id: p.id, unidadId, recogidoPor: persona.nombre }, actorId: ctx.userId });
  const usuarios = await usuariosDeUnidad(ctx.conjuntoId, unidadId);
  await notify({
    conjuntoId: ctx.conjuntoId,
    usuarioIds: usuarios,
    titulo: paquetes.length > 1 ? `${paquetes.length} paquetes entregados` : "Paquete entregado",
    cuerpo: `Portería entregó ${paquetes.length > 1 ? "tus paquetes" : "tu paquete"} a ${persona.nombre}.`,
    enlace: "/paquetes",
    tipo: "PAQUETE",
    canales: ["push"],
  });
  await audit(ctx, "entregar_paquete", "Paquete", input.paqueteIds.join(","), undefined, { recogidoPor: persona.nombre, conFirma: !!input.firma, conFoto: !!input.fotoEntregaUrl });
  return { entregados: r.count, recogidoPor: persona.nombre };
}

export async function devolverPaquete(ctx: Ctx, input: { id: string; motivo: string }) {
  const p = await ctx.db.paquete.findFirst({ where: { id: input.id } });
  if (!p) notFound("El paquete");
  if (p.estado !== "EN_PORTERIA") throw new AppError("Solo se pueden devolver paquetes que están en portería.");
  const d = await ctx.db.paquete.update({
    where: { id: p.id },
    data: { estado: "DEVUELTO", entregadoEn: new Date(), entregadoPorId: ctx.userId, observaciones: [p.observaciones, `Devuelto: ${input.motivo}`].filter(Boolean).join(" · ") },
  });
  await emit({ tipo: "paquete.devuelto", conjuntoId: ctx.conjuntoId, data: { id: p.id, unidadId: p.unidadId }, actorId: ctx.userId });
  const usuarios = await usuariosDeUnidad(ctx.conjuntoId, p.unidadId);
  await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: usuarios, titulo: "Paquete devuelto", cuerpo: `Portería devolvió un paquete${p.transportadora ? ` de ${p.transportadora}` : ""}: ${input.motivo}`, enlace: "/paquetes", tipo: "PAQUETE" });
  await audit(ctx, "devolver_paquete", "Paquete", p.id, { estado: p.estado }, { estado: d.estado, motivo: input.motivo });
  return d;
}

export type FiltrosPaquetes = { estado?: string; q?: string; unidadId?: string; vencidos?: boolean };

export function wherePaquetes(ctx: Ctx, f: FiltrosPaquetes): Prisma.PaqueteWhereInput {
  const cfg = conjuntoConfig(ctx);
  const ci = (s: string) => ({ contains: s, mode: "insensitive" as const });
  return {
    ...(seesAll(ctx, "paqueteria") ? {} : { unidadId: { in: ctx.unidadIds } }),
    ...(f.estado ? { estado: f.estado as never } : {}),
    ...(f.unidadId ? { unidadId: f.unidadId } : {}),
    ...(f.vencidos ? { estado: "EN_PORTERIA" as const, llegadaEn: { lt: new Date(Date.now() - cfg.porteria.maxDiasPaquete * 86_400_000) } } : {}),
    ...(f.q ? { OR: [{ unidad: { codigo: ci(f.q) } }, { destinatario: ci(f.q) }, { transportadora: ci(f.q) }, { guia: ci(f.q) }] } : {}),
  };
}

export async function listarPaquetes(ctx: Ctx, f: FiltrosPaquetes, pag: { skip: number; take: number }) {
  const where = wherePaquetes(ctx, f);
  const [rows, total] = await Promise.all([
    ctx.db.paquete.findMany({ where, include: { unidad: { select: { id: true, codigo: true } } }, orderBy: [{ estado: "desc" }, { llegadaEn: f.estado === "EN_PORTERIA" ? "asc" : "desc" }], skip: pag.skip, take: pag.take }),
    ctx.db.paquete.count({ where }),
  ]);
  return { rows: rows.map((p) => ({ ...p, dias: diasEnPorteria(p.llegadaEn) })), total };
}

/** Reporte del día: recibidos hoy, entregados hoy, en portería y con más de N días. */
export async function reporteDiario(ctx: Ctx, ahora = new Date()) {
  const cfg = conjuntoConfig(ctx);
  const hoy = startOfDayBogota(ahora);
  const limite = new Date(ahora.getTime() - cfg.porteria.maxDiasPaquete * 86_400_000);
  const [recibidosHoy, entregadosHoy, enPorteria, vencidos] = await Promise.all([
    ctx.db.paquete.count({ where: { llegadaEn: { gte: hoy } } }),
    ctx.db.paquete.count({ where: { estado: "ENTREGADO", entregadoEn: { gte: hoy } } }),
    ctx.db.paquete.count({ where: { estado: "EN_PORTERIA" } }),
    ctx.db.paquete.count({ where: { estado: "EN_PORTERIA", llegadaEn: { lt: limite } } }),
  ]);
  return { recibidosHoy, entregadosHoy, enPorteria, vencidos, maxDias: cfg.porteria.maxDiasPaquete };
}

export async function detallePaquete(ctx: Ctx, id: string) {
  const p = await ctx.db.paquete.findFirst({ where: { id }, include: { unidad: { select: { id: true, codigo: true } } } });
  if (!p) notFound("El paquete");
  if (!seesAll(ctx, "paqueteria") && !ctx.unidadIds.includes(p.unidadId)) notFound("El paquete");
  return { ...p, dias: diasEnPorteria(p.llegadaEn) };
}

/** Vista del residente: paquetes en portería y entregados de sus unidades, y quién puede recogerlos. */
export async function misPaquetes(ctx: Ctx) {
  if (!ctx.unidadIds.length) return { enPorteria: [], entregados: [], autorizados: [] as (Autorizado & { unidad: string })[] };
  const [enPorteria, entregados, unidades] = await Promise.all([
    ctx.db.paquete.findMany({ where: { unidadId: { in: ctx.unidadIds }, estado: "EN_PORTERIA" }, include: { unidad: { select: { codigo: true } } }, orderBy: { llegadaEn: "desc" } }),
    ctx.db.paquete.findMany({ where: { unidadId: { in: ctx.unidadIds }, estado: { in: ["ENTREGADO", "DEVUELTO"] } }, include: { unidad: { select: { codigo: true } } }, orderBy: { llegadaEn: "desc" }, take: 30 }),
    ctx.db.unidad.findMany({ where: { id: { in: ctx.unidadIds } }, select: { id: true, codigo: true } }),
  ]);
  const autorizados = (await Promise.all(unidades.map(async (u) => (await autorizadosRecoger(ctx, u.id)).map((a) => ({ ...a, documento: null, unidad: u.codigo }))))).flat();
  return { enPorteria: enPorteria.map((p) => ({ ...p, dias: diasEnPorteria(p.llegadaEn) })), entregados, autorizados };
}
