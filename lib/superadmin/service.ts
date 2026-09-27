import { prisma } from "@/lib/db";
import { crearConjunto } from "@/lib/conjunto/provision";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { systemCtx } from "@/lib/auth/system-ctx";
import { invitarUsuario } from "@/lib/usuarios/service";
import { allJobs } from "@/jobs/registry";
import "@/jobs/definitions";

export async function resumenPlataforma() {
  const [conjuntos, usuarios, unidades, planes, porEstado] = await Promise.all([
    prisma.conjunto.findMany({
      where: { deletedAt: null },
      include: { plan: true, _count: { select: { unidades: { where: { deletedAt: null } }, membresias: { where: { deletedAt: null } } } } },
      orderBy: { nombre: "asc" },
    }),
    prisma.usuario.count({ where: { deletedAt: null } }),
    prisma.unidad.count({ where: { deletedAt: null } }),
    prisma.planSuscripcion.findMany({ where: { deletedAt: null }, orderBy: { precioMensual: "asc" } }),
    prisma.conjunto.groupBy({ by: ["estado"], where: { deletedAt: null }, _count: true }),
  ]);
  return { conjuntos, usuarios, unidades, planes, porEstado };
}

/** Salud de integraciones y worker: último job ejecutado por nombre (tablas de pg-boss). */
export async function saludJobs() {
  const defs = allJobs();
  try {
    const rows = await prisma.$queryRawUnsafe<{ name: string; state: string; completed_on: Date | null; created_on: Date; output: unknown }[]>(
      `SELECT DISTINCT ON (name) name, state, completed_on, created_on, output FROM pgboss.job ORDER BY name, created_on DESC`,
    );
    const counts = await prisma.$queryRawUnsafe<{ name: string; state: string; n: bigint }[]>(
      `SELECT name, state, count(*)::bigint AS n FROM pgboss.job WHERE created_on > now() - interval '7 days' GROUP BY name, state`,
    );
    return defs.map((d) => {
      const r = rows.find((x) => x.name === d.name);
      const c = counts.filter((x) => x.name === d.name);
      return {
        ...d,
        ultimoEstado: r?.state ?? null,
        ultimaEjecucion: r?.completed_on ?? r?.created_on ?? null,
        completados: Number(c.find((x) => x.state === "completed")?.n ?? 0),
        fallidos: Number(c.find((x) => x.state === "failed")?.n ?? 0),
      };
    });
  } catch {
    return defs.map((d) => ({ ...d, ultimoEstado: null, ultimaEjecucion: null, completados: 0, fallidos: 0 }));
  }
}

export async function nuevoConjunto(
  actor: { userId: string; nombre: string },
  input: {
    nombre: string;
    nit?: string | null;
    digitoVerificacion?: string | null;
    direccion?: string | null;
    ciudad?: string | null;
    departamento?: string | null;
    municipioCodigo?: string | null;
    telefono?: string | null;
    email?: string | null;
    tipo: "EDIFICIO" | "CONJUNTO_CASAS" | "MIXTO";
    planId?: string | null;
    adminEmail?: string | null;
    adminNombre?: string | null;
    fechaInicioOperacion?: Date | null;
  },
) {
  const { conjunto } = await crearConjunto(prisma, input);
  await audit({ userId: actor.userId, nombre: actor.nombre, conjuntoId: conjunto.id }, "crear", "Conjunto", conjunto.id, undefined, { nombre: conjunto.nombre });
  if (input.adminEmail) {
    const ctx = await systemCtx(conjunto.id, { userId: actor.userId, nombre: actor.nombre });
    await invitarUsuario(ctx, { email: input.adminEmail, nombre: input.adminNombre, rolClave: "ADMINISTRADOR" });
  }
  return conjunto;
}

export async function actualizarConjuntoSaas(actor: { userId: string; nombre: string }, id: string, data: { estado?: "ACTIVO" | "SUSPENDIDO" | "EN_APERTURA" | "INACTIVO"; planId?: string | null; modulosActivos?: string[] }) {
  const antes = await prisma.conjunto.findUnique({ where: { id } });
  if (!antes) throw new AppError("El conjunto no existe");
  const c = await prisma.conjunto.update({ where: { id }, data });
  await audit({ userId: actor.userId, nombre: actor.nombre, conjuntoId: id }, "editar_saas", "Conjunto", id, { estado: antes.estado, planId: antes.planId, modulos: antes.modulosActivos }, data);
  return c;
}

export async function guardarPlan(input: { id?: string | null; nombre: string; descripcion?: string | null; precioMensual: number; precioUnidad: number; maxUnidades: number; modulos: string[]; activo: boolean }) {
  const { id, ...data } = input;
  return id ? prisma.planSuscripcion.update({ where: { id }, data }) : prisma.planSuscripcion.create({ data });
}

export const MODULOS_SAAS = [
  { value: "cartera", label: "Cartera y pagos" },
  { value: "porteria", label: "Portería" },
  { value: "reservas", label: "Reservas" },
  { value: "tickets", label: "PQRS" },
  { value: "comunicaciones", label: "Comunicaciones" },
  { value: "asambleas", label: "Asambleas" },
  { value: "votaciones", label: "Votaciones" },
  { value: "mantenimiento", label: "Mantenimiento" },
  { value: "facturacion", label: "Facturación electrónica" },
  { value: "estadisticas", label: "Estadísticas" },
  { value: "api", label: "API y webhooks" },
  { value: "ia", label: "Asistente IA" },
];
