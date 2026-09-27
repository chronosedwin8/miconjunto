# Encuestas, votaciones, asambleas y consejo (Fase 9)

Gobierno de la copropiedad conforme a la Ley 675 de 2001. Rutas: `/encuestas`, `/votaciones`, `/asambleas`, `/consejo`.

## Reglas legales implementadas (`lib/votaciones/calculos.ts`, puro y con pruebas)

| Regla | Implementación |
|---|---|
| Quórum deliberatorio (art. 45) | Suma de coeficientes presentes + representados por poder (cada unidad cuenta una vez, sin las que registraron salida). Por defecto se exige **más del 50 %** (`Asamblea.quorumRequerido` = 50,000001, configurable). |
| Mayoría simple (art. 45) | La opción ganadora debe superar la mitad de la base. En asamblea la base es lo **representado en la sesión** (abstenciones y presentes que no votan cuentan); fuera de asamblea, lo emitido. |
| Mayoría calificada 70 % (art. 46) | ≥ 70 % del **total** de coeficientes del conjunto (o del total de unidades si se pondera por unidad), no de los presentes. |
| Unanimidad | La opción recibe el 100 % de la base y nadie vota distinto. |
| Ponderación | `COEFICIENTE` (peso = coeficiente) o `UNIDAD` (un voto por unidad). Resultado por opción con % del coeficiente total y % de lo emitido. |
| Antelación de convocatoria (art. 39) | Días calendario (hora de Bogotá) entre envío y reunión. **Ordinaria < 15 días: se bloquea el envío.** Extraordinaria: solo advierte (lo define el reglamento). |

## Votaciones
- Un voto por unidad (`Voto @@unique(votacionId, unidadId)`); un propietario con varias unidades vota por cada una.
- Quién vota: `PROPIETARIOS`, `PROPIETARIOS_AL_DIA` (usa `unidadAlDia`) o `TODOS` (un voto por unidad vinculada). Si `conjuntoConfig.bloqueoMora.votacion` está activo, se bloquean unidades en mora en cualquier votación. Sin el permiso `votaciones.votar` (p. ej. arrendatarios) solo se vota por poder o en consultas `TODOS`.
- Apoderado: con `PoderAsamblea` APROBADO vota por la unidad del poderdante (queda `porPoder`), y el poderdante deja de poder votar directamente por esa unidad.
- En votaciones de asamblea la unidad debe tener asistencia registrada (presente, virtual o por poder).
- Voto secreto con comprobante: `sha256(votacionId:unidadId:nonce)` (nonce aleatorio no guardado). En voto secreto no se guarda `usuarioId` ni nombre; el acta no revela la opción de cada unidad. Verificación en `/votaciones/comprobante?hash=` (la opción solo se muestra a quien votó).
- Resultados en tiempo real (canal `votacion:<id>`), cierre automático por job, acta PDF con participación por coeficiente y QR hacia `/verificar/<Votacion.codigoActa>` (prefijo `VOT-`).

## Encuestas
Preguntas de opción única, múltiple, escala 1–5 y texto. Audiencia: todo el conjunto, solo propietarios, una torre o un segmento guardado (se guarda como `Segmento` reutilizable del motor `lib/segmentos`). Anónimas: `votanteHash` = HMAC(encuesta+usuario) sin `usuarioId`. Resultados en vivo (canal `encuesta:<id>`) con gráficos; el residente los ve después de responder. Cierre automático.

## Asambleas
Flujo: crear (borrador con orden del día sugerido) → convocatoria (texto editable, validación de antelación, envío masivo: notificación + correo a todos los propietarios, incluso sin cuenta) → poderes (el propietario adjunta el poder firmado; límite `limitePoderes` por apoderado; aprobación de la administración) → asistencia (QR `/asambleas/<id>/asistir?c=<codigoAsistencia>` proyectado en la sala, registro virtual desde la app o manual por unidad; se habilita 2 h antes) → conducción (`/conducir`: iniciar, abrir/cerrar la votación de cada punto, quórum en vivo; `/asambleas/proyector/<id>` para proyector) → finalizar (cierra votaciones y genera el borrador del acta) → acta (plantilla con resultados insertados, firma en canvas de presidente y secretario; si el texto cambia, las firmas se reinician) → publicar (PDF con QR hacia `/verificar/<actaCodigo>` (prefijo `ACT-`), `Documento` categoría ACTA + `VersionDocumento`) → compromisos (tarea, responsable, fecha, estado).
Cuotas extraordinarias: se crean en `/cartera/extraordinarias` y se enlazan a la asamblea (`CuotaExtraordinaria.asambleaId`) desde la pestaña Compromisos.

## Consejo
Miembros (presidente único vigente, secretario, vocales, suplentes; periodo), reuniones con acta y decisiones, y panel de **aprobaciones pendientes** de solo lectura: multas NOTIFICADA/EN_DESCARGOS (`/convivencia`), reservas SOLICITADA (`/reservas/admin`), gastos PENDIENTE_APROBACION (`/presupuesto`).

## Jobs (`jobs/gobierno.ts`)
- `gobierno-cierre` (cada 5 min): cierra votaciones y encuestas vencidas (resultado + código de acta).
- `gobierno-recordatorios` (cada 5 min): asamblea 1 día y 1 hora antes; votaciones que cierran en < 24 h a quien no ha votado. Deduplicado por `Notificacion.tipo + enlace`.

## API REST (`/api/v1`)
| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/votaciones?estado=&asambleaId=` | votaciones.ver | Lista |
| POST | `/votaciones` | votaciones.crear | Crea y abre `{pregunta, opciones[], tipoMayoria, ponderacion, quienVota, secreto, fin}` |
| GET | `/votaciones/:id` | votaciones.ver | Detalle, resultado en vivo y `misUnidades` |
| POST | `/votaciones/:id/votar` | votaciones.votar/ver | `{unidadId, opcionId}` → `{comprobante}` |
| POST | `/votaciones/:id/cerrar` | votaciones.cerrar / asambleas.gestionar | Cierra y calcula |
| GET | `/votaciones/:id/acta` | votaciones.ver | PDF |
| GET | `/votaciones/comprobante?hash=` | votaciones.ver | Verifica comprobante |
| GET/POST | `/encuestas` | encuestas.ver / encuestas.crear | Lista / crea |
| GET | `/encuestas/:id` | encuestas.ver | Detalle y resultados |
| POST | `/encuestas/:id/responder` | encuestas.ver | `{respuestas: {preguntaId: valor}}` |
| GET/POST | `/asambleas` | asambleas.ver / asambleas.crear | Lista / crea |
| GET | `/asambleas/:id` | asambleas.ver | Detalle, quórum, votaciones, mis unidades |
| POST | `/asambleas/:id/convocar` | asambleas.crear | Valida antelación y envía |
| GET/POST | `/asambleas/:id/asistencia` | asistencia / ver | Lista; registro propio `{tipo, codigo}` o manual `{unidadId, tipo}` |
| GET/POST | `/asambleas/:id/poderes` | asambleas.ver | Lista (propios o todos) / registra |
| GET | `/asambleas/:id/acta` | asambleas.ver | PDF (borrador solo gestión) |

## Contratos para otros módulos
- `lib/asambleas/inicio.ts`: `resumenResidente(ctx)` y `resumenAdmin(ctx)` (tipos `ResumenGobiernoResidente`, `ResumenGobiernoAdmin`).
- `lib/asambleas/verificacion.ts`: `buscarActaPorCodigo(codigo)` para `/verificar/<codigo>` (actas `VOT-` y `ACT-`, solo datos agregados).
- Eventos: `votacion.abierta`, `votacion.cerrada`, `encuesta.creada`, `encuesta.cerrada`, `asamblea.convocada`, `asamblea.en_curso`, `asamblea.finalizada`, `asamblea.cancelada`, `asamblea.acta_publicada`.
- Exportaciones: `votaciones`, `votos?votacionId=`, `asistencia-asamblea?asambleaId=`, `poderes-asamblea?asambleaId=`, `encuesta-respuestas?encuestaId=`.
