import { Prisma, type CotizacionComercial, type EstadoCotizacionComercial } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { randomToken } from "@/lib/auth/tokens";
import { appUrl, queueBrandedEmail } from "@/lib/email";
import { cop, cotizar, PLAN_LABEL } from "./precios";

export type ConjuntoCotizado = { nombre?: string | null; ciudad?: string | null; unidades?: number | null };

export type SolicitudCotizacion = {
  cantidad: number;
  conjuntos: ConjuntoCotizado[];
  nombre: string;
  cargo?: string | null;
  empresa?: string | null;
  nit?: string | null;
  email: string;
  telefono: string;
  ciudad?: string | null;
  mensaje?: string | null;
  origen?: string | null;
};

const VIGENCIA_DIAS = 30;

async function siguienteNumero(anio: number) {
  const prefijo = `COT-${anio}-`;
  const ultima = await prisma.cotizacionComercial.findFirst({ where: { numero: { startsWith: prefijo } }, orderBy: { numero: "desc" }, select: { numero: true } });
  const n = ultima ? Number(ultima.numero.slice(prefijo.length)) + 1 : 1;
  return `${prefijo}${String(n).padStart(4, "0")}`;
}

/** Correos que reciben las cotizaciones nuevas: VENTAS_EMAIL (separados por coma) o los SuperAdmin. */
async function correosVentas() {
  const env = (process.env.VENTAS_EMAIL ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (env.length) return env;
  const admins = await prisma.usuario.findMany({ where: { esSuperAdmin: true, deletedAt: null, estado: "ACTIVO" }, select: { email: true } });
  return admins.map((a) => a.email);
}

/** Guarda la cotización (el precio se recalcula aquí; nunca se confía en el cliente) y avisa al cliente y a ventas. */
export async function crearCotizacionComercial(input: SolicitudCotizacion, meta?: { ip?: string | null }) {
  const c = cotizar(input.cantidad);
  if (c.cantidad !== input.cantidad) throw new AppError("Cantidad de conjuntos no válida.");
  const conjuntos = input.conjuntos
    .slice(0, c.cantidad)
    .map((x) => ({ nombre: x.nombre?.trim() || null, ciudad: x.ciudad?.trim() || null, unidades: x.unidades && x.unidades > 0 ? Math.floor(x.unidades) : null }));
  const ahora = new Date();
  let creada: CotizacionComercial | null = null;
  for (let intento = 0; intento < 5 && !creada; intento++) {
    try {
      creada = await prisma.cotizacionComercial.create({
        data: {
          numero: await siguienteNumero(ahora.getFullYear()),
          token: randomToken(24),
          plan: c.plan,
          cantidad: c.cantidad,
          conjuntos,
          precioUnitario: c.precioUnitario,
          subtotal: c.subtotal,
          descuentoPct: c.descuentoPct,
          descuento: c.descuento,
          total: c.total,
          nombre: input.nombre.trim(),
          cargo: input.cargo?.trim() || null,
          empresa: input.empresa?.trim() || null,
          nit: input.nit?.trim() || null,
          email: input.email.trim().toLowerCase(),
          telefono: input.telefono.trim(),
          ciudad: input.ciudad?.trim() || null,
          mensaje: input.mensaje?.trim() || null,
          origen: input.origen ?? "precios",
          ip: meta?.ip ?? null,
          validaHasta: new Date(ahora.getTime() + VIGENCIA_DIAS * 86400000),
        },
      });
    } catch (e) {
      // Dos solicitudes simultáneas pueden tomar el mismo consecutivo: se reintenta con el siguiente.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
  }
  if (!creada) throw new AppError("No pudimos registrar la cotización. Intenta de nuevo.");

  const pdf = appUrl(`/api/cotizaciones/${creada.token}/pdf`);
  const resumen = `${c.cantidad} conjunto(s) · ${PLAN_LABEL[c.plan]} · ${cop(c.precioUnitario)} por conjunto al año${c.descuento ? ` · descuento 10 % (${cop(c.descuento)})` : ""} · total anual ${cop(c.total)}`;
  await queueBrandedEmail(creada.email, `Tu cotización ${creada.numero} de Conjunto360`, {
    titulo: `Cotización ${creada.numero}`,
    parrafos: [
      `Hola ${creada.nombre.split(" ")[0]}, gracias por tu interés en Conjunto360.`,
      resumen,
      `La cotización es válida hasta el ${creada.validaHasta.toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}. Un asesor te contactará en menos de un día hábil para agendar una demostración.`,
    ],
    boton: { texto: "Descargar cotización (PDF)", url: pdf },
  });
  const ventas = await correosVentas();
  for (const to of ventas) {
    await queueBrandedEmail(to, `Nueva cotización ${creada.numero}: ${c.cantidad} conjunto(s), ${cop(c.total)}`, {
      titulo: `Nueva cotización ${creada.numero}`,
      parrafos: [
        `${creada.nombre}${creada.cargo ? ` (${creada.cargo})` : ""}${creada.empresa ? ` · ${creada.empresa}` : ""}`,
        `${creada.email} · ${creada.telefono}${creada.ciudad ? ` · ${creada.ciudad}` : ""}`,
        resumen,
        ...(creada.mensaje ? [`Mensaje: ${creada.mensaje}`] : []),
      ],
      boton: { texto: "Ver en el panel", url: appUrl("/superadmin/cotizaciones") },
    });
  }
  return { numero: creada.numero, token: creada.token, pdf: `/api/cotizaciones/${creada.token}/pdf`, total: c.total };
}

export async function cotizacionPorToken(token: string) {
  if (!/^[A-Za-z0-9_-]{16,}$/.test(token)) return null;
  return prisma.cotizacionComercial.findUnique({ where: { token } });
}

export async function listarCotizaciones(f: { estado?: EstadoCotizacionComercial | null; q?: string | null }) {
  return prisma.cotizacionComercial.findMany({
    where: {
      ...(f.estado ? { estado: f.estado } : {}),
      ...(f.q ? { OR: [{ numero: { contains: f.q, mode: "insensitive" } }, { nombre: { contains: f.q, mode: "insensitive" } }, { empresa: { contains: f.q, mode: "insensitive" } }, { email: { contains: f.q, mode: "insensitive" } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function actualizarCotizacion(id: string, data: { estado: EstadoCotizacionComercial; notas?: string | null }) {
  return prisma.cotizacionComercial.update({ where: { id }, data: { estado: data.estado, notas: data.notas ?? null } });
}
