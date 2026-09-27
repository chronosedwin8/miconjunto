# Activos y mantenimiento (Fase 10)

Inventario de activos con etiqueta QR, plan de mantenimiento (preventivo, correctivo y legal), calendario, órdenes de trabajo con checklist y evidencias, vencimientos e indicadores.

## Rutas

| Ruta | Quién | Qué |
|---|---|---|
| `/activos` | `activos.ver` | Inventario con filtros (categoría, estado), resumen y exportación. Botón **Etiquetas QR**. |
| `/activos/nuevo`, `/activos/[id]` | `activos.crear` / `activos.ver` | Ficha: datos, QR, planes, historial (órdenes + tickets), costos del año, fotos y manuales, cambio de estado, nueva orden. |
| `/activos/etiquetas?ids=a,b` | `activos.ver` | PDF A4 con 15 etiquetas por hoja (nombre, categoría, ubicación y QR a `APP_URL/activo/<codigoQr>`). Sin `ids` usa los filtros de la lista (`q`, `categoria`, `estado`). |
| `/activo/[codigo]` | **pública** | Ficha mínima al escanear: conjunto, nombre, ubicación, estado, reportes abiertos y botón **Reportar falla**. |
| `/activo/[codigo]/reportar` | sesión + `tickets.crear` o `mantenimiento.gestionar` | Sin sesión redirige a `/login?next=…`. Formulario de 3 toques (gravedad, qué pasó, fotos) → crea el ticket y muestra el radicado. |
| `/mantenimiento` | `mantenimiento.ver` | Órdenes (abiertas, atrasadas, cerradas, todas). Sin `mantenimiento.ver_todos` solo las asignadas al usuario o a su proveedor. |
| `/mantenimiento/ordenes/[id]` | alcance anterior | Ejecución móvil: **Foto y cerrar orden** (3 toques), iniciar, checklist, fotos antes/después, cierre con notas y costo; editar/asignar y cancelar (`mantenimiento.gestionar`). |
| `/mantenimiento/planes` | `ver_todos`, `gestionar` o `crear` | Plan con alertas legales, crear/editar (`mantenimiento.crear`), **Generar orden ahora**. |
| `/mantenimiento/calendario?mes=AAAA-M` | ídem | Agenda (móvil) / cuadrícula (escritorio): órdenes del mes + proyección de planes por frecuencia. |
| `/mantenimiento/vencimientos?tipo=` | ídem | Garantías, documentos de proveedores, contratos, EPS/ARL y mantenimientos legales vencidos o a 60 días (filtrados por permiso de lectura de cada tipo). |
| `/mantenimiento/indicadores?anio=` | `mantenimiento.ver_todos` | Cumplimiento del plan, costos por activo (preventivo/correctivo), MTBF aproximado y proveedores por desempeño. |

## Reglas

- **Próxima fecha**: al cerrar la orden de un plan, `ultimaEjecucion = cierre` y `proximaFecha = cierre + frecuenciaDias` (fecha de ejecución real).
- **Generación automática** (job `mantenimiento-generar-ordenes`, diario 06:00): planes activos con `proximaFecha − diasAnticipacion ≤ hoy` (día de Bogotá) y **sin orden abierta** (PENDIENTE/PROGRAMADA/EN_PROCESO). Idempotente. La orden hereda activo, zona, proveedor, responsable, checklist y costo estimado; queda PROGRAMADA si tiene responsable o proveedor. Número: `nextConsecutivo(conjuntoId, "ORDEN", 0)`.
- **Cierre** (`cerrarOrden`): COMPLETADA, checklist opcionalmente completo, evidencias (solo URLs del propio conjunto); actualiza el plan; activo EN_MANTENIMIENTO → OPERATIVO; si viene de un ticket agrega `ComentarioTicket` SISTEMA, pasa el ticket a RESUELTO, emite `ticket.actualizado` y avisa al solicitante; si hay costo crea (idempotente) un **Gasto PENDIENTE_APROBACION** en el rubro de mantenimiento (cuenta 5145… o nombre "mantenimiento"). Emite `mantenimiento.orden_cerrada`.
- **Evidencias**: la URL guarda el momento como fragmento `#antes` / `#despues` (el esquema solo tiene `String[]`).
- **Reporte por QR**: Ticket `DANO_ZONA_COMUN`, `origen ACTIVO_QR`, `activoId`, zona y ubicación del activo, radicado `AAAA-0001` (`nextConsecutivo(conjuntoId, "RADICADO", año)`), fecha límite por prioridad (urgente 1 día, alta 3, media 7, baja 15). Emite `ticket.creado` y notifica a `mantenimiento.gestionar`.
- **Vencimientos** (job `mantenimiento-vencimientos`, diario 07:00): recalcula contratos (renueva los de renovación automática por el mismo periodo) y envía **un resumen por usuario** con los vencimientos que llegan hoy a un umbral (días de alerta, 15, 7, 3, 1, 0 y el día después) a quien tenga el permiso de cada tipo (`proveedores.editar`, `activos.editar`, `empleados.editar`, `mantenimiento.crear`).
- **Alcance**: permiso nuevo `mantenimiento.ver_todos` (administrador, consejo, asistente). El rol MANTENIMIENTO y el PROVEEDOR (usuario vinculado en `Proveedor.usuarioId`) ven y ejecutan solo lo suyo; el proveedor no ve planes ni calendario.
- Auditoría en crear/editar/cerrar/cancelar órdenes, planes, activos, evidencias y reporte QR.

## Integración

- `lib/mantenimiento/inicio.ts`: `resumenMantenimientoAdmin(ctx)` (planes vencidos, órdenes abiertas/atrasadas, gastos por aprobar, vencimientos a 30 días) y `resumenMantenimientoTecnico(ctx)` (órdenes de hoy y atrasadas del técnico/proveedor). Devuelven `null` si el rol no aplica.
- `lib/mantenimiento/stats.ts` (para Estadísticas): `cumplimientoPlan`, `costosPorActivo`, `mtbfPorActivo`, `proveedoresPorDesempeno`, `resumenMantenimiento` — todas `(ctx, { desde, hasta })`.
- Órdenes creadas por el módulo de tickets con prisma directo (`origen TICKET`, `ticketId`) se listan y gestionan igual.
- Exportaciones (`/api/export/<recurso>`): `activos`, `ordenes`, `planes-mantenimiento`.

## API REST

| Método | Ruta | Permiso | Cuerpo / query |
|---|---|---|---|
| GET | `/api/v1/activos` | `activos.ver` | `q, categoria, estado, take, skip` |
| POST | `/api/v1/activos` | `activos.crear` | `{ nombre, categoria, ubicacion?, zonaId?, marca?, modelo?, serie?, fechaCompra? (AAAA-MM-DD), valor?, vidaUtilAnios?, proveedorId?, garantiaVence?, estado?, notas? }` |
| GET | `/api/v1/activos/:id` | `activos.ver` | ficha con planes, órdenes, tickets y costos |
| GET | `/api/v1/ordenes` | `mantenimiento.ver` | `vista=abiertas\|atrasadas\|cerradas\|todas, estado, origen, activoId, proveedorId, q` (respeta el alcance) |
| POST | `/api/v1/ordenes` | `mantenimiento.crear` o `gestionar` | `{ titulo, fechaProgramada, descripcion?, activoId?, zonaId?, proveedorId?, asignadoAId?, checklist?: string[], costo? }` |
| GET | `/api/v1/ordenes/:id` | `mantenimiento.ver` | detalle |
| PATCH | `/api/v1/ordenes/:id` | `ejecutar` o `gestionar` | `{accion:"iniciar"}` · `{accion:"checklist", index, ok}` · `{accion:"editar", …}` (gestionar) |
| POST | `/api/v1/ordenes/:id/evidencias` | `ejecutar` o `gestionar` | `{ urls: string[], momento: "antes"\|"despues"\|"otra" }` (subidas con `/api/upload`) |
| POST | `/api/v1/ordenes/:id/cerrar` | `ejecutar` o `gestionar` | `{ notasCierre?, costo?, evidencias?, checklistCompleto? }` |
