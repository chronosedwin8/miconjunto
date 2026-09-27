import { prisma, type SeedState } from "./util";

const HORARIO = (abre: string, cierra: string, dias = [0, 1, 2, 3, 4, 5, 6]) =>
  Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), dias.includes(d) ? { abre, cierra } : null]));

export async function seedEstructura(s: SeedState) {
  const { conjuntoId, rng } = s;
  const torres = [];
  for (let t = 1; t <= 3; t++) {
    torres.push(await prisma.torre.create({ data: { conjuntoId, nombre: `Torre ${t}`, pisos: 8, unidadesPorPiso: 4, ascensores: true, notas: t === 1 ? "Torre con cuarto de basuras en sótano" : null } }));
  }

  type U = { codigo: string; torreId: string | null; piso: number | null; tipo: "APARTAMENTO" | "CASA"; area: number; hab: number; banos: number };
  const unidades: U[] = [];
  torres.forEach((torre, ti) => {
    for (let piso = 1; piso <= 8; piso++) {
      for (let n = 1; n <= 4; n++) {
        const area = n === 1 || n === 4 ? 82.5 : 64.3; // esquineros más grandes
        unidades.push({ codigo: `T${ti + 1}-${piso}0${n}`, torreId: torre.id, piso, tipo: "APARTAMENTO", area, hab: area > 70 ? 3 : 2, banos: 2 });
      }
    }
  });
  for (let c = 1; c <= 20; c++) unidades.push({ codigo: `Casa ${c}`, torreId: null, piso: null, tipo: "CASA", area: c <= 10 ? 128 : 145.5, hab: 4, banos: 3 });

  // Coeficientes proporcionales al área privada que suman exactamente 100 %.
  const totalArea = unidades.reduce((a, u) => a + u.area, 0);
  const coefs = unidades.map((u) => Math.round((u.area / totalArea) * 100 * 1e6) / 1e6);
  const diff = Math.round((100 - coefs.reduce((a, b) => a + b, 0)) * 1e6) / 1e6;
  coefs[coefs.length - 1] = Math.round((coefs[coefs.length - 1] + diff) * 1e6) / 1e6;
  const presupuesto = 48_000_000;

  const indices = rng.shuffle(unidades.map((_, i) => i).filter((i) => unidades[i].tipo === "APARTAMENTO"));
  const arrendadas = new Set(indices.slice(0, 10));
  const airbnb = new Set(indices.slice(10, 14));
  const desocupadas = new Set(indices.slice(14, 17));
  const enVenta = new Set(indices.slice(17, 18));
  // unidades fijas para usuarios demo
  const fijo = (codigo: string) => unidades.findIndex((u) => u.codigo === codigo);
  arrendadas.add(fijo("T2-302"));
  for (const set of [airbnb, desocupadas, enVenta]) set.delete(fijo("T2-302"));
  for (const set of [arrendadas, airbnb, desocupadas, enVenta]) set.delete(fijo("T1-101"));

  const created = [];
  for (let i = 0; i < unidades.length; i++) {
    const u = unidades[i];
    const estado = arrendadas.has(i) ? "ARRENDADA" : airbnb.has(i) ? "AIRBNB_O_SIMILAR" : desocupadas.has(i) ? "DESOCUPADA" : enVenta.has(i) ? "EN_VENTA" : "PROPIETARIO_OCUPA";
    created.push(
      await prisma.unidad.create({
        data: {
          conjuntoId,
          torreId: u.torreId,
          codigo: u.codigo,
          tipo: u.tipo,
          piso: u.piso,
          areaPrivada: u.area,
          areaConstruida: Math.round(u.area * 1.12 * 100) / 100,
          coeficiente: coefs[i],
          matriculaInmobiliaria: `040-${600000 + i * 7}`,
          numeroCatastral: `0801010${String(10000 + i).padStart(8, "0")}`,
          estrato: 5,
          habitaciones: u.hab,
          banos: u.banos,
          balconTerraza: u.tipo === "CASA" || rng.chance(0.5),
          estadoOcupacion: estado,
          plataformaRentaCorta: estado === "AIRBNB_O_SIMILAR" ? rng.pick(["Airbnb", "Booking"]) : null,
          registroRnt: estado === "AIRBNB_O_SIMILAR" ? `RNT-${rng.int(100000, 199999)}` : null,
          cuotaAdministracion: Math.round((presupuesto * coefs[i]) / 100 / 100) * 100,
          medidores: { agua: `AG-${rng.int(100000, 999999)}`, luz: `EL-${rng.int(100000, 999999)}`, gas: `GN-${rng.int(100000, 999999)}` },
          notasEstructura: u.tipo === "CASA" ? "Casa de dos niveles con patio posterior y garaje propio." : "Acabados en porcelanato, cocina integral, cuarto útil.",
        },
      }),
    );
  }

  // 120 parqueaderos
  const aptos = created.filter((u) => u.tipo === "APARTAMENTO");
  let p = 1;
  for (const u of aptos) {
    await prisma.parqueadero.create({
      data: { conjuntoId, codigo: `P-${String(p).padStart(3, "0")}`, tipo: "PRIVADO", ubicacion: p <= 48 ? "Sótano 1" : "Sótano 2", unidadId: u.id, estado: "ASIGNADO" },
    });
    p++;
  }
  for (let i = 1; i <= 4; i++) {
    await prisma.parqueadero.create({ data: { conjuntoId, codigo: `P-${String(p++).padStart(3, "0")}`, tipo: "COMUN", ubicacion: "Sótano 2", estado: "DISPONIBLE" } });
  }
  for (let i = 1; i <= 10; i++) {
    await prisma.parqueadero.create({ data: { conjuntoId, codigo: `V-${String(i).padStart(2, "0")}`, tipo: "VISITANTES", ubicacion: "Superficie, junto a portería", estado: "DISPONIBLE", tarifaHora: 2000, tarifaDia: 15000 } });
  }
  for (let i = 1; i <= 6; i++) {
    await prisma.parqueadero.create({ data: { conjuntoId, codigo: `M-${String(i).padStart(2, "0")}`, tipo: "MOTO", ubicacion: "Sótano 1", estado: "DISPONIBLE" } });
  }
  await prisma.parqueadero.create({ data: { conjuntoId, codigo: "D-01", tipo: "DISCAPACIDAD", ubicacion: "Superficie, acceso Torre 1", estado: "DISPONIBLE" } });
  await prisma.parqueadero.create({ data: { conjuntoId, codigo: "D-02", tipo: "DISCAPACIDAD", ubicacion: "Superficie, acceso Torre 3", estado: "DISPONIBLE" } });
  // total: 96 + 4 + 10 + 6 + 2 = 118 → 2 bicicleteros
  await prisma.parqueadero.create({ data: { conjuntoId, codigo: "B-01", tipo: "BICICLETA", ubicacion: "Bicicletero Torre 1", estado: "DISPONIBLE" } });
  await prisma.parqueadero.create({ data: { conjuntoId, codigo: "B-02", tipo: "BICICLETA", ubicacion: "Bicicletero Torre 3", estado: "DISPONIBLE" } });

  // 30 bodegas
  const conBodega = rng.shuffle(aptos).slice(0, 25);
  for (let i = 1; i <= 30; i++) {
    const u = conBodega[i - 1];
    await prisma.bodega.create({
      data: { conjuntoId, codigo: `BD-${String(i).padStart(2, "0")}`, ubicacion: i <= 15 ? "Sótano 1" : "Sótano 2", area: rng.pick([3, 4, 4.5, 6]), unidadId: u?.id ?? null, estado: u ? "ASIGNADO" : "DISPONIBLE" },
    });
  }

  // 8 zonas comunes
  const zonas = [
    { nombre: "Salón social", categoria: "SALON", capacidad: 80, tarifa: 250000, deposito: 200000, gravaIva: true, generaFactura: true, requiereAprobacion: true, horario: HORARIO("08:00", "23:00"), duracionMinimaMin: 240, duracionMaximaMin: 480, maxReservasMesUnidad: 2, anticipacionMinimaHoras: 72, reglasUso: "Música hasta las 11:00 p. m. a volumen moderado. Máximo 80 personas. Entrega del salón limpio. El depósito se devuelve tras la inspección." },
    { nombre: "Piscina", categoria: "PISCINA", capacidad: 40, tarifa: 0, horario: HORARIO("09:00", "19:00", [0, 2, 3, 4, 5, 6]), duracionMinimaMin: 60, duracionMaximaMin: 120, maxReservasMesUnidad: 12, anticipacionMinimaHoras: 2, reglasUso: "Lunes cerrada por mantenimiento. Uso obligatorio de ducha. Menores de 12 años acompañados de un adulto." },
    { nombre: "Gimnasio", categoria: "GIMNASIO", capacidad: 12, tarifa: 0, horario: HORARIO("05:00", "22:00"), duracionMinimaMin: 60, duracionMaximaMin: 90, maxReservasMesUnidad: 30, anticipacionMinimaHoras: 1, reglasUso: "Uso de toalla obligatorio. Máximo 90 minutos por turno. Mayores de 15 años." },
    { nombre: "Zona BBQ", categoria: "BBQ", capacidad: 20, tarifa: 60000, deposito: 50000, gravaIva: true, generaFactura: true, horario: HORARIO("10:00", "22:00"), duracionMinimaMin: 180, duracionMaximaMin: 360, maxReservasMesUnidad: 2, anticipacionMinimaHoras: 24, reglasUso: "Traer carbón propio. Limpiar la parrilla al terminar." },
    { nombre: "Cancha múltiple", categoria: "CANCHA", capacidad: 16, tarifa: 0, horario: HORARIO("06:00", "21:00"), duracionMinimaMin: 60, duracionMaximaMin: 120, maxReservasMesUnidad: 8, anticipacionMinimaHoras: 2, reglasUso: "Calzado deportivo. Iluminación hasta las 9:00 p. m." },
    { nombre: "Parque infantil", categoria: "JUEGOS", capacidad: 25, tarifa: 0, reservable: false, horario: HORARIO("07:00", "20:00"), reglasUso: "Niños menores de 10 años acompañados de un adulto." },
    { nombre: "Sala de juntas", categoria: "SALA_JUNTAS", capacidad: 12, tarifa: 0, requiereAprobacion: true, horario: HORARIO("07:00", "21:00"), duracionMinimaMin: 60, duracionMaximaMin: 240, maxReservasMesUnidad: 4, anticipacionMinimaHoras: 24, reglasUso: "Uso para reuniones de copropietarios y comités." },
    { nombre: "Coworking", categoria: "COWORKING", capacidad: 10, tarifa: 0, horario: HORARIO("06:00", "22:00"), duracionMinimaMin: 60, duracionMaximaMin: 240, maxReservasMesUnidad: 40, anticipacionMinimaHoras: 1, reglasUso: "Silencio. Llamadas en la cabina telefónica." },
  ] as const;
  for (const z of zonas) {
    await prisma.zonaComun.create({
      data: {
        conjuntoId,
        nombre: z.nombre,
        categoria: z.categoria,
        tipo: z.nombre,
        descripcion: `${z.nombre} del conjunto. ${z.reglasUso}`,
        capacidad: z.capacidad,
        tarifa: z.tarifa,
        deposito: "deposito" in z ? z.deposito : 0,
        gravaIva: "gravaIva" in z ? z.gravaIva : false,
        generaFactura: "generaFactura" in z ? z.generaFactura : false,
        requiereAprobacion: "requiereAprobacion" in z ? z.requiereAprobacion : false,
        reservable: "reservable" in z ? z.reservable : true,
        horario: z.horario,
        duracionMinimaMin: "duracionMinimaMin" in z ? z.duracionMinimaMin : 60,
        duracionMaximaMin: "duracionMaximaMin" in z ? z.duracionMaximaMin : 240,
        maxReservasMesUnidad: "maxReservasMesUnidad" in z ? z.maxReservasMesUnidad : 4,
        anticipacionMinimaHoras: "anticipacionMinimaHoras" in z ? z.anticipacionMinimaHoras : 24,
        reglasUso: z.reglasUso,
        bloqueoPorMora: z.tarifa > 0,
        politicaCancelacion: z.tarifa > 0 ? "Cancelación con reembolso total hasta 48 horas antes. Después, se retiene el 50 %." : "Cancela con anticipación para liberar el turno.",
      },
    });
  }
}
