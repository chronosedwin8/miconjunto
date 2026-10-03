import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "@/lib/db";
import { decryptJson } from "@/lib/crypto";
import { readFileByUrl } from "@/lib/storage";
import { renderBaseEmail, type BaseEmailProps } from "@/emails/BaseEmail";

export type EmailAttachment = { filename: string; url?: string; contentBase64?: string; contentType?: string };

export function appUrl(path = "") {
  return `${process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000"}${path}`;
}

/** Reemplaza {{variable}} en plantillas. */
export function renderTemplate(tpl: string, vars: Record<string, string | number | null | undefined>) {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => {
    const v = vars[k];
    return v === null || v === undefined ? "" : String(v);
  });
}

type SmtpConfig = { host: string; port: number; user?: string; pass?: string; from: string; secure?: boolean };

async function smtpFor(conjuntoId: string | null): Promise<SmtpConfig | null> {
  if (conjuntoId) {
    const cfg = await prisma.configuracionIntegracion.findFirst({ where: { conjuntoId, tipo: "SMTP", activo: true, deletedAt: null } });
    if (cfg) {
      const d = decryptJson<Record<string, string>>(cfg.datosCifrados);
      if (d.host) return { host: d.host, port: Number(d.port || 587), user: d.user, pass: d.pass, from: d.from || process.env.SMTP_FROM || "" };
    }
  }
  if (process.env.SMTP_HOST) {
    return {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.SMTP_FROM || "Conjunto360 <no-reply@miconjunto.co>",
    };
  }
  return null;
}

const transports = new Map<string, Transporter>();
function transportFor(cfg: SmtpConfig) {
  const k = `${cfg.host}:${cfg.port}:${cfg.user}`;
  let t = transports.get(k);
  if (!t) {
    t = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure ?? cfg.port === 465,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    });
    transports.set(k, t);
  }
  return t;
}

export async function queueEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  conjuntoId?: string | null;
  campanaId?: string | null;
  attachments?: EmailAttachment[];
  tracking?: boolean;
}) {
  const row = await prisma.correoSaliente.create({
    data: {
      conjuntoId: opts.conjuntoId ?? null,
      campanaId: opts.campanaId ?? null,
      para: opts.to,
      asunto: opts.subject,
      html: opts.html,
      texto: opts.text,
      adjuntos: (opts.attachments ?? []) as object[],
    },
  });
  if (opts.tracking) {
    const pixel = `<img src="${appUrl(`/api/track/open/${row.trackingId}`)}" width="1" height="1" alt="" style="display:none" />`;
    const html = opts.html.replace(/href="(https?:\/\/[^"]+)"/g, (_m, url) => `href="${appUrl(`/api/track/click/${row.trackingId}?u=${encodeURIComponent(url)}`)}"`);
    await prisma.correoSaliente.update({ where: { id: row.id }, data: { html: html + pixel } });
  }
  return row;
}

/** Correo con el diseño base de MiConjunto. */
export async function queueBrandedEmail(
  to: string,
  subject: string,
  props: Omit<BaseEmailProps, "titulo"> & { titulo?: string },
  extra?: { conjuntoId?: string | null; campanaId?: string | null; attachments?: EmailAttachment[]; sendNow?: boolean; tracking?: boolean },
) {
  const html = await renderBaseEmail({ titulo: props.titulo ?? subject, ...props });
  const row = await queueEmail({ to, subject, html, conjuntoId: extra?.conjuntoId, campanaId: extra?.campanaId, attachments: extra?.attachments, tracking: extra?.tracking });
  if (extra?.sendNow) await sendOne(row.id);
  return row;
}

async function buildAttachments(list: EmailAttachment[]) {
  const out: { filename: string; content: Buffer; contentType?: string }[] = [];
  for (const a of list) {
    if (a.contentBase64) out.push({ filename: a.filename, content: Buffer.from(a.contentBase64, "base64"), contentType: a.contentType });
    else if (a.url) {
      const buf = await readFileByUrl(a.url);
      if (buf) out.push({ filename: a.filename, content: buf, contentType: a.contentType });
    }
  }
  return out;
}

export async function sendOne(id: string) {
  const c = await prisma.correoSaliente.findUnique({ where: { id } });
  if (!c || c.estado !== "PENDIENTE") return;
  const cfg = await smtpFor(c.conjuntoId);
  try {
    if (cfg) {
      await transportFor(cfg).sendMail({
        from: cfg.from,
        to: c.para,
        subject: c.asunto,
        html: c.html,
        text: c.texto ?? undefined,
        attachments: await buildAttachments((c.adjuntos as EmailAttachment[]) ?? []),
      });
    }
    // Sin SMTP configurado: queda en el buzón de desarrollo (/dev/correos) como ENVIADO.
    await prisma.correoSaliente.update({
      where: { id },
      data: { estado: "ENVIADO", enviadoEn: new Date(), intentos: { increment: 1 }, error: cfg ? null : "SMTP no configurado: guardado en buzón de desarrollo" },
    });
    if (c.campanaId) await prisma.campanaCorreo.update({ where: { id: c.campanaId }, data: { enviados: { increment: 1 } } });
  } catch (e) {
    const intentos = c.intentos + 1;
    await prisma.correoSaliente.update({
      where: { id },
      data: { intentos, error: (e as Error).message.slice(0, 500), estado: intentos >= 5 ? "ERROR" : "PENDIENTE" },
    });
    if (intentos >= 5 && c.campanaId) await prisma.campanaCorreo.update({ where: { id: c.campanaId }, data: { rebotes: { increment: 1 } } });
  }
}

/** Procesa la cola respetando un límite por minuto (lo invoca el worker). */
export async function processEmailQueue(limitPerRun = 60) {
  const pending = await prisma.correoSaliente.findMany({
    where: { estado: "PENDIENTE", deletedAt: null },
    orderBy: { createdAt: "asc" },
    take: limitPerRun,
    select: { id: true },
  });
  for (const p of pending) await sendOne(p.id);
  return pending.length;
}
