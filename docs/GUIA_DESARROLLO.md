# Guía de desarrollo de MiConjunto

Convenciones obligatorias para construir módulos. La especificación funcional está en `MICONJUNTO_SPEC.md` (raíz).
**Lee los archivos de referencia citados antes de escribir código**: el módulo *Conjunto y estructura* (Fase 1) es el ejemplo completo.

## 1. Entorno

- Next.js 15 (App Router, webpack), TypeScript estricto, Tailwind v4, shadcn/ui sobre **Base UI** (no Radix: los disparadores usan `render={<Button/>}`, no `asChild`), Prisma 6, PostgreSQL local (`postgres`/`1004`, BD `miconjunto`; pruebas en `miconjunto_test`), zod **v4**, pg-boss 10, lucide-react 1.x, recharts 3, date-fns 4.
- El servidor de desarrollo **ya está corriendo** en `http://localhost:3000` (no inicies otro, no lo detengas).
- **El esquema Prisma está congelado** (`prisma/schema.prisma` ya contiene todos los modelos de todas las fases). **No ejecutes** `prisma migrate`, `prisma generate` ni `db push`. Si de verdad necesitas un campo nuevo, usa los campos JSON existentes o anótalo en `docs/SOLICITUDES_ESQUEMA.md` y sigue.
- No hagas `git commit` ni `git push` (lo hace el coordinador).
- En Windows con Git Bash: rutas que empiezan con `/` en argumentos se convierten; el script de capturas ya lo corrige.

## 2. Estructura de un módulo

| Qué | Dónde | Referencia |
|---|---|---|
| Servicio (reglas de negocio, funciones puras y con BD) | `lib/<modulo>/service.ts` (+ `calculos.ts` si hay lógica pura) | `lib/conjunto/service.ts`, `lib/cartera/calculos.ts` |
| Server Actions | `app/(app)/<ruta>/actions.ts` | `app/(app)/conjunto/actions.ts` |
| Páginas | `app/(app)/<ruta>/page.tsx` (Server Components) | `app/(app)/conjunto/**` |
| Exportación Excel/PDF | `lib/<modulo>/export.ts` + 1 línea `import` en `lib/export/exporters.ts` | `lib/conjunto/export.ts` |
| Jobs programados | `jobs/<modulo>.ts` con `defineJob(...)` + 1 línea `import` en `jobs/modulos.ts` | `jobs/definitions.ts` |
| Seed demo | `prisma/seed/NN-<modulo>.ts` exportando `seedXxx(state)` (se descubre solo, por orden de nombre) | `prisma/seed/20-personas.ts` |
| API REST | `app/api/v1/<recurso>/route.ts` con `apiHandler` | `app/api/v1/unidades/route.ts` |
| Pruebas | `tests/unit/<modulo>.test.ts`, `tests/integration/<modulo>.test.ts` | `tests/unit/cartera.test.ts`, `tests/integration/cartera-core.test.ts` |
| Resumen para el Inicio | `lib/<modulo>/inicio.ts` exportando funciones con los datos de widgets (ver §9) | — |
| Documentación | `docs/modulos/<modulo>.md` (funcional + endpoints REST) | — |

## 3. Contexto, permisos y aislamiento

- `requirePage(perm)` (en `lib/auth/guard.ts`) en cada página; `action({ perm, schema }, handler)` (en `lib/action.ts`) en cada mutación. **Toda mutación verifica permiso en servidor.**
- `ctx` (`lib/auth/context.ts`): `userId, nombre, conjuntoId, conjunto, rolBase, permisos, unidadIds, unidadesPropias, personaIds, db`.
- **`ctx.db` es el cliente aislado por conjunto**: inyecta `conjuntoId` en toda consulta y excluye `deletedAt != null`. Usa siempre `ctx.db`. En `create` pasa los FKs como escalares (`unidadId: "..."`), nunca `connect`, e incluye `conjuntoId: ctx.conjuntoId` (lo exige el tipo). En `include` de relaciones, filtra `where: { deletedAt: null }` si aplica. Borrado = `update({ data: { deletedAt: new Date() } })`.
- Permisos: catálogo en `lib/permisos/catalog.ts` (`modulo.accion`). `can(ctx, "tickets.ver", { unidadId })`, `assertCan`, `seesAll(ctx, "tickets")`. Regla: sin `modulo.ver_todos` el usuario solo ve lo de sus unidades (`ctx.unidadIds`) o lo que creó. **Nunca confíes en ocultar botones.** Si necesitas un permiso nuevo, agrégalo al catálogo y a `DEFAULT_ROLE_PERMS` con cuidado (archivo compartido: edición mínima y aditiva).
- Campos sensibles: `campos.persona_telefono`, `campos.persona_salud`, `campos.unidad_financiero`, `secciones.*` (indicadores). Respétalos.
- `conjuntoConfig(ctx)` (de `lib/conjunto/config.ts`) da los parámetros del conjunto (cartera, bloqueos por mora, portería, facturación, pagos…).

## 4. Server Actions — reglas

```ts
"use server";
const schema = z.object({ id: zs.optId(), nombre: zs.text(1, 80), valor: zs.money(), activo: zs.bool() });
export const guardarXAction = action({ perm: "x.crear", schema }, async (input, ctx) => {
  const r = await guardarX(ctx, input);
  revalidatePath("/x");
  return { id: r.id };
});
```

- Usa los helpers `zs.*` de `lib/validation.ts` (vienen de formularios: strings). Mensajes en español ya configurados.
- **En archivos `"use server"` no pongas funciones flecha síncronas dentro de la expresión exportada** (p. ej. `z.preprocess((v)=>…)` en línea): Next falla con "Server Actions must be async functions". Declara esos esquemas como `const` arriba.
- `export` solo de acciones. Utilidades en otros archivos.
- Retorna datos serializables (`{ id }`, `true`, objetos planos). Lanza `AppError("mensaje claro")` para errores de negocio.
- Registra `audit(ctx, "accion", "Entidad", id, antes, despues)` en escrituras sensibles (dinero, permisos, datos personales, bitácora).

## 5. UI (móvil primero)

- Diseña para 360–430 px y adapta a escritorio. Máximo 3 toques para acciones cotidianas. Textos en español natural (Colombia), sin anglicismos. Objetivos táctiles ≥ 44 px (Button por defecto ya mide 44 px).
- Componentes: `PageHeader`, `Section` (`components/app/page-header.tsx`), `TabsNav`, `DataList` (tabla en escritorio y tarjetas en móvil) + `Pager`, `ListToolbar` (búsqueda, filtros en URL, exportación), `FormDialog` (formulario en diálogo/hoja inferior), `StatCard`, `StatusBadge` (colores por estado vía `lib/labels.ts`), `EmptyState` (con acción sugerida), `Importer`.
- Formularios: `ActionForm` (+ `redirectTo`, `successMessage`, `draftKey` para borrador, `confirm` para dinero/destructivo), `ActionButton`, `SelectAction`; campos en `components/form/fields.tsx`: `TextField`, `TextAreaField`, `SelectField` (nativo), `SearchSelect` (con buscador, para unidades/personas), `MoneyField` (formato $ 1.234.567), `CheckboxField`, `ChoiceCards` (opciones grandes para flujos de 3 pasos), `FileField` (cámara del teléfono, sube a `/api/upload`), `FormGrid`. Nombres con punto crean objetos (`horario.1.abre`), `campo[]` crea arreglos.
- Opciones: `unidadOptions(ctx)`, `torreOptions`, `zonaOptions` (`lib/conjunto/options.ts`); `options([...enum])` y `label(valor)` en `lib/labels.ts` (agrega ahí etiquetas con tildes si faltan).
- Formato: `cop()`, `fecha()`, `fechaHora()`, `hora()`, `num()`, `pct()`, `parseLocal()`, `isoDate()`, `periodoActual()` en `lib/format.ts` (zona America/Bogota, DD/MM/YYYY).
- Iconos `lucide-react` (v1: `House`, `ChartColumn`, …). Gráficos con `recharts`.
- Navegación: las rutas ya están en `lib/nav.ts`; crea las páginas en esas rutas.
- Tiempo real: `useRealtime(["porteria"], (e)=>…)` (`components/realtime/use-realtime.ts`); publica con `publishRealtime({ conjuntoId, canal, tipo, data })` o emitiendo eventos de dominio (`emit`, se reenvían al canal según prefijo: `visitante.*`/`paquete.*`/`porteria.*`/`emergencia.*` → `porteria`; `ticket.*` → `tickets`).
- PDF: `lib/pdf/kit.tsx` (`PdfHeader`, `PdfTable`, `PdfQr`, `renderPdf`, estilos) en route handlers (`export const runtime = "nodejs"`). QR: paquete `qrcode` (`QRCode.toDataURL`). Lector QR en el navegador: `html5-qrcode` (import dinámico en componente cliente).
- Archivos: `saveFile` / `readFileByUrl` (`lib/storage`), URL pública `/api/files/<conjuntoId>/<carpeta>/...` (carpeta `publico` no exige sesión).

## 6. Integración entre módulos ("todo conectado")

- **Cartera (núcleo ya implementado, `lib/cartera/core.ts`)**: `crearCargo(ctx, { unidadId, conceptoTipo, valorBase, iva?, descripcion, fechaVencimiento, origen, ... })` crea la `Cuota` + movimiento; `registrarPago(ctx, {...})` crea y aplica un pago; `aplicarPago(ctx, pagoId)` (idempotente) aplica en orden legal, calcula pronto pago, genera recibo y emite `pago.aprobado` con `{ pagoId, unidadId, valor, reservaId, cuotaIds, numeroRecibo }`; `saldoUnidad(ctx, unidadId)`; `unidadAlDia(ctx, unidadId)` → `{ alDia, saldo }` (bloqueos por mora); `anularCargo`. Cálculos puros en `lib/cartera/calculos.ts` (IVA, mora, distribución por coeficiente, etc.).
- **Pagos en línea**: el flujo de pago vive en `/cuenta/pagar?cuotas=<id1,id2>` (lo construye el módulo Pagos). Otros módulos que generan un cobro (reservas, multas) crean la cuota con `crearCargo` y enlazan a esa ruta.
- **Eventos**: `emit({ tipo: "modulo.evento", conjuntoId, data: { id, ... }, actorId })` en `lib/events`. Para reaccionar a eventos de otro módulo crea `lib/<modulo>/eventos.ts` con `on("pago.aprobado", async (evt) => …)` y agrega 1 línea `import "@/lib/<modulo>/eventos";` al final de `lib/events/subscribers.ts`. En los manejadores usa `systemCtx(evt.conjuntoId)` (`lib/auth/system-ctx.ts`).
- **Notificaciones**: `notify({ conjuntoId, usuarioIds, titulo, cuerpo, enlace, tipo, canales: ["push","email","whatsapp"], acciones? })`. Destinatarios: `usuariosDeUnidad(conjuntoId, unidadId, { soloPropietarios })`, `usuariosConPermiso(conjuntoId, ["x.y"])`, `usuariosConRol(conjuntoId, ["ADMINISTRADOR"])` (`lib/notificaciones`).
- **Correo**: `queueBrandedEmail(to, asunto, { parrafos, boton, conjuntoNombre, color }, { conjuntoId, attachments })` (`lib/email`). Sin SMTP quedan en *Configuración → Buzón de correos*.
- **Consecutivos**: `nextConsecutivo(conjuntoId, "RADICADO", año)` (`lib/consecutivo.ts`).
- **Credenciales de integraciones**: `credenciales(conjuntoId, "WOMPI" | "FACTUS" | ...)` (`lib/integraciones/service.ts`) — cifradas en BD con prioridad sobre `.env`.

## 7. Seed

- `npm run seed` hace TRUNCATE de todo y recrea la demo (~1 min); los módulos se ejecutan en orden de archivo y un error en uno no detiene los demás. **Mientras se desarrolla en paralelo no lo ejecutes**: prueba tu módulo con `npx tsx scripts/seed-uno.ts NN-modulo` (corre solo ese módulo sobre los datos existentes; tu módulo debe ser idempotente).
- `state` trae `conjuntoId`, `users` (claves: superadmin, administrador, porteria, porteria2, consejo, propietario, residente, mantenimiento, contador, revisor, asistente, conviviente, proveedor), `roles`, `rng` (determinista: `rng.int`, `rng.pick`, `rng.chance`, `rng.shuffle`) y `now`.
- Usuarios demo: `propietario@demo.co` = Laura, dueña de **T1-101** (familia con menor, adulto mayor con movilidad reducida, empleada doméstica, conviviente Valentina); `residente@demo.co` = Andrés, arrendatario de **T2-302**; `consejo@demo.co` = Ricardo, dueño de **T3-804**. Clave `Demo1234*`.
- Usa `prisma` de `prisma/seed/util.ts` o los servicios con `systemCtx(conjuntoId)` (recomendado para cartera: `crearCargo`, `registrarPago`).

## 8. Verificación antes de terminar

1. `npx tsc --noEmit 2>&1 | grep -E "<tus carpetas>"` → sin errores en tus archivos (otros agentes trabajan en paralelo; ignora errores ajenos).
2. `npx eslint <tus carpetas> --max-warnings=0`.
3. `npx vitest run tests/unit/<tu-modulo> tests/integration/<tu-modulo>` en verde.
4. `npm run seed` sin errores en tu módulo.
5. **Prueba como humano** con capturas móviles: `npx tsx scripts/shot.ts --user propietario /ruta1 /ruta2` (usuarios: administrador, porteria, consejo, propietario, residente, mantenimiento, contador, superadmin; `--desktop` para escritorio). Revisa las imágenes en `screenshots-tmp/` con la herramienta de lectura de imágenes y corrige lo que se vea mal. El script reporta errores de consola y HTTP 500. Para flujos interactivos escribe un script Playwright temporal en `scripts/tmp-<algo>.ts` (bórralo al final) o una prueba en `tests/e2e/`.
6. Si una página devuelve 500, revisa el log del servidor: `tail -50 .next-dev.log`.

## 9. Inicio (dashboard por rol)

La página `/inicio` la compone el coordinador. Cada módulo expone en `lib/<modulo>/inicio.ts` funciones asíncronas que reciben `ctx` y devuelven datos simples para widgets, por ejemplo `resumenResidente(ctx)` y `resumenAdmin(ctx)`. Documenta su forma con un tipo exportado.
