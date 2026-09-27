import type { TipoVinculo } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { randomToken, sha256 } from "@/lib/auth/tokens";
import { hashPassword, passwordIssues } from "@/lib/auth/password";
import { queueBrandedEmail, appUrl } from "@/lib/email";
import { waShareLink } from "@/lib/whatsapp";
import { can, isResidencial } from "@/lib/permisos";
import { notify, usuariosConPermiso } from "@/lib/notificaciones";

export type InvitarInput = {
  email: string;
  nombre?: string | null;
  telefono?: string | null;
  rolClave: string;
  unidadId?: string | null;
  tipoVinculo?: TipoVinculo | null;
  personaId?: string | null;
};

const ROLES_QUE_PUEDE_INVITAR_RESIDENTE = new Set(["RESIDENTE", "CONVIVIENTE", "PROPIETARIO"]);

/** Invita a una persona a crear su cuenta (enlace con token por correo y WhatsApp). */
export async function invitarUsuario(ctx: Ctx, input: InvitarInput) {
  const email = input.email.trim().toLowerCase();
  const rol = await ctx.db.rol.findFirst({ where: { clave: input.rolClave } });
  if (!rol) throw new AppError("El rol no existe.");
  const gestor = can(ctx, "configuracion.roles") || can(ctx, "residentes.ver_todos");
  if (!gestor) {
    // Un residente/propietario solo invita a su grupo familiar y arrendatarios de sus unidades.
    if (!input.unidadId || !ctx.unidadIds.includes(input.unidadId)) throw new AppError("Solo puedes invitar personas a tus unidades.", 403);
    if (!ROLES_QUE_PUEDE_INVITAR_RESIDENTE.has(rol.basadoEnClave ?? rol.clave)) throw new AppError("No puedes asignar ese rol.", 403);
    if ((rol.basadoEnClave ?? rol.clave) === "PROPIETARIO" && !ctx.unidadesPropias.includes(input.unidadId)) throw new AppError("Solo el propietario puede invitar copropietarios.", 403);
  }
  const existente = await prisma.usuario.findUnique({ where: { email } });
  if (existente) {
    const m = await ctx.db.membresiaConjunto.findFirst({ where: { usuarioId: existente.id } });
    if (m && !input.unidadId) throw new AppError("Esa persona ya tiene cuenta en este conjunto.");
  }
  await ctx.db.invitacion.updateMany({ where: { email, estado: "PENDIENTE" }, data: { estado: "REVOCADA" } });
  const token = randomToken();
  const inv = await ctx.db.invitacion.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      email,
      telefono: input.telefono,
      nombre: input.nombre,
      unidadId: input.unidadId,
      personaId: input.personaId,
      rolClave: rol.clave,
      tipoVinculo: input.tipoVinculo,
      invitadoPorId: ctx.userId === "sistema" ? null : ctx.userId,
      tokenHash: sha256(token),
      expira: new Date(Date.now() + 14 * 86400000),
    },
  });
  const link = appUrl(`/invitacion/${token}`);
  const unidad = input.unidadId ? await ctx.db.unidad.findUnique({ where: { id: input.unidadId } }) : null;
  await queueBrandedEmail(
    email,
    `Te invitaron a ${ctx.conjunto.nombre} en MiConjunto`,
    {
      conjuntoNombre: ctx.conjunto.nombre,
      color: ctx.conjunto.colorPrimario ?? undefined,
      parrafos: [
        `Hola${input.nombre ? ` ${input.nombre.split(" ")[0]}` : ""}, ${ctx.nombre} te invitó a usar MiConjunto como ${rol.nombre.toLowerCase()}${unidad ? ` de la unidad ${unidad.codigo}` : ""}.`,
        "Con la app podrás pagar la administración, reservar zonas comunes, autorizar visitantes, recibir avisos de paquetes y mucho más.",
        "El enlace vence en 14 días.",
      ],
      boton: { texto: "Crear mi cuenta", url: link },
    },
    { conjuntoId: ctx.conjuntoId },
  );
  await audit(ctx, "invitar", "Invitacion", inv.id, undefined, { email, rol: rol.clave, unidad: unidad?.codigo });
  return {
    id: inv.id,
    link,
    whatsapp: waShareLink(`Hola, te invito a ${ctx.conjunto.nombre} en MiConjunto. Crea tu cuenta aquí: ${link}`, input.telefono ?? undefined),
  };
}

export async function verInvitacion(token: string) {
  const inv = await prisma.invitacion.findUnique({ where: { tokenHash: sha256(token) } });
  if (!inv || inv.estado !== "PENDIENTE" || inv.expira < new Date() || inv.deletedAt) return null;
  const [conjunto, unidad, usuario, rol] = await Promise.all([
    prisma.conjunto.findUnique({ where: { id: inv.conjuntoId } }),
    inv.unidadId ? prisma.unidad.findUnique({ where: { id: inv.unidadId } }) : null,
    prisma.usuario.findUnique({ where: { email: inv.email } }),
    prisma.rol.findFirst({ where: { conjuntoId: inv.conjuntoId, clave: inv.rolClave } }),
  ]);
  return { inv, conjunto, unidad, usuarioExiste: !!usuario, rol };
}

/** Acepta una invitación: crea o vincula la cuenta, la membresía y el vínculo con la unidad. */
export async function aceptarInvitacion(
  token: string,
  input: { nombre: string; password?: string | null; telefono?: string | null; tipoDocumento?: string | null; numeroDocumento?: string | null; aceptaPolitica: boolean; politicaVersion: string },
) {
  const data = await verInvitacion(token);
  if (!data || !data.conjunto || !data.rol) throw new AppError("La invitación no es válida o ya venció.");
  if (!input.aceptaPolitica) throw new AppError("Debes aceptar la política de tratamiento de datos para continuar.", 400, { aceptaPolitica: "Obligatorio" });
  const { inv, rol } = data;
  let usuario = await prisma.usuario.findUnique({ where: { email: inv.email } });
  if (!usuario) {
    const issue = passwordIssues(input.password ?? "");
    if (issue) throw new AppError(issue, 400, { password: issue });
    usuario = await prisma.usuario.create({
      data: {
        email: inv.email,
        nombre: input.nombre,
        telefono: input.telefono ?? inv.telefono,
        passwordHash: await hashPassword(input.password!),
        politicaAceptadaEn: new Date(),
        politicaVersion: input.politicaVersion,
      },
    });
  } else {
    await prisma.usuario.update({ where: { id: usuario.id }, data: { politicaAceptadaEn: new Date(), politicaVersion: input.politicaVersion, estado: "ACTIVO" } });
  }
  const m = await prisma.membresiaConjunto.findFirst({ where: { usuarioId: usuario.id, conjuntoId: inv.conjuntoId } });
  if (!m) await prisma.membresiaConjunto.create({ data: { usuarioId: usuario.id, conjuntoId: inv.conjuntoId, rolId: rol.id } });
  else if (m.deletedAt || m.estado !== "ACTIVA") await prisma.membresiaConjunto.update({ where: { id: m.id }, data: { deletedAt: null, estado: "ACTIVA", rolId: rol.id } });

  let vinculoPendiente = false;
  if (inv.unidadId) {
    let persona = inv.personaId ? await prisma.persona.findUnique({ where: { id: inv.personaId } }) : null;
    if (!persona) persona = await prisma.persona.findFirst({ where: { conjuntoId: inv.conjuntoId, OR: [{ usuarioId: usuario.id }, { email: inv.email }], deletedAt: null } });
    if (!persona) {
      const [nombres, ...resto] = input.nombre.trim().split(" ");
      persona = await prisma.persona.create({
        data: {
          conjuntoId: inv.conjuntoId,
          usuarioId: usuario.id,
          nombres,
          apellidos: resto.join(" ") || "-",
          email: inv.email,
          telefono: input.telefono ?? inv.telefono,
          tipoDocumento: (input.tipoDocumento as never) ?? "CC",
          numeroDocumento: input.numeroDocumento || `PEND-${usuario.id.slice(-8)}`,
          consentimientoDatosEn: new Date(),
          consentimientoVersion: input.politicaVersion,
        },
      });
    } else {
      await prisma.persona.update({ where: { id: persona.id }, data: { usuarioId: usuario.id, consentimientoDatosEn: new Date(), consentimientoVersion: input.politicaVersion } });
    }
    const tipo = inv.tipoVinculo ?? "RESIDENTE";
    const invitadoPorResidente = inv.invitadoPorId
      ? !!(await prisma.membresiaConjunto.findFirst({ where: { usuarioId: inv.invitadoPorId, conjuntoId: inv.conjuntoId, rol: { basadoEnClave: { in: ["PROPIETARIO", "RESIDENTE", "CONVIVIENTE"] } } } }))
      : false;
    vinculoPendiente = (tipo === "ARRENDATARIO" || tipo === "COPROPIETARIO") && invitadoPorResidente;
    const existe = await prisma.vinculoUnidad.findFirst({ where: { personaId: persona.id, unidadId: inv.unidadId, deletedAt: null } });
    if (!existe) {
      await prisma.vinculoUnidad.create({
        data: { conjuntoId: inv.conjuntoId, personaId: persona.id, unidadId: inv.unidadId, tipo, estado: vinculoPendiente ? "PENDIENTE_APROBACION" : "ACTIVO" },
      });
    }
    if (vinculoPendiente) {
      const admins = await usuariosConPermiso(inv.conjuntoId, ["residentes.aprobar"]);
      await notify({ conjuntoId: inv.conjuntoId, usuarioIds: admins, titulo: "Arrendatario por aprobar", cuerpo: `${input.nombre} aceptó la invitación como arrendatario y espera aprobación.`, enlace: "/residentes?estado=PENDIENTE_APROBACION", canales: ["push", "email"] });
    }
  }
  await prisma.invitacion.update({ where: { id: inv.id }, data: { estado: "ACEPTADA", aceptadaEn: new Date() } });
  await audit({ userId: usuario.id, nombre: usuario.nombre, conjuntoId: inv.conjuntoId }, "aceptar_invitacion", "Invitacion", inv.id, undefined, { rol: rol.clave, vinculoPendiente });
  return { usuarioId: usuario.id, conjuntoId: inv.conjuntoId, vinculoPendiente };
}

export function puedeGestionarUsuarios(ctx: Ctx) {
  return can(ctx, "configuracion.roles") && !isResidencial(ctx);
}
