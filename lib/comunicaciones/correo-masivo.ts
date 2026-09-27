import type { Prisma } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { AppError, notFound } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { appUrl, queueEmail, type EmailAttachment } from "@/lib/email";
import { saldoUnidad } from "@/lib/cartera/core";
import { cop } from "@/lib/format";
import { prisma } from "@/lib/db";
import { sanitizarHtml, textoPlano } from "@/lib/muro/contenido";
import { definicionEfectiva, normalizarDef, resolverDestinatariosCorreo, type DestinatarioCorreo } from "@/lib/segmentos";

/**
 * Correo masivo GENERAL (campañas con segmentación, variables, adjuntos y programación).
 * La campaña "Cobro de administración" la gestiona el módulo de Pagos; aquí solo se lista.
 * El envío encola cada correo con `queueEmail({ tracking: true, campanaId })`; el job
 * "correos-cola" lo procesa con límite por minuto (EMAIL_RATE_PER_MIN) y reintentos.
 */
export const VARIABLES_CORREO = [
  { clave: "nombre", descripcion: "Nombre del destinatario" },
  { clave: "unidad", descripcion: "Unidad(es) del destinatario" },
  { clave: "saldo", descripcion: "Saldo pendiente (solo propietarios o autorizados)" },
  { clave: "link_pago", descripcion: "Enlace para pagar en línea" },
] as const;

type CtxW = Pick<Ctx, "db" | "conjuntoId" | "conjunto" | "userId" | "nombre" | "impersonadoPor">;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Reemplaza variables en la plantilla HTML (valores escapados). `{{link_pago}}` se vuelve un enlace. */
export function aplicarVariables(html: string, vars: { nombre: string; unidad: string; saldo: string; link_pago: string }) {
  let out = html.replace(/href="\{\{\s*link_pago\s*\}\}"/g, `href="${esc(vars.link_pago)}"`);
  out = out.replace(/\{\{\s*link_pago\s*\}\}/g, `<a href="${esc(vars.link_pago)}">${esc(vars.link_pago)}</a>`);
  return out.replace(/\{\{\s*(nombre|unidad|saldo)\s*\}\}/g, (_m, k: "nombre" | "unidad" | "saldo") => esc(vars[k] ?? ""));
}

export function aplicarVariablesTexto(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_m, k: string) => vars[k] ?? "");
}

/** Plantilla base del correo masivo (encabezado con el color del conjunto). */
export function envolverCorreo(opts: { conjuntoNombre: string; color?: string | null; asunto: string; cuerpoHtml: string }) {
  const color = /^#[0-9a-f]{3,8}$/i.test(opts.color ?? "") ? opts.color! : "#0f766e";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(opts.asunto)}</title></head>
<body style="margin:0;padding:24px 0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:12px;overflow:hidden">
<tr><td style="background:${color};padding:18px 24px;color:#fff;font-size:18px;font-weight:bold">${esc(opts.conjuntoNombre)}</td></tr>
<tr><td style="padding:16px 24px 24px;font-size:15px;line-height:22px;color:#3f3f46">${opts.cuerpoHtml}</td></tr>
<tr><td style="padding:12px 24px 20px;border-top:1px solid #e4e4e7;font-size:12px;color:#71717a">Recibes este correo porque estás registrado en ${esc(opts.conjuntoNombre)} en MiConjunto. Para dejar de recibir comunicaciones no obligatorias, ajusta tus preferencias en la aplicación.</td></tr>
</table></td></tr></table></body></html>`;
}

async function saldoTexto(ctx: Pick<Ctx, "db">, d: DestinatarioCorreo) {
  if (!d.unidadesFinancieras.length) return "—";
  let neto = 0;
  for (const u of d.unidadesFinancieras) neto += (await saldoUnidad(ctx, u)).neto;
  return cop(Math.max(0, neto));
}

/** Renderiza el correo para un destinatario (asunto + html). */
export async function renderCorreo(ctx: Pick<Ctx, "db" | "conjunto">, camp: { asunto: string; plantilla: string }, d: DestinatarioCorreo) {
  const usaSaldo = /\{\{\s*saldo\s*\}\}/.test(camp.plantilla + camp.asunto);
  const vars = {
    nombre: d.nombre || "vecino(a)",
    unidad: d.unidades.join(", ") || "—",
    saldo: usaSaldo ? await saldoTexto(ctx, d) : "",
    link_pago: appUrl("/cuenta/pagar"),
  };
  const asunto = aplicarVariablesTexto(camp.asunto, vars).slice(0, 200);
  const cuerpo = aplicarVariables(sanitizarHtml(camp.plantilla), vars);
  return {
    asunto,
    html: envolverCorreo({ conjuntoNombre: ctx.conjunto.nombre, color: ctx.conjunto.colorPrimario, asunto, cuerpoHtml: cuerpo }),
    texto: textoPlano(cuerpo),
  };
}

export type CampanaInput = {
  id?: string | null;
  asunto: string;
  plantilla: string;
  segmentoId?: string | null;
  definicion?: unknown;
  adjuntos?: string[];
  programadaPara?: Date | null;
  accion: "BORRADOR" | "PROGRAMAR" | "ENVIAR";
};

export async function guardarCampana(ctx: CtxW, input: CampanaInput) {
  const antes = input.id ? await ctx.db.campanaCorreo.findUnique({ where: { id: input.id } }) : null;
  if (input.id && !antes) notFound("La campaña");
  if (antes && antes.tipo !== "GENERAL") throw new AppError("Las campañas de cobro se gestionan desde Cartera y pagos.");
  if (antes && !["BORRADOR", "PROGRAMADA"].includes(antes.estado)) throw new AppError("La campaña ya fue enviada y no se puede modificar.");
  const plantilla = sanitizarHtml(input.plantilla);
  if (!textoPlano(plantilla)) throw new AppError("Escribe el contenido del correo.", 400, { plantilla: "Obligatorio" });
  if (input.segmentoId) {
    const s = await ctx.db.segmento.findUnique({ where: { id: input.segmentoId } });
    if (!s) notFound("El segmento");
  }
  const adjuntos = (input.adjuntos ?? []).filter((u) => u.startsWith(`/api/files/${ctx.conjuntoId}/`) && !u.includes("..")).slice(0, 5);
  if (input.accion === "PROGRAMAR") {
    if (!input.programadaPara) throw new AppError("Indica la fecha y hora de envío.", 400, { programadaPara: "Obligatorio" });
    if (input.programadaPara.getTime() < Date.now() - 60_000) throw new AppError("La fecha de envío debe ser futura.", 400, { programadaPara: "Debe ser futura" });
  }
  const data = {
    asunto: input.asunto.trim(),
    plantilla,
    segmentoId: input.segmentoId ?? null,
    definicionSegmento: input.segmentoId ? undefined : (normalizarDef(input.definicion) as Prisma.InputJsonValue),
    adjuntos,
    programadaPara: input.accion === "PROGRAMAR" ? input.programadaPara : null,
    estado: input.accion === "PROGRAMAR" ? ("PROGRAMADA" as const) : ("BORRADOR" as const),
  };
  const c = antes
    ? await ctx.db.campanaCorreo.update({ where: { id: antes.id }, data })
    : await ctx.db.campanaCorreo.create({ data: { ...data, conjuntoId: ctx.conjuntoId, tipo: "GENERAL", creadaPorId: ctx.userId } });
  await audit(ctx, antes ? "editar" : "crear", "CampanaCorreo", c.id, antes ? { asunto: antes.asunto, estado: antes.estado } : undefined, { asunto: c.asunto, estado: c.estado, programadaPara: c.programadaPara });
  if (input.accion === "ENVIAR") {
    const r = await enviarCampana(ctx, c.id);
    return { id: c.id, encolados: r.encolados };
  }
  return { id: c.id, encolados: 0 };
}

/**
 * Resuelve destinatarios y encola los correos. Idempotente: solo toma campañas en BORRADOR/PROGRAMADA
 * (bloqueo optimista con updateMany), así dos procesos no la envían dos veces.
 */
export async function enviarCampana(ctx: CtxW, id: string) {
  const c = await ctx.db.campanaCorreo.findUnique({ where: { id } });
  if (!c) notFound("La campaña");
  if (c.tipo !== "GENERAL") throw new AppError("Las campañas de cobro se envían desde Cartera y pagos.");
  const lock = await ctx.db.campanaCorreo.updateMany({ where: { id, estado: { in: ["BORRADOR", "PROGRAMADA"] } }, data: { estado: "ENVIANDO" } });
  if (!lock.count) throw new AppError("La campaña ya está en envío o fue enviada.");
  try {
    const def = await definicionEfectiva(ctx, { segmentoId: c.segmentoId, definicion: c.definicionSegmento });
    const destinatarios = await resolverDestinatariosCorreo(ctx, def);
    const attachments: EmailAttachment[] = c.adjuntos.map((url) => ({ url, filename: decodeURIComponent(url.split("/").pop() ?? "adjunto").replace(/^[a-f0-9]{16}-/, "") }));
    let n = 0;
    for (const d of destinatarios) {
      const r = await renderCorreo(ctx, c, d);
      await queueEmail({ to: d.email, subject: r.asunto, html: r.html, text: r.texto, conjuntoId: ctx.conjuntoId, campanaId: c.id, attachments, tracking: true });
      n++;
    }
    await ctx.db.campanaCorreo.update({ where: { id }, data: { estado: "ENVIADA", totalDestinatarios: n, programadaPara: c.programadaPara ?? new Date() } });
    await audit(ctx, "enviar", "CampanaCorreo", id, { estado: c.estado }, { estado: "ENVIADA", destinatarios: n });
    return { encolados: n };
  } catch (e) {
    await ctx.db.campanaCorreo.update({ where: { id }, data: { estado: c.estado } });
    throw e;
  }
}

export async function cancelarCampana(ctx: CtxW, id: string) {
  const c = await ctx.db.campanaCorreo.findUnique({ where: { id } });
  if (!c) notFound("La campaña");
  if (c.tipo !== "GENERAL") throw new AppError("Las campañas de cobro se gestionan desde Cartera y pagos.");
  if (c.estado === "CANCELADA") return { cancelados: 0 };
  // Cancela lo que aún no salió de la cola.
  const r = await prisma.correoSaliente.updateMany({ where: { campanaId: id, conjuntoId: ctx.conjuntoId, estado: "PENDIENTE" }, data: { estado: "CANCELADO" } });
  await ctx.db.campanaCorreo.update({ where: { id }, data: { estado: c.estado === "ENVIADA" && r.count === 0 ? "ENVIADA" : "CANCELADA" } });
  await audit(ctx, "cancelar", "CampanaCorreo", id, { estado: c.estado }, { estado: "CANCELADA", correosCancelados: r.count });
  return { cancelados: r.count };
}

export async function duplicarCampana(ctx: CtxW, id: string) {
  const c = await ctx.db.campanaCorreo.findUnique({ where: { id } });
  if (!c) notFound("La campaña");
  if (c.tipo !== "GENERAL") throw new AppError("Solo se pueden duplicar campañas generales.");
  const n = await ctx.db.campanaCorreo.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      tipo: "GENERAL",
      asunto: `${c.asunto} (copia)`.slice(0, 200),
      plantilla: c.plantilla,
      segmentoId: c.segmentoId,
      definicionSegmento: (c.definicionSegmento ?? undefined) as Prisma.InputJsonValue | undefined,
      adjuntos: c.adjuntos,
      creadaPorId: ctx.userId,
    },
  });
  return { id: n.id };
}

export async function eliminarCampana(ctx: CtxW, id: string) {
  const c = await ctx.db.campanaCorreo.findUnique({ where: { id } });
  if (!c) notFound("La campaña");
  if (c.tipo !== "GENERAL" || !["BORRADOR", "CANCELADA"].includes(c.estado)) throw new AppError("Solo se pueden eliminar borradores o campañas canceladas.");
  await ctx.db.campanaCorreo.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, "eliminar", "CampanaCorreo", id, { asunto: c.asunto });
  return true;
}

/** Métricas en vivo desde la cola (además de los contadores de la campaña que actualiza /api/track). */
export async function metricasCampana(ctx: Pick<Ctx, "conjuntoId">, campanaId: string) {
  const base = { campanaId, conjuntoId: ctx.conjuntoId, deletedAt: null };
  const [porEstado, abiertos, clics] = await Promise.all([
    prisma.correoSaliente.groupBy({ by: ["estado"], where: base, _count: { _all: true } }),
    prisma.correoSaliente.count({ where: { ...base, abiertoEn: { not: null } } }),
    prisma.correoSaliente.count({ where: { ...base, clicEn: { not: null } } }),
  ]);
  const m = Object.fromEntries(porEstado.map((p) => [p.estado, p._count._all])) as Record<string, number>;
  const total = porEstado.reduce((a, p) => a + p._count._all, 0);
  return { total, enviados: m.ENVIADO ?? 0, pendientes: m.PENDIENTE ?? 0, errores: m.ERROR ?? 0, cancelados: m.CANCELADO ?? 0, abiertos, clics };
}

export async function correosDeCampana(ctx: Pick<Ctx, "conjuntoId">, campanaId: string, opts: { estado?: string; take?: number; skip?: number } = {}) {
  const where: Prisma.CorreoSalienteWhereInput = { campanaId, conjuntoId: ctx.conjuntoId, deletedAt: null, ...(opts.estado ? { estado: opts.estado as never } : {}) };
  const [items, total] = await Promise.all([
    prisma.correoSaliente.findMany({ where, orderBy: { createdAt: "asc" }, take: opts.take ?? 50, skip: opts.skip ?? 0, select: { id: true, para: true, estado: true, enviadoEn: true, abiertoEn: true, clicEn: true, error: true, intentos: true } }),
    prisma.correoSaliente.count({ where }),
  ]);
  return { items, total };
}

/** Envía las campañas GENERALES programadas cuya hora ya llegó (job cada 5 min). */
export async function enviarProgramadas(ctx: CtxW, ahora = new Date()) {
  const due = await ctx.db.campanaCorreo.findMany({ where: { tipo: "GENERAL", estado: "PROGRAMADA", programadaPara: { lte: ahora } }, select: { id: true } });
  let total = 0;
  for (const c of due) {
    try {
      total += (await enviarCampana(ctx, c.id)).encolados;
    } catch (e) {
      console.error("[correo-masivo] no se pudo enviar", c.id, (e as Error).message);
    }
  }
  return { campanas: due.length, correos: total };
}
