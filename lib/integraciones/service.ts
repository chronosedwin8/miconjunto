import type { TipoIntegracion } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { audit } from "@/lib/audit";

/** Campos de cada integración. Los marcados `secreto` se muestran enmascarados en la UI. */
export const CAMPOS_INTEGRACION: Record<TipoIntegracion, { key: string; label: string; secreto?: boolean; placeholder?: string }[]> = {
  WOMPI: [
    { key: "publicKey", label: "Llave pública", placeholder: "pub_test_…" },
    { key: "privateKey", label: "Llave privada", secreto: true },
    { key: "eventsSecret", label: "Secreto de eventos", secreto: true },
    { key: "integritySecret", label: "Secreto de integridad", secreto: true },
    { key: "env", label: "Ambiente (sandbox | production)", placeholder: "sandbox" },
  ],
  MERCADOPAGO: [
    { key: "accessToken", label: "Access token", secreto: true },
    { key: "publicKey", label: "Public key" },
    { key: "webhookSecret", label: "Secreto de webhook", secreto: true },
  ],
  FACTUS: [
    { key: "baseUrl", label: "URL base", placeholder: "https://api-sandbox.factus.com.co" },
    { key: "clientId", label: "Client ID" },
    { key: "clientSecret", label: "Client secret", secreto: true },
    { key: "username", label: "Usuario (correo)" },
    { key: "password", label: "Contraseña", secreto: true },
    { key: "numberingRangeId", label: "ID rango de numeración" },
  ],
  ALANUBE: [
    { key: "baseUrl", label: "URL base", placeholder: "https://sandbox.alanube.co/col/v1" },
    { key: "token", label: "Token", secreto: true },
  ],
  SMTP: [
    { key: "host", label: "Servidor SMTP", placeholder: "smtp.gmail.com" },
    { key: "port", label: "Puerto", placeholder: "587" },
    { key: "user", label: "Usuario" },
    { key: "pass", label: "Contraseña", secreto: true },
    { key: "from", label: "Remitente", placeholder: "Administración <admin@conjunto.co>" },
  ],
  WHATSAPP: [
    { key: "provider", label: "Proveedor (meta | 360dialog | twilio)" },
    { key: "token", label: "Token", secreto: true },
    { key: "phoneId", label: "ID de teléfono / número" },
  ],
};

const ENV_FALLBACK: Partial<Record<TipoIntegracion, () => Record<string, string | undefined>>> = {
  WOMPI: () => ({
    publicKey: process.env.WOMPI_PUBLIC_KEY,
    privateKey: process.env.WOMPI_PRIVATE_KEY,
    eventsSecret: process.env.WOMPI_EVENTS_SECRET,
    integritySecret: process.env.WOMPI_INTEGRITY_SECRET,
    env: process.env.WOMPI_ENV,
  }),
  MERCADOPAGO: () => ({ accessToken: process.env.MP_ACCESS_TOKEN, publicKey: process.env.MP_PUBLIC_KEY, webhookSecret: process.env.MP_WEBHOOK_SECRET }),
  FACTUS: () => ({
    baseUrl: process.env.FACTUS_BASE_URL,
    clientId: process.env.FACTUS_CLIENT_ID,
    clientSecret: process.env.FACTUS_CLIENT_SECRET,
    username: process.env.FACTUS_USERNAME,
    password: process.env.FACTUS_PASSWORD,
  }),
  ALANUBE: () => ({ baseUrl: process.env.ALANUBE_BASE_URL, token: process.env.ALANUBE_TOKEN }),
};

/**
 * Credenciales de una integración: las del conjunto (cifradas en BD) tienen prioridad sobre las globales (.env).
 * Devuelve null si no hay nada configurado.
 */
export async function credenciales(conjuntoId: string | null, tipo: TipoIntegracion): Promise<Record<string, string> | null> {
  if (conjuntoId) {
    const row = await prisma.configuracionIntegracion.findFirst({ where: { conjuntoId, tipo, activo: true, deletedAt: null } });
    if (row) {
      const d = decryptJson<Record<string, string>>(row.datosCifrados);
      if (Object.values(d).some(Boolean)) return d;
    }
  }
  const env = ENV_FALLBACK[tipo]?.();
  if (env && Object.values(env).some(Boolean)) return Object.fromEntries(Object.entries(env).filter(([, v]) => v)) as Record<string, string>;
  return null;
}

export async function estadoIntegraciones(ctx: Ctx) {
  const rows = await prisma.configuracionIntegracion.findMany({ where: { conjuntoId: ctx.conjuntoId, deletedAt: null } });
  return (Object.keys(CAMPOS_INTEGRACION) as TipoIntegracion[]).map((tipo) => {
    const row = rows.find((r) => r.tipo === tipo);
    let valores: Record<string, string> = {};
    if (row) {
      const d = decryptJson<Record<string, string>>(row.datosCifrados);
      valores = Object.fromEntries(
        CAMPOS_INTEGRACION[tipo].map((c) => [c.key, c.secreto && d[c.key] ? `••••${d[c.key].slice(-4)}` : (d[c.key] ?? "")]),
      );
    }
    const global = ENV_FALLBACK[tipo]?.();
    return { tipo, configurada: !!row, activa: row?.activo ?? false, valores, usaGlobal: !row && !!global && Object.values(global).some(Boolean), ultimaPrueba: row?.ultimaPrueba, ultimoResultado: row?.ultimoResultado };
  });
}

/** Guarda credenciales cifradas (AES-256-GCM). Los campos secretos vacíos o enmascarados conservan el valor anterior. */
export async function guardarIntegracion(ctx: Ctx, tipo: TipoIntegracion, datos: Record<string, string>, activo: boolean) {
  const prev = await prisma.configuracionIntegracion.findFirst({ where: { conjuntoId: ctx.conjuntoId, tipo } });
  const anterior = prev ? decryptJson<Record<string, string>>(prev.datosCifrados) : {};
  const final: Record<string, string> = {};
  for (const c of CAMPOS_INTEGRACION[tipo]) {
    const v = (datos[c.key] ?? "").trim();
    final[c.key] = c.secreto && (!v || v.startsWith("••••")) ? (anterior[c.key] ?? "") : v;
  }
  const datosCifrados = encryptJson(final);
  if (prev) await prisma.configuracionIntegracion.update({ where: { id: prev.id }, data: { datosCifrados, activo, deletedAt: null } });
  else await prisma.configuracionIntegracion.create({ data: { conjuntoId: ctx.conjuntoId, tipo, datosCifrados, activo } });
  await audit(ctx, "configurar_integracion", "ConfiguracionIntegracion", tipo, undefined, { tipo, activo, campos: Object.keys(final).filter((k) => final[k]) });
}
