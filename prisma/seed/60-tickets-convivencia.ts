import type { EstadoTicket, PrioridadTicket, TipoTicket } from "@prisma/client";
import { systemCtx } from "@/lib/auth/system-ctx";
import { crearCargo, registrarPago, unidadAlDia } from "@/lib/cartera/core";
import { nextConsecutivo } from "@/lib/consecutivo";
import { saveFile } from "@/lib/storage";
import { fechaLimiteSla, formatoRadicado } from "@/lib/tickets/reglas";
import { plazoDescargos } from "@/lib/convivencia/debido-proceso";
import { parseLocal, isoDate } from "@/lib/format";
import { prisma, type SeedState } from "./util";

/**
 * Fase 7: 40 tickets (PQRS y daños) en todos los estados, plantillas de respuesta, 8 llamados de atención,
 * 5 multas en distintas etapas del debido proceso (2 ratificadas con cuota, 1 pagada), 2 incidentes,
 * 4 obras (1 en curso hoy) y 3 mudanzas (1 aprobada para hoy).
 */

const H = 3_600_000;
const D = 24 * H;

type Spec = { tipo: TipoTicket; prioridad: PrioridadTicket; estado: EstadoTicket; dias: number; titulo: string; descripcion: string; unidad?: string; zona?: string; calif?: number; ot?: boolean };

const SPECS: Spec[] = [
  // Laura (T1-101)
  { tipo: "DANO_UNIDAD", prioridad: "ALTA", estado: "EN_PROCESO", dias: 9, unidad: "T1-101", titulo: "Humedad en el techo del baño principal", descripcion: "Apareció una mancha de humedad en el techo del baño principal que crece cada día. Creo que viene del apartamento de arriba." },
  { tipo: "PETICION", prioridad: "MEDIA", estado: "CERRADO", dias: 60, unidad: "T1-101", titulo: "Copia del reglamento de propiedad horizontal", descripcion: "Solicito una copia digital del reglamento de propiedad horizontal vigente.", calif: 5 },
  { tipo: "DANO_ZONA_COMUN", prioridad: "MEDIA", estado: "RESUELTO", dias: 12, unidad: "T1-101", zona: "Parque infantil", titulo: "Columpio del parque infantil suelto", descripcion: "Uno de los columpios del parque infantil tiene la cadena suelta. Es peligroso para los niños.", ot: true },
  { tipo: "SUGERENCIA", prioridad: "MEDIA", estado: "EN_REVISION", dias: 3, unidad: "T1-101", titulo: "Rampa de acceso en la entrada de la Torre 1", descripcion: "Sugiero instalar una rampa con pasamanos en la entrada de la Torre 1; mi papá usa silla de ruedas y el escalón es un obstáculo." },
  { tipo: "RUIDO", prioridad: "MEDIA", estado: "ABIERTO", dias: 1, unidad: "T1-101", titulo: "Ruido nocturno en el piso 2", descripcion: "Desde hace tres noches hay música a alto volumen después de las 11:00 p. m. en el piso 2 de la Torre 1." },
  { tipo: "RECLAMO", prioridad: "MEDIA", estado: "REABIERTO", dias: 25, unidad: "T1-101", titulo: "Cobro duplicado de la cuota de agosto", descripcion: "En mi estado de cuenta aparece dos veces la cuota de administración de agosto." },
  // Andrés (T2-302)
  { tipo: "DANO_UNIDAD", prioridad: "URGENTE", estado: "ASIGNADO", dias: 2, unidad: "T2-302", titulo: "Fuga de agua en el shut de basuras", descripcion: "Sale agua por la tubería común junto al shut de basuras del piso 3 de la Torre 2 y está entrando a mi cocina." },
  { tipo: "QUEJA", prioridad: "MEDIA", estado: "EN_ESPERA_RESIDENTE", dias: 8, unidad: "T2-302", titulo: "Paquete entregado a otra persona", descripcion: "Portería entregó un paquete a mi nombre a otra persona sin mi autorización." },
  { tipo: "PETICION", prioridad: "MEDIA", estado: "CERRADO", dias: 40, unidad: "T2-302", titulo: "Registro de mi vehículo en el parqueadero", descripcion: "Solicito registrar mi carro de placa JKM482 para el parqueadero asignado a la unidad.", calif: 4 },
  { tipo: "MASCOTAS", prioridad: "MEDIA", estado: "RESUELTO", dias: 14, unidad: "T2-302", titulo: "Excrementos de perro en el sendero", descripcion: "Todos los días hay excrementos de perro en el sendero entre la Torre 2 y la piscina." },
  { tipo: "DANO_ZONA_COMUN", prioridad: "ALTA", estado: "EN_PROCESO", dias: 6, unidad: "T2-302", zona: "Gimnasio", titulo: "Caminadora del gimnasio no enciende", descripcion: "La caminadora número 2 del gimnasio no enciende desde el lunes.", ot: true },
  // Otros residentes
  { tipo: "DANO_ZONA_COMUN", prioridad: "URGENTE", estado: "CERRADO", dias: 30, zona: "Piscina", titulo: "Bomba de la piscina con ruido fuerte", descripcion: "La bomba del cuarto de máquinas de la piscina hace un ruido muy fuerte y huele a quemado.", calif: 5, ot: true },
  { tipo: "DANO_ZONA_COMUN", prioridad: "MEDIA", estado: "ABIERTO", dias: 18, zona: "Salón social", titulo: "Aire acondicionado del salón social gotea", descripcion: "El aire acondicionado del salón social gotea sobre la pista de baile." },
  { tipo: "DANO_ZONA_COMUN", prioridad: "ALTA", estado: "ASIGNADO", dias: 11, titulo: "Luces del parqueadero sótano 2 apagadas", descripcion: "Media fila de luces del sótano 2 está apagada; es inseguro en la noche." },
  { tipo: "SEGURIDAD", prioridad: "ALTA", estado: "EN_PROCESO", dias: 10, titulo: "Cámara de la portería peatonal sin imagen", descripcion: "La cámara que enfoca la puerta peatonal no está grabando desde el fin de semana." },
  { tipo: "SEGURIDAD", prioridad: "URGENTE", estado: "CERRADO", dias: 45, titulo: "Puerta vehicular no cierra", descripcion: "La puerta vehicular queda abierta después de que pasa el carro.", calif: 4 },
  { tipo: "QUEJA", prioridad: "MEDIA", estado: "CERRADO", dias: 70, titulo: "Trato descortés en portería", descripcion: "El vigilante del turno de la noche fue descortés cuando pregunté por un domicilio.", calif: 3 },
  { tipo: "QUEJA", prioridad: "MEDIA", estado: "EN_REVISION", dias: 20, titulo: "Vehículos mal parqueados en visitantes", descripcion: "Hay carros de residentes ocupando los parqueaderos de visitantes todo el fin de semana." },
  { tipo: "RECLAMO", prioridad: "MEDIA", estado: "RESUELTO", dias: 16, titulo: "Intereses de mora mal liquidados", descripcion: "Me cobraron intereses de mora de un mes que pagué a tiempo (adjunto soporte)." },
  { tipo: "RECLAMO", prioridad: "MEDIA", estado: "CERRADO", dias: 55, titulo: "Reserva del BBQ cancelada sin aviso", descripcion: "Mi reserva del BBQ del sábado fue cancelada sin avisarme.", calif: 2 },
  { tipo: "PETICION", prioridad: "MEDIA", estado: "EN_PROCESO", dias: 7, titulo: "Certificado de residencia", descripcion: "Necesito un certificado de residencia para un trámite en el banco." },
  { tipo: "PETICION", prioridad: "MEDIA", estado: "ABIERTO", dias: 0, titulo: "Horario de la piscina en vacaciones", descripcion: "¿Se ampliará el horario de la piscina durante las vacaciones de diciembre?" },
  { tipo: "PETICION", prioridad: "MEDIA", estado: "CERRADO", dias: 80, titulo: "Estados financieros del primer semestre", descripcion: "Solicito los estados financieros del primer semestre.", calif: 5 },
  { tipo: "SUGERENCIA", prioridad: "MEDIA", estado: "CERRADO", dias: 50, titulo: "Bicicletero en la Torre 2", descripcion: "Propongo instalar un bicicletero cubierto en la Torre 2.", calif: 4 },
  { tipo: "SUGERENCIA", prioridad: "MEDIA", estado: "ABIERTO", dias: 4, titulo: "Punto de reciclaje", descripcion: "Sería bueno tener un punto de reciclaje con canecas separadas." },
  { tipo: "FELICITACION", prioridad: "MEDIA", estado: "CERRADO", dias: 22, titulo: "Excelente atención del equipo de mantenimiento", descripcion: "Quiero felicitar a Óscar por la rapidez con que arregló la puerta de mi torre.", calif: 5 },
  { tipo: "DANO_UNIDAD", prioridad: "MEDIA", estado: "EN_ESPERA_RESIDENTE", dias: 13, titulo: "Citófono sin audio", descripcion: "El citófono del apartamento no tiene audio; escucho a portería pero ellos a mí no." },
  { tipo: "DANO_UNIDAD", prioridad: "BAJA", estado: "RESUELTO", dias: 21, titulo: "Rejilla del balcón desprendida", descripcion: "La rejilla de desagüe del balcón está desprendida." },
  { tipo: "DANO_ZONA_COMUN", prioridad: "MEDIA", estado: "RESUELTO", dias: 9, zona: "Cancha múltiple", titulo: "Malla de la cancha rota", descripcion: "La malla del costado norte de la cancha tiene un hueco grande." },
  { tipo: "DANO_ZONA_COMUN", prioridad: "BAJA", estado: "EN_REVISION", dias: 5, zona: "Zona BBQ", titulo: "Parrilla del BBQ oxidada", descripcion: "La parrilla del BBQ está muy oxidada." },
  { tipo: "DANO_ZONA_COMUN", prioridad: "MEDIA", estado: "REABIERTO", dias: 35, titulo: "Ascensor de la Torre 3 se detiene entre pisos", descripcion: "El ascensor de la Torre 3 se detuvo entre el piso 5 y 6 con personas adentro." },
  { tipo: "RUIDO", prioridad: "MEDIA", estado: "CERRADO", dias: 65, titulo: "Obra con taladro en domingo", descripcion: "Un apartamento de la Torre 3 está taladrando un domingo a las 8:00 a. m.", calif: 4 },
  { tipo: "RUIDO", prioridad: "MEDIA", estado: "ASIGNADO", dias: 17, titulo: "Perro que ladra toda la noche", descripcion: "Un perro en la Torre 3 ladra toda la noche cuando sus dueños no están." },
  { tipo: "MASCOTAS", prioridad: "MEDIA", estado: "ABIERTO", dias: 2, titulo: "Perro sin traílla en la piscina", descripcion: "Un residente llevó su perro sin traílla a la zona de la piscina." },
  { tipo: "OTRO", prioridad: "MEDIA", estado: "CERRADO", dias: 75, titulo: "Objeto olvidado en el salón social", descripcion: "Dejé una bandeja de vidrio en el salón social después de mi evento.", calif: 5 },
  { tipo: "OTRO", prioridad: "MEDIA", estado: "EN_PROCESO", dias: 4, titulo: "Actualizar datos de contacto", descripcion: "Quiero actualizar mi número de celular en el directorio." },
  { tipo: "DANO_ZONA_COMUN", prioridad: "ALTA", estado: "ABIERTO", dias: 5, zona: "Coworking", titulo: "Internet del coworking caído", descripcion: "El wifi del coworking no tiene conexión desde ayer." },
  { tipo: "QUEJA", prioridad: "MEDIA", estado: "RESUELTO", dias: 10, titulo: "Basuras fuera del horario", descripcion: "Vecinos sacan la basura fuera del horario y el cuarto huele mal." },
  { tipo: "PETICION", prioridad: "MEDIA", estado: "EN_ESPERA_RESIDENTE", dias: 12, titulo: "Autorización para instalar malla en el balcón", descripcion: "Solicito autorización para instalar malla de seguridad para niños en el balcón." },
  { tipo: "DANO_UNIDAD", prioridad: "ALTA", estado: "CERRADO", dias: 28, titulo: "Filtración por la fachada", descripcion: "Cuando llueve entra agua por la ventana de la habitación principal.", calif: 3 },
];

const RESPUESTAS: Partial<Record<TipoTicket, string>> = {
  PETICION: "Con gusto atendemos su solicitud. Adjuntamos la información solicitada.",
  QUEJA: "Lamentamos lo ocurrido. Hablamos con el personal involucrado y tomamos medidas para que no se repita.",
  RECLAMO: "Revisamos su caso y realizamos el ajuste correspondiente en el estado de cuenta.",
  SUGERENCIA: "Gracias por su sugerencia. La presentaremos al consejo de administración en la próxima reunión.",
  FELICITACION: "¡Muchas gracias! Compartimos su mensaje con el equipo.",
};

/** Borra lo que creó este módulo (para re-ejecutarlo con scripts/seed-uno.ts sin TRUNCATE). */
async function limpiar(conjuntoId: string) {
  const tickets = await prisma.ticket.findMany({ where: { conjuntoId, titulo: { in: SPECS.map((x) => x.titulo) } }, select: { id: true } });
  const ids = tickets.map((t) => t.id);
  await prisma.ordenTrabajo.deleteMany({ where: { conjuntoId, ticketId: { in: ids } } });
  await prisma.comentarioTicket.deleteMany({ where: { conjuntoId, ticketId: { in: ids } } });
  await prisma.ticket.deleteMany({ where: { id: { in: ids } } });
  const cuotaIds = (await prisma.multa.findMany({ where: { conjuntoId, cuotaId: { not: null } }, select: { cuotaId: true } })).map((m) => m.cuotaId!);
  const pagos = await prisma.pago.findMany({ where: { conjuntoId, observaciones: "Pago de multa de convivencia" }, select: { id: true } });
  const pagoIds = pagos.map((p) => p.id);
  await prisma.aplicacionPago.deleteMany({ where: { OR: [{ cuotaId: { in: cuotaIds } }, { pagoId: { in: pagoIds } }] } });
  await prisma.movimientoCartera.deleteMany({ where: { OR: [{ cuotaId: { in: cuotaIds } }, { pagoId: { in: pagoIds } }] } });
  await prisma.pago.deleteMany({ where: { id: { in: pagoIds } } });
  await prisma.multa.deleteMany({ where: { conjuntoId } });
  await prisma.cuota.deleteMany({ where: { id: { in: cuotaIds } } });
  await prisma.llamadoAtencion.deleteMany({ where: { conjuntoId } });
  await prisma.incidenteConvivencia.deleteMany({ where: { conjuntoId } });
  await prisma.solicitudObra.deleteMany({ where: { conjuntoId } });
  await prisma.mudanza.deleteMany({ where: { conjuntoId } });
  await prisma.plantillaRespuesta.deleteMany({ where: { conjuntoId } });
}

export async function seedTicketsConvivencia(s: SeedState) {
  const { conjuntoId, users, now, rng } = s;
  await limpiar(conjuntoId);
  const ctx = await systemCtx(conjuntoId);
  const unidades = await prisma.unidad.findMany({ where: { conjuntoId }, select: { id: true, codigo: true, torreId: true } });
  const byCode = new Map(unidades.map((u) => [u.codigo, u]));
  const zonas = new Map((await prisma.zonaComun.findMany({ where: { conjuntoId } })).map((z) => [z.nombre, z]));
  const activos = await prisma.activo.findMany({ where: { conjuntoId, deletedAt: null }, select: { id: true, zonaId: true } });
  const otros = unidades.filter((u) => !["T1-101", "T2-302", "T3-804"].includes(u.codigo));
  const personaDe = async (unidadId: string) =>
    prisma.vinculoUnidad.findFirst({ where: { unidadId, estado: "ACTIVO", tipo: { in: ["PROPIETARIO", "ARRENDATARIO"] } }, include: { persona: true } });
  const solicitanteDemo: Record<string, { id: string; nombre: string }> = {
    "T1-101": { id: users.propietario, nombre: "Laura Gómez Fontalvo" },
    "T2-302": { id: users.residente, nombre: "Andrés Pérez Rojas" },
  };

  // ── Plantillas de respuesta ──
  await prisma.plantillaRespuesta.createMany({
    data: [
      { conjuntoId, titulo: "Reporte recibido", contenido: "Hola {{nombre}}, recibimos su reporte con radicado {{radicado}}. Nuestro equipo lo revisará y le responderemos a más tardar el {{fecha_limite}}." },
      { conjuntoId, titulo: "Visita técnica programada", contenido: "Programamos una visita técnica para revisar el daño. El técnico llegará identificado y portería le avisará. ¿Nos confirma si alguien estará en casa?", tipoTicket: "DANO_UNIDAD" },
      { conjuntoId, titulo: "Daño reparado", contenido: "El daño fue reparado. Adjuntamos fotos del trabajo realizado. Si el problema persiste, puede reabrir la solicitud desde la app." },
      { conjuntoId, titulo: "Se requiere información", contenido: "Para avanzar con su solicitud necesitamos que nos envíe: " },
      { conjuntoId, titulo: "Traslado al consejo", contenido: "Su solicitud requiere aprobación del consejo de administración. La presentaremos en la próxima reunión y le informaremos la decisión.", tipoTicket: "SUGERENCIA" },
      { conjuntoId, titulo: "Recordatorio de convivencia", contenido: "Publicamos un recordatorio del manual de convivencia a todos los residentes y reforzamos las rondas de vigilancia.", tipoTicket: "RUIDO" },
    ],
  });

  // ── 40 tickets ──
  const ordenados = [...SPECS].sort((a, b) => b.dias - a.dias);
  let otCount = 0;
  for (const [i, sp] of ordenados.entries()) {
    const creado = new Date(now.getTime() - sp.dias * D - rng.int(1, 8) * H);
    const u = sp.unidad ? byCode.get(sp.unidad)! : sp.tipo === "DANO_ZONA_COMUN" && rng.chance(0.5) ? null : otros[(i * 7) % otros.length];
    const demo = sp.unidad ? solicitanteDemo[sp.unidad] : null;
    const vinc = !demo && u ? await personaDe(u.id) : null;
    const solicitanteNombre = demo?.nombre ?? (vinc ? `${vinc.persona.nombres} ${vinc.persona.apellidos}` : "Residente");
    const zona = sp.zona ? zonas.get(sp.zona) : undefined;
    const activo = zona ? activos.find((a) => a.zonaId === zona.id) : undefined;
    const anio = creado.getFullYear();
    const radicado = formatoRadicado(anio, await nextConsecutivo(conjuntoId, "RADICADO", anio));
    const asignado = ["ASIGNADO", "EN_PROCESO", "RESUELTO", "CERRADO", "REABIERTO", "EN_ESPERA_RESIDENTE"].includes(sp.estado) && sp.tipo !== "FELICITACION";
    const esPqrs = ["PETICION", "QUEJA", "RECLAMO", "SUGERENCIA", "FELICITACION"].includes(sp.tipo);
    const responsable = esPqrs ? users.asistente : users.mantenimiento;
    // Resolución: antes del plazo en la mayoría; algunos fuera de plazo para las estadísticas
    const resueltoEn = ["RESUELTO", "CERRADO", "REABIERTO"].includes(sp.estado)
      ? new Date(Math.min(now.getTime() - 2 * H, creado.getTime() + (i % 5 === 0 ? 20 : rng.int(1, Math.max(1, Math.min(sp.dias, 6)))) * D))
      : null;
    const t = await prisma.ticket.create({
      data: {
        conjuntoId,
        radicado,
        tipo: sp.tipo,
        unidadId: u?.id ?? null,
        solicitanteId: demo?.id ?? vinc?.persona.usuarioId ?? null,
        solicitanteNombre,
        zonaId: zona?.id ?? null,
        activoId: activo?.id ?? null,
        titulo: sp.titulo,
        descripcion: sp.descripcion,
        prioridad: sp.prioridad,
        estado: sp.estado,
        asignadoAId: asignado ? responsable : null,
        fechaLimite: fechaLimiteSla(sp.tipo, sp.prioridad, creado),
        primeraRespuestaEn: sp.estado === "ABIERTO" ? null : new Date(creado.getTime() + rng.int(2, 20) * H),
        resueltoEn: sp.estado === "REABIERTO" ? null : resueltoEn,
        cerradoEn: sp.estado === "CERRADO" && resueltoEn ? new Date(Math.min(now.getTime() - H, resueltoEn.getTime() + D)) : null,
        calificacion: sp.estado === "CERRADO" ? (sp.calif ?? null) : null,
        comentarioCalificacion: sp.calif && sp.calif >= 4 ? "Muy buena atención, gracias." : sp.calif && sp.calif <= 2 ? "Tardaron demasiado en responder." : null,
        reabiertoVeces: sp.estado === "REABIERTO" ? 1 : 0,
        createdAt: creado,
      },
    });
    const com = (min: number, contenido: string, extra: { tipo?: "COMENTARIO" | "CAMBIO_ESTADO" | "ASIGNACION" | "SISTEMA"; autorId?: string | null; interno?: boolean; data?: object } = {}) =>
      prisma.comentarioTicket.create({
        data: {
          conjuntoId,
          ticketId: t.id,
          autorId: extra.autorId ?? null,
          contenido,
          interno: extra.interno ?? false,
          tipo: extra.tipo ?? "COMENTARIO",
          data: extra.data,
          adjuntos: [],
          createdAt: new Date(Math.min(now.getTime() - 60_000, creado.getTime() + min * 60_000)),
        },
      });
    await com(0, `Radicado ${radicado}.`, { tipo: "SISTEMA", data: { estado: "ABIERTO" } });
    if (sp.estado === "ABIERTO") continue;
    await com(90, "Estado: Abierto → En revisión", { tipo: "CAMBIO_ESTADO", autorId: users.administrador, data: { de: "ABIERTO", a: "EN_REVISION" } });
    if (sp.estado === "EN_REVISION") {
      if (esPqrs) await com(180, "Recibimos su solicitud y la estamos revisando. Le responderemos dentro del plazo legal.", { autorId: users.administrador });
      continue;
    }
    if (asignado) {
      await com(240, `Asignado a ${esPqrs ? "Catalina Moreno Díaz" : "Óscar Ramírez Díaz"}.`, { tipo: "ASIGNACION", autorId: users.administrador, data: { asignadoAId: responsable, de: "EN_REVISION", a: "ASIGNADO" } });
    }
    if (sp.estado === "ASIGNADO") continue;
    if (!esPqrs) await com(24 * 60, "Revisado en sitio: se requiere repuesto. Cotizar con proveedor.", { autorId: users.mantenimiento, interno: true });
    await com(26 * 60, "Estado: Asignado → En proceso", { tipo: "CAMBIO_ESTADO", autorId: responsable, data: { de: "ASIGNADO", a: "EN_PROCESO" } });
    if (sp.estado === "EN_PROCESO") continue;
    if (sp.estado === "EN_ESPERA_RESIDENTE") {
      await com(28 * 60, "Para continuar necesitamos que nos indique un horario en el que podamos hacer la visita o que nos envíe una foto adicional.", {
        tipo: "CAMBIO_ESTADO",
        autorId: responsable,
        data: { de: "EN_PROCESO", a: "EN_ESPERA_RESIDENTE" },
      });
      continue;
    }
    const minRes = Math.max(30 * 60, ((resueltoEn ?? now).getTime() - creado.getTime()) / 60_000);
    await com(minRes, RESPUESTAS[sp.tipo] ?? "Se realizó la reparación. Adjuntamos evidencia del trabajo.", { tipo: "CAMBIO_ESTADO", autorId: responsable, data: { de: "EN_PROCESO", a: "RESUELTO", evidencia: !esPqrs } });
    if (sp.estado === "REABIERTO") {
      await com(minRes + 24 * 60, "Reabierto: el problema volvió a presentarse.", { tipo: "CAMBIO_ESTADO", autorId: demo?.id ?? null, data: { de: "RESUELTO", a: "REABIERTO" } });
      await prisma.ticket.update({ where: { id: t.id }, data: { fechaLimite: fechaLimiteSla(sp.tipo, sp.prioridad, new Date(creado.getTime() + (minRes + 24 * 60) * 60_000)) } });
      continue;
    }
    if (sp.estado === "CERRADO") {
      await com(minRes + 20 * 60, sp.calif ? `Calificación del residente: ${"★".repeat(sp.calif)}${"☆".repeat(5 - sp.calif)}` : "Cerrado.", {
        tipo: "CAMBIO_ESTADO",
        autorId: demo?.id ?? null,
        data: { de: "RESUELTO", a: "CERRADO", calificacion: sp.calif },
      });
    }
    // Órdenes de trabajo (3 daños en zonas comunes)
    if (sp.ot && otCount < 3) {
      otCount++;
      const numero = await nextConsecutivo(conjuntoId, "ORDEN", 0);
      const completada = sp.estado === "RESUELTO" || sp.estado === "CERRADO";
      const orden = await prisma.ordenTrabajo.create({
        data: {
          conjuntoId,
          numero,
          origen: "TICKET",
          ticketId: t.id,
          zonaId: zona?.id ?? null,
          activoId: activo?.id ?? null,
          asignadoAId: users.mantenimiento,
          titulo: `${radicado} · ${sp.titulo}`,
          descripcion: sp.descripcion,
          fechaProgramada: new Date(creado.getTime() + D),
          fechaInicio: new Date(creado.getTime() + D),
          fechaCierre: completada ? resueltoEn : null,
          estado: completada ? "COMPLETADA" : "EN_PROCESO",
          notasCierre: completada ? "Trabajo terminado y verificado." : null,
        },
      });
      await com(25 * 60, `Se generó la orden de trabajo N.º ${numero}.`, { tipo: "SISTEMA", autorId: users.administrador, data: { ordenId: orden.id, numero } });
    }
  }
  // Los tickets EN_PROCESO con OT (no llegan al bloque anterior): la del gimnasio
  const gimnasio = await prisma.ticket.findFirst({ where: { conjuntoId, titulo: "Caminadora del gimnasio no enciende" } });
  if (gimnasio && otCount < 3) {
    const numero = await nextConsecutivo(conjuntoId, "ORDEN", 0);
    const zona = zonas.get("Gimnasio");
    const o = await prisma.ordenTrabajo.create({
      data: {
        conjuntoId,
        numero,
        origen: "TICKET",
        ticketId: gimnasio.id,
        zonaId: zona?.id ?? null,
        activoId: gimnasio.activoId,
        proveedorId: (await prisma.proveedor.findFirst({ where: { conjuntoId } }))?.id ?? null,
        asignadoAId: users.mantenimiento,
        titulo: `${gimnasio.radicado} · Revisión de caminadora`,
        descripcion: gimnasio.descripcion,
        fechaProgramada: new Date(now.getTime() + D),
        estado: "PROGRAMADA",
      },
    });
    await prisma.comentarioTicket.create({ data: { conjuntoId, ticketId: gimnasio.id, autorId: users.administrador, tipo: "SISTEMA", contenido: `Se generó la orden de trabajo N.º ${numero}.`, data: { ordenId: o.id, numero }, adjuntos: [] } });
  }

  // ── Convivencia ──
  const infr = new Map((await prisma.catalogoInfraccion.findMany({ where: { conjuntoId } })).map((i) => [i.codigo, i]));
  const t1101 = byCode.get("T1-101")!;
  const t2302 = byCode.get("T2-302")!;
  const [ua, ub, uc, ud, ue] = [otros[3], otros[9], otros[15], otros[22], otros[30]];
  const llamado = async (unidadId: string, codigo: string, descripcion: string, dias: number, estado: "ENVIADO" | "LEIDO" | "RESPONDIDO" | "CERRADO" | "ESCALADO_MULTA", respuesta?: string) => {
    const i = infr.get(codigo)!;
    const fecha = new Date(now.getTime() - dias * D);
    const leido = estado !== "ENVIADO";
    return prisma.llamadoAtencion.create({
      data: {
        conjuntoId,
        unidadId,
        infraccionId: i.id,
        motivo: i.nombre,
        descripcion,
        gravedad: i.gravedad,
        enviadoPorId: users.administrador,
        fecha,
        createdAt: fecha,
        acuseEn: leido ? new Date(fecha.getTime() + 5 * H) : null,
        respuesta: respuesta ?? null,
        respuestaEn: respuesta ? new Date(fecha.getTime() + 20 * H) : null,
        estado,
      },
    });
  };
  const l1 = await llamado(t1101.id, "MAS-01", "El 12 de septiembre a las 6:30 p. m. se observó a su mascota sin traílla en la zona de la piscina. Le recordamos amablemente el uso obligatorio de traílla en zonas comunes.", 35, "ESCALADO_MULTA");
  await llamado(t1101.id, "BAS-01", "Se encontraron bolsas de basura de su unidad en el pasillo del piso 1 fuera del horario de recolección. Le agradecemos usar el cuarto de basuras en el horario establecido.", 1, "ENVIADO");
  const l3 = await llamado(t2302.id, "RUI-01", "Vecinos reportaron música a alto volumen en su unidad el sábado entre la 1:00 y las 3:00 a. m.", 20, "ESCALADO_MULTA", "Fue una reunión familiar por un cumpleaños. Pido disculpas; ya hablé con los vecinos.");
  await llamado(t2302.id, "PAR-01", "Su vehículo estuvo parqueado en la zona de visitantes durante todo el fin de semana.", 45, "RESPONDIDO", "Tuve un inconveniente con mi parqueadero asignado; ya quedó solucionado.");
  const l5 = await llamado(ua.id, "OBR-01", "Se reportaron trabajos con taladro el domingo a las 8:00 a. m.", 50, "ESCALADO_MULTA");
  await llamado(ub.id, "MAS-02", "Se evidenció que no se recogieron los excrementos de su mascota en el sendero peatonal.", 12, "LEIDO");
  await llamado(uc.id, "RUI-01", "Ruido de fiesta después de las 11:00 p. m. el viernes pasado.", 8, "RESPONDIDO", "Entendido, no se repetirá.");
  await llamado(ud.id, "ZON-01", "Se dañó el vidrio de la puerta del salón social durante su evento. Le pedimos acercarse a la administración para acordar la reparación.", 3, "ENVIADO");

  const pdfDemo = await saveFile({ conjuntoId, folder: "obras", body: Buffer.from("%PDF-1.4\n% Planilla PILA de demostración\n"), filename: "planilla-pila-demo.pdf", mime: "application/pdf" });

  const multa = async (d: { unidadId: string; llamadoId?: string; codigo: string; descripcion: string; valor: number; dias: number }) => {
    const i = infr.get(d.codigo)!;
    const fecha = new Date(now.getTime() - d.dias * D);
    return prisma.multa.create({ data: { conjuntoId, unidadId: d.unidadId, llamadoId: d.llamadoId ?? null, infraccionId: i.id, descripcion: d.descripcion, valor: d.valor, fecha, createdAt: fecha, estado: "PROPUESTA" } });
  };
  const ratificar = async (id: string, unidadId: string, valor: number, desc: string, diasNotif: number, descargos: string | null) => {
    const notificadaEn = new Date(now.getTime() - diasNotif * D);
    const resolucionEn = new Date(notificadaEn.getTime() + 9 * D);
    const cuota = await crearCargo(ctx, { unidadId, conceptoTipo: "MULTA", valorBase: valor, descripcion: `Multa: ${desc}`, fechaEmision: resolucionEn, fechaVencimiento: new Date(now.getTime() + 25 * D), origen: "MULTA" });
    await prisma.multa.update({
      where: { id },
      data: {
        estado: "RATIFICADA",
        notificadaEn,
        plazoDescargos: plazoDescargos(notificadaEn),
        descargos,
        descargosEn: descargos ? new Date(notificadaEn.getTime() + 2 * D) : null,
        resolucion: "El consejo, en reunión ordinaria, revisó los hechos, la evidencia y los descargos presentados, y decidió ratificar la multa conforme al manual de convivencia (Ley 675 de 2001, art. 59).",
        resolucionEn,
        decididaPorId: users.consejo,
        cuotaId: cuota.id,
      },
    });
    return cuota;
  };
  // 1) T1-101: ratificada con cuota (Laura puede pagarla)
  const m1 = await multa({ unidadId: t1101.id, llamadoId: l1.id, codigo: "MAS-01", descripcion: "Reincidencia: mascota sin traílla en zonas comunes.", valor: 100000, dias: 30 });
  await ratificar(m1.id, t1101.id, 100000, "mascota sin traílla en zonas comunes", 28, "Reconozco el hecho; fue un descuido del paseador.");
  await prisma.llamadoAtencion.update({ where: { id: l1.id }, data: { multaId: m1.id } });
  // 2) Otra unidad: ratificada con cuota
  const m2 = await multa({ unidadId: ue.id, codigo: "ZON-01", descripcion: "Daño al pasamanos de la escalera de la Torre 2 durante un trasteo.", valor: 300000, dias: 25 });
  await ratificar(m2.id, ue.id, 300000, "daño a zonas comunes", 22, null);
  // 3) Pagada
  const m3 = await multa({ unidadId: ua.id, llamadoId: l5.id, codigo: "OBR-01", descripcion: "Obra fuera del horario permitido (domingo 8:00 a. m.).", valor: 200000, dias: 45 });
  const c3 = await ratificar(m3.id, ua.id, 200000, "obra fuera del horario permitido", 44, "Los trabajadores llegaron sin mi autorización.");
  await prisma.llamadoAtencion.update({ where: { id: l5.id }, data: { multaId: m3.id } });
  await registrarPago(ctx, { unidadId: ua.id, valor: 200000, medio: "TRANSFERENCIA", cuotasSeleccionadas: [c3.id], fecha: new Date(now.getTime() - 5 * D), observaciones: "Pago de multa de convivencia" });
  // 4) T2-302: en descargos (lista para decisión del consejo)
  const m4 = await multa({ unidadId: t2302.id, llamadoId: l3.id, codigo: "RUI-01", descripcion: "Ruido excesivo en horario de descanso (sábado 1:00–3:00 a. m.), con llamado previo.", valor: 150000, dias: 6 });
  const n4 = new Date(now.getTime() - 5 * D);
  await prisma.multa.update({
    where: { id: m4.id },
    data: { estado: "EN_DESCARGOS", notificadaEn: n4, plazoDescargos: plazoDescargos(n4), descargos: "Fue una reunión familiar por el cumpleaños de mi madre. Pido que se tenga en cuenta que es la primera vez y que ya ofrecí disculpas a los vecinos.", descargosEn: new Date(n4.getTime() + D) },
  });
  await prisma.llamadoAtencion.update({ where: { id: l3.id }, data: { multaId: m4.id } });
  // 5) Notificada, dentro del plazo
  const m5 = await multa({ unidadId: ub.id, codigo: "MAS-02", descripcion: "No recoger los excrementos de la mascota en el sendero peatonal (tercera vez en el mes).", valor: 120000, dias: 2 });
  const n5 = new Date(now.getTime() - 1 * D);
  await prisma.multa.update({ where: { id: m5.id }, data: { estado: "NOTIFICADA", notificadaEn: n5, plazoDescargos: plazoDescargos(n5) } });

  // Incidentes
  await prisma.incidenteConvivencia.create({
    data: {
      conjuntoId,
      titulo: `Humedad y ruido entre ${otros[40]?.codigo ?? "T1-201"} y ${otros[44]?.codigo ?? "T1-301"}`,
      descripcion: "La unidad de abajo reporta filtraciones desde el baño de la unidad de arriba y ruido de muebles en la madrugada. Ambas partes aceptaron una mediación.",
      unidadesIds: [otros[40]?.id, otros[44]?.id].filter(Boolean) as string[],
      fecha: new Date(now.getTime() - 15 * D),
      estado: "EN_MEDIACION",
      mediadorId: users.administrador,
      creadoPorId: users.administrador,
      sesiones: [
        {
          id: "s1",
          fecha: new Date(now.getTime() - 10 * D).toISOString(),
          asistentes: "Propietarios de ambas unidades y la administradora",
          notas: "Se escucharon ambas partes. Se acordó revisar la tubería del baño con el técnico del conjunto.",
          compromisos: "Revisión técnica el próximo martes. Evitar mover muebles después de las 10:00 p. m.",
          registradaPor: "Adriana Méndez Polo",
        },
      ],
    },
  });
  await prisma.incidenteConvivencia.create({
    data: {
      conjuntoId,
      titulo: `Uso del parqueadero compartido entre ${otros[50]?.codigo ?? "T2-101"} y ${otros[51]?.codigo ?? "T2-102"}`,
      descripcion: "Diferencias por el uso del espacio de maniobra entre dos parqueaderos contiguos.",
      unidadesIds: [otros[50]?.id, otros[51]?.id].filter(Boolean) as string[],
      fecha: new Date(now.getTime() - 40 * D),
      estado: "ACUERDO",
      mediadorId: users.administrador,
      creadoPorId: users.administrador,
      acuerdos: "Ambas partes acordaron estacionar dejando 60 cm libres y avisar por el chat del conjunto si necesitan mover un vehículo.",
      sesiones: [
        {
          id: "s1",
          fecha: new Date(now.getTime() - 35 * D).toISOString(),
          asistentes: "Residentes de ambas unidades, miembro del consejo",
          notas: "Conversación cordial. Se midieron los espacios.",
          compromisos: "Dejar 60 cm libres entre vehículos.",
          registradaPor: "Adriana Méndez Polo",
        },
      ],
    },
  });

  // ── Obras ──
  const hoy = parseLocal(isoDate(now));
  const contratista = (nombre: string, documento: string, venceDias: number) => ({ nombre, documento, seguridadSocialUrl: pdfDemo.url, vence: isoDate(new Date(now.getTime() + venceDias * D)) });
  await prisma.solicitudObra.create({
    data: {
      conjuntoId,
      unidadId: t1101.id,
      solicitanteId: users.propietario,
      descripcion: "Cambio de enchape del baño social y adecuación de barras de apoyo para persona con movilidad reducida.",
      tipo: "REMODELACION",
      fechaInicio: new Date(hoy.getTime() - 2 * D),
      fechaFin: new Date(hoy.getTime() + 5 * D),
      contratistas: [contratista("Wilmer Pacheco Ruiz", "1045678123", 40), contratista("Jesús Ariza Molina", "72234567", 25)],
      deposito: 300000,
      estado: "EN_CURSO",
      aprobadaPorId: users.administrador,
      observaciones: "Aprobada. Proteger el ascensor con cartón y retirar escombros el mismo día.",
    },
  });
  await prisma.solicitudObra.create({
    data: {
      conjuntoId,
      unidadId: t2302.id,
      solicitanteId: users.residente,
      descripcion: "Instalación de aire acondicionado tipo minisplit en la habitación principal.",
      tipo: "INSTALACION",
      fechaInicio: new Date(hoy.getTime() + 4 * D),
      fechaFin: new Date(hoy.getTime() + 5 * D),
      contratistas: [contratista("Frío Caribe S.A.S. — Kevin Orozco", "1143567890", 60)],
      estado: "SOLICITADA",
    },
  });
  await prisma.solicitudObra.create({
    data: {
      conjuntoId,
      unidadId: otros[12].id,
      descripcion: "Remodelación de cocina: cambio de mesón y gabinetes.",
      fechaInicio: new Date(hoy.getTime() - 40 * D),
      fechaFin: new Date(hoy.getTime() - 25 * D),
      contratistas: [contratista("Carpintería El Roble — Luis Mejía", "8765432", -10)],
      deposito: 500000,
      estado: "FINALIZADA",
      aprobadaPorId: users.administrador,
      cierreNotas: "Obra terminada sin daños a zonas comunes. Se devolvió el depósito.",
    },
  });
  await prisma.solicitudObra.create({
    data: {
      conjuntoId,
      unidadId: otros[27].id,
      descripcion: "Demolición de muro entre cocina y sala.",
      fechaInicio: new Date(hoy.getTime() - 5 * D),
      fechaFin: new Date(hoy.getTime() + 10 * D),
      contratistas: [{ nombre: "Maestro de obra (sin identificar)", documento: "0000", seguridadSocialUrl: null, vence: null }],
      estado: "RECHAZADA",
      aprobadaPorId: users.administrador,
      observaciones: "El muro es estructural según los planos. Se requiere concepto de ingeniero y licencia de la curaduría.",
    },
  });

  // ── Mudanzas ──
  await prisma.mudanza.create({
    data: {
      conjuntoId,
      unidadId: otros[18].id,
      tipo: "INGRESO",
      fecha: hoy,
      horaInicio: "08:00",
      horaFin: "12:00",
      recurso: "Ascensor Torre 2",
      empresa: "Trasteos Barranquilla",
      placaVehiculo: "TKL482",
      enseres: [
        { descripcion: "Nevera", cantidad: 1 },
        { descripcion: "Sofá de 3 puestos", cantidad: 1 },
        { descripcion: "Cajas", cantidad: 20 },
      ],
      pazYSalvoVerificado: true,
      estado: "APROBADA",
      aprobadaPorId: users.administrador,
    },
  });
  const salidaUnidad = otros[33];
  const salida = await prisma.mudanza.create({
    data: {
      conjuntoId,
      unidadId: salidaUnidad.id,
      tipo: "SALIDA",
      fecha: new Date(hoy.getTime() + 3 * D),
      horaInicio: "13:00",
      horaFin: "17:00",
      recurso: "Zona de cargue",
      empresa: "Mudanzas Express",
      placaVehiculo: "SXR915",
      enseres: [
        { descripcion: "Cama doble", cantidad: 1 },
        { descripcion: "Comedor de 6 puestos", cantidad: 1 },
        { descripcion: "Televisor", cantidad: 2 },
        { descripcion: "Cajas", cantidad: 25 },
      ],
      estado: "SOLICITADA",
    },
  });
  const pys = await unidadAlDia(ctx, salidaUnidad.id);
  await prisma.mudanza.update({ where: { id: salida.id }, data: { pazYSalvoVerificado: pys.alDia } });
  await prisma.mudanza.create({
    data: {
      conjuntoId,
      unidadId: t2302.id,
      solicitanteId: users.residente,
      tipo: "INGRESO",
      fecha: new Date(hoy.getTime() - 200 * D),
      horaInicio: "09:00",
      horaFin: "13:00",
      recurso: "Ascensor Torre 2",
      enseres: [{ descripcion: "Cajas y muebles", cantidad: 1 }],
      pazYSalvoVerificado: true,
      estado: "FINALIZADA",
      aprobadaPorId: users.administrador,
    },
  });
}
