# Zonas comunes y reservas (Fase 5)

Calendario por zona, reservas con cobro (IVA y depósito), aprobación, cancelación con política de reembolso,
check-in/check-out con acta, no-show, calificación, bloqueos y reglas extra. La administración de las zonas
(horario, tarifa, IVA, factura, duración, anticipación, capacidad…) vive en **Conjunto → Zonas comunes**.

## Rutas

| Ruta | Quién | Qué |
|---|---|---|
| `/reservas` | residente | Grilla de zonas reservables (foto, tarifa o "Incluida en la cuota") y próximas reservas |
| `/reservas/[zonaId]` | todos | Calendario móvil con vistas **día / semana / mes**: franjas libres, propias ("Tu reserva"), ajenas solo "Ocupado", bloqueos y festivos. Tocar una franja → hoja de confirmación (duración, unidad, asistentes, reglas, base + IVA + depósito) → confirmar. Si hay cobro: **Pagar ahora** → `/cuenta/pagar?cuotas=…&unidad=…&origen=reservas&volver=/reservas/detalle/<id>` |
| `/reservas/mis` | residente | Próximas e historial; calificar |
| `/reservas/detalle/[id]` | propietario de la reserva / gestión | Estado, pago, factura (PDF/XML), acta, cancelar, aprobar/rechazar, check-in/out, no-show |
| `/reservas/admin` | `reservas.ver_todos` | Indicadores, bandeja por aprobar, listado con filtros y exportación (Excel/PDF) |
| `/reservas/admin/bloqueos` | `reservas.bloquear` | Bloqueos (mantenimiento, evento, festivo), festivos de Colombia del año, reglas extra |
| `/reservas/checkin` | `reservas.checkin` (portería) | Reservas del día con botones grandes de check-in / check-out / no llegó y acta con fotos por cámara |
| `/api/reservas/[id]/acta` | — | PDF del acta de entrega y recepción |

Toques para reservar: zona (1) → franja (2) → confirmar (3).

## Reglas (lib/reservas/reglas.ts — puras, probadas)

- **Traslapes**: `haySolape(a, b)` = `a.inicio < b.fin && b.inicio < a.fin` (reservas contiguas se permiten). Ocupan el calendario las reservas `SOLICITADA`, `APROBADA` y `CUMPLIDA`. La creación valida y guarda dentro de una transacción con `pg_advisory_xact_lock` por zona (sin carreras).
- **Horario** por día (`ZonaComun.horario`, `"0".."6"`, 0 = domingo; cierre `00:00`/`24:00` = medianoche). Hora de Bogotá fija UTC−5 (Colombia no tiene horario de verano).
- Duración mínima/máxima, anticipación mínima (horas) y máxima (días), capacidad, máximo de reservas por unidad por mes (cuentan `SOLICITADA/APROBADA/CUMPLIDA/NO_SHOW`).
- **Reglas extra** (`ReglaReserva`): `SOLO_FINES_SEMANA` (sábados, domingos **y festivos**), `UN_TURNO_POR_DIA`, `DIAS_PERMITIDOS {dias:[0..6]}`, `MAX_ASISTENTES {max}`.
- **Bloqueos** (`BloqueoZona`): impiden reservar; al crear uno con reservas activas se exige marcar "cancelar afectadas" (se cancelan con reembolso total).
- **Festivos de Colombia** (Ley 51 de 1983): `festivosColombia(año)` con Pascua (computus) y traslado al lunes.
- **Bloqueo por mora**: si `zona.bloqueoPorMora` y `conjuntoConfig.bloqueoMora.reservas`, se usa `unidadAlDia` de cartera.

## Cobro, estados y pago

- Tarifa **por reserva (turno)**. `valoresReserva`: base = tarifa, IVA = `calcularIva(base, tarifaIva)` si `gravaIva`, depósito aparte.
- Con cobro se crean cuotas con `crearCargo`: alquiler (`ALQUILER_ZONA`, `origen RESERVA`, con IVA) y depósito (`OTRO`, enlazado con `cuotaOrigenId` = cuota del alquiler). `Reserva.cuotaId` = cuota principal. Vencen en la fecha de la reserva.
- Estado inicial: `APROBADA` si es gratis y no requiere aprobación; `SOLICITADA` en otro caso.
- `pago.aprobado` (`lib/reservas/eventos.ts`): si todas las cuotas de la reserva quedaron `PAGADA` → `pagada = true`, `pagoId`, pasa a `APROBADA` (salvo aprobación pendiente), notifica y, si `zona.generaFactura`, **encola** la factura electrónica.
- Aprobación de una reserva sin pagar la deja "aprobada, pendiente de pago" (`aprobadaPorId` con estado `SOLICITADA`).
- Job `reservas-cierre` (cada hora): `SOLICITADA` cuyo inicio pasó → `CANCELADA` (anula cobros); `APROBADA` terminada hace 2 h → `CUMPLIDA` (con check-in, o zonas sin cobro ni depósito) o `NO_SHOW`.

## Cancelación y reembolso

`politicaCancelacion`: si está pagada y se cancela con ≥ `horasCancelacionReembolso` horas (o la cancela la administración) → **reembolso** del alquiler y del depósito: nota crédito electrónica si la factura estaba validada (o anulación de la factura pendiente) + registro en auditoría (`reembolso_reserva`) + aviso a tesorería para la devolución. Si no → **retención** del alquiler; el depósito sí se devuelve. Cobros sin pagar se anulan con `anularCargo`.

## Acta, daños y calificación

Check-in (desde 2 h antes) y check-out guardan `actaEntrega`/`actaRecepcion` (checklist por categoría, observaciones, fotos, quién y cuándo). Daños en el check-out crean un **Ticket `DANO_ZONA_COMUN`** (radicado con el consecutivo `RADICADO`) y opcionalmente una **Multa `PROPUESTA`** (infracción ZON-01) para el debido proceso. El residente califica (1–5) cuando la reserva queda `CUMPLIDA`.

## Jobs (jobs/reservas.ts)

| Job | Cron | Qué hace |
|---|---|---|
| `reservas-recordatorios` | `0 * * * *` | Recordatorio 24 h antes (push + correo) |
| `reservas-cierre` | `15 * * * *` | Cumplidas / no-show / solicitudes vencidas |
| `facturacion-pendiente` | `*/5 * * * *` | Emite facturas pendientes (ver facturacion.md) |

## API REST

- `GET /api/v1/zonas/:id/disponibilidad?desde=AAAA-MM-DD&hasta=AAAA-MM-DD` — días con horario, festivo, bloqueos y ocupados (ajenas solo `{inicio, fin, propia:false}`; máx. 62 días).
- `GET /api/v1/reservas?zona=&estado=&desde=&hasta=&q=&limite=` — propias (o todas con `reservas.ver_todos`).
- `POST /api/v1/reservas` — `{ zonaId, unidadId?, inicio, fin, asistentes, motivo? }` → `{ id, estado, cuotaIds, requierePago, enlacePago, valores }`.
- `GET /api/v1/reservas/:id` · `PATCH /api/v1/reservas/:id` — `{ accion: cancelar | aprobar | rechazar | checkin | checkout | no_show | calificar, … }`.

## Inicio (lib/reservas/inicio.ts)

- `resumenResidente(ctx)` → `{ proximas: ReservaWidget[], pendientesPago, enlace }`
- `resumenAdmin(ctx)` → `{ hoy: ReservaWidget[], pendientesAprobacion, ingresosMes: { base, iva, total, reservas }, enlace }`

## Exportación

`/api/export/reservas` (filtros de la lista). Eventos emitidos: `reserva.creada`, `reserva.aprobada`, `reserva.cancelada`, `reserva.rechazada`, `porteria.reserva_checkin`, `ticket.creado`.

## Permisos

`reservas.ver` (propias; ajenas solo "Ocupado"), `reservas.crear`, `reservas.ver_todos`, `reservas.aprobar`, `reservas.cancelar_todas`, `reservas.checkin`, `reservas.bloquear`. Todo se verifica en el servidor.
