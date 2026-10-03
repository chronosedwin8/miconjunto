/**
 * Reglas puras de objetos perdidos (sin BD): categorías, coincidencias perdido ↔ encontrado,
 * vencimientos y transiciones de estado. Se prueban en tests/unit/objetos-perdidos.test.ts.
 */
import type { CategoriaObjeto, EstadoObjetoPerdido, TipoObjetoPerdido } from "@prisma/client";

export const CATEGORIAS_OBJETO = [
  "LLAVES",
  "DOCUMENTOS",
  "BILLETERA",
  "CELULAR",
  "ELECTRONICO",
  "ROPA",
  "JUGUETE",
  "MASCOTA",
  "BICICLETA",
  "JOYA",
  "GAFAS",
  "OTRO",
] as const satisfies readonly CategoriaObjeto[];

export const ESTADOS_OBJETO = ["ABIERTO", "EN_CUSTODIA", "RECLAMADO", "DEVUELTO", "CERRADO", "DONADO"] as const satisfies readonly EstadoObjetoPerdido[];

/** Etiqueta corta y ejemplo (placeholder) por categoría. El ícono se resuelve en la UI. */
export const CATEGORIA_INFO: Record<CategoriaObjeto, { label: string; ejemplo: string }> = {
  LLAVES: { label: "Llaves", ejemplo: "Llaves con llavero de Millonarios" },
  DOCUMENTOS: { label: "Documentos", ejemplo: "Cédula, pase, carné" },
  BILLETERA: { label: "Billetera", ejemplo: "Billetera café de cuero" },
  CELULAR: { label: "Celular", ejemplo: "Celular Samsung con forro negro" },
  ELECTRONICO: { label: "Electrónico", ejemplo: "AirPods, control, tablet" },
  ROPA: { label: "Ropa", ejemplo: "Chaqueta azul de niño" },
  JUGUETE: { label: "Juguete", ejemplo: "Muñeca, balón, carrito" },
  MASCOTA: { label: "Mascota", ejemplo: "Perrito criollo con collar rojo" },
  BICICLETA: { label: "Bicicleta", ejemplo: "Bicicleta GW rin 26" },
  JOYA: { label: "Joya o reloj", ejemplo: "Anillo, cadena, reloj" },
  GAFAS: { label: "Gafas", ejemplo: "Gafas formuladas con marco negro" },
  OTRO: { label: "Otro", ejemplo: "Describe el objeto" },
};

export function categoriaLabel(c: string | null | undefined) {
  return (c && CATEGORIA_INFO[c as CategoriaObjeto]?.label) || "Otro";
}

/** Lugares de custodia sugeridos (texto libre: el conjunto puede escribir otro). */
export const LUGARES_CUSTODIA = ["Portería principal", "Administración", "Casillero de objetos perdidos"] as const;

// ───────────────────────── Texto ─────────────────────────

const STOPWORDS = new Set(
  "con sin del de la las los el un una unos unas para por que y o en al se su sus mi mis tu es son muy mas pero como cuando donde esta este esto estos estas eso esa ese lo le les ya hay fue era tiene tenia color marca algo cerca dentro fuera tipo bien mal sobre entre hasta desde porque perdi perdio encontre encontro encontrado encontrada perdido perdida dejo deje olvido olvide uno dos tres cuatro cinco seis siete ocho nueve diez estaba estaban junto ayer hoy dia noche tarde manana".split(
    " ",
  ),
);

/** minúsculas, sin tildes ni signos, espacios simples. */
export function normalizarTexto(s: string | null | undefined) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Raíz muy simple (plurales y género) para comparar "llaves"/"llave", "negra"/"negro". */
function raiz(w: string) {
  let r = w;
  if (r.length > 4 && r.endsWith("es")) r = r.slice(0, -2);
  else if (r.length > 3 && r.endsWith("s")) r = r.slice(0, -1);
  if (r.length > 3 && (r.endsWith("a") || r.endsWith("o"))) r = r.slice(0, -1);
  return r;
}

/** Palabras clave significativas (sin stopwords ni colores, con raíz). */
export function palabrasClave(...textos: (string | null | undefined)[]) {
  return new Set(palabrasConOriginal(...textos).keys());
}

/** Raíz → primera palabra original (sin tildes) en que apareció, para mostrar razones legibles. */
function palabrasConOriginal(...textos: (string | null | undefined)[]) {
  const out = new Map<string, string>();
  for (const t of textos) {
    for (const w of normalizarTexto(t).split(" ")) {
      if (w.length < 3 || STOPWORDS.has(w) || /^\d+$/.test(w) || COLOR_DE.has(w)) continue;
      const r = raiz(w);
      if (!out.has(r)) out.set(r, w);
    }
  }
  return out;
}

/** Colores canónicos y sus variantes habituales en Colombia. */
const COLORES: Record<string, string[]> = {
  negro: ["negro", "negra", "negros", "negras", "oscuro", "oscura"],
  blanco: ["blanco", "blanca", "blancos", "blancas"],
  gris: ["gris", "grises", "plateado", "plateada", "plata"],
  rojo: ["rojo", "roja", "rojos", "rojas", "vinotinto", "tinto"],
  azul: ["azul", "azules", "celeste", "turquesa"],
  verde: ["verde", "verdes"],
  amarillo: ["amarillo", "amarilla"],
  naranja: ["naranja", "naranjado", "anaranjado", "anaranjada"],
  cafe: ["cafe", "marron", "carmelita", "chocolate", "beige", "crema"],
  rosado: ["rosado", "rosada", "rosa", "fucsia"],
  morado: ["morado", "morada", "lila", "violeta"],
  dorado: ["dorado", "dorada", "oro"],
};
const COLOR_DE = new Map<string, string>(Object.entries(COLORES).flatMap(([c, vs]) => vs.map((v) => [v, c] as [string, string])));

/** Colores canónicos mencionados en los textos. */
export function coloresDe(...textos: (string | null | undefined)[]) {
  const out = new Set<string>();
  for (const t of textos) for (const w of normalizarTexto(t).split(" ")) if (COLOR_DE.has(w)) out.add(COLOR_DE.get(w)!);
  return out;
}

// ───────────────────────── Coincidencias ─────────────────────────

export type DatosCoincidencia = {
  id?: string;
  tipo: TipoObjetoPerdido;
  categoria: CategoriaObjeto;
  titulo?: string | null;
  descripcion: string;
  color?: string | null;
  marca?: string | null;
  lugar?: string | null;
  zonaId?: string | null;
  fecha: Date;
};

export type Coincidencia = { puntaje: number; razones: string[] };

/** A partir de este puntaje se sugiere ("Puede ser este") y se avisa al dueño. */
export const UMBRAL_SUGERENCIA = 45;
/** A partir de este puntaje se considera "muy probable". */
export const UMBRAL_PROBABLE = 70;

const DIA = 86_400_000;

/**
 * Puntaje 0–100 de que un reporte PERDIDO y uno ENCONTRADO sean el mismo objeto.
 * Categoría (obligatoria salvo "Otro") + palabras clave + color + marca + cercanía de fechas + lugar.
 * Nunca usa los rasgos privados: el puntaje no debe filtrar información que solo el dueño conoce.
 */
export function puntajeCoincidencia(a: DatosCoincidencia, b: DatosCoincidencia): Coincidencia {
  if (a.tipo === b.tipo) return { puntaje: 0, razones: [] };
  const perdido = a.tipo === "PERDIDO" ? a : b;
  const encontrado = a.tipo === "PERDIDO" ? b : a;
  const razones: string[] = [];
  let p = 0;

  // Categoría: distinta (y ninguna es "Otro") descarta.
  if (perdido.categoria === encontrado.categoria) {
    p += perdido.categoria === "OTRO" ? 15 : 35;
    if (perdido.categoria !== "OTRO") razones.push(`Misma categoría (${categoriaLabel(perdido.categoria).toLowerCase()})`);
  } else if (perdido.categoria === "OTRO" || encontrado.categoria === "OTRO") {
    p += 5;
  } else {
    return { puntaje: 0, razones: [] };
  }

  // Palabras clave en título, descripción y marca.
  const kp = palabrasConOriginal(perdido.titulo, perdido.descripcion, perdido.marca);
  const ke = palabrasConOriginal(encontrado.titulo, encontrado.descripcion, encontrado.marca);
  const comunes = [...kp.keys()].filter((w) => ke.has(w));
  if (comunes.length) {
    p += Math.min(30, comunes.length * 10);
    razones.push(`Ambos mencionan: ${comunes.slice(0, 4).map((w) => ke.get(w)).join(", ")}`);
  }

  // Color: suma si comparten, resta si ambos lo indican y no coincide.
  const cp = coloresDe(perdido.color, perdido.titulo, perdido.descripcion);
  const ce = coloresDe(encontrado.color, encontrado.titulo, encontrado.descripcion);
  const colorComun = [...cp].filter((c) => ce.has(c));
  if (colorComun.length) {
    p += 15;
    razones.push(`Mismo color (${colorComun.join(", ")})`);
  } else if (cp.size && ce.size) {
    p -= 10;
  }

  // Marca.
  const mp = normalizarTexto(perdido.marca);
  const me = normalizarTexto(encontrado.marca);
  if (mp && me) {
    if (mp === me || mp.includes(me) || me.includes(mp)) {
      p += 10;
      razones.push(`Misma marca (${encontrado.marca})`);
    } else p -= 5;
  }

  // Fechas: no se puede encontrar algo mucho antes de perderlo (1 día de tolerancia).
  const dias = (encontrado.fecha.getTime() - perdido.fecha.getTime()) / DIA;
  if (dias < -1) {
    p -= 25;
  } else {
    const d = Math.abs(dias);
    if (d <= 2) {
      p += 15;
      razones.push("Fechas muy cercanas");
    } else if (d <= 7) {
      p += 10;
      razones.push("La misma semana");
    } else if (d <= 30) p += 5;
  }

  // Lugar.
  if (perdido.zonaId && perdido.zonaId === encontrado.zonaId) {
    p += 10;
    razones.push("Misma zona");
  } else {
    const lp = palabrasClave(perdido.lugar);
    const le = palabrasClave(encontrado.lugar);
    if ([...lp].some((w) => le.has(w))) {
      p += 5;
      razones.push("Lugar parecido");
    }
  }

  return { puntaje: Math.max(0, Math.min(100, Math.round(p))), razones };
}

/** Ordena candidatos por puntaje y deja solo los que superan el umbral. */
export function mejoresCoincidencias<T extends DatosCoincidencia>(base: DatosCoincidencia, candidatos: T[], opts?: { umbral?: number; max?: number }) {
  const umbral = opts?.umbral ?? UMBRAL_SUGERENCIA;
  return candidatos
    .filter((c) => c.tipo !== base.tipo && c.id !== base.id)
    .map((c) => ({ objeto: c, ...puntajeCoincidencia(base, c) }))
    .filter((x) => x.puntaje >= umbral)
    .sort((x, y) => y.puntaje - x.puntaje)
    .slice(0, opts?.max ?? 5);
}

// ───────────────────────── Estados ─────────────────────────

export const ESTADOS_ACTIVOS: readonly EstadoObjetoPerdido[] = ["ABIERTO", "EN_CUSTODIA", "RECLAMADO"];
export const ESTADOS_FINALES: readonly EstadoObjetoPerdido[] = ["DEVUELTO", "CERRADO", "DONADO"];

export function esActivo(estado: EstadoObjetoPerdido) {
  return ESTADOS_ACTIVOS.includes(estado);
}

/** ¿Se puede reclamar? Solo objetos encontrados que siguen sin dueño. */
export function admiteReclamo(o: { tipo: TipoObjetoPerdido; estado: EstadoObjetoPerdido }) {
  return o.tipo === "ENCONTRADO" && (o.estado === "ABIERTO" || o.estado === "EN_CUSTODIA");
}

/** ¿Portería/administración puede recibirlo en custodia? */
export function admiteCustodia(o: { tipo: TipoObjetoPerdido; estado: EstadoObjetoPerdido }) {
  return o.tipo === "ENCONTRADO" && o.estado === "ABIERTO";
}

/** ¿Se puede entregar al dueño (con documento y firma)? */
export function admiteEntrega(o: { tipo: TipoObjetoPerdido; estado: EstadoObjetoPerdido }) {
  return o.tipo === "ENCONTRADO" && esActivo(o.estado);
}

/** ¿Se puede donar o cerrar por disposición? (encontrados sin reclamar). */
export function admiteDisposicion(o: { tipo: TipoObjetoPerdido; estado: EstadoObjetoPerdido }) {
  return o.tipo === "ENCONTRADO" && (o.estado === "ABIERTO" || o.estado === "EN_CUSTODIA");
}

// ───────────────────────── Vencimientos ─────────────────────────

export const DIAS_CUSTODIA_DEFECTO = 60;
export const DIAS_PERDIDO_DEFECTO = 90;
/** Días antes del cierre automático de un reporte de pérdida en que se avisa al dueño. */
export const DIAS_AVISO_CIERRE = 7;

/** Fecha de vencimiento: perdidos → cierre automático; encontrados en custodia → disposición. */
export function calcularVencimiento(tipo: TipoObjetoPerdido, base: Date, cfg: { diasCustodia: number; diasPerdido: number }) {
  return new Date(base.getTime() + (tipo === "PERDIDO" ? cfg.diasPerdido : cfg.diasCustodia) * DIA);
}

export type AccionVencimiento = "AVISAR_CIERRE" | "CERRAR" | "PEDIR_DISPOSICION" | null;

/**
 * Qué debe hacer el job diario con un objeto:
 * - PERDIDO abierto: avisar al dueño 7 días antes y cerrarlo al vencer.
 * - ENCONTRADO en custodia vencido: pedir disposición a la administración el día que vence y luego cada 7 días.
 * Pensado para correr una vez al día: cada aviso cae en exactamente una ejecución.
 */
export function accionVencimiento(o: { tipo: TipoObjetoPerdido; estado: EstadoObjetoPerdido; venceEn: Date | null }, ahora: Date): AccionVencimiento {
  if (!o.venceEn) return null;
  const ms = o.venceEn.getTime() - ahora.getTime();
  if (o.tipo === "PERDIDO" && o.estado === "ABIERTO") {
    if (ms <= 0) return "CERRAR";
    // Faltan entre 6 y 7 días (ventana de 24 h).
    return Math.ceil(ms / DIA) === DIAS_AVISO_CIERRE ? "AVISAR_CIERRE" : null;
  }
  if (o.tipo === "ENCONTRADO" && o.estado === "EN_CUSTODIA" && ms <= 0) {
    const vencidoHace = Math.floor(-ms / DIA);
    return vencidoHace % 7 === 0 ? "PEDIR_DISPOSICION" : null;
  }
  return null;
}

/** Días que lleva un objeto en custodia. */
export function diasEnCustodia(recibidoEn: Date | null, ahora = new Date()) {
  return recibidoEn ? Math.max(0, Math.floor((ahora.getTime() - recibidoEn.getTime()) / DIA)) : 0;
}

/** ¿El objeto en custodia ya superó el plazo y espera disposición? */
export function custodiaVencida(o: { tipo: TipoObjetoPerdido; estado: EstadoObjetoPerdido; venceEn: Date | null }, ahora = new Date()) {
  return o.tipo === "ENCONTRADO" && o.estado === "EN_CUSTODIA" && !!o.venceEn && o.venceEn.getTime() <= ahora.getTime();
}

/** Código legible: OP-2026-0001. */
export function formatoCodigo(anio: number, n: number) {
  return `OP-${anio}-${String(n).padStart(4, "0")}`;
}

/** Firma en pantalla: data URL de imagen razonable. */
export const FIRMA_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
