"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { zs } from "@/lib/validation";
import {
  anularRegistro,
  ingresoFrecuente,
  ingresoPorAutorizacion,
  marcarListaNegra,
  quitarListaNegra,
  registrarIngreso,
  registrarSalida,
} from "@/lib/porteria/service";
import { crearSolicitud, descartarSolicitud, resolverSolicitudPorteria } from "@/lib/porteria/solicitudes";
import {
  abrirTurno,
  cerrarTurno,
  crearNovedad,
  crearTicketDeNovedad,
  devolverElemento,
  guardarElemento,
  ingresoContratista,
  prestarElemento,
} from "@/lib/porteria/turnos";
import { devolverPaquete, entregarPaquetes, recibirPaquete } from "@/lib/paqueteria/service";

const SUJETOS = ["VISITANTE", "RESIDENTE", "EMPLEADO", "VEHICULO", "PROVEEDOR", "DOMICILIARIO"] as const;
const TIPOS_VIS = ["VISITA", "DOMICILIO", "PROVEEDOR", "TECNICO", "TRANSPORTE", "CONTRATISTA", "OTRO"] as const;
const TIPOS_PAQ = ["SOBRE", "CAJA", "MERCADO", "DOMICILIO", "OTRO"] as const;
const TIPOS_NOV = ["RUIDO", "DANO", "EMERGENCIA", "INCIDENTE", "SEGURIDAD", "SERVICIOS", "OTRO"] as const;
const SEVERIDAD = ["BAJA", "MEDIA", "ALTA", "CRITICA"] as const;

const refrescar = () => revalidatePath("/porteria", "layout");

// Checklist del turno: llega como objeto {"0": {...}, "1": {...}} desde el formulario.
const aLista = (v: unknown) => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : []);
const checklistSchema = z.preprocess(aLista, z.array(z.object({ elemento: zs.text(1, 120), ok: zs.bool(), nota: zs.optText(300) })));
const idsSchema = z.preprocess((v) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(",").filter(Boolean) : []), z.array(z.string().min(1)).min(1, "Selecciona al menos un paquete"));

export const ingresoCodigoAction = action(
  {
    perm: "porteria.registrar",
    schema: z.object({ codigo: zs.optText(6), token: zs.optText(80), fotoUrl: zs.optText(300), parqueaderoId: zs.optId(), placa: zs.optText(10), clienteId: zs.optText(64) }),
  },
  async (input, ctx) => {
    const r = await ingresoPorAutorizacion(ctx, input);
    refrescar();
    return { id: r.id, nombre: r.nombre };
  },
);

export const ingresoManualAction = action(
  {
    perm: "porteria.registrar",
    schema: z.object({
      sujeto: z.enum(SUJETOS),
      tipoVisitante: z.enum(TIPOS_VIS).optional(),
      nombre: zs.text(2, 120),
      documento: zs.optText(20),
      empresa: zs.optText(80),
      unidadId: zs.optId(),
      placa: zs.optText(10),
      parqueaderoId: zs.optId(),
      fotoUrl: zs.optText(300),
      observaciones: zs.optText(500),
      visitanteId: zs.optId(),
      clienteId: zs.optText(64),
    }),
  },
  async (input, ctx) => {
    const r = await registrarIngreso(ctx, { ...input, medio: "MANUAL" });
    refrescar();
    return { id: r.id, nombre: r.nombre };
  },
);

export const ingresoFrecuenteAction = action(
  { perm: "porteria.registrar", schema: z.object({ vinculoId: zs.id(), forzar: zs.bool().optional(), clienteId: zs.optText(64) }) },
  async (input, ctx) => {
    const r = await ingresoFrecuente(ctx, input);
    refrescar();
    return { id: r.id, nombre: r.nombre };
  },
);

export const ingresoContratistaAction = action(
  { perm: "porteria.registrar", schema: z.object({ obraId: zs.id(), indice: zs.int(0, 100) }) },
  async (input, ctx) => {
    const r = await ingresoContratista(ctx, input);
    refrescar();
    return { id: r.id, nombre: r.nombre };
  },
);

export const salidaAction = action(
  {
    perm: "porteria.registrar",
    schema: z.object({
      ingresoId: zs.optId(),
      nombre: zs.optText(120),
      placa: zs.optText(10),
      unidadId: zs.optId(),
      sujeto: z.enum(SUJETOS).optional(),
      cobro: z.enum(["UNIDAD", "VISITANTE", "NINGUNO"]).optional(),
      observaciones: zs.optText(500),
      clienteId: zs.optText(64),
    }),
  },
  async (input, ctx) => {
    const r = await registrarSalida(ctx, input);
    refrescar();
    return { id: r.registro.id, nombre: r.registro.nombre, permanenciaMin: r.permanenciaMin, cobro: r.cobro };
  },
);

export const anularRegistroAction = action(
  { perm: "porteria.anular", schema: z.object({ id: zs.id(), motivo: zs.text(5, 300) }) },
  async (input, ctx) => {
    const r = await anularRegistro(ctx, input);
    refrescar();
    return { id: r.id };
  },
);

// ── Autorización en tiempo real ──
export const crearSolicitudAction = action(
  {
    perm: "porteria.registrar",
    schema: z.object({ unidadId: zs.id(), visitanteNombre: zs.text(2, 120), visitanteDocumento: zs.optText(20), tipo: z.enum(TIPOS_VIS).optional(), fotoUrl: zs.optText(300), placa: zs.optText(10) }),
  },
  async (input, ctx) => {
    const s = await crearSolicitud(ctx, input);
    refrescar();
    return { id: s.id, destinatarios: s.destinatarios };
  },
);

export const resolverSolicitudAction = action(
  {
    perm: "porteria.registrar",
    schema: z.object({ id: zs.id(), telefonica: z.enum(["AUTORIZADA", "RECHAZADA"]).optional(), parqueaderoId: zs.optId(), observaciones: zs.optText(300) }),
  },
  async (input, ctx) => {
    const r = await resolverSolicitudPorteria(ctx, input);
    refrescar();
    return { autoriza: r.autoriza, registroId: r.registroId };
  },
);

export const descartarSolicitudAction = action({ perm: "porteria.registrar", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => {
  await descartarSolicitud(ctx, id);
  refrescar();
  return true;
});

// ── Lista negra ──
export const listaNegraAction = action(
  {
    perm: "porteria.lista_negra",
    schema: z.object({ visitanteId: zs.optId(), nombre: zs.text(2, 120), documento: zs.optText(20), motivo: zs.text(5, 500), fotoUrl: zs.optText(300) }),
  },
  async (input, ctx) => {
    const v = await marcarListaNegra(ctx, input);
    refrescar();
    return { id: v.id };
  },
);

export const quitarListaNegraAction = action({ perm: "porteria.lista_negra", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => {
  await quitarListaNegra(ctx, id);
  refrescar();
  return true;
});

// ── Turnos ──
export const abrirTurnoAction = action(
  { perm: "porteria.turnos", schema: z.object({ checklist: checklistSchema, novedades: zs.optText(2000), firma: zs.text(20, 400_000) }) },
  async (input, ctx) => {
    const r = await abrirTurno(ctx, input);
    refrescar();
    return { id: r.turno.id, faltantes: r.faltantes };
  },
);

export const cerrarTurnoAction = action(
  { perm: "porteria.turnos", schema: z.object({ checklist: checklistSchema, novedades: zs.optText(2000), firma: zs.text(20, 400_000) }) },
  async (input, ctx) => {
    const t = await cerrarTurno(ctx, input);
    refrescar();
    return { id: t.id };
  },
);

// ── Novedades ──
export const novedadAction = action(
  {
    perm: "porteria.novedades",
    schema: z.object({
      tipo: z.enum(TIPOS_NOV),
      severidad: z.enum(SEVERIDAD),
      descripcion: zs.text(3, 3000),
      fotos: zs.list().optional(),
      unidadId: zs.optId(),
      crearTicket: zs.bool().optional(),
      clienteId: zs.optText(64),
    }),
  },
  async (input, ctx) => {
    const n = await crearNovedad(ctx, input);
    refrescar();
    return { id: n.id, ticketId: n.ticketId };
  },
);

export const ticketNovedadAction = action({ perm: ["porteria.novedades", "tickets.crear"], schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => {
  const t = await crearTicketDeNovedad(ctx, id);
  refrescar();
  return { id: t.id, radicado: t.radicado };
});

// ── Paquetería ──
export const recibirPaqueteAction = action(
  {
    perm: "paqueteria.recibir",
    schema: z.object({
      unidadId: zs.id(),
      tipo: z.enum(TIPOS_PAQ),
      destinatario: zs.optText(120),
      transportadora: zs.optText(80),
      guia: zs.optText(60),
      fotoUrl: zs.optText(300),
      fotoGuiaUrl: zs.optText(300),
      observaciones: zs.optText(500),
      clienteId: zs.optText(64),
    }),
  },
  async (input, ctx) => {
    const p = await recibirPaquete(ctx, input);
    refrescar();
    revalidatePath("/paquetes");
    return { id: p.id };
  },
);

export const entregarPaqueteAction = action(
  {
    perm: "paqueteria.entregar",
    schema: z.object({ paqueteIds: idsSchema, personaId: zs.id(), firma: zs.optText(400_000), fotoEntregaUrl: zs.optText(300), observaciones: zs.optText(500) }),
  },
  async (input, ctx) => {
    const r = await entregarPaquetes(ctx, input);
    refrescar();
    revalidatePath("/paquetes");
    return r;
  },
);

export const devolverPaqueteAction = action({ perm: "paqueteria.entregar", schema: z.object({ id: zs.id(), motivo: zs.text(3, 300) }) }, async (input, ctx) => {
  await devolverPaquete(ctx, input);
  refrescar();
  return true;
});

// ── Llaves y elementos ──
export const guardarElementoAction = action(
  {
    perm: "porteria.llaves",
    schema: z.object({
      id: zs.optId(),
      nombre: zs.text(2, 80),
      tipo: z.enum(["LLAVE", "CONTROL", "TARJETA", "RADIO", "OTRO"]),
      codigo: zs.optText(40),
      ubicacion: zs.optText(80),
      notas: zs.optText(300),
      estado: z.enum(["DISPONIBLE", "PRESTADO", "PERDIDO"]).optional(),
    }),
  },
  async (input, ctx) => {
    const e = await guardarElemento(ctx, input);
    refrescar();
    return { id: e.id };
  },
);

export const prestarElementoAction = action(
  { perm: "porteria.llaves", schema: z.object({ elementoId: zs.id(), prestadoA: zs.text(2, 120), unidadId: zs.optId(), observaciones: zs.optText(300) }) },
  async (input, ctx) => {
    const p = await prestarElemento(ctx, input);
    refrescar();
    return { id: p.id };
  },
);

export const devolverElementoAction = action(
  { perm: "porteria.llaves", schema: z.object({ prestamoId: zs.id(), observaciones: zs.optText(300), perdido: zs.bool().optional() }) },
  async (input, ctx) => {
    await devolverElemento(ctx, input);
    refrescar();
    return true;
  },
);
