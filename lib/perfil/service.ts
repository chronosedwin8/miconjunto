import QRCode from "qrcode";
import { generateSecret, generateURI, verifySync } from "otplib";
import type { Ctx } from "@/lib/auth/context";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { decrypt, encrypt } from "@/lib/crypto";
import { hashPassword, passwordIssues, verifyPassword } from "@/lib/auth/password";
import { notify, usuariosConPermiso } from "@/lib/notificaciones";
import { anonimizarPersona, miPersona, sincronizarBanderasUnidades, type PersonaInput } from "@/lib/residentes/service";

/**
 * Perfil del usuario y derechos del titular (habeas data, Ley 1581 de 2012):
 * consultar, actualizar, exportar y suprimir sus datos; preferencias; seguridad de la cuenta.
 */

export async function miUsuario(ctx: Ctx) {
  const u = await prisma.usuario.findUnique({
    where: { id: ctx.userId },
    select: {
      id: true,
      email: true,
      nombre: true,
      telefono: true,
      fotoUrl: true,
      preferenciasNotif: true,
      politicaAceptadaEn: true,
      politicaVersion: true,
      mfaActivo: true,
      mfaSecret: true,
      ultimoAcceso: true,
      createdAt: true,
      passwordHash: true,
      _count: { select: { suscripcionesPush: { where: { deletedAt: null } } } },
    },
  });
  if (!u) throw new AppError("Tu cuenta no existe.", 404);
  const { mfaSecret, passwordHash, ...rest } = u;
  return { ...rest, mfaPendiente: !!mfaSecret && !u.mfaActivo, tieneContrasena: !!passwordHash };
}

export function politicaPendiente(ctx: Ctx, usuario: { politicaVersion: string | null }) {
  return usuario.politicaVersion !== conjuntoConfig(ctx).datos.politicaVersion;
}

// ── Datos personales ──
export async function actualizarMisDatos(ctx: Ctx, input: { nombre: string; telefono?: string | null; fotoUrl?: string | null; persona?: PersonaInput | null }) {
  const antes = await prisma.usuario.findUnique({ where: { id: ctx.userId }, select: { nombre: true, telefono: true, fotoUrl: true } });
  const u = await prisma.usuario.update({ where: { id: ctx.userId }, data: { nombre: input.nombre, telefono: input.telefono ?? null, fotoUrl: input.fotoUrl ?? null } });
  const persona = await miPersona(ctx);
  if (persona && input.persona) {
    const data = Object.fromEntries(Object.entries(input.persona).filter(([, v]) => v !== undefined));
    await ctx.db.persona.update({ where: { id: persona.id }, data: { ...data, telefono: input.telefono ?? persona.telefono, fotoUrl: input.fotoUrl ?? persona.fotoUrl } });
    if ("movilidadReducida" in data || "requiereAsistenciaEvacuacion" in data) {
      const vs = await ctx.db.vinculoUnidad.findMany({ where: { personaId: persona.id, estado: "ACTIVO" }, select: { unidadId: true } });
      await sincronizarBanderasUnidades(ctx, vs.map((v) => v.unidadId));
    }
  }
  await audit(ctx, "actualizar_mis_datos", "Usuario", ctx.userId, antes, { nombre: u.nombre, telefono: u.telefono, persona: !!persona });
  return true;
}

// ── Preferencias ──
export async function guardarPreferencias(ctx: Ctx, pref: { push: boolean; email: boolean; whatsapp: boolean }) {
  await prisma.usuario.update({ where: { id: ctx.userId }, data: { preferenciasNotif: pref } });
  await audit(ctx, "preferencias_notificacion", "Usuario", ctx.userId, undefined, pref);
  return true;
}

export async function guardarSuscripcionPush(usuarioId: string, sub: { endpoint: string; p256dh: string; auth: string; userAgent?: string | null }) {
  const existe = await prisma.suscripcionPush.findUnique({ where: { endpoint: sub.endpoint } });
  if (existe) {
    await prisma.suscripcionPush.update({ where: { id: existe.id }, data: { usuarioId, p256dh: sub.p256dh, auth: sub.auth, userAgent: sub.userAgent ?? null, deletedAt: null } });
    return existe.id;
  }
  const s = await prisma.suscripcionPush.create({ data: { usuarioId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, userAgent: sub.userAgent ?? null } });
  return s.id;
}

export async function eliminarSuscripcionPush(usuarioId: string, endpoint?: string | null) {
  const r = await prisma.suscripcionPush.deleteMany({ where: { usuarioId, ...(endpoint ? { endpoint } : {}) } });
  return r.count;
}

// ── Contraseña ──
export async function cambiarContrasena(ctx: Ctx, input: { actual?: string | null; nueva: string; confirmar: string; cerrarOtras: boolean }) {
  const u = await prisma.usuario.findUnique({ where: { id: ctx.userId } });
  if (!u) throw new AppError("Tu cuenta no existe.", 404);
  if (u.passwordHash && !(await verifyPassword(u.passwordHash, input.actual ?? ""))) throw new AppError("La contraseña actual no es correcta.", 400, { actual: "No coincide" });
  if (input.nueva !== input.confirmar) throw new AppError("Las contraseñas no coinciden.", 400, { confirmar: "No coincide" });
  const issue = passwordIssues(input.nueva);
  if (issue) throw new AppError(issue, 400, { nueva: issue });
  await prisma.usuario.update({
    where: { id: ctx.userId },
    data: { passwordHash: await hashPassword(input.nueva), intentosFallidos: 0, bloqueadoHasta: null, ...(input.cerrarOtras ? { sessionVersion: { increment: 1 } } : {}) },
  });
  await audit(ctx, "cambio_contrasena", "Usuario", ctx.userId, undefined, { cerrarOtras: input.cerrarOtras });
  return { cerrarSesion: input.cerrarOtras };
}

// ── MFA (TOTP) ──
function leerSecreto(cifrado: string) {
  try {
    return decrypt(cifrado);
  } catch {
    return cifrado; // secreto heredado sin cifrar
  }
}

/** Genera un secreto TOTP (cifrado en BD, aún inactivo) y el QR para la app autenticadora. */
export async function iniciarMfa(ctx: Ctx) {
  const u = await prisma.usuario.findUnique({ where: { id: ctx.userId } });
  if (!u) throw new AppError("Tu cuenta no existe.", 404);
  if (u.mfaActivo) throw new AppError("La verificación en dos pasos ya está activa.");
  const secret = generateSecret();
  await prisma.usuario.update({ where: { id: ctx.userId }, data: { mfaSecret: encrypt(secret), mfaActivo: false } });
  return true;
}

export async function datosQrMfa(ctx: Ctx) {
  const u = await prisma.usuario.findUnique({ where: { id: ctx.userId }, select: { email: true, mfaSecret: true, mfaActivo: true } });
  if (!u?.mfaSecret || u.mfaActivo) return null;
  const secret = leerSecreto(u.mfaSecret);
  const uri = generateURI({ issuer: "MiConjunto", label: u.email, secret });
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 240 });
  return { secret, uri, qr };
}

export async function confirmarMfa(ctx: Ctx, codigo: string) {
  const u = await prisma.usuario.findUnique({ where: { id: ctx.userId } });
  if (!u?.mfaSecret) throw new AppError("Primero genera el código QR.");
  const r = verifySync({ secret: leerSecreto(u.mfaSecret), token: codigo.replace(/\s/g, "") });
  if (!r.valid) throw new AppError("El código no es válido. Revisa la hora de tu teléfono e inténtalo de nuevo.", 400, { codigo: "Código no válido" });
  await prisma.usuario.update({ where: { id: ctx.userId }, data: { mfaActivo: true } });
  await audit(ctx, "activar_mfa", "Usuario", ctx.userId);
  return true;
}

export async function desactivarMfa(ctx: Ctx, codigo: string) {
  const u = await prisma.usuario.findUnique({ where: { id: ctx.userId } });
  if (!u?.mfaActivo || !u.mfaSecret) {
    await prisma.usuario.update({ where: { id: ctx.userId }, data: { mfaActivo: false, mfaSecret: null } });
    return true;
  }
  const r = verifySync({ secret: leerSecreto(u.mfaSecret), token: codigo.replace(/\s/g, "") });
  if (!r.valid) throw new AppError("El código no es válido.", 400, { codigo: "Código no válido" });
  await prisma.usuario.update({ where: { id: ctx.userId }, data: { mfaActivo: false, mfaSecret: null } });
  await audit(ctx, "desactivar_mfa", "Usuario", ctx.userId);
  return true;
}

// ── Política de datos ──
export async function aceptarPolitica(ctx: Ctx, extra?: { directorioOptIn?: boolean; directorioCampos?: string[] }) {
  const version = conjuntoConfig(ctx).datos.politicaVersion;
  const ahora = new Date();
  await prisma.usuario.update({ where: { id: ctx.userId }, data: { politicaAceptadaEn: ahora, politicaVersion: version } });
  const persona = await miPersona(ctx);
  if (persona) {
    await ctx.db.persona.update({
      where: { id: persona.id },
      data: {
        consentimientoDatosEn: ahora,
        consentimientoVersion: version,
        ...(extra?.directorioOptIn !== undefined ? { directorioOptIn: extra.directorioOptIn, directorioCampos: extra.directorioCampos ?? [] } : {}),
      },
    });
  }
  await audit(ctx, "aceptar_politica_datos", "Usuario", ctx.userId, undefined, { version, ...extra });
  return { version };
}

// ── Derechos ARCO ──
/** Todos los datos personales del titular, en JSON (derecho de acceso y portabilidad). */
export async function exportarMisDatos(ctx: Ctx) {
  const [usuario, membresias, personas, notificaciones, auditoria, push] = await Promise.all([
    prisma.usuario.findUnique({
      where: { id: ctx.userId },
      select: { id: true, email: true, nombre: true, telefono: true, fotoUrl: true, estado: true, ultimoAcceso: true, preferenciasNotif: true, politicaAceptadaEn: true, politicaVersion: true, mfaActivo: true, textoGrande: true, createdAt: true },
    }),
    prisma.membresiaConjunto.findMany({ where: { usuarioId: ctx.userId, deletedAt: null }, select: { estado: true, createdAt: true, conjunto: { select: { nombre: true, nit: true } }, rol: { select: { nombre: true } } } }),
    prisma.persona.findMany({
      where: { usuarioId: ctx.userId, deletedAt: null },
      include: {
        vinculos: { where: { deletedAt: null }, select: { tipo: true, estado: true, principal: true, porcentajePropiedad: true, fechaInicio: true, fechaFin: true, horarioPermitido: true, unidad: { select: { id: true, codigo: true } } } },
      },
    }),
    prisma.notificacion.findMany({ where: { usuarioId: ctx.userId, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 300, select: { titulo: true, cuerpo: true, tipo: true, leida: true, createdAt: true } }),
    prisma.auditoria.findMany({ where: { usuarioId: ctx.userId }, orderBy: { createdAt: "desc" }, take: 500, select: { accion: true, entidad: true, ip: true, createdAt: true } }),
    prisma.suscripcionPush.findMany({ where: { usuarioId: ctx.userId, deletedAt: null }, select: { userAgent: true, createdAt: true } }),
  ]);
  const unidadIds = [...new Set(personas.flatMap((p) => p.vinculos.filter((v) => v.estado === "ACTIVO").map((v) => v.unidad.id)))].filter((id) => ctx.unidadIds.includes(id));
  const [vehiculos, mascotas] = await Promise.all([
    ctx.db.vehiculo.findMany({ where: { unidadId: { in: unidadIds } }, select: { placa: true, tipo: true, marca: true, modelo: true, color: true, soatVence: true, tecnomecanicaVence: true } }),
    ctx.db.mascota.findMany({ where: { unidadId: { in: unidadIds } }, select: { nombre: true, especie: true, raza: true, antirrabicaVence: true, potencialmentePeligrosa: true, microchip: true } }),
  ]);
  const cfg = conjuntoConfig(ctx);
  await audit(ctx, "exportar_mis_datos", "Usuario", ctx.userId);
  return {
    generado: new Date().toISOString(),
    responsableTratamiento: { conjunto: ctx.conjunto.nombre, nit: ctx.conjunto.nit, responsable: cfg.datos.responsable, contacto: cfg.datos.emailContacto, finalidad: cfg.datos.finalidad },
    usuario,
    conjuntos: membresias,
    personas: personas.map(({ conjuntoId: _c, usuarioId: _u, deletedAt: _d, ...p }) => p),
    vehiculosDeMisUnidades: vehiculos,
    mascotasDeMisUnidades: mascotas,
    dispositivosConNotificaciones: push,
    notificaciones,
    registroDeActividad: auditoria,
  };
}

/**
 * Supresión (derecho de cancelación): anonimiza la Persona del titular en el conjunto activo.
 * Los vínculos de propiedad se conservan anonimizados porque la Ley 675 de 2001 obliga a llevar el registro
 * de propietarios; los demás vínculos se finalizan. Con `cerrarCuenta` también se desactiva el usuario.
 */
export async function solicitarSupresion(ctx: Ctx, input: { motivo?: string | null; cerrarCuenta: boolean; confirmacion: string }) {
  if (input.confirmacion.trim().toUpperCase() !== "SUPRIMIR") throw new AppError('Escribe SUPRIMIR para confirmar.', 400, { confirmacion: 'Escribe "SUPRIMIR"' });
  const personas = await ctx.db.persona.findMany({ where: { usuarioId: ctx.userId, anonimizada: false }, include: { vinculos: { where: { deletedAt: null } } } });
  const unidades = new Set<string>();
  for (const p of personas) {
    for (const v of p.vinculos) {
      unidades.add(v.unidadId);
      if (v.tipo !== "PROPIETARIO" && v.tipo !== "COPROPIETARIO" && v.estado !== "INACTIVO") {
        await ctx.db.vinculoUnidad.update({ where: { id: v.id }, data: { estado: "INACTIVO", fechaFin: new Date() } });
      }
    }
    await anonimizarPersona(ctx, p.id, `Supresión solicitada por el titular${input.motivo ? `: ${input.motivo}` : ""}`);
  }
  await sincronizarBanderasUnidades(ctx, [...unidades]);
  await prisma.usuario.update({ where: { id: ctx.userId }, data: { telefono: null, fotoUrl: null } });
  await prisma.borradorFormulario.deleteMany({ where: { usuarioId: ctx.userId } });
  let cuentaCerrada = false;
  if (input.cerrarCuenta) {
    const otras = await prisma.membresiaConjunto.count({ where: { usuarioId: ctx.userId, deletedAt: null, conjuntoId: { not: ctx.conjuntoId } } });
    await prisma.membresiaConjunto.updateMany({ where: { usuarioId: ctx.userId, conjuntoId: ctx.conjuntoId }, data: { estado: "SUSPENDIDA", deletedAt: new Date() } });
    await prisma.suscripcionPush.deleteMany({ where: { usuarioId: ctx.userId } });
    if (otras === 0) {
      await prisma.usuario.update({
        where: { id: ctx.userId },
        data: { nombre: "Titular retirado", email: `retirado-${ctx.userId}@anonimo.miconjunto.co`, passwordHash: null, mfaSecret: null, mfaActivo: false, estado: "INACTIVO", sessionVersion: { increment: 1 }, deletedAt: new Date() },
      });
    } else {
      await prisma.usuario.update({ where: { id: ctx.userId }, data: { sessionVersion: { increment: 1 } } });
    }
    cuentaCerrada = true;
  }
  await audit(ctx, "supresion_datos", "Usuario", ctx.userId, undefined, { personas: personas.length, cerrarCuenta: input.cerrarCuenta, motivo: input.motivo ?? null });
  const admins = await usuariosConPermiso(ctx.conjuntoId, ["residentes.aprobar"]);
  await notify({
    conjuntoId: ctx.conjuntoId,
    usuarioIds: admins,
    titulo: "Solicitud de supresión de datos atendida",
    cuerpo: `Un titular ejerció su derecho de supresión (Ley 1581 de 2012). Sus datos fueron anonimizados${cuentaCerrada ? " y su cuenta cerrada" : ""}.`,
    enlace: "/residentes",
    tipo: "RESIDENTES",
    canales: ["email"],
  });
  return { cuentaCerrada };
}
