"use server";

import { z } from "zod";
import { action } from "@/lib/action";
import { zs } from "@/lib/validation";
import { borradorRespuestaPqrs, preguntarReglamento, resumenActa } from "@/lib/ia/service";

const preguntaSchema = z.object({ pregunta: zs.text(3, 1500) });
const idSchema = z.object({ id: zs.id() });

export const preguntarAction = action({ perm: "ia.usar", schema: preguntaSchema }, async ({ pregunta }, ctx) => ({ respuesta: await preguntarReglamento(ctx, pregunta) }));

export const borradorPqrsAction = action({ perm: ["ia.usar", "tickets.gestionar"], schema: idSchema }, async ({ id }, ctx) => ({ respuesta: await borradorRespuestaPqrs(ctx, id) }));

export const resumenActaAction = action({ perm: ["ia.usar", "asambleas.ver"], schema: idSchema }, async ({ id }, ctx) => ({ respuesta: await resumenActa(ctx, id) }));
