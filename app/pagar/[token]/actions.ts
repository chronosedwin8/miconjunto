"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { toActionError, type ActionResult } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { zs } from "@/lib/validation";
import { iniciarPagoPublico } from "@/lib/pagos/publico";
import { MEDIOS_EN_LINEA } from "@/lib/pagos/types";

const schema = z.object({
  token: z.string().min(20).max(200),
  medio: z.enum(MEDIOS_EN_LINEA).default("PSE"),
  modo: z.enum(["TOTAL", "ABONO"]).default("TOTAL"),
  valor: zs.optMoney(),
  pagadorNombre: zs.optText(120),
  pagadorEmail: zs.optEmail(),
});

/** Pago desde el link público del correo de cobro (sin sesión). */
export async function iniciarPagoPublicoAction(raw: z.input<typeof schema>): Promise<ActionResult<{ url: string }>> {
  try {
    const ip = clientIp(await headers());
    if (!rateLimit(`pago-publico:${ip}`, 10, 60_000).ok) throw new AppError("Demasiados intentos. Espera un minuto e inténtalo de nuevo.", 429);
    const input = schema.parse(raw);
    const r = await iniciarPagoPublico(input.token, {
      medio: input.medio,
      valor: input.modo === "ABONO" ? input.valor : null,
      pagadorNombre: input.pagadorNombre,
      pagadorEmail: input.pagadorEmail,
    });
    return { ok: true, data: { url: r.url } };
  } catch (e) {
    return toActionError(e);
  }
}
