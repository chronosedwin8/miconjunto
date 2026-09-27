# Perfil, notificaciones y habeas data (Ley 1581 de 2012, spec §8)

## Perfil — `/perfil` (cualquier usuario con sesión)

- **Mis datos**: nombre, celular y foto de la cuenta; datos de la Persona del conjunto activo (documento, fecha de nacimiento, salud y emergencia). Derecho de actualización/rectificación.
- **Notificaciones**: preferencias por canal (`Usuario.preferenciasNotif = {push,email,whatsapp}`); indica si el conjunto no tiene el canal habilitado. Activa Web Push en el dispositivo con `NEXT_PUBLIC_VAPID_PUBLIC_KEY` → `POST/DELETE /api/push/suscribir` (`SuscripcionPush`).
- **Seguridad**: MFA TOTP opcional (otplib v13 `generateSecret`/`generateURI`/`verifySync`, QR con `qrcode`; secreto cifrado con `encrypt()` en `Usuario.mfaSecret`, se activa `mfaActivo` solo al verificar un código). Cambio de contraseña (opción de cerrar sesión en todos los dispositivos incrementando `sessionVersion`) y `logoutAllDevicesAction`.
- **Privacidad (ARCO)**: qué datos se tratan, descarga en JSON (`GET /perfil/mis-datos`, sin hashes ni secretos, auditado, 10 descargas/hora), política aceptada y **supresión**: escribe `SUPRIMIR`; anonimiza la Persona (nombre «Titular retirado», documento → hash `ANON-…`, borra contacto, salud y foto), finaliza vínculos que no son de propiedad (los de propiedad se conservan anonimizados por la Ley 675), borra borradores. Opcionalmente cierra la cuenta (membresía eliminada; si no tiene otros conjuntos el usuario se anonimiza y desactiva). Se notifica a quienes tienen `residentes.aprobar`.
- **Re-aceptación de política**: si `conjuntoConfig(ctx).datos.politicaVersion` ≠ `Usuario.politicaVersion`, el layout del perfil muestra un aviso con botón para aceptar (también el paso 9 de Mi hogar). Actualiza `Usuario.politicaAceptadaEn/Version` y `Persona.consentimientoDatosEn/Version`.

## Política pública — `/politica-datos?c=<slug>`

Sin sesión. Texto genérico (responsable = copropiedad, MiConjunto = encargado; datos, finalidades, datos sensibles y de menores, derechos, plazos de 10/15 días hábiles, conservación). Con `?c=` muestra responsable, contacto, finalidad y texto propio del conjunto (`config.datos`).

## Centro de notificaciones — `/notificaciones`

Lista paginada (todas / sin leer), tocar una notificación la marca leída y abre su enlace, marcar todas como leídas y borrar leídas (borrado lógico). Muestra notificaciones del conjunto activo y las globales.
