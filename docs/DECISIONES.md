# Registro de decisiones (ADR ligero)

Decisiones tomadas donde la especificación era ambigua o el entorno obligó a elegir. Formato: **decisión** — motivo.

## Fase 0 — Base

1. **PostgreSQL 17 local** en lugar de 16 — es la versión instalada en la máquina; Prisma y pg-boss son compatibles. `docker-compose.yml` usa `postgres:16` para producción.
2. **Prisma 6.19** (no 7/8) — versión estable con motor clásico; evita cambios de configuración de Prisma 7 (`prisma.config.ts`, adaptadores obligatorios).
3. **Nombres de modelos y campos de dominio en español** (Conjunto, Unidad, Cuota…) — la especificación nombra así las entidades y son vocabulario del negocio de propiedad horizontal. Funciones, variables técnicas y utilidades van en inglés, como pide la convención.
4. **Columnas `camelCase`** (p. ej. `conjuntoId`) en vez de `conjunto_id` — convención por defecto de Prisma; el concepto "toda tabla tiene conjunto_id indexado" se cumple con `@@index([conjuntoId])`.
5. **`withTenant` como extensión de Prisma** calculada desde el DMMF: todo modelo con `conjuntoId` obligatorio queda protegido automáticamente (lecturas, escrituras, upsert, createMany). Además filtra `deletedAt: null` (borrado lógico). Si se intenta consultar o escribir con otro `conjuntoId`, lanza error. Probado en `tests/integration/tenant.test.ts`.
6. **Permisos resueltos en servidor con caché** (no dentro del JWT) — el JWT lleva `conjuntoId`, `rol` y versión de sesión; los permisos se cargan de `RolPermiso` con caché en memoria invalidada por `Rol.version`. Evita cookies de más de 4 KB y permite que un cambio de permisos aplique de inmediato.
7. **Revocación de sesiones** con `Usuario.sessionVersion`: "cerrar sesión en todos los dispositivos" incrementa la versión y todo JWT anterior queda inválido.
8. **Un solo proveedor de Auth.js ("token")**: el login con contraseña valida clave, bloqueo por intentos y MFA (TOTP) en una Server Action y emite un token de un solo uso de 2 minutos que consume el proveedor; el enlace mágico usa el mismo mecanismo con 15 minutos. Un único camino de autenticación = menos superficie de ataque.
9. **OTP por SMS/WhatsApp** queda preparado vía `lib/whatsapp` (opcional); MFA TOTP implementado.
10. **shadcn/ui con Base UI** (estilo `base-nova` que instala la CLI actual). Se ajustaron tamaños: botones e inputs de 44 px mínimo (accesibilidad táctil).
11. **Selects nativos en formularios** — en el teléfono abren el selector del sistema, más rápido y accesible. Para listas largas (unidades, personas) se usa `SearchSelect` con buscador.
12. **Correo sin SMTP** — si no hay SMTP configurado, los correos quedan en la tabla `CorreoSaliente` como enviados y se pueden ver en *Configuración → Buzón de desarrollo*. Así los flujos (enlace mágico, invitaciones, cobros) se prueban sin credenciales.
13. **Tiempo real con Postgres LISTEN/NOTIFY + SSE** — funciona entre procesos (web y worker) sin Redis.
14. **Tasa de mora por defecto**: 24,36 % E.A. (≈1,833 % mensual) como referencia de 1,5 × IBC; es parámetro editable con historial (`TasaMora`), nunca fija en código.
15. **Seed destructivo** — `npm run seed` hace `TRUNCATE` de todas las tablas y recrea la demo; es determinista (PRNG con semilla fija).
16. **Rutas en español** (`/inicio`, `/cuenta`, `/porteria`…), coherentes con la UI.

## Fase 1 — Multi-tenant, roles, estructura, SuperAdmin

17. **Roles base instanciados por conjunto** (`Rol` con `base = true`) para que cada conjunto pueda ajustar la matriz de permisos sin afectar a otros. Los roles personalizados copian un rol base y heredan su *alcance* (`basadoEnClave`).
18. **Visibilidad de campos e indicadores como permisos** (`campos.*`, `secciones.*`) editables en una matriz rol × permiso: un solo mecanismo de autorización.
19. **El rol ADMINISTRADOR base no puede perder** `configuracion.ver` ni `configuracion.roles` (evita quedar sin acceso).
20. **Importación en dos pasos**: validar (fila por fila, sin escribir) → aplicar solo filas válidas. Es idempotente por código de unidad / documento de persona. Reporte de errores descargable en Excel.
21. **Asistente de apertura**: el paso 1 (crear conjunto) está en el panel SuperAdmin; los pasos 2–8 se hacen dentro del conjunto (`/apertura`) reutilizando el importador, para que el mismo flujo sirva al SuperAdmin y al administrador.
22. **Checkboxes**: `CheckboxField` envía un oculto `false` antes del checkbox, de modo que desmarcar sí guarda `false`.
23. **Referencia de pago numérica de 14 dígitos** (6 del conjunto + 8 consecutivos), apta para convenios bancarios y conciliación.
24. **Interés de mora simple sobre capital** (sin capitalizar intereses; prohibido el anatocismo), base 30 días; se liquida como concepto separado `INTERES_MORA`.
25. **Saldo a favor** = pagos aprobados − aplicaciones; se aplica automáticamente a cuotas nuevas.
