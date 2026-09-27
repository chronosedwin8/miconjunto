# Documentos (gestión documental)

## Funcional

| Ruta | Permiso | Qué hace |
|---|---|---|
| `/documentos` | `documentos.ver` | Lista por carpetas (chips), filtro por categoría, búsqueda por título, descripción, nombre de archivo **y texto extraído del PDF**. Aviso "Tienes N documentos por confirmar lectura". Exportación (gestores). |
| `/documentos/[id]` | `documentos.ver` | Descarga (vía `/api/v1/documentos/:id/archivo`, que valida la visibilidad), botón **"Leí el documento"** si requiere acuse, historial de versiones. Gestores: subir **nueva versión**, editar metadatos, eliminar y panel de **confirmaciones** (quién leyó / quién falta por versión). |

Categorías: reglamento de PH, manual de convivencia, actas, presupuestos, estados financieros, pólizas, contratos, circulares y otros.

### Reglas

- **Visibilidad por rol:** `Documento.rolesVisibles` y `CarpetaDocumento.rolesVisibles` (vacío = todos). Se compara con la clave del rol y con su rol base (roles personalizados heredan). Documentos no publicados solo los ven los gestores (`documentos.crear|editar|eliminar`). Se aplica en listas (`whereVisible`), detalle, acuses y descarga.
- **Versionado:** cada archivo nuevo crea `VersionDocumento` (v+1) y actualiza `versionActual`. Las versiones anteriores quedan descargables.
- **Acuse por versión:** `AcuseDocumento (documentoId, usuarioId, version)`; subir una versión nueva deja a todos pendientes otra vez. Idempotente. Queda en auditoría.
- **Texto extraído:** al subir un PDF se guarda `VersionDocumento.textoExtraido` con un extractor propio sin dependencias (`lib/documentos/texto-pdf.ts`: FlateDecode + operadores `Tj/TJ`). Si el PDF es escaneado o usa codificaciones propietarias queda `null`. Lo consume el asistente IA con `textoParaIA(ctx)`.
- **Vencimientos:** `Documento.vence` (pólizas, contratos). Job diario 07:00 avisa a la administración (ver `docs/modulos/comunicaciones.md`).
- **Código de verificación:** opcional (`codigoVerificacion`, 10 caracteres) para la página pública `/verificar` (otro módulo).
- **Archivos:** se suben con `/api/upload` (carpeta `documentos`); el servidor valida que la URL pertenezca al conjunto.
- **Notificaciones:** al publicar (o nueva versión) con acuse se notifica por push + correo a quienes pueden verlo.

## Servicio (`lib/documentos/service.ts`)

`listarDocumentos`, `obtenerDocumento`, `guardarDocumento`, `nuevaVersion`, `eliminarDocumento`, `confirmarLectura`, `acusesDocumento`, `guardarCarpeta`, `eliminarCarpeta`, `documentosPorVencer`, `textoParaIA`, `puedeVerDocumento`, `whereVisible`, `infoArchivo`. Utilidades: `pdf-simple.ts` (PDF de texto sin dependencias, usado en el seed), `texto-pdf.ts`.

## API REST

| Método y ruta | Permiso | Descripción |
|---|---|---|
| `GET /api/v1/documentos?q=&carpetaId=&categoria=&pendientes=1&take=&skip=` | `documentos.ver` | Documentos visibles con estado de acuse. |
| `POST /api/v1/documentos` | `documentos.crear` | Crea documento (subir antes el archivo a `/api/upload`). |
| `GET /api/v1/documentos/:id` | `documentos.ver` | Ficha con versiones. |
| `GET /api/v1/documentos/:id/archivo?version=N` | `documentos.ver` | Descarga validando visibilidad por rol. |
| `POST /api/v1/documentos/:id/acuse` | `documentos.ver` | Confirma lectura de la versión vigente. |
| `GET /api/v1/documentos/:id/acuse` | `documentos.editar` | Leídos y pendientes. |

Exportaciones: `documentos` y `campanas-correo` (`lib/documentos/export.ts`).
