# Cartera (Fase 3) — administración, cobranza y jobs

Vista de administración de la cartera del conjunto. El núcleo (cargos, saldos, aplicación de pagos) está en `lib/cartera/core.ts`; el pago en línea (/cuenta, /pagar) es del módulo Pagos.

## Funcionalidad

| Ruta | Qué hace | Permiso |
|---|---|---|
| `/cartera` | Tablero: recaudo del mes vs. facturado, cartera vencida, % de unidades en mora, proyección a 30 días, facturado vs. recaudado (6 meses), edad de la cartera, top morosos (requiere `secciones.lista_morosos`), cartera por unidad con filtros por torre/edad y exportación | `cartera.ver_todos` |
| `/cartera/unidades/[id]` | Estado de cuenta: saldos, aging 30/60/90/+120, saldos por concepto, cuotas pendientes con referencia de pago, libro auxiliar con saldo acumulado, pagos (recibo/anular), gestiones, acuerdos, paz y salvos. Acciones: registrar pago (aplicar primero a cuotas elegidas), PDF, envío por correo, gestión de cobro (muestra el estado Ley 2300 por canal), acuerdo de pago, paz y salvo, cargo manual y carta de cobro | `cartera.ver_todos` (+ permiso de cada acción) |
| `/cartera/cuotas` | Lista con filtros (vencidas, estado, concepto, periodo, torre), crear cargo y anular con motivo | `cartera.ver_todos`, `cartera.crear`, `cartera.anular` |
| `/cartera/generar` | Previsualización y generación de las cuotas de un periodo (idempotente) | `cartera.generar` |
| `/cartera/extraordinarias` | Cuotas extraordinarias por coeficiente, iguales o manuales, en N fracciones, con asamblea vinculada | `cartera.generar` |
| `/cartera/pagos` | Pagos: registrar (efectivo, transferencia/consignación con comprobante), anular (reversa aplicaciones, descuento de pronto pago y movimientos), recibo de caja PDF | `pagos.ver_todos`, `pagos.registrar`, `pagos.anular` |
| `/cartera/acuerdos`, `/cartera/acuerdos/[id]` | Acuerdos de pago: plan, avance, documento para firma, adjuntar el firmado, cambio de estado | `cartera.acuerdos` |
| `/cartera/gestiones` | Registro de gestiones de cobro (llamada, correo, visita, WhatsApp, carta, SMS) | `cartera.gestionar_cobro` |
| `/cartera/cartas` | Cartas de cobro prejurídico en PDF (plantilla con variables) y registro como gestión | `cartera.gestionar_cobro` |
| `/cartera/paz-y-salvo` | Certificados: emisión automática si la unidad está al día, manual con observaciones, anulación | `paz_y_salvo.*` |
| `/cartera/conciliacion`, `/[id]` | Cuentas bancarias, carga del extracto CSV/Excel, emparejamiento automático, crear pago desde una línea, ignorar, cerrar | `pagos.conciliar` |
| `/cartera/conceptos` | CRUD de conceptos de cobro (cuenta contable, IVA) | `cartera.configurar` |
| `/cartera/tasa-mora` | Historial de tasas, registro mensual (IBC → máximo 1,5 × IBC) y alertas | `cartera.configurar` |
| `/cartera/exportar-contable` | Comprobantes contables para Siigo, World Office, Alegra, Helisa o genérico (Excel/CSV) | `cartera.exportar` o `pagos.exportar` |
| `/verificar/[codigo]` | Pública: verifica paz y salvos, actas de asamblea, actas de votación y documentos. Muestra solo los datos mínimos y limita las consultas por IP | — |

### Reglas clave
- **Generación mensual**: valor por coeficiente (presupuesto × coeficiente, redondeado a la centena) o valor fijo, según `config.cartera.calculoCuota`. Emisión el `diaGeneracion` a las 00:00, vencimiento el `diaVencimiento` a las 00:00 (la mora corre desde el día siguiente) y pronto pago hasta las 23:59:59 del `diaProntoPago`. Es idempotente por unidad + periodo + concepto (no cuenta las anuladas). Al terminar se aplican los saldos a favor.
- **Mora diaria**: interés simple sobre el saldo de las cuotas vencidas que no son de intereses (sin anatocismo), desde `interesCausadoHasta` o desde el vencimiento, con la tasa vigente en cada tramo (historial `TasaMora`). Se acumula en una sola cuota `INTERES_MORA` por unidad y mes, con un movimiento débito por cada liquidación; `Cuota.interes` guarda el interés causado por cada cuota. Respeta `diasGraciaMora`. Si se corre dos veces el mismo día no causa nada.
- **Tasa de mora**: el administrador registra cada mes el IBC certificado. Si la tasa supera 1,5 × IBC se rechaza. El IBC se guarda en `TasaMora.fuente` («… · IBC 16,52 % E.A.»). Hay alertas en el tablero y una notificación los días 1, 5 y 10 si no se actualizó; también se avisa cuando la tasa cambia.
- **Ley 2300 de 2023** (`lib/cartera/cobranza.ts`): contacto de lunes a viernes de 7:00 a 19:00 y los sábados de 8:00 a 15:00 (hora de Bogotá). Nunca domingos ni festivos: incluye la lista 2025–2027 y un cálculo para los demás años. Máximo `cobranza.maxContactosSemanaCanal` contactos por semana calendario (lunes a domingo), por canal y por unidad. Se bloquean y registran las gestiones manuales, las cartas, el envío del estado de cuenta a unidades en mora y los recordatorios automáticos de mora.
- **Acuerdos de pago**: las cuotas vencidas pasan a `EN_ACUERDO` con saldo 0 (traslado por un movimiento crédito) y se generan N cuotas del acuerdo con `crearCargo` y `acuerdoId`, bajo el concepto «Acuerdo de pago». El libro auxiliar queda cuadrado. Si se anula un acuerdo sin pagos, el saldo vuelve a las cuotas originales. El seguimiento diario lo marca como CUMPLIDO o, si una cuota lleva más de 30 días vencida, como INCUMPLIDO.
- **Paz y salvo**: se emite automáticamente solo si `unidadAlDia`; si ya hay uno vigente, se devuelve ese mismo. Código `PYS-XXXX-XXXX`, vigencia `pazYSalvo.vigenciaDias` y PDF con un QR a `APP_URL/verificar/<codigo>`.
- **Conciliación**: el emparejamiento busca, en este orden, (1) la referencia del Pago o la referencia externa en el texto, (2) la referencia de pago de 14 dígitos de una cuota (identifica la unidad y busca un pago del mismo valor ±3 días; si no lo hay, deja la unidad sugerida), y (3) el valor exacto y la fecha ±2 días, cuando hay un único candidato. Marca `Pago.conciliado`.
- **Exportación contable**: causación (débito cartera 13050501 / crédito cuenta del concepto, IVA 24080101), recibos de caja (débito bancos 11100501 o caja 11050501 / crédito cartera; el excedente va a anticipos 28050501) y descuentos por pronto pago (53053501). Las cuentas se pueden editar al exportar. El tercero es el documento del propietario principal (222222222222 si no hay).

## Jobs (`jobs/cartera.ts`)
| Job | Cron (Bogotá) | Descripción |
|---|---|---|
| `cartera-generar-cuotas` | `10 0 * * *` | Genera si el día de hoy es mayor o igual al `diaGeneracion` del conjunto (idempotente; si se perdió el día, recupera) |
| `cartera-intereses-mora` | `0 1 * * *` | Liquidación diaria de intereses |
| `cartera-recordatorios` | `0 8 * * *` | Cuotas por vencer (5 y 1 día antes) y en mora (días 1, 15 y 30) a los propietarios; si el día cae en domingo o festivo se envía el siguiente día hábil. Incluye la alerta de tasa |
| `cartera-seguimiento` | `30 1 * * *` | Estado de los acuerdos y vencimiento de los paz y salvos |

## Funciones para otros módulos (`lib/cartera/service.ts`)
- `generarCuotasMes(ctx, periodo): Promise<{ periodo, creadas, omitidas, total, saldosAplicados }>`
- `estadoCuentaPdf(ctx, unidadId): Promise<Buffer>` y `estadoCuenta(ctx, unidadId, { desde?, hoy? })` en `lib/cartera/estado-cuenta.tsx`
- `solicitarPazYSalvo(ctx, unidadId)` → `{ ok: true, certificado, nuevo } | { ok: false, saldo, mensaje }`; `pazYSalvoPdf(ctx, id): Promise<Buffer>` en `lib/cartera/paz-y-salvo.tsx`
- `reciboPdf(ctx, pagoId)`, `cartasCobroPdf(ctx, unidadIds, plantilla?)`, `acuerdoPdf(ctx, id)` en `lib/cartera/documentos.tsx`
- `puedeContactar(unidadId, canal, fecha?)`, `registrarGestion(ctx, input, fecha?)`, `horarioCobranzaPermitido(fecha)` (pura), `FESTIVOS_CO` en `lib/cartera/cobranza.ts`
- `liquidarInteresesMora(ctx, hoy?)`, `tasaMoraVigente(ctx, fecha?)` en `lib/cartera/mora.ts`
- Widgets de Inicio (`lib/cartera/inicio.ts`): `resumenAdmin(ctx): CarteraAdminWidget | null` y `resumenResidente(ctx): CarteraResidenteWidget | null`

Los PDF cargan `@react-pdf/renderer` de forma diferida (`lib/cartera/pdf-kit.tsx`). Así los módulos de cartera se pueden importar desde el worker y el seed (tsx), donde la importación estática de react-pdf falla.

## API REST
- `GET /api/v1/cartera/cuotas?unidad&estado&periodo&concepto&torre&q&take&skip`: sin `cartera.ver_todos`, solo se puede consultar una unidad propia. `POST` crea un cargo manual (`cartera.crear`).
- `GET /api/v1/cartera/unidades/{id}/saldo`: saldo, aging y cuotas pendientes.
- `GET /api/v1/cartera/pagos?unidad&estado&medio&conciliado&desde&hasta`: `POST` registra un pago manual (`pagos.registrar`).
- `GET /api/v1/cartera/movimientos?unidad&desde`: libro auxiliar.
- PDF (con sesión): `/api/cartera/estado-cuenta/{unidadId}`, `/api/cartera/recibo/{pagoId}`, `/api/cartera/paz-y-salvo/{id}`, `/api/cartera/acuerdo/{id}`, `/api/cartera/carta/{unidadId}` (vista previa), `POST /api/cartera/cartas` (generación masiva y registro) y `/api/cartera/contable`.
- Exportaciones (`/api/export/...`): `cartera`, `cartera-cuotas`, `cartera-pagos`, `cartera-gestiones`, `cartera-movimientos`.

## Seed (`prisma/seed/30-cartera.ts`)
Simula 6 meses con el propio servicio: generación mensual, pagos (la mayoría a tiempo y cerca del 45 % con pronto pago), 10 unidades que pagan tarde con intereses, 14 morosas de 1 a 5 meses, 2 con más de 120 días (con saldo de apertura), liquidación de intereses con el historial de tasas, 2 cuotas extraordinarias (una en 3 fracciones), 2 acuerdos (uno vigente y uno incumplido), gestiones dentro del horario legal, paz y salvos (vigentes, uno vencido y uno manual), 2 cuentas bancarias y una conciliación del mes anterior. T1-101 (Laura) tiene el mes actual pendiente y un saldo pequeño del mes anterior; T3-804 y T2-302 están al día. Es idempotente con `npx tsx scripts/seed-uno.ts 30-cartera`: borra primero solo sus propias filas.

## Decisiones
- La frecuencia de la Ley 2300 se cuenta por semana calendario (lunes a domingo) y el límite de las 19:00 y las 15:00 es inclusivo.
- Enviar el estado de cuenta a una unidad sin mora es informativo: no cuenta como gestión.
- Las cuotas extraordinarias fraccionadas se generan todas al crearlas, con vencimientos mensuales; las fracciones futuras aparecen como «por vencer».
- Las plantillas de las cartas se editan en el momento de generarlas. No se guardan porque el esquema está congelado.
- La proyección de recaudo suma tres partes: lo por vencer en 30 días × la tasa de recaudo de los 3 meses anteriores, el 10 % de la cartera vencida y el 80 % de las cuotas de acuerdos.
