# Comunicaciones: muro, segmentos, correo masivo, calendario, clasificados y objetos perdidos (Fase 8)

## Resumen funcional

| Ruta | Quién | Qué hace |
|---|---|---|
| `/muro` | `comunicaciones.ver` | Feed móvil con tarjetas, filtros por categoría (avisos, noticias, eventos, emergencias, clasificados, perdidos) y búsqueda. Fijadas primero. Punto azul = sin leer. |
| `/muro/nueva`, `/muro/[id]/editar` | `comunicaciones.publicar` | Editor por **bloques** (texto enriquecido, imagen, video YouTube/Vimeo, adjunto, encuesta enlazada), audiencia (todo el conjunto, segmento guardado o personalizado con conteo en vivo), fijar, comentarios, vencimiento, notificación push. |
| `/muro/[id]` | `comunicaciones.ver` / `clasificados.ver` | Detalle: bloques, reacciones (👍 🙏 ❤️ ❗), comentarios, registro de lectura. Quien publica ve el **alcance** (leída por X de Y destinatarios y quién la leyó). Moderadores ocultan/muestran comentarios. |
| `/comunicaciones` | `comunicaciones.correo_masivo` | Campañas (GENERAL y, solo lectura, COBRO_ADMINISTRACION del módulo Pagos) con métricas de 30 días y exportación. |
| `/comunicaciones/nueva`, `/comunicaciones/[id]` | `comunicaciones.correo_masivo` | Editor con variables `{{nombre}}`, `{{unidad}}`, `{{saldo}}`, `{{link_pago}}`, destinatarios (segmento o ad hoc) con **número de destinatarios en vivo**, adjuntos, **vista previa** real (primer destinatario), guardar borrador, **programar** o enviar ahora; métricas (enviados, en cola, aperturas, clics, rebotes) y detalle por correo; cancelar, duplicar. |
| `/comunicaciones/segmentos` | `comunicaciones.segmentos` | CRUD de segmentos guardados con constructor por chips y conteo en vivo. |
| `/calendario` | `calendario.ver` | Vistas **agenda** (por defecto, móvil), **semana** y **mes**. Cruza eventos del conjunto con **reservas aprobadas** ("Salón social reservada"; "Tu reserva: …" si es de tu unidad) y **bloqueos de zonas**. Crear/editar/eliminar con `calendario.crear` / `calendario.editar`, notificar a residentes y bloquear la zona. |
| `/clasificados` | `clasificados.ver` | Marketplace vecinal **moderado** (venta, servicios, cuidado de mascotas, tutorías) con precio, fotos y contacto. "Mis publicaciones" muestra el estado. Vigencia 60 días. |
| `/clasificados/moderacion` | `clasificados.moderar` o `comunicaciones.moderar` | Aprobar / rechazar con motivo (se notifica al autor). |
| `/clasificados/perdidos` | `clasificados.ver` | Objetos perdidos y encontrados con foto, lugar y contacto; "Devuelto" (a quién) o "Cerrar" por quien reportó, moderadores o portería. |

### Reglas de negocio

- **Visibilidad en servidor.** El residente solo recibe publicaciones `PUBLICADA`, vigentes y cuya audiencia lo incluye (`usuarioEnSegmento`). El autor siempre ve lo suyo. Gestores (`comunicaciones.publicar`/`moderar`) ven todo.
- **Categorías oficiales** (aviso, noticia, evento, emergencia) exigen `comunicaciones.publicar`. Solo quien publica oficialmente puede **segmentar** y **fijar**.
- **Clasificados:** quedan `PENDIENTE_MODERACION` salvo que el autor sea moderador; editar un clasificado aprobado lo devuelve a moderación. Se notifica a los moderadores.
- **Sanitización:** todo HTML pasa por `sanitize-html` al guardar y otra vez al mostrar (`lib/muro/contenido.ts`). Etiquetas permitidas: `p, br, strong, em, u, s, ul, ol, li, a[href], h3, h4, blockquote`; enlaces solo `http/https/mailto/tel` con `rel="noopener noreferrer nofollow"`. Imágenes/adjuntos solo del almacenamiento del propio conjunto; videos solo YouTube (dominio *nocookie*) y Vimeo, en iframe con `sandbox`. Comentarios en texto plano.
- **Notificaciones:** avisos y emergencias notifican siempre por push a la audiencia; emergencias y avisos fijados también por **WhatsApp** (si el conjunto y el usuario lo tienen activo; sin credenciales se omite sin error — `lib/whatsapp`).
- **Correo masivo:** se encola con `queueEmail({ tracking: true, campanaId })` (el job `correos-cola` respeta `EMAIL_RATE_PER_MIN` y reintenta 5 veces). `{{saldo}}` suma `saldoUnidad(...).neto` de las unidades donde el destinatario es propietario/copropietario o `puedeVerCuenta`; a los demás se muestra "—" (Ley 1581 / privacidad financiera). `{{link_pago}}` apunta a `/cuenta/pagar`. El envío usa bloqueo optimista (`BORRADOR/PROGRAMADA → ENVIANDO`) para no duplicar. Las rutas `/api/track/*` y la campaña de cobro son del módulo Pagos.

## Motor de segmentación (`lib/segmentos`)

Definición JSON (`SegmentoDef`, validada con zod):

```ts
{
  torres?: string[]; incluirSinTorre?: boolean;       // torres (+ casas)
  pisoMin?: number; pisoMax?: number;                 // rango de pisos
  numeroDesde?: number; numeroHasta?: number;         // número final del código ("T2-501" → 501)
  unidades?: string[]; tiposUnidad?: TipoUnidad[];    // unidades específicas / tipo
  roles?: string[];                                   // clave del rol de la membresía
  vinculos?: TipoVinculo[];                           // quién recibe (por defecto: propietarios, copropietarios, arrendatarios, residentes y familiares)
  cartera?: "AL_DIA" | "EN_MORA";                     // misma regla que unidadAlDia (saldo vencido neto > mínimo configurado)
  ocupacion?: EstadoOcupacion[];
  conMascotas?, conVehiculos?, conMenores?, adultosMayores? /* ≥ 60 */, movilidadReducida?: boolean;
}
```

Semántica: filtros con **Y**; valores de una lista con **O**; definición vacía = todo el conjunto. Si solo hay `roles`, incluye personal sin unidad (portería, contador…); con filtros de unidad, se intersecta. Menores/adultos mayores/movilidad solo cuentan personas con vínculo residencial (no empleados).

| Función | Devuelve |
|---|---|
| `resolverUnidades(ctx, def, { restringirA? })` | `string[]` ids de unidades |
| `resolverUsuarios(ctx, def)` | `string[]` ids de usuarios con membresía activa |
| `usuarioEnSegmento(ctx, def, usuarioId)` | `boolean` (versión barata para el muro) |
| `resolverDestinatariosCorreo(ctx, def)` | `DestinatarioCorreo[]` — usuarios con cuenta + personas con email, deduplicado por correo, con `unidades` y `unidadesFinancieras` |
| `contarDestinatarios(ctx, def)` | `{ unidades \| null, usuarios, correos }` |
| `unidadesEnMora(ctx, ids?)` | `Set<string>` (consulta agregada eficiente) |
| `definicionEfectiva(ctx, { segmentoId?, definicion? })` | definición normalizada |
| `guardarSegmento`, `eliminarSegmento`, `listarSegmentos`, `opcionesSegmento` | CRUD y opciones del constructor |
| `normalizarDef`, `parseDef`, `describirDef` (en `definicion.ts`, puras) | limpieza, validación y chips legibles |

UI reutilizable: `app/(app)/comunicaciones/_components/segmento-builder.tsx` (`<SegmentoBuilder name segmentoName segmentos opciones contar />`) y la acción `contarSegmentoAction` (`app/(app)/comunicaciones/segmentos/actions.ts`), permitida también para `encuestas.crear` y `votaciones.crear`.

## Inicio (`lib/muro/inicio.ts`)

- `ultimasPublicaciones(ctx, limite = 5): InicioMuroResidente` → `{ publicaciones[], sinLeer }` (respeta audiencia, excluye clasificados).
- `resumenModeracion(ctx): InicioMuroAdmin` → `{ pendientesModeracion, pendientes[], comentariosUltimaSemana }`.

## Jobs (`jobs/comunicaciones.ts`)

| Job | Cron | Qué hace |
|---|---|---|
| `correo-masivo-programado` | `*/5 * * * *` | Envía campañas GENERALES `PROGRAMADA` cuya hora llegó. |
| `documentos-vencimientos` | `0 7 * * *` | Avisa a quien tiene `documentos.editar` a 30, 15, 7, 1 y 0 días del vencimiento (y cada 7 días después). |
| `calendario-recordatorios` | `0 18 * * *` | Recuerda los eventos visibles del día siguiente. |

## API REST

| Método y ruta | Permiso | Descripción |
|---|---|---|
| `GET /api/v1/publicaciones?categoria=&q=&page=&pageSize=` | `comunicaciones.ver` | Feed visible para el usuario. |
| `POST /api/v1/publicaciones` | `comunicaciones.publicar` / `clasificados.publicar` | Crea publicación (`contenido` = bloques, `audiencia` = SegmentoDef o `segmentoId`). |
| `GET /api/v1/publicaciones/:id` | `comunicaciones.ver` | Detalle (bloques sanitizados, reacciones, comentarios). Registra lectura. |
| `DELETE /api/v1/publicaciones/:id` | autor o moderación | Elimina. |
| `POST /api/v1/publicaciones/:id/comentarios` | `comunicaciones.comentar` | `{ contenido }` |
| `POST /api/v1/publicaciones/:id/reacciones` | `comunicaciones.comentar` | `{ tipo: LIKE\|GRACIAS\|CORAZON\|IMPORTANTE }` (alterna). |
| `GET /api/v1/eventos?desde=&hasta=&tipos=EVENTO,RESERVA,BLOQUEO` | `calendario.ver` | Calendario unificado (máx. 400 días). |
| `POST /api/v1/eventos`, `PUT/DELETE /api/v1/eventos/:id`, `GET /api/v1/eventos/:id` | `calendario.crear` / `calendario.editar` | CRUD de eventos. |

## Eventos de dominio emitidos

`publicacion.creada`, `evento.creado`, `documento.publicado` (con `{ id, ... }`).

## Decisiones

- Subcategoría y contacto del clasificado se guardan como bloque `{ tipo: "meta" }` dentro de `Publicacion.contenido` (el esquema no tiene esos campos).
- Las reacciones se eliminan físicamente al quitarlas (índice único por usuario y publicación).
- El muro filtra audiencias sobre las 400 publicaciones más recientes (paginación en memoria) para no evaluar segmentos en SQL.
- `{{saldo}}` nunca revela información financiera a arrendatarios/familiares.
- El servicio de correo masivo vive en `lib/comunicaciones/correo-masivo.ts`.
