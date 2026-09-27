import { getCtx } from "@/lib/auth/context";
import { subscribeRealtime } from "@/lib/events/realtime";
import { can } from "@/lib/permisos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Server-Sent Events: portería, tickets, notificaciones, asambleas y votaciones en vivo. */
export async function GET(req: Request) {
  const ctx = await getCtx();
  if (!ctx) return new Response("No autenticado", { status: 401 });
  const url = new URL(req.url);
  const pedidos = (url.searchParams.get("canales") ?? "").split(",").filter(Boolean);

  const permitido = (canal: string) => {
    if (canal === `user:${ctx.userId}`) return true;
    if (canal === "conjunto") return true;
    if (canal === "porteria") return can(ctx, ["porteria.ver", "paqueteria.ver_todos"]);
    if (canal === "tickets") return can(ctx, "tickets.ver_todos");
    if (canal.startsWith("asamblea:") || canal.startsWith("votacion:") || canal.startsWith("encuesta:")) return true;
    if (canal.startsWith("unidad:")) return ctx.unidadIds.includes(canal.slice(7)) || can(ctx, "residentes.ver_todos");
    return false;
  };
  const canales = new Set([`user:${ctx.userId}`, ...pedidos.filter(permitido)]);

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let ping: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          /* cerrado */
        }
      };
      send(`retry: 5000\n\n`);
      send(`data: ${JSON.stringify({ canal: "sistema", tipo: "conectado" })}\n\n`);
      unsubscribe = await subscribeRealtime((m) => {
        if (m.conjuntoId !== ctx.conjuntoId || !canales.has(m.canal)) return;
        send(`data: ${JSON.stringify({ canal: m.canal, tipo: m.tipo, data: m.data })}\n\n`);
      });
      ping = setInterval(() => send(`: ping\n\n`), 25000);
      req.signal.addEventListener("abort", () => {
        unsubscribe?.();
        if (ping) clearInterval(ping);
        try {
          controller.close();
        } catch {
          /* ya cerrado */
        }
      });
    },
    cancel() {
      unsubscribe?.();
      if (ping) clearInterval(ping);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
