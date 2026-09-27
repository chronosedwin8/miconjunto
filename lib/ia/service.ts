import Anthropic from "@anthropic-ai/sdk";
import type { Ctx } from "@/lib/auth/context";
import { AppError } from "@/lib/errors";
import { iaDisponible } from "./disponible";
import { fechaHora } from "@/lib/format";

/**
 * Asistente con IA (opcional por conjunto). Usa la API de Anthropic con ANTHROPIC_API_KEY.
 * - Responde preguntas sobre el reglamento y el manual de convivencia cargados en Documentos.
 * - Redacta borradores de respuesta a PQRS.
 * - Resume actas de asamblea.
 * Si no hay clave o el conjunto no lo activó, el módulo se oculta.
 */
const MODEL = "claude-opus-5";

let client: Anthropic | null = null;
function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw new AppError("El asistente no está disponible en este servidor.");
  client ??= new Anthropic();
  return client;
}

type Resultado = { texto: string; tokens: number };

async function llamar(system: { cacheable: string; instrucciones: string }, pregunta: string, effort: "low" | "medium" | "high"): Promise<Resultado> {
  const params = {
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" as const },
    output_config: { effort },
    system: [
      { type: "text" as const, text: system.instrucciones },
      ...(system.cacheable ? [{ type: "text" as const, text: system.cacheable, cache_control: { type: "ephemeral" as const } }] : []),
    ],
    messages: [{ role: "user" as const, content: pregunta }],
    // Fallback del lado del servidor si el modelo declina (enrutado por categoría).
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  };
  try {
    const r = (await anthropic().beta.messages.create(params as never)) as Anthropic.Beta.BetaMessage;
    if (r.stop_reason === "refusal") return { texto: "No puedo ayudar con esa solicitud. Por favor contacta a la administración.", tokens: r.usage.output_tokens };
    const texto = r.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return { texto: texto || "No obtuve respuesta. Intenta reformular la pregunta.", tokens: r.usage.input_tokens + r.usage.output_tokens };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new AppError("El asistente está ocupado. Intenta en un minuto.");
    if (e instanceof Anthropic.AuthenticationError) throw new AppError("La clave del asistente no es válida. Contacta a soporte.");
    if (e instanceof Anthropic.APIError) throw new AppError("El asistente no respondió. Intenta de nuevo.");
    throw e;
  }
}

function exigir(ctx: Ctx) {
  if (!iaDisponible(ctx)) throw new AppError("El asistente con IA no está activo en este conjunto.", 403);
}

async function textoNormativo(ctx: Ctx) {
  const docs = await ctx.db.documento.findMany({
    where: { categoria: { in: ["REGLAMENTO", "MANUAL_CONVIVENCIA", "CIRCULAR"] }, publicado: true },
    include: { versiones: { orderBy: { version: "desc" }, take: 1 } },
  });
  const partes = docs
    .filter((d) => d.rolesVisibles.length === 0 || d.rolesVisibles.includes(ctx.rolClave) || d.rolesVisibles.includes(ctx.rolBase))
    .map((d) => ({ titulo: d.titulo, texto: d.versiones[0]?.textoExtraido ?? d.descripcion ?? "" }))
    .filter((p) => p.texto.trim().length > 0);
  return partes.map((p) => `<documento titulo="${p.titulo}">\n${p.texto}\n</documento>`).join("\n\n");
}

async function registrar(ctx: Ctx, tipo: string, pregunta: string, r: Resultado) {
  await ctx.db.consultaIA.create({ data: { conjuntoId: ctx.conjuntoId, usuarioId: ctx.userId, tipo, pregunta: pregunta.slice(0, 2000), respuesta: r.texto.slice(0, 8000), tokens: r.tokens } });
}

export async function preguntarReglamento(ctx: Ctx, pregunta: string) {
  exigir(ctx);
  const normas = await textoNormativo(ctx);
  const r = await llamar(
    {
      instrucciones: `Eres el asistente de ${ctx.conjunto.nombre}, una copropiedad en Colombia regida por la Ley 675 de 2001. Respondes preguntas de residentes y de la administración sobre el reglamento de propiedad horizontal y el manual de convivencia del conjunto, en español de Colombia, con lenguaje claro y amable, en pocos párrafos. Basa tus respuestas en los documentos del conjunto que aparecen abajo y cita el documento o artículo cuando exista. Si los documentos no cubren la pregunta, dilo con franqueza, da la orientación general que establece la Ley 675 cuando aplique y sugiere consultar con la administración. No inventes valores de multas, fechas ni artículos. No des asesoría jurídica definitiva.`,
      cacheable: normas ? `Documentos del conjunto:\n\n${normas}` : "El conjunto aún no ha cargado el texto de su reglamento ni de su manual de convivencia.",
    },
    pregunta,
    "medium",
  );
  await registrar(ctx, "PREGUNTA_REGLAMENTO", pregunta, r);
  return r.texto;
}

export async function borradorRespuestaPqrs(ctx: Ctx, ticketId: string) {
  exigir(ctx);
  const t = await ctx.db.ticket.findUnique({ where: { id: ticketId }, include: { comentarios: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } }, unidad: true, zona: true } });
  if (!t) throw new AppError("El ticket no existe.");
  const normas = await textoNormativo(ctx);
  const hilo = t.comentarios.map((c) => `- ${fechaHora(c.createdAt)} ${c.interno ? "(interno)" : ""}: ${c.contenido}`).join("\n");
  const pregunta = `Redacta un borrador de respuesta formal y empática de la administración para esta PQRS.\n\nRadicado: ${t.radicado}\nTipo: ${t.tipo}\nUnidad: ${t.unidad?.codigo ?? "—"}\nZona: ${t.zona?.nombre ?? "—"}\nTítulo: ${t.titulo}\nDescripción: ${t.descripcion}\nEstado: ${t.estado}\nHistorial:\n${hilo || "(sin comentarios)"}\n\nLa respuesta debe saludar, reconocer la solicitud, explicar las acciones o la posición de la administración (sin comprometer fechas que no conoces; usa [corchetes] para datos por completar) y cerrar cordialmente. Máximo 180 palabras.`;
  const r = await llamar({ instrucciones: `Eres asistente de redacción de la administración de ${ctx.conjunto.nombre} (Colombia). Escribes en español formal y cordial.`, cacheable: normas }, pregunta, "medium");
  await registrar(ctx, "BORRADOR_PQRS", `Ticket ${t.radicado}`, r);
  return r.texto;
}

export async function resumenActa(ctx: Ctx, asambleaId: string) {
  exigir(ctx);
  const a = await ctx.db.asamblea.findUnique({ where: { id: asambleaId }, include: { votaciones: { where: { deletedAt: null } } } });
  if (!a) throw new AppError("La asamblea no existe.");
  const orden = (a.ordenDelDia as { titulo?: string }[]).map((p, i) => `${i + 1}. ${p.titulo ?? ""}`).join("\n");
  const votos = a.votaciones.map((v) => `- ${v.pregunta}: ${JSON.stringify(v.resultado ?? {})}`).join("\n");
  const pregunta = `Resume el acta de esta asamblea para los copropietarios en máximo 8 viñetas claras (decisiones, votaciones con resultado, compromisos con responsable y fecha).\n\nAsamblea: ${a.titulo} (${a.tipo}, ${a.modalidad}) del ${fechaHora(a.fecha)}\nOrden del día:\n${orden}\nVotaciones:\n${votos || "(ninguna)"}\nCompromisos: ${JSON.stringify(a.compromisos)}\n\nTexto del acta:\n${a.actaTexto ?? "(sin texto de acta)"}`;
  const r = await llamar({ instrucciones: "Eres asistente de la administración de una copropiedad en Colombia. Escribes resúmenes fieles al acta, sin inventar datos, en español claro.", cacheable: "" }, pregunta, "low");
  await registrar(ctx, "RESUMEN_ACTA", a.titulo, r);
  return r.texto;
}

export async function historialConsultas(ctx: Ctx) {
  const rows = await ctx.db.consultaIA.findMany({ where: { usuarioId: ctx.userId }, orderBy: { createdAt: "desc" }, take: 20 });
  return rows.map((r) => ({ id: r.id, tipo: r.tipo, pregunta: r.pregunta, respuesta: r.respuesta, fecha: r.createdAt }));
}

