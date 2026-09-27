/**
 * Reglas puras de reservas (sin BD, sin dependencias de servidor): se usan en el servidor para validar
 * y en el navegador para pintar el calendario. Probadas en tests/unit/reservas*.test.ts.
 *
 * Zona horaria: Colombia no tiene horario de verano, así que la hora de Bogotá es siempre UTC−5.
 * Las fechas locales se manejan como texto "yyyy-MM-dd" y las horas como "HH:mm".
 */

export const OFFSET_BOGOTA_MIN = -5 * 60;
const MS_MIN = 60_000;
const MS_DIA = 86_400_000;

export type Intervalo = { inicio: Date; fin: Date };
export type HorarioDia = { abre: string; cierra: string } | null;
export type HorarioZona = Record<string, HorarioDia>;

/** Estados que ocupan el calendario (impiden traslapes). */
export const ESTADOS_OCUPAN = ["SOLICITADA", "APROBADA", "CUMPLIDA"] as const;
/** Estados que cuentan para el máximo de reservas por unidad al mes. */
export const ESTADOS_CUENTAN = ["SOLICITADA", "APROBADA", "CUMPLIDA", "NO_SHOW"] as const;

/** ¿Dos intervalos se traslapan? Los extremos que se tocan (fin = inicio) no son traslape. */
export function haySolape(a: Intervalo, b: Intervalo) {
  return a.inicio.getTime() < b.fin.getTime() && b.inicio.getTime() < a.fin.getTime();
}

/** Primer intervalo de la lista que se traslapa con `x` (o null). */
export function buscarSolape<T extends Intervalo>(x: Intervalo, lista: T[]): T | null {
  return lista.find((y) => haySolape(x, y)) ?? null;
}

// ── Fechas en hora de Bogotá ──

export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** "HH:mm" → minutos del día. "24:00" = 1440. */
export function minutosDe(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function hhmm(min: number) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

/** Instante UTC de una fecha y hora locales de Bogotá. */
export function fechaHoraBogota(fecha: string, hora = "00:00") {
  const [y, mo, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d) + minutosDe(hora) * MS_MIN - OFFSET_BOGOTA_MIN * MS_MIN);
}

/** "yyyy-MM-dd" de un instante en Bogotá. */
export function fechaLocal(d: Date) {
  return new Date(d.getTime() + OFFSET_BOGOTA_MIN * MS_MIN).toISOString().slice(0, 10);
}

/** Minutos desde la medianoche de Bogotá. */
export function minutosLocal(d: Date) {
  const x = new Date(d.getTime() + OFFSET_BOGOTA_MIN * MS_MIN);
  return x.getUTCHours() * 60 + x.getUTCMinutes();
}

/** Día de la semana (0 = domingo) de una fecha local. */
export function diaSemana(fecha: string) {
  const [y, mo, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

export function sumarDias(fecha: string, n: number) {
  const [y, mo, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d) + n * MS_DIA).toISOString().slice(0, 10);
}

export function mesDe(fecha: string) {
  return fecha.slice(0, 7);
}

/** Rango de fechas locales [desde, hasta] inclusive. */
export function rangoFechas(desde: string, hasta: string) {
  const out: string[] = [];
  for (let f = desde; f <= hasta && out.length < 400; f = sumarDias(f, 1)) out.push(f);
  return out;
}

// ── Festivos de Colombia (Ley 51 de 1983, "Ley Emiliani") ──

/** Domingo de Pascua (algoritmo de Butcher / computus gregoriano). */
export function domingoPascua(anio: number) {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${anio}-${pad2(mes)}-${pad2(dia)}`;
}

/** Traslada al lunes siguiente (si no cae en lunes). */
function alLunes(fecha: string) {
  const dow = diaSemana(fecha);
  return dow === 1 ? fecha : sumarDias(fecha, (8 - dow) % 7);
}

/** Festivos de Colombia de un año: { fecha, nombre }, ordenados. */
export function festivosColombia(anio: number): { fecha: string; nombre: string }[] {
  const f = (m: number, d: number) => `${anio}-${pad2(m)}-${pad2(d)}`;
  const pascua = domingoPascua(anio);
  const lista = [
    { fecha: f(1, 1), nombre: "Año Nuevo" },
    { fecha: alLunes(f(1, 6)), nombre: "Día de los Reyes Magos" },
    { fecha: alLunes(f(3, 19)), nombre: "Día de San José" },
    { fecha: sumarDias(pascua, -3), nombre: "Jueves Santo" },
    { fecha: sumarDias(pascua, -2), nombre: "Viernes Santo" },
    { fecha: f(5, 1), nombre: "Día del Trabajo" },
    { fecha: sumarDias(pascua, 43), nombre: "Ascensión del Señor" },
    { fecha: sumarDias(pascua, 64), nombre: "Corpus Christi" },
    { fecha: sumarDias(pascua, 71), nombre: "Sagrado Corazón de Jesús" },
    { fecha: alLunes(f(6, 29)), nombre: "San Pedro y San Pablo" },
    { fecha: f(7, 20), nombre: "Día de la Independencia" },
    { fecha: f(8, 7), nombre: "Batalla de Boyacá" },
    { fecha: alLunes(f(8, 15)), nombre: "Asunción de la Virgen" },
    { fecha: alLunes(f(10, 12)), nombre: "Día de la Diversidad Étnica y Cultural" },
    { fecha: alLunes(f(11, 1)), nombre: "Día de Todos los Santos" },
    { fecha: alLunes(f(11, 11)), nombre: "Independencia de Cartagena" },
    { fecha: f(12, 8), nombre: "Día de la Inmaculada Concepción" },
    { fecha: f(12, 25), nombre: "Navidad" },
  ];
  return lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Mapa fecha → nombre del festivo para un rango de años. */
export function mapaFestivos(desde: string, hasta: string) {
  const m = new Map<string, string>();
  for (let y = Number(desde.slice(0, 4)); y <= Number(hasta.slice(0, 4)); y++) for (const x of festivosColombia(y)) m.set(x.fecha, x.nombre);
  return m;
}

// ── Horario de la zona ──

/** Horario de un día (0 = domingo) en minutos. `null` si cierra ese día. Cierre "00:00" o "24:00" = medianoche. */
export function horarioDia(horario: HorarioZona | null | undefined, dow: number): { abre: number; cierra: number } | null {
  const h = horario?.[String(dow)];
  if (!h || !h.abre || !h.cierra) return null;
  const abre = minutosDe(h.abre);
  let cierra = minutosDe(h.cierra);
  if (cierra === 0 || cierra <= abre) cierra = 1440;
  return { abre, cierra };
}

// ── Reglas extra (ReglaReserva) ──

export type ReglaExtra = { tipo: string; valor: unknown; descripcion?: string | null };

export const REGLA_LABEL: Record<string, string> = {
  SOLO_FINES_SEMANA: "Solo fines de semana y festivos",
  UN_TURNO_POR_DIA: "Un turno por día por unidad",
  DIAS_PERMITIDOS: "Solo algunos días de la semana",
  MAX_ASISTENTES: "Máximo de asistentes",
};

export const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
export const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Texto legible de una regla extra. */
export function describirRegla(r: ReglaExtra) {
  const v = (r.valor ?? {}) as { dias?: number[]; max?: number };
  if (r.descripcion) return r.descripcion;
  if (r.tipo === "DIAS_PERMITIDOS") return `Solo ${(v.dias ?? []).map((d) => DIAS_LARGOS[d]).join(", ")}`;
  if (r.tipo === "MAX_ASISTENTES") return `Máximo ${v.max ?? "—"} asistentes`;
  return REGLA_LABEL[r.tipo] ?? r.tipo;
}

// ── Validación completa de una solicitud ──

export type ZonaReglas = {
  nombre?: string;
  reservable: boolean;
  estado: string;
  horario: HorarioZona;
  capacidad: number | null;
  duracionMinimaMin: number;
  duracionMaximaMin: number;
  anticipacionMinimaHoras: number;
  anticipacionMaximaDias: number;
  maxReservasMesUnidad: number;
};

export type ContextoValidacion = {
  ahora: Date;
  /** Reservas activas de la zona (otras unidades y propias) en el rango consultado. */
  ocupadas: Intervalo[];
  bloqueos: (Intervalo & { motivo?: string })[];
  /** Reservas de la unidad en la zona (estados que cuentan) — para el máximo mensual y un turno por día. */
  reservasUnidad: Intervalo[];
  festivos?: Map<string, string> | Set<string>;
  reglas?: ReglaExtra[];
};

/**
 * Valida una solicitud de reserva contra horario, duración, anticipación, capacidad, reglas extra,
 * bloqueos, traslapes y máximo mensual. Devuelve la lista de problemas (vacía si es válida).
 */
export function validarSolicitud(zona: ZonaReglas, sol: { inicio: Date; fin: Date; asistentes: number }, c: ContextoValidacion): string[] {
  const errores: string[] = [];
  if (!zona.reservable) errores.push("Esta zona no se puede reservar.");
  if (zona.estado !== "ACTIVA") errores.push(zona.estado === "MANTENIMIENTO" ? "La zona está en mantenimiento." : "La zona no está disponible.");
  const { inicio, fin } = sol;
  if (!(fin.getTime() > inicio.getTime())) {
    errores.push("La hora de fin debe ser posterior a la de inicio.");
    return errores;
  }
  const duracion = Math.round((fin.getTime() - inicio.getTime()) / MS_MIN);
  if (duracion < zona.duracionMinimaMin) errores.push(`La reserva debe durar al menos ${formatoDuracion(zona.duracionMinimaMin)}.`);
  if (duracion > zona.duracionMaximaMin) errores.push(`La reserva puede durar máximo ${formatoDuracion(zona.duracionMaximaMin)}.`);

  // Horario del día (la reserva no puede pasar de un día a otro salvo terminar a medianoche)
  const fecha = fechaLocal(inicio);
  const dow = diaSemana(fecha);
  const h = horarioDia(zona.horario, dow);
  const ini = minutosLocal(inicio);
  const finFecha = fechaLocal(fin);
  const finMin = finFecha === fecha ? minutosLocal(fin) : finFecha === sumarDias(fecha, 1) && minutosLocal(fin) === 0 ? 1440 : 99999;
  if (!h) errores.push(`La zona no abre los ${DIAS_LARGOS[dow]}.`);
  else if (ini < h.abre || finMin > h.cierra) errores.push(`Fuera del horario de la zona (${hhmm(h.abre)} a ${h.cierra === 1440 ? "24:00" : hhmm(h.cierra)}).`);

  // Anticipación
  const horasAntes = (inicio.getTime() - c.ahora.getTime()) / 3_600_000;
  if (horasAntes < 0) errores.push("No puedes reservar en una fecha u hora pasada.");
  else if (horasAntes < zona.anticipacionMinimaHoras) errores.push(`Debes reservar con al menos ${zona.anticipacionMinimaHoras} horas de anticipación.`);
  if (horasAntes > zona.anticipacionMaximaDias * 24) errores.push(`Solo puedes reservar hasta ${zona.anticipacionMaximaDias} días antes.`);

  // Capacidad
  if (sol.asistentes < 1) errores.push("Indica cuántas personas asistirán.");
  if (zona.capacidad && sol.asistentes > zona.capacidad) errores.push(`La capacidad máxima es de ${zona.capacidad} personas.`);

  // Reglas extra
  const esFestivo = c.festivos ? c.festivos.has(fecha) : false;
  for (const r of c.reglas ?? []) {
    const v = (r.valor ?? {}) as { dias?: number[]; max?: number };
    if (r.tipo === "SOLO_FINES_SEMANA" && !(dow === 0 || dow === 6 || esFestivo)) errores.push("Esta zona solo se reserva los fines de semana y festivos.");
    if (r.tipo === "DIAS_PERMITIDOS" && Array.isArray(v.dias) && !v.dias.includes(dow)) errores.push(`Esta zona solo se reserva: ${v.dias.map((d) => DIAS_LARGOS[d]).join(", ")}.`);
    if (r.tipo === "MAX_ASISTENTES" && v.max && sol.asistentes > v.max) errores.push(`Máximo ${v.max} asistentes por reserva.`);
    if (r.tipo === "UN_TURNO_POR_DIA" && c.reservasUnidad.some((x) => fechaLocal(x.inicio) === fecha)) errores.push("Tu unidad ya tiene un turno ese día en esta zona.");
  }

  // Bloqueos y traslapes
  const bloqueo = buscarSolape({ inicio, fin }, c.bloqueos);
  if (bloqueo) errores.push(`La zona está bloqueada en ese horario${bloqueo.motivo ? ` (${bloqueo.motivo})` : ""}.`);
  if (buscarSolape({ inicio, fin }, c.ocupadas)) errores.push("Ese horario ya está ocupado. Elige otra franja.");

  // Máximo mensual por unidad
  const mes = mesDe(fecha);
  const delMes = c.reservasUnidad.filter((x) => mesDe(fechaLocal(x.inicio)) === mes).length;
  if (delMes >= zona.maxReservasMesUnidad) errores.push(`Tu unidad ya tiene ${delMes} reserva(s) de esta zona en el mes (máximo ${zona.maxReservasMesUnidad}).`);
  return errores;
}

export function formatoDuracion(min: number) {
  if (min % 60 === 0) return `${min / 60} hora${min === 60 ? "" : "s"}`;
  if (min < 60) return `${min} minutos`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

// ── Franjas disponibles para el calendario ──

export type EstadoFranja = "LIBRE" | "OCUPADA" | "PROPIA" | "BLOQUEADA" | "PASADA";

/** Paso de las franjas: 60 min si la duración mínima es múltiplo de una hora; si no, 30. */
export function pasoFranjas(duracionMinimaMin: number) {
  return duracionMinimaMin % 60 === 0 ? 60 : 30;
}

export type DiaDisponibilidad = {
  fecha: string;
  festivo: string | null;
  abre: string | null;
  cierra: string | null;
  bloqueos: { inicio: string; fin: string; motivo: string; tipo: string }[];
  ocupados: { inicio: string; fin: string; propia: boolean; id?: string; estado?: string; unidad?: string }[];
};

/**
 * Franjas de inicio de un día con su estado. Una franja LIBRE admite al menos la duración mínima
 * sin chocar con reservas ni bloqueos y respetando la anticipación mínima.
 */
export function franjasDelDia(
  dia: DiaDisponibilidad,
  zona: Pick<ZonaReglas, "duracionMinimaMin" | "duracionMaximaMin" | "anticipacionMinimaHoras">,
  ahora: Date,
): { inicio: string; hora: string; estado: EstadoFranja; duracionesPosibles: number[] }[] {
  if (!dia.abre || !dia.cierra) return [];
  const abre = minutosDe(dia.abre);
  const cierra = minutosDe(dia.cierra) === 0 || minutosDe(dia.cierra) <= abre ? 1440 : minutosDe(dia.cierra);
  const paso = pasoFranjas(zona.duracionMinimaMin);
  const bloqueos = dia.bloqueos.map((b) => ({ inicio: new Date(b.inicio), fin: new Date(b.fin) }));
  const ocupados = dia.ocupados.map((o) => ({ inicio: new Date(o.inicio), fin: new Date(o.fin), propia: o.propia }));
  const limite = ahora.getTime() + zona.anticipacionMinimaHoras * 3_600_000;
  const out: { inicio: string; hora: string; estado: EstadoFranja; duracionesPosibles: number[] }[] = [];
  for (let m = abre; m + zona.duracionMinimaMin <= cierra; m += paso) {
    const ini = fechaHoraBogota(dia.fecha, hhmm(m));
    const slot = { inicio: ini, fin: new Date(ini.getTime() + paso * MS_MIN) };
    let estado: EstadoFranja = "LIBRE";
    const o = ocupados.find((x) => haySolape(slot, x));
    if (ini.getTime() < limite) estado = "PASADA";
    else if (bloqueos.some((b) => haySolape(slot, b))) estado = "BLOQUEADA";
    else if (o) estado = o.propia ? "PROPIA" : "OCUPADA";
    const duraciones: number[] = [];
    if (estado === "LIBRE") {
      for (let d = zona.duracionMinimaMin; d <= zona.duracionMaximaMin && m + d <= cierra; d += paso) {
        const cand = { inicio: ini, fin: new Date(ini.getTime() + d * MS_MIN) };
        if (bloqueos.some((b) => haySolape(cand, b)) || ocupados.some((x) => haySolape(cand, x))) break;
        duraciones.push(d);
      }
      if (!duraciones.length) estado = "OCUPADA";
    }
    out.push({ inicio: ini.toISOString(), hora: hhmm(m), estado, duracionesPosibles: duraciones });
  }
  return out;
}

/** Resumen de un día para la vista mensual. */
export function resumenDia(dia: DiaDisponibilidad, zona: Parameters<typeof franjasDelDia>[1], ahora: Date): "CERRADO" | "LIBRE" | "PARCIAL" | "LLENO" | "BLOQUEADO" | "PASADO" {
  if (!dia.abre) return "CERRADO";
  const fr = franjasDelDia(dia, zona, ahora);
  if (!fr.length) return "CERRADO";
  if (fr.every((f) => f.estado === "PASADA")) return "PASADO";
  const vigentes = fr.filter((f) => f.estado !== "PASADA");
  if (vigentes.every((f) => f.estado === "BLOQUEADA")) return "BLOQUEADO";
  const libres = vigentes.filter((f) => f.estado === "LIBRE").length;
  if (libres === 0) return "LLENO";
  return libres === vigentes.length ? "LIBRE" : "PARCIAL";
}

// ── Valores (tarifa, IVA, depósito) ──

/** Tarifa por reserva (turno), IVA si la zona grava y depósito aparte (no grava IVA). */
export function valoresReserva(z: { tarifa: number; gravaIva: boolean; tarifaIva: number; deposito: number }) {
  const base = Math.round(z.tarifa);
  const iva = base > 0 && z.gravaIva ? Math.round((base * z.tarifaIva) / 100) : 0;
  return { base, iva, total: base + iva, deposito: Math.round(z.deposito), totalAPagar: base + iva + Math.round(z.deposito) };
}

/**
 * Política de cancelación: si la reserva está pagada y se cancela con al menos `horasReembolso`
 * horas de anticipación (o la cancela la administración), se reembolsa todo; si no, se retiene el alquiler.
 * El depósito (garantía) siempre se devuelve si no se usó la zona.
 */
export function politicaCancelacion(p: { pagada: boolean; inicio: Date; ahora: Date; horasReembolso: number; porAdministracion?: boolean; valor: number; deposito: number }) {
  if (!p.pagada) return { tipo: "SIN_PAGO" as const, reembolsoAlquiler: 0, reembolsoDeposito: 0, retenido: 0 };
  const horas = (p.inicio.getTime() - p.ahora.getTime()) / 3_600_000;
  const aTiempo = p.porAdministracion || horas >= p.horasReembolso;
  return aTiempo
    ? { tipo: "REEMBOLSO" as const, reembolsoAlquiler: p.valor, reembolsoDeposito: p.deposito, retenido: 0 }
    : { tipo: "RETENCION" as const, reembolsoAlquiler: 0, reembolsoDeposito: p.deposito, retenido: p.valor };
}

/** Checklist por defecto del acta de entrega/recepción según la categoría de la zona. */
export function checklistActa(categoria: string) {
  const base = ["Llaves / acceso entregado", "Aseo en buen estado", "Mobiliario completo", "Iluminación funcionando"];
  const extra: Record<string, string[]> = {
    SALON: ["Mesas y sillas completas", "Baños en buen estado", "Cocineta y equipos", "Sonido / tomacorrientes"],
    BBQ: ["Parrilla limpia", "Utensilios completos", "Extintor en su sitio"],
    PISCINA: ["Nivel y color del agua", "Duchas funcionando", "Salvavidas en su sitio"],
    GIMNASIO: ["Máquinas funcionando", "Pesas en su lugar"],
    CANCHA: ["Mallas y arcos en buen estado", "Iluminación de la cancha"],
    SALA_JUNTAS: ["Televisor / proyector", "Sillas completas"],
    COWORKING: ["Escritorios y sillas", "Wi-Fi funcionando"],
  };
  return [...base, ...(extra[categoria] ?? [])];
}
