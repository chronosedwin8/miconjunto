"use client";

import { createStore, del, entries, set } from "idb-keyval";

/**
 * Cola offline de portería (IndexedDB con idb-keyval). Solo para componentes cliente.
 * Cada operación lleva un `clienteId` (UUID) para que la sincronización sea idempotente.
 */

export type TipoOperacion = "INGRESO_MANUAL" | "INGRESO_CODIGO" | "INGRESO_FRECUENTE" | "SALIDA" | "PAQUETE" | "NOVEDAD";
export type OperacionPendiente = { clienteId: string; tipo: TipoOperacion; payload: Record<string, unknown>; creadoEn: string; descripcion: string; intentos?: number };
export type ResultadoSync = { enviadas: number; ok: number; fallidas: { descripcion: string; error: string }[] };

export const EVENTO_COLA = "porteria-cola";

let store: ReturnType<typeof createStore> | null = null;
function db() {
  if (!store) store = createStore("miconjunto-porteria", "cola");
  return store;
}

export function nuevoClienteId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function avisar() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENTO_COLA));
}

export async function encolar(op: Omit<OperacionPendiente, "creadoEn"> & { creadoEn?: string }) {
  const item: OperacionPendiente = { ...op, creadoEn: op.creadoEn ?? new Date().toISOString(), intentos: 0 };
  await set(item.clienteId, item, db());
  avisar();
  return item;
}

export async function pendientes(): Promise<OperacionPendiente[]> {
  try {
    const all = await entries<string, OperacionPendiente>(db());
    return all.map(([, v]) => v).sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
  } catch {
    return [];
  }
}

let enCurso: Promise<ResultadoSync> | null = null;

/** Envía la cola a /api/porteria/sync. Quita las operaciones confirmadas y las rechazadas de forma definitiva. */
export function sincronizar(): Promise<ResultadoSync> {
  if (enCurso) return enCurso;
  enCurso = (async () => {
    const cola = await pendientes();
    const res: ResultadoSync = { enviadas: cola.length, ok: 0, fallidas: [] };
    if (!cola.length || (typeof navigator !== "undefined" && !navigator.onLine)) return res;
    try {
      const r = await fetch("/api/porteria/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ operaciones: cola.map(({ clienteId, tipo, payload, creadoEn }) => ({ clienteId, tipo, payload, creadoEn })) }),
      });
      if (!r.ok) return res;
      const j = (await r.json()) as { resultados: { clienteId: string; ok: boolean; error?: string; definitivo?: boolean }[] };
      for (const x of j.resultados) {
        const op = cola.find((c) => c.clienteId === x.clienteId);
        if (x.ok) {
          res.ok++;
          await del(x.clienteId, db());
        } else if (x.definitivo) {
          res.fallidas.push({ descripcion: op?.descripcion ?? "Operación", error: x.error ?? "Error" });
          await del(x.clienteId, db());
        } else if (op) {
          await set(op.clienteId, { ...op, intentos: (op.intentos ?? 0) + 1 }, db());
        }
      }
    } catch {
      /* sigue sin conexión: se reintenta luego */
    } finally {
      avisar();
    }
    return res;
  })().finally(() => {
    enCurso = null;
  });
  return enCurso;
}

export type ResultadoAccion<T> = { ok: true; data: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Ejecuta una acción de portería; si no hay conexión (o la red falla), la guarda en la cola offline.
 * Devuelve `offline: true` cuando quedó pendiente.
 */
export async function conRespaldoOffline<T>(
  op: { tipo: TipoOperacion; payload: Record<string, unknown>; descripcion: string },
  online: (payloadConId: Record<string, unknown>) => Promise<ResultadoAccion<T>>,
): Promise<{ offline: true } | (ResultadoAccion<T> & { offline?: false })> {
  const clienteId = nuevoClienteId();
  const payload = { ...op.payload, clienteId };
  const guardar = async () => {
    const { clienteId: _omit, ...resto } = payload;
    void _omit;
    await encolar({ clienteId, tipo: op.tipo, payload: resto, descripcion: op.descripcion });
    return { offline: true as const };
  };
  if (typeof navigator !== "undefined" && !navigator.onLine) return guardar();
  try {
    return await online(payload);
  } catch {
    return guardar();
  }
}
