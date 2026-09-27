"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { zs } from "@/lib/validation";
import { actualizarConfig, actualizarDatosConjunto } from "@/lib/conjunto/settings";
import { cambiarEstadoMiembro, cambiarRolMiembro, crearRolPersonalizado, eliminarRol, guardarPermisosRol } from "@/lib/roles/service";
import { invitarUsuario } from "@/lib/usuarios/service";
import { guardarIntegracion } from "@/lib/integraciones/service";
import { crearTokenApi, crearWebhook, eliminarWebhook, revocarTokenApi } from "@/lib/api/tokens";

const ok = <T>(r: T) => {
  revalidatePath("/configuracion", "layout");
  return r;
};

export const guardarDatosConjuntoAction = action(
  {
    perm: "configuracion.editar",
    schema: z.object({
      nombre: zs.text(2, 120),
      nit: zs.optText(20),
      digitoVerificacion: zs.optText(1),
      direccion: zs.optText(200),
      municipioCodigo: zs.optText(5),
      ciudad: zs.optText(80),
      departamento: zs.optText(80),
      telefono: zs.optText(30),
      email: zs.optEmail(),
      logoUrl: zs.optText(300),
      colorPrimario: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color no válido").optional(),
      regimenTributario: zs.optText(200),
      responsableIva: zs.bool(),
      tipo: z.enum(["EDIFICIO", "CONJUNTO_CASAS", "MIXTO"]),
      matriculaInmobiliaria: zs.optText(40),
      personeriaJuridica: zs.optText(200),
      paginaPublica: zs.bool(),
      descripcionPublica: zs.optText(2000),
    }),
  },
  async (input, ctx) => ok(await actualizarDatosConjunto(ctx, input)),
);

const num = (min = 0, max = 1e12) => z.preprocess((v) => (v === "" || v === undefined ? undefined : Number(String(v).replace(",", "."))), z.number().min(min).max(max).optional());
const int = (min = 0, max = 1e6) => z.preprocess((v) => (v === "" || v === undefined ? undefined : Number(v)), z.number().int().min(min).max(max).optional());
const bool = () => zs.bool().optional();
const ordenAplicacionSchema = z.preprocess((v) => (typeof v === "string" ? v.split(",").map((x) => x.trim()) : v), z.array(z.enum(["INTERES_MORA", "MULTA", "ANTIGUAS", "ACTUALES"])).optional());
const lineasSchema = z.preprocess((v) => (typeof v === "string" ? v.split(/\r?\n/).map((x) => x.trim()).filter(Boolean) : v), z.array(z.string()).optional());

export const guardarParametrosAction = action(
  {
    perm: "configuracion.editar",
    schema: z.object({
      cartera: z
        .object({
          diaGeneracion: int(1, 28),
          diaVencimiento: int(1, 28),
          diaProntoPago: int(1, 28),
          porcentajeProntoPago: num(0, 50),
          calculoCuota: z.enum(["VALOR_FIJO", "COEFICIENTE"]).optional(),
          diasGraciaMora: int(0, 60),
          ordenAplicacion: ordenAplicacionSchema,
        })
        .partial()
        .optional(),
      bloqueoMora: z.object({ reservas: bool(), pazYSalvo: bool(), votacion: bool(), montoMinimo: num(0) }).partial().optional(),
      pazYSalvo: z.object({ vigenciaDias: int(1, 365) }).partial().optional(),
      porteria: z
        .object({
          horario: zs.optText(100),
          maxDiasPaquete: int(1, 60),
          minutosRespuestaAutorizacion: int(1, 60),
          alertaHorasPermanencia: int(1, 72),
          exigirSeguridadSocialContratistas: bool(),
          emergenciaATodos: bool(),
          checklistTurno: lineasSchema,
        })
        .partial()
        .optional(),
      notificaciones: z.object({ push: bool(), email: bool(), whatsapp: bool() }).partial().optional(),
      facturacion: z.object({ proveedor: z.enum(["FACTUS", "ALANUBE", "SIMULADO"]).optional(), numberingRangeId: int(0), tarifaIvaDefecto: num(0, 100) }).partial().optional(),
      pagos: z.object({ pasarela: z.enum(["WOMPI", "MERCADOPAGO", "SIMULADOR"]).optional(), permitirAbonos: bool() }).partial().optional(),
      datos: z.object({ responsable: zs.optText(200), emailContacto: zs.optText(200), politicaVersion: zs.optText(20), finalidad: zs.optText(2000), politicaTexto: zs.optText(20000) }).partial().optional(),
      cobranza: z.object({ maxContactosSemanaCanal: int(1, 7) }).partial().optional(),
      ia: z.object({ activo: bool() }).partial().optional(),
      seccion: z.string().optional(),
    }),
  },
  async ({ seccion: _s, ...input }, ctx) => {
    const clean = JSON.parse(JSON.stringify(input, (_k, v) => (v === null ? undefined : v)));
    await actualizarConfig(ctx, clean);
    return ok(true);
  },
);

export const crearRolAction = action(
  { perm: "configuracion.roles", schema: z.object({ nombre: zs.text(3, 60), basadoEnClave: zs.text(), descripcion: zs.optText(300) }) },
  async (input, ctx) => ok({ id: (await crearRolPersonalizado(ctx, input)).id }),
);

export const guardarPermisosRolAction = action(
  { perm: "configuracion.roles", schema: z.object({ rolId: zs.id(), permisos: zs.list(), alcance: z.enum(["ACCION", "VISIBILIDAD"]).optional() }) },
  async ({ rolId, permisos, alcance }, ctx) => ok(await guardarPermisosRol(ctx, rolId, permisos, alcance)),
);

/** Guarda la matriz de visibilidad de todos los roles a la vez (campos y secciones). */
export const guardarVisibilidadAction = action(
  { perm: "configuracion.roles", schema: z.object({ matriz: z.record(z.string(), zs.list()).optional() }) },
  async ({ matriz }, ctx) => {
    const roles = await ctx.db.rol.findMany({ select: { id: true } });
    for (const r of roles) await guardarPermisosRol(ctx, r.id, matriz?.[r.id] ?? [], "VISIBILIDAD");
    return ok(true);
  },
);

export const eliminarRolAction = action({ perm: "configuracion.roles", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => ok(await eliminarRol(ctx, id)));

export const cambiarRolMiembroAction = action(
  { perm: "configuracion.roles", schema: z.object({ membresiaId: zs.id(), rolId: zs.id() }) },
  async ({ membresiaId, rolId }, ctx) => ok(await cambiarRolMiembro(ctx, membresiaId, rolId)),
);

export const cambiarEstadoMiembroAction = action(
  { perm: "configuracion.roles", schema: z.object({ membresiaId: zs.id(), estado: z.enum(["ACTIVA", "SUSPENDIDA"]) }) },
  async ({ membresiaId, estado }, ctx) => ok(await cambiarEstadoMiembro(ctx, membresiaId, estado)),
);

export const invitarUsuarioAction = action(
  {
    perm: ["configuracion.roles", "residentes.invitar"],
    schema: z.object({
      email: zs.email(),
      nombre: zs.optText(120),
      telefono: zs.optText(30),
      rolClave: zs.text(),
      unidadId: zs.optId(),
      tipoVinculo: zs.optEnumOf({
        PROPIETARIO: "PROPIETARIO",
        COPROPIETARIO: "COPROPIETARIO",
        ARRENDATARIO: "ARRENDATARIO",
        RESIDENTE: "RESIDENTE",
        FAMILIAR: "FAMILIAR",
      } as const),
    }),
  },
  async (input, ctx) => {
    const r = await invitarUsuario(ctx, input);
    revalidatePath("/configuracion/usuarios");
    revalidatePath("/mi-hogar");
    return r;
  },
);

export const guardarIntegracionAction = action(
  {
    perm: "configuracion.integraciones",
    schema: z.object({ tipo: z.enum(["WOMPI", "MERCADOPAGO", "FACTUS", "ALANUBE", "SMTP", "WHATSAPP"]), datos: z.record(z.string(), z.string()).optional(), activo: zs.bool() }),
  },
  async ({ tipo, datos, activo }, ctx) => ok(await guardarIntegracion(ctx, tipo, datos ?? {}, activo)),
);

export const crearTokenApiAction = action(
  { perm: "configuracion.api", schema: z.object({ nombre: zs.text(3, 60), permisos: zs.list() }) },
  async (input, ctx) => ok(await crearTokenApi(ctx, input.nombre, input.permisos)),
);

export const revocarTokenApiAction = action({ perm: "configuracion.api", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => ok(await revocarTokenApi(ctx, id)));

export const crearWebhookAction = action(
  { perm: "configuracion.api", schema: z.object({ url: z.url("URL no válida"), eventos: zs.list() }) },
  async (input, ctx) => ok(await crearWebhook(ctx, input.url, input.eventos)),
);

export const eliminarWebhookAction = action({ perm: "configuracion.api", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => ok(await eliminarWebhook(ctx, id)));
