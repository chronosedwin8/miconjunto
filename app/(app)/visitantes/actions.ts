"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { zs } from "@/lib/validation";
import { crearAutorizacion, revocarAutorizacion } from "@/lib/porteria/autorizaciones";
import { responderSolicitud } from "@/lib/porteria/solicitudes";
import { vigenciaDesdeFormulario } from "@/lib/porteria/vigencia";

const TIPOS_VIS = ["VISITA", "DOMICILIO", "PROVEEDOR", "TECNICO", "TRANSPORTE", "CONTRATISTA", "OTRO"] as const;
const diasSchema = z.preprocess((v) => (Array.isArray(v) ? v : v === undefined || v === "" ? [] : [v]), z.array(z.coerce.number().int().min(0).max(6)));
const horaSchema = z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().regex(/^\d{2}:\d{2}$/, "Hora no válida").nullable());

export const crearAutorizacionAction = action(
  {
    perm: "visitantes.autorizar",
    schema: z.object({
      unidadId: zs.id(),
      tipo: z.enum(TIPOS_VIS),
      nombreVisitante: zs.text(2, 120),
      documentoVisitante: zs.optText(20),
      cuando: z.enum(["HOY", "MANANA", "RANGO", "RECURRENTE"]),
      fechaInicio: zs.optText(20),
      fechaFin: zs.optText(20),
      hasta: zs.optText(10),
      diasSemana: diasSchema.optional(),
      horaInicio: horaSchema.optional(),
      horaFin: horaSchema.optional(),
      placa: zs.optText(10),
      usosPermitidos: zs.optInt(),
      observaciones: zs.optText(300),
      soporteSeguridadSocialUrl: zs.optText(300),
    }),
  },
  async (input, ctx) => {
    const v = vigenciaDesdeFormulario(input);
    if ("error" in v) throw new AppError(v.error, 400, { [v.campo]: v.error });
    const a = await crearAutorizacion(ctx, {
      ...input,
      fechaInicio: v.fechaInicio,
      fechaFin: v.fechaFin,
      recurrente: input.cuando === "RECURRENTE",
      diasSemana: input.diasSemana ?? [],
      horaInicio: input.horaInicio ?? null,
      horaFin: input.horaFin ?? null,
    });
    revalidatePath("/visitantes");
    return { id: a.id };
  },
);

export const revocarAutorizacionAction = action({ perm: "visitantes.autorizar", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => {
  await revocarAutorizacion(ctx, id);
  revalidatePath("/visitantes");
  return true;
});

export const responderSolicitudAction = action(
  { perm: "visitantes.autorizar", schema: z.object({ id: zs.id(), decision: z.enum(["AUTORIZADA", "RECHAZADA"]) }) },
  async ({ id, decision }, ctx) => {
    const r = await responderSolicitud(ctx, id, decision);
    revalidatePath("/visitantes");
    return r;
  },
);
