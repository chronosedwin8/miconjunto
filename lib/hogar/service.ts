import type { Prisma } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import { AppError, notFound } from "@/lib/errors";
import { edad, nombreCompleto } from "@/lib/format";
import { defaultPermsFor, loadRolePerms, seesAll } from "@/lib/permisos";
import { notify } from "@/lib/notificaciones";
import { invitarUsuario } from "@/lib/usuarios/service";
import { sincronizarBanderasUnidades } from "@/lib/residentes/service";
import { VINCULOS_HABITAN } from "@/lib/residentes/calculos";
import { desactivarSiSinVinculos, terminarAccesosDerivados } from "./cascada";
import {
  CAPACIDADES,
  TIPOS_TITULAR,
  capacidadesOtorgables,
  esDerivado,
  esVinculoTitular,
  excedentes,
  grupoTitular,
  normalizarCapacidades,
  resolverAcceso,
  type CapacidadKey,
  type Techo,
  type TipoDerivado,
} from "./capacidades";

/**
 * Acceso derivado: el titular de una unidad da acceso a la app a las personas de su hogar con capacidades
 * acotadas (ver capacidades.ts). Reglas:
 * - Titular = propietario, copropietario, arrendatario o vínculo principal no derivado (activo y sin pausar).
 * - Los propietarios gestionan los accesos que otorgaron ellos (o sus copropietarios); el arrendatario, los de su
 *   hogar. Los miembros sin restricción (sin capacidades) los ajusta el titular del hogar que habita la unidad.
 * - La administración con `residentes.ver_todos` gestiona cualquier unidad.
 * - Nadie otorga más de lo que tiene quien da el acceso (su techo), y nunca votar, invitar ni administrar.
 */

const VIGENTES = ["ACTIVO", "PENDIENTE_APROBACION"] as const;

const includePersona = {
  persona: {
    select: {
      id: true,
      nombres: true,
      apellidos: true,
      fotoUrl: true,
      email: true,
      telefono: true,
      fechaNacimiento: true,
      usuarioId: true,
      usuario: { select: { email: true, ultimoAcceso: true } },
    },
  },
} satisfies Prisma.VinculoUnidadInclude;

type V = Prisma.VinculoUnidadGetPayload<{ include: typeof includePersona }>;

type Carga = {
  unidad: { id: string; codigo: string };
  vinculos: V[];
  byId: Map<string, V>;
  gestor: boolean;
  misTitulares: V[];
  grupoHogar: "PROPIETARIOS" | "OCUPANTES";
};

export function gestionaAccesos(ctx: Ctx) {
  return seesAll(ctx, "residentes");
}

/** Carga la unidad y valida que el usuario pueda gestionar sus accesos (titular o administración). */
async function cargar(ctx: Ctx, unidadId: string): Promise<Carga> {
  const gestor = gestionaAccesos(ctx);
  if (!gestor && !ctx.unidadIds.includes(unidadId)) throw new AppError("Solo puedes gestionar los accesos de tus unidades.", 403);
  const unidad = await ctx.db.unidad.findUnique({ where: { id: unidadId }, select: { id: true, codigo: true } });
  if (!unidad) notFound("La unidad");
  const vinculos = await ctx.db.vinculoUnidad.findMany({
    where: { unidadId, estado: { in: [...VIGENTES] }, persona: { deletedAt: null, anonimizada: false } },
    include: includePersona,
    orderBy: [{ principal: "desc" }, { createdAt: "asc" }],
  });
  const misTitulares = vinculos.filter((v) => ctx.personaIds.includes(v.personaId) && esVinculoTitular(v));
  if (!gestor && !misTitulares.length)
    throw new AppError("Solo el titular de la unidad (propietario o arrendatario) puede gestionar los accesos del hogar.", 403);
  const grupoHogar = vinculos.some((v) => v.tipo === "ARRENDATARIO" && esVinculoTitular(v)) ? "OCUPANTES" : "PROPIETARIOS";
  return { unidad, vinculos, byId: new Map(vinculos.map((v) => [v.id, v])), gestor, misTitulares, grupoHogar };
}

/** ¿El usuario puede editar, pausar o quitar este acceso? */
function puedeGestionar(ctx: Ctx, L: Carga, v: V): boolean {
  if (!L.gestor && ctx.personaIds.includes(v.personaId)) return false; // nadie se gestiona a sí mismo
  if (v.derivadoDeId) {
    if (L.gestor) return true;
    const otorgante = L.byId.get(v.derivadoDeId);
    if (!otorgante) return false;
    return L.misTitulares.some((t) => t.id === otorgante.id || grupoTitular(t.tipo) === grupoTitular(otorgante.tipo));
  }
  if (esVinculoTitular(v)) return false; // un titular no se gestiona desde aquí
  if (!v.persona.usuarioId && !esDerivado(v)) return false; // sin cuenta en la app
  if (L.gestor) return true;
  return L.misTitulares.some((t) => grupoTitular(t.tipo) === L.grupoHogar);
}

/** Titular desde el que se otorga un acceso nuevo (o se ajusta uno sin restricción). */
function elegirOtorgante(L: Carga, pedido?: string | null): V {
  const candidatos = L.gestor ? L.vinculos.filter(esVinculoTitular) : L.misTitulares;
  if (pedido) {
    const c = candidatos.find((v) => v.id === pedido);
    if (!c) throw new AppError("Ese titular no puede otorgar accesos en esta unidad.", 403);
    return c;
  }
  if (!candidatos.length) throw new AppError("La unidad no tiene un titular activo (propietario o arrendatario) que otorgue el acceso.");
  const puntaje = (v: V) => (grupoTitular(v.tipo) === L.grupoHogar ? 2 : 0) + (v.principal ? 1 : 0);
  return [...candidatos].sort((a, b) => puntaje(b) - puntaje(a))[0];
}

/** Lo máximo que puede otorgar un titular: sus permisos efectivos en esa unidad y si ve la cuenta. */
async function techoDe(ctx: Ctx, t: V): Promise<Techo> {
  const tieneCuenta = t.tipo === "PROPIETARIO" || t.tipo === "COPROPIETARIO" || t.puedeVerCuenta;
  let permisosRol: ReadonlySet<string> | null = null;
  if (t.persona.usuarioId) {
    const m = await ctx.db.membresiaConjunto.findFirst({ where: { usuarioId: t.persona.usuarioId, estado: "ACTIVA" }, include: { rol: true } });
    if (m) permisosRol = await loadRolePerms(m.rolId, m.rol.version);
  }
  // Titular sin cuenta en la app (p. ej. propietario que no se ha registrado): permisos por defecto de su tipo.
  permisosRol ??= new Set(defaultPermsFor(t.tipo === "PROPIETARIO" || t.tipo === "COPROPIETARIO" ? "PROPIETARIO" : "RESIDENTE"));
  if (!esDerivado(t)) return { permisos: permisosRol, tieneCuenta };
  const r = resolverAcceso({ rolResidencial: true, permisosRol, vinculos: [{ ...t, derivadoDe: null }] });
  return { permisos: r.permisos, tieneCuenta };
}

function capsOError(caps: readonly unknown[]): CapacidadKey[] {
  const out = normalizarCapacidades(caps);
  if (!out.length) throw new AppError("Elige al menos una cosa que esta persona pueda hacer en la app.", 400, { capacidades: "Elige al menos una" });
  return out;
}

function assertTecho(caps: CapacidadKey[], techo: Techo, actorEsOtorgante: boolean) {
  const exc = excedentes(caps, techo);
  if (exc.length) {
    const lista = exc.map((c) => CAPACIDADES[c].label.toLowerCase()).join(", ");
    throw new AppError(`No se puede dar más acceso del que tiene ${actorEsOtorgante ? "quien lo otorga (tú)" : "el titular que lo otorga"}: ${lista}.`, 403, {
      capacidades: "Excede el acceso del titular",
    });
  }
}

const labelsCaps = (caps: readonly string[]) =>
  normalizarCapacidades(caps)
    .map((c) => CAPACIDADES[c].label.toLowerCase())
    .join(", ") || "ninguna";

function esDelActor(ctx: Ctx, v: V) {
  return v.persona.usuarioId === ctx.userId;
}

// ─────────────────────────── Consultas ───────────────────────────

export type MiembroAcceso = {
  id: string;
  nombre: string;
  fotoUrl: string | null;
  email: string | null;
  tipo: string;
  estado: string;
  pausado: boolean;
  derivado: boolean;
  esTitular: boolean;
  menor: boolean;
  capacidades: CapacidadKey[];
  otorgadoPor: string | null;
  ultimoAcceso: Date | null;
  puedeGestionar: boolean;
  /** Capacidades que se le pueden dar (techo de quien otorga). */
  otorgables: CapacidadKey[];
};

export type InvitacionAcceso = {
  id: string;
  email: string;
  nombre: string | null;
  telefono: string | null;
  tipo: string | null;
  capacidades: CapacidadKey[];
  expira: Date;
  vencida: boolean;
  otorgadoPor: string | null;
  puedeGestionar: boolean;
};

/** Todo lo que necesita la pantalla "Accesos de mi hogar" para una unidad. */
export async function panelAccesos(ctx: Ctx, unidadId: string) {
  const L = await cargar(ctx, unidadId);
  const techos = new Map<string, Techo>();
  const techo = async (t: V) => {
    if (!techos.has(t.id)) techos.set(t.id, await techoDe(ctx, t));
    return techos.get(t.id)!;
  };
  const titulares = L.vinculos.filter((v) => esVinculoTitular(v) && (!esDerivado(v) || ctx.personaIds.includes(v.personaId)));
  const candidatos = L.gestor ? L.vinculos.filter(esVinculoTitular) : L.misTitulares;
  const otorgantes = await Promise.all(
    candidatos.map(async (t) => ({ id: t.id, nombre: nombreCompleto(t.persona), tipo: t.tipo, otorgables: capacidadesOtorgables(await techo(t)) })),
  );
  const porDefecto = candidatos.length ? elegirOtorgante(L).id : null;

  const miembros: MiembroAcceso[] = [];
  for (const v of L.vinculos) {
    if (titulares.includes(v)) continue;
    if (!esDerivado(v) && !v.persona.usuarioId) continue; // personas sin cuenta: se gestionan en Mi hogar
    if (!L.gestor && ctx.personaIds.includes(v.personaId)) continue;
    const otorgante = v.derivadoDeId ? L.byId.get(v.derivadoDeId) : porDefecto ? L.byId.get(porDefecto) : undefined;
    const gestionable = puedeGestionar(ctx, L, v);
    miembros.push({
      id: v.id,
      nombre: nombreCompleto(v.persona),
      fotoUrl: v.persona.fotoUrl,
      email: v.persona.usuario?.email ?? v.persona.email,
      tipo: v.tipo,
      estado: v.estado,
      pausado: v.accesoPausado,
      derivado: esDerivado(v),
      esTitular: esVinculoTitular(v),
      menor: (edad(v.persona.fechaNacimiento) ?? 99) < 18,
      capacidades: normalizarCapacidades(v.capacidadesHogar),
      otorgadoPor: v.derivadoDeId ? (otorgante ? (esDelActor(ctx, otorgante) ? "ti" : nombreCompleto(otorgante.persona)) : "un titular anterior") : null,
      ultimoAcceso: v.persona.usuario?.ultimoAcceso ?? null,
      puedeGestionar: gestionable,
      otorgables: gestionable && otorgante ? capacidadesOtorgables(await techo(otorgante)) : [],
    });
  }

  const invs = await ctx.db.invitacion.findMany({ where: { unidadId, estado: "PENDIENTE", derivadoDeId: { not: null } }, orderBy: { createdAt: "desc" } });
  const ahora = new Date();
  const invitaciones: InvitacionAcceso[] = invs.map((i) => {
    const otorgante = L.byId.get(i.derivadoDeId!);
    const gestionable = L.gestor || (!!otorgante && L.misTitulares.some((t) => t.id === otorgante.id || grupoTitular(t.tipo) === grupoTitular(otorgante.tipo)));
    return {
      id: i.id,
      email: i.email,
      nombre: i.nombre,
      telefono: i.telefono,
      tipo: i.tipoVinculo,
      capacidades: normalizarCapacidades(i.capacidadesHogar),
      expira: i.expira,
      vencida: i.expira < ahora,
      otorgadoPor: otorgante ? (esDelActor(ctx, otorgante) ? "ti" : nombreCompleto(otorgante.persona)) : null,
      puedeGestionar: gestionable,
    };
  });

  return {
    unidad: L.unidad,
    gestor: L.gestor,
    titulares: titulares.map((t) => ({
      id: t.id,
      nombre: nombreCompleto(t.persona),
      fotoUrl: t.persona.fotoUrl,
      tipo: t.tipo,
      principal: t.principal,
      esYo: esDelActor(ctx, t),
      conCuenta: !!t.persona.usuarioId,
    })),
    miembros,
    invitaciones,
    otorgantes,
    porDefecto,
  };
}

/** Unidades donde el usuario es titular (para el selector de la pantalla de accesos). */
export async function unidadesComoTitular(ctx: Ctx) {
  if (!ctx.personaIds.length) return [];
  const vs = await ctx.db.vinculoUnidad.findMany({
    where: {
      personaId: { in: ctx.personaIds },
      estado: "ACTIVO",
      accesoPausado: false,
      unidadId: { in: ctx.unidadIds },
      OR: [{ tipo: { in: [...TIPOS_TITULAR] } }, { principal: true, derivadoDeId: null }],
    },
    select: { unidad: { select: { id: true, codigo: true } } },
  });
  const map = new Map(vs.map((v) => [v.unidad.id, v.unidad]));
  return [...map.values()].sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
}

/** Accesos derivados del usuario actual (para "Tu acceso lo otorgó…"). */
export async function miAccesoDerivado(ctx: Ctx) {
  if (!ctx.personaIds.length) return [];
  const vs = await ctx.db.vinculoUnidad.findMany({
    where: {
      personaId: { in: ctx.personaIds },
      estado: { in: [...VIGENTES] },
      OR: [{ derivadoDeId: { not: null } }, { capacidadesHogar: { isEmpty: false } }],
    },
    include: { unidad: { select: { id: true, codigo: true } }, derivadoDe: { include: { persona: { select: { nombres: true, apellidos: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  return vs.map((v) => ({
    id: v.id,
    unidadId: v.unidadId,
    unidadCodigo: v.unidad.codigo,
    tipo: v.tipo,
    estado: v.estado,
    pausado: v.accesoPausado || !!v.derivadoDe?.accesoPausado,
    capacidades: normalizarCapacidades(v.capacidadesHogar),
    otorgadoPor: v.derivadoDe ? nombreCompleto(v.derivadoDe.persona) : null,
  }));
}

// ─────────────────────────── Mutaciones ───────────────────────────

export type InvitarMiembroInput = {
  unidadId: string;
  email: string;
  nombre?: string | null;
  telefono?: string | null;
  tipoVinculo: TipoDerivado;
  capacidades: string[];
  /** Solo administración (o titular con varios vínculos): titular desde el que se otorga. */
  derivadoDeId?: string | null;
};

/** Invita a un miembro del hogar con capacidades acotadas. Al aceptar, su vínculo queda derivado del titular. */
export async function invitarMiembro(ctx: Ctx, input: InvitarMiembroInput) {
  const L = await cargar(ctx, input.unidadId);
  const otorgante = elegirOtorgante(L, input.derivadoDeId);
  if (input.tipoVinculo === "ARRENDATARIO" && otorgante.tipo !== "PROPIETARIO" && otorgante.tipo !== "COPROPIETARIO") {
    throw new AppError("Solo el propietario puede dar acceso a un arrendatario.", 403, { tipoVinculo: "Solo el propietario" });
  }
  const caps = capsOError(input.capacidades);
  assertTecho(caps, await techoDe(ctx, otorgante), esDelActor(ctx, otorgante));
  const email = input.email.trim().toLowerCase();
  if (L.vinculos.some((v) => v.persona.usuario?.email === email)) {
    throw new AppError("Esa persona ya tiene acceso a esta unidad. Ajusta sus permisos desde la lista.", 400, { email: "Ya tiene acceso" });
  }
  // Si ya vive en la unidad registrada sin cuenta (p. ej. desde Mi hogar), su vínculo se convierte al aceptar.
  const sinCuenta = L.vinculos.find((v) => !v.persona.usuarioId && v.persona.email?.toLowerCase() === email);
  const r = await invitarUsuario(ctx, {
    email,
    nombre: input.nombre,
    telefono: input.telefono,
    unidadId: input.unidadId,
    personaId: sinCuenta?.personaId ?? null,
    tipoVinculo: input.tipoVinculo,
    rolClave: "RESIDENTE",
    derivadoDeId: otorgante.id,
    capacidadesHogar: caps,
  });
  await audit(ctx, "otorgar_acceso", "Invitacion", r.id, undefined, {
    email,
    unidad: L.unidad.codigo,
    tipo: input.tipoVinculo,
    capacidades: caps,
    otorgadoPor: nombreCompleto(otorgante.persona),
  });
  return r;
}

async function cargarVinculo(ctx: Ctx, vinculoId: string) {
  const base = await ctx.db.vinculoUnidad.findUnique({ where: { id: vinculoId }, select: { unidadId: true } });
  if (!base) notFound("El acceso");
  const L = await cargar(ctx, base.unidadId);
  const v = L.byId.get(vinculoId);
  if (!v) throw new AppError("Ese acceso ya no está activo.", 404);
  if (!puedeGestionar(ctx, L, v)) throw new AppError("No puedes cambiar el acceso de esta persona: lo gestiona otro titular o la administración.", 403);
  return { L, v };
}

/** Si un acceso derivado otorga a su vez (p. ej. arrendatario → su familia), sus derivados no pueden quedar por encima. */
async function recortarDerivados(ctx: Ctx, padreId: string, capsPadre: readonly string[], visitados = new Set<string>()) {
  if (visitados.has(padreId)) return;
  visitados.add(padreId);
  const hijos = await ctx.db.vinculoUnidad.findMany({
    where: { derivadoDeId: padreId, estado: { in: [...VIGENTES] } },
    select: { id: true, capacidadesHogar: true },
  });
  for (const h of hijos) {
    const nuevas = h.capacidadesHogar.filter((c) => capsPadre.includes(c));
    if (nuevas.length !== h.capacidadesHogar.length) {
      await ctx.db.vinculoUnidad.update({ where: { id: h.id }, data: { capacidadesHogar: nuevas, puedeVerCuenta: nuevas.includes("cuenta") } });
      await audit(ctx, "recortar_acceso", "VinculoUnidad", h.id, { capacidades: h.capacidadesHogar }, { capacidades: nuevas });
    }
    await recortarDerivados(ctx, h.id, nuevas, visitados);
  }
  const invs = await ctx.db.invitacion.findMany({ where: { derivadoDeId: padreId, estado: "PENDIENTE" }, select: { id: true, capacidadesHogar: true } });
  for (const i of invs) {
    const nuevas = i.capacidadesHogar.filter((c) => capsPadre.includes(c));
    if (nuevas.length !== i.capacidadesHogar.length) await ctx.db.invitacion.update({ where: { id: i.id }, data: { capacidadesHogar: nuevas } });
  }
}

/** Cambia lo que puede hacer un miembro (si no tenía restricciones, su acceso pasa a ser derivado del titular). */
export async function editarCapacidades(ctx: Ctx, input: { vinculoId: string; capacidades: string[]; derivadoDeId?: string | null }) {
  const { L, v } = await cargarVinculo(ctx, input.vinculoId);
  const otorgante = v.derivadoDeId ? L.byId.get(v.derivadoDeId) : elegirOtorgante(L, input.derivadoDeId);
  if (!otorgante) throw new AppError("El titular que otorgó este acceso ya no está activo.");
  const caps = capsOError(input.capacidades);
  assertTecho(caps, await techoDe(ctx, otorgante), esDelActor(ctx, otorgante));
  const antes = normalizarCapacidades(v.capacidadesHogar);
  await ctx.db.vinculoUnidad.update({
    where: { id: v.id },
    data: { derivadoDeId: otorgante.id, capacidadesHogar: caps, puedeVerCuenta: caps.includes("cuenta") },
  });
  await recortarDerivados(ctx, v.id, caps);
  await audit(
    ctx,
    "editar_acceso",
    "VinculoUnidad",
    v.id,
    { capacidades: antes, derivadoDeId: v.derivadoDeId },
    { capacidades: caps, derivadoDeId: otorgante.id, persona: nombreCompleto(v.persona), unidad: L.unidad.codigo },
  );
  if (v.persona.usuarioId) {
    await notify({
      conjuntoId: ctx.conjuntoId,
      usuarioIds: [v.persona.usuarioId],
      titulo: "Tu acceso al hogar cambió",
      cuerpo: `${ctx.nombre} actualizó lo que puedes hacer en la app para ${L.unidad.codigo}: ${labelsCaps(caps)}.`,
      enlace: "/perfil",
      tipo: "RESIDENTES",
    });
  }
  return { capacidades: caps };
}

/** Pausa o reanuda el acceso de un miembro (su vínculo físico con la unidad sigue activo). */
export async function pausarAcceso(ctx: Ctx, input: { vinculoId: string; pausar: boolean }) {
  const { L, v } = await cargarVinculo(ctx, input.vinculoId);
  if (!esDerivado(v)) throw new AppError("Primero ajusta los permisos de esta persona; después podrás pausar su acceso.");
  if (v.accesoPausado === input.pausar) return { pausado: input.pausar };
  await ctx.db.vinculoUnidad.update({ where: { id: v.id }, data: { accesoPausado: input.pausar } });
  await audit(
    ctx,
    input.pausar ? "pausar_acceso" : "reanudar_acceso",
    "VinculoUnidad",
    v.id,
    { accesoPausado: v.accesoPausado },
    { accesoPausado: input.pausar, persona: nombreCompleto(v.persona), unidad: L.unidad.codigo },
  );
  if (v.persona.usuarioId) {
    await notify({
      conjuntoId: ctx.conjuntoId,
      usuarioIds: [v.persona.usuarioId],
      titulo: input.pausar ? "Tu acceso al hogar está en pausa" : "Tu acceso al hogar se reanudó",
      cuerpo: input.pausar
        ? `${ctx.nombre} pausó tu acceso a la app para ${L.unidad.codigo}. Mientras tanto no podrás autorizar visitas ni usar las funciones del hogar.`
        : `${ctx.nombre} reanudó tu acceso a la app para ${L.unidad.codigo}.`,
      enlace: "/perfil",
      tipo: "RESIDENTES",
    });
  }
  return { pausado: input.pausar };
}

/** Quita el acceso: termina el vínculo, los accesos que dependían de él y, si queda sin vínculos, su membresía. */
export async function quitarAcceso(ctx: Ctx, input: { vinculoId: string }) {
  const { L, v } = await cargarVinculo(ctx, input.vinculoId);
  await ctx.db.vinculoUnidad.update({ where: { id: v.id }, data: { estado: "INACTIVO", fechaFin: new Date(), accesoPausado: false } });
  const motivo = `${ctx.nombre} quitó el acceso de ${nombreCompleto(v.persona)} a ${L.unidad.codigo}`;
  await audit(
    ctx,
    "quitar_acceso",
    "VinculoUnidad",
    v.id,
    { estado: v.estado, capacidades: v.capacidadesHogar },
    { estado: "INACTIVO", persona: nombreCompleto(v.persona), unidad: L.unidad.codigo },
  );
  await terminarAccesosDerivados(ctx, [v.id], motivo);
  if (v.tipo === "ARRENDATARIO") {
    const otros = await ctx.db.vinculoUnidad.count({ where: { unidadId: v.unidadId, tipo: "ARRENDATARIO", estado: "ACTIVO" } });
    if (otros === 0) await ctx.db.unidad.updateMany({ where: { id: v.unidadId, estadoOcupacion: "ARRENDADA" }, data: { estadoOcupacion: "DESOCUPADA" } });
  }
  if (VINCULOS_HABITAN.includes(v.tipo)) await sincronizarBanderasUnidades(ctx, [v.unidadId]);
  if (v.persona.usuarioId) {
    await desactivarSiSinVinculos(ctx, v.persona.usuarioId, motivo);
    await notify({
      conjuntoId: ctx.conjuntoId,
      usuarioIds: [v.persona.usuarioId],
      titulo: "Tu acceso al hogar terminó",
      cuerpo: `${ctx.nombre} quitó tu acceso a la app para la unidad ${L.unidad.codigo}.`,
      enlace: "/inicio",
      tipo: "RESIDENTES",
      canales: ["push", "email"],
    });
  }
  return true;
}

async function cargarInvitacion(ctx: Ctx, invitacionId: string) {
  const inv = await ctx.db.invitacion.findUnique({ where: { id: invitacionId } });
  if (!inv || !inv.unidadId || !inv.derivadoDeId) notFound("La invitación");
  if (inv.estado !== "PENDIENTE") throw new AppError("Esta invitación ya fue aceptada o cancelada.");
  const L = await cargar(ctx, inv.unidadId);
  const otorgante = L.byId.get(inv.derivadoDeId);
  if (!otorgante) throw new AppError("El titular que otorgó esta invitación ya no está activo.");
  const ok = L.gestor || L.misTitulares.some((t) => t.id === otorgante.id || grupoTitular(t.tipo) === grupoTitular(otorgante.tipo));
  if (!ok) throw new AppError("Esta invitación la gestiona otro titular.", 403);
  return { inv, L, otorgante };
}

/** Genera un enlace nuevo (el anterior deja de servir) y lo devuelve para compartir por WhatsApp. */
export async function reenviarInvitacion(ctx: Ctx, invitacionId: string) {
  const { inv, L, otorgante } = await cargarInvitacion(ctx, invitacionId);
  const caps = capsOError(inv.capacidadesHogar);
  assertTecho(caps, await techoDe(ctx, otorgante), esDelActor(ctx, otorgante));
  const r = await invitarUsuario(ctx, {
    email: inv.email,
    nombre: inv.nombre,
    telefono: inv.telefono,
    unidadId: L.unidad.id,
    personaId: inv.personaId,
    tipoVinculo: inv.tipoVinculo,
    rolClave: inv.rolClave,
    derivadoDeId: otorgante.id,
    capacidadesHogar: caps,
  });
  await audit(ctx, "reenviar_invitacion", "Invitacion", r.id, { anterior: inv.id }, { email: inv.email, unidad: L.unidad.codigo });
  return r;
}

export async function cancelarInvitacion(ctx: Ctx, invitacionId: string) {
  const { inv, L } = await cargarInvitacion(ctx, invitacionId);
  await ctx.db.invitacion.update({ where: { id: inv.id }, data: { estado: "REVOCADA" } });
  await audit(ctx, "cancelar_invitacion", "Invitacion", inv.id, { estado: inv.estado }, { estado: "REVOCADA", email: inv.email, unidad: L.unidad.codigo });
  return true;
}
