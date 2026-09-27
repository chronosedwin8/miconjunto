import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { on, publishRealtime } from "./index";

/** Eventos que se pueden enviar como webhooks salientes (Configuración → API). */
export const EVENTOS_WEBHOOK = [
  "pago.aprobado",
  "ticket.creado",
  "ticket.actualizado",
  "visitante.ingreso",
  "visitante.salida",
  "paquete.recibido",
  "paquete.entregado",
  "reserva.creada",
  "reserva.aprobada",
  "factura.validada",
  "emergencia.activada",
] as const;

async function deliver(entregaId: string) {
  const e = await prisma.entregaWebhook.findUnique({ where: { id: entregaId }, include: { webhook: true } });
  if (!e) return;
  const body = JSON.stringify({ evento: e.evento, conjuntoId: e.conjuntoId, fecha: new Date().toISOString(), data: e.payload });
  let secret = "";
  try {
    secret = decrypt(e.webhook.secreto);
  } catch {
    secret = e.webhook.secreto;
  }
  const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");
  try {
    const res = await fetch(e.webhook.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-MiConjunto-Event": e.evento, "X-MiConjunto-Signature": signature },
      body,
      signal: AbortSignal.timeout(8000),
    });
    await prisma.entregaWebhook.update({
      where: { id: e.id },
      data: { estado: res.ok ? "ENTREGADO" : "ERROR", intentos: { increment: 1 }, respuesta: `HTTP ${res.status}` },
    });
  } catch (err) {
    await prisma.entregaWebhook.update({
      where: { id: e.id },
      data: { estado: "ERROR", intentos: { increment: 1 }, respuesta: (err as Error).message.slice(0, 300) },
    });
  }
}

// Webhooks salientes: cualquier evento suscrito por el conjunto.
on("*", async (evt) => {
  const hooks = await prisma.webhookSaliente.findMany({
    where: { conjuntoId: evt.conjuntoId, activo: true, deletedAt: null, eventos: { has: evt.tipo } },
  });
  for (const h of hooks) {
    const entrega = await prisma.entregaWebhook.create({
      data: { conjuntoId: evt.conjuntoId, webhookId: h.id, evento: evt.tipo, payload: evt.data as object },
    });
    void deliver(entrega.id);
  }
});

// Tiempo real: eventos de portería y tickets se reflejan en pantallas abiertas.
on("*", async (evt) => {
  const canal = evt.tipo.startsWith("visitante.") || evt.tipo.startsWith("paquete.") || evt.tipo.startsWith("porteria.") || evt.tipo.startsWith("emergencia.")
    ? "porteria"
    : evt.tipo.startsWith("ticket.")
      ? "tickets"
      : "conjunto";
  await publishRealtime({ conjuntoId: evt.conjuntoId, canal, tipo: evt.tipo, data: { id: evt.data.id ?? null } });
});

export { deliver as deliverWebhook };
import "@/lib/cartera/eventos";
import "@/lib/reservas/eventos";
