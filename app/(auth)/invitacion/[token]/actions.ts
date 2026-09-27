"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { createToken } from "@/lib/auth/tokens";
import { aceptarInvitacion, verInvitacion } from "@/lib/usuarios/service";
import { parseConfig } from "@/lib/conjunto/config";
import { AppError } from "@/lib/errors";

export async function aceptarInvitacionAction(token: string, _prev: { error?: string } | null, formData: FormData): Promise<{ error?: string }> {
  const data = await verInvitacion(token);
  const version = data?.conjunto ? parseConfig(data.conjunto.config).datos.politicaVersion : "1.0";
  let r: Awaited<ReturnType<typeof aceptarInvitacion>>;
  try {
    r = await aceptarInvitacion(token, {
      nombre: String(formData.get("nombre") ?? "").trim(),
      password: (formData.get("password") as string) || null,
      telefono: (formData.get("telefono") as string) || null,
      tipoDocumento: (formData.get("tipoDocumento") as string) || null,
      numeroDocumento: (formData.get("numeroDocumento") as string) || null,
      aceptaPolitica: formData.get("aceptaPolitica") === "true",
      politicaVersion: version,
    });
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }
  const login = await createToken("MAGIC_LINK", { usuarioId: r.usuarioId, ttlMinutes: 2, data: { conjuntoId: r.conjuntoId } });
  try {
    await signIn("token", { token: login, redirectTo: r.vinculoPendiente ? "/inicio?pendiente=1" : "/inicio" });
  } catch (e) {
    if (e instanceof AuthError) return { error: "Tu cuenta fue creada. Inicia sesión con tu correo y contraseña." };
    throw e;
  }
  return {};
}
