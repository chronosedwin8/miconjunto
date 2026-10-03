import { hashPassword } from "../../lib/auth/password";
import { randomToken, sha256 } from "../../lib/auth/tokens";
import { prisma, type SeedState } from "./util";

/**
 * Acceso derivado (idempotente, se puede re-ejecutar con `npx tsx scripts/seed-uno.ts 22-accesos`):
 * en T1-101 la titular Laura (propietario@demo.co) dio acceso a
 *  - Camilo, su esposo (familiar@demo.co): todas las capacidades del hogar, incluida la cuenta.
 *  - Rosa, la empleada doméstica (empleada@demo.co): solo visitantes y paquetes.
 * y dejó una invitación pendiente para la cuidadora del abuelo.
 */
const PASSWORD = "Demo1234*";
const TODAS = ["comunidad", "visitantes", "paquetes", "reservas", "pqrs", "obras", "vehiculos", "hogar", "cuenta"];

export async function seedAccesos(s: SeedState) {
  const { conjuntoId } = s;
  const unidad = await prisma.unidad.findFirst({ where: { conjuntoId, codigo: "T1-101" } });
  const laura = await prisma.usuario.findUnique({ where: { email: "propietario@demo.co" } });
  if (!unidad || !laura) throw new Error("Falta T1-101 o propietario@demo.co: ejecuta antes 20-personas");
  const titular = await prisma.vinculoUnidad.findFirst({
    where: { conjuntoId, unidadId: unidad.id, estado: "ACTIVO", deletedAt: null, persona: { usuarioId: laura.id } },
    orderBy: { principal: "desc" },
  });
  if (!titular) throw new Error("Laura no tiene vínculo activo con T1-101");
  const rolResidente = s.roles.RESIDENTE ?? (await prisma.rol.findFirstOrThrow({ where: { conjuntoId, clave: "RESIDENTE" } })).id;
  const hash = await hashPassword(PASSWORD);

  const usuario = async (email: string, nombre: string, telefono: string) => {
    const u = await prisma.usuario.upsert({
      where: { email },
      update: { nombre, estado: "ACTIVO", deletedAt: null, passwordHash: hash },
      create: { email, nombre, telefono, passwordHash: hash, politicaAceptadaEn: new Date(), politicaVersion: "1.0" },
    });
    await prisma.membresiaConjunto.upsert({
      where: { usuarioId_conjuntoId: { usuarioId: u.id, conjuntoId } },
      update: { rolId: rolResidente, estado: "ACTIVA", deletedAt: null },
      create: { usuarioId: u.id, conjuntoId, rolId: rolResidente },
    });
    return u;
  };

  /** Persona del usuario (la reutiliza si ya existe; si no, toma la persona sin cuenta indicada o crea una). */
  const persona = async (usuarioId: string, email: string, datos: { nombres: string; apellidos: string; documento: string; genero: string; nacimiento: Date }, reutilizar?: string) => {
    const ya = await prisma.persona.findFirst({ where: { conjuntoId, usuarioId, deletedAt: null } });
    if (ya) return ya;
    if (reutilizar) return prisma.persona.update({ where: { id: reutilizar }, data: { usuarioId, email, consentimientoDatosEn: new Date(), consentimientoVersion: "1.0" } });
    const dup = await prisma.persona.findFirst({ where: { conjuntoId, tipoDocumento: "CC", numeroDocumento: datos.documento } });
    if (dup) return prisma.persona.update({ where: { id: dup.id }, data: { usuarioId, email } });
    return prisma.persona.create({
      data: {
        conjuntoId,
        usuarioId,
        email,
        tipoDocumento: "CC",
        numeroDocumento: datos.documento,
        nombres: datos.nombres,
        apellidos: datos.apellidos,
        genero: datos.genero,
        fechaNacimiento: datos.nacimiento,
        telefono: "3005550101",
        consentimientoDatosEn: new Date(),
        consentimientoVersion: "1.0",
      },
    });
  };

  const vincular = async (personaId: string, tipo: "FAMILIAR" | "EMPLEADO_DOMESTICO", capacidades: string[], horario?: object) => {
    const data = { derivadoDeId: titular.id, capacidadesHogar: capacidades, puedeVerCuenta: capacidades.includes("cuenta"), accesoPausado: false, estado: "ACTIVO" as const, fechaFin: null };
    const v = await prisma.vinculoUnidad.findFirst({ where: { conjuntoId, personaId, unidadId: unidad.id, tipo, deletedAt: null } });
    if (v) return prisma.vinculoUnidad.update({ where: { id: v.id }, data });
    return prisma.vinculoUnidad.create({ data: { conjuntoId, personaId, unidadId: unidad.id, tipo, horarioPermitido: horario, ...data } });
  };

  // Esposo de Laura: acceso completo del hogar.
  const camilo = await usuario("familiar@demo.co", "Camilo Rincón Díaz", "3005550101");
  const pCamilo = await persona(camilo.id, "familiar@demo.co", { nombres: "Camilo", apellidos: "Rincón Díaz", documento: "72345611", genero: "Masculino", nacimiento: new Date(1981, 4, 12) });
  await vincular(pCamilo.id, "FAMILIAR", TODAS);

  // Rosa, la empleada doméstica que 20-personas registró sin cuenta: ahora entra con visitantes y paquetes.
  const rosa = await usuario("empleada@demo.co", "Rosa Polo Barraza", "3005550202");
  const rosaSinCuenta = await prisma.persona.findFirst({
    where: { conjuntoId, usuarioId: null, nombres: "Rosa", apellidos: "Polo Barraza", vinculos: { some: { unidadId: unidad.id, tipo: "EMPLEADO_DOMESTICO" } } },
  });
  const pRosa = await persona(
    rosa.id,
    "empleada@demo.co",
    { nombres: "Rosa", apellidos: "Polo Barraza", documento: "32765409", genero: "Femenino", nacimiento: new Date(1975, 1, 3) },
    rosaSinCuenta?.id,
  );
  await vincular(pRosa.id, "EMPLEADO_DOMESTICO", ["visitantes", "paquetes"], { dias: [1, 2, 3, 4, 5], desde: "07:00", hasta: "16:00" });

  // Invitación pendiente (cuidadora del abuelo Hernando).
  const emailCuidadora = "marta.cuidadora@correo.co";
  await prisma.invitacion.updateMany({ where: { conjuntoId, email: emailCuidadora, estado: "PENDIENTE" }, data: { estado: "REVOCADA" } });
  await prisma.invitacion.create({
    data: {
      conjuntoId,
      email: emailCuidadora,
      nombre: "Marta Cabarcas",
      telefono: "3015550303",
      unidadId: unidad.id,
      rolClave: "RESIDENTE",
      tipoVinculo: "CUIDADOR",
      invitadoPorId: laura.id,
      derivadoDeId: titular.id,
      capacidadesHogar: ["visitantes", "paquetes", "hogar"],
      tokenHash: sha256(randomToken()),
      expira: new Date(Date.now() + 10 * 86400000),
    },
  });
}
