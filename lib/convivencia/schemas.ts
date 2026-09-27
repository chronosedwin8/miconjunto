import { z } from "zod";
import { zs } from "@/lib/validation";

const gravedad = z.enum(["LEVE", "MODERADA", "GRAVE"]);
const optGravedad = z.preprocess((v) => (v === "" ? null : v), gravedad.nullable().optional());

export const infraccionSchema = z.object({
  id: zs.optId(),
  codigo: zs.text(2, 20),
  nombre: zs.text(3, 150),
  descripcion: zs.optText(1000),
  valorSugerido: zs.money(),
  gravedad,
  articulo: zs.optText(200),
  activo: zs.bool(),
});

export const llamadoSchema = z.object({
  unidadId: zs.id(),
  personaId: zs.optId(),
  infraccionId: zs.optId(),
  motivo: zs.optText(200),
  descripcion: zs.text(10, 4000),
  evidencias: zs.list().optional(),
  gravedad: optGravedad,
});

export const respuestaSchema = z.object({ id: zs.id(), respuesta: zs.text(5, 4000) });
export const idSchema = z.object({ id: zs.id() });
export const cerrarLlamadoSchema = z.object({ id: zs.id(), nota: zs.optText(1000) });

export const multaSchema = z.object({
  unidadId: zs.id(),
  personaId: zs.optId(),
  infraccionId: zs.optId(),
  llamadoId: zs.optId(),
  descripcion: zs.text(10, 4000),
  evidencias: zs.list().optional(),
  valor: zs.optMoney(),
});

export const notificarSchema = z.object({ id: zs.id(), dias: zs.int(1, 30) });
export const descargosSchema = z.object({ id: zs.id(), descargos: zs.text(10, 6000) });
export const decidirSchema = z.object({
  id: zs.id(),
  decision: z.enum(["RATIFICADA", "REVOCADA"]),
  resolucion: zs.text(10, 6000),
  valor: zs.optMoney(),
});

export const incidenteSchema = z.object({ titulo: zs.text(5, 150), descripcion: zs.text(10, 4000), unidadesIds: zs.list() });
export const sesionSchema = z.object({ id: zs.id(), fecha: zs.date(), asistentes: zs.text(3, 500), notas: zs.text(5, 4000), compromisos: zs.optText(2000) });
export const estadoIncidenteSchema = z.object({ id: zs.id(), estado: z.enum(["ABIERTO", "EN_MEDIACION", "ACUERDO", "CERRADO", "ESCALADO"]), acuerdos: zs.optText(4000) });
