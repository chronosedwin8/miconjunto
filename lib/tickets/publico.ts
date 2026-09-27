import { z } from "zod";
import { prisma } from "@/lib/db";
import { systemCtx } from "@/lib/auth/system-ctx";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { queueBrandedEmail } from "@/lib/email";
import { fecha } from "@/lib/format";
import { label } from "@/lib/labels";
import { zs } from "@/lib/validation";
import { crearTicket } from "./service";
import { TIPOS_PUBLICOS } from "./reglas";

/**
 * PQRS de no residentes desde la página pública del conjunto (/c/<slug>).
 * Sin sesión: valida con zod, limita la tasa por IP y por correo, y descarta envíos de robots
 * (campo trampa "sitio_web" o envío en menos de 3 segundos).
 */
export const pqrsPublicaSchema = z.object({
  slug: zs.text(1, 80),
  nombre: zs.text(3, 120),
  correo: zs.email(),
  telefono: zs.optText(30),
  tipo: z.enum(TIPOS_PUBLICOS, { error: "Selecciona el tipo de solicitud" }),
  descripcion: zs.text(15, 4000),
  /** Campo trampa: las personas no lo ven; los robots lo llenan. */
  sitio_web: zs.optText(200),
  /** Momento en que se mostró el formulario (ms). */
  ts: zs.optNumber(),
  acepta: zs.bool().refine((v) => v, "Debes autorizar el tratamiento de tus datos para radicar la solicitud"),
});

export type PqrsPublicaInput = z.input<typeof pqrsPublicaSchema>;
export type PqrsPublicaResult = { radicado: string | null; fechaLimite: string | null };

export async function radicarPqrsPublica(raw: unknown, ip: string, ahora = Date.now()): Promise<PqrsPublicaResult> {
  const input = pqrsPublicaSchema.parse(raw);
  // Robots: respuesta "exitosa" sin crear nada para no darles pistas.
  if (input.sitio_web || (input.ts && ahora - input.ts < 3000)) return { radicado: null, fechaLimite: null };
  if (!rateLimit(`pqrs-publica:ip:${ip}`, 5, 60 * 60_000).ok) throw new AppError("Has enviado varias solicitudes seguidas. Intenta de nuevo en una hora.", 429);
  if (!rateLimit(`pqrs-publica:correo:${input.correo}`, 3, 24 * 60 * 60_000).ok) throw new AppError("Ya recibimos varias solicitudes de este correo hoy. Te responderemos pronto.", 429);

  const conjunto = await prisma.conjunto.findFirst({ where: { slug: input.slug, paginaPublica: true, deletedAt: null, estado: "ACTIVO" }, select: { id: true } });
  if (!conjunto) throw new AppError("Este conjunto no recibe solicitudes en línea.", 404);
  const ctx = await systemCtx(conjunto.id, { nombre: "Página pública" });
  const t = await crearTicket(
    ctx,
    {
      tipo: input.tipo,
      descripcion: input.descripcion,
      solicitanteNombre: input.nombre,
      solicitanteEmail: input.correo,
      solicitanteTelefono: input.telefono ?? null,
    },
    { origen: "PUBLICO" },
  );
  await queueBrandedEmail(
    input.correo,
    `Radicamos tu solicitud ${t.radicado}`,
    {
      conjuntoNombre: ctx.conjunto.nombre,
      color: ctx.conjunto.colorPrimario ?? undefined,
      parrafos: [
        `Hola ${input.nombre}:`,
        `Recibimos tu ${label(input.tipo).toLowerCase()} dirigida a la administración de ${ctx.conjunto.nombre}.`,
        `Número de radicado: ${t.radicado}. Te responderemos a este correo a más tardar el ${fecha(t.fechaLimite)} (15 días hábiles).`,
        "Conserva este número para cualquier consulta.",
      ],
    },
    { conjuntoId: conjunto.id },
  );
  return { radicado: t.radicado, fechaLimite: t.fechaLimite.toISOString() };
}
