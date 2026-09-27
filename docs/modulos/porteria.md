# Portería (Fase 6)

Pantalla de trabajo del portero en modo **kiosco** (tablet o teléfono): botones grandes, alto contraste, tema nocturno y
funcionamiento sin conexión. Especificación: `MICONJUNTO_SPEC.md` §4.5, §5.7, §5.6 (parqueaderos de visitantes) y §6 (1, 2, 3, 10, 12, 13, 14).

## Pantallas (`app/(app)/porteria/**`)

| Ruta | Qué hace |
|---|---|
| `/porteria` | Inicio del portero: acciones grandes (Ingreso visitante, Salida, Recibir/Entregar paquete, Vehículo, Novedad, Emergencia), solicitudes al residente en tiempo real, **Adentro ahora** con tiempo de permanencia y alerta > `porteria.alertaHorasPermanencia` h. |
| `/porteria/ingreso` | Código de 6 dígitos (teclado grande) o **escáner QR** → `?codigo=` / `?token=` muestra la autorización (nombre, unidad, placa, vigencia, usos) → foto opcional → **Registrar ingreso** (≤ 3 toques). Sin autorización: selector de unidad. |
| `/porteria/ingreso/manual` | Domicilios, proveedores, técnicos, contratistas (offline). `?visitanteId=` prellena y advierte lista negra. |
| `/porteria/unidad/[id]` | Ficha mínima de la unidad: autorizaciones vigentes, **frecuentes con ingreso de un toque** (alerta si fuera de horario o vínculo inactivo), **Notificar al residente**, residentes (sin teléfono salvo `campos.persona_telefono`), vehículos, paquetes. |
| `/porteria/salida` | Salida vinculada al ingreso (`ingresoId`), permanencia, cobro de parqueadero; salida libre. |
| `/porteria/vehiculo` | Por placa: vehículo de residente (entra/sale), visitante adentro (salida) o nuevo visitante. |
| `/porteria/bitacora` | Bitácora **inmutable** del turno (por defecto desde la apertura del turno), filtros (tipo, quién, medio, fechas, unidad, texto), exportación Excel/PDF, paginada (`content-visibility` para listas largas), **Anular** (`porteria.anular`). |
| `/porteria/turno` | Apertura/cierre con checklist (`porteria.checklistTurno`), novedades y **firma en pantalla**; minuta del turno; turnos recientes. |
| `/porteria/novedades` (+`/nueva`) | Novedades con severidad y fotos; ALTA/CRÍTICA notifican al administrador; crear ticket (origen NOVEDAD). |
| `/porteria/paquetes` (+`/recibir`, `/entregar`) | Reporte diario, paquetes con más de `maxDiasPaquete` días, recepción con fotos (paquete y guía), entrega **solo a autorizados** con firma o foto, devoluciones. |
| `/porteria/llaves` | Inventario y préstamo/devolución de llaves, controles, tarjetas y radios (`porteria.llaves`). |
| `/porteria/parqueaderos` | Parqueaderos de visitantes: ocupación, tiempo, valor acumulado, salida. |
| `/porteria/obras` | Solo lectura: obras y mudanzas APROBADAS de hoy; ingreso de contratistas con seguridad social vigente. |
| `/porteria/lista-negra` | Órdenes de no ingreso (gestión con `porteria.lista_negra`; el motivo solo lo ve portería/administración). |
| `/porteria/emergencia` | Botón de emergencia con plantillas (`activarAlerta`) y lista de evacuación asistida (`listaEvacuacion`). |

El layout (`app/(app)/porteria/layout.tsx`) añade la barra fija con **buscador universal** (`/api/porteria/buscar`),
escáner QR (`html5-qrcode`, cámara trasera, import dinámico), conmutador de tema nocturno, indicador offline, alertas de
emergencia/pánico en tiempo real (sonido, vibración, botón **Atendida**) y refresco por SSE (`useRealtime(["porteria"])`).

## Reglas de negocio (`lib/porteria/**`)

- **Bitácora inmutable**: `RegistroAcceso` nunca se actualiza ni se borra. Las correcciones crean un registro `ANULACION` con `anulaId`; la UI tacha el original. No se anula una anulación ni dos veces (`validarAnulacion`).
- **Códigos**: 6 dígitos (no empiezan en 0), únicos entre autorizaciones ACTIVAS del conjunto; `qrToken` aleatorio de 32 caracteres. El QR codifica la URL pública `/acceso-visitante/<token>`.
- **Validez** (`evaluarAutorizacion`): estado, vigencia, días/horas de recurrentes (hora de Bogotá) y usos. `usosPermitidos = 0` = ilimitado (recurrentes). Queda `USADA` al agotarse.
- **Contratistas**: si `porteria.exigirSeguridadSocialContratistas`, no hay ingreso sin soporte.
- **Frecuentes** (`VinculoUnidad` EMPLEADO_DOMESTICO, CUIDADOR, VISITANTE_FRECUENTE, FAMILIAR ≥ 12 años, AUTORIZADO_*): ingreso de un toque; fuera de `horarioPermitido {dias, desde, hasta}` o vínculo inactivo exige confirmación y queda anotado.
- **Lista negra**: bloquea ingreso/solicitud/autorización por documento o nombre exacto.
- **Solicitud en tiempo real**: `crearSolicitud` → `notify` con acciones Autorizar/Rechazar y `data.solicitudId` a `usuariosDeUnidad` + evento SSE `unidad:<id>`. La respuesta (`POST /api/porteria/solicitudes/:id/responder`, service worker o banner) emite `porteria.solicitud_respondida`. Pasados `minutosRespuestaAutorizacion` el portero registra la **decisión telefónica** (`DECISION_TELEFONICA`).
- **Parqueadero de visitantes**: se asigna en el ingreso (DISPONIBLE → OCUPADO) y se libera en la salida o anulación. Tarifa: 15 min de gracia, fracción = hora, tope por día (`calcularTarifaParqueadero`). Cobro a la unidad con `crearCargo` (concepto PARQUEADERO, origen MANUAL; la tarifa publicada incluye IVA si el concepto lo grava) o pago del visitante anotado en la bitácora.
- **Offline**: cola en IndexedDB (`lib/porteria/offline.ts`, idb-keyval) para ingresos (manual, código, frecuente), salidas, paquetes y novedades con `clienteId` UUID; se sincroniza al volver la conexión (`online`) y cada 30 s con `POST /api/porteria/sync`. Idempotente porque `clienteId` es `@unique`. Los errores de negocio se descartan y se avisan; los inesperados se reintentan.
- **Turnos**: uno abierto por portero; firma obligatoria (dataURL PNG/JPEG ≤ 400 KB); cierre con faltantes notifica al administrador.
- **Novedades**: ALTA/CRÍTICA → administrador (CRÍTICA también correo/WhatsApp). Ticket: radicado `AAAA-0001` (`nextConsecutivo(conjuntoId,"RADICADO",año)`), `fechaLimite` = +15 días hábiles, origen `NOVEDAD`.

## Eventos

`visitante.ingreso`, `visitante.salida`, `visitante.autorizado`, `paquete.recibido`, `paquete.entregado`, `paquete.devuelto`,
`porteria.solicitud_creada|respondida|resuelta`, `porteria.registro_anulado`, `porteria.novedad`, `porteria.turno_abierto|cerrado`, `ticket.creado`.
Todos los `visitante.*`, `paquete.*`, `porteria.*` y `emergencia.*` llegan al canal SSE `porteria`.

## Jobs (`jobs/porteria.ts`)

| Job | Cron | Qué hace |
|---|---|---|
| `porteria-paquetes-sin-reclamar` | 18:00 diario | Recordatorio a cada unidad con paquetes; aviso a administración de los que superan `maxDiasPaquete`. |
| `porteria-expirar` | cada 15 min | Autorizaciones vencidas → VENCIDA; solicitudes sin respuesta > 60 min → EXPIRADA. |
| `porteria-permanencia` | cada hora | Aviso a portería de visitantes que superaron `alertaHorasPermanencia`. |

## API REST (`/api/v1`, sesión o `Bearer <token>`)

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| POST | `/api/v1/porteria/ingresos` | `porteria.registrar` | Ingreso con `codigo`/`token` (valida la autorización) o manual (`sujeto, nombre, documento, unidadId, placa, parqueaderoId, clienteId, hora`). |
| POST | `/api/v1/porteria/salidas` | `porteria.registrar` | Salida con `ingresoId` (o `nombre`/`placa`), `cobro: UNIDAD|VISITANTE|NINGUNO`. |
| GET | `/api/v1/porteria/bitacora` | `porteria.bitacora`/`porteria.ver` | `tipo, sujeto, desde, hasta (AAAA-MM-DD), unidad, q, take, skip`; cada fila trae `anulado`. |
| GET | `/api/v1/porteria/adentro` | `porteria.ver` | Personas/vehículos adentro con minutos de permanencia. |
| GET | `/api/v1/porteria/autorizaciones/validar` | `porteria.ver` | `?codigo=` o `?token=` → `{ valida, motivo, autorizacion }` sin registrar (cerraduras, lectores). |
| GET/POST | `/api/v1/paquetes` | `paqueteria.ver*` / `paqueteria.recibir` | Lista / recepción (notifica a la unidad). |
| POST | `/api/v1/paquetes/:id/entregar` | `paqueteria.entregar` | `{ personaId, firma? | fotoEntregaUrl? }` solo a autorizados. |

Internas: `GET /api/porteria/buscar?q=`, `POST /api/porteria/sync`, `POST /api/porteria/solicitudes/:id/responder`.

## Inicio (`lib/porteria/inicio.ts`)

`resumenResidente(ctx): ResumenPorteriaResidente` (paquetes en portería, visitantes de hoy, autorizaciones activas, solicitudes pendientes),
`resumenAdmin(ctx): ResumenPorteriaAdmin` (novedades del día y altas, paquetes > N días, ingresos hoy, adentro, alertas de permanencia),
`resumenPortero(ctx): ResumenPortero` (turno abierto, contadores).

## Demo

Seed `prisma/seed/50-porteria.ts` (idempotente: `npx tsx scripts/seed-uno.ts 50-porteria`). Autorización activa de **T1-101** con código **246810** (Carlos Mendoza, placa HJK234).
