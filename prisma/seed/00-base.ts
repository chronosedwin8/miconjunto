import { hashPassword } from "../../lib/auth/password";
import { crearConjunto, syncPermisos } from "../../lib/conjunto/provision";
import { prisma, type SeedState } from "./util";

export const DEMO_USERS = [
  { key: "administrador", email: "administrador@demo.co", nombre: "Adriana Méndez Polo", rol: "ADMINISTRADOR" },
  { key: "porteria", email: "porteria@demo.co", nombre: "Jhon Fredy Barrios", rol: "PORTERIA" },
  { key: "consejo", email: "consejo@demo.co", nombre: "Ricardo Charris Orozco", rol: "CONSEJO" },
  { key: "propietario", email: "propietario@demo.co", nombre: "Laura Gómez Fontalvo", rol: "PROPIETARIO" },
  { key: "residente", email: "residente@demo.co", nombre: "Andrés Pérez Rojas", rol: "RESIDENTE" },
  { key: "mantenimiento", email: "mantenimiento@demo.co", nombre: "Óscar Ramírez Díaz", rol: "MANTENIMIENTO" },
  { key: "contador", email: "contador@demo.co", nombre: "Sandra Vargas Castro", rol: "CONTADOR" },
  { key: "revisor", email: "revisor@demo.co", nombre: "Hernán Torres Ruiz", rol: "REVISOR_FISCAL" },
  { key: "asistente", email: "asistente@demo.co", nombre: "Catalina Moreno Díaz", rol: "ASISTENTE_ADMIN" },
  { key: "conviviente", email: "conviviente@demo.co", nombre: "Valentina Gómez Fontalvo", rol: "CONVIVIENTE" },
  { key: "porteria2", email: "porteria2@demo.co", nombre: "Luis Ortiz Mendoza", rol: "PORTERIA" },
  { key: "proveedor", email: "proveedor@demo.co", nombre: "Ascensores del Caribe S.A.S.", rol: "PROVEEDOR" },
] as const;

export async function seedBase(s: SeedState) {
  await syncPermisos(prisma);

  const planes = await Promise.all([
    prisma.planSuscripcion.create({
      data: { nombre: "Básico", descripcion: "Cartera, portería, PQRS y comunicaciones", precioMensual: 290000, precioUnidad: 1500, maxUnidades: 80, modulos: ["cartera", "porteria", "tickets", "comunicaciones", "reservas"] },
    }),
    prisma.planSuscripcion.create({
      data: {
        nombre: "Profesional",
        descripcion: "Todo el básico + asambleas, votaciones, mantenimiento, facturación electrónica y estadísticas",
        precioMensual: 590000,
        precioUnidad: 1200,
        maxUnidades: 300,
        modulos: ["cartera", "porteria", "tickets", "comunicaciones", "reservas", "asambleas", "votaciones", "mantenimiento", "facturacion", "estadisticas", "ia"],
      },
    }),
    prisma.planSuscripcion.create({
      data: { nombre: "Empresarial", descripcion: "Para administradoras con múltiples conjuntos; API y webhooks", precioMensual: 1490000, precioUnidad: 900, maxUnidades: 2000, modulos: ["*", "api", "ia"] },
    }),
  ]);

  const adminHash = await hashPassword("Admin1234*");
  const demoHash = await hashPassword("Demo1234*");

  const superadmin = await prisma.usuario.create({
    data: { email: "admin@miconjunto.co", nombre: "Equipo MiConjunto", passwordHash: adminHash, esSuperAdmin: true, politicaAceptadaEn: new Date(), politicaVersion: "1.0" },
  });
  s.users.superadmin = superadmin.id;

  const { conjunto, roles } = await crearConjunto(prisma, {
    nombre: "Conjunto Residencial Demo",
    nit: "901234567",
    digitoVerificacion: "8",
    direccion: "Carrera 51B # 94-120",
    ciudad: "Barranquilla",
    departamento: "Atlántico",
    municipioCodigo: "08001",
    telefono: "6053851234",
    email: "administracion@conjuntodemo.co",
    tipo: "MIXTO",
    planId: planes[1].id,
    colorPrimario: "#0f766e",
    fechaInicioOperacion: new Date(Date.UTC(2018, 0, 15)),
    responsableIva: true,
    config: {
      cartera: { calculoCuota: "COEFICIENTE", presupuestoMensual: 48_000_000, diaVencimiento: 10, diaProntoPago: 5, porcentajeProntoPago: 5 },
      facturacion: { proveedor: "SIMULADO", numberingRangeId: 8 },
      pagos: { pasarela: "SIMULADOR" },
      datos: { responsable: "Administración Conjunto Residencial Demo", emailContacto: "datos@conjuntodemo.co" },
      ia: { activo: true },
    },
  });
  await prisma.conjunto.update({
    where: { id: conjunto.id },
    data: {
      regimenTributario: "No responsable de IVA en expensas; responsable por alquiler de zonas comunes",
      matriculaInmobiliaria: "040-123456",
      personeriaJuridica: "Resolución 0456 de 2018 — Alcaldía de Barranquilla",
      paginaPublica: true,
      descripcionPublica:
        "Conjunto residencial de 3 torres y 20 casas en el norte de Barranquilla, con piscina, gimnasio, salón social y zonas verdes. Administración: lunes a viernes 8:00–17:00, sábados 8:00–12:00.",
    },
  });
  s.conjuntoId = conjunto.id;
  s.roles = roles;

  for (const u of DEMO_USERS) {
    const user = await prisma.usuario.create({
      data: {
        email: u.email,
        nombre: u.nombre,
        passwordHash: demoHash,
        telefono: `300${String(1000000 + DEMO_USERS.indexOf(u) * 1111).slice(0, 7)}`,
        politicaAceptadaEn: new Date(),
        politicaVersion: "1.0",
      },
    });
    s.users[u.key] = user.id;
    await prisma.membresiaConjunto.create({ data: { usuarioId: user.id, conjuntoId: conjunto.id, rolId: roles[u.rol] } });
  }

  // El administrador también gestiona un segundo conjunto (demuestra multi-conjunto).
  const { conjunto: otro, roles: rolesOtro } = await crearConjunto(prisma, {
    nombre: "Edificio Mirador del Parque",
    nit: "900765432",
    digitoVerificacion: "1",
    direccion: "Calle 84 # 45-20",
    ciudad: "Barranquilla",
    departamento: "Atlántico",
    municipioCodigo: "08001",
    tipo: "EDIFICIO",
    planId: planes[0].id,
    colorPrimario: "#1d4ed8",
  });
  await prisma.conjunto.update({ where: { id: otro.id }, data: { estado: "ACTIVO" } });
  await prisma.membresiaConjunto.create({ data: { usuarioId: s.users.administrador, conjuntoId: otro.id, rolId: rolesOtro.ADMINISTRADOR } });
  const torre = await prisma.torre.create({ data: { conjuntoId: otro.id, nombre: "Torre única", pisos: 10, ascensores: true } });
  for (let piso = 1; piso <= 10; piso++) {
    for (let n = 1; n <= 2; n++) {
      await prisma.unidad.create({
        data: { conjuntoId: otro.id, torreId: torre.id, codigo: `${piso}0${n}`, piso, tipo: "APARTAMENTO", coeficiente: 5, areaPrivada: 95, cuotaAdministracion: 520000 },
      });
    }
  }
}
