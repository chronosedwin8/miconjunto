"use client";

import { useEffect, useRef } from "react";

export type RealtimeEvent = { canal: string; tipo: string; data?: Record<string, unknown> };

/**
 * Suscripción a eventos en tiempo real vía SSE (/api/events). Si SSE falla repetidamente,
 * cae a sondeo (polling) llamando `onPoll` cada `pollMs`.
 */
export function useRealtime(canales: string[], onEvent: (e: RealtimeEvent) => void, opts?: { onPoll?: () => void; pollMs?: number }) {
  const cb = useRef(onEvent);
  cb.current = onEvent;
  const poll = useRef(opts?.onPoll);
  poll.current = opts?.onPoll;
  const key = canales.join(",");

  useEffect(() => {
    let es: EventSource | null = null;
    let failures = 0;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    const startPolling = () => {
      if (pollTimer || !poll.current) return;
      pollTimer = setInterval(() => poll.current?.(), opts?.pollMs ?? 15000);
    };

    const connect = () => {
      if (closed) return;
      es = new EventSource(`/api/events?canales=${encodeURIComponent(key)}`);
      es.onmessage = (m) => {
        failures = 0;
        try {
          cb.current(JSON.parse(m.data) as RealtimeEvent);
        } catch {
          /* ignorar */
        }
      };
      es.onerror = () => {
        es?.close();
        failures++;
        if (failures >= 3) startPolling();
        setTimeout(connect, Math.min(30000, 1000 * 2 ** failures));
      };
    };
    connect();
    return () => {
      closed = true;
      es?.close();
      if (pollTimer) clearInterval(pollTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
