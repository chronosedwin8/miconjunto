# Acceso derivado del hogar

Varias personas de una misma unidad entran a la app con **su propia cuenta**, con un acceso que les otorga el titular y que depende de él.

## Funcional

- **Titular — `/mi-hogar/accesos?u=<unidad>`** (enlace desde *Mi hogar*): lista titulares, personas con acceso (capacidades como chips, estado *Activo / En pausa / Por aprobar*), invitaciones pendientes (reenviar con enlace nuevo + WhatsApp, cancelar) y miembros antiguos "sin límites" (botón *Ajustar permisos*).
  - *Invitar a alguien*: preset (familiar adulto, menor, empleada doméstica, cuidador(a), arrendatario —solo propietario—, otro residente) + interruptores por capacidad con explicación sencilla. Lo que el titular no tiene aparece deshabilitado.
  - *Permisos*, *Pausar/Reanudar*, *Quitar* (con confirmación).
- **Administración** (`residentes.ver_todos`): botón *Accesos a la app* en la ficha de la unidad (`/conjunto/unidades/[id]`); puede hacer lo mismo en cualquier unidad y elegir desde qué titular se otorga.
- **Miembro derivado**: tarjeta de solo lectura "Tu acceso lo otorgó …" con sus capacidades en *Mi perfil* y en *Mi hogar*. La navegación inferior muestra solo lo que puede usar.

## Reglas

- **Titular** (`esVinculoTitular`): vínculo activo y no pausado de tipo `PROPIETARIO`, `COPROPIETARIO` o `ARRENDATARIO`, o el marcado `principal` si no es derivado. El arrendatario es titular de su hogar aunque su propio acceso derive del propietario.
- **Quién gestiona qué**: los propietarios gestionan los accesos otorgados por ellos o sus copropietarios; el arrendatario, los de su hogar (el propietario no gestiona la familia del inquilino). Los miembros antiguos sin restricción los ajusta el titular del hogar que habita la unidad. La administración, todo. Nadie se gestiona a sí mismo.
- **Capacidades** (`lib/hogar/capacidades.ts`): `comunidad`, `visitantes`, `paquetes`, `reservas`, `pqrs`, `obras`, `vehiculos`, `hogar` (ver Mi hogar), `cuenta` (ver y pagar; sincroniza `puedeVerCuenta`). Emergencias (pánico y plan) siempre se conservan.
- **Nunca derivables**: votar (Ley 675: solo propietarios o apoderados), invitar o gestionar residentes, administrar cartera, `*.ver_todos`, configuración y módulos de gestión.
- **Techo**: no se otorga más de lo que tiene el titular que otorga (permisos efectivos de su rol; `cuenta` solo si ve la cuenta). Si un titular derivado pierde capacidades, sus derivados se recortan igual.
- **Enforcement** (`buildCtx` → `resolverAcceso`): para roles residenciales cuyos vínculos vigentes son todos derivados, `permisos = rol ∩ capacidades (+ emergencias, + cuenta)`. Si tiene algún vínculo propio no derivado conserva su rol. Los vínculos pausados (o cuyo titular está pausado/inactivo) no cuentan en `unidadIds`, ni para cuentas (`cuentasAccesibles`) ni para avisos de la unidad. Se calcula con la misma consulta de vínculos (un `select` del titular).
- **Invitación**: rol `RESIDENTE`, `Invitacion.derivadoDeId` + `capacidadesHogar`; al aceptar se copian al `VinculoUnidad` (si la persona ya vivía allí sin cuenta, su vínculo se convierte). El arrendatario queda `PENDIENTE_APROBACION`.
- **Cascada** (`lib/hogar/cascada.ts`, `terminarAccesosDerivados`): al finalizar, retirar, rechazar o suprimir el vínculo del titular terminan todos los accesos derivados (en varios niveles), se revocan sus invitaciones, se avisa a cada persona y, si queda sin vínculos, se suspende su membresía y se cierran sus sesiones. Quitar un acceso hace lo mismo.
- Todo cambio queda en auditoría: `otorgar_acceso`, `editar_acceso`, `recortar_acceso`, `pausar_acceso`, `reanudar_acceso`, `quitar_acceso`, `terminar_acceso_derivado`, `reenviar_invitacion`, `cancelar_invitacion`, `suspender_membresia`.

## Demo

`propietario@demo.co` (titular de T1-101) → *Mi hogar → Accesos de mi hogar*. Miembros: `familiar@demo.co` (todo el hogar, incluida la cuenta) y `empleada@demo.co` (visitantes y paquetes); invitación pendiente de la cuidadora. Clave `Demo1234*`. Seed: `npx tsx scripts/seed-uno.ts 22-accesos` (idempotente).
