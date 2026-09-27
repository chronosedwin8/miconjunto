# PQRS y tickets de daños (mesa de ayuda)

Especificación: `MICONJUNTO_SPEC.md` §4.7 y §5.8. Código: `lib/tickets/**`, `app/(app)/tickets/**`, `app/api/v1/tickets/**`, `jobs/tickets.ts`, página pública `app/c/[slug]`.

## Funcional

- **Radicar en 3 pasos (móvil):** `/tickets/nuevo` → 1) tipo con tarjetas grandes e íconos, 2) descripción + fotos/video desde la cámara (+ zona común, unidad y "es urgente" para daños), 3) radicado y fecha límite. Atajos: `/tickets/nuevo?tipo=DANO_ZONA_COMUN` (salta el paso 1, "Reportar daño" en ≤ 3 toques), `?zona=<id>`, `?activo=<id>` (desde la etiqueta QR del activo).
- **Radicado** consecutivo por año: `2026-0001` (`nextConsecutivo(conjuntoId, "RADICADO", año)`).
- **SLA** (`lib/tickets/reglas.ts`, puro): petición, queja, reclamo, sugerencia y felicitación → 15 días hábiles; daños (zona común / unidad) y seguridad → según prioridad (urgente 1, alta 3, media 7, baja 15 días hábiles); ruido, mascotas y otros → 15 días hábiles (quejas de convivencia). Días hábiles = lunes a viernes sin festivos de Colombia (Ley Emiliani + Pascua, `lib/tickets/dias-habiles.ts`). El día de radicación no cuenta; el plazo vence al final del día (hora de Bogotá).
- **Estados:** ABIERTO → EN_REVISION → ASIGNADO → EN_PROCESO → EN_ESPERA_RESIDENTE → RESUELTO → CERRADO, y REABIERTO. Transiciones válidas en `TRANSICIONES`. Cada cambio deja `ComentarioTicket` de tipo `CAMBIO_ESTADO` o `ASIGNACION` (línea de tiempo) y auditoría.
- **Comentarios** públicos e **internos** (solo con `tickets.comentario_interno`; nunca se envían al residente). Plantillas de respuesta con variables `{{radicado}}`, `{{nombre}}`, `{{fecha_limite}}`, `{{conjunto}}`.
- **Resolver** con respuesta y evidencia (fotos). El residente **califica** (1–5) y el ticket pasa a CERRADO; puede **reabrir** si está resuelto o cerrado hace menos de 30 días (el SLA se reinicia). Si el residente responde a un ticket "Esperando al residente", vuelve a gestión automáticamente.
- **Asignación** a usuario (mantenimiento, asistente, administrador) y/o proveedor. Mantenimiento ve y gestiona solo sus asignados.
- **Orden de trabajo:** los daños en zonas comunes o activos generan `OrdenTrabajo` (origen TICKET, número consecutivo "ORDEN") enlazada al ticket, zona y activo; el ticket pasa a EN_PROCESO. El módulo de mantenimiento la gestiona (y al completarla resuelve el ticket).
- **Tablero (administración):** Kanban en escritorio (arrastrar y soltar o "Mover a…"), lista por estado con pestañas en el teléfono, filtros (tipo, prioridad, asignado, SLA vencido/por vencer, torre), búsqueda por radicado, exportación Excel/PDF (`/api/export/tickets`), actualización en tiempo real (canal `tickets`). Indicadores en `/tickets/indicadores`; plantillas en `/tickets/plantillas`.
- **Privacidad:** sin `tickets.ver_todos` solo se ven los tickets que el usuario radicó, los de sus unidades y los asignados a él.
- **Página pública** `/c/<slug>` (si `Conjunto.paginaPublica`): formulario PQRS para no residentes (nombre, correo, teléfono, tipo, descripción, autorización de datos). Crea ticket con origen `PUBLICO`, responde por correo con el radicado. Anti-spam: campo trampa, envío < 3 s descartado en silencio, límite 5/hora por IP y 3/día por correo.

## Eventos, notificaciones y jobs

- Eventos: `ticket.creado`, `ticket.actualizado` (webhooks salientes y tiempo real), `mantenimiento.orden_creada`.
- Avisos: administración (nuevo ticket; urgentes también por correo), responsable (asignación), solicitante (respuestas, cambios de estado; tickets públicos por correo).
- Jobs (`jobs/tickets.ts`): `tickets-sla-diario` (08:00, vencidos y por vencer en 24 h), `tickets-sla-urgentes` (cada hora), `tickets-cierre-automatico` (00:30, cierra RESUELTOS sin respuesta tras 7 días), `convivencia-descargos` (08:00).

## Inicio y estadísticas

`lib/tickets/inicio.ts`: `resumenTicketsResidente`, `resumenTicketsAdmin` (por estado, vencidos SLA, urgentes, sin asignar), `resumenTicketsMantenimiento`. `lib/tickets/stats.ts`: `estadisticasTickets` (por tipo/estado, horas promedio de resolución y primera respuesta, % a tiempo, satisfacción), `ticketsPorMes`, y el cálculo puro `calcularEstadisticas`.

## API REST (`/api/v1`, sesión o token de API)

| Método | Ruta | Permiso | Cuerpo / parámetros |
|---|---|---|---|
| GET | `/tickets` | `tickets.ver` o `tickets.ver_todos` | `q, estado, tipo, prioridad, sla=vencidos\|por_vencer, unidad, take, skip` → `{ items, total }` |
| POST | `/tickets` | `tickets.crear` | `{ tipo, descripcion, titulo?, unidadId?, zonaId?, activoId?, ubicacion?, adjuntos?, prioridad?, urgente? }` → `{ id, radicado, estado, prioridad, fechaLimite }` |
| GET | `/tickets/:id` | `tickets.ver` | Detalle con historial (internos solo con `tickets.comentario_interno`) |
| POST | `/tickets/:id/comentarios` | `tickets.ver` | `{ contenido, interno?, adjuntos? }` |
| POST | `/tickets/:id/estado` | `tickets.gestionar` | `{ estado, nota?, adjuntos? }` (valida transiciones) |
