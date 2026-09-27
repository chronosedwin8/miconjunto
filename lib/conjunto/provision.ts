import type { Prisma, PrismaClient, TipoConjunto } from "@prisma/client";
import { DEFAULT_ROLE_PERMS, ROLES_BASE, ROL_LABEL, permCatalog } from "@/lib/permisos/catalog";
import { configSchema } from "./config";

type Tx = PrismaClient | Prisma.TransactionClient;

/** Sincroniza el catálogo de permisos del código con la tabla `Permiso`. */
export async function syncPermisos(db: Tx) {
  for (const p of permCatalog()) {
    await db.permiso.upsert({ where: { clave: p.clave }, create: p, update: { descripcion: p.descripcion, modulo: p.modulo, accion: p.accion, tipo: p.tipo } });
  }
}

export const CONCEPTOS_BASE = [
  { nombre: "Cuota de administración", tipo: "ADMINISTRACION", cuentaContable: "417005" },
  { nombre: "Intereses de mora", tipo: "INTERES_MORA", cuentaContable: "421005" },
  { nombre: "Cuota extraordinaria", tipo: "EXTRAORDINARIA", cuentaContable: "417010" },
  { nombre: "Multa por convivencia", tipo: "MULTA", cuentaContable: "425050" },
  { nombre: "Alquiler de zonas comunes", tipo: "ALQUILER_ZONA", cuentaContable: "415540", gravaIva: true, tarifaIva: 19, facturaElectronica: true },
  { nombre: "Parqueadero de visitantes", tipo: "PARQUEADERO", cuentaContable: "415545", gravaIva: true, tarifaIva: 19, facturaElectronica: true },
  { nombre: "Otros cobros", tipo: "OTRO", cuentaContable: "425095" },
] as const;

export const INFRACCIONES_BASE = [
  { codigo: "RUI-01", nombre: "Ruido excesivo en horario de descanso", valorSugerido: 150000, gravedad: "MODERADA", articulo: "Manual de convivencia, art. 12" },
  { codigo: "MAS-01", nombre: "Mascota sin traílla en zonas comunes", valorSugerido: 100000, gravedad: "LEVE", articulo: "Ley 746 de 2002; Manual art. 20" },
  { codigo: "MAS-02", nombre: "No recoger excrementos de mascota", valorSugerido: 120000, gravedad: "LEVE", articulo: "Manual art. 21" },
  { codigo: "PAR-01", nombre: "Parqueo en zona no autorizada", valorSugerido: 80000, gravedad: "LEVE", articulo: "Manual art. 30" },
  { codigo: "BAS-01", nombre: "Disposición indebida de basuras", valorSugerido: 90000, gravedad: "LEVE", articulo: "Manual art. 35" },
  { codigo: "ZON-01", nombre: "Daño a zonas comunes", valorSugerido: 300000, gravedad: "GRAVE", articulo: "Ley 675/2001 art. 59; Manual art. 40" },
  { codigo: "OBR-01", nombre: "Obra fuera del horario permitido", valorSugerido: 200000, gravedad: "MODERADA", articulo: "Manual art. 45" },
] as const;

export function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

/** Crea los roles base del conjunto con la matriz de permisos por defecto. */
export async function crearRolesBase(db: Tx, conjuntoId: string) {
  const roles: Record<string, string> = {};
  for (const clave of ROLES_BASE) {
    const rol = await db.rol.upsert({
      where: { conjuntoId_clave: { conjuntoId, clave } },
      create: { conjuntoId, clave, nombre: ROL_LABEL[clave], base: true, basadoEnClave: clave },
      update: {},
    });
    roles[clave] = rol.id;
    const existentes = await db.rolPermiso.count({ where: { rolId: rol.id } });
    if (existentes === 0) {
      await db.rolPermiso.createMany({
        data: DEFAULT_ROLE_PERMS[clave].map((p) => ({ conjuntoId, rolId: rol.id, permisoClave: p })),
        skipDuplicates: true,
      });
    }
  }
  return roles;
}

export async function crearConjunto(
  db: Tx,
  data: {
    nombre: string;
    nit?: string | null;
    digitoVerificacion?: string | null;
    direccion?: string | null;
    ciudad?: string | null;
    departamento?: string | null;
    municipioCodigo?: string | null;
    telefono?: string | null;
    email?: string | null;
    tipo?: TipoConjunto;
    planId?: string | null;
    colorPrimario?: string | null;
    fechaInicioOperacion?: Date | null;
    responsableIva?: boolean;
    config?: object;
  },
) {
  let slug = slugify(data.nombre) || "conjunto";
  if (await db.conjunto.findUnique({ where: { slug } })) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  const config = configSchema.parse(data.config ?? {});
  const conjunto = await db.conjunto.create({
    data: {
      nombre: data.nombre,
      slug,
      nit: data.nit,
      digitoVerificacion: data.digitoVerificacion,
      direccion: data.direccion,
      ciudad: data.ciudad,
      departamento: data.departamento,
      municipioCodigo: data.municipioCodigo,
      telefono: data.telefono,
      email: data.email,
      tipo: data.tipo ?? "MIXTO",
      planId: data.planId,
      colorPrimario: data.colorPrimario ?? "#0f766e",
      fechaInicioOperacion: data.fechaInicioOperacion ?? new Date(),
      responsableIva: data.responsableIva ?? false,
      config: config as object,
      estado: "EN_APERTURA",
      modulosActivos: [],
    },
  });
  const roles = await crearRolesBase(db, conjunto.id);
  await db.conceptoCobro.createMany({
    data: CONCEPTOS_BASE.map((c) => ({ conjuntoId: conjunto.id, ...c, gravaIva: "gravaIva" in c ? c.gravaIva : false, tarifaIva: "tarifaIva" in c ? c.tarifaIva : 0, facturaElectronica: "facturaElectronica" in c ? c.facturaElectronica : false })),
  });
  await db.catalogoInfraccion.createMany({ data: INFRACCIONES_BASE.map((i) => ({ conjuntoId: conjunto.id, ...i })) });
  await db.tasaMora.create({
    data: { conjuntoId: conjunto.id, vigenteDesde: new Date(), tasaEfectivaAnual: config.cartera.tasaMoraEA, tasaMensual: config.cartera.tasaMoraMensual, fuente: "Valor por defecto (1,5 × IBC Superfinanciera)" },
  });
  await db.planEmergencia.create({
    data: {
      conjuntoId: conjunto.id,
      puntosEncuentro: [{ nombre: "Punto de encuentro principal", ubicacion: "Parqueadero de visitantes" }],
      telefonosEmergencia: [
        { nombre: "Línea única de emergencias", telefono: "123" },
        { nombre: "Bomberos", telefono: "119" },
        { nombre: "Policía", telefono: "112" },
        { nombre: "Cruz Roja", telefono: "132" },
      ],
      instrucciones: "Conserve la calma. Use las escaleras, nunca el ascensor. Diríjase al punto de encuentro y reporte su presencia al brigadista de su torre.",
    },
  });
  if (data.planId) {
    const plan = await db.planSuscripcion.findUnique({ where: { id: data.planId } });
    if (plan) {
      await db.suscripcion.create({ data: { conjuntoId: conjunto.id, planId: plan.id, inicio: new Date(), valor: plan.precioMensual, estado: "PRUEBA" } });
      await db.conjunto.update({ where: { id: conjunto.id }, data: { modulosActivos: plan.modulos } });
    }
  }
  return { conjunto, roles };
}
