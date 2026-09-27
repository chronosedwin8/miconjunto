import type { TipoVinculo } from "@prisma/client";
import { prisma, persona, fechaNacimiento, telefono, placaCarro, placaMoto, EPS, type SeedState } from "./util";

/**
 * ~160 personas: propietarios (algunos con varias unidades), arrendatarios en las 10 unidades arrendadas,
 * grupos familiares con menores y adultos mayores, 3 personas con movilidad reducida, empleados domésticos,
 * cuidadores y autorizados. Vincula a los usuarios demo con sus unidades.
 */
export async function seedPersonas(s: SeedState) {
  const { conjuntoId, rng } = s;
  const unidades = await prisma.unidad.findMany({ where: { conjuntoId }, orderBy: { codigo: "asc" }, include: { parqueaderos: true } });
  const byCode = new Map(unidades.map((u) => [u.codigo, u]));
  let doc = 10_000_000;
  const nuevaPersona = async (data: { nombres: string; apellidos: string; genero?: string; fechaNacimiento?: Date; usuarioId?: string; email?: string | null; movilidad?: string; tipoDocumento?: "CC" | "TI" | "RC" | "CE" }) => {
    doc += rng.int(1000, 90000);
    return prisma.persona.create({
      data: {
        conjuntoId,
        tipoDocumento: data.tipoDocumento ?? "CC",
        numeroDocumento: String(doc),
        nombres: data.nombres,
        apellidos: data.apellidos,
        genero: data.genero,
        fechaNacimiento: data.fechaNacimiento,
        telefono: telefono(rng),
        email: data.email ?? `${data.nombres.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}.${String(doc).slice(-4)}@correo.co`,
        eps: rng.pick(EPS),
        usuarioId: data.usuarioId,
        contactoEmergenciaNombre: `${rng.pick(["Hermano", "Hija", "Esposo", "Madre"])} de ${data.nombres}`,
        contactoEmergenciaTelefono: telefono(rng),
        tipoSangre: rng.pick(["O+", "A+", "B+", "O-", "AB+"]),
        movilidadReducida: !!data.movilidad,
        movilidadDescripcion: data.movilidad ?? null,
        requiereAsistenciaEvacuacion: !!data.movilidad,
        consentimientoDatosEn: rng.chance(0.8) ? new Date() : null,
        consentimientoVersion: "1.0",
        directorioOptIn: rng.chance(0.25),
        directorioCampos: ["nombre", "unidad", "telefono"],
        serviciosOfrecidos: rng.chance(0.08) ? rng.pick(["Clases de inglés", "Repostería por encargo", "Paseo de perros", "Plomería", "Asesoría contable"]) : null,
      },
    });
  };
  const vincular = (personaId: string, unidadId: string, tipo: TipoVinculo, extra: { principal?: boolean; porcentaje?: number; horario?: object; puedeVerCuenta?: boolean } = {}) =>
    prisma.vinculoUnidad.create({
      data: {
        conjuntoId,
        personaId,
        unidadId,
        tipo,
        principal: extra.principal ?? false,
        porcentajePropiedad: extra.porcentaje ?? null,
        horarioPermitido: extra.horario ?? undefined,
        puedeVerCuenta: extra.puedeVerCuenta ?? false,
        fechaInicio: new Date(Date.now() - rng.int(60, 2400) * 86400000),
      },
    });

  // ── Usuarios demo ──
  const t1101 = byCode.get("T1-101")!;
  const t2302 = byCode.get("T2-302")!;
  const t3804 = byCode.get("T3-804")!;
  const laura = await nuevaPersona({ nombres: "Laura", apellidos: "Gómez Fontalvo", genero: "Femenino", fechaNacimiento: fechaNacimiento(rng, 42, 45), usuarioId: s.users.propietario, email: "propietario@demo.co" });
  await vincular(laura.id, t1101.id, "PROPIETARIO", { principal: true, porcentaje: 100 });
  const vale = await nuevaPersona({ nombres: "Valentina", apellidos: "Gómez Fontalvo", genero: "Femenino", fechaNacimiento: fechaNacimiento(rng, 19, 21), usuarioId: s.users.conviviente, email: "conviviente@demo.co" });
  await vincular(vale.id, t1101.id, "FAMILIAR");
  const nino = await nuevaPersona({ nombres: "Tomás", apellidos: "Gómez Fontalvo", genero: "Masculino", fechaNacimiento: fechaNacimiento(rng, 8, 9), tipoDocumento: "TI" });
  await vincular(nino.id, t1101.id, "FAMILIAR");
  const empleada = await nuevaPersona({ nombres: "Rosa", apellidos: "Polo Barraza", genero: "Femenino", fechaNacimiento: fechaNacimiento(rng, 40, 55) });
  await vincular(empleada.id, t1101.id, "EMPLEADO_DOMESTICO", { horario: { dias: [1, 2, 3, 4, 5], desde: "07:00", hasta: "16:00" } });
  const abuelo = await nuevaPersona({ nombres: "Hernando", apellidos: "Gómez Pardo", genero: "Masculino", fechaNacimiento: fechaNacimiento(rng, 78, 80), movilidad: "Usa silla de ruedas. Requiere ayuda para bajar escaleras." });
  await vincular(abuelo.id, t1101.id, "FAMILIAR");
  await prisma.unidad.update({ where: { id: t1101.id }, data: { tienePersonaMovilidadReducida: true, requiereAsistenciaEvacuacion: true } });

  const dueñoT2302 = await nuevaPersona({ ...persona(rng, "M"), fechaNacimiento: fechaNacimiento(rng, 50, 65) });
  await vincular(dueñoT2302.id, t2302.id, "PROPIETARIO", { principal: true, porcentaje: 100 });
  const andres = await nuevaPersona({ nombres: "Andrés", apellidos: "Pérez Rojas", genero: "Masculino", fechaNacimiento: fechaNacimiento(rng, 30, 34), usuarioId: s.users.residente, email: "residente@demo.co" });
  await vincular(andres.id, t2302.id, "ARRENDATARIO", { principal: true });

  const ricardo = await nuevaPersona({ nombres: "Ricardo", apellidos: "Charris Orozco", genero: "Masculino", fechaNacimiento: fechaNacimiento(rng, 55, 60), usuarioId: s.users.consejo, email: "consejo@demo.co" });
  await vincular(ricardo.id, t3804.id, "PROPIETARIO", { principal: true, porcentaje: 100 });

  // ── Resto de unidades ──
  const usadas = new Set([t1101.id, t2302.id, t3804.id]);
  const inversionistas: string[] = [];
  let movilidadExtra = 2;
  for (const u of unidades) {
    if (usadas.has(u.id)) continue;
    const arrendada = u.estadoOcupacion === "ARRENDADA";
    const airbnb = u.estadoOcupacion === "AIRBNB_O_SIMILAR";
    const vacia = u.estadoOcupacion === "DESOCUPADA" || u.estadoOcupacion === "EN_VENTA";
    // propietario (a veces un inversionista con varias unidades)
    let ownerId: string;
    if ((arrendada || airbnb || vacia) && inversionistas.length && rng.chance(0.5)) ownerId = rng.pick(inversionistas);
    else {
      const p = await nuevaPersona({ ...persona(rng), fechaNacimiento: fechaNacimiento(rng, 32, 75) });
      ownerId = p.id;
      if (arrendada || airbnb) inversionistas.push(p.id);
    }
    const copro = !arrendada && !airbnb && rng.chance(0.18);
    await vincular(ownerId, u.id, "PROPIETARIO", { principal: true, porcentaje: copro ? 50 : 100 });
    if (copro) {
      const c = await nuevaPersona({ ...persona(rng), fechaNacimiento: fechaNacimiento(rng, 32, 70) });
      await vincular(c.id, u.id, "COPROPIETARIO", { porcentaje: 50 });
    }
    if (arrendada) {
      const a = await nuevaPersona({ ...persona(rng), fechaNacimiento: fechaNacimiento(rng, 25, 55) });
      await vincular(a.id, u.id, "ARRENDATARIO", { principal: true, puedeVerCuenta: rng.chance(0.5) });
      if (rng.chance(0.5)) {
        const f = await nuevaPersona({ ...persona(rng), fechaNacimiento: fechaNacimiento(rng, 3, 16), tipoDocumento: "TI" });
        await vincular(f.id, u.id, "FAMILIAR");
      }
      continue;
    }
    if (airbnb || vacia) continue;
    // grupo familiar ocasional (se mantiene el total cerca de 160 personas)
    if (rng.chance(0.14)) {
      const hijo = await nuevaPersona({ ...persona(rng), fechaNacimiento: fechaNacimiento(rng, 2, 17), tipoDocumento: rng.chance(0.5) ? "TI" : "RC" });
      await vincular(hijo.id, u.id, "FAMILIAR");
    }
    if (rng.chance(0.06)) {
      const mayor = await nuevaPersona({ ...persona(rng), fechaNacimiento: fechaNacimiento(rng, 68, 90), movilidad: movilidadExtra-- > 0 ? "Movilidad reducida: usa caminador." : undefined });
      await vincular(mayor.id, u.id, "FAMILIAR");
      if (mayor.movilidadReducida) await prisma.unidad.update({ where: { id: u.id }, data: { tienePersonaMovilidadReducida: true, requiereAsistenciaEvacuacion: true } });
    }
    if (rng.chance(0.03)) {
      const emp = await nuevaPersona({ ...persona(rng, "F"), fechaNacimiento: fechaNacimiento(rng, 30, 60) });
      await vincular(emp.id, u.id, rng.chance(0.5) ? "EMPLEADO_DOMESTICO" : "CUIDADOR", { horario: { dias: [1, 2, 3, 4, 5, 6], desde: "07:00", hasta: "17:00" } });
    }
  }

  // ── Vehículos (≈70) y mascotas (≈35) ──
  const residenciales = unidades.filter((u) => u.estadoOcupacion !== "DESOCUPADA");
  const placas = new Set<string>();
  const marcas = ["Mazda", "Chevrolet", "Renault", "Kia", "Toyota", "Nissan", "Hyundai", "Volkswagen"];
  const colores = ["Blanco", "Gris", "Negro", "Rojo", "Azul", "Plata"];
  let nVeh = 0;
  for (const u of rng.shuffle(residenciales)) {
    if (nVeh >= 70) break;
    const moto = rng.chance(0.2);
    let placa = moto ? placaMoto(rng) : placaCarro(rng);
    while (placas.has(placa)) placa = placaCarro(rng);
    placas.add(placa);
    const venceSoat = new Date(Date.now() + rng.int(-20, 330) * 86400000);
    await prisma.vehiculo.create({
      data: {
        conjuntoId,
        unidadId: u.id,
        placa,
        tipo: moto ? "MOTO" : "CARRO",
        marca: moto ? rng.pick(["Yamaha", "AKT", "Honda", "Suzuki"]) : rng.pick(marcas),
        modelo: String(rng.int(2012, 2026)),
        color: rng.pick(colores),
        soatVence: venceSoat,
        tecnomecanicaVence: new Date(venceSoat.getTime() + rng.int(-60, 60) * 86400000),
        parqueaderoId: !moto ? (u.parqueaderos[0]?.id ?? null) : null,
      },
    });
    nVeh++;
  }
  const t1101Veh = await prisma.vehiculo.findFirst({ where: { unidadId: t1101.id } });
  if (!t1101Veh) await prisma.vehiculo.create({ data: { conjuntoId, unidadId: t1101.id, placa: "JKL482", tipo: "CARRO", marca: "Mazda", modelo: "2022", color: "Rojo", soatVence: new Date(Date.now() + 12 * 86400000), parqueaderoId: t1101.parqueaderos[0]?.id } });

  const nombresMascota = ["Luna", "Max", "Rocky", "Coco", "Toby", "Nala", "Simba", "Kira", "Bruno", "Lola", "Milo", "Canela"];
  for (let i = 0; i < 35; i++) {
    const u = i === 0 ? t1101 : rng.pick(residenciales);
    const perro = rng.chance(0.65);
    const raza = perro ? rng.pick(["Criollo", "French poodle", "Labrador", "Schnauzer", "Pitbull", "Golden retriever", "Shih Tzu"]) : rng.pick(["Criollo", "Siamés", "Persa"]);
    await prisma.mascota.create({
      data: {
        conjuntoId,
        unidadId: u.id,
        nombre: rng.pick(nombresMascota),
        especie: perro ? "Perro" : "Gato",
        raza,
        color: rng.pick(["Café", "Negro", "Blanco", "Atigrado", "Dorado"]),
        antirrabicaVence: new Date(Date.now() + rng.int(-40, 300) * 86400000),
        potencialmentePeligrosa: raza === "Pitbull",
        microchip: rng.chance(0.3) ? `985${rng.int(100000000, 999999999)}` : null,
      },
    });
  }
}
