import type { Prisma } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { prisma } from "@/lib/db";
import { PASOS_MI_HOGAR, VINCULOS_AUTORIZADOS, VINCULOS_PERSONAL } from "./calculos";
import { miPersona } from "./service";

/**
 * Panel guiado del propietario/residente. El avance y los borradores de cada paso se guardan en el servidor
 * (`BorradorFormulario`), así el usuario puede continuar desde otro dispositivo.
 */

const claveProgreso = (unidadId: string) => `mi-hogar:progreso:${unidadId}`;
export const claveBorrador = (paso: number, unidadId: string) => `mi-hogar:paso${paso}:${unidadId}`;

export async function leerBorrador<T = Record<string, unknown>>(ctx: Ctx, clave: string): Promise<T | null> {
  const b = await ctx.db.borradorFormulario.findFirst({ where: { usuarioId: ctx.userId, clave } });
  return (b?.datos as T | undefined) ?? null;
}

export async function guardarBorrador(ctx: Ctx, clave: string, datos: Record<string, unknown>) {
  const existe = await ctx.db.borradorFormulario.findFirst({ where: { usuarioId: ctx.userId, clave } });
  if (existe) await ctx.db.borradorFormulario.update({ where: { id: existe.id }, data: { datos: datos as Prisma.InputJsonValue } });
  else await ctx.db.borradorFormulario.create({ data: { conjuntoId: ctx.conjuntoId, usuarioId: ctx.userId, clave, datos: datos as Prisma.InputJsonValue } });
}

export async function borrarBorrador(ctx: Ctx, clave: string) {
  // Borrado físico: un borrador no es información que deba conservarse.
  await ctx.db.borradorFormulario.deleteMany({ where: { usuarioId: ctx.userId, clave } });
}

export async function marcarPaso(ctx: Ctx, unidadId: string, paso: number) {
  const actual = (await leerBorrador<{ pasos?: number[] }>(ctx, claveProgreso(unidadId)))?.pasos ?? [];
  if (actual.includes(paso)) return actual;
  const pasos = [...actual, paso].sort((a, b) => a - b);
  await guardarBorrador(ctx, claveProgreso(unidadId), { pasos });
  return pasos;
}

export type EstadoPanel = {
  completados: number[];
  resumen: Record<number, string>;
  porcentaje: number;
  politicaVigente: boolean;
};

/** Avance del panel para una unidad: pasos marcados + detección automática de pasos ya cubiertos. */
export async function estadoPanel(ctx: Ctx, unidadId: string): Promise<EstadoPanel> {
  const [marcados, persona, vinculos, vehiculos, mascotas, usuario] = await Promise.all([
    leerBorrador<{ pasos?: number[] }>(ctx, claveProgreso(unidadId)),
    miPersona(ctx),
    ctx.db.vinculoUnidad.findMany({ where: { unidadId, estado: { in: ["ACTIVO", "PENDIENTE_APROBACION"] }, persona: { anonimizada: false, deletedAt: null } }, select: { tipo: true, persona: { select: { contactoEmergenciaTelefono: true } } } }),
    ctx.db.vehiculo.count({ where: { unidadId, activo: true } }),
    ctx.db.mascota.count({ where: { unidadId, activo: true } }),
    prisma.usuario.findUnique({ where: { id: ctx.userId }, select: { politicaVersion: true } }),
  ]);
  const cfg = conjuntoConfig(ctx);
  const politicaVigente = !!usuario?.politicaVersion && usuario.politicaVersion === cfg.datos.politicaVersion;
  const set = new Set(marcados?.pasos ?? []);
  if (persona && !persona.numeroDocumento.startsWith("PEND-") && persona.telefono) set.add(1);
  if (politicaVigente && persona?.consentimientoDatosEn) set.add(9);
  const personal = vinculos.filter((v) => VINCULOS_PERSONAL.includes(v.tipo)).length;
  const autorizados = vinculos.filter((v) => VINCULOS_AUTORIZADOS.includes(v.tipo)).length;
  const ocupantes = vinculos.length - personal - autorizados;
  const resumen: Record<number, string> = {
    1: persona ? `${persona.nombres} ${persona.apellidos}` : "Sin registrar",
    3: `${ocupantes} ${ocupantes === 1 ? "persona" : "personas"}`,
    4: personal ? `${personal} registrado(s)` : "Ninguno",
    5: vehiculos ? `${vehiculos} vehículo(s)` : "Ninguno",
    6: mascotas ? `${mascotas} mascota(s)` : "Ninguna",
    7: vinculos.some((v) => v.persona.contactoEmergenciaTelefono) ? "Con contacto de emergencia" : "Sin contacto de emergencia",
    8: autorizados ? `${autorizados} autorizado(s)` : "Ninguno",
    9: politicaVigente ? `Aceptada (versión ${cfg.datos.politicaVersion})` : "Pendiente",
  };
  const completados = [...set].filter((n) => n >= 1 && n <= PASOS_MI_HOGAR.length).sort((a, b) => a - b);
  return { completados, resumen, porcentaje: Math.round((completados.length / PASOS_MI_HOGAR.length) * 100), politicaVigente };
}
