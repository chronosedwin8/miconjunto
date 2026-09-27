import { Client } from "pg";
import { EventEmitter } from "node:events";
import type { RealtimeMessage } from "./index";

/**
 * Una sola conexión LISTEN por proceso que reparte los mensajes a los streams SSE abiertos.
 */
const g = globalThis as unknown as { __mcRealtime?: { emitter: EventEmitter; client?: Client; connecting?: Promise<void> } };
const state = (g.__mcRealtime ??= { emitter: new EventEmitter() });
state.emitter.setMaxListeners(10_000);

async function connect() {
  if (state.client) return;
  if (state.connecting) return state.connecting;
  state.connecting = (async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL?.replace(/\?schema=.*$/, "") });
    client.on("notification", (n) => {
      if (!n.payload) return;
      try {
        state.emitter.emit("msg", JSON.parse(n.payload) as RealtimeMessage);
      } catch {
        /* ignorar */
      }
    });
    client.on("error", () => {
      state.client = undefined;
      state.connecting = undefined;
    });
    await client.connect();
    await client.query("LISTEN mc_events");
    state.client = client;
  })();
  try {
    await state.connecting;
  } finally {
    state.connecting = undefined;
  }
}

export async function subscribeRealtime(fn: (m: RealtimeMessage) => void) {
  await connect();
  state.emitter.on("msg", fn);
  return () => state.emitter.off("msg", fn);
}
