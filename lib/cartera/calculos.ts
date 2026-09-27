/**
 * Cálculos financieros puros (sin BD) — probados en tests/unit/cartera.test.ts.
 * Valores en pesos (COP); se redondea al peso.
 */

export const round = (n: number) => Math.round(n);

/** Cuota de administración de una unidad: por coeficiente (presupuesto × coef %) o valor fijo. */
export function cuotaAdministracion(opts: { modo: "COEFICIENTE" | "VALOR_FIJO"; presupuestoMensual: number; coeficiente: number; valorFijo: number }) {
  if (opts.modo === "COEFICIENTE" && opts.presupuestoMensual > 0) return Math.round((opts.presupuestoMensual * opts.coeficiente) / 100 / 100) * 100;
  return round(opts.valorFijo);
}

/** Distribuye un valor total por coeficiente (cuotas extraordinarias) cuadrando el redondeo en la última unidad. */
export function distribuirPorCoeficiente(total: number, unidades: { id: string; coeficiente: number }[]) {
  const sumaCoef = unidades.reduce((a, u) => a + u.coeficiente, 0) || 1;
  const out = unidades.map((u) => ({ id: u.id, valor: round((total * u.coeficiente) / sumaCoef) }));
  const diff = round(total - out.reduce((a, o) => a + o.valor, 0));
  if (out.length) out[out.length - 1].valor += diff;
  return out;
}

export function distribuirIgual(total: number, ids: string[]) {
  const base = Math.floor(total / ids.length);
  const out = ids.map((id) => ({ id, valor: base }));
  if (out.length) out[out.length - 1].valor += round(total - base * ids.length);
  return out;
}

/** Divide un valor en N cuotas iguales (la última absorbe el redondeo). */
export function fraccionar(total: number, n: number) {
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? round(total - base * (n - 1)) : base));
}

/**
 * Descuento por pronto pago: aplica si el pago cubre la cuota y ocurre hasta la fecha límite.
 * Solo sobre el valor base (no sobre intereses ni otros conceptos).
 */
export function descuentoProntoPago(c: { valorBase: number; porcentajeProntoPago: number; fechaProntoPago: Date | null; yaTieneDescuento?: boolean }, fechaPago: Date) {
  if (!c.fechaProntoPago || c.porcentajeProntoPago <= 0 || c.yaTieneDescuento) return 0;
  if (fechaPago.getTime() > c.fechaProntoPago.getTime()) return 0;
  return round((c.valorBase * c.porcentajeProntoPago) / 100);
}

/**
 * Interés de mora simple sobre el capital vencido (sin capitalizar intereses — prohibido el anatocismo).
 * tasaMensualPct: tasa mensual en % (p. ej. 1.833). Base de 30 días por mes.
 */
export function interesMora(capital: number, tasaMensualPct: number, dias: number) {
  if (capital <= 0 || dias <= 0 || tasaMensualPct <= 0) return 0;
  return round((capital * (tasaMensualPct / 100) * dias) / 30);
}

/** Tasa mensual equivalente a una efectiva anual. */
export function tasaMensualDesdeEA(eaPct: number) {
  return (Math.pow(1 + eaPct / 100, 1 / 12) - 1) * 100;
}

/** Tasa de usura / máxima de mora: 1,5 × interés bancario corriente (E.A.). */
export function tasaMaximaMora(ibcEA: number) {
  return ibcEA * 1.5;
}

export type CuotaAplicable = {
  id: string;
  saldo: number;
  tipoConcepto: string;
  fechaVencimiento: Date;
  periodo: string;
};

export type OrdenAplicacion = "INTERES_MORA" | "MULTA" | "ANTIGUAS" | "ACTUALES";

/**
 * Orden de aplicación de pagos (Ley 675 art. 30 y práctica contable): por defecto intereses → cuotas
 * más antiguas (vencidas) → actuales. Configurable por conjunto.
 */
export function ordenarParaAplicacion<T extends CuotaAplicable>(cuotas: T[], orden: OrdenAplicacion[], hoy = new Date()): T[] {
  const rank = (c: T) => {
    const vencida = c.fechaVencimiento.getTime() < hoy.getTime();
    const grupos: Record<OrdenAplicacion, boolean> = {
      INTERES_MORA: c.tipoConcepto === "INTERES_MORA",
      MULTA: c.tipoConcepto === "MULTA",
      ANTIGUAS: vencida,
      ACTUALES: !vencida,
    };
    const idx = orden.findIndex((o) => grupos[o]);
    return idx === -1 ? orden.length : idx;
  };
  return [...cuotas].sort((a, b) => rank(a) - rank(b) || a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime() || a.periodo.localeCompare(b.periodo));
}

/** Reparte un valor entre cuotas ya ordenadas. Devuelve aplicaciones y el excedente (saldo a favor). */
export function distribuirPago(valor: number, cuotasOrdenadas: { id: string; saldo: number }[]) {
  let restante = round(valor);
  const aplicaciones: { cuotaId: string; valor: number }[] = [];
  for (const c of cuotasOrdenadas) {
    if (restante <= 0) break;
    const aplicar = Math.min(restante, round(c.saldo));
    if (aplicar > 0) {
      aplicaciones.push({ cuotaId: c.id, valor: aplicar });
      restante -= aplicar;
    }
  }
  return { aplicaciones, excedente: restante };
}

/** Edad de la mora en días → rango (30/60/90/+120). */
export function rangoMora(diasVencida: number): "AL_DIA" | "1_30" | "31_60" | "61_90" | "91_120" | "MAS_120" {
  if (diasVencida <= 0) return "AL_DIA";
  if (diasVencida <= 30) return "1_30";
  if (diasVencida <= 60) return "31_60";
  if (diasVencida <= 90) return "61_90";
  if (diasVencida <= 120) return "91_120";
  return "MAS_120";
}

export const RANGOS_MORA = ["AL_DIA", "1_30", "31_60", "61_90", "91_120", "MAS_120"] as const;
export const RANGO_LABEL: Record<(typeof RANGOS_MORA)[number], string> = {
  AL_DIA: "Por vencer",
  "1_30": "1–30 días",
  "31_60": "31–60 días",
  "61_90": "61–90 días",
  "91_120": "91–120 días",
  MAS_120: "Más de 120 días",
};

/** IVA sobre una base (tarifa en %). */
export function calcularIva(base: number, tarifaPct: number) {
  return round((base * tarifaPct) / 100);
}

/** Separa un valor con IVA incluido en base + IVA. */
export function desglosarIva(totalConIva: number, tarifaPct: number) {
  const base = round(totalConIva / (1 + tarifaPct / 100));
  return { base, iva: round(totalConIva - base) };
}

// ───────────── Extensiones Fase 3 (cartera de administración) ─────────────

/** Suma meses a un periodo YYYY-MM. */
export function sumarMeses(periodo: string, n: number) {
  const [y, m] = periodo.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** ¿Es un periodo válido YYYY-MM? */
export function periodoValido(p: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(p);
}

const dd = (n: number) => String(Math.min(28, Math.max(1, Math.round(n)))).padStart(2, "0");

/**
 * Fechas de una cuota mensual en hora de Bogotá (UTC−5, sin horario de verano):
 * emisión el día de generación (00:00), vencimiento el día configurado (00:00: la mora corre desde el día siguiente)
 * y pronto pago hasta las 23:59:59 del día límite.
 */
export function fechasPeriodo(periodo: string, cfg: { diaGeneracion: number; diaVencimiento: number; diaProntoPago: number }) {
  const at = (dia: number, hora = "00:00:00") => new Date(`${periodo}-${dd(dia)}T${hora}-05:00`);
  return {
    emision: at(cfg.diaGeneracion),
    vencimiento: at(cfg.diaVencimiento),
    prontoPago: cfg.diaProntoPago > 0 ? at(cfg.diaProntoPago, "23:59:59") : null,
  };
}

/** Fecha (00:00 Bogotá) del día `dia` de un periodo. */
export function fechaDelPeriodo(periodo: string, dia: number) {
  return new Date(`${periodo}-${dd(dia)}T00:00:00-05:00`);
}

export type TramoTasa = { desde: Date; tasaMensual: number };

/**
 * Interés de mora simple entre dos fechas aplicando la tasa vigente en cada tramo (la tasa cambia mes a mes).
 * `tasas` puede venir en cualquier orden; para cada día se usa la última tasa con `desde` <= día.
 * Días completos (base 30). Sin capitalización: `capital` debe excluir intereses (prohibido el anatocismo).
 */
export function interesPorTramos(capital: number, desde: Date, hasta: Date, tasas: TramoTasa[], tasaDefecto = 0) {
  if (capital <= 0 || hasta.getTime() <= desde.getTime()) return 0;
  const ord = [...tasas].sort((a, b) => a.desde.getTime() - b.desde.getTime());
  const DAY = 86_400_000;
  const totalDias = Math.floor((hasta.getTime() - desde.getTime()) / DAY);
  if (totalDias <= 0) return 0;
  let acumulado = 0;
  let i = 0;
  while (i < totalDias) {
    const dia = new Date(desde.getTime() + i * DAY);
    const vig = [...ord].reverse().find((t) => t.desde.getTime() <= dia.getTime());
    const tasa = vig?.tasaMensual ?? tasaDefecto;
    // Siguiente cambio de tasa (para agrupar días con la misma tasa).
    const next = ord.find((t) => t.desde.getTime() > dia.getTime());
    const hastaTramo = next ? Math.min(totalDias, Math.ceil((next.desde.getTime() - desde.getTime()) / DAY)) : totalDias;
    const dias = Math.max(1, hastaTramo - i);
    acumulado += (capital * (tasa / 100) * dias) / 30;
    i += dias;
  }
  return round(acumulado);
}

/** Capital sobre el que se causan intereses: excluye cuotas de interés (sin anatocismo). */
export function capitalParaMora(cuotas: { saldo: number; tipoConcepto: string }[]) {
  return round(cuotas.filter((c) => c.tipoConcepto !== "INTERES_MORA").reduce((a, c) => a + Math.max(0, c.saldo), 0));
}

/** Valida la tasa de mora frente al límite legal (1,5 × IBC). Devuelve el exceso en puntos (0 si es válida). */
export function excesoTasaMora(tasaEA: number, ibcEA: number) {
  const max = tasaMaximaMora(ibcEA);
  return tasaEA > max + 1e-9 ? Number((tasaEA - max).toFixed(4)) : 0;
}

/** Tasa efectiva anual equivalente a una mensual. */
export function tasaEADesdeMensual(mensualPct: number) {
  return (Math.pow(1 + mensualPct / 100, 12) - 1) * 100;
}

/** Plan de cuotas de un acuerdo de pago: N cuotas mensuales el día `diaPago`, empezando en `primerPeriodo`. */
export function planAcuerdo(saldo: number, n: number, primerPeriodo: string, diaPago: number) {
  return fraccionar(round(saldo), n).map((valor, i) => {
    const periodo = sumarMeses(primerPeriodo, i);
    return { numero: i + 1, periodo, valor, vencimiento: fechaDelPeriodo(periodo, diaPago) };
  });
}

// ── Valor en letras (recibos de caja) ──
const UNIDADES = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"];
const DECENAS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const CENTENAS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

function menorMil(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cien";
  const c = Math.floor(n / 100);
  const r = n % 100;
  let s = CENTENAS[c];
  if (r > 0) {
    let t: string;
    if (r < 30) t = UNIDADES[r];
    else {
      const d = Math.floor(r / 10);
      const u = r % 10;
      t = DECENAS[d] + (u ? ` y ${UNIDADES[u]}` : "");
    }
    s = s ? `${s} ${t}` : t;
  }
  return s;
}

/** 1.234.567 → "un millón doscientos treinta y cuatro mil quinientos sesenta y siete pesos m/cte." */
export function valorEnLetras(valor: number) {
  let n = Math.round(Math.abs(valor));
  if (n === 0) return "cero pesos m/cte.";
  const partes: string[] = [];
  const millones = Math.floor(n / 1_000_000);
  n %= 1_000_000;
  const miles = Math.floor(n / 1000);
  const resto = n % 1000;
  if (millones > 0) {
    if (millones === 1) partes.push("un millón");
    else partes.push(`${apocopar(valorMiles(millones))} millones`);
  }
  if (miles > 0) partes.push(miles === 1 ? "mil" : `${apocopar(menorMil(miles))} mil`);
  if (resto > 0) partes.push(menorMil(resto));
  const texto = partes.join(" ").replace(/\s+/g, " ").trim();
  const de = resto === 0 && miles === 0 && millones > 0 ? " de" : "";
  return `${texto}${de} pesos m/cte.`;
}

function valorMiles(n: number) {
  const miles = Math.floor(n / 1000);
  const resto = n % 1000;
  return [miles > 0 ? (miles === 1 ? "mil" : `${apocopar(menorMil(miles))} mil`) : "", menorMil(resto)].filter(Boolean).join(" ");
}

function apocopar(s: string) {
  return s.replace(/veintiuno$/, "veintiún").replace(/uno$/, "un");
}
