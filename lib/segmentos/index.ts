import type { Prisma } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { AppError, notFound } from "@/lib/errors";
import { toNumber } from "@/lib/format";
import { audit } from "@/lib/audit";
import {
  EDAD_ADULTO_MAYOR,
  EDAD_MAYORIA,
  VINCULOS_DESTINATARIOS_DEFECTO,
  enRango,
  esVacia,
  fechaCorteEdad,
  normalizarDef,
  numeroUnidad,
  parseDef,
  tieneFiltrosUnidad,
  type SegmentoDef,
} from "./definicion";

export * from "./definicion";

/**
 * Motor de segmentación reutilizable (muro, correo masivo, encuestas, votaciones, campañas).
 * Todas las funciones reciben el contexto del conjunto (`ctx.db` aislado) y una definición JSON.
 */
export type SegCtx = Pick<Ctx, "db" | "conjuntoId" | "conjunto">;

type TipoVinculoStr = (typeof VINCULOS_DESTINATARIOS_DEFECTO)[number] | string;
const RESIDENCIALES = [...VINCULOS_DESTINATARIOS_DEFECTO] as string[];
const FINANCIEROS = ["PROPIETARIO", "COPROPIETARIO"];

function vinculosDe(def: SegmentoDef): TipoVinculoStr[] {
  return def.vinculos?.length ? def.vinculos : RESIDENCIALES;
}

/** Unidades con saldo vencido neto mayor al mínimo configurado (misma regla que `unidadAlDia`). */
export async function unidadesEnMora(ctx: SegCtx, unidadIds?: string[], hoy = new Date()): Promise<Set<string>> {
  const corte = new Date(hoy.getTime() - 86_400_000);
  const minimo = conjuntoConfig(ctx).bloqueoMora.montoMinimo;
  const vencidas = await ctx.db.cuota.groupBy({
    by: ["unidadId"],
    where: { estado: { in: ["PENDIENTE", "PARCIAL", "EN_ACUERDO"] }, fechaVencimiento: { lte: corte }, ...(unidadIds ? { unidadId: { in: unidadIds } } : {}) },
    _sum: { saldo: true },
  });
  const candidatas = vencidas.filter((v) => toNumber(v._sum.saldo) > minimo);
  if (!candidatas.length) return new Set();
  const ids = candidatas.map((c) => c.unidadId);
  const pagos = await ctx.db.pago.findMany({ where: { estado: "APROBADO", unidadId: { in: ids } }, select: { id: true, unidadId: true, valor: true } });
  const aplicado = pagos.length
    ? await ctx.db.aplicacionPago.groupBy({ by: ["pagoId"], where: { pagoId: { in: pagos.map((p) => p.id) } }, _sum: { valor: true } })
    : [];
  const aplPorPago = new Map(aplicado.map((a) => [a.pagoId, toNumber(a._sum.valor)]));
  const aFavor = new Map<string, number>();
  for (const p of pagos) aFavor.set(p.unidadId, (aFavor.get(p.unidadId) ?? 0) + toNumber(p.valor) - (aplPorPago.get(p.id) ?? 0));
  return new Set(candidatas.filter((c) => toNumber(c._sum.saldo) - Math.max(0, aFavor.get(c.unidadId) ?? 0) > minimo).map((c) => c.unidadId));
}

/** Ids de las unidades que cumplen la definición. `restringirA` limita el universo (p. ej. unidades del usuario). */
export async function resolverUnidades(ctx: SegCtx, rawDef: SegmentoDef | unknown, opts?: { restringirA?: string[]; hoy?: Date }): Promise<string[]> {
  const d = normalizarDef(rawDef);
  const hoy = opts?.hoy ?? new Date();
  const personaResidente = (persona: Prisma.PersonaWhereInput): Prisma.UnidadWhereInput => ({
    vinculos: { some: { estado: "ACTIVO", deletedAt: null, tipo: { in: RESIDENCIALES as never[] }, persona: { deletedAt: null, ...persona } } },
  });
  const and: Prisma.UnidadWhereInput[] = [];
  if (opts?.restringirA) and.push({ id: { in: opts.restringirA } });
  if (d.torres?.length) and.push(d.incluirSinTorre ? { OR: [{ torreId: { in: d.torres } }, { torreId: null }] } : { torreId: { in: d.torres } });
  if (d.pisoMin != null) and.push({ piso: { gte: d.pisoMin } });
  if (d.pisoMax != null) and.push({ piso: { lte: d.pisoMax } });
  if (d.unidades?.length) and.push({ id: { in: d.unidades } });
  if (d.tiposUnidad?.length) and.push({ tipo: { in: d.tiposUnidad } });
  if (d.ocupacion?.length) and.push({ estadoOcupacion: { in: d.ocupacion } });
  if (d.vinculos?.length) and.push({ vinculos: { some: { estado: "ACTIVO", deletedAt: null, tipo: { in: d.vinculos }, persona: { deletedAt: null } } } });
  if (d.conMascotas) and.push({ mascotas: { some: { activo: true, deletedAt: null } } });
  if (d.conVehiculos) and.push({ vehiculos: { some: { activo: true, deletedAt: null } } });
  if (d.conMenores) and.push(personaResidente({ fechaNacimiento: { gt: fechaCorteEdad(EDAD_MAYORIA, hoy) } }));
  if (d.adultosMayores) and.push(personaResidente({ fechaNacimiento: { lte: fechaCorteEdad(EDAD_ADULTO_MAYOR, hoy) } }));
  if (d.movilidadReducida) and.push({ OR: [{ tienePersonaMovilidadReducida: true }, personaResidente({ movilidadReducida: true })] });

  const rows = await ctx.db.unidad.findMany({ where: and.length ? { AND: and } : {}, select: { id: true, codigo: true } });
  let ids = rows.filter((u) => enRango(numeroUnidad(u.codigo), d.numeroDesde, d.numeroHasta)).map((u) => u.id);
  if (d.cartera && ids.length) {
    const mora = await unidadesEnMora(ctx, ids, hoy);
    ids = ids.filter((id) => (d.cartera === "EN_MORA" ? mora.has(id) : !mora.has(id)));
  }
  return ids;
}

function rolWhere(roles: string[]): Prisma.MembresiaConjuntoWhereInput {
  return { rol: { OR: [{ clave: { in: roles } }, { basadoEnClave: { in: roles } }] } };
}

/** Usuarios (con cuenta y membresía activa) que pertenecen al segmento. */
export async function resolverUsuarios(ctx: SegCtx, rawDef: SegmentoDef | unknown): Promise<string[]> {
  const d = normalizarDef(rawDef);
  const baseMembresia: Prisma.MembresiaConjuntoWhereInput = { estado: "ACTIVA", ...(d.roles?.length ? rolWhere(d.roles) : {}) };
  if (!tieneFiltrosUnidad(d)) {
    const ms = await ctx.db.membresiaConjunto.findMany({ where: baseMembresia, select: { usuarioId: true } });
    return [...new Set(ms.map((m) => m.usuarioId))];
  }
  const unidades = await resolverUnidades(ctx, d);
  if (!unidades.length) return [];
  const vinculos = await ctx.db.vinculoUnidad.findMany({
    where: { unidadId: { in: unidades }, estado: "ACTIVO", tipo: { in: vinculosDe(d) as never[] }, persona: { deletedAt: null, usuarioId: { not: null } } },
    select: { persona: { select: { usuarioId: true } } },
  });
  const candidatos = [...new Set(vinculos.map((v) => v.persona.usuarioId!).filter(Boolean))];
  if (!candidatos.length) return [];
  const ms = await ctx.db.membresiaConjunto.findMany({ where: { ...baseMembresia, usuarioId: { in: candidatos } }, select: { usuarioId: true } });
  return [...new Set(ms.map((m) => m.usuarioId))];
}

/** ¿El usuario pertenece al segmento? (versión barata para filtrar el muro del residente). */
export async function usuarioEnSegmento(ctx: SegCtx, rawDef: SegmentoDef | unknown, usuarioId: string): Promise<boolean> {
  const d = normalizarDef(rawDef);
  if (esVacia(d)) return true;
  const m = await ctx.db.membresiaConjunto.findFirst({ where: { usuarioId, estado: "ACTIVA" }, include: { rol: true } });
  if (!m) return false;
  if (d.roles?.length && !d.roles.includes(m.rol.clave) && !(m.rol.basadoEnClave && d.roles.includes(m.rol.basadoEnClave))) return false;
  if (!tieneFiltrosUnidad(d)) return true;
  const vinc = await ctx.db.vinculoUnidad.findMany({
    where: { estado: "ACTIVO", tipo: { in: vinculosDe(d) as never[] }, persona: { usuarioId, deletedAt: null } },
    select: { unidadId: true },
  });
  if (!vinc.length) return false;
  const u = await resolverUnidades(ctx, d, { restringirA: [...new Set(vinc.map((v) => v.unidadId))] });
  return u.length > 0;
}

export type DestinatarioCorreo = {
  email: string;
  nombre: string;
  usuarioId: string | null;
  personaId: string | null;
  /** Unidades por las que recibe. */
  unidadIds: string[];
  unidades: string[];
  /** Unidades cuya información financiera puede ver (propietario/copropietario o autorizado). */
  unidadesFinancieras: string[];
};

const emailOk = (e: string | null | undefined): e is string => !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

/**
 * Destinatarios de correo: usuarios con cuenta + personas vinculadas con email (aunque no tengan cuenta).
 * Se deduplica por correo; si una persona está en varias unidades se agrupan.
 */
export async function resolverDestinatariosCorreo(ctx: SegCtx, rawDef: SegmentoDef | unknown): Promise<DestinatarioCorreo[]> {
  const d = normalizarDef(rawDef);
  const map = new Map<string, DestinatarioCorreo>();
  const add = (email: string, nombre: string, extra: { usuarioId?: string | null; personaId?: string | null; unidadId?: string; codigo?: string; financiero?: boolean }) => {
    const k = email.trim().toLowerCase();
    const cur = map.get(k) ?? { email: k, nombre, usuarioId: null, personaId: null, unidadIds: [], unidades: [], unidadesFinancieras: [] };
    cur.usuarioId ??= extra.usuarioId ?? null;
    cur.personaId ??= extra.personaId ?? null;
    if (extra.unidadId && !cur.unidadIds.includes(extra.unidadId)) {
      cur.unidadIds.push(extra.unidadId);
      cur.unidades.push(extra.codigo ?? "");
    }
    if (extra.unidadId && extra.financiero && !cur.unidadesFinancieras.includes(extra.unidadId)) cur.unidadesFinancieras.push(extra.unidadId);
    map.set(k, cur);
  };

  const soloRoles = !tieneFiltrosUnidad(d);
  // Personal y usuarios por rol (sin unidad) o "todo el conjunto".
  if (soloRoles) {
    const ms = await ctx.db.membresiaConjunto.findMany({
      where: { estado: "ACTIVA", ...(d.roles?.length ? rolWhere(d.roles) : {}), usuario: { deletedAt: null, estado: { in: ["ACTIVO", "INVITADO"] } } },
      select: { usuario: { select: { id: true, email: true, nombre: true } } },
    });
    for (const m of ms) if (emailOk(m.usuario.email)) add(m.usuario.email, m.usuario.nombre, { usuarioId: m.usuario.id });
  }
  // Personas vinculadas a las unidades del segmento.
  {
    const unidades = soloRoles ? null : await resolverUnidades(ctx, d);
    if (unidades === null || unidades.length) {
      const where: Prisma.VinculoUnidadWhereInput = {
        estado: "ACTIVO",
        tipo: { in: vinculosDe(d) as never[] },
        persona: { deletedAt: null, anonimizada: false },
        ...(unidades ? { unidadId: { in: unidades } } : {}),
      };
      const vinc = await ctx.db.vinculoUnidad.findMany({
        where,
        select: {
          unidadId: true,
          tipo: true,
          puedeVerCuenta: true,
          unidad: { select: { codigo: true } },
          persona: { select: { id: true, nombres: true, apellidos: true, email: true, usuarioId: true, usuario: { select: { email: true, nombre: true, deletedAt: true } } } },
        },
      });
      let permitidos: Set<string> | null = null;
      if (d.roles?.length) {
        const uids = [...new Set(vinc.map((v) => v.persona.usuarioId).filter((x): x is string => !!x))];
        const ms = uids.length ? await ctx.db.membresiaConjunto.findMany({ where: { estado: "ACTIVA", usuarioId: { in: uids }, ...rolWhere(d.roles) }, select: { usuarioId: true } }) : [];
        permitidos = new Set(ms.map((m) => m.usuarioId));
      }
      for (const v of vinc) {
        if (permitidos && (!v.persona.usuarioId || !permitidos.has(v.persona.usuarioId))) continue;
        const email = v.persona.usuario && !v.persona.usuario.deletedAt && emailOk(v.persona.usuario.email) ? v.persona.usuario.email : v.persona.email;
        if (!emailOk(email)) continue;
        add(email, `${v.persona.nombres} ${v.persona.apellidos}`.trim(), {
          usuarioId: v.persona.usuarioId,
          personaId: v.persona.id,
          unidadId: v.unidadId,
          codigo: v.unidad.codigo,
          financiero: FINANCIEROS.includes(v.tipo) || v.puedeVerCuenta,
        });
      }
    }
  }
  return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export type ConteoSegmento = { unidades: number | null; usuarios: number; correos: number };

/** Vista previa en tiempo real del tamaño del segmento. */
export async function contarDestinatarios(ctx: SegCtx, rawDef: SegmentoDef | unknown): Promise<ConteoSegmento> {
  const d = normalizarDef(rawDef);
  const [unidades, usuarios, correos] = await Promise.all([
    tieneFiltrosUnidad(d) ? resolverUnidades(ctx, d).then((u) => u.length) : Promise.resolve(null),
    resolverUsuarios(ctx, d).then((u) => u.length),
    resolverDestinatariosCorreo(ctx, d).then((c) => c.length),
  ]);
  return { unidades, usuarios, correos };
}

// ── Segmentos guardados ──

export async function listarSegmentos(ctx: SegCtx) {
  return ctx.db.segmento.findMany({ orderBy: { nombre: "asc" } });
}

/** Definición efectiva a partir de un segmento guardado o una definición ad hoc. */
export async function definicionEfectiva(ctx: SegCtx, input: { segmentoId?: string | null; definicion?: unknown }): Promise<SegmentoDef> {
  if (input.segmentoId) {
    const s = await ctx.db.segmento.findUnique({ where: { id: input.segmentoId } });
    if (!s) notFound("El segmento");
    return normalizarDef(s.definicion);
  }
  return normalizarDef(input.definicion);
}

export async function guardarSegmento(ctx: Pick<Ctx, "db" | "conjuntoId" | "userId" | "nombre" | "impersonadoPor">, input: { id?: string | null; nombre: string; descripcion?: string | null; definicion: unknown }) {
  const definicion = parseDef(input.definicion) as Prisma.InputJsonValue;
  const dup = await ctx.db.segmento.findFirst({ where: { nombre: { equals: input.nombre, mode: "insensitive" }, ...(input.id ? { id: { not: input.id } } : {}) } });
  if (dup) throw new AppError("Ya existe un segmento con ese nombre.", 400, { nombre: "Nombre repetido" });
  if (input.id) {
    const antes = await ctx.db.segmento.findUnique({ where: { id: input.id } });
    if (!antes) notFound("El segmento");
    const s = await ctx.db.segmento.update({ where: { id: input.id }, data: { nombre: input.nombre, descripcion: input.descripcion ?? null, definicion } });
    await audit(ctx, "editar", "Segmento", s.id, antes, s);
    return s;
  }
  const s = await ctx.db.segmento.create({ data: { conjuntoId: ctx.conjuntoId, nombre: input.nombre, descripcion: input.descripcion ?? null, definicion } });
  await audit(ctx, "crear", "Segmento", s.id, undefined, s);
  return s;
}

export async function eliminarSegmento(ctx: Pick<Ctx, "db" | "conjuntoId" | "userId" | "nombre" | "impersonadoPor">, id: string) {
  const s = await ctx.db.segmento.findUnique({ where: { id } });
  if (!s) notFound("El segmento");
  const enUso = await ctx.db.campanaCorreo.count({ where: { segmentoId: id, estado: { in: ["BORRADOR", "PROGRAMADA", "ENVIANDO"] } } });
  if (enUso) throw new AppError("El segmento está en uso por campañas pendientes. Cámbialas antes de eliminarlo.");
  await ctx.db.segmento.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, "eliminar", "Segmento", id, s);
  return true;
}

/** Opciones para el constructor de segmentos (torres, unidades y roles del conjunto). */
export async function opcionesSegmento(ctx: SegCtx) {
  const [torres, unidades, roles] = await Promise.all([
    ctx.db.torre.findMany({ orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
    ctx.db.unidad.findMany({ select: { id: true, codigo: true, torre: { select: { nombre: true } } }, orderBy: { codigo: "asc" } }),
    ctx.db.rol.findMany({ orderBy: { nombre: "asc" }, select: { clave: true, nombre: true } }),
  ]);
  return {
    torres: torres.map((t) => ({ value: t.id, label: t.nombre })),
    unidades: unidades
      .map((u) => ({ value: u.id, label: u.codigo, group: u.torre?.nombre ?? "Casas" }))
      .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label, "es", { numeric: true })),
    roles: roles.map((r) => ({ value: r.clave, label: r.nombre })),
  };
}

export type OpcionesSegmento = Awaited<ReturnType<typeof opcionesSegmento>>;

/** Nombres para `describirDef`. */
export function nombresDesdeOpciones(o: OpcionesSegmento) {
  return {
    torres: Object.fromEntries(o.torres.map((t) => [t.value, t.label])),
    unidades: Object.fromEntries(o.unidades.map((u) => [u.value, u.label])),
    roles: Object.fromEntries(o.roles.map((r) => [r.value, r.label])),
  };
}
