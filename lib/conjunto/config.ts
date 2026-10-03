import { z } from "zod";

/** Parámetros del conjunto guardados en `Conjunto.config` (sección 4.9). */
export const configSchema = z.object({
  cartera: z
    .object({
      diaGeneracion: z.number().int().min(1).max(28).default(1),
      diaVencimiento: z.number().int().min(1).max(28).default(10),
      diaProntoPago: z.number().int().min(1).max(28).default(5),
      porcentajeProntoPago: z.number().min(0).max(50).default(5),
      /** Tasa de mora mensual vigente en %. Por defecto la máxima legal aproximada (1,5 × IBC). */
      tasaMoraMensual: z.number().min(0).max(10).default(1.833),
      tasaMoraEA: z.number().min(0).max(100).default(24.36),
      tasaMoraVigenteDesde: z.string().optional(),
      calculoCuota: z.enum(["VALOR_FIJO", "COEFICIENTE"]).default("VALOR_FIJO"),
      presupuestoMensual: z.number().min(0).default(0),
      ordenAplicacion: z.array(z.enum(["INTERES_MORA", "MULTA", "ANTIGUAS", "ACTUALES"])).default(["INTERES_MORA", "ANTIGUAS", "ACTUALES"]),
      diasGraciaMora: z.number().int().min(0).default(0),
    })
    .prefault({}),
  bloqueoMora: z
    .object({
      reservas: z.boolean().default(true),
      pazYSalvo: z.boolean().default(true),
      votacion: z.boolean().default(false),
      montoMinimo: z.number().min(0).default(1000),
    })
    .prefault({}),
  pazYSalvo: z.object({ vigenciaDias: z.number().int().min(1).default(30) }).prefault({}),
  porteria: z
    .object({
      horario: z.string().default("24 horas"),
      maxDiasPaquete: z.number().int().min(1).default(3),
      minutosRespuestaAutorizacion: z.number().int().min(1).default(3),
      alertaHorasPermanencia: z.number().int().min(1).default(8),
      exigirSeguridadSocialContratistas: z.boolean().default(true),
      emergenciaATodos: z.boolean().default(false),
      checklistTurno: z.array(z.string()).default(["Llaves de zonas comunes", "Radios", "Controles de parqueadero", "Libro de minuta", "Linterna"]),
    })
    .prefault({}),
  notificaciones: z
    .object({
      push: z.boolean().default(true),
      email: z.boolean().default(true),
      whatsapp: z.boolean().default(false),
    })
    .prefault({}),
  facturacion: z
    .object({
      proveedor: z.enum(["FACTUS", "ALANUBE", "SIMULADO"]).default("SIMULADO"),
      numberingRangeId: z.number().int().optional(),
      tarifaIvaDefecto: z.number().default(19),
    })
    .prefault({}),
  pagos: z
    .object({
      pasarela: z.enum(["WOMPI", "MERCADOPAGO", "SIMULADOR"]).default("SIMULADOR"),
      permitirAbonos: z.boolean().default(true),
    })
    .prefault({}),
  datos: z
    .object({
      responsable: z.string().default("Administración del conjunto"),
      emailContacto: z.string().default(""),
      politicaVersion: z.string().default("1.0"),
      finalidad: z
        .string()
        .default(
          "Administración de la copropiedad, seguridad y control de acceso, cobro de expensas comunes, comunicaciones con copropietarios y residentes, y atención de emergencias.",
        ),
      politicaTexto: z.string().default(""),
    })
    .prefault({}),
  cobranza: z
    .object({
      maxContactosSemanaCanal: z.number().int().min(1).default(1),
    })
    .prefault({}),
  ia: z.object({ activo: z.boolean().default(false) }).prefault({}),
  objetosPerdidos: z
    .object({
      /** Días que un objeto encontrado puede estar en custodia antes de pedir disposición (donar o cerrar). */
      diasCustodia: z.number().int().min(7).max(365).default(60),
      /** Días tras los que se cierra automáticamente un reporte de pérdida. */
      diasPerdido: z.number().int().min(15).max(365).default(90),
    })
    .prefault({}),
  moduloEmergencia: z.object({ mostrarBotonPanico: z.boolean().default(true) }).prefault({}),
});

export type ConjuntoConfig = z.infer<typeof configSchema>;

export function parseConfig(raw: unknown): ConjuntoConfig {
  const r = configSchema.safeParse(raw ?? {});
  if (r.success) return r.data;
  return configSchema.parse({});
}

/** Configuración efectiva del conjunto del contexto (con valores por defecto). */
export function conjuntoConfig(ctx: { conjunto: { config: unknown } }): ConjuntoConfig {
  return parseConfig(ctx.conjunto.config);
}
