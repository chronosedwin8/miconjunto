# Residentes, familia y ocupantes (spec §4.2, §5.3, extra 12)

## Funcional

- **Administración — `/residentes`** (permiso `residentes.ver_todos`)
  - *Personas*: búsqueda (nombre, documento, unidad, celular) y filtros por torre, tipo de vínculo, estado (incluye `PENDIENTE_APROBACION`) y grupo (menores, adultos mayores 60+, movilidad reducida, con cuenta). Exporta Excel/PDF (`residentes.exportar`).
  - *Registrar persona* (`/residentes/nueva?unidad=&tipo=`): persona + vínculo, horario (empleados y visitantes frecuentes) e información de emergencia. Si ya existe alguien con ese documento se reutiliza y solo se agrega el vínculo.
  - *Ficha* (`/residentes/[id]`): datos (respeta `campos.persona_telefono`, `campos.persona_documento`, `campos.persona_salud`), vínculos vigentes e históricos, aprobar/rechazar, horario, retirar de una unidad, invitar a la app y **retirar y anonimizar**.
  - *Por aprobar* (`residentes.aprobar`): arrendatarios y copropietarios registrados o invitados por propietarios. Al aprobar un arrendatario la unidad pasa a `ARRENDADA`; se notifica al propietario y al arrendatario.
  - *Vehículos* y *Mascotas* (`vehiculos.ver_todos`): CRUD, alertas de SOAT/tecnomecánica/antirrábica (vencido o ≤ 30 días) y mascotas potencialmente peligrosas sin póliza (Ley 746 de 2002).
  - *Indicadores*: personas que habitan, menores, adultos mayores, movilidad reducida por torre/piso, ocupación (arrendadas, renta corta), mascotas por especie y vehículos por tipo.
- **Residente/propietario — `/mi-hogar`** (permiso `residentes.ver`; solo sus unidades): panel guiado de 9 pasos (`/mi-hogar/[1-9]?u=<unidad>`), cada uno guardable. Los pasos con formulario (1 y 2) guardan borrador en el servidor (`BorradorFormulario`, clave `mi-hogar:pasoN:<unidad>`) mientras se escribe; el avance se guarda en `mi-hogar:progreso:<unidad>`. Muestra la ficha física (áreas, medidores, parqueaderos, bodega) sin datos financieros. Invitación por correo/WhatsApp (`invitarUsuario`).

## Reglas

- Sin `residentes.ver_todos` todo se limita a `ctx.unidadIds` (lecturas y escrituras, verificado en servidor).
- Un residente no puede crear `PROPIETARIO`; `ARRENDATARIO`/`COPROPIETARIO` solo el propietario y quedan `PENDIENTE_APROBACION`.
- Quien tiene cuenta administra sus propios datos (habeas data); el propietario edita solo ocupantes sin cuenta.
- Horario `{ dias:[0-6], desde:"HH:mm", hasta:"HH:mm" }` solo para empleados, cuidadores y visitantes frecuentes.
- Placa única por conjunto, normalizada (mayúsculas, sin espacios ni guiones) y validada por tipo.
- Al finalizar un vínculo, si la persona queda sin vínculos y sin cuenta, se anonimiza. Retirar persona (admin) finaliza vínculos, suspende la membresía residencial y anonimiza.
- Las banderas `tienePersonaMovilidadReducida`/`requiereAsistenciaEvacuacion` de la unidad se recalculan desde las personas que la habitan.
- Eventos: `residente.vinculo_aprobado`, `residente.vinculo_rechazado`, `residente.retirado`.

## Inicio (`lib/residentes/inicio.ts`)

- `resumenResidente(ctx): ResumenResidente` → avance del panel, pasos pendientes, política pendiente, SOAT y vacunas por vencer, vínculos pendientes.
- `resumenAdmin(ctx): ResumenAdminResidentes` → aprobaciones pendientes, población, SOAT/vacunas por vencer, mascotas peligrosas sin póliza.

## API REST

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/api/v1/personas?q=&torre=&tipo=&estado=&grupo=&unidad=&take=&skip=` | `residentes.ver` o `ver_todos` | Lista (residente: solo sus unidades) |
| POST | `/api/v1/personas` | `residentes.crear` | `{ tipoDocumento, numeroDocumento, nombres, apellidos, unidadId, tipo, horario? }` |
| GET | `/api/v1/personas/:id` | `residentes.ver` | Detalle con vínculos |
| PATCH | `/api/v1/personas/:id` | `residentes.editar` | Datos de contacto/emergencia |
| DELETE | `/api/v1/personas/:id` | `residentes.eliminar` (admin) | Retira y anonimiza |
| GET | `/api/v1/vehiculos?placa=&unidadId=&tipo=` | `vehiculos.ver` | Búsqueda por placa normalizada (portería/LPR) |
| POST | `/api/v1/vehiculos` | `vehiculos.crear` | Registra |
| GET/PATCH/DELETE | `/api/v1/vehiculos/:id` | `vehiculos.*` | Detalle, edición, baja |

Exportaciones: `/api/export/residentes`, `/vehiculos`, `/mascotas`, `/evacuacion`.
