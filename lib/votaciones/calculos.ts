import crypto from "node:crypto";

/**
 * Cálculos puros de gobierno de la copropiedad (Ley 675 de 2001): quórum, mayorías, resultados
 * por opción, comprobante de voto y antelación de convocatorias. Sin acceso a BD: se prueban en
 * tests/unit/votaciones.test.ts.
 *
 * Convenciones:
 * - Los coeficientes se expresan en porcentaje (la suma del conjunto es 100).
 * - Se redondea a 6 decimales (precisión de `Decimal(9, 6)` en la BD) para evitar errores de coma flotante.
 */

export type TipoMayoria = "SIMPLE" | "CALIFICADA_70" | "UNANIME";
export type Ponderacion = "COEFICIENTE" | "UNIDAD";

export type PesoUnidad = { unidadId: string; coeficiente: number };
export type VotoCalculo = PesoUnidad & { opcionId: string };
export type OpcionVotacion = { id: string; texto: string };

const EPS = 1e-9;
export const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const round2 = (n: number) => Math.round(n * 100) / 100;
const pctOf = (parte: number, total: number) => (total > 0 ? round2((parte / total) * 100) : 0);

/** Peso de un voto según la ponderación: el coeficiente de la unidad o 1 (una unidad, un voto). */
export function pesoVoto(ponderacion: Ponderacion, coeficiente: number) {
  return ponderacion === "UNIDAD" ? 1 : coeficiente;
}

/** Elimina unidades repetidas (una unidad cuenta una sola vez aunque figure presente y por poder). */
export function unicasPorUnidad<T extends { unidadId: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    if (seen.has(it.unidadId)) continue;
    seen.add(it.unidadId);
    out.push(it);
  }
  return out;
}

// ───────────────────────────── QUÓRUM ─────────────────────────────

export type QuorumInput = {
  /** Unidades presentes o representadas por poder (se deduplican por unidad). */
  presentes: PesoUnidad[];
  /** Suma de coeficientes del conjunto (normalmente 100). */
  totalCoeficientes: number;
  totalUnidades: number;
  /**
   * Porcentaje requerido. Por defecto 50,000001 %: Ley 675 art. 45 exige "más de la mitad de los
   * coeficientes", es decir, estrictamente más del 50 %.
   */
  requerido?: number;
};

export type QuorumResultado = {
  coeficientePresente: number;
  porcentaje: number;
  unidadesPresentes: number;
  porcentajeUnidades: number;
  requerido: number;
  hayQuorum: boolean;
  /** Puntos de coeficiente que faltan para alcanzar el quórum (0 si ya hay). */
  faltante: number;
};

/** Quórum deliberatorio: suma de coeficientes presentes + representados ≥ requerido. */
export function calcularQuorum(input: QuorumInput): QuorumResultado {
  const requerido = input.requerido ?? 50.000001;
  const unicos = unicasPorUnidad(input.presentes);
  const coef = round6(unicos.reduce((a, p) => a + p.coeficiente, 0));
  const porcentaje = input.totalCoeficientes > 0 ? round6((coef / input.totalCoeficientes) * 100) : 0;
  const hayQuorum = porcentaje + EPS >= requerido && porcentaje > 0;
  const necesario = (requerido / 100) * input.totalCoeficientes;
  return {
    coeficientePresente: coef,
    porcentaje,
    unidadesPresentes: unicos.length,
    porcentajeUnidades: pctOf(unicos.length, input.totalUnidades),
    requerido,
    hayQuorum,
    faltante: hayQuorum ? 0 : round6(Math.max(0, necesario - coef)),
  };
}

// ───────────────────────────── MAYORÍAS Y RESULTADOS ─────────────────────────────

export type ResultadoInput = {
  opciones: OpcionVotacion[];
  votos: VotoCalculo[];
  ponderacion: Ponderacion;
  tipoMayoria: TipoMayoria;
  /** Suma de coeficientes de todas las unidades del conjunto (normalmente 100). */
  totalCoeficientes: number;
  /** Número total de unidades con derecho a voto en el conjunto. */
  totalUnidades: number;
  /**
   * Asistencia de la sesión (solo votaciones de asamblea). Para mayoría SIMPLE y UNÁNIME la base es
   * lo representado en la sesión (Ley 675 art. 45); si no se indica, la base son los votos emitidos.
   */
  presentes?: { coeficiente: number; unidades: number };
};

export type ResultadoOpcion = {
  id: string;
  texto: string;
  votos: number;
  coeficiente: number;
  /** Peso según la ponderación (coeficiente o número de unidades). */
  peso: number;
  /** % sobre el total de coeficientes del conjunto. */
  pctCoeficiente: number;
  /** % sobre lo emitido (según la ponderación). */
  pctParticipacion: number;
  /** % sobre la base de la mayoría (sesión o emitido). */
  pctBase: number;
};

export type ResultadoVotacion = {
  opciones: ResultadoOpcion[];
  totalVotos: number;
  coeficienteVotante: number;
  /** Participación por coeficiente sobre el total del conjunto. */
  participacionCoeficiente: number;
  /** Participación por número de unidades sobre el total. */
  participacionUnidades: number;
  /** Peso total emitido según la ponderación. */
  pesoEmitido: number;
  /** Base sobre la que se mide la mayoría y umbral aplicado. */
  base: { descripcion: string; peso: number; umbral: number; regla: string };
  ganadora: { id: string; texto: string } | null;
  empate: boolean;
  /** true si la opción ganadora alcanza la mayoría exigida. */
  aprobada: boolean;
  decision: string;
  tipoMayoria: TipoMayoria;
  ponderacion: Ponderacion;
};

/**
 * Resultado de una votación con la mayoría exigida:
 * - SIMPLE: la opción ganadora debe superar la mitad de la base (más de la mitad de lo presente en la
 *   sesión o, fuera de asamblea, de lo emitido), según la ponderación.
 * - CALIFICADA_70: ≥ 70 % del total de coeficientes del conjunto (Ley 675 art. 46), o del total de
 *   unidades si la ponderación es por unidad. Se mide contra el total, no contra los presentes.
 * - UNANIME: la opción ganadora recibe el 100 % de la base (todos los presentes/votantes) sin votos
 *   por otras opciones.
 */
export function calcularResultado(input: ResultadoInput): ResultadoVotacion {
  const votos = unicasPorUnidad(input.votos);
  const peso = (v: PesoUnidad) => pesoVoto(input.ponderacion, v.coeficiente);
  const pesoEmitido = round6(votos.reduce((a, v) => a + peso(v), 0));
  const coefVotante = round6(votos.reduce((a, v) => a + v.coeficiente, 0));
  const totalPeso = input.ponderacion === "UNIDAD" ? input.totalUnidades : input.totalCoeficientes;

  let baseDesc: string;
  let basePeso: number;
  let umbral: number;
  let regla: string;
  if (input.tipoMayoria === "CALIFICADA_70") {
    basePeso = totalPeso;
    umbral = round6(basePeso * 0.7);
    baseDesc = input.ponderacion === "UNIDAD" ? "total de unidades del conjunto" : "total de coeficientes del conjunto";
    regla = "≥ 70 % del total (Ley 675, art. 46)";
  } else {
    const presentePeso = input.presentes ? (input.ponderacion === "UNIDAD" ? input.presentes.unidades : input.presentes.coeficiente) : undefined;
    // Si la asistencia registrada es menor que lo votado (p. ej. salidas), se toma lo votado.
    basePeso = round6(Math.max(presentePeso ?? 0, pesoEmitido));
    baseDesc = presentePeso !== undefined ? "coeficientes representados en la sesión" : "votos emitidos";
    if (input.ponderacion === "UNIDAD") baseDesc = presentePeso !== undefined ? "unidades representadas en la sesión" : "unidades que votaron";
    if (input.tipoMayoria === "UNANIME") {
      umbral = basePeso;
      regla = "100 % de la base, sin votos en contra";
    } else {
      umbral = round6(basePeso / 2);
      regla = "más de la mitad de la base (Ley 675, art. 45)";
    }
  }

  const opciones: ResultadoOpcion[] = input.opciones.map((o) => {
    const vs = votos.filter((v) => v.opcionId === o.id);
    const coeficiente = round6(vs.reduce((a, v) => a + v.coeficiente, 0));
    const p = round6(vs.reduce((a, v) => a + peso(v), 0));
    return {
      id: o.id,
      texto: o.texto,
      votos: vs.length,
      coeficiente,
      peso: p,
      pctCoeficiente: pctOf(coeficiente, input.totalCoeficientes),
      pctParticipacion: pctOf(p, pesoEmitido),
      pctBase: pctOf(p, basePeso),
    };
  });

  const ordenadas = [...opciones].sort((a, b) => b.peso - a.peso);
  const top = ordenadas[0];
  const empate = !!top && top.peso > 0 && ordenadas.length > 1 && Math.abs(ordenadas[1].peso - top.peso) < EPS;
  const ganadora = top && top.peso > 0 && !empate ? { id: top.id, texto: top.texto } : null;

  let aprobada = false;
  if (ganadora && top) {
    if (input.tipoMayoria === "SIMPLE") aprobada = top.peso > umbral + EPS;
    else if (input.tipoMayoria === "CALIFICADA_70") aprobada = top.peso + EPS >= umbral;
    else aprobada = basePeso > 0 && Math.abs(top.peso - basePeso) < EPS && votos.every((v) => v.opcionId === top.id);
  }

  const decision = !votos.length
    ? "Sin votos emitidos"
    : empate
      ? "Empate: no se alcanzó la mayoría"
      : aprobada && ganadora
        ? `Decisión: «${ganadora.texto}» con la mayoría exigida`
        : ganadora
          ? `«${ganadora.texto}» obtuvo más votos, pero no alcanzó la mayoría exigida`
          : "Sin decisión";

  return {
    opciones,
    totalVotos: votos.length,
    coeficienteVotante: coefVotante,
    participacionCoeficiente: pctOf(coefVotante, input.totalCoeficientes),
    participacionUnidades: pctOf(votos.length, input.totalUnidades),
    pesoEmitido,
    base: { descripcion: baseDesc, peso: basePeso, umbral, regla },
    ganadora,
    empate,
    aprobada,
    decision,
    tipoMayoria: input.tipoMayoria,
    ponderacion: input.ponderacion,
  };
}

// ───────────────────────────── COMPROBANTE DE VOTO ─────────────────────────────

/** Nonce aleatorio para el comprobante (no se guarda: el hash no permite reconstruir el voto). */
export function nuevoNonce() {
  return crypto.randomBytes(16).toString("hex");
}

/** Comprobante de voto: sha256(votacionId + unidadId + nonce) en hexadecimal (64 caracteres). */
export function comprobanteHash(votacionId: string, unidadId: string, nonce: string) {
  return crypto.createHash("sha256").update(`${votacionId}:${unidadId}:${nonce}`).digest("hex");
}

export function esComprobanteValido(hash: string) {
  return /^[a-f0-9]{64}$/.test(hash);
}

/** Código corto legible para actas (sin caracteres ambiguos): p. ej. "ACT-7KQ2-M9XD". */
export function codigoVerificacion(prefijo: string, bytes = crypto.randomBytes(8)) {
  const alfabeto = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let s = "";
  for (let i = 0; i < 8; i++) s += alfabeto[bytes[i] % alfabeto.length];
  return `${prefijo}-${s.slice(0, 4)}-${s.slice(4)}`;
}

// ───────────────────────────── ANTELACIÓN DE CONVOCATORIA ─────────────────────────────

export type AntelacionResultado = { ok: boolean; bloquea: boolean; dias: number; minimo: number; mensaje: string };

const DIA = 86_400_000;
/** Día calendario en Bogotá (UTC−5, sin horario de verano) como número entero. */
const diaBogota = (d: Date) => Math.floor((d.getTime() - 5 * 3_600_000) / DIA);

/**
 * Ley 675 art. 39: la convocatoria a asamblea ORDINARIA se hace con antelación no inferior a 15 días
 * calendario. Se cuentan días calendario entre la fecha de envío y la fecha de la reunión (en hora de
 * Bogotá). Para ORDINARIA el incumplimiento bloquea el envío; para EXTRAORDINARIA la ley no fija un
 * mínimo (lo define el reglamento): solo se advierte si es inferior al mínimo recomendado.
 */
export function validarAntelacion(input: { tipo: "ORDINARIA" | "EXTRAORDINARIA"; fechaAsamblea: Date; fechaEnvio: Date; minimoDias?: number }): AntelacionResultado {
  const minimo = input.minimoDias ?? 15;
  const dias = diaBogota(input.fechaAsamblea) - diaBogota(input.fechaEnvio);
  if (dias < 0 || input.fechaAsamblea.getTime() <= input.fechaEnvio.getTime()) {
    return { ok: false, bloquea: true, dias, minimo, mensaje: "La fecha de la asamblea ya pasó: no se puede convocar." };
  }
  if (dias >= minimo) {
    return { ok: true, bloquea: false, dias, minimo, mensaje: `Antelación de ${dias} días calendario: cumple el mínimo de ${minimo} días.` };
  }
  if (input.tipo === "ORDINARIA") {
    return {
      ok: false,
      bloquea: true,
      dias,
      minimo,
      mensaje: `La asamblea ordinaria debe convocarse con al menos ${minimo} días calendario de antelación (Ley 675, art. 39). Faltan ${minimo - dias} día(s): cambia la fecha de la reunión.`,
    };
  }
  return {
    ok: true,
    bloquea: false,
    dias,
    minimo,
    mensaje: `Atención: la convocatoria tiene ${dias} día(s) de antelación. Verifica el plazo que exige el reglamento para asambleas extraordinarias.`,
  };
}

// ───────────────────────────── COMPROMISOS ─────────────────────────────

export type EstadoCompromiso = "PENDIENTE" | "EN_CURSO" | "CUMPLIDO";
export type Compromiso = { id: string; tarea: string; responsable: string; fecha: string | null; estado: EstadoCompromiso };

/** Normaliza el JSON de compromisos guardado en `Asamblea.compromisos`. */
export function parseCompromisos(raw: unknown): Compromiso[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c, i) => ({
      id: String(c.id ?? `c${i + 1}`),
      tarea: String(c.tarea ?? ""),
      responsable: String(c.responsable ?? ""),
      fecha: c.fecha ? String(c.fecha) : null,
      estado: (["PENDIENTE", "EN_CURSO", "CUMPLIDO"].includes(String(c.estado)) ? c.estado : "PENDIENTE") as EstadoCompromiso,
    }))
    .filter((c) => c.tarea);
}

export type PuntoOrden = { orden: number; titulo: string; descripcion?: string | null; votacionId?: string | null };

/** Normaliza el JSON del orden del día guardado en `Asamblea.ordenDelDia`. */
export function parseOrdenDelDia(raw: unknown): PuntoOrden[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object" && !!p.titulo)
    .map((p, i) => ({
      orden: Number(p.orden ?? i + 1),
      titulo: String(p.titulo),
      descripcion: p.descripcion ? String(p.descripcion) : null,
      votacionId: p.votacionId ? String(p.votacionId) : null,
    }))
    .sort((a, b) => a.orden - b.orden);
}

/** Opciones de una votación desde el JSON `Votacion.opciones`. */
export function parseOpciones(raw: unknown): OpcionVotacion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o): o is Record<string, unknown> => !!o && typeof o === "object")
    .map((o, i) => ({ id: String(o.id ?? `o${i + 1}`), texto: String(o.texto ?? "") }))
    .filter((o) => o.texto);
}
