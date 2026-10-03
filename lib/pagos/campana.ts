import type { Prisma } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { systemCtx } from "@/lib/auth/system-ctx";
import { prisma } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { queueBrandedEmail, renderTemplate } from "@/lib/email";
import { notify } from "@/lib/notificaciones";
import { saveFile } from "@/lib/storage";
import { saldoUnidad } from "@/lib/cartera/core";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { cop, mesNombre, nombreCompleto, nowBogota, periodoActual, toNumber } from "@/lib/format";
import { puedeContactar, registrarGestion, siguienteHorarioPermitido } from "@/lib/cartera/cobranza";
import { crearLinkPago } from "./publico";
import { estadoCuentaPdf, generarCuotasDelMes } from "./cartera-bridge";

/**
 * Campaña "Cobro de administración" (MICONJUNTO_SPEC §4.6 y §5.10): a cada unidad con saldo se le envía
 * a sus propietarios un correo con la plantilla ({{nombre}}, {{unidad}}, {{saldo}}, {{link_pago}}), el estado
 * de cuenta PDF adjunto y un link de pago único (/pagar/<token>). Métricas: enviados, rebotes, aperturas y
 * clics (tracking de `queueEmail`). Respeta la Ley 2300 de 2023: solo se envía en horario permitido (L–V 7–19,
 * sáb. 8–15, sin domingos ni festivos) y a las unidades en mora con el máximo de contactos por semana del canal correo.
 */

export const ASUNTO_COBRO_DEFECTO = "Estado de cuenta {{unidad}} · {{conjunto}}";
export const PLANTILLA_COBRO_DEFECTO = [
  "Hola {{nombre}}:",
  "Te compartimos el estado de cuenta de la unidad {{unidad}}. El saldo pendiente a la fecha es {{saldo}}.",
  "Puedes pagar en línea con PSE, tarjeta, Nequi o Bancolombia desde este enlace seguro, sin iniciar sesión: {{link_pago}}",
  "Adjuntamos el estado de cuenta en PDF. Si ya realizaste el pago, por favor ignora este mensaje.",
].join("\n\n");

export type DefinicionCampanaCobro = {
  montoMinimo: number;
  periodo?: string;
  automatica?: boolean;
  unidadIds?: string[];
  omitidosFrecuencia?: number;
  unidades?: number;
};

export type CrearCampanaInput = {
  asunto?: string | null;
  plantilla?: string | null;
  programadaPara?: Date | null;
  montoMinimo?: number | null;
  unidadIds?: string[] | null;
  automatica?: boolean;
  periodo?: string;
  /** "esperar" ejecuta el envío antes de responder (jobs y pruebas); "segundo_plano" responde de inmediato. */
  ejecucion?: "esperar" | "segundo_plano";
};

export async function crearCampanaCobro(ctx: Ctx, input: CrearCampanaInput) {
  const asunto = input.asunto?.trim() || ASUNTO_COBRO_DEFECTO;
  const plantilla = input.plantilla?.trim() || PLANTILLA_COBRO_DEFECTO;
  if (!plantilla.includes("{{link_pago}}")) throw new AppError("La plantilla debe incluir la variable {{link_pago}}.");
  const ahora = new Date();
  const solicitada = input.programadaPara && input.programadaPara > ahora ? input.programadaPara : ahora;
  const envio = siguienteHorarioPermitido(solicitada);
  const inmediata = envio.getTime() - ahora.getTime() < 60_000;
  const definicion: DefinicionCampanaCobro = {
    montoMinimo: Math.max(0, input.montoMinimo ?? conjuntoConfig(ctx).bloqueoMora.montoMinimo),
    periodo: input.periodo ?? periodoActual(),
    automatica: input.automatica ?? false,
    ...(input.unidadIds?.length ? { unidadIds: input.unidadIds } : {}),
  };
  const campana = await ctx.db.campanaCorreo.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      asunto,
      plantilla,
      tipo: "COBRO_ADMINISTRACION",
      definicionSegmento: definicion as Prisma.InputJsonValue,
      programadaPara: envio,
      estado: inmediata ? "ENVIANDO" : "PROGRAMADA",
      creadaPorId: ctx.userId === "sistema" ? null : ctx.userId,
    },
  });
  await audit(ctx, "crear_campana_cobro", "CampanaCorreo", campana.id, undefined, { asunto, programadaPara: envio, definicion });
  if (inmediata) {
    const run = ejecutarCampanaCobro(campana.id);
    if (input.ejecucion === "esperar") await run;
    else run.catch((e) => console.error("[campaña cobro] falló", campana.id, (e as Error).message));
  }
  return { id: campana.id, estado: campana.estado, programadaPara: envio, fueraDeHorario: envio.getTime() > solicitada.getTime() + 60_000 };
}

type Destinatario = { email: string; nombre: string; usuarioId: string | null };

async function destinatariosUnidad(conjuntoId: string, unidadId: string): Promise<Destinatario[]> {
  const vinculos = await prisma.vinculoUnidad.findMany({
    where: {
      conjuntoId,
      unidadId,
      estado: "ACTIVO",
      deletedAt: null,
      tipo: { in: ["PROPIETARIO", "COPROPIETARIO"] },
      persona: { deletedAt: null, anonimizada: false },
    },
    include: { persona: { include: { usuario: { select: { id: true, email: true, deletedAt: true } } } } },
    orderBy: [{ principal: "desc" }, { createdAt: "asc" }],
  });
  const out = new Map<string, Destinatario>();
  for (const v of vinculos) {
    const nombre = v.persona.nombres || nombreCompleto(v.persona);
    const usuario = v.persona.usuario && !v.persona.usuario.deletedAt ? v.persona.usuario : null;
    if (usuario?.email) out.set(usuario.email.toLowerCase(), { email: usuario.email.toLowerCase(), nombre, usuarioId: usuario.id });
    // Correo de la persona principal aunque no tenga cuenta.
    if (v.persona.email && (v.principal || !usuario)) {
      const e = v.persona.email.toLowerCase();
      if (!out.has(e)) out.set(e, { email: e, nombre, usuarioId: usuario?.id ?? null });
    }
  }
  return [...out.values()];
}

/** Ejecuta el envío de una campaña de cobro (idempotente por estado). */
export async function ejecutarCampanaCobro(campanaId: string) {
  const campana = await prisma.campanaCorreo.findUnique({ where: { id: campanaId } });
  if (!campana || campana.tipo !== "COBRO_ADMINISTRACION" || campana.estado !== "ENVIANDO") return { unidades: 0, correos: 0 };
  const ctx = await systemCtx(campana.conjuntoId);
  const conjunto = await prisma.conjunto.findUniqueOrThrow({ where: { id: campana.conjuntoId }, select: { nombre: true, colorPrimario: true } });
  const def = (campana.definicionSegmento ?? { montoMinimo: 0 }) as DefinicionCampanaCobro;
  const unidades = await ctx.db.unidad.findMany({
    where: def.unidadIds?.length ? { id: { in: def.unidadIds } } : {},
    select: { id: true, codigo: true },
    orderBy: { codigo: "asc" },
  });
  let correos = 0;
  let conSaldo = 0;
  let omitidos = 0;
  const avisarPush: string[] = [];
  for (const u of unidades) {
    try {
      const saldo = await saldoUnidad(ctx, u.id);
      if (saldo.neto <= def.montoMinimo) continue;
      const dest = await destinatariosUnidad(campana.conjuntoId, u.id);
      if (!dest.length) continue;
      // Ley 2300: a las unidades en mora se les aplica el horario y el máximo de contactos por semana y canal.
      const enMora = saldo.vencido - saldo.saldoAFavor > 0;
      if (enMora) {
        const permiso = await puedeContactar(u.id, "CORREO");
        if (!permiso.ok) {
          omitidos++;
          continue;
        }
      }
      const enviar = dest;
      conSaldo++;
      const [link, pdf] = await Promise.all([crearLinkPago(campana.conjuntoId, u.id, 35), estadoCuentaPdf(ctx, u.id)]);
      const archivo = await saveFile({
        conjuntoId: campana.conjuntoId,
        folder: "campanas-cobro",
        body: pdf,
        filename: `estado-cuenta-${u.codigo}.pdf`,
        mime: "application/pdf",
      });
      for (const d of enviar) {
        const vars = {
          nombre: d.nombre,
          unidad: u.codigo,
          saldo: cop(saldo.neto),
          link_pago: link.url,
          conjunto: conjunto.nombre,
          vencido: cop(saldo.vencido),
          mes: mesNombre(def.periodo ?? periodoActual()),
        };
        await queueBrandedEmail(
          d.email,
          renderTemplate(campana.asunto, vars),
          {
            conjuntoNombre: conjunto.nombre,
            color: conjunto.colorPrimario ?? undefined,
            titulo: `Estado de cuenta ${u.codigo}`,
            parrafos: renderTemplate(campana.plantilla, vars).split(/\n{2,}/),
            boton: { texto: `Pagar ${cop(saldo.neto)}`, url: link.url },
          },
          {
            conjuntoId: campana.conjuntoId,
            campanaId: campana.id,
            tracking: true,
            attachments: [{ filename: `estado-cuenta-${u.codigo}.pdf`, url: archivo.url, contentType: "application/pdf" }],
          },
        );
        correos++;
        if (d.usuarioId) avisarPush.push(d.usuarioId);
      }
      if (enMora) {
        await registrarGestion(ctx, {
          unidadId: u.id,
          canal: "CORREO",
          resultado: "Campaña de cobro: estado de cuenta y link de pago",
          notas: enviar.map((d) => d.email).join(", "),
        }).catch(() => undefined);
      }
    } catch (e) {
      console.error("[campaña cobro] unidad", u.codigo, (e as Error).message);
    }
  }
  if (avisarPush.length) {
    await notify({
      conjuntoId: campana.conjuntoId,
      usuarioIds: avisarPush,
      titulo: "Tu estado de cuenta está disponible",
      cuerpo: "Revisa tu saldo y paga en línea con PSE, tarjeta o Nequi.",
      enlace: "/cuenta",
      tipo: "COBRO",
      canales: ["push"],
    });
  }
  await prisma.campanaCorreo.update({
    where: { id: campana.id },
    data: {
      estado: "ENVIADA",
      totalDestinatarios: correos,
      definicionSegmento: { ...def, unidades: conSaldo, omitidosFrecuencia: omitidos } as Prisma.InputJsonValue,
    },
  });
  await audit({ conjuntoId: campana.conjuntoId, nombre: "Sistema Conjunto360" }, "enviar_campana_cobro", "CampanaCorreo", campana.id, undefined, {
    unidades: conSaldo,
    correos,
    omitidos,
  });
  return { unidades: conSaldo, correos, omitidos };
}

export async function cancelarCampanaCobro(ctx: Ctx, id: string) {
  const c = await ctx.db.campanaCorreo.findUnique({ where: { id } });
  if (!c || c.tipo !== "COBRO_ADMINISTRACION") notFound("La campaña");
  if (c.estado !== "PROGRAMADA") throw new AppError("Solo se pueden cancelar campañas programadas.");
  await ctx.db.campanaCorreo.update({ where: { id }, data: { estado: "CANCELADA" } });
  await audit(ctx, "cancelar_campana_cobro", "CampanaCorreo", id);
}

/** Campañas de cobro con métricas (enviados, aperturas, clics y pagos en línea desde el link). */
export async function campanasCobro(ctx: Ctx, take = 30) {
  const rows = await ctx.db.campanaCorreo.findMany({ where: { tipo: "COBRO_ADMINISTRACION" }, orderBy: { createdAt: "desc" }, take });
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const c = rows[i];
    const hasta = i > 0 ? rows[i - 1].createdAt : new Date();
    const pagos = await ctx.db.pago.aggregate({
      where: { estado: "APROBADO", observaciones: { contains: "link público" }, createdAt: { gte: c.createdAt, lt: hasta } },
      _count: true,
      _sum: { valor: true },
    });
    const def = (c.definicionSegmento ?? {}) as DefinicionCampanaCobro;
    out.push({
      id: c.id,
      asunto: c.asunto,
      estado: c.estado,
      creada: c.createdAt,
      programadaPara: c.programadaPara,
      automatica: !!def.automatica,
      periodo: def.periodo ?? null,
      unidades: def.unidades ?? null,
      omitidos: def.omitidosFrecuencia ?? 0,
      total: c.totalDestinatarios,
      enviados: c.enviados,
      rebotes: c.rebotes,
      aperturas: c.aperturas,
      clics: c.clics,
      pagos: pagos._count,
      recaudado: toNumber(pagos._sum.valor),
    });
  }
  return out;
}

/** Procesa campañas PROGRAMADAS cuya hora ya llegó (job). */
export async function procesarCampanasProgramadas() {
  const due = await prisma.campanaCorreo.findMany({
    where: { tipo: "COBRO_ADMINISTRACION", estado: "PROGRAMADA", programadaPara: { lte: new Date() }, deletedAt: null },
    select: { id: true },
  });
  let n = 0;
  for (const c of due) {
    const r = await prisma.campanaCorreo.updateMany({ where: { id: c.id, estado: "PROGRAMADA" }, data: { estado: "ENVIANDO" } });
    if (r.count === 1) {
      await ejecutarCampanaCobro(c.id);
      n++;
    }
  }
  return n;
}

/**
 * Campaña mensual automática: el día de generación de cuotas del conjunto, tras generar las cuotas del mes,
 * envía el cobro de administración (una sola vez por periodo).
 */
export async function campanaAutomaticaMensual(conjuntoId: string, hoy = new Date()) {
  const ctx = await systemCtx(conjuntoId);
  const cfg = conjuntoConfig(ctx);
  if (nowBogota(hoy).day !== cfg.cartera.diaGeneracion) return "no es día de generación";
  const periodo = periodoActual(hoy);
  const previas = await ctx.db.campanaCorreo.findMany({
    where: { tipo: "COBRO_ADMINISTRACION", createdAt: { gte: new Date(hoy.getTime() - 40 * 86_400_000) } },
    select: { definicionSegmento: true },
  });
  if (
    previas.some(
      (p) => (p.definicionSegmento as DefinicionCampanaCobro | null)?.automatica && (p.definicionSegmento as DefinicionCampanaCobro).periodo === periodo,
    )
  )
    return "ya enviada";
  const generadas = await ctx.db.cuota.count({ where: { periodo, origen: "GENERACION_MENSUAL" } });
  if (!generadas) {
    const ok = await generarCuotasDelMes(ctx, periodo);
    if (!ok) return "sin cuotas generadas del periodo";
  }
  const r = await crearCampanaCobro(ctx, { automatica: true, periodo, asunto: `Cuota de administración {{mes}} · {{unidad}}`, ejecucion: "esperar" });
  return `campaña ${r.id} (${r.estado})`;
}
