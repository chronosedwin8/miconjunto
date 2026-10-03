import webpush from "web-push";
import { prisma } from "@/lib/db";
import { publishRealtime } from "@/lib/events";
import { queueBrandedEmail, appUrl } from "@/lib/email";
import { sendWhatsApp } from "@/lib/whatsapp";
import type { PermKey } from "@/lib/permisos/catalog";

export type Canal = "app" | "push" | "email" | "whatsapp";

let vapidReady = false;
function ensureVapid() {
  if (vapidReady) return !!process.env.VAPID_PRIVATE_KEY;
  vapidReady = true;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:soporte@miconjunto.co", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    return true;
  }
  return false;
}

export type NotifyInput = {
  conjuntoId: string | null;
  usuarioIds: string[];
  titulo: string;
  cuerpo: string;
  enlace?: string;
  tipo?: string;
  /** Canales solicitados; "app" siempre se incluye. Se respetan las preferencias de cada usuario. */
  canales?: Canal[];
  data?: Record<string, unknown>;
  /** Acciones para la notificación push (p. ej. Autorizar / Rechazar). */
  acciones?: { action: string; title: string }[];
};

/** Notificación multicanal: centro de notificaciones + push + correo + WhatsApp según preferencias. */
export async function notify(input: NotifyInput) {
  const ids = [...new Set(input.usuarioIds.filter(Boolean))];
  if (!ids.length) return;
  const canales = new Set<Canal>(["app", ...(input.canales ?? ["push"])]);
  const users = await prisma.usuario.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, email: true, telefono: true, preferenciasNotif: true, suscripcionesPush: { where: { deletedAt: null } } },
  });
  let conjunto: { nombre: string; colorPrimario: string | null; config: unknown } | null = null;
  if (input.conjuntoId) {
    conjunto = await prisma.conjunto.findUnique({ where: { id: input.conjuntoId }, select: { nombre: true, colorPrimario: true, config: true } });
  }
  const cfgCanales = ((conjunto?.config as { notificaciones?: Record<string, boolean> })?.notificaciones ?? {}) as Record<string, boolean>;

  await prisma.notificacion.createMany({
    data: users.map((u) => ({
      conjuntoId: input.conjuntoId,
      usuarioId: u.id,
      titulo: input.titulo,
      cuerpo: input.cuerpo,
      tipo: input.tipo ?? "GENERAL",
      enlace: input.enlace,
      canales: [...canales],
      data: (input.data ?? undefined) as object | undefined,
    })),
  });

  const pushOk = ensureVapid() && cfgCanales.push !== false;
  const tasks: Promise<unknown>[] = [];
  for (const u of users) {
    const pref = (u.preferenciasNotif ?? {}) as Record<string, boolean>;
    if (input.conjuntoId) {
      tasks.push(
        publishRealtime({ conjuntoId: input.conjuntoId, canal: `user:${u.id}`, tipo: "notificacion", data: { titulo: input.titulo, cuerpo: input.cuerpo, enlace: input.enlace, tipoNotif: input.tipo, ...input.data } }),
      );
    }
    if (canales.has("push") && pushOk && pref.push !== false) {
      for (const s of u.suscripcionesPush) {
        tasks.push(
          webpush
            .sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              JSON.stringify({ title: input.titulo, body: input.cuerpo, url: input.enlace ?? "/inicio", data: input.data, actions: input.acciones }),
              { TTL: 3600 },
            )
            .catch(async (err: { statusCode?: number }) => {
              if (err?.statusCode === 404 || err?.statusCode === 410) {
                await prisma.suscripcionPush.delete({ where: { id: s.id } }).catch(() => undefined);
              }
            }),
        );
      }
    }
    if (canales.has("email") && pref.email !== false && cfgCanales.email !== false && u.email) {
      tasks.push(
        queueBrandedEmail(
          u.email,
          input.titulo,
          {
            conjuntoNombre: conjunto?.nombre,
            color: conjunto?.colorPrimario ?? undefined,
            parrafos: [input.cuerpo],
            boton: input.enlace ? { texto: "Ver en MiConjunto", url: appUrl(input.enlace) } : undefined,
          },
          { conjuntoId: input.conjuntoId },
        ),
      );
    }
    if (canales.has("whatsapp") && pref.whatsapp && cfgCanales.whatsapp) {
      tasks.push(sendWhatsApp(u.telefono, `*${input.titulo}*\n${input.cuerpo}${input.enlace ? `\n${appUrl(input.enlace)}` : ""}`));
    }
  }
  await Promise.allSettled(tasks);
}

/** Usuarios activos del conjunto cuyo rol tiene alguno de los permisos dados. */
export async function usuariosConPermiso(conjuntoId: string, perms: PermKey[]): Promise<string[]> {
  const rows = await prisma.membresiaConjunto.findMany({
    where: {
      conjuntoId,
      estado: "ACTIVA",
      deletedAt: null,
      rol: { permisos: { some: { permisoClave: { in: perms }, deletedAt: null } } },
    },
    select: { usuarioId: true },
  });
  return rows.map((r) => r.usuarioId);
}

export async function usuariosConRol(conjuntoId: string, roles: string[]): Promise<string[]> {
  const rows = await prisma.membresiaConjunto.findMany({
    where: { conjuntoId, estado: "ACTIVA", deletedAt: null, rol: { OR: [{ clave: { in: roles } }, { basadoEnClave: { in: roles } }] } },
    select: { usuarioId: true },
  });
  return rows.map((r) => r.usuarioId);
}

/** Usuarios vinculados a una unidad (con cuenta). `soloPropietarios` para información financiera. */
export async function usuariosDeUnidad(conjuntoId: string, unidadId: string, opts?: { soloPropietarios?: boolean; incluirAutorizadosCuenta?: boolean }) {
  const vinculos = await prisma.vinculoUnidad.findMany({
    where: {
      conjuntoId,
      unidadId,
      estado: "ACTIVO",
      accesoPausado: false,
      deletedAt: null,
      persona: { usuarioId: { not: null }, deletedAt: null },
      ...(opts?.soloPropietarios
        ? {
            OR: [
              { tipo: { in: ["PROPIETARIO", "COPROPIETARIO"] } },
              ...(opts.incluirAutorizadosCuenta ? [{ puedeVerCuenta: true }] : []),
            ],
          }
        : { tipo: { in: ["PROPIETARIO", "COPROPIETARIO", "ARRENDATARIO", "RESIDENTE", "FAMILIAR"] } }),
    },
    select: { persona: { select: { usuarioId: true } } },
  });
  return [...new Set(vinculos.map((v) => v.persona.usuarioId!).filter(Boolean))];
}
