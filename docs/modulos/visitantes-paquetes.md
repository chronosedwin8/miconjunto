# Visitantes y paquetes — vista del residente

## Visitantes (`/visitantes`, permiso `visitantes.autorizar`)

- **Autorizar visitante** (`/visitantes/nuevo`) en ≤ 3 toques: el tipo (Visita) y "Hoy" vienen preseleccionados → escribir el nombre → **Generar código de ingreso**. Opciones: Mañana, Otras fechas (rango), **Recurrente** (días de la semana, franja horaria y fecha final, usos ilimitados), documento, placa, número de ingresos y nota para portería. Para **contratistas** se adjunta el soporte de seguridad social (obligatorio si el conjunto lo exige).
- **Detalle** (`/visitantes/[id]`): código de 6 dígitos, QR, vigencia, usos, ingresos realizados; **Compartir por WhatsApp** (`wa.me` con código, vigencia y enlace), compartir nativo, copiar y **Revocar**.
- **Pase público** (`/acceso-visitante/<token>`, sin sesión, ruta en `PUBLIC_PREFIXES`): QR grande + código, vigencia y estado; no muestra datos del residente. Con límite de solicitudes por IP.
- Pestañas: Activas, Vencidas y usadas, **Visitas recibidas** (historial con hora de entrada y salida).
- **Solicitudes en tiempo real**: cuando portería notifica un visitante sin autorización, el residente recibe un push con botones **Autorizar / Rechazar** (el service worker llama `POST /api/porteria/solicitudes/:id/responder`) y ve un banner en `/visitantes` (SSE canal `unidad:<id>`). Solo los usuarios vinculados a la unidad pueden responder.
- Al ingresar un visitante, la unidad recibe "Tu visitante X ingresó".

## Paquetes (`/paquetes`, permiso `paqueteria.ver`)

- Paquetes en portería (con días en espera) y entregados/devueltos recientes, con quién los recogió.
- **¿Quién puede recogerlos?**: residentes de la unidad mayores de 14 años y personas con vínculo `AUTORIZADO_RECOGER_PAQUETES` (se agregan en Mi hogar). Portería solo entrega a ellas, con firma o foto.
- Notificación inmediata al recibir (push + correo + WhatsApp si está activo) y recordatorio diario a las 18:00.

## Server Actions

`app/(app)/visitantes/actions.ts`: `crearAutorizacionAction`, `revocarAutorizacionAction`, `responderSolicitudAction`.
Servicios: `lib/porteria/autorizaciones.ts`, `lib/porteria/solicitudes.ts`, `lib/paqueteria/service.ts`.
