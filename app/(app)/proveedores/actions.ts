"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { zs } from "@/lib/validation";
import {
  eliminarContrato,
  eliminarDocumento,
  eliminarProveedor,
  guardarContrato,
  guardarDocumento,
  guardarProveedor,
  terminarContrato,
} from "@/lib/proveedores/service";

const done = <T>(r: T) => {
  revalidatePath("/proveedores", "layout");
  return r;
};

const nit = z.preprocess((v) => (typeof v === "string" ? v.replace(/[^\d-]/g, "") : v), z.string().regex(/^\d{5,12}(-\d)?$/, "NIT no válido (ej. 900123456-7)"));

const proveedorSchema = z.object({
  id: zs.optId(),
  nit,
  razonSocial: zs.text(2, 150),
  categoria: zs.text(2, 60),
  contactoNombre: zs.optText(100),
  telefono: zs.optText(30),
  email: zs.optEmail(),
  direccion: zs.optText(150),
  tarifas: zs.optText(2000),
  directorioComunitario: zs.bool(),
  beneficioComunidad: zs.optText(500),
  activo: zs.bool(),
  usuarioId: zs.optId(),
});

export const guardarProveedorAction = action({ perm: ["proveedores.crear", "proveedores.editar"], schema: proveedorSchema }, async (input, ctx) => {
  const p = await guardarProveedor(ctx, input);
  return done({ id: p.id });
});

export const eliminarProveedorAction = action({ perm: "proveedores.eliminar", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => done(await eliminarProveedor(ctx, id)));

const TIPOS_DOC = ["RUT", "CAMARA_COMERCIO", "POLIZA", "SEGURIDAD_SOCIAL", "CERTIFICACION", "OTRO"] as const;

export const guardarDocumentoAction = action(
  { perm: "proveedores.editar", schema: z.object({ id: zs.optId(), proveedorId: zs.id(), tipo: z.enum(TIPOS_DOC), archivoUrl: zs.optText(500), vence: zs.optDate() }) },
  async (input, ctx) => done({ id: (await guardarDocumento(ctx, input)).id }),
);

export const eliminarDocumentoAction = action({ perm: "proveedores.editar", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => done(await eliminarDocumento(ctx, id)));

const contratoSchema = z.object({
  id: zs.optId(),
  proveedorId: zs.id(),
  objeto: zs.text(3, 300),
  valor: zs.money(0),
  inicio: zs.date(),
  fin: zs.date(),
  renovacionAutomatica: zs.bool(),
  diasAlerta: zs.int(0, 365),
  documentoUrl: zs.optText(500),
});

export const guardarContratoAction = action({ perm: ["proveedores.crear", "proveedores.editar"], schema: contratoSchema }, async (input, ctx) => done({ id: (await guardarContrato(ctx, input)).id }));

export const terminarContratoAction = action(
  { perm: "proveedores.editar", schema: z.object({ id: zs.id(), motivo: zs.text(3, 300) }) },
  async ({ id, motivo }, ctx) => done({ id: (await terminarContrato(ctx, id, motivo)).id }),
);

export const eliminarContratoAction = action({ perm: "proveedores.eliminar", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => done(await eliminarContrato(ctx, id)));
