# Obras, remodelaciones y mudanzas

Especificación: `MICONJUNTO_SPEC.md` §6 (extras 12, 13 y 14). Código: `lib/obras/**`, `app/(app)/obras/**`.

## Obras y remodelaciones (`SolicitudObra`)

- El residente (`obras.solicitar`, solo para sus unidades) solicita en `/obras/nueva`: tipo, descripción, fechas, horario de trabajo y **contratistas autorizados** (nombre, documento, soporte de seguridad social PDF/foto y fecha de vigencia).
- La administración (`obras.aprobar`) **aprueba** (ajusta horario, depósito y condiciones) o **rechaza** con motivo. Si `config.porteria.exigirSeguridadSocialContratistas` está activo, no se aprueba mientras algún contratista no tenga soporte o su seguridad social venza antes del fin de la obra.
- Estados: SOLICITADA → APROBADA → EN_CURSO → FINALIZADA (con notas de cierre) · RECHAZADA · CANCELADA (el residente puede cancelar mientras no haya empezado). Los contratistas se pueden actualizar hasta que la obra termine.

## Mudanzas (`Mudanza`)

- Ingreso o salida, fecha y franja, **recurso** (ascensor de cada torre con ascensor, zona de cargue o escaleras), empresa, placa y **lista de enseres** (uno por línea, "2 x Nevera").
- Reglas (`lib/obras/reglas.ts`): lunes a sábado no festivos, 07:00–18:00; **sin cruces de horario** en el mismo recurso (se valida al solicitar contra solicitudes y aprobadas, y al aprobar contra las aprobadas).
- **Paz y salvo:** para una SALIDA se verifica con `unidadAlDia` de cartera al solicitar, con el botón "Verificar" y de nuevo al aprobar. **Si la unidad no está al día, la salida no se aprueba.** Para salidas, la lista de enseres es obligatoria.
- Estados: SOLICITADA → APROBADA → FINALIZADA · RECHAZADA · CANCELADA.

## Portería (solo lectura)

`autorizadasDelDia(ctx, fecha?)` en `lib/obras/service.ts` devuelve las obras aprobadas o en curso vigentes hoy (con contratistas y horario) y las mudanzas aprobadas del día (franja, recurso, placa, enseres y paz y salvo). La vista de portería la construye su módulo.

## Eventos e Inicio

Eventos: `obra.solicitada`, `obra.aprobada`, `obra.rechazada`, `mudanza.solicitada`, `mudanza.aprobada`, `mudanza.rechazada`. Widgets en `lib/obras/inicio.ts`: `resumenObrasResidente` y `resumenObrasGestion`. Exportación: `obras` y `mudanzas`.
