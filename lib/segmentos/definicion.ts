import { z } from "zod";

/**
 * Definición JSON de un segmento de destinatarios (se guarda en `Segmento.definicion`,
 * `Publicacion.audiencia`, `CampanaCorreo.definicionSegmento`, encuestas, votaciones…).
 *
 * Semántica:
 * - Todos los filtros se combinan con Y (AND). Dentro de una lista (torres, roles…) es O (OR).
 * - Los filtros de UNIDAD (torres, pisos, números, unidades, tipos de unidad, ocupación, cartera,
 *   mascotas, vehículos, menores, adultos mayores, movilidad reducida, tipo de vínculo) determinan un
 *   conjunto de unidades; los destinatarios son las personas vinculadas activamente a esas unidades.
 * - `roles` filtra por la clave del rol de la membresía (ADMINISTRADOR, CONSEJO, PROPIETARIO…).
 *   Si solo hay filtro de roles (sin filtros de unidad), incluye al personal sin unidad (p. ej. portería).
 * - `vinculos` restringe qué personas de la unidad reciben (p. ej. solo PROPIETARIO). Si no se indica,
 *   reciben propietarios, copropietarios, arrendatarios, residentes y familiares.
 * - Una definición vacía equivale a "todo el conjunto".
 */
export const TIPOS_VINCULO = [
  "PROPIETARIO",
  "COPROPIETARIO",
  "ARRENDATARIO",
  "RESIDENTE",
  "FAMILIAR",
  "EMPLEADO_DOMESTICO",
  "CUIDADOR",
  "VISITANTE_FRECUENTE",
  "AUTORIZADO_RECOGER_PAQUETES",
  "AUTORIZADO_MENORES",
] as const;

export const VINCULOS_DESTINATARIOS_DEFECTO = ["PROPIETARIO", "COPROPIETARIO", "ARRENDATARIO", "RESIDENTE", "FAMILIAR"] as const;
export const OCUPACIONES = ["PROPIETARIO_OCUPA", "ARRENDADA", "AIRBNB_O_SIMILAR", "DESOCUPADA", "EN_VENTA"] as const;
export const TIPOS_UNIDAD = ["APARTAMENTO", "CASA", "LOCAL", "OFICINA", "DEPOSITO", "PARQUEADERO"] as const;
export const EDAD_ADULTO_MAYOR = 60;
export const EDAD_MAYORIA = 18;

const arr = <T extends z.ZodType>(t: T) => z.array(t).max(2000).optional();

export const segmentoDefSchema = z
  .object({
    torres: arr(z.string().min(1)),
    /** Incluye casas / unidades sin torre cuando se filtra por torres. */
    incluirSinTorre: z.boolean().optional(),
    pisoMin: z.number().int().min(-10).max(200).nullable().optional(),
    pisoMax: z.number().int().min(-10).max(200).nullable().optional(),
    /** Rango por número de unidad (parte numérica final del código: "T2-501" → 501, "Casa 14" → 14). */
    numeroDesde: z.number().int().min(0).nullable().optional(),
    numeroHasta: z.number().int().min(0).nullable().optional(),
    /** Unidades específicas (ids). */
    unidades: arr(z.string().min(1)),
    tiposUnidad: arr(z.enum(TIPOS_UNIDAD)),
    roles: arr(z.string().min(1).max(60)),
    vinculos: arr(z.enum(TIPOS_VINCULO)),
    cartera: z.enum(["AL_DIA", "EN_MORA"]).nullable().optional(),
    ocupacion: arr(z.enum(OCUPACIONES)),
    conMascotas: z.boolean().optional(),
    conVehiculos: z.boolean().optional(),
    conMenores: z.boolean().optional(),
    adultosMayores: z.boolean().optional(),
    movilidadReducida: z.boolean().optional(),
  })
  .strip();

export type SegmentoDef = z.infer<typeof segmentoDefSchema>;

/** Parsea y limpia una definición (quita listas vacías y valores nulos). Nunca lanza: devuelve {} si es inválida. */
export function normalizarDef(raw: unknown): SegmentoDef {
  const r = segmentoDefSchema.safeParse(raw ?? {});
  if (!r.success) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r.data)) {
    if (v === null || v === undefined || v === false) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = Array.isArray(v) ? [...new Set(v)] : v;
  }
  return out as SegmentoDef;
}

/** Igual que `normalizarDef` pero lanza si la definición no es válida (para acciones). */
export function parseDef(raw: unknown): SegmentoDef {
  segmentoDefSchema.parse(raw ?? {});
  return normalizarDef(raw);
}

export function esVacia(def: SegmentoDef) {
  return Object.keys(normalizarDef(def)).length === 0;
}

/** ¿Tiene filtros que restringen por unidad? */
export function tieneFiltrosUnidad(def: SegmentoDef) {
  return Object.keys(normalizarDef(def)).some((k) => k !== "roles");
}

/** Número de la unidad a partir del código: última secuencia de dígitos. */
export function numeroUnidad(codigo: string): number | null {
  const m = codigo.match(/(\d+)\D*$/);
  return m ? Number(m[1]) : null;
}

export function enRango(n: number | null, min?: number | null, max?: number | null) {
  if (min === null || min === undefined) {
    if (max === null || max === undefined) return true;
  }
  if (n === null) return false;
  if (min !== null && min !== undefined && n < min) return false;
  if (max !== null && max !== undefined && n > max) return false;
  return true;
}

export function edadEn(fechaNacimiento: Date | null | undefined, ref = new Date()) {
  if (!fechaNacimiento) return null;
  const f = new Date(fechaNacimiento);
  let e = ref.getFullYear() - f.getFullYear();
  const m = ref.getMonth() - f.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < f.getDate())) e--;
  return e;
}

/** Fecha de corte: nacidos después de esta fecha tienen menos de `anios` años. */
export function fechaCorteEdad(anios: number, ref = new Date()) {
  const d = new Date(ref);
  d.setFullYear(d.getFullYear() - anios);
  return d;
}

const ETQ: Record<string, string> = {
  PROPIETARIO: "Propietarios",
  COPROPIETARIO: "Copropietarios",
  ARRENDATARIO: "Arrendatarios",
  RESIDENTE: "Residentes",
  FAMILIAR: "Familiares",
  EMPLEADO_DOMESTICO: "Empleados domésticos",
  CUIDADOR: "Cuidadores",
  VISITANTE_FRECUENTE: "Visitantes frecuentes",
  AUTORIZADO_RECOGER_PAQUETES: "Autorizados para paquetes",
  AUTORIZADO_MENORES: "Autorizados para menores",
  PROPIETARIO_OCUPA: "Ocupada por el propietario",
  ARRENDADA: "Arrendadas",
  AIRBNB_O_SIMILAR: "Renta corta",
  DESOCUPADA: "Desocupadas",
  EN_VENTA: "En venta",
  APARTAMENTO: "Apartamentos",
  CASA: "Casas",
  LOCAL: "Locales",
  OFICINA: "Oficinas",
  DEPOSITO: "Depósitos",
  PARQUEADERO: "Parqueaderos",
};

/** Descripción legible (chips) de una definición. `nombres` traduce ids de torres/unidades y claves de rol. */
export function describirDef(def: SegmentoDef, nombres: { torres?: Record<string, string>; unidades?: Record<string, string>; roles?: Record<string, string> } = {}): string[] {
  const d = normalizarDef(def);
  const out: string[] = [];
  if (d.torres?.length) out.push(d.torres.map((t) => nombres.torres?.[t] ?? "Torre").join(", ") + (d.incluirSinTorre ? " y casas" : ""));
  if (d.pisoMin != null || d.pisoMax != null) {
    out.push(d.pisoMin != null && d.pisoMax != null ? `Pisos ${d.pisoMin} a ${d.pisoMax}` : d.pisoMin != null ? `Desde el piso ${d.pisoMin}` : `Hasta el piso ${d.pisoMax}`);
  }
  if (d.numeroDesde != null || d.numeroHasta != null) {
    out.push(`Unidades ${d.numeroDesde ?? "…"} a ${d.numeroHasta ?? "…"}`);
  }
  if (d.unidades?.length) {
    const cods = d.unidades.map((u) => nombres.unidades?.[u] ?? "").filter(Boolean);
    out.push(cods.length && cods.length <= 4 ? cods.join(", ") : `${d.unidades.length} unidades específicas`);
  }
  if (d.tiposUnidad?.length) out.push(d.tiposUnidad.map((t) => ETQ[t] ?? t).join(" o "));
  if (d.roles?.length) out.push("Rol: " + d.roles.map((r) => nombres.roles?.[r] ?? r).join(", "));
  if (d.vinculos?.length) out.push(d.vinculos.map((v) => ETQ[v] ?? v).join(" o "));
  if (d.cartera) out.push(d.cartera === "AL_DIA" ? "Al día" : "En mora");
  if (d.ocupacion?.length) out.push(d.ocupacion.map((o) => ETQ[o] ?? o).join(" o "));
  if (d.conMascotas) out.push("Con mascotas");
  if (d.conVehiculos) out.push("Con vehículos");
  if (d.conMenores) out.push("Con menores de edad");
  if (d.adultosMayores) out.push("Con adultos mayores");
  if (d.movilidadReducida) out.push("Con movilidad reducida");
  return out.length ? out : ["Todo el conjunto"];
}
