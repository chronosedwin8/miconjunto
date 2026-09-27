import { parseConfig } from "@/lib/conjunto/config";

/** El asistente IA se muestra solo si hay ANTHROPIC_API_KEY y el conjunto lo tiene activo. */
export function iaDisponible(ctx: { conjunto: { config: unknown; modulosActivos: string[] } }) {
  if (!process.env.ANTHROPIC_API_KEY) return false;
  const cfg = parseConfig(ctx.conjunto.config);
  return cfg.ia.activo || ctx.conjunto.modulosActivos.includes("ia");
}
