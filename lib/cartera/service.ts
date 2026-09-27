/**
 * Servicio de cartera (Fase 3 — vista de administración). Punto de entrada único del módulo: reexporta el núcleo
 * (core.ts) y las operaciones de administración. Otros módulos importan desde aquí.
 *
 * Funciones públicas principales:
 * - generarCuotasMes(ctx, periodo)            → genera cuotas de administración (idempotente) y cruza saldos a favor.
 * - liquidarInteresesMora(ctx, hoy?)          → causación diaria de intereses (sin anatocismo).
 * - puedeContactar(unidadId, canal, fecha)    → reglas de la Ley 2300 (cobranza.ts).
 * - estadoCuentaPdf(ctx, unidadId)            → PDF del estado de cuenta (estado-cuenta.tsx).
 * - solicitarPazYSalvo(ctx, unidadId) / pazYSalvoPdf(ctx, id) → paz y salvo con QR verificable (paz-y-salvo.tsx).
 */
export * from "./core";
export * from "./generacion";
export * from "./mora";
export * from "./operaciones";
export * from "./acuerdos";
export * from "./conciliacion";
export * from "./tablero";
export { puedeContactar, registrarGestion, horarioCobranzaPermitido, esFestivo, FESTIVOS_CO, canalTexto } from "./cobranza";
export { estadoCuenta, estadoCuentaPdf, enviarEstadoCuenta } from "./estado-cuenta";
export { solicitarPazYSalvo, emitirPazYSalvoManual, anularPazYSalvo, pazYSalvoPdf, urlVerificacion } from "./paz-y-salvo";
export { reciboPdf, cartasCobroPdf, acuerdoPdf, PLANTILLA_CARTA_DEFECTO } from "./documentos";
