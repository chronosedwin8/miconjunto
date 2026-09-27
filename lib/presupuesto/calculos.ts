/**
 * Ejecución presupuestal (funciones puras). Los ingresos ejecutados vienen de cartera (pagos aplicados
 * por concepto) y los gastos ejecutados de los gastos aprobados o pagados.
 */

export type RubroBase = { id: string; tipo: "INGRESO" | "GASTO"; nombre: string; cuentaContable: string | null; valorAnual: number };

export type FilaEjecucion = RubroBase & {
  /** Ejecutado por mes (índice 0 = enero). */
  porMes: number[];
  ejecutado: number;
  /** Lo que debería llevarse a la fecha (proporcional a los meses transcurridos). */
  presupuestadoALaFecha: number;
  pct: number;
  pctALaFecha: number;
  diferencia: number;
  alerta: "SOBREEJECUTADO" | "BAJO" | null;
};

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Calcula la ejecución por rubro. `mesesTranscurridos` (1–12) define el presupuesto a la fecha.
 * Alerta de gasto sobreejecutado (> 100 % a la fecha + 10 puntos) o ingreso bajo (< 90 % a la fecha).
 */
export function ejecucionPresupuestal(rubros: RubroBase[], ejecutado: Map<string, number[]>, mesesTranscurridos: number) {
  const m = Math.min(12, Math.max(1, mesesTranscurridos));
  const filas: FilaEjecucion[] = rubros.map((r) => {
    const porMes = Array.from({ length: 12 }, (_, i) => Math.round(ejecutado.get(r.id)?.[i] ?? 0));
    const total = porMes.reduce((a, b) => a + b, 0);
    const aLaFecha = Math.round((r.valorAnual * m) / 12);
    const pct = r.valorAnual > 0 ? r1((total / r.valorAnual) * 100) : 0;
    const pctALaFecha = aLaFecha > 0 ? r1((total / aLaFecha) * 100) : 0;
    let alerta: FilaEjecucion["alerta"] = null;
    if (r.tipo === "GASTO" && aLaFecha > 0 && pctALaFecha > 110) alerta = "SOBREEJECUTADO";
    if (r.tipo === "INGRESO" && aLaFecha > 0 && pctALaFecha < 90) alerta = "BAJO";
    return { ...r, porMes, ejecutado: total, presupuestadoALaFecha: aLaFecha, pct, pctALaFecha, diferencia: r.valorAnual - total, alerta };
  });
  const totales = (tipo: "INGRESO" | "GASTO") => {
    const f = filas.filter((x) => x.tipo === tipo);
    const presupuestado = f.reduce((a, x) => a + x.valorAnual, 0);
    const ejecutadoT = f.reduce((a, x) => a + x.ejecutado, 0);
    const aLaFecha = f.reduce((a, x) => a + x.presupuestadoALaFecha, 0);
    const porMes = Array.from({ length: 12 }, (_, i) => f.reduce((a, x) => a + x.porMes[i], 0));
    return {
      presupuestado,
      ejecutado: ejecutadoT,
      presupuestadoALaFecha: aLaFecha,
      pct: presupuestado ? r1((ejecutadoT / presupuestado) * 100) : 0,
      pctALaFecha: aLaFecha ? r1((ejecutadoT / aLaFecha) * 100) : 0,
      porMes,
    };
  };
  const ingresos = totales("INGRESO");
  const gastos = totales("GASTO");
  return { filas, ingresos, gastos, superavit: ingresos.ejecutado - gastos.ejecutado, superavitPresupuestado: ingresos.presupuestado - gastos.presupuestado };
}

/** Acumula un valor en la matriz rubro × mes. */
export function acumular(mapa: Map<string, number[]>, rubroId: string, mes: number, valor: number) {
  const arr = mapa.get(rubroId) ?? Array.from({ length: 12 }, () => 0);
  arr[mes] += valor;
  mapa.set(rubroId, arr);
}

/** Relaciona un concepto de cobro con un rubro de ingreso: por cuenta contable exacta y, si no, por nombre. */
export function rubroParaConcepto(
  rubros: { id: string; tipo: string; nombre: string; cuentaContable: string | null }[],
  concepto: { nombre: string; tipo: string; cuentaContable: string | null },
) {
  const ingresos = rubros.filter((r) => r.tipo === "INGRESO");
  if (concepto.cuentaContable) {
    const r = ingresos.find((x) => x.cuentaContable && x.cuentaContable === concepto.cuentaContable);
    if (r) return r.id;
    const pref = ingresos.find((x) => x.cuentaContable && concepto.cuentaContable!.startsWith(x.cuentaContable) && x.cuentaContable.length >= 4);
    if (pref) return pref.id;
  }
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const n = norm(concepto.nombre);
  const r = ingresos.find((x) => n.includes(norm(x.nombre)) || norm(x.nombre).includes(n));
  return r?.id ?? null;
}
