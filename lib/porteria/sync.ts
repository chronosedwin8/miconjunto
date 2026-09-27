import { z } from "zod";
import type { Ctx } from "@/lib/auth/context";
import { can, type PermKey } from "@/lib/permisos";
import { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { recibirPaquete } from "@/lib/paqueteria/service";
import { ingresoFrecuente, ingresoPorAutorizacion, registrarIngreso, registrarSalida } from "./service";
import { crearNovedad } from "./turnos";

/**
 * Sincronización de la cola offline de portería. Cada operación trae un `clienteId` (UUID generado en el
 * dispositivo) que es @unique en RegistroAcceso / Paquete / Novedad: reintentar la misma operación no duplica.
 */

const opt = z.string().trim().max(500).nullish().transform((v) => v || null);
const uuid = z.string().min(8).max(64);
const hora = z.string().max(40).nullish();
// Los formularios envían booleanos como texto ("true"/"false" o un arreglo con el oculto y el checkbox).
const boolish = z
  .preprocess((raw) => {
    const v = Array.isArray(raw) ? raw[raw.length - 1] : raw;
    return v === true || v === "true" || v === "on" || v === "1";
  }, z.boolean())
  .optional();

const SUJETOS = ["VISITANTE", "RESIDENTE", "EMPLEADO", "VEHICULO", "PROVEEDOR", "DOMICILIARIO"] as const;
const TIPOS_VIS = ["VISITA", "DOMICILIO", "PROVEEDOR", "TECNICO", "TRANSPORTE", "CONTRATISTA", "OTRO"] as const;

export const operacionSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("INGRESO_MANUAL"),
    clienteId: uuid,
    creadoEn: hora,
    payload: z.object({
      sujeto: z.enum(SUJETOS),
      nombre: z.string().trim().min(1).max(120),
      documento: opt,
      tipoVisitante: z.enum(TIPOS_VIS).nullish(),
      empresa: opt,
      unidadId: opt,
      placa: opt,
      parqueaderoId: opt,
      fotoUrl: opt,
      observaciones: opt,
      visitanteId: opt,
    }),
  }),
  z.object({
    tipo: z.literal("INGRESO_CODIGO"),
    clienteId: uuid,
    creadoEn: hora,
    payload: z.object({ codigo: opt, token: opt, fotoUrl: opt, parqueaderoId: opt, placa: opt }),
  }),
  z.object({
    tipo: z.literal("INGRESO_FRECUENTE"),
    clienteId: uuid,
    creadoEn: hora,
    payload: z.object({ vinculoId: z.string().min(1), forzar: boolish }),
  }),
  z.object({
    tipo: z.literal("SALIDA"),
    clienteId: uuid,
    creadoEn: hora,
    payload: z.object({ ingresoId: opt, nombre: opt, unidadId: opt, placa: opt, sujeto: z.enum(SUJETOS).nullish(), cobro: z.enum(["UNIDAD", "VISITANTE", "NINGUNO"]).nullish(), observaciones: opt }),
  }),
  z.object({
    tipo: z.literal("PAQUETE"),
    clienteId: uuid,
    creadoEn: hora,
    payload: z.object({
      unidadId: z.string().min(1),
      destinatario: opt,
      transportadora: opt,
      guia: opt,
      tipo: z.enum(["SOBRE", "CAJA", "MERCADO", "DOMICILIO", "OTRO"]),
      fotoUrl: opt,
      fotoGuiaUrl: opt,
      observaciones: opt,
    }),
  }),
  z.object({
    tipo: z.literal("NOVEDAD"),
    clienteId: uuid,
    creadoEn: hora,
    payload: z.object({
      tipo: z.enum(["RUIDO", "DANO", "EMERGENCIA", "INCIDENTE", "SEGURIDAD", "SERVICIOS", "OTRO"]),
      severidad: z.enum(["BAJA", "MEDIA", "ALTA", "CRITICA"]),
      descripcion: z.string().trim().min(3).max(3000),
      fotos: z.array(z.string()).max(10).optional(),
      unidadId: opt,
      crearTicket: boolish,
    }),
  }),
]);

export type Operacion = z.infer<typeof operacionSchema>;
export type ResultadoOperacion = { clienteId: string; ok: boolean; id?: string; error?: string; definitivo?: boolean };

const PERMISO: Record<Operacion["tipo"], PermKey> = {
  INGRESO_MANUAL: "porteria.registrar",
  INGRESO_CODIGO: "porteria.registrar",
  INGRESO_FRECUENTE: "porteria.registrar",
  SALIDA: "porteria.registrar",
  PAQUETE: "paqueteria.recibir",
  NOVEDAD: "porteria.novedades",
};

export async function procesarOperacion(ctx: Ctx, op: Operacion): Promise<{ id: string }> {
  const { clienteId, creadoEn } = op;
  switch (op.tipo) {
    case "INGRESO_MANUAL": {
      const p = op.payload;
      const r = await registrarIngreso(ctx, { ...p, clienteId, medio: "MANUAL", hora: creadoEn });
      return { id: r.id };
    }
    case "INGRESO_CODIGO": {
      const r = await ingresoPorAutorizacion(ctx, { ...op.payload, clienteId, hora: creadoEn });
      return { id: r.id };
    }
    case "INGRESO_FRECUENTE": {
      const r = await ingresoFrecuente(ctx, { ...op.payload, clienteId, hora: creadoEn });
      return { id: r.id };
    }
    case "SALIDA": {
      const r = await registrarSalida(ctx, { ...op.payload, clienteId, hora: creadoEn });
      return { id: r.registro.id };
    }
    case "PAQUETE": {
      const r = await recibirPaquete(ctx, { ...op.payload, clienteId, llegadaEn: creadoEn });
      return { id: r.id };
    }
    case "NOVEDAD": {
      const r = await crearNovedad(ctx, { ...op.payload, clienteId });
      return { id: r.id };
    }
  }
}

/** Procesa un lote en orden (los ingresos antes que sus salidas). Los errores de negocio son definitivos: no se reintentan. */
export async function sincronizar(ctx: Ctx, raw: unknown[]): Promise<ResultadoOperacion[]> {
  const out: ResultadoOperacion[] = [];
  for (const item of raw.slice(0, 200)) {
    const parsed = operacionSchema.safeParse(item);
    const clienteId = (item as { clienteId?: string })?.clienteId ?? "";
    if (!parsed.success) {
      out.push({ clienteId, ok: false, error: "Operación con datos no válidos.", definitivo: true });
      continue;
    }
    if (!can(ctx, PERMISO[parsed.data.tipo])) {
      out.push({ clienteId, ok: false, error: "Sin permiso para esta operación.", definitivo: true });
      continue;
    }
    try {
      const r = await procesarOperacion(ctx, parsed.data);
      out.push({ clienteId, ok: true, id: r.id });
    } catch (e) {
      // Errores de negocio (AppError) o de datos son definitivos; los inesperados se reintentan en la próxima sincronización.
      if (e instanceof AppError) out.push({ clienteId, ok: false, error: e.message, definitivo: true });
      else if (e instanceof Prisma.PrismaClientKnownRequestError) out.push({ clienteId, ok: false, error: "Datos no válidos o duplicados.", definitivo: true });
      else {
        console.error("[porteria/sync]", e);
        out.push({ clienteId, ok: false, error: "Error inesperado; se reintentará.", definitivo: false });
      }
    }
  }
  return out;
}
