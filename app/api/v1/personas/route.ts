import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { listarPersonas, registrarPersona } from "@/lib/residentes/service";
import { personaDto } from "@/lib/residentes/api";

const TIPOS_DOC = ["CC", "CE", "TI", "RC", "PA", "NIT", "PEP", "PPT"] as const;
const TIPOS_VINCULO = ["PROPIETARIO", "COPROPIETARIO", "ARRENDATARIO", "RESIDENTE", "FAMILIAR", "EMPLEADO_DOMESTICO", "CUIDADOR", "VISITANTE_FRECUENTE", "AUTORIZADO_RECOGER_PAQUETES", "AUTORIZADO_MENORES"] as const;

/**
 * GET /api/v1/personas?q=&torre=&tipo=&estado=&grupo=&unidad=&take=&skip=
 * Sin `residentes.ver_todos` solo devuelve personas de las unidades del usuario.
 */
export const GET = apiHandler(
  {
    perm: ["residentes.ver", "residentes.ver_todos"],
    schema: z.object({
      q: z.string().max(100).optional(),
      torre: z.string().optional(),
      tipo: z.enum(TIPOS_VINCULO).optional(),
      estado: z.enum(["ACTIVO", "PENDIENTE_APROBACION", "INACTIVO", "RECHAZADO"]).optional(),
      grupo: z.enum(["MENORES", "MAYORES", "MOVILIDAD", "CON_CUENTA"]).optional(),
      unidad: z.string().optional(),
      take: z.coerce.number().int().min(1).max(500).default(100),
      skip: z.coerce.number().int().min(0).default(0),
    }),
  },
  async ({ ctx, input }) => {
    const { take, skip, ...f } = input;
    const { rows, total } = await listarPersonas(ctx, f, { skip, take });
    return { total, items: rows.map((p) => personaDto(ctx, p)) };
  },
);

/** POST /api/v1/personas — registra una persona y su vínculo con una unidad. */
export const POST = apiHandler(
  {
    perm: "residentes.crear",
    schema: z.object({
      tipoDocumento: z.enum(TIPOS_DOC).default("CC"),
      numeroDocumento: z.string().trim().min(3).max(20),
      nombres: z.string().trim().min(1).max(80),
      apellidos: z.string().trim().min(1).max(80),
      fechaNacimiento: z.coerce.date().optional(),
      telefono: z.string().max(30).optional(),
      email: z.email().optional(),
      unidadId: z.string().min(1),
      tipo: z.enum(TIPOS_VINCULO),
      principal: z.boolean().optional(),
      porcentajePropiedad: z.number().min(0).max(100).optional(),
      horario: z.object({ dias: z.array(z.number().int().min(0).max(6)), desde: z.string(), hasta: z.string() }).optional(),
    }),
  },
  async ({ ctx, input }) => {
    const { unidadId, tipo, principal, porcentajePropiedad, horario, ...persona } = input;
    const r = await registrarPersona(ctx, persona, { unidadId, tipo, principal, porcentajePropiedad, horario });
    return { id: r.persona.id, vinculoId: r.vinculo.id, estado: r.vinculo.estado, reutilizada: r.reutilizada };
  },
);
