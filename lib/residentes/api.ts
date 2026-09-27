import type { Persona, VinculoUnidad } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { can } from "@/lib/permisos";
import { edad } from "@/lib/format";

/** Representación pública de una persona para la API REST, respetando los campos visibles del rol. */
export function personaDto(ctx: Ctx, p: Persona & { vinculos?: (VinculoUnidad & { unidad?: { codigo: string } | null })[] }) {
  const propio = p.usuarioId === ctx.userId;
  const verTel = propio || can(ctx, "campos.persona_telefono") || !can(ctx, "residentes.ver_todos");
  const verDoc = propio || can(ctx, "campos.persona_documento") || !can(ctx, "residentes.ver_todos");
  const verSalud = propio || can(ctx, "campos.persona_salud");
  return {
    id: p.id,
    nombres: p.nombres,
    apellidos: p.apellidos,
    tipoDocumento: p.tipoDocumento,
    numeroDocumento: verDoc ? p.numeroDocumento : null,
    fechaNacimiento: p.fechaNacimiento,
    edad: edad(p.fechaNacimiento),
    genero: p.genero,
    fotoUrl: p.fotoUrl,
    telefono: verTel ? p.telefono : null,
    email: verTel ? p.email : null,
    tieneCuenta: !!p.usuarioId,
    anonimizada: p.anonimizada,
    ...(verSalud
      ? {
          movilidadReducida: p.movilidadReducida,
          movilidadDescripcion: p.movilidadDescripcion,
          requiereAsistenciaEvacuacion: p.requiereAsistenciaEvacuacion,
          tipoSangre: p.tipoSangre,
          eps: p.eps,
          contactoEmergenciaNombre: p.contactoEmergenciaNombre,
          contactoEmergenciaTelefono: p.contactoEmergenciaTelefono,
        }
      : {}),
    vinculos: (p.vinculos ?? []).map((v) => ({
      id: v.id,
      unidadId: v.unidadId,
      unidad: v.unidad?.codigo ?? null,
      tipo: v.tipo,
      estado: v.estado,
      principal: v.principal,
      porcentajePropiedad: v.porcentajePropiedad,
      horarioPermitido: v.horarioPermitido,
      fechaInicio: v.fechaInicio,
      fechaFin: v.fechaFin,
    })),
  };
}
