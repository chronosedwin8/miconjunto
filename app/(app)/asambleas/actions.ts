"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { can } from "@/lib/permisos";
import { AppError } from "@/lib/errors";
import { zs } from "@/lib/validation";
import {
  agregarCompromiso,
  agregarPunto,
  asociarVotacionPunto,
  cambiarEstadoCompromiso,
  cancelarAsamblea,
  decidirPoder,
  eliminarPunto,
  enviarConvocatoria,
  finalizarAsamblea,
  firmarActa,
  generarTextoActa,
  guardarActa,
  guardarAsamblea,
  guardarTextoConvocatoria,
  iniciarAsamblea,
  moverPunto,
  registrarAsistenciaManual,
  registrarAsistenciaPropia,
  registrarPoder,
  registrarSalida,
  vincularCuotaExtraordinaria,
} from "@/lib/asambleas/service";
import { publicarActa } from "@/lib/asambleas/acta";

const done = <T>(id: string, r: T) => {
  revalidatePath(`/asambleas/${id}`, "layout");
  revalidatePath("/asambleas");
  return r;
};

const GESTION = ["asambleas.gestionar", "asambleas.crear"] as const;

const asambleaSchema = z.object({
  id: zs.optId(),
  titulo: zs.text(5, 150),
  tipo: z.enum(["ORDINARIA", "EXTRAORDINARIA"]),
  modalidad: z.enum(["PRESENCIAL", "VIRTUAL", "MIXTA"]),
  fecha: zs.date(),
  lugar: zs.optText(200),
  enlace: zs.optText(500),
  quorumRequerido: zs.optNumber(),
  limitePoderes: zs.optInt(),
});

export const guardarAsambleaAction = action({ perm: "asambleas.crear", schema: asambleaSchema }, async (input, ctx) => {
  if (input.quorumRequerido !== null && input.quorumRequerido !== undefined && (input.quorumRequerido <= 0 || input.quorumRequerido > 100)) {
    throw new AppError("El quórum debe estar entre 0 y 100 %.", 400, { quorumRequerido: "Valor no válido" });
  }
  const a = await guardarAsamblea(ctx, input);
  return done(a.id, { id: a.id });
});

const idSchema = z.object({ id: zs.id() });

export const enviarConvocatoriaAction = action({ perm: "asambleas.crear", schema: idSchema }, async ({ id }, ctx) => {
  const r = await enviarConvocatoria(ctx, id);
  return done(id, { destinatarios: r.destinatarios, advertencia: r.advertencia });
});

const textoSchema = z.object({ id: zs.id(), texto: zs.optText(20000) });

export const guardarConvocatoriaAction = action({ perm: "asambleas.crear", schema: textoSchema }, async ({ id, texto }, ctx) => {
  await guardarTextoConvocatoria(ctx, id, texto ?? null);
  return done(id, { id });
});

// ── Orden del día ──

const puntoSchema = z.object({
  asambleaId: zs.id(),
  titulo: zs.text(3, 200),
  descripcion: zs.optText(3000),
  conVotacion: zs.bool(),
  pregunta: zs.optText(300),
  opciones: zs.list().optional(),
  tipoMayoria: z.enum(["SIMPLE", "CALIFICADA_70", "UNANIME"]).optional(),
  ponderacion: z.enum(["COEFICIENTE", "UNIDAD"]).optional(),
  quienVota: z.enum(["PROPIETARIOS_AL_DIA", "PROPIETARIOS", "TODOS"]).optional(),
  secreto: zs.bool().optional(),
});

export const agregarPuntoAction = action({ perm: [...GESTION], schema: puntoSchema }, async ({ asambleaId, ...input }, ctx) => {
  await agregarPunto(ctx, asambleaId, { ...input, opciones: input.opciones?.filter(Boolean) });
  return done(asambleaId, true);
});

const asociarSchema = puntoSchema.omit({ titulo: true, conVotacion: true }).extend({ orden: zs.int(1, 200) });

export const asociarVotacionAction = action({ perm: [...GESTION], schema: asociarSchema }, async ({ asambleaId, orden, ...input }, ctx) => {
  await asociarVotacionPunto(ctx, asambleaId, orden, { ...input, opciones: input.opciones?.filter(Boolean) });
  return done(asambleaId, true);
});

const moverSchema = z.object({ asambleaId: zs.id(), orden: zs.int(1, 200), dir: z.enum(["arriba", "abajo"]) });

export const moverPuntoAction = action({ perm: [...GESTION], schema: moverSchema }, async ({ asambleaId, orden, dir }, ctx) => {
  await moverPunto(ctx, asambleaId, orden, dir);
  return done(asambleaId, true);
});

const puntoIdSchema = z.object({ asambleaId: zs.id(), orden: zs.int(1, 200) });

export const eliminarPuntoAction = action({ perm: [...GESTION], schema: puntoIdSchema }, async ({ asambleaId, orden }, ctx) => {
  await eliminarPunto(ctx, asambleaId, orden);
  return done(asambleaId, true);
});

// ── Conducción ──

export const iniciarAsambleaAction = action({ perm: "asambleas.gestionar", schema: idSchema }, async ({ id }, ctx) => {
  await iniciarAsamblea(ctx, id);
  return done(id, true);
});

export const finalizarAsambleaAction = action({ perm: "asambleas.gestionar", schema: idSchema }, async ({ id }, ctx) => {
  await finalizarAsamblea(ctx, id);
  return done(id, true);
});

const cancelarSchema = z.object({ id: zs.id(), motivo: zs.text(5, 500) });

export const cancelarAsambleaAction = action({ perm: "asambleas.crear", schema: cancelarSchema }, async ({ id, motivo }, ctx) => {
  await cancelarAsamblea(ctx, id, motivo);
  return done(id, true);
});

// ── Asistencia ──

const propiaSchema = z.object({ asambleaId: zs.id(), tipo: z.enum(["PRESENCIAL", "VIRTUAL"]), codigo: zs.optText(60) });

export const registrarAsistenciaPropiaAction = action({ perm: "asambleas.ver", schema: propiaSchema }, async ({ asambleaId, ...input }, ctx) => {
  const r = await registrarAsistenciaPropia(ctx, asambleaId, input);
  return done(asambleaId, r);
});

const manualSchema = z.object({ asambleaId: zs.id(), unidadId: zs.id(), tipo: z.enum(["PRESENCIAL", "VIRTUAL", "PODER"]), personaNombre: zs.optText(120) });

export const registrarAsistenciaManualAction = action({ perm: ["asambleas.asistencia", "asambleas.gestionar"], schema: manualSchema }, async (input, ctx) => {
  const q = await registrarAsistenciaManual(ctx, input);
  return done(input.asambleaId, { porcentaje: q.porcentaje });
});

const salidaSchema = z.object({ asambleaId: zs.id(), unidadId: zs.id() });

export const registrarSalidaAction = action({ perm: ["asambleas.asistencia", "asambleas.gestionar"], schema: salidaSchema }, async ({ asambleaId, unidadId }, ctx) => {
  await registrarSalida(ctx, asambleaId, unidadId);
  return done(asambleaId, true);
});

// ── Poderes ──

const poderSchema = z.object({
  asambleaId: zs.id(),
  unidadId: zs.id(),
  apoderadoNombre: zs.text(3, 120),
  apoderadoDocumento: zs.optText(20),
  apoderadoEmail: zs.optEmail(),
  documentoUrl: zs.optText(500),
});

export const registrarPoderAction = action({ perm: "asambleas.ver", schema: poderSchema }, async (input, ctx) => {
  const p = await registrarPoder(ctx, input, { esAdmin: can(ctx, "asambleas.poderes") });
  return done(input.asambleaId, { id: p.id });
});

const decidirSchema = z.object({ id: zs.id(), asambleaId: zs.id(), estado: z.enum(["APROBADO", "RECHAZADO"]) });

export const decidirPoderAction = action({ perm: ["asambleas.poderes", "asambleas.gestionar"], schema: decidirSchema }, async ({ id, asambleaId, estado }, ctx) => {
  await decidirPoder(ctx, id, estado);
  return done(asambleaId, true);
});

// ── Acta ──

export const generarActaAction = action({ perm: "asambleas.gestionar", schema: idSchema }, async ({ id }, ctx) => {
  const texto = await generarTextoActa(ctx, id);
  return { texto };
});

const actaSchema = z.object({ asambleaId: zs.id(), actaTexto: zs.text(20, 100_000), presidenteNombre: zs.optText(120), secretarioNombre: zs.optText(120) });

export const guardarActaAction = action({ perm: "asambleas.gestionar", schema: actaSchema }, async (input, ctx) => {
  await guardarActa(ctx, input);
  return done(input.asambleaId, true);
});

const firmaSchema = z.object({ asambleaId: zs.id(), rol: z.enum(["PRESIDENTE", "SECRETARIO"]), nombre: zs.text(3, 120), firma: z.string().min(50).max(400_000) });

export const firmarActaAction = action({ perm: "asambleas.gestionar", schema: firmaSchema }, async (input, ctx) => {
  await firmarActa(ctx, input);
  return done(input.asambleaId, true);
});

export const publicarActaAction = action({ perm: "asambleas.gestionar", schema: idSchema }, async ({ id }, ctx) => {
  const r = await publicarActa(ctx, id);
  revalidatePath("/documentos", "layout");
  return done(id, r);
});

// ── Compromisos y cuotas extraordinarias ──

const compromisoSchema = z.object({ asambleaId: zs.id(), tarea: zs.text(3, 300), responsable: zs.text(2, 120), fecha: zs.optText(10) });

export const agregarCompromisoAction = action({ perm: "asambleas.gestionar", schema: compromisoSchema }, async ({ asambleaId, tarea, responsable, fecha }, ctx) => {
  await agregarCompromiso(ctx, asambleaId, { tarea, responsable, fecha: fecha ?? null });
  return done(asambleaId, true);
});

const estadoCompSchema = z.object({ asambleaId: zs.id(), compromisoId: zs.id(), estado: z.enum(["PENDIENTE", "EN_CURSO", "CUMPLIDO", "ELIMINAR"]) });

export const estadoCompromisoAction = action({ perm: "asambleas.gestionar", schema: estadoCompSchema }, async ({ asambleaId, compromisoId, estado }, ctx) => {
  await cambiarEstadoCompromiso(ctx, asambleaId, compromisoId, estado);
  return done(asambleaId, true);
});

const cuotaSchema = z.object({ asambleaId: zs.id(), cuotaExtraordinariaId: zs.id() });

export const vincularCuotaAction = action({ perm: "asambleas.gestionar", schema: cuotaSchema }, async ({ asambleaId, cuotaExtraordinariaId }, ctx) => {
  await vincularCuotaExtraordinaria(ctx, asambleaId, cuotaExtraordinariaId);
  return done(asambleaId, true);
});
