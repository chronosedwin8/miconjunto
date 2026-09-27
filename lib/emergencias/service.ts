import type { TipoAlerta } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { prisma } from "@/lib/db";
import { notify, usuariosConPermiso, usuariosConRol } from "@/lib/notificaciones";
import { emit } from "@/lib/events";
import { audit } from "@/lib/audit";
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
