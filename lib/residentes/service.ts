import { Prisma, type EstadoOcupacion, type TipoDocumento, type TipoVehiculo, type TipoVinculo } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/events";
import { AppError, notFound } from "@/lib/errors";
import { can, seesAll } from "@/lib/permisos";
import { notify, usuariosConPermiso, usuariosDeUnidad } from "@/lib/notificaciones";
import { nombreCompleto } from "@/lib/format";
import {
  VINCULOS_HABITAN,
  VINCULOS_PERSONAL,
  calcularIndicadores,
  datosAnonimizados,
  fechaCorteEdad,
  normalizarHorario,
  normalizarPlaca,
  placaValida,
  reglaVinculoResidente,
  EDAD_ADULTO_MAYOR,
  MAYORIA_EDAD,
} from "./calculos";

// ─────────────────────────── Acceso ───────────────────────────

/** ¿Gestiona residentes de todo el conjunto (admin, asistente, consejo…)? */
export function gestionaResidentes(ctx: Ctx) {
  return seesAll(ctx, "residentes");
}

/** Lanza 403 si el usuario no puede ver/gestionar la unidad (sin `residentes.ver_todos` solo sus unidades). */
export function assertUnidadAccesible(ctx: Ctx, unidadId: string, modulo: "residentes" | "vehiculos" = "residentes") {
  if (seesAll(ctx, modulo)) return;
  if (!ctx.unidadIds.includes(unidadId)) throw new AppError("Solo puedes gestionar la información de tus unidades.", 403);
}

export function esPropietarioDe(ctx: Ctx, unidadId: string) {
  return ctx.unidadesPropias.includes(unidadId);
}

/** Persona del usuario en el conjunto activo (la de su cuenta). */
export async function miPersona(ctx: Ctx) {
  return ctx.db.persona.findFirst({ where: { usuarioId: ctx.userId, anonimizada: false }, orderBy: { createdAt: "asc" } });
}

// ─────────────────────────── Consultas ───────────────────────────

export type FiltrosPersonas = {
  q?: string;
  torre?: string;
  tipo?: string;
  estado?: string;
  grupo?: string; // MENORES | MAYORES | MOVILIDAD | CON_CUENTA
  unidad?: string;
};

export function wherePersonas(f: FiltrosPersonas, ref = new Date()): Prisma.PersonaWhereInput {
  const vinc: Prisma.VinculoUnidadWhereInput = { deletedAt: null };
  if (f.estado) vinc.estado = f.estado as never;
  if (f.tipo) vinc.tipo = f.tipo as never;
  if (f.torre) vinc.unidad = f.torre === "casas" ? { torreId: null } : { torreId: f.torre };
  if (f.unidad) vinc.unidadId = f.unidad;
  const where: Prisma.PersonaWhereInput = { anonimizada: false, vinculos: { some: vinc } };
  const and: Prisma.PersonaWhereInput[] = [];
  if (f.q) {
    const q = f.q.trim();
    const partes = q.split(/\s+/).filter(Boolean);
    and.push({
      OR: [
        { numeroDocumento: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { telefono: { contains: q } },
        { vinculos: { some: { deletedAt: null, unidad: { codigo: { contains: q, mode: "insensitive" } } } } },
        { AND: partes.map((p) => ({ OR: [{ nombres: { contains: p, mode: "insensitive" as const } }, { apellidos: { contains: p, mode: "insensitive" as const } }] })) },
      ],
    });
  }
  if (f.grupo === "MENORES") and.push({ fechaNacimiento: { gt: fechaCorteEdad(MAYORIA_EDAD, ref) } });
  if (f.grupo === "MAYORES") and.push({ fechaNacimiento: { lte: fechaCorteEdad(EDAD_ADULTO_MAYOR, ref) } });
  if (f.grupo === "MOVILIDAD") and.push({ OR: [{ movilidadReducida: true }, { requiereAsistenciaEvacuacion: true }] });
  if (f.grupo === "CON_CUENTA") and.push({ usuarioId: { not: null } });
  if (and.length) where.AND = and;
  return where;
}

export async function listarPersonas(ctx: Ctx, f: FiltrosPersonas, page: { skip: number; take: number }) {
  const where = wherePersonas(f);
  if (!gestionaResidentes(ctx)) where.vinculos = { some: { deletedAt: null, unidadId: { in: ctx.unidadIds } } };
  const [rows, total] = await Promise.all([
    ctx.db.persona.findMany({
      where,
      include: { vinculos: { where: { deletedAt: null, estado: { in: ["ACTIVO", "PENDIENTE_APROBACION"] } }, include: { unidad: { select: { id: true, codigo: true } } } } },
      orderBy: [{ apellidos: "asc" }, { nombres: "asc" }],
      skip: page.skip,
      take: page.take,
    }),
    ctx.db.persona.count({ where }),
  ]);
  return { rows, total };
}

/** Detalle de una persona. Un residente solo puede ver personas vinculadas a sus unidades (o a sí mismo). */
export async function obtenerPersona(ctx: Ctx, id: string) {
  const p = await ctx.db.persona.findUnique({
    where: { id },
    include: {
      vinculos: {
        where: { deletedAt: null },
        include: { unidad: { include: { torre: { select: { nombre: true } } } } },
        orderBy: [{ estado: "asc" }, { fechaInicio: "desc" }],
      },
      usuario: { select: { id: true, email: true, ultimoAcceso: true, estado: true } },
    },
  });
  if (!p) notFound("La persona");
  if (!gestionaResidentes(ctx) && p.usuarioId !== ctx.userId && !p.vinculos.some((v) => ctx.unidadIds.includes(v.unidadId))) notFound("La persona");
  return p;
}

/** Personas vinculadas (activas o pendientes) a una unidad, para el panel del residente y la ficha. */
export async function vinculosDeUnidad(ctx: Ctx, unidadId: string) {
  assertUnidadAccesible(ctx, unidadId);
  return ctx.db.vinculoUnidad.findMany({
    where: { unidadId, estado: { in: ["ACTIVO", "PENDIENTE_APROBACION"] }, persona: { deletedAt: null, anonimizada: false } },
    include: { persona: true },
    orderBy: [{ principal: "desc" }, { tipo: "asc" }, { createdAt: "asc" }],
  });
}

/** Ficha física de la unidad visible para el residente (sin información financiera). */
export async function fichaFisica(ctx: Ctx, unidadId: string) {
  assertUnidadAccesible(ctx, unidadId);
  const u = await ctx.db.unidad.findUnique({
    where: { id: unidadId },
    include: {
      torre: { select: { nombre: true } },
      parqueaderos: { where: { deletedAt: null }, select: { id: true, codigo: true, tipo: true, ubicacion: true } },
      bodegas: { where: { deletedAt: null }, select: { id: true, codigo: true, ubicacion: true, area: true } },
    },
  });
  if (!u) notFound("La unidad");
  return u;
}

// ─────────────────────────── Personas ───────────────────────────

export type PersonaInput = {
  tipoDocumento?: TipoDocumento;
  numeroDocumento?: string;
  nombres?: string;
  apellidos?: string;
  fechaNacimiento?: Date | null;
  genero?: string | null;
  fotoUrl?: string | null;
  telefono?: string | null;
  email?: string | null;
  eps?: string | null;
  contactoEmergenciaNombre?: string | null;
  contactoEmergenciaTelefono?: string | null;
  ocupacion?: string | null;
  movilidadReducida?: boolean;
  movilidadDescripcion?: string | null;
  requiereAsistenciaEvacuacion?: boolean;
  tipoSangre?: string | null;
  observaciones?: string | null;
};

export type VinculoInput = {
  unidadId: string;
  tipo: TipoVinculo;
  principal?: boolean;
  porcentajePropiedad?: number | null;
  horario?: { dias?: (string | number)[] | null; desde?: string | null; hasta?: string | null } | null;
  puedeVerCuenta?: boolean;
  fechaInicio?: Date | null;
  fechaFin?: Date | null;
};

function limpiar<T extends Record<string, unknown>>(o: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as Partial<T>;
}

function horarioOrError(h: VinculoInput["horario"]) {
  try {
    return normalizarHorario(h ?? null);
  } catch (e) {
    throw new AppError((e as Error).message, 400, { "horario.desde": (e as Error).message });
  }
}

/** ¿Puede el usuario editar los datos de esta persona? Admin, el propio titular, o un residente sobre ocupantes sin cuenta de sus unidades. */
export async function puedeEditarPersona(ctx: Ctx, personaId: string) {
  if (gestionaResidentes(ctx) && can(ctx, "residentes.editar")) return true;
  const p = await ctx.db.persona.findUnique({ where: { id: personaId }, include: { vinculos: { where: { deletedAt: null, estado: { in: ["ACTIVO", "PENDIENTE_APROBACION"] } } } } });
  if (!p) return false;
  if (p.usuarioId === ctx.userId) return true;
  if (!can(ctx, "residentes.editar")) return false;
  if (p.usuarioId) return false; // quien tiene cuenta administra sus propios datos (habeas data)
  return p.vinculos.length > 0 && p.vinculos.every((v) => ctx.unidadIds.includes(v.unidadId) && v.tipo !== "PROPIETARIO" && v.tipo !== "COPROPIETARIO");
}

/** Actualiza los datos de una persona existente. */
export async function actualizarPersona(ctx: Ctx, id: string, input: PersonaInput) {
  if (!(await puedeEditarPersona(ctx, id))) throw new AppError("No puedes editar los datos de esta persona.", 403);
  const antes = await ctx.db.persona.findUnique({ where: { id } });
  if (!antes || antes.anonimizada) notFound("La persona");
  const data = limpiar({ ...input, numeroDocumento: input.numeroDocumento?.trim() });
  const p = await ctx.db.persona.update({ where: { id }, data });
  if (input.movilidadReducida !== undefined || input.requiereAsistenciaEvacuacion !== undefined) {
    const vs = await ctx.db.vinculoUnidad.findMany({ where: { personaId: id, estado: "ACTIVO" }, select: { unidadId: true } });
    await sincronizarBanderasUnidades(ctx, vs.map((v) => v.unidadId));
  }
  await audit(ctx, "editar", "Persona", id, antes, p);
  return p;
}

/**
 * Registra una persona y su vínculo con una unidad. Si ya existe alguien con ese documento en el conjunto
 * se reutiliza (solo se agrega el vínculo). Reglas para residentes en `reglaVinculoResidente`.
 */
export async function registrarPersona(ctx: Ctx, persona: PersonaInput & { tipoDocumento: TipoDocumento; numeroDocumento: string; nombres: string; apellidos: string }, vinculo: VinculoInput) {
  assertUnidadAccesible(ctx, vinculo.unidadId);
  const unidad = await ctx.db.unidad.findUnique({ where: { id: vinculo.unidadId }, select: { id: true, codigo: true } });
  if (!unidad) notFound("La unidad");
  const numero = persona.numeroDocumento.trim();
  let existente = await ctx.db.persona.findFirst({ where: { tipoDocumento: persona.tipoDocumento, numeroDocumento: numero, anonimizada: false } });
  let p;
  if (existente) {
    // Solo se actualizan datos si quien registra puede editar a esa persona (evita sobrescribir datos ajenos).
    if (await puedeEditarPersona(ctx, existente.id)) {
      existente = await ctx.db.persona.update({ where: { id: existente.id }, data: limpiar({ ...persona, numeroDocumento: numero }) });
    }
    p = existente;
  } else {
    p = await ctx.db.persona.create({
      data: {
        ...(limpiar(persona) as Prisma.PersonaUncheckedCreateInput),
        numeroDocumento: numero,
        conjuntoId: ctx.conjuntoId,
      },
    });
    await audit(ctx, "crear", "Persona", p.id, undefined, p);
  }
  const v = await crearVinculo(ctx, p.id, vinculo);
  return { persona: p, vinculo: v, reutilizada: !!existente };
}

/** Crea un vínculo persona ↔ unidad aplicando las reglas de aprobación de arrendatarios. */
export async function crearVinculo(ctx: Ctx, personaId: string, input: VinculoInput) {
  assertUnidadAccesible(ctx, input.unidadId);
  const gestor = gestionaResidentes(ctx);
  let estado: "ACTIVO" | "PENDIENTE_APROBACION" = "ACTIVO";
  if (!gestor) {
    const regla = reglaVinculoResidente(input.tipo, esPropietarioDe(ctx, input.unidadId));
    if (!regla.permitido) throw new AppError(regla.motivo ?? "No puedes registrar este tipo de vínculo.", 403, { tipo: regla.motivo ?? "No permitido" });
    estado = regla.estado;
  }
  const duplicado = await ctx.db.vinculoUnidad.findFirst({ where: { personaId, unidadId: input.unidadId, tipo: input.tipo, estado: { in: ["ACTIVO", "PENDIENTE_APROBACION"] } } });
  if (duplicado) throw new AppError("Esa persona ya tiene ese vínculo con la unidad.");
  if (input.porcentajePropiedad != null && (input.porcentajePropiedad <= 0 || input.porcentajePropiedad > 100)) throw new AppError("El porcentaje de propiedad debe estar entre 0 y 100.", 400, { porcentajePropiedad: "Entre 0 y 100" });
  const horario = VINCULOS_PERSONAL.includes(input.tipo) ? horarioOrError(input.horario) : null;
  const v = await ctx.db.vinculoUnidad.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      personaId,
      unidadId: input.unidadId,
      tipo: input.tipo,
      principal: input.principal ?? false,
      porcentajePropiedad: input.porcentajePropiedad ?? null,
      horarioPermitido: horario ?? undefined,
      puedeVerCuenta: gestor || esPropietarioDe(ctx, input.unidadId) ? (input.puedeVerCuenta ?? false) : false,
      fechaInicio: input.fechaInicio ?? new Date(),
      fechaFin: input.fechaFin ?? null,
      estado,
      aprobadoPorId: estado === "ACTIVO" && gestor && ctx.userId !== "sistema" ? ctx.userId : null,
    },
    include: { persona: true, unidad: { select: { codigo: true } } },
  });
  await audit(ctx, "crear", "VinculoUnidad", v.id, undefined, { persona: nombreCompleto(v.persona), unidad: v.unidad.codigo, tipo: v.tipo, estado });
  if (estado === "PENDIENTE_APROBACION") {
    const admins = await usuariosConPermiso(ctx.conjuntoId, ["residentes.aprobar"]);
    await notify({
      conjuntoId: ctx.conjuntoId,
      usuarioIds: admins,
      titulo: "Vínculo por aprobar",
      cuerpo: `${ctx.nombre} registró a ${nombreCompleto(v.persona)} como ${v.tipo === "ARRENDATARIO" ? "arrendatario" : "copropietario"} de ${v.unidad.codigo}.`,
      enlace: "/residentes/aprobaciones",
      tipo: "RESIDENTES",
      canales: ["push", "email"],
    });
  }
  if (VINCULOS_HABITAN.includes(input.tipo)) await sincronizarBanderasUnidades(ctx, [input.unidadId]);
  return v;
}

async function vinculoAccesible(ctx: Ctx, id: string) {
  const v = await ctx.db.vinculoUnidad.findUnique({ where: { id }, include: { persona: true, unidad: { select: { id: true, codigo: true, estadoOcupacion: true } } } });
  if (!v) notFound("El vínculo");
  assertUnidadAccesible(ctx, v.unidadId);
  return v;
}

/** Edita horario, principal, porcentaje y permiso de ver cuenta de un vínculo. */
export async function actualizarVinculo(ctx: Ctx, id: string, input: Partial<Omit<VinculoInput, "unidadId">>) {
  const v = await vinculoAccesible(ctx, id);
  const gestor = gestionaResidentes(ctx);
  if (!gestor) {
    if (["PROPIETARIO", "COPROPIETARIO", "ARRENDATARIO"].includes(v.tipo) && !esPropietarioDe(ctx, v.unidadId)) throw new AppError("Solo el propietario o la administración pueden cambiar este vínculo.", 403);
    if (input.tipo && input.tipo !== v.tipo) {
      const regla = reglaVinculoResidente(input.tipo, esPropietarioDe(ctx, v.unidadId));
      if (!regla.permitido || regla.estado !== "ACTIVO") throw new AppError(regla.motivo ?? "Para cambiar a ese tipo de vínculo registra uno nuevo.", 403);
    }
  }
  const data: Prisma.VinculoUnidadUncheckedUpdateInput = {};
  if (input.tipo) data.tipo = input.tipo;
  if (input.principal !== undefined) data.principal = input.principal;
  if (input.porcentajePropiedad !== undefined) data.porcentajePropiedad = input.porcentajePropiedad;
  if (input.horario !== undefined) {
    const h = horarioOrError(input.horario);
    data.horarioPermitido = h ?? Prisma.DbNull;
  }
  if (input.puedeVerCuenta !== undefined && (gestor || esPropietarioDe(ctx, v.unidadId))) data.puedeVerCuenta = input.puedeVerCuenta;
  if (input.fechaFin !== undefined) data.fechaFin = input.fechaFin;
  const nuevo = await ctx.db.vinculoUnidad.update({ where: { id }, data });
  await audit(ctx, "editar", "VinculoUnidad", id, v, nuevo);
  return nuevo;
}

/** Finaliza (retira) un vínculo. Si la persona queda sin vínculos y sin cuenta, se anonimiza (minimización de datos). */
export async function finalizarVinculo(ctx: Ctx, id: string) {
  const v = await vinculoAccesible(ctx, id);
  const gestor = gestionaResidentes(ctx) && can(ctx, "residentes.eliminar");
  if (!gestor) {
    if (!can(ctx, "residentes.editar")) throw new AppError("No tienes permiso para retirar personas.", 403);
    if (v.tipo === "PROPIETARIO" || v.tipo === "COPROPIETARIO") throw new AppError("Para retirar un propietario comunícate con la administración.", 403);
    if (v.tipo === "ARRENDATARIO" && !esPropietarioDe(ctx, v.unidadId)) throw new AppError("Solo el propietario puede retirar al arrendatario.", 403);
    if (v.persona.usuarioId === ctx.userId && v.principal) throw new AppError("No puedes retirarte a ti mismo como titular principal.", 403);
  }
  await ctx.db.vinculoUnidad.update({ where: { id }, data: { estado: "INACTIVO", fechaFin: new Date() } });
  await audit(ctx, "finalizar", "VinculoUnidad", id, { estado: v.estado }, { estado: "INACTIVO", persona: nombreCompleto(v.persona), unidad: v.unidad.codigo });
  const restantes = await ctx.db.vinculoUnidad.count({ where: { personaId: v.personaId, estado: { in: ["ACTIVO", "PENDIENTE_APROBACION"] } } });
  if (restantes === 0 && !v.persona.usuarioId) await anonimizarPersona(ctx, v.personaId, "Sin vínculos activos tras retiro");
  if (v.tipo === "ARRENDATARIO" && v.unidad.estadoOcupacion === "ARRENDADA") {
    const otros = await ctx.db.vinculoUnidad.count({ where: { unidadId: v.unidadId, tipo: "ARRENDATARIO", estado: "ACTIVO" } });
    if (otros === 0) await ctx.db.unidad.update({ where: { id: v.unidadId }, data: { estadoOcupacion: "DESOCUPADA" } });
  }
  await sincronizarBanderasUnidades(ctx, [v.unidadId]);
  return true;
}

/** Aprueba o rechaza un vínculo pendiente (arrendatarios y copropietarios registrados por residentes). */
export async function resolverVinculo(ctx: Ctx, id: string, aprobar: boolean, motivo?: string | null) {
  const v = await vinculoAccesible(ctx, id);
  if (v.estado !== "PENDIENTE_APROBACION") throw new AppError("Este vínculo ya fue resuelto.");
  const nuevo = await ctx.db.vinculoUnidad.update({
    where: { id },
    data: { estado: aprobar ? "ACTIVO" : "RECHAZADO", aprobadoPorId: ctx.userId === "sistema" ? null : ctx.userId, ...(aprobar ? {} : { fechaFin: new Date() }) },
  });
  if (aprobar && v.tipo === "ARRENDATARIO" && v.unidad.estadoOcupacion !== "ARRENDADA" && v.unidad.estadoOcupacion !== "AIRBNB_O_SIMILAR") {
    await ctx.db.unidad.update({ where: { id: v.unidadId }, data: { estadoOcupacion: "ARRENDADA" } });
  }
  await audit(ctx, aprobar ? "aprobar_vinculo" : "rechazar_vinculo", "VinculoUnidad", id, { estado: v.estado }, { estado: nuevo.estado, motivo });
  const destinatarios = new Set(await usuariosDeUnidad(ctx.conjuntoId, v.unidadId, { soloPropietarios: true }));
  if (v.persona.usuarioId) destinatarios.add(v.persona.usuarioId);
  await notify({
    conjuntoId: ctx.conjuntoId,
    usuarioIds: [...destinatarios],
    titulo: aprobar ? "Vínculo aprobado" : "Vínculo rechazado",
    cuerpo: aprobar
      ? `La administración aprobó a ${nombreCompleto(v.persona)} en la unidad ${v.unidad.codigo}.`
      : `La administración rechazó el registro de ${nombreCompleto(v.persona)} en ${v.unidad.codigo}.${motivo ? ` Motivo: ${motivo}` : ""}`,
    enlace: "/mi-hogar",
    tipo: "RESIDENTES",
    canales: ["push", "email"],
  });
  await emit({ tipo: aprobar ? "residente.vinculo_aprobado" : "residente.vinculo_rechazado", conjuntoId: ctx.conjuntoId, data: { id, unidadId: v.unidadId, personaId: v.personaId, tipo: v.tipo }, actorId: ctx.userId });
  if (aprobar) await sincronizarBanderasUnidades(ctx, [v.unidadId]);
  return nuevo;
}

export async function pendientesAprobacion(ctx: Ctx) {
  return ctx.db.vinculoUnidad.findMany({
    where: { estado: "PENDIENTE_APROBACION", persona: { deletedAt: null } },
    include: { persona: true, unidad: { select: { id: true, codigo: true } } },
    orderBy: { createdAt: "asc" },
  });
}

// ─────────────────────────── Retiro y anonimización ───────────────────────────

/**
 * Anonimiza una persona (Ley 1581/2012): reemplaza nombre por "Titular retirado", documento por un hash,
 * y borra contacto, salud y foto. Se conserva el registro para la trazabilidad histórica (pagos, bitácora).
 */
export async function anonimizarPersona(ctx: Ctx, id: string, motivo: string) {
  const p = await ctx.db.persona.findUnique({ where: { id } });
  if (!p) notFound("La persona");
  if (p.anonimizada) return p;
  const r = await ctx.db.persona.update({ where: { id }, data: datosAnonimizados(p) });
  await audit(ctx, "anonimizar", "Persona", id, { nombre: nombreCompleto(p) }, { motivo });
  return r;
}

/** Retira a una persona del conjunto (admin): finaliza todos sus vínculos, suspende su acceso residencial y anonimiza. */
export async function retirarPersona(ctx: Ctx, id: string, motivo?: string | null) {
  const p = await obtenerPersona(ctx, id);
  const unidades = [...new Set(p.vinculos.map((v) => v.unidadId))];
  await ctx.db.vinculoUnidad.updateMany({ where: { personaId: id, estado: { in: ["ACTIVO", "PENDIENTE_APROBACION"] } }, data: { estado: "INACTIVO", fechaFin: new Date() } });
  if (p.usuarioId) {
    const m = await ctx.db.membresiaConjunto.findFirst({ where: { usuarioId: p.usuarioId }, include: { rol: true } });
    if (m && ["PROPIETARIO", "RESIDENTE", "CONVIVIENTE"].includes(m.rol.basadoEnClave ?? m.rol.clave)) {
      await ctx.db.membresiaConjunto.update({ where: { id: m.id }, data: { estado: "SUSPENDIDA" } });
    }
  }
  await anonimizarPersona(ctx, id, motivo ?? "Retiro de la persona");
  await ctx.db.persona.update({ where: { id }, data: { usuarioId: null } });
  await sincronizarBanderasUnidades(ctx, unidades);
  await emit({ tipo: "residente.retirado", conjuntoId: ctx.conjuntoId, data: { id }, actorId: ctx.userId });
  return true;
}

// ─────────────────────────── Emergencia ───────────────────────────

/** Marca en la unidad si alguien que la habita tiene movilidad reducida o requiere evacuación asistida. */
export async function sincronizarBanderasUnidades(ctx: Ctx, unidadIds: string[]) {
  for (const unidadId of [...new Set(unidadIds)]) {
    const vs = await ctx.db.vinculoUnidad.findMany({
      where: { unidadId, estado: "ACTIVO", tipo: { in: VINCULOS_HABITAN }, persona: { deletedAt: null, anonimizada: false } },
      select: { persona: { select: { movilidadReducida: true, requiereAsistenciaEvacuacion: true } } },
    });
    await ctx.db.unidad.updateMany({
      where: { id: unidadId },
      data: {
        tienePersonaMovilidadReducida: vs.some((v) => v.persona.movilidadReducida),
        requiereAsistenciaEvacuacion: vs.some((v) => v.persona.requiereAsistenciaEvacuacion || v.persona.movilidadReducida),
      },
    });
  }
}

// ─────────────────────────── Unidad (ocupación declarada por el propietario) ───────────────────────────

export async function actualizarOcupacion(ctx: Ctx, unidadId: string, input: { estadoOcupacion: EstadoOcupacion; plataformaRentaCorta?: string | null; registroRnt?: string | null }) {
  if (!gestionaResidentes(ctx) && !esPropietarioDe(ctx, unidadId)) throw new AppError("Solo el propietario puede declarar la ocupación de la unidad.", 403);
  const antes = await ctx.db.unidad.findUnique({ where: { id: unidadId }, select: { estadoOcupacion: true, plataformaRentaCorta: true, registroRnt: true } });
  if (!antes) notFound("La unidad");
  const renta = input.estadoOcupacion === "AIRBNB_O_SIMILAR";
  if (renta && !input.plataformaRentaCorta) throw new AppError("Indica la plataforma de renta corta.", 400, { plataformaRentaCorta: "Obligatorio para renta corta" });
  const data = { estadoOcupacion: input.estadoOcupacion, plataformaRentaCorta: renta ? input.plataformaRentaCorta ?? null : null, registroRnt: renta ? input.registroRnt ?? null : null };
  await ctx.db.unidad.update({ where: { id: unidadId }, data });
  await audit(ctx, "declarar_ocupacion", "Unidad", unidadId, antes, data);
  return true;
}

// ─────────────────────────── Vehículos ───────────────────────────

export type VehiculoInput = {
  id?: string | null;
  unidadId: string;
  placa: string;
  tipo: TipoVehiculo;
  marca?: string | null;
  modelo?: string | null;
  color?: string | null;
  fotoUrl?: string | null;
  tarjetaPropiedadUrl?: string | null;
  soatVence?: Date | null;
  tecnomecanicaVence?: Date | null;
  parqueaderoId?: string | null;
  activo?: boolean;
};

export async function guardarVehiculo(ctx: Ctx, input: VehiculoInput) {
  const { id, ...raw } = input;
  const placa = normalizarPlaca(raw.placa);
  if (!placaValida(placa, raw.tipo)) throw new AppError("La placa no tiene un formato válido (p. ej. ABC123 para carro o ABC12D para moto).", 400, { placa: "Formato no válido" });
  assertUnidadAccesible(ctx, raw.unidadId, "vehiculos");
  if (raw.parqueaderoId) {
    const pq = await ctx.db.parqueadero.findUnique({ where: { id: raw.parqueaderoId } });
    if (!pq || (!seesAll(ctx, "vehiculos") && pq.unidadId !== raw.unidadId)) throw new AppError("El parqueadero no está asignado a la unidad.", 400, { parqueaderoId: "No válido" });
  }
  const dup = await ctx.db.vehiculo.findFirst({ where: { placa, ...(id ? { id: { not: id } } : {}) }, include: { unidad: { select: { codigo: true } } } });
  if (dup) throw new AppError(`La placa ${placa} ya está registrada${seesAll(ctx, "vehiculos") ? ` en ${dup.unidad.codigo}` : " en el conjunto"}.`, 400, { placa: "Placa ya registrada" });
  const data = { ...raw, placa };
  if (id) {
    const antes = await ctx.db.vehiculo.findUnique({ where: { id } });
    if (!antes) notFound("El vehículo");
    assertUnidadAccesible(ctx, antes.unidadId, "vehiculos");
    const v = await ctx.db.vehiculo.update({ where: { id }, data });
    await audit(ctx, "editar", "Vehiculo", id, antes, v);
    return v;
  }
  // La restricción única (conjunto, placa) incluye registros borrados: se reactiva si existía.
  const borrado = await ctx.db.vehiculo.findFirst({ where: { placa, deletedAt: { not: null } } });
  const v = borrado
    ? await ctx.db.vehiculo.update({ where: { id: borrado.id }, data: { ...data, deletedAt: null, activo: true } })
    : await ctx.db.vehiculo.create({ data: { ...data, conjuntoId: ctx.conjuntoId } });
  await audit(ctx, "crear", "Vehiculo", v.id, undefined, v);
  return v;
}

export async function eliminarVehiculo(ctx: Ctx, id: string) {
  const v = await ctx.db.vehiculo.findUnique({ where: { id } });
  if (!v) notFound("El vehículo");
  assertUnidadAccesible(ctx, v.unidadId, "vehiculos");
  await ctx.db.vehiculo.update({ where: { id }, data: { deletedAt: new Date(), activo: false } });
  await audit(ctx, "eliminar", "Vehiculo", id, v);
  return true;
}

// ─────────────────────────── Mascotas ───────────────────────────

export type MascotaInput = {
  id?: string | null;
  unidadId: string;
  nombre: string;
  especie: string;
  raza?: string | null;
  color?: string | null;
  fotoUrl?: string | null;
  carneVacunasUrl?: string | null;
  antirrabicaVence?: Date | null;
  potencialmentePeligrosa: boolean;
  polizaUrl?: string | null;
  microchip?: string | null;
};

export async function guardarMascota(ctx: Ctx, input: MascotaInput) {
  const { id, ...data } = input;
  assertUnidadAccesible(ctx, data.unidadId, "vehiculos");
  if (id) {
    const antes = await ctx.db.mascota.findUnique({ where: { id } });
    if (!antes) notFound("La mascota");
    assertUnidadAccesible(ctx, antes.unidadId, "vehiculos");
    const m = await ctx.db.mascota.update({ where: { id }, data });
    await audit(ctx, "editar", "Mascota", id, antes, m);
    return m;
  }
  const m = await ctx.db.mascota.create({ data: { ...data, conjuntoId: ctx.conjuntoId } });
  await audit(ctx, "crear", "Mascota", m.id, undefined, m);
  return m;
}

export async function eliminarMascota(ctx: Ctx, id: string) {
  const m = await ctx.db.mascota.findUnique({ where: { id } });
  if (!m) notFound("La mascota");
  assertUnidadAccesible(ctx, m.unidadId, "vehiculos");
  await ctx.db.mascota.update({ where: { id }, data: { deletedAt: new Date(), activo: false } });
  await audit(ctx, "eliminar", "Mascota", id, m);
  return true;
}

// ─────────────────────────── Indicadores ───────────────────────────

export async function indicadoresPoblacion(ctx: Ctx) {
  const [personas, ocupacion, mascotas, vehiculos, pendientes] = await Promise.all([
    ctx.db.persona.findMany({
      where: { anonimizada: false, vinculos: { some: { deletedAt: null, estado: "ACTIVO", tipo: { in: VINCULOS_HABITAN } } } },
      select: {
        fechaNacimiento: true,
        movilidadReducida: true,
        requiereAsistenciaEvacuacion: true,
        vinculos: { where: { deletedAt: null, estado: "ACTIVO", tipo: { in: VINCULOS_HABITAN } }, select: { unidad: { select: { piso: true, torre: { select: { nombre: true } } } } } },
      },
    }),
    ctx.db.unidad.groupBy({ by: ["estadoOcupacion"], _count: true }),
    ctx.db.mascota.groupBy({ by: ["especie"], where: { activo: true }, _count: true }),
    ctx.db.vehiculo.groupBy({ by: ["tipo"], where: { activo: true }, _count: true }),
    ctx.db.vinculoUnidad.count({ where: { estado: "PENDIENTE_APROBACION" } }),
  ]);
  const base = calcularIndicadores(
    personas.map((p) => ({
      fechaNacimiento: p.fechaNacimiento,
      movilidadReducida: p.movilidadReducida,
      requiereAsistenciaEvacuacion: p.requiereAsistenciaEvacuacion,
      unidades: p.vinculos.map((v) => ({ torre: v.unidad.torre?.nombre ?? "Casas", piso: v.unidad.piso ?? 0 })),
    })),
  );
  const occ = Object.fromEntries(ocupacion.map((o) => [o.estadoOcupacion, o._count])) as Record<string, number>;
  return {
    ...base,
    unidades: ocupacion.reduce((a, o) => a + o._count, 0),
    arrendadas: occ.ARRENDADA ?? 0,
    rentaCorta: occ.AIRBNB_O_SIMILAR ?? 0,
    desocupadas: (occ.DESOCUPADA ?? 0) + (occ.EN_VENTA ?? 0),
    ocupacion: ocupacion.map((o) => ({ estado: o.estadoOcupacion, total: o._count })),
    mascotasPorEspecie: mascotas.map((m) => ({ especie: m.especie, total: m._count })).sort((a, b) => b.total - a.total),
    vehiculosPorTipo: vehiculos.map((v) => ({ tipo: v.tipo, total: v._count })).sort((a, b) => b.total - a.total),
    pendientesAprobacion: pendientes,
  };
}

/** Busca personas de todo el sistema por usuario (no aislado): usado para exportar datos del titular. */
export async function personasDelUsuario(usuarioId: string) {
  return prisma.persona.findMany({
    where: { usuarioId, deletedAt: null },
    include: { vinculos: { where: { deletedAt: null }, include: { unidad: { select: { codigo: true, conjuntoId: true } } } } },
  });
}
