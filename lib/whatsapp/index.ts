/**
 * Canal WhatsApp saliente (opcional). Abstrae proveedores tipo Meta Cloud API / 360dialog / Twilio.
 * Si no hay credenciales, `sendWhatsApp` no hace nada y devuelve `{ enviado: false }` sin error.
 */
export type WhatsAppResult = { enviado: boolean; motivo?: string };

export function whatsappEnabled() {
  return !!(process.env.WHATSAPP_PROVIDER && process.env.WHATSAPP_TOKEN);
}

function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 ? `57${digits}` : digits;
}

export async function sendWhatsApp(phone: string | null | undefined, text: string): Promise<WhatsAppResult> {
  if (!phone) return { enviado: false, motivo: "sin teléfono" };
  if (!whatsappEnabled()) return { enviado: false, motivo: "WhatsApp no configurado" };
  const provider = process.env.WHATSAPP_PROVIDER;
  const to = normalizePhone(phone);
  try {
    if (provider === "meta" || provider === "360dialog") {
      const url =
        provider === "meta"
          ? `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`
          : "https://waba-v2.360dialog.io/messages";
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(provider === "meta" ? { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } : { "D360-API-KEY": process.env.WHATSAPP_TOKEN! }),
        },
        body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
      });
      return { enviado: res.ok, motivo: res.ok ? undefined : `HTTP ${res.status}` };
    }
    if (provider === "twilio") {
      const [sid, token] = (process.env.WHATSAPP_TOKEN ?? "").split(":");
      const body = new URLSearchParams({ From: `whatsapp:${process.env.WHATSAPP_PHONE_ID}`, To: `whatsapp:+${to}`, Body: text });
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: { Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64") },
        body,
      });
      return { enviado: res.ok, motivo: res.ok ? undefined : `HTTP ${res.status}` };
    }
    return { enviado: false, motivo: `Proveedor ${provider} no soportado` };
  } catch (e) {
    return { enviado: false, motivo: (e as Error).message };
  }
}

/** Enlace "wa.me" para compartir desde el teléfono del usuario (no requiere credenciales). */
export function waShareLink(text: string, phone?: string) {
  const base = phone ? `https://wa.me/${normalizePhone(phone)}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(text)}`;
}
