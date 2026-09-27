# MICONJUNTO — Especificación completa para Claude Code

> **Instrucción para Claude Code:** este documento es la fuente de verdad del proyecto. Léelo completo antes de escribir código. Construye **todo** lo que aquí se describe, en el orden de fases de la sección 16, sin dejar módulos "para después". Si algo es ambiguo, toma la decisión más simple y consistente con el resto del documento, regístrala en `docs/DECISIONES.md` y continúa. No pidas confirmación por cada paso.

---

## 0. Datos operativos

| Ítem | Valor |
|---|---|
| Repositorio | `https://github.com/chronosedwin8/miconjunto.git` |
| Base de datos | PostgreSQL ya instalada en la máquina local |
| Host / puerto | `localhost:5432` |
| Usuario | `postgres` |
| Contraseña | `1004` |
| Nombre de la BD | `miconjunto` (créala si no existe: `CREATE DATABASE miconjunto;`) |
| `DATABASE_URL` | `postgresql://postgres:1004@localhost:5432/miconjunto?schema=public` |
| Idioma de la UI | Español (Colombia). Moneda COP, zona horaria `America/Bogota`, formato de fecha `DD/MM/YYYY`. |
| Producto | **MiConjunto** — SaaS multi-tenant para administración de propiedad horizontal en Colombia |

Flujo de trabajo esperado:

1. Clona el repo, crea la rama `main` si está vacío.
2. Crea la estructura del proyecto (sección 2), `.env.example` y `README.md`.
3. Implementa fase por fase (sección 16). Al terminar cada fase: ejecuta migraciones, corre el seed, corre los tests, haz **commit con mensaje descriptivo** y `git push`.
4. Mantén `docs/` actualizado: `ARQUITECTURA.md`, `MODELO_DATOS.md`, `DECISIONES.md`, `API.md`, `MANUAL_ADMIN.md`, `MANUAL_RESIDENTE.md`, `MANUAL_PORTERIA.md`.
5. Al final entrega el sistema funcionando con `npm run dev` y datos de demostración cargados.

---

## 1. Visión del producto

MiConjunto centraliza **toda** la operación de un conjunto residencial (edificio, conjunto de casas, torres mixtas): copropietarios y residentes, cartera y recaudo, zonas comunes y reservas, portería, paquetería, PQRS/tickets, comunicaciones, asambleas y votaciones, activos y mantenimiento, proveedores, convivencia y estadísticas.

Principios no negociables:

1. **Mobile-first.** El 80 % de los usuarios (residentes, porteros, vigilantes) usará el teléfono. Cada pantalla se diseña primero para 360–430 px de ancho y luego se adapta a escritorio. Es una **PWA instalable** con notificaciones push y funcionamiento parcial sin conexión en portería.
2. **Pocos pasos.** Ninguna acción cotidiana (registrar visitante, reportar un daño, reservar un salón, pagar, buscar un residente) debe requerir más de 3 toques desde la pantalla de inicio. Búsqueda global siempre visible.
3. **Multi-tenant real.** Un mismo despliegue sirve a muchos conjuntos; los datos están aislados por `conjunto_id` en toda tabla de negocio y las consultas siempre filtran por el tenant del usuario autenticado.
4. **Todo conectado.** Un dato se captura una vez y se usa en todos lados: el vehículo del residente lo ve portería; el visitante autorizado por el residente aparece en la bitácora; la mora bloquea el paz y salvo; la reserva pagada genera factura; el daño reportado alimenta el plan de mantenimiento.
5. **Configurable por nosotros.** La parametrización inicial la hace el equipo de MiConjunto (rol SuperAdmin) para que el conjunto opere desde el día uno. Existe un **asistente de apertura** que carga propietarios, coeficientes y cuotas vigentes desde Excel/CSV.
6. **Cumplimiento colombiano:** Ley 675 de 2001 (propiedad horizontal), Ley 1581 de 2012 (habeas data), Ley 2300 de 2023 (cobranza), normativa PQRS, DIAN (IVA y facturación electrónica sobre alquiler de zonas comunes).

---

## 2. Stack técnico y estructura

Usa exactamente este stack (no introduzcas alternativas):

| Capa | Tecnología |
|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript estricto**, React Server Components donde aplique |
| UI | **Tailwind CSS + shadcn/ui** (componentes accesibles), iconos `lucide-react`, gráficos `recharts` |
| PWA | `next-pwa` o `@serwist/next`: manifest, service worker, caché de assets, cola offline para portería |
| ORM / BD | **Prisma** sobre **PostgreSQL 16**. Migraciones versionadas en `prisma/migrations` |
| Auth | **Auth.js (NextAuth v5)**: credenciales (email + contraseña), enlace mágico por email, OTP por SMS/WhatsApp opcional. Sesiones JWT con `conjunto_id`, `rol` y `permisos` |
| Validación | `zod` en formularios y en toda API |
| Jobs / colas | **pg-boss** (usa la misma BD; sin Redis). Recordatorios, correos masivos, generación de cuotas, intereses de mora, backups |
| Email | `nodemailer` vía SMTP configurable (Gmail/Outlook/Resend/SES). Plantillas con `react-email` |
| Push | `web-push` (VAPID). Notificaciones en app, push, email y WhatsApp (opcional, vía proveedor con API tipo Twilio/360dialog, abstraído en `lib/whatsapp`) |
| Archivos | Local `./storage` en desarrollo; adaptador S3-compatible (AWS S3 / Cloudflare R2 / MinIO) en producción. Interfaz única `lib/storage.ts` |
| PDF | `@react-pdf/renderer` para certificados, estados de cuenta, actas y reportes |
| Excel | `exceljs` para importaciones y exportaciones |
| QR | `qrcode` (generación) y `html5-qrcode` (lectura desde cámara del teléfono) |
| Tiempo real | Server-Sent Events (`/api/events`) para portería, tickets y notificaciones; fallback a polling |
| Tests | `vitest` (unitarios y servicios) + `playwright` (E2E de flujos críticos en viewport móvil) |
| Calidad | ESLint, Prettier, Husky pre-commit (`lint`, `typecheck`, `test`) |
| Despliegue | `Dockerfile` + `docker-compose.yml` (app + postgres) y guía para EC2/VPS con Nginx + PM2 |

Estructura de carpetas:

```
miconjunto/
├── app/                      # rutas Next.js (App Router)
│   ├── (auth)/               # login, registro por invitación, recuperar clave
│   ├── (app)/                # área autenticada (layout con navegación móvil)
│   │   ├── inicio/
│   │   ├── residentes/ ... (un directorio por módulo)
│   ├── (porteria)/           # UI de portería en modo kiosco / tablet
│   ├── (superadmin)/         # panel MiConjunto: tenants, planes, parametrización
│   ├── pagar/[token]/        # pasarela pública (sin login) para pagar desde el correo
│   ├── verificar/[codigo]/   # verificación pública de certificados y QR
│   └── api/                  # route handlers REST + webhooks
├── components/               # UI compartida (shadcn + propios)
├── lib/                      # dominio: servicios, permisos, integraciones
│   ├── auth/  db/  permisos/  cartera/  pagos/  facturacion/  notificaciones/  storage/  ...
├── prisma/                   # schema.prisma, migrations, seed.ts
├── jobs/                     # workers pg-boss
├── emails/                   # plantillas react-email
├── docs/
├── tests/
└── scripts/                  # importadores, utilidades
```

Convenciones: código en inglés (identificadores), UI y documentación en español. Cada módulo expone un servicio en `lib/<modulo>/service.ts` con funciones puras testeables; las rutas y Server Actions solo validan, autorizan y delegan.

---

## 3. Multi-tenancy, roles y permisos

### 3.1 Tenant

`Conjunto` es el tenant. Un `Usuario` puede pertenecer a varios conjuntos (p. ej., un administrador que gestiona tres) con un rol distinto en cada uno (`MembresiaConjunto`). Al iniciar sesión, si tiene más de uno, elige el activo; se guarda en la sesión.

Toda tabla de negocio tiene `conjunto_id` indexado. Implementa un helper `withTenant(prisma, conjuntoId)` (Prisma client extension) que inyecta el filtro automáticamente y falla si falta. Los archivos se guardan en `storage/<conjunto_id>/...`.

### 3.2 Roles base (predefinidos, no eliminables)

| Rol | Descripción |
|---|---|
| `SUPERADMIN` | Equipo MiConjunto. Crea conjuntos, planes, parametriza, soporte. Ve todos los tenants. |
| `ADMINISTRADOR` | Administrador de la copropiedad. Acceso total dentro de su conjunto. |
| `CONSEJO` | Miembros del consejo de administración. Lectura amplia, aprobaciones, actas, votaciones. |
| `REVISOR_FISCAL` | Solo lectura de cartera, pagos, facturación, actas. |
| `CONTADOR` | Cartera, pagos, facturación, exportaciones contables. |
| `ASISTENTE_ADMIN` | Operativo: residentes, PQRS, reservas, comunicaciones, sin borrar ni configurar. |
| `PORTERIA` | Bitácora, visitantes, paquetería, vehículos, directorio de residentes (datos mínimos), alertas. |
| `MANTENIMIENTO` | Tickets asignados, plan de mantenimiento, activos. |
| `PROPIETARIO` | Dueño de una o varias unidades. Estado de cuenta, pagos, paz y salvo, votaciones, PQRS, reservas, familia, vehículos, mascotas. |
| `RESIDENTE` | Arrendatario u ocupante. Igual que propietario **sin** información financiera de la unidad ni voto en asamblea (salvo poder). |
| `CONVIVIENTE` | Miembro del grupo familiar con acceso limitado (muro, reservas, visitantes, paquetería). |
| `PROVEEDOR` | Acceso externo mínimo: ver órdenes de trabajo asignadas y adjuntar evidencia. |

### 3.3 Permisos granulares y configurables

Cada módulo define acciones (`ver`, `crear`, `editar`, `eliminar`, `aprobar`, `exportar`, más las específicas). Tabla `Permiso` (catálogo) × `RolPermiso` (por conjunto). El **administrador** puede, desde *Configuración → Roles*, activar o desactivar cada permiso por rol y crear roles personalizados (copiando uno base). Además puede definir **qué campos y secciones ve cada rol** (p. ej., que residentes no vean la lista de morosos, que portería no vea teléfonos personales, que el consejo vea cartera pero no edite).

Implementación: `lib/permisos/can(user, 'modulo.accion', recurso?)`. Toda ruta, Server Action y componente sensible lo usa. Nunca confíes solo en ocultar botones.

Regla de visibilidad por defecto para residentes/propietarios: solo ven **sus** unidades, **sus** tickets, **sus** reservas, **sus** visitantes, **sus** paquetes y **su** estado de cuenta. Nunca datos de otros vecinos salvo el directorio opt-in.

---

## 4. Modelo de datos (Prisma)

Diseña el `schema.prisma` con, como mínimo, estas entidades. Todas con `id` (cuid), `createdAt`, `updatedAt`, `deletedAt` (borrado lógico) y `conjuntoId` cuando aplique. Usa enums para estados.

### 4.1 Núcleo y estructura física

- **Conjunto**: nombre, NIT, dígito de verificación, dirección, municipio (código DIVIPOLA), ciudad, teléfono, email, logo, régimen tributario, responsabilidad IVA (sí/no), tipo (`EDIFICIO`, `CONJUNTO_CASAS`, `MIXTO`), número de matrícula inmobiliaria de la PH, personería jurídica, fecha de inicio de operación, plan (`PlanSuscripcion`), estado, configuración JSON (ver 4.9).
- **Torre/Bloque** (`Torre`): nombre, número de pisos, ascensores (bool), notas.
- **Unidad** (`Unidad`): torre (opcional para casas), número/identificador ("T2-501", "Casa 14"), tipo (`APARTAMENTO`, `CASA`, `LOCAL`, `OFICINA`, `DEPOSITO`, `PARQUEADERO`), piso, área privada m², área construida m², **coeficiente de copropiedad** (decimal 6 decimales), matrícula inmobiliaria, número catastral, estrato, número de habitaciones, baños, balcón/terraza, estado de ocupación (`PROPIETARIO_OCUPA`, `ARRENDADA`, `AIRBNB_O_SIMILAR`, `DESOCUPADA`, `EN_VENTA`), plataforma de renta corta (Airbnb, Booking, otra) y registro RNT si aplica, cuota de administración vigente, notas de estructura (acabados, medidores de agua/luz/gas con número, cuarto técnico, etc.), banderas: `tienePersonaMovilidadReducida`, `requiereAsistenciaEvacuacion`.
- **Parqueadero**: código, tipo (`PRIVADO`, `COMUN`, `VISITANTES`, `MOTO`, `BICICLETA`, `DISCAPACIDAD`), ubicación (sótano/nivel), asignado a unidad (FK opcional), estado, tarifa por hora/día si es de visitantes (parametrizable), notas.
- **Bodega/Depósito**: código, ubicación, área, asignada a unidad, estado.
- **ZonaComun**: nombre, tipo libre (texto) + categoría sugerida (`SALON`, `PISCINA`, `GIMNASIO`, `BBQ`, `CANCHA`, `JUEGOS`, `TERRAZA`, `SALA_JUNTAS`, `COWORKING`, `OTRA`), descripción, fotos, capacidad, horario de operación por día de la semana, **reservable** (bool), requiere aprobación (bool), **tarifa** (0 = incluida en la cuota), depósito/garantía, duración mínima/máxima, anticipación mínima y máxima, máximo de reservas por unidad por mes, reglas de uso (texto), bloqueo por mora (bool), **grava IVA** (bool, tarifa) y **genera factura electrónica** (bool), estado. Se pueden crear **ilimitadas** zonas.

### 4.2 Personas

- **Usuario**: email, teléfono, hash de contraseña, nombre, foto, estado, último acceso, preferencias de notificación (canales), aceptación de política de datos (fecha, versión), MFA opcional.
- **Persona**: datos de cualquier persona vinculada a una unidad, tenga o no cuenta. Tipo de documento (CC, CE, TI, RC, PA, NIT, PEP, PPT), número, nombres, apellidos, fecha de nacimiento (→ calcula menor de edad / adulto mayor), género (opcional), foto, teléfono, email, EPS, contacto de emergencia, ocupación (opcional), **condición de movilidad reducida / discapacidad** (bool + descripción, visible solo a admin/portería para emergencias), tipo de sangre (opcional), observaciones.
- **VinculoUnidad**: persona ↔ unidad con rol (`PROPIETARIO`, `COPROPIETARIO`, `ARRENDATARIO`, `RESIDENTE`, `FAMILIAR`, `EMPLEADO_DOMESTICO`, `CUIDADOR`, `VISITANTE_FRECUENTE`, `AUTORIZADO_RECOGER_PAQUETES`, `AUTORIZADO_MENORES`), porcentaje de propiedad (para copropietarios), fecha inicio/fin, principal (bool), días/horarios permitidos (para empleados y visitantes frecuentes), estado.
- **Vehiculo**: unidad, placa (única por conjunto), tipo (`CARRO`, `MOTO`, `BICICLETA`, `OTRO`), marca, modelo, color, foto, tarjeta de propiedad (adjunto), SOAT vence, tecnomecánica vence, parqueadero asignado, activo.
- **Mascota**: unidad, nombre, especie, raza, color, foto, carné de vacunas (adjunto), vacuna antirrábica vence, potencialmente peligrosa (bool, según Ley 746/2002), póliza (adjunto), microchip, activo.

### 4.3 Cartera y recaudo

- **ConceptoCobro**: nombre, tipo (`ADMINISTRACION`, `EXTRAORDINARIA`, `MULTA`, `INTERES_MORA`, `ALQUILER_ZONA`, `PARQUEADERO`, `SERVICIO`, `OTRO`), cuenta contable (texto), grava IVA, factura electrónica, activo.
- **Cuota** (documento de cobro por unidad y periodo): unidad, concepto, periodo (YYYY-MM), fecha de emisión, fecha de vencimiento, fecha límite pronto pago y % descuento, valor base, descuento, interés, saldo, estado (`PENDIENTE`, `PARCIAL`, `PAGADA`, `ANULADA`, `EN_ACUERDO`), referencia de pago única, origen (`GENERACION_MENSUAL`, `MANUAL`, `RESERVA`, `MULTA`, `ASAMBLEA`).
- **CuotaExtraordinaria**: nombre, motivo, acta que la aprobó (FK), valor total, forma de distribución (`POR_COEFICIENTE`, `IGUAL_POR_UNIDAD`, `MANUAL`), número de cuotas, fechas; genera `Cuota` por unidad.
- **Multa**: unidad, persona (opcional), tipo (catálogo de infracciones al reglamento), descripción, evidencia (fotos), valor, fecha, estado (`PROPUESTA`, `NOTIFICADA`, `EN_DESCARGOS`, `RATIFICADA`, `REVOCADA`, `PAGADA`), descargos del residente, resolución del consejo. Genera `Cuota` al ratificarse. Incluye el **debido proceso** (Ley 675 art. 59: notificación, descargos, decisión del consejo).
- **Pago**: unidad, valor, fecha, medio (`PSE`, `TARJETA`, `NEQUI`, `BANCOLOMBIA_QR`, `EFECTIVO`, `TRANSFERENCIA`, `CONSIGNACION`, `PASARELA`), pasarela (`WOMPI`, `MERCADOPAGO`, `NINGUNA`), referencia externa, estado (`PENDIENTE`, `APROBADO`, `RECHAZADO`, `ANULADO`), comprobante (adjunto), registrado por, conciliado (bool).
- **AplicacionPago**: pago ↔ cuota, valor aplicado. Orden de aplicación configurable (por defecto: intereses → cuotas más antiguas → actuales, según Ley 675 art. 30 y práctica contable).
- **AcuerdoPago**: unidad, saldo, número de cuotas, valor, fechas, estado, documento firmado.
- **MovimientoCartera**: libro auxiliar inmutable (débito/crédito) por unidad para el estado de cuenta.
- **CertificadoPazYSalvo**: unidad, persona solicitante, fecha, vigencia, código de verificación, PDF, estado, emitido por.
- **CuentaBancaria** del conjunto (para convenios de recaudo y conciliación).
- **ConciliacionBancaria**: carga de extracto (CSV/Excel), emparejamiento automático por referencia/valor/fecha, pendientes por identificar.

### 4.4 Reservas y zonas comunes

- **Reserva**: zona, unidad, persona, fecha, hora inicio/fin, número de asistentes, motivo, estado (`SOLICITADA`, `APROBADA`, `RECHAZADA`, `CANCELADA`, `CUMPLIDA`, `NO_SHOW`), valor, depósito, cuota generada (FK), pago (FK), check-in/check-out por portería, acta de entrega/recepción (checklist + fotos), calificación del residente. **Cada zona tiene su propio calendario**; el sistema impide traslapes y bloquea fechas (`BloqueoZona`: mantenimiento, eventos del conjunto, festivos).
- **ReglaReserva** (opcional): permite reglas extra por zona (p. ej., solo fines de semana, un turno por día).

### 4.5 Portería, visitantes y paquetería

- **Visitante**: documento, nombre, foto, teléfono, empresa (si es proveedor/domiciliario), tipo (`VISITA`, `DOMICILIO`, `PROVEEDOR`, `TECNICO`, `TRANSPORTE`, `OTRO`), lista negra (bool + motivo), historial.
- **AutorizacionIngreso**: creada por el residente desde su teléfono: visitante (o nombre libre), unidad, fecha/rango, recurrente (días de la semana), placa, **código QR / código corto de 6 dígitos**, estado, usos permitidos.
- **RegistroAcceso** (bitácora): tipo (`INGRESO`, `SALIDA`), quién (visitante / residente / empleado / vehículo / proveedor), unidad destino, autorización usada (FK), medio (`QR`, `CODIGO`, `LLAMADA_RESIDENTE`, `LISTA_FRECUENTES`, `MANUAL`), placa, parqueadero de visitantes asignado, hora, portero que registra, foto opcional, observaciones, `ingresoId` para vincular salida con ingreso. **Inmutable**: correcciones se hacen con un registro de anulación que referencia al original.
- **TurnoPorteria**: apertura/cierre de turno, portero, novedades, entrega de llaves y elementos (checklist), firma.
- **Minuta / Novedad**: eventos de portería (ruido, daño, emergencia, incidente) con severidad, fotos, notificación al administrador.
- **Paquete**: unidad, destinatario, transportadora, tipo (`SOBRE`, `CAJA`, `MERCADO`, `DOMICILIO`, `OTRO`), foto, fecha de llegada, portero que recibe, estado (`EN_PORTERIA`, `ENTREGADO`, `DEVUELTO`), fecha de entrega, quién recogió (persona autorizada), firma o foto de entrega, notificación enviada (push + email + WhatsApp).
- **LlaveOElemento**: control de préstamo de llaves, controles de parqueadero, tarjetas de acceso.

### 4.6 Comunicaciones y comunidad

- **Publicacion** (muro): autor, título, contenido enriquecido (editor tipo bloques: texto, imágenes, video embebido, adjuntos, encuesta enlazada), categoría (`AVISO`, `NOTICIA`, `EVENTO`, `EMERGENCIA`, `CLASIFICADO`, `PERDIDO_ENCONTRADO`), audiencia (segmentación), fijada, permite comentarios, vence, reacciones y comentarios (moderables).
- **Segmento**: filtro reutilizable de destinatarios: por torre, piso, rango de apartamentos, unidades específicas, rol, estado de cartera (al día / en mora), tipo de ocupación, con mascotas, con vehículos, con menores, adultos mayores, movilidad reducida, etc. Guarda la definición como JSON y calcula destinatarios en tiempo real.
- **CampanaCorreo**: asunto, plantilla (editor con variables `{{nombre}}`, `{{unidad}}`, `{{saldo}}`, `{{link_pago}}`), segmento, adjuntos, programación, estado, métricas (enviados, rebotes, aperturas si SMTP lo permite, clics al link de pago). Tipo especial **"Cobro de administración"** que adjunta el estado de cuenta PDF y el link de pago único por unidad.
- **Notificacion**: usuario, título, cuerpo, tipo, enlace interno, canales enviados, leída.
- **Encuesta**: título, descripción, preguntas (opción única, múltiple, escala, texto), audiencia, anónima (bool), fechas, resultados en tiempo real.
- **Documento**: gestión documental del conjunto: reglamento de propiedad horizontal, manual de convivencia, actas, presupuestos, estados financieros, pólizas, contratos, circulares. Carpetas, versionado, visibilidad por rol.
- **Directorio de residentes** (opt-in): cada persona decide qué comparte (nombre, unidad, teléfono, WhatsApp, oficio/servicios que ofrece).
- **Eventos / Calendario del conjunto**: eventos comunitarios, asambleas, mantenimientos programados, fumigaciones, cortes de servicios; se cruzan con el calendario de reservas.

### 4.7 PQRS, tickets, convivencia

- **Ticket** (unifica reportes de daños y PQRS): tipo (`PETICION`, `QUEJA`, `RECLAMO`, `SUGERENCIA`, `FELICITACION`, `DAÑO_ZONA_COMUN`, `DAÑO_UNIDAD`, `SEGURIDAD`, `RUIDO`, `MASCOTAS`, `OTRO`), unidad, solicitante, zona/activo afectado (FK), descripción, fotos/video, ubicación, prioridad, estado (`ABIERTO`, `EN_REVISION`, `ASIGNADO`, `EN_PROCESO`, `EN_ESPERA_RESIDENTE`, `RESUELTO`, `CERRADO`, `REABIERTO`), asignado a (usuario o proveedor), SLA (fecha límite calculada según tipo: petición 15 días hábiles, queja/reclamo 15, sugerencia 15, daños según prioridad), historial de comentarios (internos y públicos), calificación al cierre, número de radicado consecutivo por año.
- **LlamadoAtencion**: unidad, persona, motivo (catálogo), descripción, evidencia, gravedad, enviado por (admin/consejo), fecha, acuse de recibo del residente, respuesta/descargos, puede escalar a **Multa**. Digital, sin confrontación.
- **Incidente de convivencia**: registro de conflictos entre unidades, mediación, acuerdos.

### 4.8 Gobierno, asambleas, activos, proveedores

- **Asamblea**: tipo (`ORDINARIA`, `EXTRAORDINARIA`), modalidad (`PRESENCIAL`, `VIRTUAL`, `MIXTA`), fecha, lugar/enlace, convocatoria (documento, fecha de envío — validar antelación mínima de 15 días calendario para ordinaria, Ley 675 art. 39), orden del día, quórum requerido, **registro de asistencia con coeficientes**, **poderes** (representación con documento adjunto, límite configurable), votaciones (por coeficiente o por unidad según el punto), actas (editor + PDF + firma del presidente y secretario), estado.
- **Votacion**: asociada o no a una asamblea. Pregunta, opciones, tipo de mayoría (`SIMPLE`, `CALIFICADA_70`, `UNANIME`), ponderación (`COEFICIENTE`, `UNIDAD`), quién puede votar (propietarios al día / todos), fechas, voto secreto o nominal, resultado en tiempo real con % de coeficiente, acta de resultados.
- **Consejo**: miembros vigentes, cargos (presidente, secretario, vocal), periodo, reuniones y actas.
- **Activo**: nombre, categoría (ascensor, planta eléctrica, motobomba, piscina, CCTV, portón, extintores, cámaras, gimnasio, etc.), ubicación, marca/modelo/serie, fecha de compra, valor, vida útil, proveedor de mantenimiento, garantía vence, fotos, manuales, código QR para etiquetar, estado.
- **PlanMantenimiento**: activo, tipo (`PREVENTIVO`, `CORRECTIVO`, `LEGAL` como certificación de ascensores, recarga de extintores, análisis de agua de piscina), frecuencia, próxima fecha, responsable/proveedor, checklist, costo estimado. Genera **OrdenTrabajo** automáticamente y recordatorios.
- **OrdenTrabajo**: origen (plan o ticket), activo/zona, proveedor, fechas, costo, evidencia, cierre.
- **Proveedor**: NIT, razón social, categoría (plomería, electricidad, aseo, vigilancia, ascensores, jardinería, etc.), contactos, documentos (RUT, cámara de comercio, pólizas, seguridad social), calificación promedio, tarifas publicadas, visible en el **directorio comunitario** (bool) para que los residentes lo contraten con precios preferenciales; los residentes pueden calificar y comentar.
- **Presupuesto** anual: rubros de ingresos y gastos, ejecución vs. presupuesto (los gastos se registran manualmente o vía órdenes de trabajo; no es un sistema contable completo, pero exporta a CSV/Excel para Siigo, World Office, Alegra, Helisa).
- **Contrato**: proveedor, objeto, valor, inicio/fin, renovación, alertas de vencimiento.
- **Empleado del conjunto** (básico, sin nómina): nombre, cargo, turno, documentos, EPS/ARL vence, foto para portería.

### 4.9 Configuración (JSON en `Conjunto.config` + tablas de parámetros)

Día de generación de cuotas, día de vencimiento, % descuento pronto pago y día límite, tasa de interés de mora (por defecto la máxima legal: 1,5 veces el interés bancario corriente certificado por la Superfinanciera — el admin la actualiza mensualmente; el sistema muestra la vigente y avisa cuando cambia), orden de aplicación de pagos, política de bloqueo por mora (reservas, paz y salvo, votación), horarios de portería, tiempo máximo de paquete en portería, plantillas de correo, logo y colores del conjunto, canales de notificación habilitados, credenciales de pasarelas y Factus, responsable de datos personales y política de tratamiento (texto que acepta cada usuario).

### 4.10 Transversales

- **Auditoria**: quién, qué, cuándo, IP, antes/después (JSON) para toda operación de escritura sensible.
- **Adjunto**: archivo genérico polimórfico (entidad, id, url, tipo MIME, tamaño, subido por).
- **PlanSuscripcion** y **Suscripcion** (SaaS): límites por unidades, módulos activos, precio, estado, facturación de MiConjunto al conjunto.
- **ImportacionApertura**: log de cargas iniciales con errores por fila.

---

## 5. Módulos funcionales (requisitos detallados)

Cada módulo debe tener: lista con búsqueda y filtros, detalle, crear/editar en formularios cortos por pasos cuando haya muchos campos (con guardado de borrador), acciones rápidas desde el teléfono, exportación a Excel/PDF y sus indicadores en Estadísticas.

### 5.1 Inicio (dashboard por rol)

- **Residente/Propietario:** saldo actual y botón **Pagar** (1 toque), próximos vencimientos, paquetes en portería, visitantes de hoy, reservas próximas, tickets abiertos, últimas publicaciones del muro, encuestas/votaciones pendientes, accesos rápidos: *Autorizar visitante*, *Reportar daño*, *Reservar*, *PQRS*, *Paz y salvo*.
- **Administrador:** recaudo del mes vs. esperado, % de mora y top morosos, tickets por estado y vencidos de SLA, reservas del día, paquetes sin reclamar > N días, mantenimientos vencidos, alertas (SOAT/vacunas/pólizas/contratos por vencer), asambleas y votaciones activas, novedades de portería del día.
- **Portería:** pantalla de trabajo (5.7) directamente.
- **Consejo:** cartera resumida, PQRS críticos, aprobaciones pendientes (multas, reservas, gastos), votaciones.

### 5.2 Conjunto y estructura física

CRUD de torres, unidades, parqueaderos, bodegas y zonas comunes. Vista de **plano lógico**: torre → pisos → unidades como cuadrícula tocable con color por estado (al día / mora / arrendada / Airbnb / desocupada / movilidad reducida). Importación masiva desde Excel. Historial de cambios de coeficiente. Validación: la suma de coeficientes debe ser 100 % (alerta si no).

Datos de la unidad visibles para el residente: su ficha física (área, medidores, parqueaderos, bodega). Solo el admin edita coeficientes y cuotas.

### 5.3 Residentes, familia y ocupantes

Panel de ingreso de información del propietario **guiado por pasos** (cada paso guardable): 1) propietario y documento, 2) unidad(es) y tipo de vínculo, 3) grupo familiar y ocupantes (con foto desde la cámara del teléfono), 4) empleados y visitantes frecuentes con horarios, 5) vehículos, 6) mascotas, 7) información de emergencia (movilidad reducida, condiciones que requieran evacuación asistida, contacto de emergencia), 8) autorizaciones (quién puede recoger paquetes, quién puede recoger menores), 9) aceptación de política de datos.

El propietario puede **invitar** por email/WhatsApp a sus residentes y familiares para que creen su cuenta (enlace con token). El administrador aprueba vínculos de arrendatarios cuando el propietario los registra o cuando el arrendatario se autorregistra (flujo de verificación).

Indicadores automáticos: total de personas, menores de edad, adultos mayores (≥ 60), personas con movilidad reducida por torre/piso (para planes de emergencia), unidades arrendadas y en renta corta, mascotas por especie, vehículos por tipo.

Cumplimiento habeas data: consentimiento registrado, derecho de consulta/actualización/supresión por el titular desde su perfil, campo "finalidad" en la política, exportación de sus datos en JSON.

### 5.4 Cartera, cuotas y estado de cuenta

- **Generación mensual automática** (job) de cuotas de administración por unidad según cuota vigente (por coeficiente o valor fijo). Descuento por pronto pago y **cálculo diario de intereses de mora** con la tasa parametrizada; los intereses se liquidan como concepto separado.
- **Cuotas extraordinarias** aprobadas en asamblea, distribuidas por coeficiente y fraccionadas.
- **Multas** con debido proceso (5.9).
- **Estado de cuenta** por unidad: movimientos, saldos por concepto, edad de la mora (30/60/90/+120), PDF descargable, envío por correo y link de pago. El propietario lo ve en su inicio; el arrendatario solo si el propietario lo autoriza.
- **Registro de pagos** manual (efectivo, transferencia con comprobante) con aplicación automática y posibilidad de aplicar manualmente. Recibo de caja PDF con consecutivo.
- **Cartera** (vista admin): aging, top morosos, proyección de recaudo, filtros por torre, exportación, generación masiva de cartas de cobro (prejurídico) con plantillas, registro de gestiones de cobro (llamada, correo, visita) respetando **Ley 2300 de 2023**: contacto solo lunes a viernes 7:00–19:00 y sábados 8:00–15:00, máximo un contacto por semana por canal; el sistema bloquea envíos fuera de horario y registra cada gestión.
- **Acuerdos de pago** con cuotas y seguimiento.
- **Paz y salvo**: el residente lo solicita; si la unidad está al día se emite automático en PDF con código QR verificable en `/verificar/[codigo]`; si no, muestra el saldo y el botón de pago. El admin puede emitir manualmente con observaciones. Vigencia configurable (por defecto 30 días).
- **Conciliación bancaria** (4.3).
- **Presupuesto y ejecución** (4.8) con exportación contable.

### 5.5 Pagos en línea (pasarelas)

Abstracción `lib/pagos/PaymentProvider` con implementaciones **Wompi** (prioridad: PSE, tarjetas, Nequi, Bancolombia QR/botón) y **Mercado Pago** (PSE, tarjetas). Cada conjunto configura sus llaves (pública/privada, secreto de eventos) en *Configuración → Pagos*; el SuperAdmin puede tener llaves globales con split si el plan lo contempla.

Flujo: el residente toca **Pagar** → elige cuotas (o paga el saldo total, o abona un valor) → se crea `Pago` en `PENDIENTE` con referencia única → redirección al checkout de la pasarela → **webhook** (`/api/webhooks/wompi`, `/api/webhooks/mercadopago`) verifica firma, marca `APROBADO`, aplica el pago, genera recibo y notifica. Página de retorno consulta el estado. Reintentos idempotentes por referencia. Página pública `/pagar/[token]` accesible desde el correo de cobro sin iniciar sesión (muestra unidad, saldo y botón).

PSE por convenio bancario directo: deja el proveedor `ConvenioBancario` como stub documentado (el recaudo llega por conciliación de extracto con la referencia de pago impresa en el estado de cuenta, código de barras / referencia numérica).

### 5.6 Zonas comunes y reservas

- Calendario **por zona** (vista día/semana/mes optimizada para móvil) con disponibilidad, bloqueos y reservas propias/ajenas (las ajenas se muestran solo como "ocupado").
- Flujo residente: elige zona → ve reglas y tarifa → elige fecha/franja → confirma → si requiere pago, paga (5.5) → queda `APROBADA` o `SOLICITADA` según configuración. Cancelación con política de reembolso configurable.
- Bloqueo si la unidad está en mora (configurable por zona).
- Portería hace **check-in/check-out** y **acta de entrega** con checklist y fotos; daños detectados crean ticket y opcional multa.
- **Alquiler con IVA y factura electrónica:** si la zona tiene tarifa y `gravaIVA`, el sistema calcula el IVA (19 % por defecto) y, si `generaFactura`, emite factura electrónica vía Factus (5.13) al confirmar el pago. Si la zona está incluida en la cuota de administración (tarifa 0), no hay IVA ni factura. Reporte mensual de ingresos por alquiler con base gravable e IVA generado para el contador.
- Parqueaderos de visitantes: asignación desde portería, control de tiempo, tarifa opcional, cobro a la unidad visitada o al visitante.

### 5.7 Portería y bitácora

UI en modo kiosco/tablet y en teléfono, con botones grandes y alto contraste, tema oscuro para turnos nocturnos:

- **Barra superior fija:** buscador universal (unidad, nombre, placa, documento, código de autorización) con resultados al instante; escáner QR.
- **Acciones grandes:** *Ingreso visitante*, *Salida*, *Recibir paquete*, *Entregar paquete*, *Vehículo*, *Novedad*, *Emergencia*.
- **Ingreso visitante en ≤ 3 toques:** escanea QR o escribe código → confirma → foto opcional → registrado y el residente recibe push "Tu visitante X ingresó". Sin autorización previa: busca unidad → "Llamar/Notificar al residente" (push con botones **Autorizar / Rechazar** que responden en tiempo real vía SSE; si no responde en N minutos el portero registra la decisión telefónica).
- **Lista de frecuentes** de la unidad (empleados, familiares, cuidadores) con foto y horario permitido: ingreso con un toque; alerta si está fuera de horario o si el vínculo está inactivo.
- **Lista negra** y personas con orden de no ingreso (con motivo visible solo a portería/admin).
- **Registro de salida** vincula con el ingreso; muestra visitantes "adentro" y tiempo de permanencia; alerta de visitantes con más de X horas.
- **Bitácora / minuta** cronológica del turno, filtrable, exportable; apertura y cierre de turno con checklist de elementos (llaves, radios, controles) y firma en pantalla.
- **Paquetería:** recibir con foto del paquete y de la guía (lectura de guía por cámara si es posible), selección de unidad; notificación inmediata; entrega solo a personas autorizadas de esa unidad (muestra fotos), con firma o foto de entrega; reporte diario de paquetes en portería y alertas por paquetes con más de N días.
- **Modo offline:** el service worker guarda registros en IndexedDB y los sincroniza al recuperar conexión; muestra un indicador claro de "sin conexión / pendientes por sincronizar".
- **Emergencia:** botón que notifica a administrador, consejo y (configurable) a todos los residentes, con plantilla; muestra lista de unidades con personas con movilidad reducida para evacuación.

### 5.8 PQRS y tickets de daños

Estilo mesa de ayuda. El residente crea un ticket en 3 pasos: tipo → descripción + fotos (cámara) → enviar. Recibe radicado y seguimiento con línea de tiempo. El admin tiene tablero Kanban (móvil: lista por estado con swipe), asigna a mantenimiento o proveedor, define prioridad, comenta (interno/público), adjunta evidencia de solución, cierra; el residente califica. Alertas de SLA vencido. Plantillas de respuesta. Los daños en zonas comunes o activos se enlazan al activo y pueden generar orden de trabajo. Estadísticas por tipo, tiempo de resolución, satisfacción.

### 5.9 Convivencia: llamados de atención y multas

Flujo digital y respetuoso: admin/consejo crea llamado de atención con evidencia → el residente recibe notificación y lo lee (acuse) → puede responder/descargar → si procede, el consejo decide → si se convierte en multa, se notifica con el valor y se carga a cartera solo cuando queda `RATIFICADA`. Historial por unidad. Catálogo de infracciones y tarifas editable según el manual de convivencia del conjunto. Nada de esto es visible para otros residentes.

### 5.10 Muro, intranet, comunicaciones y correo masivo

- Muro con publicaciones por categoría, fijadas, con reacciones y comentarios moderables; audiencia por segmento.
- Correo masivo por **segmentación** (4.6): torre, piso, apartamentos específicos, al día/en mora, con mascotas, etc. Vista previa del número de destinatarios. Programación. Cola con reintentos y límite de envío por minuto. Campaña "Cobro de administración" mensual automática con estado de cuenta y link de pago.
- Notificaciones multicanal con preferencias por usuario. Centro de notificaciones en la app.
- Recordatorios automáticos (jobs): cuotas por vencer (5 y 1 día antes), en mora (día 1, 15, 30), reservas (24 h antes), paquetes sin recoger, asambleas, votaciones por cerrar, vencimiento de SOAT/vacunas/pólizas/contratos/mantenimientos.
- Gestión documental con visibilidad por rol y acuse de lectura opcional (p. ej., reglamento actualizado).
- Calendario del conjunto.
- Directorio de residentes opt-in y **directorio de proveedores** con calificaciones y precios para la comunidad.
- Canal opcional de WhatsApp saliente (abstraído; si no hay credenciales, se omite sin error).

### 5.11 Encuestas y votaciones electrónicas

Encuestas rápidas (resultados en vivo) y **votaciones con validez** (ponderación por coeficiente, verificación de propietario al día si el conjunto lo exige, un voto por unidad con poder registrado, voto secreto con comprobante hash, cierre automático, acta PDF con resultados y participación por coeficiente). Integradas a asambleas.

### 5.12 Asambleas

Convocatoria (con validación de antelación), orden del día, envío masivo, **registro de asistencia por QR o desde la app** con cálculo de quórum en vivo (suma de coeficientes presentes y representados), gestión de poderes, votación punto por punto (5.11), redacción del acta con plantilla, firma y publicación en documentos, seguimiento de compromisos. Modalidad virtual/mixta: enlace de videoconferencia externo (Zoom/Meet) y la votación se hace en la app.

### 5.13 Facturación electrónica (Factus) — solo cuando aplica

Contexto normativo (DIAN, 2025): cuando la copropiedad cobra de forma independiente por el alquiler de parqueaderos, salones, piscina, gimnasio, BBQ u otras zonas comunes, presta un servicio gravado y debe cumplir obligaciones de IVA y facturación electrónica. Si el uso está incluido en la cuota de administración sin cobro separado, no aplica. Las cuotas de administración ordinarias y extraordinarias **no** se facturan electrónicamente (son expensas comunes, no venta de servicios); sí se emite recibo/cuenta de cobro.

Implementa `lib/facturacion/factus.ts`:

- Autenticación OAuth2 password grant: `POST https://api-sandbox.factus.com.co/oauth/token` (form-data: `grant_type=password`, `client_id`, `client_secret`, `username`, `password`) → `access_token` (dura 1 h) y `refresh_token` (`/oauth/token` con `grant_type=refresh_token`). Producción: `https://api.factus.com.co`. Cachea el token por tenant.
- Crear y validar factura: `POST /v2/bills/validate` con `reference_code` único (usa el id de la reserva/pago), `numbering_range_id` (configurable por conjunto), `payment_details` (`payment_form` 1 contado, `payment_method_code` según pasarela: 47 transferencia, 48 tarjeta crédito, 49 débito, 42 consignación, 10 efectivo; usa la tabla de referencia), `customer` (documento, nombre, email, municipio DIVIPOLA, `legal_organization_code` 2 persona natural, `tribute_code` ZZ, `responsibilities` R-99-PN), `items` (nombre de la zona, `quantity` 1, `price` base sin IVA, `unit_measure_code` 94, `standard_code` 999, `taxes` `[{code:"01", rate:"19.00"}]`).
- Guardar respuesta: `number`, `cufe`, `is_validated`, `validated_at`, `links.public_url`, `links.qr`, errores DIAN. Descargar PDF/XML (`GET /v2/bills/download-pdf/{number}`, `/download-xml/{number}`) y adjuntarlos al pago y enviarlos al residente. Notas crédito (`/v2/credit-notes/validate`) para cancelaciones con reembolso.
- Manejo de errores: reintentos con backoff, 409 factura pendiente → eliminar (`DELETE /v2/bills/destroy/reference/{reference_code}`) y reintentar; cola pg-boss para no bloquear el pago. Panel *Facturación* con listado, estados, reenvío de correo y descarga.
- Consulta las tablas de referencia oficiales en `https://developers.factus.com.co/tablas-de-referencia/tablas/` y municipios en `/tablas-de-referencia/municipios/`; cachea los códigos en BD.
- La documentación de Factus ofrece una *skill* para agentes de IA en `https://developers.factus.com.co/skills/facturas-crear-y-validar.md`: descárgala a `docs/integraciones/factus-skill.md` y úsala como referencia.

**Alanube** (alternativa/complemento): Alanube expone un servidor MCP (`https://sandbox-mcp.alanube.co/mcp/co`, header `Authorization: Bearer <token>`) con herramientas `issue_co_invoice`, `issue_co_credit_note`, validación de NIT y diagnóstico de rechazos DIAN (documentación: `https://developer.alanube.co/v1.0-COL/docs/e-providers-mcp`). Implementa la interfaz `ElectronicInvoiceProvider` con dos adaptadores: `FactusProvider` (por defecto, completo) y `AlanubeProvider` (REST v1.0-COL, estructura preparada con los mismos métodos, configurable por conjunto). Si tienes acceso al MCP de Alanube durante el desarrollo, úsalo para validar payloads de ejemplo; no lo uses en producción desde la app.

### 5.14 Activos, mantenimiento y proveedores

Inventario de activos con QR imprimible (al escanearlo en el teléfono abre la ficha y permite reportar falla). Plan de mantenimiento con calendario, generación automática de órdenes, checklist, evidencias, costos, historial por activo, alertas de vencimientos legales (certificación de ascensores, extintores, piscina, planta). Proveedores con documentos y vencimientos, calificación, contratos con alertas, y directorio comunitario con precios preferenciales.

### 5.15 Estadísticas (admin y usuarios)

Módulo `estadisticas` con filtros por rango de fechas, torre y comparación contra el periodo anterior, gráficos móviles (recharts) y exportación:

- **Cartera:** recaudo mensual vs. facturado, % mora, aging, evolución de cartera, recaudo por medio de pago, pronto pago aprovechado, intereses generados, efectividad de campañas de cobro, top morosos, proyección.
- **Reservas y zonas:** ocupación por zona, horas pico, ingresos por alquiler, IVA generado, cancelaciones, no-shows, calificaciones.
- **Portería:** ingresos/salidas por día y hora, visitantes por tipo, tiempo promedio de permanencia, domicilios, vehículos de visitantes, novedades por tipo, tiempo de respuesta de autorizaciones, turnos.
- **Paquetería:** paquetes por día, tiempo promedio en portería, por transportadora, sin reclamar.
- **PQRS/tickets:** por tipo, tiempo de resolución, cumplimiento de SLA, reabiertos, satisfacción, por zona/activo (activos que más fallan).
- **Comunidad:** personas por rango de edad, menores, adultos mayores, movilidad reducida, mascotas, vehículos, unidades arrendadas/Airbnb/desocupadas, participación en encuestas y votaciones, aperturas de correo, lectura de publicaciones.
- **Mantenimiento:** cumplimiento del plan, costos por activo, MTBF aproximado, proveedores por desempeño.
- **Convivencia:** llamados y multas por tipo, reincidencia, recaudo de multas.
- **Asambleas:** quórum histórico, participación por torre.

El usuario residente ve un panel personal: su historial de pagos, gasto en alquileres, visitantes recibidos, paquetes, tickets y tiempos de respuesta.

El administrador define, en *Configuración → Visibilidad*, qué indicadores agregados pueden ver los roles no administrativos (p. ej., mostrar % de mora del conjunto a todos, pero nunca nombres).

### 5.16 Panel SuperAdmin (MiConjunto)

Crear conjuntos, planes, activar módulos, impersonar (con auditoría) para soporte, **asistente de apertura**: 1) datos del conjunto, 2) torres/unidades desde Excel (plantilla descargable), 3) propietarios y coeficientes, 4) cuotas vigentes y saldos iniciales a la fecha de inicio (cartera de apertura por unidad), 5) zonas comunes, 6) parqueaderos y bodegas, 7) parámetros financieros, 8) usuarios iniciales e invitaciones masivas. Validación fila por fila con reporte de errores descargable. Monitoreo de jobs, salud de integraciones, uso por tenant.

---

## 6. Funcionalidades adicionales (agregadas por criterio propio, implementarlas)

1. **QR y código de invitado** con vigencia, usos y placa, compartible por WhatsApp desde la app; el visitante ni siquiera necesita instalar nada.
2. **Autorización en tiempo real** desde portería al residente (push con botones Autorizar/Rechazar).
3. **Modo offline** en portería con sincronización.
4. **Registro de asistencia a asambleas por QR** y quórum en vivo.
5. **Etiquetas QR para activos** que abren la ficha y permiten reportar fallas.
6. **Verificación pública de certificados** (paz y salvo, actas) por código/QR.
7. **Página pública del conjunto** (opcional por tenant): información general, contacto de administración, formulario PQRS para no residentes.
8. **Marketplace/clasificados** vecinales moderados (venta, servicios, cuidado de mascotas, tutorías) para fortalecer comunidad.
9. **Plan de emergencia y evacuación**: mapa por torre/piso de personas que requieren asistencia, brigadistas, puntos de encuentro, simulacros registrados; botón de pánico en la app del residente que alerta a portería con su unidad.
10. **Gestión de llaves y elementos** en portería.
11. **Objetos perdidos y encontrados**.
12. **Control de empleados domésticos/contratistas** con horarios y documentos (seguridad social vigente para contratistas de obra en unidades: el residente sube el soporte antes de que portería permita el ingreso, configurable).
13. **Obras y remodelaciones en unidades**: solicitud, aprobación, horario permitido, contratistas autorizados, depósito, cierre.
14. **Mudanzas**: solicitud, verificación de paz y salvo, agenda de ascensor/zona de cargue, autorización de salida de enseres (lista) para portería.
15. **Exportación contable** (CSV/Excel) compatible con Siigo, World Office, Alegra y Helisa, y **backup** automático de la BD por tenant (job diario a storage).
16. **Asistente con IA** (opcional, activable por tenant, `lib/ia`): responde preguntas del residente sobre el reglamento y el manual de convivencia cargados, redacta borradores de respuesta a PQRS y resúmenes de actas. Usa la API de Anthropic con la clave en `.env` (`ANTHROPIC_API_KEY`); si no hay clave, el módulo se oculta.
17. **Historial de la unidad**: línea de tiempo de propietarios, arrendatarios, pagos, multas, tickets, reservas, obras — útil en cambio de administrador y en ventas.
18. **Entrega y empalme de administración**: informe de gestión exportable con todo lo anterior (Ley 675 exige rendir cuentas).
19. **Multi-idioma preparado** (i18n con `next-intl`), solo `es-CO` activo.
20. **Accesibilidad**: contraste AA, tamaños de toque ≥ 44 px, soporte de lectores de pantalla, modo texto grande (pensado para adultos mayores).

---

## 7. Experiencia de usuario (obligatorio)

- Navegación inferior fija en móvil con 5 íconos: Inicio, Pagar/Cuenta, Reservar, Portería/Visitantes (según rol), Más. En escritorio, barra lateral colapsable.
- Botón flotante "+" contextual (reportar, autorizar, reservar).
- Formularios: campos mínimos obligatorios, autocompletado, cámara para fotos y documentos, selección de unidad con buscador, guardado de borrador, mensajes de error en lenguaje claro.
- Búsqueda global (⌘K en escritorio, lupa en móvil) que encuentra unidades, personas, placas, tickets, reservas, paquetes y documentos.
- Estados vacíos con una acción sugerida. Carga optimista y esqueletos.
- Confirmaciones solo para acciones destructivas o de dinero.
- Tema claro/oscuro; colores personalizables por conjunto (logo y color primario).
- Todo texto en español natural, sin anglicismos técnicos hacia el usuario.
- Rendimiento: LCP < 2,5 s en 3G rápido; imágenes optimizadas (`next/image`), paginación por cursor, listas virtualizadas en bitácora y cartera.

---

## 8. Seguridad y cumplimiento

- Contraseñas con `argon2`; bloqueo por intentos; MFA opcional (TOTP); sesiones revocables; cierre de sesión en todos los dispositivos.
- Aislamiento por tenant verificado en tests (un usuario nunca puede leer datos de otro conjunto aunque manipule IDs).
- Autorización por permiso en servidor en el 100 % de las mutaciones.
- Rate limiting en login, webhooks y endpoints públicos; verificación de firma en webhooks.
- Cabeceras de seguridad (CSP, HSTS), sanitización de HTML del editor, límites de tamaño y tipo de archivo, antivirus opcional (ClamAV) abstraído.
- Cifrado en reposo de credenciales de integraciones (pasarelas, Factus, SMTP) con clave `APP_ENCRYPTION_KEY`.
- Auditoría completa y retención configurable; logs sin datos sensibles.
- Habeas data (Ley 1581/2012): consentimiento, finalidad, derechos ARCO, política visible, anonimización al retirar a una persona, exportación de datos.
- Cobranza (Ley 2300/2023): horarios y frecuencia impuestos por el sistema.
- Propiedad horizontal (Ley 675/2001): coeficientes, quórum y mayorías, antelación de convocatorias, debido proceso en sanciones, intereses de mora dentro del máximo legal, rendición de cuentas.

---

## 9. API y eventos

- Toda la funcionalidad expuesta como Server Actions tipadas **y** como REST JSON en `/api/v1/...` (documentada con OpenAPI en `docs/API.md` y `/api/docs`), autenticada con sesión o token de API por conjunto, para futuras apps nativas e integraciones (cámaras LPR, cerraduras, contabilidad).
- Webhooks salientes configurables (pago aprobado, ticket creado, visitante ingresó).
- Bus de eventos interno (`lib/events`): cada módulo emite eventos de dominio; notificaciones, estadísticas y auditoría se suscriben. Esto es lo que garantiza que "todo esté conectado".

---

## 10. Jobs programados (pg-boss)

| Job | Frecuencia |
|---|---|
| Generar cuotas de administración | Mensual, día configurado, 00:10 |
| Liquidar intereses de mora | Diario 01:00 |
| Recordatorios de vencimiento / mora | Diario 08:00 (respeta Ley 2300) |
| Campaña automática de cobro | Mensual, tras generar cuotas |
| Recordatorio de reservas | Cada hora |
| Alertas de paquetes sin reclamar | Diario 18:00 |
| Vencimientos (SOAT, vacunas, pólizas, contratos, documentos de proveedores, certificaciones) | Diario 07:00 |
| Generar órdenes de mantenimiento | Diario 06:00 |
| Cierre de votaciones/encuestas | Cada 5 min |
| Envío de correos en cola | Continuo, con límite por minuto |
| Facturación electrónica pendiente | Cada 5 min |
| Backup por tenant | Diario 03:00 |
| Limpieza de tokens/sesiones | Diario |

---

## 11. Datos semilla (seed)

`npm run seed` crea: 1 SuperAdmin (`admin@miconjunto.co` / `Admin1234*`), 1 conjunto demo "Conjunto Residencial Demo" en Barranquilla con 3 torres × 8 pisos × 4 apartamentos (96 unidades, coeficientes que suman 100 %), 20 casas, 120 parqueaderos, 30 bodegas, 8 zonas comunes (salón social con tarifa e IVA, piscina, gimnasio, BBQ, cancha, parque infantil, sala de juntas, coworking), 150 personas con vínculos variados (menores, adultos mayores, 3 con movilidad reducida, 10 arrendadas, 4 Airbnb), vehículos, mascotas, 6 meses de cuotas con mora realista, pagos, 2 cuotas extraordinarias, multas, 40 tickets en distintos estados, 60 reservas, 500 registros de bitácora, 80 paquetes, publicaciones, 2 encuestas, 1 votación, 1 asamblea con acta, 15 activos con planes de mantenimiento, 12 proveedores, usuarios de cada rol (`administrador@demo.co`, `porteria@demo.co`, `consejo@demo.co`, `propietario@demo.co`, `residente@demo.co`, `mantenimiento@demo.co`, contraseña `Demo1234*`).

---

## 12. Variables de entorno (`.env.example`)

```
DATABASE_URL=postgresql://postgres:1004@localhost:5432/miconjunto?schema=public
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=
APP_ENCRYPTION_KEY=
STORAGE_DRIVER=local            # local | s3
S3_ENDPOINT= S3_BUCKET= S3_ACCESS_KEY= S3_SECRET_KEY= S3_REGION=
SMTP_HOST= SMTP_PORT= SMTP_USER= SMTP_PASS= SMTP_FROM="MiConjunto <no-reply@miconjunto.co>"
VAPID_PUBLIC_KEY= VAPID_PRIVATE_KEY= VAPID_SUBJECT=mailto:soporte@miconjunto.co
WOMPI_PUBLIC_KEY= WOMPI_PRIVATE_KEY= WOMPI_EVENTS_SECRET= WOMPI_INTEGRITY_SECRET= WOMPI_ENV=sandbox
MP_ACCESS_TOKEN= MP_PUBLIC_KEY= MP_WEBHOOK_SECRET=
FACTUS_BASE_URL=https://api-sandbox.factus.com.co
FACTUS_CLIENT_ID= FACTUS_CLIENT_SECRET= FACTUS_USERNAME= FACTUS_PASSWORD=
ALANUBE_BASE_URL= ALANUBE_TOKEN=
WHATSAPP_PROVIDER= WHATSAPP_TOKEN= WHATSAPP_PHONE_ID=
ANTHROPIC_API_KEY=
TZ=America/Bogota
```

Las credenciales por conjunto (pasarelas, Factus, SMTP propio) se guardan cifradas en BD y tienen prioridad sobre las globales.

---

## 13. Pruebas y definición de terminado

Cada fase se considera terminada cuando:

- `npm run typecheck`, `npm run lint`, `npm run test` pasan.
- Existen tests unitarios para: cálculo de cuotas por coeficiente, intereses de mora, aplicación de pagos, descuento pronto pago, quórum y mayorías, validación de traslapes de reservas, permisos por rol, aislamiento de tenant, cálculo de IVA y payload de Factus, reglas de horario de cobranza.
- Existen tests E2E (Playwright, viewport 390×844) para: login, pagar una cuota (pasarela en modo sandbox/mocked), autorizar visitante y registrar ingreso desde portería, recibir y entregar paquete, crear y resolver ticket, reservar y pagar salón con factura, emitir paz y salvo, votar, importar apertura desde Excel.
- Lighthouse móvil ≥ 90 en rendimiento y accesibilidad en Inicio, Pagar y Portería.
- Documentación en `docs/` actualizada y `README.md` con instalación, comandos, credenciales demo y capturas.

---

## 14. Entregables finales

1. Código completo en el repositorio, con historial de commits por fase.
2. `README.md`, `docs/*`, `.env.example`, `docker-compose.yml`, `Dockerfile`.
3. Migraciones y seed funcionales sobre la BD local (`postgres` / `1004`).
4. Plantillas Excel de importación en `public/plantillas/`.
5. Manuales breves (admin, residente, portería) en `docs/` con capturas móviles generadas por Playwright.
6. `docs/INFORME_FINAL.md`: qué se construyó, cómo probarlo, integraciones que requieren credenciales reales y pasos para producción.

---

## 15. Decisiones ya tomadas (no reabrir)

- Next.js + Prisma + PostgreSQL + pg-boss; sin microservicios, sin Redis, sin GraphQL.
- Multi-tenant por columna `conjunto_id` (no un esquema ni BD por tenant).
- Un solo repositorio, una sola app (residentes, portería, admin y superadmin son áreas de la misma PWA con layouts distintos).
- Facturación electrónica solo para alquileres gravados; cuotas ordinarias/extraordinarias y multas generan recibo/cuenta de cobro, no factura.
- Wompi es la pasarela por defecto; Mercado Pago segunda; convenio bancario por conciliación.
- La tasa de mora es parámetro editable con valor por defecto y recordatorio mensual, nunca "hardcodeada".
- Los registros de bitácora y auditoría son inmutables (solo anulación con referencia).

---

## 16. Plan de ejecución por fases (orden obligatorio)

| Fase | Contenido | Resultado verificable |
|---|---|---|
| 0 | Repo, estructura, Next.js, Tailwind/shadcn, Prisma conectado a la BD local, Auth.js, layout móvil con navegación inferior, PWA base, CI local (husky), docs iniciales | Login funciona, app instalable |
| 1 | Multi-tenant, roles y permisos configurables, panel SuperAdmin, Conjunto/Torres/Unidades/Parqueaderos/Bodegas/Zonas, importación Excel, auditoría, adjuntos, storage | Asistente de apertura completo |
| 2 | Personas, vínculos, invitaciones, vehículos, mascotas, emergencia, habeas data, panel guiado del propietario, indicadores de población | Ficha de unidad completa |
| 3 | Cartera: conceptos, cuotas, generación mensual, mora, pronto pago, pagos manuales, aplicación, estado de cuenta PDF, recibos, aging, acuerdos, paz y salvo con verificación, conciliación | Cartera operable |
| 4 | Pasarelas Wompi y Mercado Pago, webhooks, página pública de pago, campaña de cobro, plantillas de correo, cola de envíos, notificaciones push/email, centro de notificaciones, recordatorios | Pago en línea de punta a punta |
| 5 | Zonas comunes: calendario por zona, reservas, bloqueos, aprobación, pago, check-in/out y acta, IVA, Factus/Alanube y panel de facturación, parqueaderos de visitantes | Reserva pagada con factura |
| 6 | Portería: kiosco, búsqueda, QR/código, autorizaciones en tiempo real, bitácora, turnos, novedades, listas negra y frecuentes, paquetería, llaves, offline, emergencia | Portería usable en tablet y teléfono |
| 7 | PQRS/tickets, llamados de atención, multas con debido proceso, incidentes de convivencia, obras, mudanzas | Mesa de ayuda completa |
| 8 | Muro, segmentos, correo masivo, documentos, calendario, directorios (residentes y proveedores), clasificados, objetos perdidos, WhatsApp opcional | Intranet completa |
| 9 | Encuestas, votaciones, asambleas (convocatoria, asistencia QR, quórum, poderes, actas), consejo | Asamblea virtual completa |
| 10 | Activos, plan de mantenimiento, órdenes de trabajo, proveedores, contratos, presupuesto, exportación contable, empleados | Mantenimiento completo |
| 11 | Estadísticas (todos los tableros), visibilidad por rol, panel personal del residente | Estadísticas completas |
| 12 | Extras (sección 6 restantes), asistente IA opcional, plan de emergencia, historial de unidad, informe de empalme, API REST v1 + OpenAPI, webhooks salientes, backups | Todo integrado |
| 13 | Endurecimiento: seguridad, rendimiento, accesibilidad, Lighthouse, E2E completos, Docker, guía de despliegue, manuales, `INFORME_FINAL.md` | Listo para producción |

En cada fase: migración → servicios con tests → UI móvil → UI escritorio → seed actualizado → docs → commit → push. No avances a la siguiente fase con tests en rojo.
