"use server";

import { redirect } from "next/navigation";
import { unstable_update, auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireSuperAdmin } from "@/lib/auth/superadmin";

export async function impersonarAction(usuarioId: string) {
  const su = await requireSuperAdmin();
  const target = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!target) return;
  await audit({ userId: su.userId, nombre: su.nombre }, "impersonar_inicio", "Usuario", usuarioId, undefined, { email: target.email });
  await unstable_update({ impersonar: usuarioId } as never);
  redirect("/inicio");
}

export async function salirImpersonacionAction() {
  const session = await auth();
  if (!session?.impersonadoPor) return;
  await audit({ userId: session.impersonadoPor }, "impersonar_fin", "Usuario", session.user.id);
  await unstable_update({ salirImpersonacion: true } as never);
}

export async function entrarConjuntoAction(conjuntoId: string, destino?: string | FormData) {
  const su = await requireSuperAdmin();
  await audit({ userId: su.userId, nombre: su.nombre, conjuntoId }, "soporte_entrar_conjunto", "Conjunto", conjuntoId);
  await unstable_update({ conjuntoId } as never);
  redirect(typeof destino === "string" && destino.startsWith("/") ? destino : "/inicio");
}

// ── Acciones de formularios (devuelven ActionResult) ──
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/lib/action";
import { zs } from "@/lib/validation";
import { actualizarConjuntoSaas, guardarPlan, nuevoConjunto } from "@/lib/superadmin/service";

function saAction<S extends z.ZodType, R>(schema: S, fn: (input: z.output<S>, actor: { userId: string; nombre: string }) => Promise<R>) {
  return async (raw: z.input<S>): Promise<ActionResult<R>> => {
    try {
      const su = await requireSuperAdmin();
      const data = await fn(schema.parse(raw), { userId: su.userId, nombre: su.nombre });
      revalidatePath("/superadmin", "layout");
      return { ok: true, data };
    } catch (e) {
      return toActionError(e);
    }
  };
}

export const crearConjuntoAction = saAction(
  z.object({
    nombre: zs.text(3, 120),
    nit: zs.optText(20),
    digitoVerificacion: zs.optText(1),
    direccion: zs.optText(200),
    ciudad: zs.optText(80),
    departamento: zs.optText(80),
    municipioCodigo: zs.optText(5),
    telefono: zs.optText(30),
    email: zs.optEmail(),
    tipo: z.enum(["EDIFICIO", "CONJUNTO_CASAS", "MIXTO"]),
    planId: zs.optId(),
    adminEmail: zs.optEmail(),
    adminNombre: zs.optText(120),
    fechaInicioOperacion: zs.optDate(),
  }),
  async (input, actor) => ({ id: (await nuevoConjunto(actor, input)).id }),
);

export const actualizarConjuntoSaasAction = saAction(
  z.object({ id: zs.id(), estado: z.enum(["ACTIVO", "SUSPENDIDO", "EN_APERTURA", "INACTIVO"]).optional(), planId: zs.optId(), modulosActivos: zs.list().optional() }),
  async ({ id, ...data }, actor) => actualizarConjuntoSaas(actor, id, data),
);

export const guardarPlanAction = saAction(
  z.object({ id: zs.optId(), nombre: zs.text(2, 60), descripcion: zs.optText(300), precioMensual: zs.money(), precioUnidad: zs.money(), maxUnidades: zs.int(1), modulos: zs.list(), activo: zs.bool() }),
  async (input) => ({ id: (await guardarPlan(input)).id }),
);

// ── Cotizaciones comerciales del sitio público ──
import { actualizarCotizacion } from "@/lib/comercial/service";

export const actualizarCotizacionAction = saAction(
  z.object({ id: zs.id(), estado: z.enum(["NUEVA", "CONTACTADA", "GANADA", "PERDIDA"]), notas: zs.optText(2000) }),
  async ({ id, ...data }, actor) => {
    const c = await actualizarCotizacion(id, data);
    await audit({ userId: actor.userId, nombre: actor.nombre }, "actualizar", "CotizacionComercial", id, undefined, { estado: data.estado });
    return { id: c.id };
  },
);
