# Directorios de la comunidad

## Vecinos (opt-in) — `/directorio`

- Permiso `directorio.ver`. Solo aparecen personas con `Persona.directorioOptIn = true` y vínculo residencial activo.
- Cada persona elige qué compartir (`Persona.directorioCampos`): `nombre`, `unidad`, `telefono`, `whatsapp`, `servicios` (`serviciosOfrecidos`). El servidor construye la ficha pública con **solo** esos campos (`fichaPublica`); nunca se exponen documento, correo, fecha de nacimiento ni datos de salud.
- Filtro "Ofrecen servicios" y búsqueda por nombre, unidad o servicio. Botones Llamar y WhatsApp (enlace `wa.me`).
- **Mi ficha** (`/directorio/mi-ficha`): el propio residente activa/desactiva su ficha, elige los campos, su teléfono y los servicios que ofrece, con vista previa de "así te ven". Se audita (`directorio_optin`). Se implementó aquí porque ningún otro módulo lo expone en `/perfil` o `/mi-hogar`.

## Proveedores para la comunidad — `/directorio/proveedores`

- Permiso `directorio.proveedores`. Lista `Proveedor` con `directorioComunitario = true` y activo: categoría, tarifas publicadas, beneficio para la comunidad y calificación promedio. La gestión (CRUD) de proveedores es del módulo Proveedores.
- Ficha `/directorio/proveedores/[id]`: contacto, distribución de estrellas y opiniones (nombre abreviado "Laura G.").
- **Calificar** (`directorio.calificar`): 1 calificación por usuario (1–5 estrellas + comentario); volver a calificar la actualiza; se puede eliminar. Tras cada cambio se recalcula `Proveedor.calificacionPromedio` con el promedio de calificaciones vigentes.

## Servicio

`lib/directorio/service.ts`: `directorioResidentes`, `fichaPublica`, `miPersona`, `guardarMiFicha`, `proveedoresComunitarios`, `categoriasProveedores`, `fichaProveedor`, `calificarProveedor`, `eliminarCalificacion`, `recalcularPromedio`.
