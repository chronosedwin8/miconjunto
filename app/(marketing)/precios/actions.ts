"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { crearCotizacionComercial } from "@/lib/comercial/service";
import { MAX_CONJUNTOS_COTIZADOR } from "@/lib/comercial/precios";

const texto = (max: number) => z.string().trim().max(max).optional().nullable();

const schema = z.object({
  cantidad: z.number().int().min(1).max(MAX_CONJUNTOS_COTIZADOR),
  conjuntos: z
    .array(z.object({ nombre: texto(120), ciudad: texto(80), unidades: z.number().int().min(0).max(100000).optional().nullable() }))
    .max(MAX_CONJUNTOS_COTIZADOR)
    .default([]),
  nombre: z.string().trim().min(3, "Escribe tu nombre").max(120),
  cargo: texto(80),
  empresa: texto(150),
  nit: texto(30),
  email: z.string().trim().email("Correo no válido").max(160),
  telefono: z
    .string()
    .trim()
    .min(7, "Teléfono no válido")
    .max(30)
    .regex(/^[0-9+()\s-]+$/, "Teléfono no válido"),
  ciudad: texto(80),
  mensaje: texto(1500),
  aceptaPolitica: z.literal(true, { message: "Debes aceptar la política de datos" }),
  // Campo trampa para bots: los humanos no lo ven.
  sitioWeb: z.string().max(0).optional(),
});

export type ResultadoCotizacion =
  | { ok: true; numero: string; pdf: string; total: number }
  | { ok: false; error: string; campos?: Record<string, string> };

export async function solicitarCotizacionAction(input: unknown): Promise<ResultadoCotizacion> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const campos: Record<string, string> = {};
    for (const i of parsed.error.issues) campos[String(i.path[0])] ??= i.message;
    return { ok: false, error: "Revisa los campos marcados.", campos };
  }
  const h = await headers();
  const ip = clientIp(h);
  if (!rateLimit(`cotizacion:${ip}`, 5, 60 * 60 * 1000).ok) return { ok: false, error: "Recibimos varias solicitudes desde tu conexión. Intenta de nuevo en una hora." };
  try {
    const { aceptaPolitica: _a, sitioWeb: _s, ...datos } = parsed.data;
    const r = await crearCotizacionComercial(datos, { ip });
    return { ok: true, ...r };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    console.error("[cotizacion]", e);
    return { ok: false, error: "No pudimos registrar la cotización. Intenta de nuevo en unos minutos." };
  }
}
