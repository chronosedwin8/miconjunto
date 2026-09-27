"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { can } from "@/lib/permisos";
import { zs } from "@/lib/validation";
import {
  eliminarRegistro,
  eliminarTorre,
  eliminarUnidad,
  generarUnidadesTorre,
  guardarBodega,
  guardarParqueadero,
  guardarTorre,
  guardarUnidad,
  guardarZona,
  recalcularCuotas,
} from "@/lib/conjunto/service";

const done = <T>(r: T) => {
  revalidatePath("/conjunto", "layout");
  return r;
};

export const guardarTorreAction = action(
  {
    perm: ["conjunto.crear", "conjunto.editar"],
    schema: z.object({ id: zs.optId(), nombre: zs.text(1, 60), pisos: zs.int(1, 80), unidadesPorPiso: zs.optInt(), ascensores: zs.bool(), notas: zs.optText() }),
  },
  async (input, ctx) => done(await guardarTorre(ctx, input)),
);

export const eliminarTorreAction = action({ perm: "conjunto.eliminar", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => done(await eliminarTorre(ctx, id)));

export const generarUnidadesAction = action(
  {
    perm: "conjunto.crear",
    schema: z.object({ torreId: zs.id(), desdePiso: zs.int(1, 80), hastaPiso: zs.int(1, 80), porPiso: zs.int(1, 30), area: zs.number(1), prefijo: zs.optText(10) }),
  },
  async ({ torreId, prefijo, ...opts }, ctx) => done({ creadas: await generarUnidadesTorre(ctx, torreId, { ...opts, prefijo: prefijo ?? undefined }) }),
);

const TIPOS_UNIDAD = ["APARTAMENTO", "CASA", "LOCAL", "OFICINA", "DEPOSITO", "PARQUEADERO"] as const;
const OCUPACION = ["PROPIETARIO_OCUPA", "ARRENDADA", "AIRBNB_O_SIMILAR", "DESOCUPADA", "EN_VENTA"] as const;

export const guardarUnidadAction = action(
  {
    perm: ["conjunto.crear", "conjunto.editar"],
    schema: z.object({
      id: zs.optId(),
      torreId: zs.optId(),
      codigo: zs.text(1, 30),
      tipo: z.enum(TIPOS_UNIDAD),
      piso: zs.optInt(),
      areaPrivada: zs.optNumber(),
      areaConstruida: zs.optNumber(),
      coeficiente: zs.optNumber(),
      motivoCambioCoeficiente: zs.optText(300),
      matriculaInmobiliaria: zs.optText(40),
      numeroCatastral: zs.optText(40),
      estrato: zs.optInt(),
      habitaciones: zs.optInt(),
      banos: zs.optInt(),
      balconTerraza: zs.bool(),
      estadoOcupacion: z.enum(OCUPACION),
      plataformaRentaCorta: zs.optText(40),
      registroRnt: zs.optText(40),
      cuotaAdministracion: zs.optMoney(),
      notasEstructura: zs.optText(),
      medidores: z.object({ agua: zs.optText(40), luz: zs.optText(40), gas: zs.optText(40) }).partial().optional(),
      tienePersonaMovilidadReducida: zs.bool(),
      requiereAsistenciaEvacuacion: zs.bool(),
    }),
  },
  async (input, ctx) => {
    const medidores = input.medidores ? (Object.fromEntries(Object.entries(input.medidores).filter(([, v]) => v)) as Record<string, string>) : undefined;
    const u = await guardarUnidad(ctx, { ...input, coeficiente: input.coeficiente ?? undefined, cuotaAdministracion: input.cuotaAdministracion ?? undefined, medidores }, can(ctx, "conjunto.coeficientes"));
    return done({ id: u.id });
  },
);

export const eliminarUnidadAction = action({ perm: "conjunto.eliminar", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => done(await eliminarUnidad(ctx, id)));

export const recalcularCuotasAction = action(
  { perm: "conjunto.coeficientes", schema: z.object({ presupuestoMensual: zs.money(1) }) },
  async ({ presupuestoMensual }, ctx) => {
    const cfg = (await ctx.db.conjunto.findUnique({ where: { id: ctx.conjuntoId } }))!.config as Record<string, unknown>;
    await ctx.db.conjunto.update({
      where: { id: ctx.conjuntoId },
      data: { config: { ...cfg, cartera: { ...((cfg.cartera as object) ?? {}), presupuestoMensual, calculoCuota: "COEFICIENTE" } } },
    });
    return done({ actualizadas: await recalcularCuotas(ctx, presupuestoMensual) });
  },
);

export const guardarParqueaderoAction = action(
  {
    perm: ["conjunto.crear", "conjunto.editar"],
    schema: z.object({
      id: zs.optId(),
      codigo: zs.text(1, 20),
      tipo: z.enum(["PRIVADO", "COMUN", "VISITANTES", "MOTO", "BICICLETA", "DISCAPACIDAD"]),
      ubicacion: zs.optText(80),
      unidadId: zs.optId(),
      estado: z.enum(["DISPONIBLE", "ASIGNADO", "OCUPADO", "FUERA_SERVICIO"]),
      tarifaHora: zs.optMoney(),
      tarifaDia: zs.optMoney(),
      notas: zs.optText(),
    }),
  },
  async (input, ctx) => done(await guardarParqueadero(ctx, input)),
);

export const guardarBodegaAction = action(
  {
    perm: ["conjunto.crear", "conjunto.editar"],
    schema: z.object({
      id: zs.optId(),
      codigo: zs.text(1, 20),
      ubicacion: zs.optText(80),
      area: zs.optNumber(),
      unidadId: zs.optId(),
      estado: z.enum(["DISPONIBLE", "ASIGNADO", "OCUPADO", "FUERA_SERVICIO"]),
      notas: zs.optText(),
    }),
  },
  async (input, ctx) => done(await guardarBodega(ctx, input)),
);

const hora = z.preprocess((v) => (v === "" ? null : v), z.string().regex(/^\d{2}:\d{2}$/).nullable().optional());

export const guardarZonaAction = action(
  {
    perm: ["zonas.crear", "zonas.editar"],
    schema: z.object({
      id: zs.optId(),
      nombre: zs.text(1, 80),
      tipo: zs.optText(60),
      categoria: z.enum(["SALON", "PISCINA", "GIMNASIO", "BBQ", "CANCHA", "JUEGOS", "TERRAZA", "SALA_JUNTAS", "COWORKING", "OTRA"]),
      descripcion: zs.optText(),
      fotos: zs.list().optional(),
      capacidad: zs.optInt(),
      horario: z.record(z.string(), z.object({ abre: hora, cierra: hora, cerrado: zs.bool().optional() })).optional(),
      reservable: zs.bool(),
      requiereAprobacion: zs.bool(),
      tarifa: zs.money(),
      deposito: zs.money(),
      duracionMinimaMin: zs.int(15, 1440),
      duracionMaximaMin: zs.int(15, 1440),
      anticipacionMinimaHoras: zs.int(0, 720),
      anticipacionMaximaDias: zs.int(1, 365),
      maxReservasMesUnidad: zs.int(1, 100),
      reglasUso: zs.optText(),
      bloqueoPorMora: zs.bool(),
      gravaIva: zs.bool(),
      tarifaIva: zs.number(0),
      generaFactura: zs.bool(),
      politicaCancelacion: zs.optText(),
      horasCancelacionReembolso: zs.int(0, 720),
      estado: z.enum(["ACTIVA", "MANTENIMIENTO", "INACTIVA"]),
    }),
  },
  async ({ horario, ...input }, ctx) => {
    const h: Record<string, { abre: string; cierra: string } | null> = {};
    for (let d = 0; d <= 6; d++) {
      const x = horario?.[String(d)];
      h[String(d)] = x && !x.cerrado && x.abre && x.cierra ? { abre: x.abre, cierra: x.cierra } : null;
    }
    const z = await guardarZona(ctx, { ...input, fotos: input.fotos ?? [], horario: h });
    revalidatePath("/reservas", "layout");
    return done({ id: z.id });
  },
);

export const eliminarAction = action(
  { perm: ["conjunto.eliminar", "zonas.eliminar"], schema: z.object({ modelo: z.enum(["parqueadero", "bodega", "zonaComun"]), id: zs.id() }) },
  async ({ modelo, id }, ctx) => done(await eliminarRegistro(ctx, modelo, id)),
);
