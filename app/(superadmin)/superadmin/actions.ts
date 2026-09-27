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

export async function entrarConjuntoAction(conjuntoId: string) {
  const su = await requireSuperAdmin();
  await audit({ userId: su.userId, nombre: su.nombre, conjuntoId }, "soporte_entrar_conjunto", "Conjunto", conjuntoId);
  await unstable_update({ conjuntoId } as never);
  redirect("/inicio");
}
