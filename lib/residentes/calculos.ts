/**
 * Reglas puras del módulo de residentes (sin BD): edades, placas, horarios, anonimización e indicadores.
 */
import crypto from "node:crypto";
import type { TipoVinculo } from "@prisma/client";
import { edad } from "@/lib/format";

export const EDAD_ADULTO_MAYOR = 60;
export const MAYORIA_EDAD = 18;

export function esMenorDeEdad(fechaNacimiento: Date | null | undefined, ref = new Date()) {
  const e = edad(fechaNacimiento ?? null, ref);
  return e !== null && e < MAYORIA_EDAD;
}

export function esAdultoMayor(fechaNacimiento: Date | null | undefined, ref = new Date()) {
  const e = edad(fechaNacimiento ?? null, ref);
  return e !== null && e >= EDAD_ADULTO_MAYOR;
}

/** Rango de fechas de nacimiento para filtrar por edad en consultas (menores: nacidos después de `desde`). */
export function fechaCorteEdad(anios: number, ref = new Date()) {
  const d = new Date(ref);
  d.setFullYear(d.getFullYear() - anios);
  return d;
}

/** Placa en mayúsculas, sin espacios ni guiones: "abc 12-3" → "ABC123". */
export function normalizarPlaca(placa: string) {
  return placa.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Placas colombianas habituales: carro AAA123, moto AAA12A / AAA12, diplomáticas y remolques con formatos libres. */
export function placaValida(placa: string, tipo: "CARRO" | "MOTO" | "BICICLETA" | "OTRO") {
  const p = normalizarPlaca(placa);
  if (tipo === "CARRO") return /^[A-Z]{3}\d{3}$/.test(p) || /^[A-Z]{2}\d{4}$/.test(p);
  if (tipo === "MOTO") return /^[A-Z]{3}\d{2}[A-Z]?$/.test(p);
  return p.length >= 2 && p.length <= 12;
}

export type Horario = { dias: number[]; desde: string; hasta: string };

/** Valida y normaliza el horario permitido de empleados y visitantes frecuentes. */
export function normalizarHorario(h: { dias?: (string | number)[] | null; desde?: string | null; hasta?: string | null } | null | undefined): Horario | null {
  if (!h) return null;
  const dias = [...new Set((h.dias ?? []).map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  const desde = h.desde?.trim() || "";
  const hasta = h.hasta?.trim() || "";
  if (!dias.length && !desde && !hasta) return null;
  if (!dias.length) throw new Error("Selecciona al menos un día permitido.");
  if (!/^\d{2}:\d{2}$/.test(desde) || !/^\d{2}:\d{2}$/.test(hasta)) throw new Error("Escribe la hora de entrada y de salida.");
  if (desde >= hasta) throw new Error("La hora de salida debe ser posterior a la de entrada.");
  return { dias, desde, hasta };
}

const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
export const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export function describirHorario(h: unknown) {
  const x = h as Horario | null;
  if (!x || !Array.isArray(x.dias) || !x.dias.length) return "Sin horario definido";
  const dias = x.dias.length === 7 ? "Todos los días" : x.dias.length === 5 && [1, 2, 3, 4, 5].every((d) => x.dias.includes(d)) ? "Lun a Vie" : x.dias.map((d) => DIAS_CORTOS[d]).join(", ");
  return `${dias} · ${x.desde} a ${x.hasta}`;
}

/** ¿El horario permite el ingreso en este momento (día de la semana 0-6 y hora HH:mm de Bogotá)? */
export function dentroDeHorario(h: unknown, weekday: number, hhmm: string) {
  const x = h as Horario | null;
  if (!x || !Array.isArray(x.dias)) return true;
  return x.dias.includes(weekday) && hhmm >= x.desde && hhmm <= x.hasta;
}

/** Hash estable del documento para anonimizar sin romper la restricción de unicidad. */
export function hashDocumento(conjuntoId: string, tipo: string, numero: string, salt = "") {
  return "ANON-" + crypto.createHash("sha256").update(`${conjuntoId}|${tipo}|${numero}|${salt}`).digest("hex").slice(0, 20).toUpperCase();
}

/** Datos a escribir en la Persona al anonimizarla (retiro o supresión por habeas data, Ley 1581/2012). */
export function datosAnonimizados(p: { id: string; conjuntoId: string; tipoDocumento: string; numeroDocumento: string }) {
  return {
    nombres: "Titular retirado",
    apellidos: "",
    numeroDocumento: hashDocumento(p.conjuntoId, p.tipoDocumento, p.numeroDocumento, p.id),
    fechaNacimiento: null,
    genero: null,
    fotoUrl: null,
    telefono: null,
    email: null,
    eps: null,
    contactoEmergenciaNombre: null,
    contactoEmergenciaTelefono: null,
    ocupacion: null,
    movilidadReducida: false,
    movilidadDescripcion: null,
    requiereAsistenciaEvacuacion: false,
    tipoSangre: null,
    observaciones: null,
    directorioOptIn: false,
    directorioCampos: [] as string[],
    serviciosOfrecidos: null,
    anonimizada: true,
  };
}

// ── Tipos de vínculo ──
export const VINCULOS_OCUPANTES: TipoVinculo[] = ["PROPIETARIO", "COPROPIETARIO", "ARRENDATARIO", "RESIDENTE", "FAMILIAR"];
export const VINCULOS_PERSONAL: TipoVinculo[] = ["EMPLEADO_DOMESTICO", "CUIDADOR", "VISITANTE_FRECUENTE"];
export const VINCULOS_AUTORIZADOS: TipoVinculo[] = ["AUTORIZADO_RECOGER_PAQUETES", "AUTORIZADO_MENORES"];
/** Personas que viven en la unidad (para evacuación y población). */
export const VINCULOS_HABITAN: TipoVinculo[] = ["PROPIETARIO", "COPROPIETARIO", "ARRENDATARIO", "RESIDENTE", "FAMILIAR", "CUIDADOR"];

/**
 * Tipos de vínculo que un residente puede registrar en su unidad y el estado inicial.
 * - Propietario: puede registrar arrendatarios y copropietarios, pero quedan pendientes de aprobación del administrador.
 * - Arrendatario/residente: su grupo familiar, empleados, visitantes frecuentes y autorizados.
 * - Nunca puede crear otro PROPIETARIO (lo hace la administración con soporte de escritura).
 */
export function reglaVinculoResidente(tipo: TipoVinculo, esPropietario: boolean): { permitido: boolean; estado: "ACTIVO" | "PENDIENTE_APROBACION"; motivo?: string } {
  if (tipo === "PROPIETARIO") return { permitido: false, estado: "ACTIVO", motivo: "Los propietarios los registra la administración con el soporte de la escritura." };
  if (tipo === "ARRENDATARIO" || tipo === "COPROPIETARIO") {
    if (!esPropietario) return { permitido: false, estado: "ACTIVO", motivo: "Solo el propietario puede registrar arrendatarios o copropietarios." };
    return { permitido: true, estado: "PENDIENTE_APROBACION" };
  }
  return { permitido: true, estado: "ACTIVO" };
}

// ── Indicadores de población ──
export type PersonaIndicador = {
  fechaNacimiento: Date | null;
  movilidadReducida: boolean;
  requiereAsistenciaEvacuacion: boolean;
  unidades: { torre: string; piso: number }[];
};

export type Indicadores = {
  totalPersonas: number;
  menores: number;
  adultosMayores: number;
  sinFechaNacimiento: number;
  movilidadReducida: number;
  movilidadPorTorrePiso: { torre: string; piso: number; personas: number }[];
};

/** Cálculo puro de los indicadores de población a partir de las personas que habitan el conjunto. */
export function calcularIndicadores(personas: PersonaIndicador[], ref = new Date()): Indicadores {
  let menores = 0;
  let mayores = 0;
  let sinFecha = 0;
  let movilidad = 0;
  const mapa = new Map<string, { torre: string; piso: number; personas: number }>();
  for (const p of personas) {
    if (!p.fechaNacimiento) sinFecha++;
    else if (esMenorDeEdad(p.fechaNacimiento, ref)) menores++;
    else if (esAdultoMayor(p.fechaNacimiento, ref)) mayores++;
    if (p.movilidadReducida || p.requiereAsistenciaEvacuacion) {
      movilidad++;
      for (const u of p.unidades) {
        const k = `${u.torre}|${u.piso}`;
        const cur = mapa.get(k) ?? { torre: u.torre, piso: u.piso, personas: 0 };
        cur.personas++;
        mapa.set(k, cur);
      }
    }
  }
  return {
    totalPersonas: personas.length,
    menores,
    adultosMayores: mayores,
    sinFechaNacimiento: sinFecha,
    movilidadReducida: movilidad,
    movilidadPorTorrePiso: [...mapa.values()].sort((a, b) => a.torre.localeCompare(b.torre, "es", { numeric: true }) || b.piso - a.piso),
  };
}

/** Estado de un documento con vencimiento (SOAT, tecnomecánica, antirrábica). */
export function estadoVencimiento(vence: Date | null | undefined, ref = new Date(), diasAviso = 30): "VIGENTE" | "POR_VENCER" | "VENCIDO" | null {
  if (!vence) return null;
  const diff = (new Date(vence).getTime() - ref.getTime()) / 86_400_000;
  if (diff < 0) return "VENCIDO";
  if (diff <= diasAviso) return "POR_VENCER";
  return "VIGENTE";
}

// ── Panel guiado ──
export const PASOS_MI_HOGAR = [
  { n: 1, titulo: "Tus datos y documento", corto: "Tus datos" },
  { n: 2, titulo: "Unidad y tipo de vínculo", corto: "Unidad" },
  { n: 3, titulo: "Grupo familiar y ocupantes", corto: "Familia" },
  { n: 4, titulo: "Empleados y visitantes frecuentes", corto: "Empleados" },
  { n: 5, titulo: "Vehículos", corto: "Vehículos" },
  { n: 6, titulo: "Mascotas", corto: "Mascotas" },
  { n: 7, titulo: "Información de emergencia", corto: "Emergencia" },
  { n: 8, titulo: "Autorizaciones", corto: "Autorizados" },
  { n: 9, titulo: "Política de datos", corto: "Privacidad" },
] as const;
