# Arquitectura de MiConjunto

## Visión general

Una sola aplicación **Next.js 15 (App Router)** sirve a residentes, portería, administración y SuperAdmin como áreas de la misma PWA, sobre **PostgreSQL** con **Prisma**. Los procesos en segundo plano corren en un **worker pg-boss** que usa la misma base de datos.

```
Navegador / PWA (móvil primero)
   │  Server Components + Server Actions + REST /api/v1 + SSE /api/events
   ▼
Next.js (app/)  ──►  lib/<modulo>/service.ts  ──►  Prisma (withTenant)  ──►  PostgreSQL
   │                        │                                              ▲
   │                        ├─► lib/events (bus de dominio) ─► webhooks, tiempo real (NOTIFY)
   │                        ├─► lib/notificaciones (app, push, correo, WhatsApp)
   │                        └─► lib/audit (auditoría inmutable)
   ▼
jobs/worker.ts (pg-boss) ── cuotas, mora, recordatorios, correos, facturación, backups
```

## Capas

| Capa | Ubicación | Responsabilidad |
|---|---|---|
| Rutas y UI | `app/(auth)`, `app/(app)`, `app/(porteria)`, `app/(superadmin)`, rutas públicas | Renderizar, validar entrada, delegar |
| Server Actions | `app/(app)/<modulo>/actions.ts` | `action({perm, schema}, handler)`: sesión + permiso + zod |
| Servicios | `lib/<modulo>/service.ts` | Reglas de negocio puras y testeables |
| Datos | `lib/db` | Prisma + extensión `withTenant` (aislamiento por conjunto y borrado lógico) |
| Transversal | `lib/permisos`, `lib/audit`, `lib/events`, `lib/notificaciones`, `lib/storage`, `lib/email` | |

## Multi-tenancy

- `Conjunto` es el tenant. Toda tabla de negocio tiene `conjuntoId` indexado.
- `ctx.db` es un cliente Prisma extendido que **inyecta `conjuntoId` en cada consulta** y excluye registros borrados; falla si se intenta leer o escribir en otro conjunto.
- Los archivos se guardan en `storage/<conjuntoId>/...` y `/api/files` valida la membresía.

## Autenticación y autorización

- Auth.js v5 con JWT. El token lleva `uid`, `cid` (conjunto activo), `rol`, `sv` (versión de sesión) e `imp` (impersonación).
- `getCtx()` arma el contexto del request: usuario, conjunto, rol base, permisos, unidades vinculadas y `db` aislado.
- `can(ctx, 'modulo.accion', recurso?)` es la única puerta de autorización. Sin `modulo.ver_todos`, el recurso debe pertenecer a las unidades del usuario.
- Roles base no eliminables + roles personalizados por conjunto (copian un rol base, que define el alcance).

## Tiempo real

`publishRealtime()` ejecuta `pg_notify('mc_events', …)`; `/api/events` mantiene una conexión `LISTEN` por proceso y reenvía por SSE a los clientes según canal (`user:<id>`, `porteria`, `tickets`, `asamblea:<id>`…). El cliente (`useRealtime`) reconecta y cae a *polling* si SSE falla.

## PWA

`@serwist/next` genera `public/sw.js` desde `app/sw.ts` en producción: precache, caché de navegación de portería, página `/offline`, notificaciones push con acciones (Autorizar/Rechazar). La cola offline de portería usa IndexedDB (`idb-keyval`).
