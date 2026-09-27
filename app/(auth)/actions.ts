"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { verifySync } from "otplib";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { signIn, signOut, unstable_update } from "@/lib/auth";
import { createToken, consumeToken } from "@/lib/auth/tokens";
import { hashPassword, passwordIssues, verifyPassword } from "@/lib/auth/password";
import { getSessionUser } from "@/lib/auth/context";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { queueBrandedEmail, appUrl } from "@/lib/email";
import { audit } from "@/lib/audit";
import { decrypt } from "@/lib/crypto";

type Result = { ok: boolean; error?: string; needOtp?: boolean; message?: string };

const MAX_INTENTOS = 5;
const BLOQUEO_MIN = 15;

function safeNext(next: unknown) {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/inicio";
}

export async function loginAction(_prev: Result | null, formData: FormData): Promise<Result> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const otp = String(formData.get("otp") ?? "").trim();
  const next = safeNext(formData.get("next"));
  const h = await headers();
  const rl = rateLimit(`login:${clientIp(h)}:${email}`, 10, 10 * 60_000);
  if (!rl.ok) return { ok: false, error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." };
  if (!email || !password) return { ok: false, error: "Escribe tu correo y tu contraseña." };

  const user = await prisma.usuario.findUnique({ where: { email } });
  if (!user || user.deletedAt) return { ok: false, error: "Correo o contraseña incorrectos." };
  if (user.bloqueadoHasta && user.bloqueadoHasta > new Date()) {
    return { ok: false, error: `Tu cuenta está bloqueada temporalmente por intentos fallidos. Intenta después de las ${user.bloqueadoHasta.toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" })} o usa “Recibir enlace de acceso”.` };
  }
  if (user.estado === "BLOQUEADO" || user.estado === "INACTIVO") return { ok: false, error: "Tu cuenta está desactivada. Contacta a la administración." };

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    const intentos = user.intentosFallidos + 1;
    await prisma.usuario.update({
      where: { id: user.id },
      data: { intentosFallidos: intentos, bloqueadoHasta: intentos >= MAX_INTENTOS ? new Date(Date.now() + BLOQUEO_MIN * 60_000) : null },
    });
    await audit({ userId: user.id, nombre: user.nombre }, "login_fallido", "Usuario", user.id);
    return {
      ok: false,
      error: intentos >= MAX_INTENTOS ? `Cuenta bloqueada ${BLOQUEO_MIN} minutos por seguridad.` : "Correo o contraseña incorrectos.",
    };
  }
  if (user.mfaActivo && user.mfaSecret) {
    if (!otp) return { ok: false, needOtp: true, error: "Escribe el código de 6 dígitos de tu app autenticadora." };
    let secret = user.mfaSecret;
    try {
      secret = decrypt(user.mfaSecret);
    } catch {
      /* secreto sin cifrar (legado) */
    }
    const r = verifySync({ secret, token: otp });
    if (!r.valid) return { ok: false, needOtp: true, error: "El código no es válido o ya expiró." };
  }

  const token = await createToken("MAGIC_LINK", { usuarioId: user.id, ttlMinutes: 2, data: { login: true } });
  try {
    await signIn("token", { token, redirectTo: next });
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: "No fue posible iniciar sesión." };
    throw e;
  }
  return { ok: true };
}

export async function requestMagicLinkAction(_prev: Result | null, formData: FormData): Promise<Result> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const h = await headers();
  if (!rateLimit(`magic:${clientIp(h)}`, 5, 10 * 60_000).ok) return { ok: false, error: "Demasiadas solicitudes. Intenta más tarde." };
  if (!z.email().safeParse(email).success) return { ok: false, error: "Escribe un correo válido." };
  const user = await prisma.usuario.findUnique({ where: { email } });
  if (user && !user.deletedAt && user.estado !== "BLOQUEADO") {
    const token = await createToken("MAGIC_LINK", { usuarioId: user.id, email, ttlMinutes: 15 });
    await queueBrandedEmail(
      email,
      "Tu enlace de acceso a MiConjunto",
      {
        parrafos: [`Hola ${user.nombre.split(" ")[0]}, usa este botón para entrar a MiConjunto. El enlace vence en 15 minutos y sirve una sola vez.`],
        boton: { texto: "Entrar a MiConjunto", url: appUrl(`/acceso?token=${token}`) },
      },
      { sendNow: true },
    );
  }
  // Mismo mensaje exista o no la cuenta (no revelar usuarios registrados).
  return { ok: true, message: "Si el correo está registrado, te enviamos un enlace de acceso. Revisa tu bandeja de entrada." };
}

export async function magicLoginAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  try {
    await signIn("token", { token, redirectTo: "/inicio" });
  } catch (e) {
    if (e instanceof AuthError) redirect("/login?error=enlace");
    throw e;
  }
}

export async function requestPasswordResetAction(_prev: Result | null, formData: FormData): Promise<Result> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const h = await headers();
  if (!rateLimit(`reset:${clientIp(h)}`, 5, 10 * 60_000).ok) return { ok: false, error: "Demasiadas solicitudes. Intenta más tarde." };
  const user = await prisma.usuario.findUnique({ where: { email } });
  if (user && !user.deletedAt) {
    const token = await createToken("RESET_PASSWORD", { usuarioId: user.id, email, ttlMinutes: 60 });
    await queueBrandedEmail(
      email,
      "Restablece tu contraseña",
      {
        parrafos: ["Recibimos una solicitud para cambiar tu contraseña. Si no fuiste tú, ignora este mensaje."],
        boton: { texto: "Crear nueva contraseña", url: appUrl(`/restablecer?token=${token}`) },
      },
      { sendNow: true },
    );
  }
  return { ok: true, message: "Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña." };
}

export async function resetPasswordAction(_prev: Result | null, formData: FormData): Promise<Result> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password !== confirm) return { ok: false, error: "Las contraseñas no coinciden." };
  const issue = passwordIssues(password);
  if (issue) return { ok: false, error: issue };
  const t = await consumeToken("RESET_PASSWORD", token);
  if (!t?.usuarioId) return { ok: false, error: "El enlace no es válido o ya venció. Solicita uno nuevo." };
  await prisma.usuario.update({
    where: { id: t.usuarioId },
    data: { passwordHash: await hashPassword(password), intentosFallidos: 0, bloqueadoHasta: null, sessionVersion: { increment: 1 } },
  });
  await audit({ userId: t.usuarioId }, "cambio_contrasena", "Usuario", t.usuarioId);
  return { ok: true, message: "Contraseña actualizada. Ya puedes iniciar sesión." };
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function selectConjuntoAction(conjuntoId: string) {
  const su = await getSessionUser();
  if (!su) redirect("/login");
  await unstable_update({ conjuntoId } as never);
  redirect("/inicio");
}

export async function toggleTextoGrandeAction() {
  const su = await getSessionUser();
  if (!su) return;
  const u = await prisma.usuario.findUnique({ where: { id: su.userId } });
  await prisma.usuario.update({ where: { id: su.userId }, data: { textoGrande: !u?.textoGrande } });
}

/** Cierra la sesión en todos los dispositivos incrementando la versión de sesión. */
export async function logoutAllDevicesAction() {
  const su = await getSessionUser();
  if (!su) redirect("/login");
  await prisma.usuario.update({ where: { id: su.userId }, data: { sessionVersion: { increment: 1 } } });
  await audit({ userId: su.userId, nombre: su.nombre }, "cerrar_todas_sesiones", "Usuario", su.userId);
  await signOut({ redirectTo: "/login" });
}
