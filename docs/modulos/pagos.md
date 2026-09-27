# Pagos en línea, cuenta del residente y campañas de cobro (Fase 4)

## Qué hace

- **Mi cuenta** (`/cuenta`): el propietario (o quien él autorice con `puedeVerCuenta`) ve el saldo de cada unidad con el botón **Pagar** de un toque, las cuotas pendientes con el descuento de pronto pago vigente, el historial de pagos con recibo PDF, los movimientos, el estado de cuenta PDF y el **paz y salvo** (si está al día se emite y descarga; si no, muestra el saldo y el botón Pagar).
- **Pagar** (`/cuenta/pagar`): elige cuotas (checkboxes con totales), paga todo o abona un valor (si `pagos.permitirAbonos`), elige el medio (PSE, tarjeta, Nequi, Bancolombia) y va al checkout. Máximo 3 toques desde el Inicio.
- **Link público** (`/pagar/<token>`): sin iniciar sesión, desde el correo de cobro. Muestra la unidad, el saldo y el botón Pagar.
- **Campañas "Cobro de administración"** (`/cartera/campanas-cobro`): correo a los propietarios de cada unidad con saldo con el estado de cuenta PDF adjunto y su link de pago único; métricas de envío, apertura, clic y recaudo.
- **Webhooks** de Wompi, Mercado Pago y el simulador: verifican la firma, aprueban el pago, lo aplican a la cartera (`aplicarPago` → evento `pago.aprobado`) y notifican (push + correo con el recibo).

## Contrato con otros módulos

| Qué | Cómo |
|---|---|
| Enlazar un cobro | `/cuenta/pagar?cuotas=<id1,id2>&unidad=<id>` (si falta `unidad` se toma de la primera cuota). Opcionales: `origen=reservas`, `volver=/reservas/123`. |
| Iniciar un pago desde código | `iniciarPagoEnLinea(ctx, { unidadId, cuotaIds?, valor?, medio?, origen?, returnPath? })` → `{ pagoId, referencia, url, valor, pasarela, reutilizado }` (`lib/pagos/service.ts`) |
| Reaccionar al pago | `on("pago.aprobado", …)`: `{ pagoId, unidadId, valor, reservaId, cuotaIds, numeroRecibo }` (lo emite `aplicarPago` de Cartera) |
| Widget del Inicio | `resumenPagoResidente(ctx)` → `ResumenPagoResidente` (`lib/pagos/inicio.ts`) |
| Link de pago para un correo | `crearLinkPago(conjuntoId, unidadId, dias)` → `{ token, url }` (`lib/pagos/publico.ts`) |
| Campaña de cobro | `crearCampanaCobro(ctx, { asunto?, plantilla?, programadaPara?, montoMinimo?, unidadIds? })` (`lib/pagos/campana.ts`) |

## Flujo y seguridad

1. `iniciarPagoEnLinea` valida que el usuario pueda pagar la unidad (`pagos.pagar` y unidad propia, o vínculo con `puedeVerCuenta`), calcula el valor (cuotas elegidas con su descuento de pronto pago, saldo total o abono) y crea el `Pago` **PENDIENTE** con `registrarPago` (referencia única `P…`, `cuotasSeleccionadas`, pasarela). Si en los últimos 30 min hay un pago PENDIENTE idéntico (mismo pagador, unidad, valor y cuotas) se **reutiliza la referencia** (reintento idempotente).
2. El pagador va al checkout. **La redirección de retorno no cambia nada**: la página `/cuenta/pagos/<referencia>` consulta el estado (y si sigue pendiente más de 1 min pregunta a la pasarela por API) y se refresca cada 3 s mientras está PENDIENTE.
3. El webhook verifica la firma con las credenciales **del conjunto dueño del pago**, comprueba que la pasarela del evento sea la del pago y que el **monto coincida**; hace la transición `PENDIENTE → APROBADO` con un `updateMany` condicionado (solo un proceso gana) y llama a `aplicarPago` (idempotente). Eventos repetidos responden `DUPLICADO` sin tocar la cartera.
4. Rechazado → `RECHAZADO` y aviso al pagador con el botón "Intentar de nuevo".
5. Jobs: conciliación cada hora de pendientes con más de 10 min (consulta a la pasarela); los pendientes con más de 24 h pasan a `ANULADO` (si luego llega la aprobación, el pago se aprueba igual: el dinero entró).

Todos los webhooks y endpoints públicos tienen rate limit por IP (`lib/rate-limit.ts`). Todo cambio de estado queda en auditoría.

## Pasarelas

La pasarela se elige en *Configuración → Parámetros* (`config.pagos.pasarela`: `WOMPI`, `MERCADOPAGO` o `SIMULADOR`) y las llaves en *Configuración → Integraciones* (cifradas con `APP_ENCRYPTION_KEY`; tienen prioridad sobre las variables `.env`). Si la pasarela elegida no tiene credenciales se usa el simulador (solo con `PAYMENTS_SIMULATOR=true`) o, si está apagado, cualquier pasarela real configurada.

### Wompi (por defecto en producción)

1. En el panel de comercio de Wompi (sandbox o producción) copia: llave pública (`pub_…`), llave privada (`prv_…`), **secreto de eventos** y **secreto de integridad**.
2. Pégalas en *Configuración → Integraciones → Wompi*, con ambiente `sandbox` o `production`.
3. En Wompi → *Desarrolladores → Eventos*, registra la URL de eventos: `https://<tu-dominio>/api/webhooks/wompi`.
4. Checkout: `https://checkout.wompi.co/p/?public-key=…&currency=COP&amount-in-cents=<valor×100>&reference=<ref>&signature:integrity=<sha256(ref+centavos+COP+secretoIntegridad)>&redirect-url=…`
5. Evento `transaction.updated`: se valida `signature.checksum = sha256(valores de signature.properties tomados de data + timestamp + secretoEventos)` (y el encabezado `X-Event-Checksum` si viene). Consulta: `GET https://{sandbox|production}.wompi.co/v1/transactions?reference=<ref>` con la llave privada.

### Mercado Pago

1. En *Tus integraciones* crea la aplicación (Checkout Pro) y copia el **Access token** (`APP_USR-…`, o `TEST-…` para pruebas) y la public key.
2. En *Webhooks* activa el evento **Pagos**, registra `https://<tu-dominio>/api/webhooks/mercadopago` y copia la **clave secreta**.
3. Guárdalas en *Configuración → Integraciones → Mercado Pago*.
4. La preferencia (`POST /checkout/preferences`) envía `notification_url=/api/webhooks/mercadopago?c=<conjuntoId>` y `external_reference=<ref>`. El webhook valida `x-signature` (`ts=…,v1=…`) = HMAC-SHA256 de `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` con la clave secreta y luego **consulta el pago por API** (`GET /v1/payments/<id>`); no confía en el cuerpo.

### Simulador (demo y pruebas)

Con `PAYMENTS_SIMULATOR=true` y la pasarela en `SIMULADOR` (valor por defecto) el checkout es `/pagar/simulador/<ref>?t=<token>`: imita PSE / tarjeta / Nequi / Bancolombia y tiene botones **Aprobar** y **Rechazar**. Estos llaman a `/api/pagos/simulador`, que envía a `/api/webhooks/simulador` un webhook **firmado** (`x-simulador-firma: t=<ts>,v1=HMAC(APP_ENCRYPTION_KEY, "<ts>.<cuerpo>")`, tolerancia de 5 min), así que el flujo es el mismo que con una pasarela real. **Nunca actives el simulador en producción**: permite aprobar pagos sin dinero.

### Convenio bancario

`ConvenioBancarioProvider` es un stub documentado: el recaudo llega por **conciliación del extracto** (Cartera → Conciliación) con la referencia de pago de 14 dígitos de cada cuota.

## Campaña de cobro

- Plantilla con `{{nombre}}`, `{{unidad}}`, `{{saldo}}`, `{{vencido}}`, `{{link_pago}}`, `{{conjunto}}`, `{{mes}}` (obligatorio `{{link_pago}}`).
- Destinatarios: propietarios y copropietarios con cuenta y el correo de la persona principal. Un link `/pagar/<token>` por unidad (token `PAGO_PUBLICO` válido 35 días) y el PDF del estado de cuenta (Cartera) adjunto.
- **Ley 2300 de 2023**: fuera del horario permitido (L–V 7–19, sáb. 8–15, sin domingos ni festivos) la campaña queda programada para el siguiente horario permitido. A las unidades en mora se les aplica el máximo de contactos por semana por correo (`puedeContactar`) y se registra la gestión de cobro.
- Métricas: `enviados`/`rebotes` (cola de correo), `aperturas` (pixel `/api/track/open/<id>`), `clics` (`/api/track/click/<id>?u=`; solo redirige a URLs de la app o presentes en el correo) y pagos desde el link.
- Automática: job diario 9:00 que el día de generación del conjunto (`cartera.diaGeneracion`) genera las cuotas si faltan y envía la campaña del mes (una vez por periodo).

## Jobs (`jobs/pagos.ts`)

| Job | Cron | Qué hace |
|---|---|---|
| `pagos-campana-cobro` | `0 9 * * *` | Campaña mensual automática tras generar cuotas |
| `pagos-campanas-programadas` | `*/5 * * * *` | Envía las campañas programadas |
| `pagos-conciliar-pendientes` | `15 * * * *` | Consulta a la pasarela los pendientes y anula los de más de 24 h |

## API REST

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/v1/pagos` | Inicia un pago en línea (sesión del residente). Body `{ unidadId, cuotaIds?, valor?, medio?, origen?, returnPath? }` → `{ pagoId, referencia, url, valor, pasarela, reutilizado }` |
| `GET` | `/api/v1/pagos?unidadId=` | Pagos de una unidad (propia/autorizada o `pagos.ver_todos`) |
| `GET` | `/api/v1/pagos/:referencia` | Estado de un pago (consulta a la pasarela si sigue pendiente) |
| `POST` | `/api/webhooks/wompi` · `/api/webhooks/mercadopago?c=` · `/api/webhooks/simulador` | Webhooks de pasarelas (públicos, con firma) |
| `GET` | `/api/track/open/:trackingId` · `/api/track/click/:trackingId?u=` | Seguimiento de correos |

Descargas con sesión: `/cuenta/estado-cuenta?unidad=`, `/cuenta/pagos/<ref>/recibo`, `/cuenta/paz-y-salvo/<id>`.
Exportaciones: `/api/export/pagos-en-linea` (`pagos.ver_todos`) y `/api/export/campanas-cobro` (`cartera.gestionar_cobro`).

## Pruebas

- `tests/unit/pagos.test.ts`: firma de integridad de Wompi (ejemplo oficial), checksum de eventos, `x-signature` de Mercado Pago, webhook del simulador, cálculo del valor a pagar.
- `tests/integration/pagos.test.ts`: flujo completo con el simulador (iniciar → webhook firmado → cuota pagada, saldo 0), webhook repetido, firma inválida, monto distinto, pasarela distinta, rechazo, acceso ajeno, link público, campaña con apertura y clic.
- `tests/e2e/pagar.spec.ts` (Playwright 390×844): propietario → Pagar → simulador Aprobar → pago aprobado.
