# Emergencias y evacuación (spec §6 extra 9)

Ruta `/emergencias` (permisos `emergencias.ver` o `emergencias.gestionar`).

- **Plan**: teléfonos (tocables, `tel:`; si el conjunto no define los suyos se muestran 123, 119, 132, 144, 112), puntos de encuentro, instrucciones y brigadistas. Botón **Activar emergencia** (administración o portería: `emergencias.gestionar` o `porteria.ver`) con tipo, mensaje y opción de avisar a todos. Edición del plan (`emergencias.gestionar`) con líneas `Nombre | detalle`. Modelo `PlanEmergencia` (acepta teléfonos `{nombre, numero}` o `{nombre, telefono}` del aprovisionamiento).
- **Alertas** (`emergencias.gestionar` o `porteria.ver`): activas en rojo con llamar/atender/falsa alarma y refresco en tiempo real (canal `porteria`, eventos `emergencia.*`); historial paginado. Banner de alertas activas en todo el módulo.
- **Evacuación asistida** (`emergencias.lista_evacuacion` o `campos.persona_salud`): personas con movilidad reducida o que requieren asistencia agrupadas por torre y piso (`listaEvacuacion` + `agruparEvacuacion`), exportable a PDF/Excel (`/api/export/evacuacion`).
- **Brigadistas**: coordinador, primeros auxilios, evacuación, contra incendios; se pueden tomar de un residente (nombre y celular).
- **Simulacros**: fecha, tipo, participantes, tiempo de evacuación y observaciones; promedio de tiempo.
- Botón de pánico del residente: `panicAction` (existente) alerta a portería y administración con su unidad.

Servicio: `lib/emergencias/service.ts` (`activarAlerta`, `atenderAlerta`, `listaEvacuacion`, `obtenerPlan`, `guardarPlan`, `guardarBrigadista`, `guardarSimulacro`, `listarAlertas`, …). Seed: `prisma/seed/25-emergencias.ts` (idempotente: plan, 6 brigadistas, 2 simulacros).
