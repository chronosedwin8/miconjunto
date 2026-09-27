import { prisma, daysAgo, type SeedState } from "./util";

/**
 * Plan de emergencia del conjunto demo: puntos de encuentro, teléfonos, 6 brigadistas (residentes adultos)
 * y 2 simulacros registrados. No usa `rng` para no alterar los datos de los módulos siguientes.
 */
export async function seedEmergencias(s: SeedState) {
  const { conjuntoId, now } = s;
  // Idempotente: limpia sus propias filas antes de crearlas (para `scripts/seed-uno.ts`).
  await prisma.brigadista.deleteMany({ where: { conjuntoId } });
  await prisma.simulacro.deleteMany({ where: { conjuntoId } });
  // El aprovisionamiento del conjunto ya crea un plan básico: aquí se completa.
  await prisma.planEmergencia.upsert({
    where: { conjuntoId },
    create: { conjuntoId },
    update: {
      puntosEncuentro: [
        { nombre: "Punto 1 — Parque infantil", ubicacion: "Zona verde frente a la Torre 1 (torres 1 y 2)" },
        { nombre: "Punto 2 — Cancha múltiple", ubicacion: "Costado sur, junto a la portería vehicular (Torre 3 y casas)" },
        { nombre: "Punto alterno — Parqueadero de visitantes", ubicacion: "Entrada principal, si los puntos 1 y 2 no son seguros" },
      ],
      telefonosEmergencia: [
        { nombre: "Portería principal", numero: "6053851200" },
        { nombre: "Administración", numero: "3005551234" },
        { nombre: "Línea única de emergencias", numero: "123" },
        { nombre: "Bomberos Barranquilla", numero: "119" },
        { nombre: "Cruz Roja", numero: "132" },
        { nombre: "Defensa Civil", numero: "144" },
      ],
      instrucciones: [
        "Conserva la calma y sigue las indicaciones de los brigadistas (chaleco naranja).",
        "No uses los ascensores. Evacúa por las escaleras, siempre por la derecha y sin correr.",
        "Si hay humo, desplázate agachado y cubre nariz y boca con un paño húmedo.",
        "Antes de salir, cierra las llaves del gas y desconecta los aparatos eléctricos si es seguro hacerlo.",
        "Dirígete al punto de encuentro de tu torre y repórtate con el coordinador de la brigada.",
        "Si alguien de tu unidad necesita ayuda para evacuar, avisa de inmediato a portería (botón de pánico en la app).",
        "No regreses a tu unidad hasta que la administración o los organismos de socorro lo autoricen.",
      ].join("\n"),
    },
  });

  // Brigadistas: propietarios adultos (18-65) con cuenta o sin ella, uno por rol y torre.
  const candidatos = await prisma.persona.findMany({
    where: {
      conjuntoId,
      anonimizada: false,
      movilidadReducida: false,
      fechaNacimiento: { lte: new Date(now.getFullYear() - 25, 0, 1), gte: new Date(now.getFullYear() - 62, 0, 1) },
      vinculos: { some: { tipo: "PROPIETARIO", estado: "ACTIVO" } },
    },
    include: { vinculos: { where: { tipo: "PROPIETARIO" }, include: { unidad: { include: { torre: true } } }, take: 1 } },
    orderBy: { numeroDocumento: "asc" },
    take: 40,
  });
  const ricardo = await prisma.persona.findFirst({ where: { conjuntoId, email: "consejo@demo.co" } });
  const roles = ["COORDINADOR", "EVACUACION", "EVACUACION", "PRIMEROS_AUXILIOS", "PRIMEROS_AUXILIOS", "CONTRA_INCENDIO"] as const;
  const elegidos = [...(ricardo ? [ricardo.id] : []), ...candidatos.filter((c) => c.id !== ricardo?.id).map((c) => c.id)];
  const porId = new Map(candidatos.map((c) => [c.id, c]));
  const torres = ["Torre 1", "Torre 2", "Torre 3"];
  for (let i = 0; i < roles.length && i < elegidos.length; i++) {
    const c = porId.get(elegidos[i]);
    const persona = c ?? ricardo!;
    const torre = c?.vinculos[0]?.unidad.torre?.nombre ?? (i === 0 ? "Todo el conjunto" : torres[i % 3]);
    await prisma.brigadista.create({
      data: {
        conjuntoId,
        personaId: persona.id,
        nombre: `${persona.nombres} ${persona.apellidos}`,
        rol: roles[i],
        torreNombre: i === 0 ? "Todo el conjunto" : torre,
        telefono: persona.telefono,
      },
    });
  }

  await prisma.simulacro.createMany({
    data: [
      {
        conjuntoId,
        fecha: daysAgo(now, 330, 10),
        tipo: "Simulacro nacional de respuesta a emergencias",
        participantes: 142,
        tiempoEvacuacionMin: 9,
        observaciones: "La Torre 3 tardó más por la escalera norte obstruida con bicicletas. Se señalizó la ruta y se retiraron objetos.",
      },
      {
        conjuntoId,
        fecha: daysAgo(now, 120, 9),
        tipo: "Evacuación por sismo",
        participantes: 118,
        tiempoEvacuacionMin: 7,
        observaciones: "Se mejoró 2 minutos frente al anterior. Las 3 personas con movilidad reducida fueron asistidas por los brigadistas asignados.",
      },
    ],
  });
}
