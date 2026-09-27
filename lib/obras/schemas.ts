import { z } from "zod";
import { zs } from "@/lib/validation";
import { parseEnseres } from "./reglas";

const hora = z.string().regex(/^\d{2}:\d{2}$/, "Hora no válida (HH:MM)");

/** Contratistas llegan del formulario como { "0": {...}, "1": {...} } o como arreglo. */
const aArreglo = (v: unknown) => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v as Record<string, unknown>) : []);
const contratista = z.object({
  nombre: zs.text(3, 120),
  documento: zs.text(4, 30),
  seguridadSocialUrl: zs.optText(500),
  vence: zs.optText(10),
});
const contratistas = z.preprocess(
  (v) => aArreglo(v).filter((c) => c && typeof c === "object" && Object.values(c as Record<string, unknown>).some((x) => typeof x === "string" && x.trim() !== "")),
  z.array(contratista).max(30),
);

export const obraSchema = z.object({
  unidadId: zs.id(),
  descripcion: zs.text(10, 4000),
  tipo: zs.optText(40),
  fechaInicio: zs.date(),
  fechaFin: zs.date(),
  horario: zs.optText(200),
  deposito: zs.optMoney(),
  contratistas: contratistas.optional(),
});

export const contratistasSchema = z.object({ id: zs.id(), contratistas });

export const decidirObraSchema = z.object({
  id: zs.id(),
  aprobar: zs.bool(),
  observaciones: zs.optText(2000),
  deposito: zs.optMoney(),
  horario: zs.optText(200),
});

export const estadoObraSchema = z.object({ id: zs.id(), estado: z.enum(["EN_CURSO", "FINALIZADA", "CANCELADA"]), notas: zs.optText(2000) });

const enseres = z.preprocess((v) => (typeof v === "string" ? parseEnseres(v) : Array.isArray(v) ? v : []), z.array(z.object({ descripcion: z.string().min(1).max(200), cantidad: z.number().int().min(1).max(999) })));

export const mudanzaSchema = z.object({
  unidadId: zs.id(),
  tipo: z.enum(["INGRESO", "SALIDA"]),
  fecha: zs.date(),
  horaInicio: hora,
  horaFin: hora,
  recurso: zs.optText(80),
  empresa: zs.optText(120),
  placaVehiculo: zs.optText(10),
  enseres: enseres.optional(),
  observaciones: zs.optText(2000),
});

export const decidirMudanzaSchema = z.object({ id: zs.id(), aprobar: zs.bool(), observaciones: zs.optText(2000) });
export const estadoMudanzaSchema = z.object({ id: zs.id(), estado: z.enum(["EN_CURSO", "FINALIZADA", "CANCELADA"]) });
