import type { MedioAcceso, Prisma, SujetoAcceso, TipoVisitante } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { AppError, notFound } from "@/lib/errors";
import { emit } from "@/lib/events";
import { audit } from "@/lib/audit";
import { notify, usuariosDeUnidad } from "@/lib/notificaciones";
import { can } from "@/lib/permisos";
import { conceptoPorTipo, crearCargo } from "@/lib/cartera/core";
import { cop, nombreCompleto, toNumber, edad } from "@/lib/format";
import { evaluarAutorizacion, agotadaTrasUso } from "./codigos";
import {
  calcularTarifaParqueadero,
  evaluarFrecuente,
  parseHorario,
  permanenciaMinutos,
  textoHorario,
  textoPermanencia,
  validarAnulacion,
  TIPOS_FRECUENTES,
} from "./reglas";

/**
 * Servicio de portería: bitácora inmutable (ingresos, salidas, anulaciones), autorizaciones por código/QR,
 * frecuentes, lista negra, parqueaderos de visitantes y búsqueda rápida.
 * REGLA: `RegistroAcceso` nunca se actualiza ni se borra; las correcciones son registros ANULACION.
 */

// ───────────────────────── utilidades ─────────────────────────

/** Hora de un registro: la del dispositivo si viene de la cola offline (acotada), si no, ahora. */
export function horaRegistro(h?: Date | string | null) {
  const now = Date.now();
  if (!h) return new Date(now);
  const d = new Date(h);
  if (Number.isNaN(d.getTime()) || d.getTime() > now + 5 * 60_000 || d.getTime() < now - 72 * 3_600_000) return new Date(now);
  return d;
}

export function sujetoDeTipo(tipo: TipoVisitante): SujetoAcceso {
  if (tipo === "DOMICILIO") return "DOMICILIARIO";
  if (tipo === "PROVEEDOR" || tipo === "TECNICO" || tipo === "CONTRATISTA" || tipo === "TRANSPORTE") return "PROVEEDOR";
  return "VISITANTE";
}

function tipoDeSujeto(s: SujetoAcceso): TipoVisitante {
  if (s === "DOMICILIARIO") return "DOMICILIO";
  if (s === "PROVEEDOR") return "PROVEEDOR";
  return "VISITA";
}

const placaNorm = (p?: string | null) => (p ? p.toUpperCase().replace(/[^A-Z0-9]/g, "") || null : null);

async function porClienteId(ctx: Ctx, clienteId?: string | null) {
  if (!clienteId) return null;
  return ctx.db.registroAcceso.findFirst({ where: { clienteId } });
}

/** Ids de registros anulados dentro de un conjunto de ids. */
export async function idsAnulados(ctx: Ctx, ids: string[]) {
  if (!ids.length) return new Set<string>();
  const an = await ctx.db.registroAcceso.findMany({ where: { tipo: "ANULACION", anulaId: { in: ids } }, select: { anulaId: true } });
  return new Set(an.map((a) => a.anulaId!));
}

// ───────────────────────── lista negra ─────────────────────────

/** Busca un visitante con orden de no ingreso por documento o nombre exacto. */
export async function verificarListaNegra(ctx: Ctx, q: { visitanteId?: string | null; documento?: string | null; nombre?: string | null }) {
  const or: Prisma.VisitanteWhereInput[] = [];
  if (q.visitanteId) or.push({ id: q.visitanteId });
  if (q.documento) or.push({ numeroDocumento: q.documento.trim() });
  if (q.nombre && q.nombre.trim().length > 4) or.push({ nombre: { equals: q.nombre.trim(), mode: "insensitive" } });
  if (!or.length) return null;
  return ctx.db.visitante.findFirst({ where: { listaNegra: true, OR: or } });
}

export async function marcarListaNegra(ctx: Ctx, input: { visitanteId?: string | null; nombre: string; documento?: string | null; motivo: string; fotoUrl?: string | null }) {
  let v = input.visitanteId ? await ctx.db.visitante.findFirst({ where: { id: input.visitanteId } }) : null;
  if (!v && input.documento) v = await ctx.db.visitante.findFirst({ where: { numeroDocumento: input.documento.trim() } });
  const antes = v;
  if (v) {
    v = await ctx.db.visitante.update({ where: { id: v.id }, data: { listaNegra: true, motivoListaNegra: input.motivo, fotoUrl: input.fotoUrl ?? v.fotoUrl } });
  } else {
    v = await ctx.db.visitante.create({
      data: { conjuntoId: ctx.conjuntoId, nombre: input.nombre, numeroDocumento: input.documento?.trim() || null, listaNegra: true, motivoListaNegra: input.motivo, fotoUrl: input.fotoUrl ?? null },
    });
  }
  await audit(ctx, "lista_negra_agregar", "Visitante", v.id, antes, v);
  return v;
}

export async function quitarListaNegra(ctx: Ctx, visitanteId: string) {
  const antes = await ctx.db.visitante.findFirst({ where: { id: visitanteId } });
  if (!antes) notFound("El visitante");
  const v = await ctx.db.visitante.update({ where: { id: visitanteId }, data: { listaNegra: false, motivoListaNegra: null } });
  await audit(ctx, "lista_negra_quitar", "Visitante", v.id, antes, v);
  return v;
}

// ───────────────────────── ingresos ─────────────────────────

export type IngresoInput = {
  clienteId?: string | null;
  sujeto: SujetoAcceso;
  nombre: string;
  documento?: string | null;
  tipoVisitante?: TipoVisitante | null;
  empresa?: string | null;
  telefono?: string | null;
  unidadId?: string | null;
  autorizacionId?: string | null;
  medio: MedioAcceso;
  placa?: string | null;
  parqueaderoId?: string | null;
  fotoUrl?: string | null;
  observaciones?: string | null;
  visitanteId?: string | null;
  personaId?: string | null;
  hora?: Date | string | null;
  /** No notificar al residente (p. ej. cuando el ingreso lo decidió él mismo en la solicitud). */
  silencioso?: boolean;
};

/** Registra un INGRESO en la bitácora. Idempotente por `clienteId` (cola offline). */
export async function registrarIngreso(ctx: Ctx, input: IngresoInput) {
  const previo = await porClienteId(ctx, input.clienteId);
  if (previo) return previo;
  const nombre = input.nombre.trim();
  if (!nombre) throw new AppError("Escribe el nombre de quien ingresa.");
  if (input.unidadId) {
    const u = await ctx.db.unidad.findFirst({ where: { id: input.unidadId }, select: { id: true } });
    if (!u) notFound("La unidad");
  }

  // Visitantes externos: lista negra y ficha del visitante
  let visitanteId = input.visitanteId ?? null;
  const esExterno = !input.personaId && input.sujeto !== "RESIDENTE" && input.sujeto !== "EMPLEADO";
  if (esExterno || input.visitanteId) {
    const bloqueado = await verificarListaNegra(ctx, { visitanteId, documento: input.documento, nombre });
    if (bloqueado) throw new AppError(`⛔ ${bloqueado.nombre} tiene orden de no ingreso${bloqueado.motivoListaNegra ? `: ${bloqueado.motivoListaNegra}` : "."}`, 409);
    if (!visitanteId && input.documento) {
      const doc = input.documento.trim();
      const existente = await ctx.db.visitante.findFirst({ where: { numeroDocumento: doc } });
      if (existente) {
        visitanteId = existente.id;
        if (input.fotoUrl && !existente.fotoUrl) await ctx.db.visitante.update({ where: { id: existente.id }, data: { fotoUrl: input.fotoUrl } });
      } else {
        const v = await ctx.db.visitante.create({
          data: {
            conjuntoId: ctx.conjuntoId,
            nombre,
            numeroDocumento: doc,
            fotoUrl: input.fotoUrl ?? null,
            empresa: input.empresa ?? null,
            telefono: input.telefono ?? null,
            tipo: input.tipoVisitante ?? tipoDeSujeto(input.sujeto),
          },
        });
        visitanteId = v.id;
      }
    }
  }

  // Parqueadero de visitantes
  if (input.parqueaderoId) {
    const p = await ctx.db.parqueadero.findFirst({ where: { id: input.parqueaderoId } });
    if (!p || p.tipo !== "VISITANTES") throw new AppError("Selecciona un parqueadero de visitantes.");
    const r = await ctx.db.parqueadero.updateMany({ where: { id: p.id, estado: "DISPONIBLE" }, data: { estado: "OCUPADO" } });
    if (r.count !== 1) throw new AppError(`El parqueadero ${p.codigo} ya está ocupado. Elige otro.`);
  }

  let registro;
  try {
    registro = await ctx.db.registroAcceso.create({
      data: {
        conjuntoId: ctx.conjuntoId,
        tipo: "INGRESO",
        sujeto: input.sujeto,
        visitanteId,
        personaId: input.personaId ?? null,
        nombre,
        documento: input.documento?.trim() || null,
        unidadId: input.unidadId ?? null,
        autorizacionId: input.autorizacionId ?? null,
        medio: input.medio,
        placa: placaNorm(input.placa),
        parqueaderoId: input.parqueaderoId ?? null,
        hora: horaRegistro(input.hora),
        porteroId: ctx.userId.startsWith("api:") || ctx.userId === "sistema" ? null : ctx.userId,
        fotoUrl: input.fotoUrl ?? null,
        observaciones: input.observaciones ?? null,
        clienteId: input.clienteId ?? null,
      },
    });
  } catch (e) {
    if (input.parqueaderoId) await ctx.db.parqueadero.updateMany({ where: { id: input.parqueaderoId }, data: { estado: "DISPONIBLE" } });
    // Carrera con la misma operación offline: devolver el existente
    const dup = await porClienteId(ctx, input.clienteId);
    if (dup) return dup;
    throw e;
  }

  if (input.autorizacionId) {
    const a = await ctx.db.autorizacionIngreso.findFirst({ where: { id: input.autorizacionId } });
    if (a) {
      await ctx.db.autorizacionIngreso.update({
        where: { id: a.id },
        data: { usos: { increment: 1 }, ...(agotadaTrasUso(a) ? { estado: "USADA" as const } : {}) },
      });
    }
  }

  await emit({ tipo: "visitante.ingreso", conjuntoId: ctx.conjuntoId, data: { id: registro.id, unidadId: registro.unidadId, nombre: registro.nombre, sujeto: registro.sujeto, medio: registro.medio }, actorId: ctx.userId });
  if (registro.unidadId && registro.sujeto !== "RESIDENTE" && !input.silencioso) {
    const destinatarios = await usuariosDeUnidad(ctx.conjuntoId, registro.unidadId);
    await notify({
      conjuntoId: ctx.conjuntoId,
      usuarioIds: destinatarios,
      titulo: `Tu visitante ${registro.nombre} ingresó`,
      cuerpo: `Ingresó a las ${new Date(registro.hora).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" })}${registro.placa ? ` en el vehículo ${registro.placa}` : ""}.`,
      enlace: "/visitantes?tab=historial",
      tipo: "VISITANTE_INGRESO",
      canales: ["push"],
      data: { registroId: registro.id },
    });
  }
  await audit(ctx, "registrar_ingreso", "RegistroAcceso", registro.id, undefined, { nombre: registro.nombre, unidadId: registro.unidadId, medio: registro.medio });
  return registro;
}

// ───────────────────────── autorizaciones (lado portería) ─────────────────────────

export async function buscarAutorizacion(ctx: Ctx, q: { codigo?: string | null; token?: string | null }) {
  if (!q.codigo && !q.token) return null;
  const a = await ctx.db.autorizacionIngreso.findFirst({
    where: q.token ? { qrToken: q.token } : { codigo: q.codigo!, estado: "ACTIVA" },
    include: { unidad: { select: { id: true, codigo: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (!a) {
    if (q.codigo) {
      // Mostrar el motivo si el código existe pero ya no está activo
      const otra = await ctx.db.autorizacionIngreso.findFirst({ where: { codigo: q.codigo }, include: { unidad: { select: { id: true, codigo: true } } }, orderBy: { createdAt: "desc" } });
      if (otra) return { autorizacion: otra, evaluacion: evaluarAutorizacion(otra), visitante: null, alertas: [] as string[] };
    }
    return null;
  }
  const visitante = a.visitanteId ? await ctx.db.visitante.findFirst({ where: { id: a.visitanteId } }) : null;
  const evaluacion = evaluarAutorizacion(a);
  const alertas: string[] = [];
  const negra = await verificarListaNegra(ctx, { visitanteId: a.visitanteId, documento: a.documentoVisitante, nombre: a.nombreVisitante });
  if (negra) alertas.push(`⛔ Orden de no ingreso${can(ctx, ["porteria.ver", "porteria.lista_negra"]) && negra.motivoListaNegra ? `: ${negra.motivoListaNegra}` : ""}`);
  const cfg = conjuntoConfig(ctx);
  if (a.tipo === "CONTRATISTA" && cfg.porteria.exigirSeguridadSocialContratistas && !a.soporteSeguridadSocialUrl) {
    alertas.push("Contratista sin soporte de seguridad social: no se permite el ingreso.");
  }
  return { autorizacion: a, evaluacion, visitante, alertas };
}

/** Ingreso con QR o código de 6 dígitos (≤ 3 toques). */
export async function ingresoPorAutorizacion(
  ctx: Ctx,
  input: { codigo?: string | null; token?: string | null; fotoUrl?: string | null; parqueaderoId?: string | null; placa?: string | null; clienteId?: string | null; hora?: Date | string | null; observaciones?: string | null },
) {
  const previo = await porClienteId(ctx, input.clienteId);
  if (previo) return previo;
  const r = await buscarAutorizacion(ctx, input);
  if (!r) throw new AppError("No encontramos una autorización con ese código.", 404);
  if (!r.evaluacion.ok) throw new AppError(r.evaluacion.motivo);
  if (r.alertas.length) throw new AppError(r.alertas[0]);
  const a = r.autorizacion;
  return registrarIngreso(ctx, {
    clienteId: input.clienteId,
    sujeto: sujetoDeTipo(a.tipo),
    tipoVisitante: a.tipo,
    nombre: a.nombreVisitante,
    documento: a.documentoVisitante,
    unidadId: a.unidadId,
    autorizacionId: a.id,
    visitanteId: a.visitanteId,
    medio: input.token ? "QR" : "CODIGO",
    placa: input.placa || a.placa,
    parqueaderoId: input.parqueaderoId,
    fotoUrl: input.fotoUrl ?? r.visitante?.fotoUrl ?? null,
    observaciones: input.observaciones ?? (a.tipo === "CONTRATISTA" ? "Contratista con seguridad social verificada" : null),
    hora: input.hora,
  });
}

// ───────────────────────── frecuentes ─────────────────────────

export type Frecuente = {
  vinculoId: string;
  personaId: string;
  nombre: string;
  documento: string | null;
  fotoUrl: string | null;
  tipo: string;
  estado: string;
  horario: string;
  permitido: boolean;
  alertas: string[];
};

export async function frecuentesDeUnidad(ctx: Ctx, unidadId: string, ahora = new Date()): Promise<Frecuente[]> {
  const vinculos = await ctx.db.vinculoUnidad.findMany({
    where: { unidadId, tipo: { in: [...TIPOS_FRECUENTES] }, estado: { in: ["ACTIVO", "INACTIVO"] }, persona: { deletedAt: null, anonimizada: false } },
    include: { persona: { select: { id: true, nombres: true, apellidos: true, numeroDocumento: true, fotoUrl: true, fechaNacimiento: true } } },
    orderBy: [{ estado: "asc" }, { tipo: "asc" }],
  });
  const verDoc = can(ctx, ["campos.persona_documento", "porteria.ver"]);
  return vinculos
    .filter((v) => v.tipo !== "FAMILIAR" || (edad(v.persona.fechaNacimiento) ?? 18) >= 12)
    .map((v) => {
      const ev = evaluarFrecuente(v, ahora);
      return {
        vinculoId: v.id,
        personaId: v.personaId,
        nombre: nombreCompleto(v.persona),
        documento: verDoc ? v.persona.numeroDocumento : null,
        fotoUrl: v.persona.fotoUrl,
        tipo: v.tipo,
        estado: v.estado,
        horario: textoHorario(parseHorario(v.horarioPermitido)),
        permitido: ev.permitido,
        alertas: ev.alertas,
      };
    });
}

/** Ingreso con un toque de un frecuente. Si está fuera de horario o inactivo exige `forzar` (queda anotado). */
export async function ingresoFrecuente(ctx: Ctx, input: { vinculoId: string; forzar?: boolean; clienteId?: string | null; hora?: Date | string | null; placa?: string | null }) {
  const previo = await porClienteId(ctx, input.clienteId);
  if (previo) return previo;
  const v = await ctx.db.vinculoUnidad.findFirst({ where: { id: input.vinculoId }, include: { persona: true } });
  if (!v) notFound("El frecuente");
  const ev = evaluarFrecuente(v, horaRegistro(input.hora));
  if (!ev.permitido && !input.forzar) throw new AppError(`${ev.alertas.join(" ")} Confirma si de todas formas autorizas el ingreso.`, 409, { forzar: "requerido" });
  const empleado = v.tipo === "EMPLEADO_DOMESTICO" || v.tipo === "CUIDADOR";
  return registrarIngreso(ctx, {
    clienteId: input.clienteId,
    sujeto: empleado ? "EMPLEADO" : "VISITANTE",
    nombre: nombreCompleto(v.persona),
    documento: v.persona.numeroDocumento,
    personaId: v.personaId,
    unidadId: v.unidadId,
    medio: "LISTA_FRECUENTES",
    placa: input.placa,
    fotoUrl: v.persona.fotoUrl,
    observaciones: ev.permitido ? null : `Ingreso autorizado por portería con alerta: ${ev.alertas.join(" ")}`,
    hora: input.hora,
  });
}

// ───────────────────────── salidas ─────────────────────────

export type CobroParqueadero = "UNIDAD" | "VISITANTE" | "NINGUNO";

/** Cálculo previo de la salida (tiempo y valor de parqueadero) para mostrar antes de confirmar. */
export async function previaSalida(ctx: Ctx, ingresoId: string, ahora = new Date()) {
  const ingreso = await ctx.db.registroAcceso.findFirst({ where: { id: ingresoId, tipo: "INGRESO" }, include: { unidad: { select: { codigo: true } } } });
  if (!ingreso) notFound("El ingreso");
  const parq = ingreso.parqueaderoId ? await ctx.db.parqueadero.findFirst({ where: { id: ingreso.parqueaderoId } }) : null;
  const tarifa = parq ? calcularTarifaParqueadero({ tarifaHora: toNumber(parq.tarifaHora), tarifaDia: toNumber(parq.tarifaDia) }, ingreso.hora, ahora) : null;
  return { ingreso, parqueadero: parq, tarifa, permanenciaMin: permanenciaMinutos(ingreso.hora, ahora) };
}

export async function registrarSalida(
  ctx: Ctx,
  input: {
    ingresoId?: string | null;
    clienteId?: string | null;
    nombre?: string | null;
    sujeto?: SujetoAcceso | null;
    unidadId?: string | null;
    placa?: string | null;
    cobro?: CobroParqueadero | null;
    observaciones?: string | null;
    hora?: Date | string | null;
  },
) {
  const previo = await porClienteId(ctx, input.clienteId);
  if (previo) return { registro: previo, permanenciaMin: null as number | null, cobro: null as null | { valor: number; a: CobroParqueadero } };
  const hora = horaRegistro(input.hora);
  let ingreso = null as Awaited<ReturnType<typeof ctx.db.registroAcceso.findFirst>>;
  if (input.ingresoId) {
    ingreso = await ctx.db.registroAcceso.findFirst({ where: { id: input.ingresoId, tipo: "INGRESO" } });
    if (!ingreso) notFound("El ingreso");
    if ((await idsAnulados(ctx, [ingreso.id])).size) throw new AppError("Ese ingreso fue anulado.");
    const yaSalio = await ctx.db.registroAcceso.findFirst({ where: { tipo: "SALIDA", ingresoId: ingreso.id } });
    if (yaSalio && !(await idsAnulados(ctx, [yaSalio.id])).size) throw new AppError(`${ingreso.nombre} ya tiene la salida registrada.`);
  } else if (!input.nombre?.trim()) {
    throw new AppError("Selecciona el ingreso o escribe el nombre de quien sale.");
  }

  const notas: string[] = [];
  if (input.observaciones) notas.push(input.observaciones);
  let cobro: null | { valor: number; a: CobroParqueadero } = null;
  if (ingreso?.parqueaderoId) {
    const parq = await ctx.db.parqueadero.findFirst({ where: { id: ingreso.parqueaderoId } });
    if (parq) {
      const t = calcularTarifaParqueadero({ tarifaHora: toNumber(parq.tarifaHora), tarifaDia: toNumber(parq.tarifaDia) }, ingreso.hora, hora);
      await ctx.db.parqueadero.updateMany({ where: { id: parq.id, estado: "OCUPADO" }, data: { estado: "DISPONIBLE" } });
      if (t.valor > 0) {
        const a: CobroParqueadero = input.cobro ?? (ingreso.unidadId ? "UNIDAD" : "VISITANTE");
        cobro = { valor: t.valor, a };
        if (a === "UNIDAD" && ingreso.unidadId) {
          const concepto = await conceptoPorTipo(ctx, "PARQUEADERO");
          const tarifaIva = concepto.gravaIva ? toNumber(concepto.tarifaIva) : 0;
          // La tarifa publicada incluye IVA: se separa la base gravable.
          const base = tarifaIva > 0 ? Math.round(t.valor / (1 + tarifaIva / 100)) : t.valor;
          await crearCargo(ctx, {
            unidadId: ingreso.unidadId,
            conceptoId: concepto.id,
            valorBase: base,
            iva: t.valor - base,
            descripcion: `Parqueadero de visitantes ${parq.codigo} · ${ingreso.nombre} · ${textoPermanencia(t.minutos)}`,
            fechaVencimiento: new Date(hora.getTime() + 15 * 86_400_000),
            origen: "MANUAL",
          });
          notas.push(`Parqueadero ${parq.codigo}: ${cop(t.valor)} cargado a la unidad`);
        } else if (a === "VISITANTE") {
          notas.push(`Parqueadero ${parq.codigo}: el visitante pagó ${cop(t.valor)} en portería`);
        } else notas.push(`Parqueadero ${parq.codigo}: sin cobro (${cop(t.valor)} exonerado)`);
      }
    }
  }

  const registro = await ctx.db.registroAcceso.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      tipo: "SALIDA",
      sujeto: ingreso?.sujeto ?? input.sujeto ?? "VISITANTE",
      visitanteId: ingreso?.visitanteId ?? null,
      personaId: ingreso?.personaId ?? null,
      nombre: ingreso?.nombre ?? input.nombre!.trim(),
      documento: ingreso?.documento ?? null,
      unidadId: ingreso?.unidadId ?? input.unidadId ?? null,
      autorizacionId: ingreso?.autorizacionId ?? null,
      medio: ingreso?.medio ?? "MANUAL",
      placa: ingreso?.placa ?? placaNorm(input.placa),
      parqueaderoId: ingreso?.parqueaderoId ?? null,
      hora,
      porteroId: ctx.userId.startsWith("api:") || ctx.userId === "sistema" ? null : ctx.userId,
      observaciones: notas.join(" · ") || null,
      ingresoId: ingreso?.id ?? null,
      clienteId: input.clienteId ?? null,
    },
  });
  await emit({ tipo: "visitante.salida", conjuntoId: ctx.conjuntoId, data: { id: registro.id, ingresoId: ingreso?.id ?? null, unidadId: registro.unidadId, nombre: registro.nombre }, actorId: ctx.userId });
  await audit(ctx, "registrar_salida", "RegistroAcceso", registro.id, undefined, { nombre: registro.nombre, ingresoId: registro.ingresoId, cobro });
  return { registro, permanenciaMin: ingreso ? permanenciaMinutos(ingreso.hora, hora) : null, cobro };
}

// ───────────────────────── anulación ─────────────────────────

export async function anularRegistro(ctx: Ctx, input: { id: string; motivo: string }) {
  const original = await ctx.db.registroAcceso.findFirst({ where: { id: input.id } });
  const ya = original ? (await idsAnulados(ctx, [original.id])).size > 0 : false;
  const v = validarAnulacion(original, ya);
  if (!v.ok) throw new AppError(v.motivo);
  const o = original!;
  const anulacion = await ctx.db.registroAcceso.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      tipo: "ANULACION",
      sujeto: o.sujeto,
      nombre: o.nombre,
      documento: o.documento,
      unidadId: o.unidadId,
      visitanteId: o.visitanteId,
      personaId: o.personaId,
      medio: "MANUAL",
      placa: o.placa,
      porteroId: ctx.userId,
      observaciones: input.motivo,
      anulaId: o.id,
    },
  });
  // Un ingreso anulado sin salida libera su parqueadero
  if (o.tipo === "INGRESO" && o.parqueaderoId) {
    const salida = await ctx.db.registroAcceso.findFirst({ where: { tipo: "SALIDA", ingresoId: o.id } });
    if (!salida) await ctx.db.parqueadero.updateMany({ where: { id: o.parqueaderoId, estado: "OCUPADO" }, data: { estado: "DISPONIBLE" } });
  }
  await emit({ tipo: "porteria.registro_anulado", conjuntoId: ctx.conjuntoId, data: { id: anulacion.id, anulaId: o.id }, actorId: ctx.userId });
  await audit(ctx, "anular_registro", "RegistroAcceso", o.id, o, anulacion);
  return anulacion;
}

// ───────────────────────── adentro ahora ─────────────────────────

export type Adentro = {
  id: string;
  nombre: string;
  sujeto: SujetoAcceso;
  unidad: string | null;
  unidadId: string | null;
  placa: string | null;
  parqueadero: string | null;
  hora: Date;
  minutos: number;
  alerta: boolean;
  fotoUrl: string | null;
  medio: MedioAcceso;
};

/** Personas y vehículos que ingresaron y no han salido (últimos 7 días), con tiempo de permanencia. */
export async function adentroAhora(ctx: Ctx, ahora = new Date()): Promise<Adentro[]> {
  const cfg = conjuntoConfig(ctx);
  const desde = new Date(ahora.getTime() - 7 * 86_400_000);
  const ingresos = await ctx.db.registroAcceso.findMany({
    where: { tipo: "INGRESO", hora: { gte: desde }, sujeto: { not: "RESIDENTE" } },
    include: { unidad: { select: { codigo: true } } },
    orderBy: { hora: "asc" },
    take: 500,
  });
  if (!ingresos.length) return [];
  const ids = ingresos.map((i) => i.id);
  const [salidas, anulados] = await Promise.all([
    ctx.db.registroAcceso.findMany({ where: { tipo: "SALIDA", ingresoId: { in: ids } }, select: { id: true, ingresoId: true } }),
    idsAnulados(ctx, ids),
  ]);
  const salidasAnuladas = await idsAnulados(ctx, salidas.map((s) => s.id));
  const conSalida = new Set(salidas.filter((s) => !salidasAnuladas.has(s.id)).map((s) => s.ingresoId!));
  const parqIds = [...new Set(ingresos.map((i) => i.parqueaderoId).filter(Boolean) as string[])];
  const parqs = parqIds.length ? await ctx.db.parqueadero.findMany({ where: { id: { in: parqIds } }, select: { id: true, codigo: true } }) : [];
  const pMap = new Map(parqs.map((p) => [p.id, p.codigo]));
  return ingresos
    .filter((i) => !conSalida.has(i.id) && !anulados.has(i.id))
    .map((i) => {
      const minutos = permanenciaMinutos(i.hora, ahora);
      return {
        id: i.id,
        nombre: i.nombre,
        sujeto: i.sujeto,
        unidad: i.unidad?.codigo ?? null,
        unidadId: i.unidadId,
        placa: i.placa,
        parqueadero: i.parqueaderoId ? (pMap.get(i.parqueaderoId) ?? null) : null,
        hora: i.hora,
        minutos,
        alerta: minutos > cfg.porteria.alertaHorasPermanencia * 60,
        fotoUrl: i.fotoUrl,
        medio: i.medio,
      };
    })
    .sort((a, b) => b.minutos - a.minutos);
}

// ───────────────────────── bitácora ─────────────────────────

export type FiltrosBitacora = {
  tipo?: string;
  sujeto?: string;
  desde?: Date | null;
  hasta?: Date | null;
  unidad?: string;
  q?: string;
  medio?: string;
};

export function whereBitacora(f: FiltrosBitacora): Prisma.RegistroAccesoWhereInput {
  const ci = (s: string) => ({ contains: s, mode: "insensitive" as const });
  return {
    ...(f.tipo ? { tipo: f.tipo as never } : {}),
    ...(f.sujeto ? { sujeto: f.sujeto as never } : {}),
    ...(f.medio ? { medio: f.medio as never } : {}),
    ...(f.desde || f.hasta ? { hora: { ...(f.desde ? { gte: f.desde } : {}), ...(f.hasta ? { lt: f.hasta } : {}) } } : {}),
    ...(f.unidad ? { unidad: { codigo: ci(f.unidad) } } : {}),
    ...(f.q ? { OR: [{ nombre: ci(f.q) }, { documento: { contains: f.q } }, { placa: ci(f.q.replace(/\s/g, "")) }, { observaciones: ci(f.q) }] } : {}),
  };
}

export async function bitacora(ctx: Ctx, f: FiltrosBitacora, pag: { skip: number; take: number }) {
  const where = whereBitacora(f);
  const [rows, total] = await Promise.all([
    ctx.db.registroAcceso.findMany({
      where,
      include: { unidad: { select: { codigo: true } }, portero: { select: { nombre: true } } },
      orderBy: { hora: "desc" },
      skip: pag.skip,
      take: pag.take,
    }),
    ctx.db.registroAcceso.count({ where }),
  ]);
  const anulados = await idsAnulados(ctx, rows.map((r) => r.id));
  return { rows: rows.map((r) => ({ ...r, anulado: anulados.has(r.id) })), total };
}

// ───────────────────────── parqueaderos de visitantes ─────────────────────────

export async function parqueaderosVisitantes(ctx: Ctx, ahora = new Date()) {
  const parqs = await ctx.db.parqueadero.findMany({ where: { tipo: "VISITANTES" }, orderBy: { codigo: "asc" } });
  const adentro = await adentroAhora(ctx, ahora);
  const ocupantes = new Map(adentro.filter((a) => a.parqueadero).map((a) => [a.parqueadero!, a]));
  return parqs.map((p) => {
    const occ = ocupantes.get(p.codigo) ?? null;
    const tarifa = occ ? calcularTarifaParqueadero({ tarifaHora: toNumber(p.tarifaHora), tarifaDia: toNumber(p.tarifaDia) }, occ.hora, ahora) : null;
    return { id: p.id, codigo: p.codigo, ubicacion: p.ubicacion, estado: p.estado, tarifaHora: toNumber(p.tarifaHora), tarifaDia: toNumber(p.tarifaDia), ocupante: occ, valorActual: tarifa?.valor ?? 0 };
  });
}

export async function parqueaderoOptions(ctx: Ctx) {
  const ps = await ctx.db.parqueadero.findMany({ where: { tipo: "VISITANTES", estado: "DISPONIBLE" }, orderBy: { codigo: "asc" } });
  return ps.map((p) => ({ value: p.id, label: `${p.codigo}${toNumber(p.tarifaHora) ? ` · ${cop(p.tarifaHora)}/h` : " · sin costo"}` }));
}

// ───────────────────────── unidad (vista de portería) ─────────────────────────

/** Ficha mínima de la unidad para portería: residentes (sin teléfonos salvo permiso), frecuentes, vehículos, paquetes y autorizaciones de hoy. */
export async function fichaPorteriaUnidad(ctx: Ctx, unidadId: string) {
  const u = await ctx.db.unidad.findFirst({ where: { id: unidadId }, include: { torre: { select: { nombre: true } } } });
  if (!u) notFound("La unidad");
  const verTel = can(ctx, "campos.persona_telefono");
  const ahora = new Date();
  const [residentes, frecuentes, vehiculos, paquetes, autorizaciones] = await Promise.all([
    ctx.db.vinculoUnidad.findMany({
      where: { unidadId, estado: "ACTIVO", tipo: { in: ["PROPIETARIO", "COPROPIETARIO", "ARRENDATARIO", "RESIDENTE", "FAMILIAR"] }, persona: { anonimizada: false } },
      include: { persona: { select: { id: true, nombres: true, apellidos: true, fotoUrl: true, telefono: verTel, fechaNacimiento: true, movilidadReducida: true } } },
      orderBy: { principal: "desc" },
    }),
    frecuentesDeUnidad(ctx, unidadId, ahora),
    ctx.db.vehiculo.findMany({ where: { unidadId, activo: true }, select: { id: true, placa: true, tipo: true, marca: true, color: true } }),
    ctx.db.paquete.findMany({ where: { unidadId, estado: "EN_PORTERIA" }, orderBy: { llegadaEn: "asc" } }),
    ctx.db.autorizacionIngreso.findMany({ where: { unidadId, estado: "ACTIVA", fechaInicio: { lte: new Date(ahora.getTime() + 86_400_000) }, fechaFin: { gte: ahora } }, orderBy: { fechaInicio: "asc" }, take: 20 }),
  ]);
  return {
    unidad: { id: u.id, codigo: u.codigo, torre: u.torre?.nombre ?? null, movilidad: u.tienePersonaMovilidadReducida || u.requiereAsistenciaEvacuacion },
    residentes: residentes.map((v) => ({
      vinculoId: v.id,
      nombre: nombreCompleto(v.persona),
      tipo: v.tipo,
      fotoUrl: v.persona.fotoUrl,
      telefono: verTel ? ((v.persona as { telefono?: string | null }).telefono ?? null) : null,
      menor: (edad(v.persona.fechaNacimiento) ?? 18) < 18,
    })),
    frecuentes,
    vehiculos,
    paquetes,
    autorizaciones: autorizaciones.map((a) => ({ ...a, evaluacion: evaluarAutorizacion(a, ahora) })),
  };
}

// ───────────────────────── búsqueda universal ─────────────────────────

export type HitPorteria = {
  tipo: "UNIDAD" | "PERSONA" | "VEHICULO" | "VISITANTE" | "AUTORIZACION" | "PAQUETE";
  id: string;
  titulo: string;
  subtitulo?: string;
  href: string;
  alerta?: string;
  fotoUrl?: string | null;
};

/** Buscador universal de portería: unidad, nombre, placa, documento y código de 6 dígitos. */
export async function busquedaPorteria(ctx: Ctx, qRaw: string): Promise<HitPorteria[]> {
  const q = qRaw.trim();
  if (q.length < 2) return [];
  const ci = { contains: q, mode: "insensitive" as const };
  const placa = q.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const esNumero = /^\d+$/.test(q);
  const hits: HitPorteria[] = [];
  const verMotivo = can(ctx, ["porteria.ver", "porteria.lista_negra"]);
  const [autorizaciones, unidades, personas, vehiculos, visitantes] = await Promise.all([
    /^\d{6}$/.test(q)
      ? ctx.db.autorizacionIngreso.findMany({ where: { codigo: q }, include: { unidad: { select: { codigo: true } } }, orderBy: { createdAt: "desc" }, take: 3 })
      : Promise.resolve([]),
    ctx.db.unidad.findMany({ where: { codigo: ci }, include: { torre: { select: { nombre: true } } }, orderBy: { codigo: "asc" }, take: 6 }),
    ctx.db.persona.findMany({
      where: {
        anonimizada: false,
        vinculos: { some: { deletedAt: null, estado: { in: ["ACTIVO", "INACTIVO"] } } },
        OR: esNumero ? [{ numeroDocumento: { contains: q } }] : q.split(/\s+/).filter(Boolean).map((w) => ({ OR: [{ nombres: { contains: w, mode: "insensitive" as const } }, { apellidos: { contains: w, mode: "insensitive" as const } }] })),
      },
      include: { vinculos: { where: { deletedAt: null, estado: { in: ["ACTIVO", "INACTIVO"] } }, include: { unidad: { select: { id: true, codigo: true } } }, take: 2 } },
      take: 8,
    }),
    placa.length >= 3 ? ctx.db.vehiculo.findMany({ where: { placa: { contains: placa } }, include: { unidad: { select: { id: true, codigo: true } } }, take: 5 }) : Promise.resolve([]),
    ctx.db.visitante.findMany({ where: esNumero ? { numeroDocumento: { contains: q } } : { nombre: ci }, orderBy: [{ listaNegra: "desc" }, { updatedAt: "desc" }], take: 6 }),
  ]);
  for (const a of autorizaciones) {
    const ev = evaluarAutorizacion(a);
    hits.push({ tipo: "AUTORIZACION", id: a.id, titulo: `${a.nombreVisitante} → ${a.unidad.codigo}`, subtitulo: `Código ${a.codigo}`, href: `/porteria/ingreso?codigo=${a.codigo}`, alerta: ev.ok ? undefined : ev.motivo });
  }
  for (const u of unidades) hits.push({ tipo: "UNIDAD", id: u.id, titulo: u.codigo, subtitulo: u.torre?.nombre ?? "Casa", href: `/porteria/unidad/${u.id}` });
  for (const v of vehiculos) hits.push({ tipo: "VEHICULO", id: v.id, titulo: v.placa, subtitulo: `${v.unidad.codigo} · ${[v.marca, v.color].filter(Boolean).join(" ")}`, href: `/porteria/unidad/${v.unidad.id}` });
  for (const p of personas) {
    const v = p.vinculos[0];
    if (!v) continue;
    hits.push({
      tipo: "PERSONA",
      id: p.id,
      titulo: nombreCompleto(p),
      subtitulo: p.vinculos.map((x) => `${x.unidad.codigo} · ${x.tipo.toLowerCase().replace(/_/g, " ")}`).join(", "),
      href: `/porteria/unidad/${v.unidad.id}`,
      fotoUrl: p.fotoUrl,
      alerta: p.vinculos.every((x) => x.estado !== "ACTIVO") ? "Vínculo inactivo" : undefined,
    });
  }
  for (const v of visitantes) {
    hits.push({
      tipo: "VISITANTE",
      id: v.id,
      titulo: v.nombre,
      subtitulo: [v.numeroDocumento, v.empresa].filter(Boolean).join(" · ") || "Visitante",
      href: `/porteria/ingreso/manual?visitanteId=${v.id}`,
      fotoUrl: v.fotoUrl,
      alerta: v.listaNegra ? `⛔ Orden de no ingreso${verMotivo && v.motivoListaNegra ? `: ${v.motivoListaNegra}` : ""}` : undefined,
    });
  }
  return hits.slice(0, 25);
}

export { textoPermanencia };
