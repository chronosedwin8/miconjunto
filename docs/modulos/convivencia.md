# Convivencia: llamados de atención, multas e incidentes

Especificación: `MICONJUNTO_SPEC.md` §4.3 (Multa), §4.7 y §5.9. Código: `lib/convivencia/**`, `app/(app)/convivencia/**`.

## Principios

- Flujo **digital y respetuoso**: los textos describen hechos, no personas; las notificaciones invitan a leer y responder.
- **Privacidad:** nada es visible para otros residentes. Sin `convivencia.ver_todos` el usuario solo ve lo de sus unidades; las multas en PROPUESTA (aún no notificadas) tampoco las ve el residente. Las notas de las sesiones de mediación solo las ve la administración.
- Toda decisión queda en **auditoría** (crear, acuse, respuesta, propuesta, notificación, descargos, ratificación/revocación, incidentes).

## Llamados de atención

Administración/consejo (`convivencia.crear`) crean el llamado: unidad, persona (opcional), motivo del catálogo u otro, descripción, evidencia (fotos) y gravedad (por defecto la del catálogo). Los residentes de la unidad reciben push y correo. El residente **confirma la lectura** (acuse con fecha, estado LEIDO) y puede **responder** (RESPONDIDO). La administración lo cierra o lo **escala a multa**.

## Multas — debido proceso (Ley 675 de 2001, art. 59)

`lib/convivencia/debido-proceso.ts` (funciones puras):

1. **PROPUESTA**: valor sugerido del catálogo (editable). No se cobra ni se muestra al residente.
2. **NOTIFICADA**: se abre el plazo de **descargos en días hábiles** (5 por defecto, configurable al notificar). Aviso con el valor propuesto y la fecha límite.
3. **EN_DESCARGOS**: el residente presenta sus descargos (o la administración registra los recibidos por escrito) mientras el plazo esté vigente.
4. **Decisión del consejo** (`convivencia.decidir`), solo con descargos presentados o con el plazo vencido: **RATIFICADA** (con resolución y valor final) o **REVOCADA**. Una propuesta que nunca se notificó puede revocarse.
5. Al **ratificar** se carga a cartera con `crearCargo({ conceptoTipo: "MULTA", origen: "MULTA" })`, se guarda `Multa.cuotaId` y se notifica con el valor y el enlace `/cuenta/pagar?cuotas=<cuotaId>&unidad=<unidadId>`. **La multa nunca se carga antes de RATIFICADA.** Si falla el cargo, la decisión se revierte.
6. **PAGADA**: la marca el núcleo de cartera (`aplicarPago`) cuando se paga la cuota.

Recordatorios (`jobs/tickets.ts` → `convivencia-descargos`, 08:00): al residente cuando faltan ≤ 2 días del plazo y al consejo cuando una multa quedó lista para decisión.

## Catálogo de infracciones

`/convivencia/catalogo` (`convivencia.infracciones`): código, nombre, valor sugerido, gravedad, artículo del manual, activo. Se crea un catálogo base al aprovisionar el conjunto.

## Incidentes de convivencia

Conflictos entre unidades (`convivencia.incidentes`): registro con unidades involucradas, sesiones de mediación (JSON: fecha, asistentes, notas, compromisos), acuerdos y estados ABIERTO → EN_MEDIACION → ACUERDO → CERRADO / ESCALADO. Las unidades involucradas reciben aviso de acuerdos y cierre.

## Pantallas

- Residente: `/convivencia` "Mis llamados y multas" (multas con plazo de descargos, llamados sin leer, incidentes de sus unidades), detalle con acuse, respuesta, descargos y botón **Pagar** para multas ratificadas.
- Administración y consejo: pestañas Llamados, Multas (indicadores del proceso), Incidentes y Catálogo; **historial por unidad** en `/convivencia/unidad/<id>`; exportación `llamados` y `multas`.

## Inicio

`lib/convivencia/inicio.ts`: `resumenConvivenciaResidente` (llamados sin leer, multas en plazo de descargos, multas por pagar) y `resumenConvivenciaGestion` (llamados sin respuesta, multas por notificar y por decidir, incidentes abiertos).
