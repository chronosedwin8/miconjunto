import { prisma } from "@/lib/db";

/**
 * Bus de eventos de dominio. Cada módulo emite (`emit`) y los suscriptores (webhooks salientes,
 * tiempo real, estadísticas) reaccionan. Esto mantiene "todo conectado" sin acoplar módulos.
 */
export type DomainEvent = {
  tipo: string;
  conjuntoId: string;
  data: Record<string, unknown>;
  actorId?: string | null;
};

type Handler = (evt: DomainEvent) => Promise<void> | void;

const g = globalThis as unknown as { __mcHandlers?: Map<string, Handler[]>; __mcSubsLoaded?: boolean };
const handlers: Map<string, Handler[]> = (g.__mcHandlers ??= new Map<string, Handler[]>());

export function on(tipo: string, handler: Handler) {
  const list = handlers.get(tipo) ?? [];
  list.push(handler);
  handlers.set(tipo, list);
}

async function ensureSubscribers() {
  if (g.__mcSubsLoaded) return;
  g.__mcSubsLoaded = true;
  await import("./subscribers");
}

export async function emit(evt: DomainEvent) {
  await ensureSubscribers();
  const list = [...(handlers.get(evt.tipo) ?? []), ...(handlers.get("*") ?? [])];
  for (const h of list) {
    try {
      await h(evt);
    } catch (e) {
      console.error(`[eventos] suscriptor falló para ${evt.tipo}:`, (e as Error).message);
    }
  }
}

/** Canales de tiempo real: "conjunto", "porteria", "user:<id>", "tickets", "asamblea:<id>", "votacion:<id>". */
export type RealtimeMessage = {
  conjuntoId: string;
  canal: string;
  tipo: string;
  data?: Record<string, unknown>;
};

/** Publica a los clientes SSE de cualquier proceso (Postgres LISTEN/NOTIFY). */
export async function publishRealtime(msg: RealtimeMessage) {
  try {
    const payload = JSON.stringify(msg);
    if (payload.length > 7500) {
      msg = { ...msg, data: { truncado: true } };
    }
    await prisma.$executeRaw`SELECT pg_notify('mc_events', ${JSON.stringify(msg)})`;
  } catch (e) {
    console.error("[tiempo-real] no se pudo publicar", (e as Error).message);
  }
}
