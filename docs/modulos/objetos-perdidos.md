# Objetos perdidos — reporte y búsqueda de artículos extraviados

Módulo propio en `/objetos-perdidos` (antes era una pestaña de Clasificados; `/clasificados/perdidos` redirige aquí).

## Permisos

| Permiso | Quién lo tiene por defecto | Qué permite |
| --- | --- | --- |
| `objetos.ver` | Residentes, propietarios, convivientes, consejo, portería, asistente, administrador | Buscar y ver reportes |
| `objetos.reportar` | Residentes, propietarios, convivientes, portería, asistente, administrador | Reportar y reclamar |
| `objetos.gestionar` | Portería, asistente administrativo, administrador | Recibir en custodia, aprobar/rechazar reclamos, entregar, donar o cerrar |

El seed `75-objetos-perdidos` sincroniza estos permisos en los roles base del conjunto demo. En conjuntos existentes se agregan desde **Configuración → Roles** (los conjuntos nuevos los reciben al crearse).

## Flujo

1. **Reporte** (`/objetos-perdidos/nuevo`, `?tipo=PERDIDO|ENCONTRADO`): categoría (llaves, documentos, billetera, celular, electrónico, ropa, juguete, mascota, bicicleta, joya, gafas, otro), qué es, descripción, color, marca, zona/lugar, fecha, hasta 6 fotos (cámara o galería), **detalles privados**, recompensa (solo pérdidas) y contacto opcional. Cada reporte recibe un código `OP-AAAA-NNNN`.
2. **Custodia**: si un vecino encontró algo, portería/administración lo recibe ("Recibir en custodia", queda `EN_CUSTODIA` con el lugar y quién lo recibió). Portería también lo registra directo desde el kiosco (**Objeto encontrado**).
3. **Coincidencias automáticas**: perdido ↔ encontrado con la misma categoría, palabras en común, color, marca, zona y cercanía de fechas (`lib/objetos-perdidos/reglas.ts`, puntaje 0–100, se sugiere desde 45 y "muy probable" desde 70). Al reportarse o recibirse un objeto encontrado se avisa a los dueños de pérdidas parecidas ("¿Es tuyo?"). El detalle muestra "Puede ser este".
4. **Reclamo**: el residente pulsa **Es mío, reclamar** y describe detalles que solo el dueño conoce. Portería/administración compara con los detalles privados del objeto (y los de la pérdida del reclamante) y **aprueba** (`RECLAMADO`; los demás reclamos se rechazan) o **rechaza** con motivo.
5. **Entrega**: nombre, número de documento y **firma en pantalla** (se guarda como imagen en `objetos-firmas/`). Queda `DEVUELTO` con quién entregó y cuándo; la pérdida relacionada del dueño también se cierra y ambos reportes quedan enlazados (`coincideConId`).
6. **Cierres**: el dueño marca **¡Ya apareció!**; quien encontró algo y lo devolvió en persona marca **Lo devolví a su dueño**.

## Privacidad

- Los **detalles privados** (`rasgosPrivados`) nunca se publican: solo los ven quien reportó y quien gestiona. No se usan para el puntaje de coincidencia ni en la búsqueda.
- El contacto solo se muestra si quien reporta lo marca expresamente; nunca se muestra su teléfono de perfil.
- Quien reporta y los reclamantes solo son visibles para gestión; los demás ven "un vecino" / "Alguien reclamó este objeto".
- Documento y firma de la entrega solo los ve gestión. La auditoría oculta la firma.

## Vencimientos (job diario `objetos-perdidos-vencimientos`, 8:00 a. m.)

- Pérdidas: aviso al dueño 7 días antes y **cierre automático** a los 90 días (`objetosPerdidos.diasPerdido`). El dueño puede "Seguir buscando" (renovar) cuando faltan menos de 15 días.
- Objetos en custodia: al cumplir 60 días (`objetosPerdidos.diasCustodia`) se pide a la administración disponer (el día del vencimiento y cada 7 días). La disposición es **Donar** (`DONADO`) o **Cerrar** con nota obligatoria.
- Ambos plazos se configuran en **Configuración → Parámetros → Portería**.

## Pantallas

- Lista con pestañas: Todos, Por atender (gestión: reclamos pendientes, sin custodia, plazos vencidos), Perdidos, Encontrados, En custodia, Mis reportes (incluye mis reclamos), Historial. Búsqueda, chips de categoría y filtros de fecha y zona. Gestión exporta a Excel.
- Detalle `[id]` con galería, acciones, detalles privados, reclamos, coincidencias e historial.
- Inicio del administrador: alertas de reclamos por verificar y custodia vencida. Búsqueda global: objetos activos por código, título, descripción o marca.

## Código

- Servicio: `lib/objetos-perdidos/service.ts`; reglas puras: `lib/objetos-perdidos/reglas.ts`; exportación: `lib/objetos-perdidos/export.ts`.
- Acciones: `app/(app)/objetos-perdidos/actions.ts`.
- API: `GET/POST /api/v1/objetos-perdidos`, `GET /api/v1/objetos-perdidos/{id}` (aparecen en la especificación OpenAPI).
- Pruebas: `tests/unit/objetos-perdidos.test.ts`, `tests/integration/objetos-perdidos.test.ts`.
