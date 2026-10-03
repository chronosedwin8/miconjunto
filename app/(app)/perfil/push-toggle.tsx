"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

function base64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type Estado = "cargando" | "no-soportado" | "bloqueado" | "activo" | "inactivo";

/** Activa o desactiva las notificaciones push en este dispositivo (Web Push con VAPID). */
export function PushToggle({ vapidKey }: { vapidKey: string | undefined }) {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !vapidKey) return setEstado("no-soportado");
      if (Notification.permission === "denied") return setEstado("bloqueado");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setEstado(sub ? "activo" : "inactivo");
    })().catch(() => setEstado("no-soportado"));
  }, [vapidKey]);

  const activar = async () => {
    setBusy(true);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado(permiso === "denied" ? "bloqueado" : "inactivo");
        toast.error("No diste permiso para mostrar notificaciones.");
        return;
      }
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToUint8Array(vapidKey!) });
      const r = await fetch("/api/push/suscribir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!r.ok) throw new Error();
      setEstado("activo");
      toast.success("Listo: recibirás notificaciones en este dispositivo.");
    } catch {
      toast.error("No se pudieron activar las notificaciones en este navegador.");
    } finally {
      setBusy(false);
    }
  };

  const desactivar = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/suscribir", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setEstado("inactivo");
      toast.success("Notificaciones desactivadas en este dispositivo.");
    } finally {
      setBusy(false);
    }
  };

  if (estado === "cargando") return <p className="text-sm text-muted-foreground">Revisando este dispositivo…</p>;
  if (estado === "no-soportado")
    return <p className="text-sm text-muted-foreground">Este navegador no permite notificaciones push. En iPhone, agrega Conjunto360 a la pantalla de inicio y ábrelo desde ahí.</p>;
  if (estado === "bloqueado") return <p className="text-sm text-muted-foreground">Bloqueaste las notificaciones para este sitio. Actívalas en la configuración del navegador.</p>;
  return estado === "activo" ? (
    <Button variant="outline" onClick={desactivar} disabled={busy}>
      {busy ? <Loader2 className="animate-spin" /> : <BellOff />} Desactivar en este dispositivo
    </Button>
  ) : (
    <Button onClick={activar} disabled={busy}>
      {busy ? <Loader2 className="animate-spin" /> : <BellRing />} Activar en este dispositivo
    </Button>
  );
}
