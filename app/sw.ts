/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, NetworkFirst, ExpirationPlugin } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // La pantalla de portería debe abrir aunque no haya internet.
      matcher: ({ url, request }) => request.mode === "navigate" && url.pathname.startsWith("/porteria"),
      handler: new NetworkFirst({
        cacheName: "porteria-pages",
        networkTimeoutSeconds: 4,
        plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 7 * 24 * 3600 })],
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [{ url: "/offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();

// ── Notificaciones push ──
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload: { title: string; body: string; url?: string; data?: Record<string, unknown>; actions?: { action: string; title: string }[] };
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "MiConjunto", body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url ?? "/inicio", ...payload.data },
      // @ts-expect-error actions es soportado por los navegadores con push
      actions: payload.actions ?? [],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = (event.notification.data ?? {}) as { url?: string; solicitudId?: string };
  // Respuesta rápida desde la notificación: Autorizar / Rechazar visitante
  if ((event.action === "autorizar" || event.action === "rechazar") && data.solicitudId) {
    event.waitUntil(
      fetch(`/api/porteria/solicitudes/${data.solicitudId}/responder`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: event.action === "autorizar" ? "AUTORIZADA" : "RECHAZADA" }),
      }).then(() => undefined),
    );
    return;
  }
  const url = data.url ?? "/inicio";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          (c as WindowClient).navigate(url);
          return (c as WindowClient).focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
