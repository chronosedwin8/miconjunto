"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { zs } from "@/lib/validation";
import { parseLocal } from "@/lib/format";
import {
  aprobarReserva,
  bloquearFestivos,
  calificarReserva,
  cancelarReserva,
  checkIn,
  checkOut,
  crearBloqueo,
  crearReserva,
  eliminarBloqueo,
  eliminarRegla,
  guardarRegla,
  marcarNoShow,
  rechazarReserva,
} from "@/lib/reservas/service";
import { festivosColombia } from "@/lib/reservas/reglas";

const done = <T>(r: T) => {
  revalidatePath("/reservas", "layout");
  return r;
};

const fechaIso = z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), "Fecha no válida");

export const crearReservaAction = action(
  {
    perm: "reservas.crear",
    schema: z.object({ zonaId: zs.id(), unidadId: zs.optId(), inicio: fechaIso, duracionMin: zs.int(15, 1440), asistentes: zs.int(1, 1000), motivo: zs.optText(300) }),
  },
  async (input, ctx) => {
    const inicio = new Date(input.inicio);
    const r = await crearReserva(ctx, { zonaId: input.zonaId, unidadId: input.unidadId, inicio, fin: new Date(inicio.getTime() + input.duracionMin * 60_000), asistentes: input.asistentes, motivo: input.motivo });
    return done({ id: r.reserva.id, estado: r.reserva.estado, enlacePago: r.enlacePago, totalAPagar: r.valores.totalAPagar });
  },
);

export const cancelarReservaAction = action(
  { perm: ["reservas.crear", "reservas.cancelar_todas"], schema: z.object({ id: zs.id(), motivo: zs.optText(300) }) },
  async ({ id, motivo }, ctx) => {
    const r = await cancelarReserva(ctx, id, motivo);
    return done({ id, politica: r.politica.tipo });
  },
);

export const aprobarReservaAction = action({ perm: "reservas.aprobar", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => done({ id: (await aprobarReserva(ctx, id)).id }));

export const rechazarReservaAction = action(
  { perm: "reservas.aprobar", schema: z.object({ id: zs.id(), motivo: zs.text(3, 300) }) },
  async ({ id, motivo }, ctx) => done({ id: (await rechazarReserva(ctx, id, motivo)).reserva.id }),
);

const acta = { id: zs.id(), items: zs.list(), checklist: zs.list(), observaciones: zs.optText(1000), fotos: zs.list().optional() };

export const checkInAction = action({ perm: "reservas.checkin", schema: z.object(acta) }, async ({ id, ...a }, ctx) => done({ id: (await checkIn(ctx, id, a)).id }));

export const checkOutAction = action(
  { perm: "reservas.checkin", schema: z.object({ ...acta, danos: zs.bool(), descripcionDano: zs.optText(1000), proponerMulta: zs.bool(), valorMulta: zs.optMoney() }) },
  async ({ id, ...a }, ctx) => {
    const r = await checkOut(ctx, id, a);
    return done({ id, ticketId: r.ticketId, multaId: r.multaId });
  },
);

export const noShowAction = action({ perm: "reservas.checkin", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => done({ id: (await marcarNoShow(ctx, id)).id }));

export const calificarAction = action(
  { perm: "reservas.ver", schema: z.object({ id: zs.id(), calificacion: zs.int(1, 5), comentario: zs.optText(500) }) },
  async ({ id, calificacion, comentario }, ctx) => done({ id: (await calificarReserva(ctx, id, calificacion, comentario)).id }),
);

const TIPOS_BLOQUEO = ["MANTENIMIENTO", "EVENTO", "FESTIVO", "OTRO"] as const;

export const crearBloqueoAction = action(
  {
    perm: "reservas.bloquear",
    schema: z.object({ zonaIds: zs.list(), desde: zs.text(10, 16), hasta: zs.text(10, 16), motivo: zs.text(3, 200), tipo: z.enum(TIPOS_BLOQUEO), cancelarAfectadas: zs.bool() }),
  },
  async (input, ctx) => {
    const inicio = parseLocal(input.desde);
    // Fecha sin hora en "hasta" = hasta el final de ese día
    const fin = input.hasta.length === 10 ? new Date(parseLocal(input.hasta).getTime() + 86_400_000) : parseLocal(input.hasta);
    return done(await crearBloqueo(ctx, { zonaIds: input.zonaIds, inicio, fin, motivo: input.motivo, tipo: input.tipo, cancelarAfectadas: input.cancelarAfectadas }));
  },
);

export const eliminarBloqueoAction = action({ perm: "reservas.bloquear", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => done(await eliminarBloqueo(ctx, id)));

export const bloquearFestivosAction = action(
  { perm: "reservas.bloquear", schema: z.object({ zonaIds: zs.list(), anio: zs.int(2020, 2100) }) },
  async ({ zonaIds, anio }, ctx) => {
    if (!zonaIds.length) throw new AppError("Selecciona al menos una zona.");
    return done({ creados: await bloquearFestivos(ctx, zonaIds, anio, festivosColombia(anio)) });
  },
);

const TIPOS_REGLA = ["SOLO_FINES_SEMANA", "UN_TURNO_POR_DIA", "DIAS_PERMITIDOS", "MAX_ASISTENTES"] as const;

export const guardarReglaAction = action(
  { perm: ["reservas.bloquear", "zonas.editar"], schema: z.object({ zonaId: zs.id(), tipo: z.enum(TIPOS_REGLA), dias: zs.list().optional(), max: zs.optInt(), descripcion: zs.optText(200) }) },
  async ({ zonaId, tipo, dias, max, descripcion }, ctx) => {
    const valor: Record<string, unknown> = {};
    if (tipo === "DIAS_PERMITIDOS") {
      const d = (dias ?? []).map(Number).filter((x) => x >= 0 && x <= 6);
      if (!d.length) throw new AppError("Elige al menos un día.", 400, { dias: "Elige al menos un día" });
      valor.dias = d.sort();
    }
    if (tipo === "MAX_ASISTENTES") {
      if (!max || max < 1) throw new AppError("Indica el máximo de asistentes.", 400, { max: "Obligatorio" });
      valor.max = max;
    }
    return done({ id: (await guardarRegla(ctx, { zonaId, tipo, valor, descripcion })).id });
  },
);

export const eliminarReglaAction = action({ perm: ["reservas.bloquear", "zonas.editar"], schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => done(await eliminarRegla(ctx, id)));
