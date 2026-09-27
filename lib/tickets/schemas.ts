import { z } from "zod";
import { zs } from "@/lib/validation";
import { ESTADOS_TICKET, PRIORIDADES, TIPOS_TICKET } from "./reglas";

/** Esquemas compartidos por Server Actions y API REST (aceptan strings de formulario o JSON). */
const adjuntos = zs.list().optional();

export const crearTicketSchema = z.object({
  tipo: z.enum(TIPOS_TICKET, { error: "Selecciona el tipo de solicitud" }),
  titulo: zs.optText(140),
  descripcion: zs.text(5, 4000),
  adjuntos,
  unidadId: zs.optId(),
  zonaId: zs.optId(),
  activoId: zs.optId(),
  ubicacion: zs.optText(200),
  prioridad: z.preprocess((v) => (v === "" ? null : v), z.enum(PRIORIDADES).nullable().optional()),
  urgente: zs.bool().optional(),
});

export const cambiarEstadoSchema = z.object({
  id: zs.id(),
  estado: z.enum(ESTADOS_TICKET),
  nota: zs.optText(4000),
  adjuntos,
});

export const comentarSchema = z.object({
  id: zs.id(),
  contenido: zs.text(1, 4000),
  interno: zs.bool().optional(),
  adjuntos,
});

export const asignarSchema = z.object({
  id: zs.id(),
  asignadoAId: zs.optId(),
  proveedorId: zs.optId(),
  nota: zs.optText(500),
});

export const prioridadSchema = z.object({ id: zs.id(), prioridad: z.enum(PRIORIDADES) });

export const calificarSchema = z.object({ id: zs.id(), calificacion: zs.int(1, 5), comentario: zs.optText(1000) });

export const reabrirSchema = z.object({ id: zs.id(), motivo: zs.text(5, 1000) });

export const ordenSchema = z.object({
  id: zs.id(),
  titulo: zs.optText(140),
  descripcion: zs.optText(4000),
  fechaProgramada: zs.date(),
  asignadoAId: zs.optId(),
  proveedorId: zs.optId(),
});

export const plantillaSchema = z.object({
  id: zs.optId(),
  titulo: zs.text(2, 120),
  contenido: zs.text(5, 4000),
  tipoTicket: z.preprocess((v) => (v === "" ? null : v), z.enum(TIPOS_TICKET).nullable().optional()),
});
